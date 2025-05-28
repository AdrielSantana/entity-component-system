import { Entity } from "./Entity.js";

export interface ISystem {
  update(deltaTime: number): void;
  init(): void;
  cleanup(): void;
}

export abstract class System implements ISystem {
  protected entities: Entity[] = [];

  public addEntity(entity: Entity): void {
    if (this.shouldProcessEntity(entity) && !this.hasEntity(entity)) {
      this.entities.push(entity);
    }
  }

  public removeEntity(entity: Entity): void {
    const index = this.entities.indexOf(entity);
    if (index !== -1) {
      this.entities.splice(index, 1);
    }
  }

  public hasEntity(entity: Entity): boolean {
    return this.entities.includes(entity);
  }

  public getEntityCount(): number {
    return this.entities.length;
  }

  public shouldProcessEntity(entity: Entity): boolean {
    return true; // Default implementation, should be overridden by subclasses
  }

  public abstract update(deltaTime: number): void;

  public init(): void {
    // Default implementation
  }

  public cleanup(): void {
    this.entities = [];
  }
}
