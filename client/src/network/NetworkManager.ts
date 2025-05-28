interface NetworkConfig {
  serverUrl: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
}

type EventCallback = (...args: any[]) => void;

export interface ClientInput {
  velocity: { x: number; z: number };
  jump?: boolean;
  sequenceNumber?: number;
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  private config: NetworkConfig;
  private reconnectAttempts = 0;
  private inputSequence = 0;
  private lastProcessedInput = 0;
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private shouldReconnect = true;
  private connectionAttemptTimeout: NodeJS.Timeout | null = null;

  constructor(config: NetworkConfig) {
    console.log("Creating new NetworkManager instance");
    this.config = config;
  }

  public on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)?.add(callback);
  }

  public onRaw(callback: EventCallback): void {
    if (!this.eventListeners.has('gameState')) {
      this.eventListeners.set('gameState', new Set());
    }
    this.eventListeners.get('gameState')?.add(callback);
  }

  public off(event: string, callback: EventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: any[]): void {
    this.eventListeners.get(event)?.forEach((callback) => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  public connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      console.log("Connection already exists or is in progress");
      return;
    }

    if (!this.shouldReconnect) {
      console.log("Connection attempts disabled");
      return;
    }

    console.log("Connecting to server...");
    this.isConnecting = true;

    // Clear any existing connection attempt timeout
    if (this.connectionAttemptTimeout) {
      clearTimeout(this.connectionAttemptTimeout);
    }

    try {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      this.ws = new WebSocket(this.config.serverUrl);
      this.setupWebSocket();

      // Set a timeout for the connection attempt
      this.connectionAttemptTimeout = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          console.log("Connection attempt timed out");
          this.ws?.close();
          this.isConnecting = false;
          this.scheduleReconnect();
        }
      }, 5000); // 5 second timeout
    } catch (error) {
      console.error("Failed to connect to server:", error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private setupWebSocket(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log("WebSocket connection established");
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      // Clear connection attempt timeout
      if (this.connectionAttemptTimeout) {
        clearTimeout(this.connectionAttemptTimeout);
        this.connectionAttemptTimeout = null;
      }

      // Send join message
      this.send({
        type: "join",
        data: {},
      });
    };

    this.ws.onclose = () => {
      console.log("WebSocket connection closed");
      this.isConnecting = false;

      // Clear connection attempt timeout
      if (this.connectionAttemptTimeout) {
        clearTimeout(this.connectionAttemptTimeout);
        this.connectionAttemptTimeout = null;
      }

      this.emit("disconnected");

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.isConnecting = false;

      // Clear connection attempt timeout
      if (this.connectionAttemptTimeout) {
        clearTimeout(this.connectionAttemptTimeout);
        this.connectionAttemptTimeout = null;
      }

      this.emit("error", error);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleServerMessage(message);
      } catch (error) {
        console.error("Error parsing server message:", error);
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (!this.shouldReconnect) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.log("Max reconnection attempts reached");
      this.emit("reconnectFailed");
      return;
    }

    this.reconnectAttempts++;
    console.log(
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`
    );

    this.reconnectTimeout = setTimeout(() => {
      if (
        !this.isConnecting &&
        (!this.ws || this.ws.readyState === WebSocket.CLOSED) &&
        this.shouldReconnect
      ) {
        console.log(`Attempting to reconnect (${this.reconnectAttempts})`);
        this.connect();
      }
    }, this.config.reconnectInterval);
  }

  private handleServerMessage(message: any): void {
    switch (message.type) {
      case "gameState":
        this.emit("gameState", message.data);
        break;

      case "playerJoined":
        this.emit("playerJoined", message.data);
        break;

      case "playerLeft":
        this.emit("playerLeft", message.data);
        break;

      case "inputAck":
        this.lastProcessedInput = Math.max(
          this.lastProcessedInput,
          message.data.sequence
        );
        break;

      case "welcome":
        // Emit connected event with client ID when we receive the welcome message
        this.emit("connected", { clientId: message.data.clientId });
        break;

      default:
        console.warn("Unknown message type:", message.type);
    }
  }

  public sendInput(input: ClientInput): void {
    const inputMessage = {
      type: "input",
      data: {
        sequence: this.inputSequence++,
        timestamp: Date.now(),
        ...input,
      },
    };

    this.send(inputMessage);
  }

  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public getLastProcessedInputSequence(): number {
    return this.lastProcessedInput;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public getConnectionStats(): any {
    return {
      connected: this.isConnected(),
      clientId: null, // WebSocket doesn't have client ID
      latency: 0, // WebSocket doesn't track latency
      reconnectAttempts: this.reconnectAttempts,
      inputSequence: this.inputSequence,
      lastProcessedInput: this.lastProcessedInput,
      quality: {
        latency: 0,
        jitter: 0,
        packetLoss: 0,
        connectionStrength: 'good' as const
      },
      stats: {
        bytesSent: 0,
        bytesReceived: 0,
        messagesSent: 0,
        messagesReceived: 0,
        avgLatency: 0,
        maxLatency: 0,
        minLatency: 0,
        connectionUptime: 0
      }
    };
  }

  public disconnect(): void {
    console.log("Disconnecting from server");
    this.shouldReconnect = false;
    this.isConnecting = false;

    // Clear all timeouts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.connectionAttemptTimeout) {
      clearTimeout(this.connectionAttemptTimeout);
      this.connectionAttemptTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Clear all event listeners
    this.eventListeners.clear();
  }
}
