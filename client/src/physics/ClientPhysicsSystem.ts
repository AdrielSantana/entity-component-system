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
}

export class ClientPhysicsSystem {
  private world!: RAPIER.World;
  private physicsObjects: Map<string, PhysicsObject> = new Map();
  private gravity = { x: 0, y: -9.81, z: 0 };
  private initialized = false;

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
    isStatic = false,
    useGravity = true,
    isClientAuthoritative = false
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

  public update(deltaTime?: number) {
    if (!this.initialized) return;

    // Step the physics world with consistent timestep like the server
    if (deltaTime !== undefined) {
      this.world.timestep = deltaTime;
    }
    this.world.step();

    // Update mesh positions based on physics
    this.physicsObjects.forEach((obj) => {
      if (!obj.isStatic) {
        const position = obj.rigidBody.translation();
        const rotation = obj.rigidBody.rotation();

        // Update mesh
        obj.mesh.position.set(position.x, position.y, position.z);
        obj.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
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

  public setAngularVelocity(
    entityId: string,
    angularVelocity: { x?: number; y?: number; z?: number }
  ) {
    const physicsObject = this.physicsObjects.get(entityId);
    if (!physicsObject || physicsObject.isStatic) return;

    physicsObject.rigidBody.setAngvel(
      new RAPIER.Vector3(
        angularVelocity.x || physicsObject.rigidBody.angvel().x,
        angularVelocity.y || physicsObject.rigidBody.angvel().y,
        angularVelocity.z || physicsObject.rigidBody.angvel().z
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

    // Apply server state directly (no interpolation or prediction)
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
  }
}
