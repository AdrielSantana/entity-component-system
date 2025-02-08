import { Component } from "../Component";

export enum AuthorityType {
  SERVER = "SERVER",
  CLIENT = "CLIENT",
}

export interface ValidatedState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  timestamp: number;
}

export class NetworkComponent implements Component {
  public type = "NetworkComponent";

  constructor(
    public networkId: string,
    public owner: string,
    public lastUpdate: number,
    public lastInput: any,
    public authorityType: AuthorityType,
    public lastProcessedInput: number = 0,
    public lastValidatedState: ValidatedState | null = null
  ) {}

  public serialize(): any {
    return {
      networkId: this.networkId,
      owner: this.owner,
      lastUpdate: this.lastUpdate,
      lastInput: this.lastInput,
      authorityType: this.authorityType,
      lastProcessedInput: this.lastProcessedInput,
      lastValidatedState: this.lastValidatedState,
    };
  }

  public deserialize(data: any): void {
    if (data.networkId) this.networkId = data.networkId;
    if (data.owner) this.owner = data.owner;
    if (data.lastUpdate) this.lastUpdate = data.lastUpdate;
    if (data.lastInput) this.lastInput = data.lastInput;
    if (data.lastProcessedInput)
      this.lastProcessedInput = data.lastProcessedInput;
    if (data.lastValidatedState)
      this.lastValidatedState = data.lastValidatedState;
  }
}
