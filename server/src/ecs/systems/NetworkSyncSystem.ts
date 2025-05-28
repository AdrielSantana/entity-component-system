import { System } from "../System.js";
import { Entity } from "../Entity.js";
import {
  NetworkComponent,
  AuthorityType,
} from "../components/NetworkComponent.js";
import { TransformComponent } from "../components/TransformComponent.js";
import { PhysicsComponent } from "../components/PhysicsComponent.js";

export interface NetworkState {
  networkId: string;
  timestamp: number;
  transform: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    scale: { x: number; y: number; z: number };
  };
  physics?: {
    velocity: { x: number; y: number; z: number };
    acceleration: { x: number; y: number; z: number };
  };
}

interface StateBuffer {
  states: NetworkState[];
  lastProcessedTime: number;
}

export class NetworkSyncSystem extends System {
  private static readonly BUFFER_SIZE = 32; // Size of interpolation buffer
  private static readonly INTERPOLATION_DELAY = 100; // Interpolation delay in ms
  private static readonly SNAPSHOT_RATE = 50; // Send rate in ms

  private stateBuffers: Map<string, StateBuffer> = new Map();
  private lastSnapshotTime: number = 0;
  private inputSequenceNumber: number = 0;
  private pendingInputs: Map<number, any> = new Map();

  public override shouldProcessEntity(entity: Entity): boolean {
    return (
      entity.hasComponent("NetworkComponent") &&
      entity.hasComponent("TransformComponent")
    );
  }

  public update(deltaTime: number): void {
    const currentTime = Date.now();

    // Process network updates
    for (const entity of this.entities) {
      const networkComponent =
        entity.getComponent<NetworkComponent>("NetworkComponent");
      if (!networkComponent) {
        console.log("Entity missing NetworkComponent:", entity.getId());
        continue;
      }

      if (networkComponent.authorityType === AuthorityType.SERVER) {
        // Server: Send state updates
        if (
          currentTime - this.lastSnapshotTime >=
          NetworkSyncSystem.SNAPSHOT_RATE
        ) {
          const snapshot = this.createSnapshot(entity, currentTime);
          if (snapshot) {
            // Store snapshot in buffer
            let buffer = this.stateBuffers.get(networkComponent.networkId);
            if (!buffer) {
              buffer = { states: [], lastProcessedTime: 0 };
              this.stateBuffers.set(networkComponent.networkId, buffer);
            }
            buffer.states.push(snapshot);

            // Maintain buffer size
            while (buffer.states.length > NetworkSyncSystem.BUFFER_SIZE) {
              buffer.states.shift();
            }
          } else {
            console.log(
              "Failed to create snapshot for entity:",
              networkComponent.networkId
            );
          }
          this.lastSnapshotTime = currentTime;
        }
      } else {
        // Client: Interpolate state
        this.interpolateState(entity, currentTime);
      }
    }
  }

  private createSnapshot(
    entity: Entity,
    timestamp: number
  ): NetworkState | null {
    const transform =
      entity.getComponent<TransformComponent>("TransformComponent");
    const physics = entity.getComponent<PhysicsComponent>("PhysicsComponent");
    const network = entity.getComponent<NetworkComponent>("NetworkComponent");

    if (!transform || !network) return null;

    const state: NetworkState = {
      networkId: network.networkId,
      timestamp: timestamp,
      transform: {
        position: { ...transform.position },
        rotation: { ...transform.rotation },
        scale: { ...transform.scale },
      },
    };

    if (physics) {
      state.physics = {
        velocity: { ...physics.velocity },
        acceleration: { ...physics.acceleration },
      };
    }

    return state;
  }

  public applySnapshot(snapshot: NetworkState): void {
    const entity = this.findEntityByNetworkId(snapshot.networkId);
    if (!entity) return;

    const network = entity.getComponent<NetworkComponent>("NetworkComponent");
    if (!network || network.authorityType === AuthorityType.SERVER) return;

    // Add to interpolation buffer
    let buffer = this.stateBuffers.get(snapshot.networkId);
    if (!buffer) {
      buffer = { states: [], lastProcessedTime: 0 };
      this.stateBuffers.set(snapshot.networkId, buffer);
    }

    // Insert state in chronological order
    const insertIndex = buffer.states.findIndex(
      (state) => state.timestamp > snapshot.timestamp
    );
    if (insertIndex === -1) {
      buffer.states.push(snapshot);
    } else {
      buffer.states.splice(insertIndex, 0, snapshot);
    }

    // Maintain buffer size
    while (buffer.states.length > NetworkSyncSystem.BUFFER_SIZE) {
      buffer.states.shift();
    }
  }

  private interpolateState(entity: Entity, currentTime: number): void {
    const network = entity.getComponent<NetworkComponent>("NetworkComponent");
    const transform =
      entity.getComponent<TransformComponent>("TransformComponent");
    if (!network || !transform) return;

    const buffer = this.stateBuffers.get(network.networkId);
    if (!buffer || buffer.states.length < 2) return;

    // Calculate interpolation time with delay
    const interpolationTime =
      currentTime - NetworkSyncSystem.INTERPOLATION_DELAY;

    // Find states to interpolate between
    let i = 0;
    for (; i < buffer.states.length - 1; i++) {
      if (buffer.states[i + 1].timestamp >= interpolationTime) break;
    }

    if (i >= buffer.states.length - 1) return;

    const beforeState = buffer.states[i];
    const afterState = buffer.states[i + 1];

    // Calculate interpolation factor
    const timeDiff = afterState.timestamp - beforeState.timestamp;
    if (timeDiff <= 0) return;

    const alpha = (interpolationTime - beforeState.timestamp) / timeDiff;

    // Interpolate transform
    this.lerpVector3(
      transform.position,
      beforeState.transform.position,
      afterState.transform.position,
      alpha
    );
    this.lerpQuaternion(
      transform.rotation,
      beforeState.transform.rotation,
      afterState.transform.rotation,
      alpha
    );
    this.lerpVector3(
      transform.scale,
      beforeState.transform.scale,
      afterState.transform.scale,
      alpha
    );

    // Interpolate physics if available
    const physics = entity.getComponent<PhysicsComponent>("PhysicsComponent");
    if (physics && beforeState.physics && afterState.physics) {
      this.lerpVector3(
        physics.velocity,
        beforeState.physics.velocity,
        afterState.physics.velocity,
        alpha
      );
      this.lerpVector3(
        physics.acceleration,
        beforeState.physics.acceleration,
        afterState.physics.acceleration,
        alpha
      );
    }

    buffer.lastProcessedTime = interpolationTime;
  }

  public predict(input: any): void {
    // Store input for reconciliation
    this.pendingInputs.set(this.inputSequenceNumber++, input);

    // Apply prediction
    for (const entity of this.entities) {
      const network = entity.getComponent<NetworkComponent>("NetworkComponent");
      if (!network || network.authorityType !== AuthorityType.CLIENT) continue;

      this.applyInput(entity, input);
    }
  }

  public reconcile(serverState: NetworkState): void {
    const entity = this.findEntityByNetworkId(serverState.networkId);
    if (!entity) return;

    const network = entity.getComponent<NetworkComponent>("NetworkComponent");
    if (!network || network.authorityType !== AuthorityType.CLIENT) return;

    // Apply server state
    const transform =
      entity.getComponent<TransformComponent>("TransformComponent");
    if (transform) {
      Object.assign(transform.position, serverState.transform.position);
      Object.assign(transform.rotation, serverState.transform.rotation);
      Object.assign(transform.scale, serverState.transform.scale);
    }

    // Reapply pending inputs
    for (const [seq, input] of this.pendingInputs) {
      this.applyInput(entity, input);
    }
  }

  private applyInput(entity: Entity, input: any): void {
    const physics = entity.getComponent<PhysicsComponent>("PhysicsComponent");
    if (!physics) return;

    // Apply input forces/velocities
    if (input.velocity) {
      physics.velocity.x = input.velocity.x;
      physics.velocity.z = input.velocity.z;
    }
    if (input.jump) {
      physics.velocity.y = 5; // Jump force
    }
  }

  private findEntityByNetworkId(networkId: string): Entity | undefined {
    return this.entities.find((entity) => {
      const network = entity.getComponent<NetworkComponent>("NetworkComponent");
      return network && network.networkId === networkId;
    });
  }

  private lerpVector3(
    target: { x: number; y: number; z: number },
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    alpha: number
  ): void {
    target.x = start.x + (end.x - start.x) * alpha;
    target.y = start.y + (end.y - start.y) * alpha;
    target.z = start.z + (end.z - start.z) * alpha;
  }

  private lerpQuaternion(
    target: { x: number; y: number; z: number; w: number },
    start: { x: number; y: number; z: number; w: number },
    end: { x: number; y: number; z: number; w: number },
    alpha: number
  ): void {
    // Simple linear interpolation for quaternions
    // Note: In a real implementation, you should use proper quaternion slerp
    target.x = start.x + (end.x - start.x) * alpha;
    target.y = start.y + (end.y - start.y) * alpha;
    target.z = start.z + (end.z - start.z) * alpha;
    target.w = start.w + (end.w - start.w) * alpha;

    // Normalize
    const length = Math.sqrt(
      target.x * target.x +
        target.y * target.y +
        target.z * target.z +
        target.w * target.w
    );
    target.x /= length;
    target.y /= length;
    target.z /= length;
    target.w /= length;
  }
}
