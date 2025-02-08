export interface Component {
  type: string;

  // Lifecycle methods
  init?(): void;
  update?(deltaTime: number): void;
  cleanup?(): void;

  // Serialization methods
  serialize?(): unknown;
  deserialize?(data: unknown): void;

  // Optional methods for network synchronization
  interpolate?(previousState: unknown, nextState: unknown, alpha: number): void;
  predict?(deltaTime: number): void;
  reconcile?(serverState: unknown): void;

  // Optional methods for component dependencies
  getDependencies?(): string[];
  validate?(): boolean;
}
