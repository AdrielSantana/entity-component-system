import WebSocket from "ws";
import { GameLoop } from "../game/GameLoop";
import { NetworkState } from "../ecs/systems/NetworkSyncSystem";

interface Client {
  id: string;
  socket: WebSocket;
  lastPing: number;
}

export class GameServer {
  private wss: WebSocket.Server;
  private clients: Map<string, Client> = new Map();
  private gameLoop: GameLoop;
  private readonly BROADCAST_INTERVAL = 50; // 20 times per second

  constructor(port: number) {
    this.wss = new WebSocket.Server({ port });
    this.gameLoop = new GameLoop();

    this.setupWebSocketServer();
    this.startPingInterval();
    this.startBroadcastInterval();
    this.gameLoop.start();
  }

  private setupWebSocketServer(): void {
    this.wss.on("connection", (socket: WebSocket) => {
      const clientId = this.generateClientId();
      const client: Client = {
        id: clientId,
        socket,
        lastPing: Date.now(),
      };

      this.clients.set(clientId, client);
      console.log(`Client ${clientId} connected`);

      // Send welcome message with client ID
      socket.send(
        JSON.stringify({
          type: "welcome",
          data: { clientId },
        })
      );

      // Send initial game state
      this.sendGameState(client);

      socket.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(client, message);
        } catch (error) {
          console.error("Error parsing client message:", error);
        }
      });

      socket.on("close", () => {
        console.log(`Client ${clientId} disconnected`);
        // Remove client's entity from the game
        this.gameLoop.removePlayerEntity(clientId);
        // Remove client from connected clients list
        this.clients.delete(clientId);
        // Notify other clients about the disconnection
        this.sendToAllExcept(clientId, {
          type: "playerLeft",
          data: { clientId },
        });
      });

      socket.on("pong", () => {
        if (this.clients.has(clientId)) {
          const client = this.clients.get(clientId);
          if (client) {
            client.lastPing = Date.now();
          }
        }
      });
    });
  }

  private generateClientId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private startPingInterval(): void {
    setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client, id) => {
        if (now - client.lastPing > 30000) {
          // 30 seconds timeout
          console.log(`Client ${id} timed out`);
          client.socket.terminate();
          this.clients.delete(id);
        } else {
          client.socket.ping();
        }
      });
    }, 10000); // Check every 10 seconds
  }

  private startBroadcastInterval(): void {
    setInterval(() => {
      this.broadcastGameState();
    }, this.BROADCAST_INTERVAL);
  }

  private handleClientMessage(client: Client, message: any): void {
    switch (message.type) {
      case "input":
        this.gameLoop.handleClientInput(client.id, message.data);
        break;

      case "join":
        // Handle player joining the game
        this.sendToAllExcept(client.id, {
          type: "playerJoined",
          data: { clientId: client.id },
        });
        this.gameLoop.createPlayerEntity(client.id);
        break;

      default:
        console.warn("Unknown message type:", message.type);
    }
  }

  private sendGameState(client: Client): void {
    const gameState = this.gameLoop.getNetworkState();
    client.socket.send(
      JSON.stringify({
        type: "gameState",
        data: gameState,
      })
    );
  }

  private broadcastGameState(): void {
    const gameState = this.gameLoop.getNetworkState();
    this.broadcast({
      type: "gameState",
      data: gameState,
    });
  }

  private broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(data);
      }
    });
  }

  private sendToAllExcept(excludeClientId: string, message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (
        client.id !== excludeClientId &&
        client.socket.readyState === WebSocket.OPEN
      ) {
        client.socket.send(data);
      }
    });
  }

  public cleanup(): void {
    // Stop the game loop
    this.gameLoop.cleanup();

    // Close all client connections
    this.clients.forEach((client) => {
      client.socket.terminate();
    });
    this.clients.clear();

    // Close the WebSocket server
    this.wss.close();
  }
}
