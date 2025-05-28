# 3D Multiplayer Game with Entity Component System

A real-time multiplayer 3D game built with TypeScript, React, Three.js, and Geckos.io (UDP over WebRTC), using an Entity Component System architecture.

## Features

- Entity Component System (ECS) architecture
- Real-time multiplayer synchronization with UDP over WebRTC
- Client-side prediction and reconciliation
- Advanced snapshot interpolation with Geckos.io
- Physics simulation
- 3D rendering with Three.js
- High-performance UDP communication via Geckos.io
- Performance monitoring and network quality tracking

## Project Structure

```
.
├── client/             # Frontend React application
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── game/      # Game logic
│   │   └── network/   # Network communication
│   └── ...
└── server/            # Backend Node.js server
    ├── src/
    │   ├── ecs/       # Entity Component System
    │   ├── game/      # Game loop and logic
    │   └── network/   # WebSocket server
    └── ...
```

## Prerequisites

- Node.js >= 16
- npm >= 8

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd game-test
```

2. Install dependencies:

```bash
npm run install:all
```

## Development

Start both client and server in development mode:

```bash
npm run dev
```

Or start them separately:

```bash
npm run dev:client
npm run dev:server
```

## Building for Production

Build both client and server:

```bash
npm run build
```

## Running in Production

Start both client and server:

```bash
npm run start
```

### Network Configuration

The game uses Geckos.io for UDP over WebRTC communication. By default:

- **Signaling Port**: 9208/TCP (for WebRTC peer signaling)
- **Data Port Range**: 1025-65535/UDP (for WebRTC data channels)

For production deployment, ensure your server/firewall allows:
- Port 9208/TCP for signaling traffic
- UDP port range 1025-65535 for WebRTC data channels

### ICE Servers

The game includes default STUN servers for development. For production, consider setting up your own TURN servers for better connectivity across restrictive networks. Configure them in `geckos.config.ts`.

## Architecture

### Entity Component System (ECS)

The game uses an ECS architecture where:

- Entities are unique identifiers that group components
- Components are pure data structures
- Systems contain the logic that operates on entities with specific components

### Network Architecture

- Geckos.io server for real-time UDP over WebRTC communication
- High-performance unordered/unreliable messaging for frequent updates
- Reliable messaging for critical game events
- Client-side prediction for responsive input
- Server reconciliation to correct prediction errors
- Advanced snapshot interpolation for smooth movement
- Authority system to prevent cheating
- Automatic connection quality monitoring and adaptation

### Game Loop

- Fixed timestep for physics updates
- Variable timestep for rendering
- Performance monitoring
- State synchronization

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
