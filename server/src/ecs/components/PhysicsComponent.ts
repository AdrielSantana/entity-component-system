import { Component } from "../Component";
import { Vector3 } from "./TransformComponent";

export interface Collider {
  type: "box" | "sphere" | "capsule";
  size: Vector3; // For box: width/height/depth, For sphere: radius/unused/unused
  offset: Vector3; // Offset from entity position
}

export class PhysicsComponent implements Component {
  public type = "PhysicsComponent";

  constructor(
    public velocity: Vector3 = { x: 0, y: 0, z: 0 },
    public acceleration: Vector3 = { x: 0, y: 0, z: 0 },
    public mass: number = 1,
    public isStatic: boolean = false,
    public useGravity: boolean = true,
    public collider: Collider = {
      type: "box",
      size: { x: 1, y: 1, z: 1 },
      offset: { x: 0, y: 0, z: 0 },
    },
    public friction: number = 0.1,
    public restitution: number = 0.5 // Bounciness
  ) {}

  public serialize(): any {
    return {
      velocity: { ...this.velocity },
      acceleration: { ...this.acceleration },
      mass: this.mass,
      isStatic: this.isStatic,
      useGravity: this.useGravity,
      collider: { ...this.collider },
      friction: this.friction,
      restitution: this.restitution,
    };
  }

  public deserialize(data: any): void {
    if (data.velocity) this.velocity = { ...data.velocity };
    if (data.acceleration) this.acceleration = { ...data.acceleration };
    if (data.mass !== undefined) this.mass = data.mass;
    if (data.isStatic !== undefined) this.isStatic = data.isStatic;
    if (data.useGravity !== undefined) this.useGravity = data.useGravity;
    if (data.collider) this.collider = { ...data.collider };
    if (data.friction !== undefined) this.friction = data.friction;
    if (data.restitution !== undefined) this.restitution = data.restitution;
  }
}
