import { Entity } from "./Entity.js";
import { System } from "./System.js";

export class World {
  private entities: Map<string, Entity>;
  private systems: System[];

  constructor() {
    this.entities = new Map();
    this.systems = [];
  }

  public createEntity(): Entity {
    const entity = new Entity();
    const entityId = entity.getId();
    this.entities.set(entityId, entity);

    // Add entity to relevant systems immediately
    for (const system of this.systems) {
      if (system.shouldProcessEntity(entity)) {
        system.addEntity(entity);
      }
    }

    return entity;
  }

  public removeEntity(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    // Remove entity from all systems first
    for (const system of this.systems) {
      system.removeEntity(entity);
    }

    // Destroy the entity
    entity.destroy();
    this.entities.delete(entityId);
  }

  public addSystem(system: System): void {
    this.systems.push(system);

    // Add existing entities to the new system if they match
    for (const entity of this.entities.values()) {
      if (system.shouldProcessEntity(entity)) {
        system.addEntity(entity);
      }
    }
  }

  public update(deltaTime: number): void {
    // Update all systems
    for (const system of this.systems) {
      system.update(deltaTime);
    }
  }

  public cleanup(): void {
    // Clean up all entities
    for (const entity of this.entities.values()) {
      entity.destroy();
    }
    this.entities.clear();

    // Clean up all systems
    for (const system of this.systems) {
      system.cleanup();
    }
    this.systems = [];
  }

  public getEntity(entityId: string): Entity | undefined {
    return this.entities.get(entityId);
  }

  public getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }
}
