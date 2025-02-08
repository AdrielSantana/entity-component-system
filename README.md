# 3D Multiplayer Game with Entity Component System

A real-time multiplayer 3D game built with TypeScript, React, Three.js, and WebSocket, using an Entity Component System architecture.

## Features

- Entity Component System (ECS) architecture
- Real-time multiplayer synchronization
- Client-side prediction and reconciliation
- State interpolation
- Physics simulation
- 3D rendering with Three.js
- WebSocket communication
- Performance monitoring

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

## Architecture

### Entity Component System (ECS)

The game uses an ECS architecture where:

- Entities are unique identifiers that group components
- Components are pure data structures
- Systems contain the logic that operates on entities with specific components

### Network Architecture

- WebSocket server for real-time communication
- Client-side prediction for responsive input
- Server reconciliation to correct prediction errors
- State interpolation for smooth movement
- Authority system to prevent cheating

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
