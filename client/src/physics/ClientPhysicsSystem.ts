import * as RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GameEntity } from "../game/ClientGameLoop";

export interface PhysicsObject {
  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Mesh;
  isStatic: boolean;
  entity: GameEntity;
  isClientAuthoritative: boolean;
  lastServerState?: {
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
    velocity: THREE.Vector3;
  };
}

export class ClientPhysicsSystem {
  private world!: RAPIER.World;
  private physicsObjects: Map<string, PhysicsObject> = new Map();
  private gravity = { x: 0, y: -9.81, z: 0 };
  private initialized: boolean = false;
  private readonly POSITION_CORRECTION_THRESHOLD = 0.5;
  private readonly VELOCITY_CORRECTION_THRESHOLD = 1.5;
  private readonly CORRECTION_ALPHA = 0.25;
  private readonly MAX_PREDICTION_ERROR = 10;

  constructor() {
    this.initPhysics();
  }

  private async initPhysics() {
    // Initialize RAPIER
    await RAPIER.init();

    // Create physics world
    this.world = new RAPIER.World({
      x: this.gravity.x,
      y: this.gravity.y,
      z: this.gravity.z,
    });
    this.initialized = true;
  }

  public isReady(): boolean {
    return this.initialized;
  }

  public addEntity(
    entity: GameEntity,
    isStatic: boolean = false,
    useGravity: boolean = true,
    isClientAuthoritative: boolean = false
  ) {
    if (!this.initialized) return;

    const mesh = entity.mesh;
    if (!mesh) return;

    // Create rigid body
    const rigidBodyDesc = isStatic
      ? RAPIER.RigidBodyDesc.fixed()
      : RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
          .setRotation(mesh.quaternion);

    if (!useGravity) {
      rigidBodyDesc.setGravityScale(0);
    }

    const rigidBody = this.world.createRigidBody(rigidBodyDesc);

    // Create collider based on mesh geometry
    const colliderDesc = this.createColliderFromMesh(mesh);
    const collider = this.world.createCollider(colliderDesc, rigidBody);

    // Store physics object
    const physicsObject: PhysicsObject = {
      rigidBody,
      collider,
      mesh,
      isStatic,
      entity,
      isClientAuthoritative,
      lastServerState: {
        position: mesh.position.clone(),
        rotation: mesh.quaternion.clone(),
        velocity: new THREE.Vector3(),
      },
    };

    this.physicsObjects.set(entity.id, physicsObject);
  }

  private createColliderFromMesh(mesh: THREE.Mesh): RAPIER.ColliderDesc {
    // For now, we'll assume all meshes are boxes
    // You can extend this to handle different geometries
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);

    return RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
  }

  public update() {
    if (!this.initialized) return;

    // Step the physics world
    this.world.step();

    // Update mesh positions based on physics
    this.physicsObjects.forEach((obj) => {
      if (!obj.isStatic) {
        const position = obj.rigidBody.translation();
        const rotation = obj.rigidBody.rotation();

        // Update mesh
        obj.mesh.position.set(position.x, position.y, position.z);
        obj.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

        // Update entity interpolation targets
        obj.entity.interpolation.position.copy(obj.mesh.position);
        obj.entity.interpolation.rotation.copy(obj.mesh.quaternion);
      }
    });
  }

  public applyImpulse(
    entityId: string,
    impulse: { x: number; y: number; z: number }
  ) {
    const physicsObject = this.physicsObjects.get(entityId);
    if (!physicsObject || physicsObject.isStatic) return;

    physicsObject.rigidBody.applyImpulse(
      new RAPIER.Vector3(impulse.x, impulse.y, impulse.z),
      true
    );
  }

  public setLinearVelocity(
    entityId: string,
    velocity: { x?: number; y?: number; z?: number }
  ) {
    const physicsObject = this.physicsObjects.get(entityId);
    if (!physicsObject || physicsObject.isStatic) return;

    physicsObject.rigidBody.setLinvel(
      new RAPIER.Vector3(
        velocity.x || physicsObject.rigidBody.linvel().x,
        velocity.y || physicsObject.rigidBody.linvel().y,
        velocity.z || physicsObject.rigidBody.linvel().z
      ),
      true
    );
  }

  public isGrounded(entityId: string): boolean {
    const physicsObject = this.physicsObjects.get(entityId);
    if (!physicsObject) return false;

    // Cast a ray slightly below the object to check for ground
    const position = physicsObject.rigidBody.translation();
    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(position.x, position.y, position.z),
      new RAPIER.Vector3(0, -1, 0)
    );

    const hit = this.world.castRay(ray, 0.1, true);
    return hit !== null;
  }

  public cleanup() {
    this.physicsObjects.clear();
    if (this.world) {
      this.world.free();
    }
  }

  public removeEntity(entityId: string) {
    const physicsObject = this.physicsObjects.get(entityId);
    if (!physicsObject || !this.world) return;

    // Remove collider and rigid body from the world
    this.world.colliders.remove(
      physicsObject.collider.handle,
      this.world.islands,
      this.world.bodies,
      true
    );
    this.world.bodies.remove(
      physicsObject.rigidBody.handle,
      this.world.islands,
      this.world.colliders,
      this.world.impulseJoints,
      this.world.multibodyJoints
    );

    // Remove from our map
    this.physicsObjects.delete(entityId);
  }

  public updateServerState(entityId: string, state: any) {
    const physicsObject = this.physicsObjects.get(entityId);
    if (!physicsObject) return;

    // Extract state from server update
    const serverPosition = new THREE.Vector3(
      state.transform.position.x,
      state.transform.position.y,
      state.transform.position.z
    );
    const serverRotation = new THREE.Quaternion(
      state.transform.rotation.x,
      state.transform.rotation.y,
      state.transform.rotation.z,
      state.transform.rotation.w
    );
    const serverVelocity = new THREE.Vector3(
      state.physics?.velocity?.x || 0,
      state.physics?.velocity?.y || 0,
      state.physics?.velocity?.z || 0
    );

    if (physicsObject.isStatic) {
      physicsObject.rigidBody.setTranslation(serverPosition, true);
      physicsObject.rigidBody.setRotation(serverRotation, true);
      physicsObject.rigidBody.setLinvel(
        new RAPIER.Vector3(
          serverVelocity.x,
          serverVelocity.y,
          serverVelocity.z
        ),
        true
      );
    } else {
      const lastValidatedState =
        state.lastValidatedState || physicsObject.lastServerState;
      if (lastValidatedState) {
        physicsObject.lastServerState = {
          position: serverPosition,
          rotation: serverRotation,
          velocity: serverVelocity,
        };

        // Check prediction error
        const currentPosition = physicsObject.rigidBody.translation();
        const predictionError = new THREE.Vector3(
          serverPosition.x - currentPosition.x,
          serverPosition.y - currentPosition.y,
          serverPosition.z - currentPosition.z
        ).length();

        if (predictionError > this.MAX_PREDICTION_ERROR) {
          // Hard correction for large errors
          physicsObject.rigidBody.setTranslation(serverPosition, true);
          physicsObject.rigidBody.setLinvel(
            new RAPIER.Vector3(
              serverVelocity.x,
              serverVelocity.y,
              serverVelocity.z
            ),
            true
          );
        } else {
          // Smooth correction for small errors
          this.reconcileClientState(physicsObject);
        }
      }
    }
  }

  private reconcileClientState(physicsObject: PhysicsObject) {
    if (!physicsObject.lastServerState) return;

    const currentPosition = physicsObject.rigidBody.translation();
    const currentVelocity = physicsObject.rigidBody.linvel();
    const serverPosition = physicsObject.lastServerState.position;
    const serverVelocity = physicsObject.lastServerState.velocity;

    // Calculate differences
    const positionDiff = new THREE.Vector3(
      serverPosition.x - currentPosition.x,
      serverPosition.y - currentPosition.y,
      serverPosition.z - currentPosition.z
    );
    const velocityDiff = new THREE.Vector3(
      serverVelocity.x - currentVelocity.x,
      serverVelocity.y - currentVelocity.y,
      serverVelocity.z - currentVelocity.z
    );

    // Apply smooth correction if needed
    if (
      positionDiff.length() > this.POSITION_CORRECTION_THRESHOLD ||
      velocityDiff.length() > this.VELOCITY_CORRECTION_THRESHOLD
    ) {
      const newPosition = new RAPIER.Vector3(
        currentPosition.x + positionDiff.x * this.CORRECTION_ALPHA,
        currentPosition.y + positionDiff.y * this.CORRECTION_ALPHA,
        currentPosition.z + positionDiff.z * this.CORRECTION_ALPHA
      );
      const newVelocity = new RAPIER.Vector3(
        currentVelocity.x + velocityDiff.x * this.CORRECTION_ALPHA,
        currentVelocity.y + velocityDiff.y * this.CORRECTION_ALPHA,
        currentVelocity.z + velocityDiff.z * this.CORRECTION_ALPHA
      );

      physicsObject.rigidBody.setTranslation(newPosition, true);
      physicsObject.rigidBody.setLinvel(newVelocity, true);
    }
  }
}
