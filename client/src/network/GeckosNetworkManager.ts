import geckos, { ClientChannel, Data, RawMessage } from '@geckos.io/client';
import { GameStateDeserializer } from './GameStateDeserializer';
import { defaultGeckosConfig, GeckosConfig } from '../geckos.config';

interface NetworkConfig {
  serverUrl: string;
  port: number;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  iceServers?: RTCIceServer[];
}

type EventCallback = (...args: any[]) => void;

export interface ClientInput {
  velocity: { x: number; z: number };
  rotation?: number; // Y-axis rotation (-1 for Q, 1 for E, 0 for no rotation)
  jump?: boolean;
  sequenceNumber?: number;
}

interface ConnectionQuality {
  latency: number;
  jitter: number;
  packetLoss: number;
  connectionStrength: 'excellent' | 'good' | 'fair' | 'poor';
}

interface NetworkStats {
  bytesSent: number;
  bytesReceived: number;
  messagesSent: number;
  messagesReceived: number;
  avgLatency: number;
  maxLatency: number;
  minLatency: number;
  connectionUptime: number;
}

export class GeckosNetworkManager {
  private channel: ClientChannel | null = null;
  private config: NetworkConfig;
  private geckosConfig: GeckosConfig;
  private reconnectAttempts = 0;
  private inputSequence = 0;
  private lastProcessedInput = 0;
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private shouldReconnect = true;
  private connectionAttemptTimeout: NodeJS.Timeout | null = null;
  private clientId: string | null = null;
  private latency = 0;
  private lastPingTime = 0;
  private deserializer: GameStateDeserializer;

  // Enhanced monitoring
  private connectionQuality: ConnectionQuality = {
    latency: 0,
    jitter: 0,
    packetLoss: 0,
    connectionStrength: 'poor'
  };
  private networkStats: NetworkStats = {
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    avgLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
    connectionUptime: 0
  };
  private latencyHistory: number[] = [];
  private maxLatencyHistory = 20; // Keep last 20 latency measurements
  private connectionStartTime = 0;
  private qualityCheckInterval: NodeJS.Timeout | null = null;
  private clientPingInterval: NodeJS.Timeout | null = null;

  constructor(config: NetworkConfig, geckosConfig: GeckosConfig = defaultGeckosConfig) {
    console.log("Creating new GeckosNetworkManager instance");
    this.config = config;
    this.geckosConfig = geckosConfig;
    this.deserializer = new GameStateDeserializer();
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
    if (this.isConnected() || this.isConnecting) {
      console.log("Connection already exists or is in progress");
      return;
    }

    if (!this.shouldReconnect) {
      console.log("Connection attempts disabled");
      return;
    }

    console.log("Connecting to Geckos.io server...");
    this.isConnecting = true;

    // Clear any existing connection attempt timeout
    if (this.connectionAttemptTimeout) {
      clearTimeout(this.connectionAttemptTimeout);
    }

    try {
      if (this.channel) {
        this.channel.close();
        this.channel = null;
      }

      // Create Geckos.io client
      this.channel = geckos({
        port: this.config.port,
        iceServers: this.config.iceServers || this.geckosConfig.server.iceServers
      });

      this.setupGeckosChannel();

      // Set a timeout for the connection attempt
      this.connectionAttemptTimeout = setTimeout(() => {
        if (!this.isConnected()) {
          console.log("Geckos.io connection attempt timed out");
          this.channel?.close();
          this.isConnecting = false;
          this.scheduleReconnect();
        }
      }, 10000); // 10 second timeout for WebRTC
    } catch (error) {
      console.error("Failed to connect to Geckos.io server:", error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private setupGeckosChannel(): void {
    if (!this.channel) return;

    this.channel.onConnect(() => {
      console.log("Geckos.io connection established (UDP over WebRTC)");
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.connectionStartTime = Date.now();

      // Clear connection attempt timeout
      if (this.connectionAttemptTimeout) {
        clearTimeout(this.connectionAttemptTimeout);
        this.connectionAttemptTimeout = null;
      }

      // Start connection quality monitoring
      this.startQualityMonitoring();

      // Start client-side pinging for additional latency measurements
      this.startClientPinging();

      // Send join message (reliable)
      this.channel?.emit('join', {}, { reliable: true });
    });

    this.channel.onDisconnect(() => {
      console.log("Geckos.io connection closed");
      this.isConnecting = false;

      // Stop monitoring
      this.stopQualityMonitoring();
      this.stopClientPinging();

      // Clear connection attempt timeout
      if (this.connectionAttemptTimeout) {
        clearTimeout(this.connectionAttemptTimeout);
        this.connectionAttemptTimeout = null;
      }

      this.emit("disconnected");

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    // Handle incoming messages
    this.channel.on('welcome', (data: Data) => {
      console.log("Received welcome message from server");
      this.handleWelcome(data);
    });

    this.channel.onRaw((data: RawMessage) => {
      // Track network stats
      this.networkStats.messagesReceived++;
      
      // Handle both binary and JSON formats
      let gameState = null;
      try {
        if (data instanceof ArrayBuffer) {
          // Binary format - deserialize
          this.networkStats.bytesReceived += data.byteLength;
          gameState = this.deserializer.deserializeGameState(data);
          console.log('deserializeGameState', gameState);
        } else {
          // Fallback JSON format
          const jsonSize = JSON.stringify(data).length;
          this.networkStats.bytesReceived += jsonSize;
          gameState = data;
        }
        
        // Only emit if deserialization was successful and gameState is valid
        if (gameState && gameState.entities) {
          this.emit("gameState", gameState);
        } else if (gameState === null) {
          // Old message or failed deserialization - skip silently
          return;
        } else {
          console.warn('Received gameState without entities:', gameState);
        }
      } catch (error) {
        console.error('Error processing gameState message:', error);
      }
    });

    this.channel.on('playerJoined', (data: Data) => {
      this.emit("playerJoined", data);
    });

    this.channel.on('playerLeft', (data: Data) => {
      this.emit("playerLeft", data);
    });

    this.channel.on('playerJoinedRoom', (data: Data) => {
      this.emit("playerJoinedRoom", data);
    });

    this.channel.on('playerLeftRoom', (data: Data) => {
      this.emit("playerLeftRoom", data);
    });

    this.channel.on('inputAck', (data: Data) => {
      this.handleInputAck(data);
    });

    // Handle ping/pong for latency measurement
    this.channel.on('ping', (data: Data) => {
      // Respond to server ping immediately
      this.channel?.emit('pong', data);
    });

    this.channel.on('pong', (data: Data) => {
      this.handlePong(data);
    });

    // Handle latency messages from server
    this.channel.on('latency', (data: Data) => {
      if (typeof data === 'number') {
        this.latency = data;
        this.updateLatencyStats(this.latency);
      }
    });

    // Note: onDrop is not available in Geckos.io v3 client
    // Message drops will be handled automatically by the library
  }

  private handleWelcome(data: any): void {
    this.clientId = data.clientId;
    console.log(`Connected with client ID: ${this.clientId}`);
    this.emit("connected", { clientId: this.clientId });
  }

  private handleInputAck(data: any): void {
    if (data && typeof data.sequence === 'number') {
      this.lastProcessedInput = Math.max(
        this.lastProcessedInput,
        data.sequence
      );
    }
  }

  private handlePong(data: any): void {
    if (typeof data === 'number') {
      this.latency = Date.now() - data;
      this.updateLatencyStats(this.latency);
    }
  }

  private startQualityMonitoring(): void {
    // Start periodic quality assessment
    this.qualityCheckInterval = setInterval(() => {
      this.assessConnectionQuality();
      this.updateNetworkStats();
    }, 5000); // Check every 5 seconds
  }

  private startClientPinging(): void {
    // Start periodic client pings for latency measurement
    this.clientPingInterval = setInterval(() => {
      this.ping();
    }, 3000); // Ping every 3 seconds for good latency monitoring
  }

  private stopQualityMonitoring(): void {
    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval);
      this.qualityCheckInterval = null;
    }
  }

  private stopClientPinging(): void {
    if (this.clientPingInterval) {
      clearInterval(this.clientPingInterval);
      this.clientPingInterval = null;
    }
  }

  private updateLatencyStats(latency: number): void {
    // Update latency history
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > this.maxLatencyHistory) {
      this.latencyHistory.shift();
    }

    // Update network stats
    this.networkStats.minLatency = Math.min(this.networkStats.minLatency, latency);
    this.networkStats.maxLatency = Math.max(this.networkStats.maxLatency, latency);
    
    if (this.latencyHistory.length > 0) {
      this.networkStats.avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    }
  }

  private assessConnectionQuality(): void {
    if (this.latencyHistory.length < 3) return; // Need some data first

    // Calculate jitter (latency variance)
    const avgLatency = this.networkStats.avgLatency;
    const jitter = Math.sqrt(
      this.latencyHistory.reduce((sum, lat) => sum + Math.pow(lat - avgLatency, 2), 0) / this.latencyHistory.length
    );

    // Update connection quality
    this.connectionQuality.latency = avgLatency;
    this.connectionQuality.jitter = jitter;

    // Determine connection strength based on latency and jitter
    if (avgLatency < 50 && jitter < 10) {
      this.connectionQuality.connectionStrength = 'excellent';
    } else if (avgLatency < 100 && jitter < 20) {
      this.connectionQuality.connectionStrength = 'good';
    } else if (avgLatency < 200 && jitter < 40) {
      this.connectionQuality.connectionStrength = 'fair';
    } else {
      this.connectionQuality.connectionStrength = 'poor';
    }

    // Emit quality update
    this.emit("connectionQuality", this.connectionQuality);

    // Auto-adjust settings based on quality
    this.autoAdjustSettings();
  }

  private autoAdjustSettings(): void {
    // Just emit quality status without interpolation recommendations
    this.emit("connectionQuality", this.connectionQuality);
  }

  private updateNetworkStats(): void {
    if (this.connectionStartTime > 0) {
      this.networkStats.connectionUptime = Date.now() - this.connectionStartTime;
    }
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
      `Scheduling Geckos.io reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`
    );

    this.reconnectTimeout = setTimeout(() => {
      if (
        !this.isConnecting &&
        !this.isConnected() &&
        this.shouldReconnect
      ) {
        console.log(`Attempting to reconnect to Geckos.io (${this.reconnectAttempts})`);
        this.connect();
      }
    }, this.config.reconnectInterval);
  }

  public sendInput(input: ClientInput): void {
    if (!this.isConnected()) {
      return;
    }

    const inputMessage = {
      sequence: this.inputSequence++,
      timestamp: Date.now(),
      ...input,
    };

    // Send input as unreliable for performance (frequent updates)
    this.channel?.emit('input', inputMessage);
    
    // Track network stats
    this.networkStats.messagesSent++;
    this.networkStats.bytesSent += JSON.stringify(inputMessage).length;
  }

  public sendReliableMessage(event: string, data: any): void {
    if (this.isConnected()) {
      this.channel?.emit(event, data, { reliable: true });
    }
  }

  public sendUnreliableMessage(event: string, data: any): void {
    if (this.isConnected()) {
      this.channel?.emit(event, data);
    }
  }

  public joinRoom(roomId: string): void {
    if (this.isConnected()) {
      this.sendReliableMessage('joinRoom', { roomId });
    }
  }

  public leaveRoom(): void {
    if (this.isConnected()) {
      this.sendReliableMessage('leaveRoom', {});
    }
  }

  public ping(): void {
    if (this.isConnected()) {
      this.lastPingTime = Date.now();
      this.channel?.emit('ping', this.lastPingTime);
    }
  }

  public getLastProcessedInputSequence(): number {
    return this.lastProcessedInput;
  }

  public isConnected(): boolean {
    return this.channel !== null && this.clientId !== null;
  }

  public getClientId(): string | null {
    return this.clientId;
  }

  public getLatency(): number {
    return this.latency;
  }

  public getConnectionStats(): any {
    return {
      connected: this.isConnected(),
      clientId: this.clientId,
      latency: this.latency,
      reconnectAttempts: this.reconnectAttempts,
      inputSequence: this.inputSequence,
      lastProcessedInput: this.lastProcessedInput,
      quality: this.connectionQuality,
      stats: this.networkStats
    };
  }

  public getConnectionQuality(): ConnectionQuality {
    return { ...this.connectionQuality };
  }

  public getNetworkStats(): NetworkStats {
    return { ...this.networkStats };
  }

  public disconnect(): void {
    console.log("Disconnecting from Geckos.io server");
    this.shouldReconnect = false;
    this.isConnecting = false;

    // Stop monitoring
    this.stopQualityMonitoring();
    this.stopClientPinging();

    // Clear all timeouts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.connectionAttemptTimeout) {
      clearTimeout(this.connectionAttemptTimeout);
      this.connectionAttemptTimeout = null;
    }

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    this.clientId = null;
    this.latency = 0;

    // Reset monitoring data
    this.latencyHistory = [];
    this.connectionStartTime = 0;
    this.connectionQuality = {
      latency: 0,
      jitter: 0,
      packetLoss: 0,
      connectionStrength: 'poor'
    };

    // Clear all event listeners
    this.eventListeners.clear();
  }
} 