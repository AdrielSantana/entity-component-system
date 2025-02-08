import { System } from "../System";
import { Entity } from "../Entity";
import { PhysicsComponent } from "../components/PhysicsComponent";
import { TransformComponent } from "../components/TransformComponent";
import { DebugSystem } from "./DebugSystem";
import {
  NetworkComponent,
  AuthorityType,
} from "../components/NetworkComponent";
import * as RAPIER from "@dimforge/rapier3d-compat";

interface PhysicsObject {
  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  entity: Entity;
  isStatic: boolean;
}

export class PhysicsSystem extends System {
  private world!: RAPIER.World;
  private physicsObjects: Map<Entity, PhysicsObject> = new Map();
  private gravity = { x: 0, y: -9.81, z: 0 };
  private initialized: boolean = false;
  private debugSystem?: DebugSystem;

  constructor(debugSystem?: DebugSystem) {
    super();
    this.debugSystem = debugSystem;
    this.initPhysics();
  }

  private async initPhysics() {
    await RAPIER.init();
    this.world = new RAPIER.World({
      x: this.gravity.x,
      y: this.gravity.y,
      z: this.gravity.z,
    });
    this.initialized = true;
    this.reAddEntityAfterInit();
  }

  private reAddEntityAfterInit() {
    this.entities.forEach((entity) => {
      this.addEntity(entity);
    });
  }

  public override shouldProcessEntity(entity: Entity): boolean {
    const network = entity.getComponent<NetworkComponent>("NetworkComponent");
    const physics = entity.getComponent<PhysicsComponent>("PhysicsComponent");
    const transform =
      entity.getComponent<TransformComponent>("TransformComponent");

    // Process physics for:
    // 1. Server-authoritative entities
    // 2. Static entities (ground, obstacles)
    // 3. Local entities without network component
    // 4. Client-authoritative entities that need server-side validation
    return (
      physics !== undefined &&
      transform !== undefined &&
      (network === undefined || // Local entities
        network.authorityType === AuthorityType.SERVER || // Server-authoritative
        physics.isStatic || // Static entities like ground and obstacles
        (network.authorityType === AuthorityType.CLIENT && !physics.isStatic)) // Client entities that need physics validation
    );
  }

  public override removeEntity(entity: Entity): void {
    super.removeEntity(entity);

    // Clean up physics objects when entity is removed
    const physicsObject = this.physicsObjects.get(entity);
    if (physicsObject) {
      // Remove collider and rigid body from physics world
      this.world.removeCollider(physicsObject.collider, true);
      this.world.removeRigidBody(physicsObject.rigidBody);
      this.physicsObjects.delete(entity);
    }
  }

  public addEntity(entity: Entity): void {
    // Only add if we should process this entity
    if (!this.shouldProcessEntity(entity)) {
      return;
    }

    super.addEntity(entity);

    if (!this.initialized) return;

    const physics = entity.getComponent<PhysicsComponent>("PhysicsComponent");
    const transform =
      entity.getComponent<TransformComponent>("TransformComponent");

    if (!physics || !transform) return;

    // Create rigid body
    const rigidBodyDesc = physics.isStatic
      ? RAPIER.RigidBodyDesc.fixed().setTranslation(
          transform.position.x,
          transform.position.y,
          transform.position.z
        )
      : RAPIER.RigidBodyDesc.dynamic().setTranslation(
          transform.position.x,
          transform.position.y,
          transform.position.z
        );

    if (!physics.useGravity) {
      rigidBodyDesc.setGravityScale(0);
    }

    const rigidBody = this.world.createRigidBody(rigidBodyDesc);

    // Create collider
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      physics.collider.size.x / 2,
      physics.collider.size.y / 2,
      physics.collider.size.z / 2
    );
    const collider = this.world.createCollider(colliderDesc, rigidBody);

    // Store physics object
    this.physicsObjects.set(entity, {
      rigidBody,
      collider,
      entity,
      isStatic: physics.isStatic,
    });
  }

  public update(deltaTime: number): void {
    if (!this.initialized) return;

    // Step the physics world with fixed timestep
    this.world.timestep = deltaTime;
    this.world.step();

    // Update entity transforms based on physics
    this.physicsObjects.forEach((physicsObject, entity) => {
      if (!physicsObject.isStatic) {
        const transform =
          entity.getComponent<TransformComponent>("TransformComponent");
        const physics =
          entity.getComponent<PhysicsComponent>("PhysicsComponent");

        if (transform && physics) {
          const position = physicsObject.rigidBody.translation();
          const rotation = physicsObject.rigidBody.rotation();
          const velocity = physicsObject.rigidBody.linvel();

          // Update transform
          transform.position.x = position.x;
          transform.position.y = position.y;
          transform.position.z = position.z;
          transform.rotation.x = rotation.x;
          transform.rotation.y = rotation.y;
          transform.rotation.z = rotation.z;
          transform.rotation.w = rotation.w;

          // Update physics component
          physics.velocity.x = velocity.x;
          physics.velocity.y = velocity.y;
          physics.velocity.z = velocity.z;
        }
      }
    });

    // Handle collisions
    this.handleCollisions();
  }

  private handleCollisions(): void {
    // Get all contact pairs from the physics world
    const eventQueue = new RAPIER.EventQueue(true);
    this.world.step(eventQueue);

    eventQueue.drainCollisionEvents(
      (handle1: number, handle2: number, started: boolean) => {
        const collider1 = this.world.getCollider(handle1);
        const collider2 = this.world.getCollider(handle2);

        if (collider1 && collider2) {
          // Find entities involved in collision
          let entity1: Entity | undefined;
          let entity2: Entity | undefined;

          this.physicsObjects.forEach((obj, entity) => {
            if (obj.collider === collider1) entity1 = entity;
            if (obj.collider === collider2) entity2 = entity;
          });

          if (entity1 && entity2 && this.debugSystem) {
            this.debugSystem.registerCollision(entity1, entity2);
          }
        }
      }
    );
  }

  public setLinearVelocity(
    entity: Entity,
    velocity: { x?: number; y?: number; z?: number }
  ): void {
    const physicsObject = this.physicsObjects.get(entity);
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

  public applyImpulse(
    entity: Entity,
    impulse: { x: number; y: number; z: number }
  ): void {
    const physicsObject = this.physicsObjects.get(entity);
    if (!physicsObject || physicsObject.isStatic) return;

    physicsObject.rigidBody.applyImpulse(
      new RAPIER.Vector3(impulse.x, impulse.y, impulse.z),
      true
    );
  }

  public isGrounded(entity: Entity): boolean {
    const physicsObject = this.physicsObjects.get(entity);
    if (!physicsObject) return false;

    const position = physicsObject.rigidBody.translation();
    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(position.x, position.y, position.z),
      new RAPIER.Vector3(0, -1, 0)
    );

    const hit = this.world.castRay(ray, 0.1, true);
    return hit !== null;
  }

  public cleanup(): void {
    this.physicsObjects.clear();
    if (this.world) {
      this.world.free();
    }
  }

  public setPosition(
    entity: Entity,
    position: { x: number; y: number; z: number }
  ): void {
    const transform =
      entity.getComponent<TransformComponent>("TransformComponent");
    const physics = entity.getComponent<PhysicsComponent>("PhysicsComponent");
    const physicsObject = this.physicsObjects.get(entity);

    if (transform && physics && physicsObject) {
      // Update transform component
      transform.position = { ...position };

      // Reset physics state
      physics.velocity = { x: 0, y: 0, z: 0 };
      physics.acceleration = { x: 0, y: 0, z: 0 };

      // Update RAPIER rigid body position
      physicsObject.rigidBody.setTranslation(
        new RAPIER.Vector3(position.x, position.y, position.z),
        true // Wake up the body
      );

      // Reset velocities in physics engine
      physicsObject.rigidBody.setLinvel(new RAPIER.Vector3(0, 0, 0), true);
      physicsObject.rigidBody.setAngvel(new RAPIER.Vector3(0, 0, 0), true);
    }
  }
}
