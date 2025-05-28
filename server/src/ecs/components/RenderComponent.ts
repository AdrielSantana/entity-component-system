import { Component } from "../Component.js";

export interface Material {
  color?: string;
  texture?: string;
  opacity?: number;
}

export interface Mesh {
  geometry: string; // Reference to the geometry type (e.g., 'cube', 'sphere')
  scale?: number;
}

export class RenderComponent implements Component {
  public type = "RenderComponent";

  constructor(
    public mesh: Mesh = { geometry: "cube", scale: 1 },
    public material: Material = { color: "#ffffff" },
    public visible: boolean = true
  ) {}

  public serialize(): any {
    return {
      mesh: { ...this.mesh },
      material: { ...this.material },
      visible: this.visible,
    };
  }

  public deserialize(data: any): void {
    if (data.mesh) this.mesh = { ...data.mesh };
    if (data.material) this.material = { ...data.material };
    if (data.visible !== undefined) this.visible = data.visible;
  }
}
