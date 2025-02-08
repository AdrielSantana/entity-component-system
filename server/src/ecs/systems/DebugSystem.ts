import { System } from "../System";
import { Entity } from "../Entity";
import { PhysicsComponent } from "../components/PhysicsComponent";
import { TransformComponent } from "../components/TransformComponent";
import { RenderComponent } from "../components/RenderComponent";

interface EntityDebugState {
  entityId: string;
  name: string;
  position: string;
  velocity: string;
  acceleration: string;
  isStatic: boolean;
  collisions: string[];
  color: string;
}

export interface DebugInfo {
  frameCount: number;
  activeEntities: number;
  fps: number;
  entityStates: Map<string, EntityDebugState>;
  collisions: Array<{ entityA: string; entityB: string; depth: number }>;
}

export class DebugSystem extends System {
  private debugStates: Map<string, EntityDebugState> = new Map();
  private frameCount: number = 0;
  private lastUpdateTime: number = Date.now();
  private startTime: number = Date.now();
  private entityNames: Map<string, string> = new Map();
  private activeCollisions: Array<{
    entityA: string;
    entityB: string;
    depth: number;
  }> = [];
  private collisions: Map<string, { entity2: Entity; data: any }> = new Map();

  constructor() {
    super();
    // Note: Entity names will be set dynamically as entities are created
  }

  public override shouldProcessEntity(entity: Entity): boolean {
    return (
      entity.hasComponent("PhysicsComponent") &&
      entity.hasComponent("TransformComponent")
    );
  }

  public override update(deltaTime: number): void {
    this.frameCount++;

    // Update debug states for all entities
    for (const entity of this.entities) {
      this.updateEntityDebugState(entity);
    }

    // Clear old collisions
    this.clearCollisions();
  }

  private updateEntityDebugState(entity: Entity): void {
    const physicsComponent =
      entity.getComponent<PhysicsComponent>("PhysicsComponent");
    const transformComponent =
      entity.getComponent<TransformComponent>("TransformComponent");
    const renderComponent =
      entity.getComponent<RenderComponent>("RenderComponent");

    if (!physicsComponent || !transformComponent) return;

    const state: EntityDebugState = {
      entityId: entity.getId(),
      name:
        this.entityNames.get(entity.getId()) ||
        `Entity ${entity.getId().slice(0, 8)}`,
      position: `(${transformComponent.position.x.toFixed(
        2
      )}, ${transformComponent.position.y.toFixed(2)})`,
      velocity: `(${physicsComponent.velocity.x.toFixed(
        2
      )}, ${physicsComponent.velocity.y.toFixed(2)})`,
      acceleration: `(${physicsComponent.acceleration.x.toFixed(
        2
      )}, ${physicsComponent.acceleration.y.toFixed(2)})`,
      isStatic: physicsComponent.isStatic,
      collisions: [],
      color: renderComponent?.material.color || "#FFFFFF",
    };

    this.debugStates.set(entity.getId(), state);
  }

  public getDebugInfo(): DebugInfo {
    const currentTime = Date.now();
    const elapsedTime = (currentTime - this.startTime) / 1000; // Convert to seconds
    const fps = this.frameCount / elapsedTime;

    return {
      frameCount: this.frameCount,
      activeEntities: this.entities.length,
      fps: Math.round(fps),
      entityStates: this.debugStates,
      collisions: this.activeCollisions,
    };
  }

  public registerCollision(
    entityA: Entity,
    entityB: Entity,
    depth: number = 0
  ): void {
    const collision = {
      entityA: entityA.getId(),
      entityB: entityB.getId(),
      depth,
    };

    this.activeCollisions.push(collision);

    const stateA = this.debugStates.get(entityA.getId());
    const stateB = this.debugStates.get(entityB.getId());

    if (stateA && !stateA.collisions.includes(entityB.getId())) {
      stateA.collisions.push(entityB.getId());
    }
    if (stateB && !stateB.collisions.includes(entityA.getId())) {
      stateB.collisions.push(entityA.getId());
    }

    this.collisions.set(entityA.getId(), { entity2: entityB, data: { depth } });
    this.collisions.set(entityB.getId(), { entity2: entityA, data: { depth } });
  }

  public override cleanup(): void {
    super.cleanup();
    this.debugStates.clear();
    this.entityNames.clear();
    this.activeCollisions = [];
    this.frameCount = 0;
    this.lastUpdateTime = Date.now();
    this.startTime = Date.now();
    this.collisions.clear();
  }

  public clearCollisions(): void {
    this.activeCollisions = [];
    for (const state of this.debugStates.values()) {
      state.collisions = [];
    }
    this.collisions.clear();
  }

  public setEntityName(entity: Entity, name: string): void {
    this.entityNames.set(entity.getId(), name);
  }

  public getDebugName(entity: Entity): string | undefined {
    return this.entityNames.get(entity.getId());
  }

  public getDebugCollisionInfo(): any {
    return {
      entityNames: Object.fromEntries(this.entityNames),
      collisions: Array.from(this.collisions.entries()).map(
        ([id, { entity2, data }]) => ({
          entity1: id,
          entity2: entity2.getId(),
          data,
        })
      ),
    };
  }
}
