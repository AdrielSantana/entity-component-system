import { World } from "../ecs/World";
import { NetworkSyncSystem } from "../ecs/systems/NetworkSyncSystem";
import { PhysicsSystem } from "../ecs/systems/PhysicsSystem";
import { DebugSystem } from "../ecs/systems/DebugSystem";
import { UpdateSystem } from "../ecs/systems/UpdateSystem";
import { Entity } from "../ecs/Entity";
import { TransformComponent } from "../ecs/components/TransformComponent";
import {
  NetworkComponent,
  AuthorityType,
} from "../ecs/components/NetworkComponent";
import { RenderComponent } from "../ecs/components/RenderComponent";
import { PhysicsComponent } from "../ecs/components/PhysicsComponent";

interface PerformanceMetrics {
  frameTime: number;
  physicsTime: number;
  networkTime: number;
  renderTime: number;
  fps: number;
}

export class GameLoop {
  private world: World;
  private lastTime: number;
  private isRunning: boolean;
  private debugSystem: DebugSystem = new DebugSystem();
  private networkSystem: NetworkSyncSystem = new NetworkSyncSystem();
  private physicsSystem: PhysicsSystem = new PhysicsSystem(this.debugSystem);
  private updateSystem: UpdateSystem = new UpdateSystem();
  private readonly FPS = 30;
  private readonly MAX_FRAME_TIME = 0.25; // Maximum allowed frame time to prevent spiral of death

  // Performance monitoring
  private metrics: PerformanceMetrics = {
    frameTime: 0,
    physicsTime: 0,
    networkTime: 0,
    renderTime: 0,
    fps: 0,
  };
  private frameCount: number = 0;
  private fpsUpdateTime: number = 0;
  private performanceEntity: Entity;

  constructor() {
    this.world = new World();
    this.lastTime = this.getCurrentTime();
    this.isRunning = false;

    // Initialize systems
    this.initializeSystems();

    // Create performance monitoring entity
    this.performanceEntity = this.world.createEntity();
    this.debugSystem.setEntityName(
      this.performanceEntity,
      "Performance Monitor"
    );

    // Create some example entities
    this.createExampleEntities();
  }

  private getCurrentTime(): number {
    return Date.now() / 1000; // Convert to seconds
  }

  private initializeSystems(): void {
    // Add debug system first so it can be used by other systems
    this.world.addSystem(this.debugSystem);

    // Add systems in the order they should be processed
    this.world.addSystem(this.updateSystem); // Add update system before physics
    this.world.addSystem(this.physicsSystem);
    this.world.addSystem(this.networkSystem);
  }

  private createExampleEntities(): void {
    // Create a ground plane
    const ground = this.world.createEntity();
    ground.addComponent(
      new TransformComponent(
        { x: 0, y: -2, z: 0 },
        { x: 0, y: 0, z: 0, w: 1 },
        { x: 20, y: 0.1, z: 20 }
      )
    );
    ground.addComponent(
      new RenderComponent({ geometry: "cube", scale: 1 }, { color: "#444444" })
    );
    ground.addComponent(
      new PhysicsComponent(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        0,
        true, // isStatic
        false, // useGravity
        {
          type: "box",
          size: { x: 20, y: 0.1, z: 20 },
          offset: { x: 0, y: 0, z: 0 },
        }
      )
    );
    ground.addComponent(
      new NetworkComponent(
        "ground",
        "server",
        Date.now(),
        null,
        AuthorityType.SERVER
      )
    );
    this.physicsSystem.addEntity(ground);
    this.debugSystem.setEntityName(ground, "Ground");

    // Create dynamic falling cubes
    for (let i = 0; i < 10; i++) {
      const cube = this.world.createEntity();
      const x = -8 + Math.random() * 16;
      const y = 5 + Math.random() * 10;
      const z = -8 + Math.random() * 16;

      cube.addComponent(
        new TransformComponent(
          { x, y, z },
          { x: 0, y: 0, z: 0, w: 1 },
          { x: 0.5, y: 0.5, z: 0.5 }
        )
      );
      cube.addComponent(
        new RenderComponent(
          { geometry: "cube", scale: 1 },
          { color: `#${Math.floor(Math.random() * 16777215).toString(16)}` }
        )
      );
      cube.addComponent(
        new PhysicsComponent(
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
          1, // mass
          false, // isStatic
          true, // useGravity
          {
            type: "box",
            size: { x: 0.5, y: 0.5, z: 0.5 },
            offset: { x: 0, y: 0, z: 0 },
          }
        )
      );
      cube.addComponent(
        new NetworkComponent(
          `dynamic-cube-${i}`,
          "server",
          Date.now(),
          null,
          AuthorityType.SERVER
        )
      );
      this.physicsSystem.addEntity(cube);
      this.debugSystem.setEntityName(cube, `Dynamic Cube ${i + 1}`);
    }

    // Create some static obstacles
    const obstaclePositions = [
      { x: -5, y: 0, z: -5 },
      { x: 5, y: 0, z: -5 },
      { x: -5, y: 0, z: 5 },
      { x: 5, y: 0, z: 5 },
    ];

    obstaclePositions.forEach((pos, i) => {
      const obstacle = this.world.createEntity();
      obstacle.addComponent(
        new TransformComponent(
          { x: pos.x, y: pos.y + 1, z: pos.z },
          { x: 0, y: 0, z: 0, w: 1 },
          { x: 1, y: 2, z: 1 }
        )
      );
      obstacle.addComponent(
        new RenderComponent(
          { geometry: "cube", scale: 1 },
          { color: "#8844ff" }
        )
      );
      obstacle.addComponent(
        new PhysicsComponent(
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
          0, // mass (0 for static)
          true, // isStatic
          false, // useGravity
          {
            type: "box",
            size: { x: 1, y: 2, z: 1 },
            offset: { x: 0, y: 0, z: 0 },
          }
        )
      );
      obstacle.addComponent(
        new NetworkComponent(
          `static-obstacle-${i}`,
          "server",
          Date.now(),
          null,
          AuthorityType.CLIENT
        )
      );
      this.physicsSystem.addEntity(obstacle);
      this.debugSystem.setEntityName(obstacle, `Static Obstacle ${i + 1}`);
    });
  }

  public start(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      this.lastTime = this.getCurrentTime();
      this.gameLoop();
    }
  }

  public stop(): void {
    this.isRunning = false;
  }

  private updatePerformanceMetrics(frameTime: number): void {
    this.metrics.frameTime = frameTime;
    this.frameCount++;

    const currentTime = this.getCurrentTime();
    if (currentTime - this.fpsUpdateTime >= 1.0) {
      this.metrics.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsUpdateTime = currentTime;

      // Update performance entity state
      this.debugSystem.registerCollision(
        this.performanceEntity,
        this.performanceEntity,
        this.metrics.fps
      );
    }
  }

  private gameLoop(): void {
    if (!this.isRunning) return;

    const currentTime = this.getCurrentTime();
    let frameTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Prevent spiral of death
    if (frameTime > this.MAX_FRAME_TIME) {
      frameTime = this.MAX_FRAME_TIME;
    }

    // Fixed timestep updates for physics
    const physicsStart = this.getCurrentTime();

    this.updateSystem.update(frameTime); // Update entities before physics
    this.physicsSystem.update(frameTime);
    this.metrics.physicsTime = this.getCurrentTime() - physicsStart;

    // Variable timestep updates for other systems
    const networkStart = this.getCurrentTime();
    this.networkSystem.update(frameTime);
    this.metrics.networkTime = this.getCurrentTime() - networkStart;

    const renderStart = this.getCurrentTime();
    this.metrics.renderTime = this.getCurrentTime() - renderStart;

    // Update performance metrics
    this.updatePerformanceMetrics(frameTime);

    // Schedule next frame
    setTimeout(() => this.gameLoop(), Math.floor(1000 / this.FPS));
  }

  public cleanup(): void {
    this.stop();
    this.world.cleanup();
  }

  public createPlayerEntity(playerId: string): Entity {
    const player = this.world.createEntity();

    // Add transform component for position/rotation
    player.addComponent(
      new TransformComponent(
        { x: 0, y: 5, z: 0 }, // Start position
        { x: 0, y: 0, z: 0, w: 1 }, // No rotation
        { x: 1, y: 1, z: 1 } // Normal scale
      )
    );

    // Add network component with client authority
    player.addComponent(
      new NetworkComponent(
        `player-${playerId}`,
        "client",
        Date.now(),
        null,
        AuthorityType.CLIENT // Player is server-authoritative
      )
    );

    // Add render component with player appearance
    player.addComponent(
      new RenderComponent(
        { geometry: "cube", scale: 1 },
        { color: "#ff0000" } // Red color for player
      )
    );

    // Add physics component for movement and collisions
    player.addComponent(
      new PhysicsComponent(
        { x: 0, y: 0, z: 0 }, // Initial velocity
        { x: 0, y: 0, z: 0 }, // Initial acceleration
        1, // mass
        false, // not static
        true, // use gravity
        {
          type: "box",
          size: { x: 1, y: 1, z: 1 },
          offset: { x: 0, y: 0, z: 0 },
        }
      )
    );

    // Add to necessary systems
    this.physicsSystem.addEntity(player);
    this.networkSystem.addEntity(player);
    this.debugSystem.setEntityName(player, `Player ${playerId}`);

    return player;
  }

  public handleClientInput(
    networkId: string,
    input: { velocity: { x: number; z: number }; jump?: boolean }
  ) {
    let entity = this.world.getAllEntities().find((e) => {
      const network = e.getComponent<NetworkComponent>("NetworkComponent");
      return network && network.networkId === `player-${networkId}`;
    });

    // Create player entity if it doesn't exist
    if (!entity && networkId.startsWith("player-")) {
      entity = this.createPlayerEntity(networkId);
    }

    if (entity) {
      const physics = entity.getComponent<PhysicsComponent>("PhysicsComponent");
      const network = entity.getComponent<NetworkComponent>("NetworkComponent");
      const transform =
        entity.getComponent<TransformComponent>("TransformComponent");

      if (network && physics && transform) {
        const MOVE_SPEED = 5;
        const JUMP_FORCE = 1;
        const MAX_VELOCITY = 10;

        // Apply input forces/velocities
        physics.velocity.x = input.velocity.x * MOVE_SPEED;
        physics.velocity.z = input.velocity.z * MOVE_SPEED;

        // Clamp horizontal velocity
        const speed = Math.sqrt(
          physics.velocity.x * physics.velocity.x +
            physics.velocity.z * physics.velocity.z
        );
        if (speed > MAX_VELOCITY) {
          const scale = MAX_VELOCITY / speed;
          physics.velocity.x *= scale;
          physics.velocity.z *= scale;
        }

        this.physicsSystem.setLinearVelocity(entity, {
          x: input.velocity.x * MOVE_SPEED,
          z: input.velocity.z * MOVE_SPEED,
        });

        // Use proper physics ground check
        const isGrounded = this.physicsSystem.isGrounded(entity);
        if (input.jump && isGrounded) {
          // Apply jump as impulse like client
          this.physicsSystem.applyImpulse(entity, {
            x: 0,
            y: JUMP_FORCE,
            z: 0,
          });
        }

        // Validate movement and update network state
        network.lastProcessedInput = Date.now();
        network.lastValidatedState = {
          position: transform.position,
          velocity: physics.velocity,
          timestamp: Date.now(),
        };
      }
    }
  }

  public getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public getNetworkState() {
    return {
      entities: this.world.getAllEntities().map((entity) => {
        const transform =
          entity.getComponent<TransformComponent>("TransformComponent");
        const render = entity.getComponent<RenderComponent>("RenderComponent");
        const network =
          entity.getComponent<NetworkComponent>("NetworkComponent");
        const physics =
          entity.getComponent<PhysicsComponent>("PhysicsComponent");

        return {
          networkId: network ? network.networkId : entity.getId().toString(),
          transform: transform ? transform.serialize() : undefined,
          render: render ? render.serialize() : undefined,
          physics: physics
            ? {
                velocity: physics.velocity,
                isStatic: physics.isStatic,
                useGravity: physics.useGravity,
              }
            : undefined,
          lastValidatedState: network?.lastValidatedState,
        };
      }),
      debug: {
        ...this.debugSystem.getDebugInfo(),
        performance: {
          ...this.metrics,
          entityCount: this.world.getAllEntities().length,
          updateSystemCount: this.updateSystem.getEntityCount(),
          networkSystemCount: this.networkSystem.getEntityCount(),
        },
        entities: this.world.getAllEntities().map((entity) => ({
          id: entity.getId(),
          name: this.debugSystem.getDebugName(entity) || "unnamed",
          position:
            entity.getComponent<TransformComponent>("TransformComponent")
              ?.position,
          hasUpdate: typeof (entity as any).update === "function",
          hasNetwork: entity.hasComponent("NetworkComponent"),
        })),
      },
    };
  }

  public removePlayerEntity(networkId: string): void {
    const entity = this.world.getAllEntities().find((e) => {
      const network = e.getComponent<NetworkComponent>("NetworkComponent");
      return network && network.networkId === `player-${networkId}`;
    });

    if (entity) {
      this.world.removeEntity(entity.getId());
    }
  }
}
