import { GeckosGameServer } from './network/GeckosServer.js';

const geckosPort = process.env.GECKOS_PORT ? parseInt(process.env.GECKOS_PORT) : 9208;

console.log('🚀 Starting Entity Component System Game Server');
console.log(`📡 Geckos.io (UDP over WebRTC) port: ${geckosPort}`);

// Create and start the Geckos.io game server
const gameServer = new GeckosGameServer();
gameServer.start(); // Server listens automatically in constructor

console.log('✅ Game server started successfully');

// Set up health endpoint stats
setInterval(() => {
  const stats = gameServer.getStats();
  if (stats.connectedClients > 0) {
    console.log(`📊 Server Status: ${stats.connectedClients} clients connected, ${stats.messagesSent} msgs sent, ${stats.messagesReceived} msgs received`);
  }
}, 30000); // Log every 30 seconds

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  gameServer.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  gameServer.stop();
  process.exit(0);
});

console.log('🎮 Game server is ready for connections!');
