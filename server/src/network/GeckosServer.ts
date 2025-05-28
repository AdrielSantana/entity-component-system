import geckos, { ServerChannel, Data } from '@geckos.io/server';
import { GameLoop } from '../game/GameLoop.js';
import express from 'express';
import http from 'http';
import { GameStateSerializer } from './GameStateSerializer.js';
import { GeckosConfig, defaultGeckosConfig } from '../geckos.config.js';

interface GeckosClient {
  id: string;
  channel: ServerChannel;
  lastPing: number;
}

export class GeckosGameServer {
  private io: any;
  private gameLoop: GameLoop;
  private clients: Map<string, GeckosClient> = new Map();
  private gameStateInterval: NodeJS.Timeout | null = null;
  private pingIntervalId: NodeJS.Timeout | null = null;
  private geckosConfig: GeckosConfig;
  private serializer: GameStateSerializer;

  // Performance monitoring
  private lastStatsUpdate = 0;
  private messagesSent = 0;
  private messagesReceived = 0;

  constructor(config: GeckosConfig = defaultGeckosConfig) {
    this.geckosConfig = config;
    this.gameLoop = new GameLoop();
    this.serializer = new GameStateSerializer();
    
    // Initialize Geckos.io server
    this.io = geckos({
      iceServers: config.server.iceServers
    });

    this.setupGeckosServer();
    this.startGameStateUpdates();
    this.startPingInterval();
    this.startHealthEndpoint();
  }

  private setupGeckosServer(): void {
    this.io.onConnection((channel: ServerChannel) => {
      const clientId = this.generateClientId();
      const client: GeckosClient = {
        id: clientId,
        channel,
        lastPing: Date.now(),
      };

      this.clients.set(clientId, client);
      console.log(`Client ${clientId} connected via Geckos.io (UDP/WebRTC)`);

      // Send welcome message with client ID (reliable message for critical info)
      channel.emit('welcome', { clientId }, { reliable: true });

      // Send initial game state
      this.sendGameState(client);

      // Handle incoming messages
      channel.on('input', (data: Data) => {
        this.handleClientInput(client, data);
      });

      channel.on('join', (data: Data) => {
        this.handleClientJoin(client, data);
      });

      channel.on('joinRoom', (data: Data) => {
        this.handleRoomJoin(client, data);
      });

      channel.on('leaveRoom', () => {
        this.handleRoomLeave(client);
      });

      // Handle channel events
      channel.onDisconnect(() => {
        console.log(`Client ${clientId} disconnected`);
        this.handleClientDisconnect(client);
      });

      // Handle connection drops
      channel.onDrop((drop: any) => {
        console.warn(`Message dropped for client ${clientId}:`, drop);
      });

      // Handle pong responses for latency measurement
      channel.on('pong', (data: Data) => {
        if (this.clients.has(clientId)) {
          const client = this.clients.get(clientId)!;
          client.lastPing = Date.now();
          
          // Calculate latency (data should be the original timestamp from ping)
          const timestamp = typeof data === 'number' ? data : Date.now();
          const latency = Date.now() - timestamp;
          
          // Send latency back to client for monitoring
          channel.emit('latency', latency, { reliable: false }); // Use unreliable for frequent updates
          
          if (Math.random() < 0.1) { // Log 10% of latency measurements to avoid spam
            console.log(`Client ${clientId} latency: ${latency}ms`);
          }
        }
      });

      // Handle client pings
      channel.on('ping', (data: Data) => {
        // Respond to client ping immediately
        channel.emit('pong', data, { reliable: false });
      });
    });

    this.io.listen(this.geckosConfig.server.port);
    console.log(`🦎 Geckos.io server listening on port ${this.geckosConfig.server.port} (UDP over WebRTC)`);
  }

  private generateClientId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private handleClientInput(client: GeckosClient, data: any): void {
    try {
      // Log input less frequently to reduce console spam
      if (Math.random() < 0.001) { // Log ~0.1% of inputs
        console.log(`Received input from client ${client.id}:`, data);
      }
      this.gameLoop.handleClientInput(client.id, data);
    } catch (error) {
      console.error(`Error handling input for client ${client.id}:`, error);
    }
  }

  private handleClientJoin(client: GeckosClient, data: any): void {
    try {
      console.log(`Client ${client.id} joined the game`);
      // Notify other clients about the new player
      this.broadcastMessage('playerJoined', { clientId: client.id });
    } catch (error) {
      console.error(`Error handling join for client ${client.id}:`, error);
    }
  }

  private handleRoomJoin(client: GeckosClient, data: any): void {
    try {
      console.log(`Client ${client.id} joined room:`, data.roomId);
      // Implement room logic here
      this.broadcastMessage('playerJoinedRoom', {
        clientId: client.id,
        roomId: data.roomId,
      });
    } catch (error) {
      console.error(`Error handling room join for client ${client.id}:`, error);
    }
  }

  private handleRoomLeave(client: GeckosClient): void {
    try {
      console.log(`Client ${client.id} left room`);
      this.broadcastMessage('playerLeftRoom', { clientId: client.id });
    } catch (error) {
      console.error(`Error handling room leave for client ${client.id}:`, error);
    }
  }

  private handleClientDisconnect(client: GeckosClient): void {
    try {
      // Remove player entity from game
      this.gameLoop.removePlayerEntity(client.id);

      // Remove client from our tracking
      this.clients.delete(client.id);

      // Notify other clients about the disconnection
      this.broadcastMessage('playerLeft', { clientId: client.id });

      console.log(`Client ${client.id} fully disconnected and cleaned up`);
    } catch (error) {
      console.error(`Error handling disconnect for client ${client.id}:`, error);
    }
  }

  private broadcastMessage(event: string, data: any): void {
    this.clients.forEach((client) => {
      try {
        client.channel.emit(event, data, { reliable: true });
        this.messagesSent++;
      } catch (error) {
        console.error(`Error sending ${event} to client ${client.id}:`, error);
      }
    });
  }

  private sendGameState(client?: GeckosClient): void {
    try {
      const gameState = this.gameLoop.getNetworkState();
      console.log('gameState', gameState);

      // Serialize game state to binary format
      const binaryGameState = this.serializer.serializeGameState(gameState);

      if (client) {
        // Send to specific client
        client.channel.raw.emit(binaryGameState);
        this.messagesSent++;
      } else {
        // Broadcast to all clients
        this.clients.forEach((c) => {
          try {
            c.channel.raw.emit(binaryGameState);
            this.messagesSent++;
          } catch (error) {
            console.error(`Error sending game state to client ${c.id}:`, error);
          }
        });
      }
    } catch (error) {
      console.error('Error in sendGameState:', error);
    }
  }

  private startGameStateUpdates(): void {
    const updateRate = 1000 / this.geckosConfig.game.tickRate;
    this.gameStateInterval = setInterval(() => {
      if (this.clients.size > 0) {
        this.sendGameState();
      }
    }, updateRate);

    console.log(`Game state updates started at ${this.geckosConfig.game.tickRate} Hz`);
  }

  private startPingInterval(): void {
    this.pingIntervalId = setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client, id) => {
        if (now - client.lastPing > 30000) {
          // 30 seconds timeout
          console.log(`Client ${id} timed out`);
          client.channel.close();
          this.clients.delete(id);
        } else {
          // Send ping with timestamp for latency calculation
          client.channel.emit('ping', now);
        }
      });
    }, 2000); // Check every 2 seconds for better responsiveness
  }

  private startHealthEndpoint(): void {
    // Create Express app for health checks
    const app = express();
    const server = http.createServer(app);

    app.get('/health', (req, res) => {
      const stats = {
        status: 'healthy',
        clients: this.clients.size,
        gameLoopRunning: true,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        messagesSent: this.messagesSent,
        messagesReceived: this.messagesReceived,
        compressionStats: this.serializer.getCompressionStats(),
        gameMetrics: this.gameLoop.getPerformanceMetrics(),
      };
      res.json(stats);
    });

    const healthPort = 3000;
    server.listen(healthPort, () => {
      console.log(`📊 Health endpoint available at http://localhost:${healthPort}/health`);
    });
  }

  public start(): void {
    console.log('🚀 Starting Geckos.io game server...');
    this.gameLoop.start();
    console.log('✅ Game server started successfully');
  }

  public stop(): void {
    console.log('🛑 Stopping Geckos.io game server...');

    if (this.gameStateInterval) {
      clearInterval(this.gameStateInterval);
      this.gameStateInterval = null;
    }

    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }

    this.gameLoop.stop();

    this.clients.forEach((client) => {
      client.channel.close();
    });
    this.clients.clear();

    // Note: Geckos.io server cleanup is handled automatically
    console.log('✅ Game server stopped');
  }

  public getStats() {
    return {
      connectedClients: this.clients.size,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      compressionStats: this.serializer.getCompressionStats(),
      gameMetrics: this.gameLoop.getPerformanceMetrics(),
    };
  }
} 