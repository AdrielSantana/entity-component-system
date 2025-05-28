import { Component } from "./Component.js";
import { v4 as uuidv4 } from "uuid";

export class Entity {
  private id: string;
  private components: Map<string, Component>;
  private isDestroyed: boolean = false;

  constructor() {
    this.id = uuidv4();
    this.components = new Map();
  }

  public getId(): string {
    return this.id;
  }

  public addComponent(component: Component): void {
    if (this.isDestroyed) {
      throw new Error("Cannot add component to destroyed entity");
    }

    const componentType = component.constructor.name;
    if (this.components.has(componentType)) {
      throw new Error(
        `Component of type ${componentType} already exists on entity ${this.id}`
      );
    }

    // Initialize component if it has init method
    if (component.init) {
      component.init();
    }

    this.components.set(componentType, component);
  }

  public removeComponent(componentType: string): void {
    if (this.isDestroyed) {
      return;
    }

    const component = this.components.get(componentType);
    if (component) {
      // Cleanup component if it has a cleanup method
      if ("cleanup" in component && typeof component.cleanup === "function") {
        component.cleanup();
      }
      this.components.delete(componentType);
    }
  }

  public getComponent<T extends Component>(
    componentType: string
  ): T | undefined {
    if (this.isDestroyed) {
      return undefined;
    }
    return this.components.get(componentType) as T;
  }

  public hasComponent(componentType: string): boolean {
    return !this.isDestroyed && this.components.has(componentType);
  }

  public hasComponents(componentTypes: string[]): boolean {
    return (
      !this.isDestroyed &&
      componentTypes.every((type) => this.components.has(type))
    );
  }

  public getComponents(): Map<string, Component> {
    return new Map(this.components);
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    // Cleanup all components
    this.components.forEach((component) => {
      if ("cleanup" in component && typeof component.cleanup === "function") {
        component.cleanup();
      }
    });

    this.components.clear();
    this.isDestroyed = true;
  }

  public isActive(): boolean {
    return !this.isDestroyed;
  }
}
