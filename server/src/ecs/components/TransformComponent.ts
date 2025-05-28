import { Component } from "../Component.js";

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export class TransformComponent implements Component {
  public type = "TransformComponent";

  constructor(
    public position: Vector3 = { x: 0, y: 0, z: 0 },
    public rotation: Quaternion = { x: 0, y: 0, z: 0, w: 1 },
    public scale: Vector3 = { x: 1, y: 1, z: 1 }
  ) {}

  public serialize(): any {
    return {
      position: { ...this.position },
      rotation: { ...this.rotation },
      scale: { ...this.scale },
    };
  }

  public deserialize(data: any): void {
    if (data.position) this.position = { ...data.position };
    if (data.rotation) this.rotation = { ...data.rotation };
    if (data.scale) this.scale = { ...data.scale };
  }
}
