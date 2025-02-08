import express from "express";
import cors from "cors";
import helmet from "helmet";
import { GameServer } from "./network/WebSocketServer";

const app = express();
const wsPort = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8888;

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// HTTP routes
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Start WebSocket game server
const gameServer = new GameServer(wsPort);
console.log(`WebSocket game server listening on port ${wsPort}`);

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing servers");
  gameServer.cleanup();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing servers");
  gameServer.cleanup();
  process.exit(0);
});
