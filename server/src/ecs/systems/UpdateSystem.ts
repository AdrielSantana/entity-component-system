import { System } from "../System";
import { Entity } from "../Entity";

export class UpdateSystem extends System {
  public shouldProcessEntity(entity: Entity): boolean {
    // Process any entity that has an update method
    return typeof (entity as any).update === "function";
  }

  public update(deltaTime: number): void {
    for (const entity of this.entities) {
      if (typeof (entity as any).update === "function") {
        (entity as any).update(deltaTime);
      }
    }
  }
}
