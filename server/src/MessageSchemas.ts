import { BufferSchema, Model } from '@geckos.io/typed-array-buffer-schema';
import { 
  uint8, int16, uint16, uint32, 
  string8 
} from '@geckos.io/typed-array-buffer-schema';

// Flattened entity schema - avoid nested objects in arrays
const entitySchema = BufferSchema.schema('entity', {
  // Network ID as string (max 40 characters for UUIDs)
  networkId: { type: string8, length: 40 },
  
  // Component flags to indicate which components have valid data
  componentFlags: uint8,
  
  // Transform component fields (flattened)
  positionX: { type: int16, digits: 2 },
  positionY: { type: int16, digits: 2 },
  positionZ: { type: int16, digits: 2 },
  rotationX: { type: int16, digits: 3 },
  rotationY: { type: int16, digits: 3 },
  rotationZ: { type: int16, digits: 3 },
  rotationW: { type: int16, digits: 3 },
  scaleX: { type: int16, digits: 2 },
  scaleY: { type: int16, digits: 2 },
  scaleZ: { type: int16, digits: 2 },
  
  // Physics component fields (flattened)
  velocityX: { type: int16, digits: 2 },
  velocityY: { type: int16, digits: 2 },
  velocityZ: { type: int16, digits: 2 },
  physicsFlags: uint8,
  
  // Render component fields (flattened)
  colorR: uint8,
  colorG: uint8,
  colorB: uint8,
  meshScale: { type: uint16, digits: 2 },
  
  // Network component fields (flattened)
  authorityType: uint8,
  lastUpdateSequence: uint32
});

// Game state schema
const gameStateSchema = BufferSchema.schema('gameState', {
  // Use relative timestamp (seconds since server start) to fit in uint32
  timestampDelta: uint32,
  
  // Sequence number for ordering
  sequence: uint32,
  
  // Number of entities (for efficient array parsing)
  entityCount: uint16,
  
  // Entities array
  entities: [entitySchema]
});

// Input message schema
const inputSchema = BufferSchema.schema('input', {
  // Input sequence number
  sequenceNumber: uint32,
  
  // Use relative timestamp
  timestampDelta: uint32,
  
  // Movement velocity with 3 decimal precision (-32.768 to 32.767)
  velocityX: { type: int16, digits: 3 },
  velocityZ: { type: int16, digits: 3 },
  
  // Rotation with 3 decimal precision
  rotation: { type: int16, digits: 3 },
  
  // Input flags packed into single byte
  inputFlags: uint8 // bit 0: jump, bit 1: sprint, bit 2: crouch, etc.
});

// Welcome message schema
const welcomeSchema = BufferSchema.schema('welcome', {
  clientId: { type: string8, length: 20 },
  serverInfo: { type: string8, length: 32 }
});

// Connection stats schema (for debugging/monitoring)
const connectionStatsSchema = BufferSchema.schema('connectionStats', {
  latency: uint16,
  packetsReceived: uint32,
  packetsSent: uint32,
  bytesReceived: uint32,
  bytesSent: uint32
});

// Create models for efficient serialization/deserialization with much larger buffers
export const GameStateModel = new Model(gameStateSchema, 512); // Much larger buffer (512KB) for many entities
export const InputModel = new Model(inputSchema, 4); 
export const WelcomeModel = new Model(welcomeSchema, 4);
export const ConnectionStatsModel = new Model(connectionStatsSchema, 4);

// Utility functions for component flags
export const ComponentFlags = {
  TRANSFORM: 1 << 0,  // bit 0
  PHYSICS: 1 << 1,    // bit 1  
  RENDER: 1 << 2,     // bit 2
  NETWORK: 1 << 3     // bit 3
};

export const InputFlags = {
  JUMP: 1 << 0,       // bit 0
  SPRINT: 1 << 1,     // bit 1
  CROUCH: 1 << 2      // bit 2
};

export const PhysicsFlags = {
  IS_STATIC: 1 << 0,     // bit 0
  USE_GRAVITY: 1 << 1,   // bit 1
  IS_GROUNDED: 1 << 2    // bit 2
};

// Helper function to convert hex color to RGB
export function hexToRgb(hex: string): { r: number, g: number, b: number } {
  const cleanHex = hex.replace('#', '');
  const num = parseInt(cleanHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

// Helper function to convert RGB to hex color
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Helper functions for working with compressed data
export class MessageCompression {
  
  // Convert RGB hex color to separate R,G,B bytes
  static hexToRGB(hex: number): { r: number; g: number; b: number } {
    return {
      r: (hex >> 16) & 0xFF,
      g: (hex >> 8) & 0xFF,
      b: hex & 0xFF
    };
  }

  // Convert R,G,B bytes back to hex color
  static rgbToHex(r: number, g: number, b: number): number {
    return (r << 16) | (g << 8) | b;
  }

  // Pack component flags based on which components exist
  static packComponentFlags(entity: any): number {
    let flags = 0;
    if (entity.transform) flags |= ComponentFlags.TRANSFORM;
    if (entity.physics) flags |= ComponentFlags.PHYSICS;
    if (entity.render) flags |= ComponentFlags.RENDER;
    if (entity.network) flags |= ComponentFlags.NETWORK;
    return flags;
  }

  // Pack input flags based on input state
  static packInputFlags(input: any): number {
    let flags = 0;
    if (input.jump) flags |= InputFlags.JUMP;
    if (input.sprint) flags |= InputFlags.SPRINT;
    if (input.crouch) flags |= InputFlags.CROUCH;
    return flags;
  }

  // Pack physics flags based on physics properties
  static packPhysicsFlags(physics: any): number {
    let flags = 0;
    if (physics.isStatic) flags |= PhysicsFlags.IS_STATIC;
    if (physics.useGravity) flags |= PhysicsFlags.USE_GRAVITY;
    if (physics.isGrounded) flags |= PhysicsFlags.IS_GROUNDED;
    return flags;
  }

  // Unpack input flags back to input object
  static unpackInputFlags(flags: number): any {
    return {
      jump: !!(flags & InputFlags.JUMP),
      sprint: !!(flags & InputFlags.SPRINT),
      crouch: !!(flags & InputFlags.CROUCH)
    };
  }

  // Unpack physics flags back to physics object
  static unpackPhysicsFlags(flags: number): any {
    return {
      isStatic: !!(flags & PhysicsFlags.IS_STATIC),
      useGravity: !!(flags & PhysicsFlags.USE_GRAVITY),
      isGrounded: !!(flags & PhysicsFlags.IS_GROUNDED)
    };
  }

  // Convert entity to compressed format
  static compressEntity(entity: any): any {
    const compressed: any = {
      networkId: entity.networkId || '',
      componentFlags: this.packComponentFlags(entity)
    };

    // Add components based on flags
    if (entity.transform) {
      compressed.transform = {
        positionX: entity.transform.position?.x || 0,
        positionY: entity.transform.position?.y || 0,
        positionZ: entity.transform.position?.z || 0,
        rotationX: entity.transform.rotation?.x || 0,
        rotationY: entity.transform.rotation?.y || 0,
        rotationZ: entity.transform.rotation?.z || 0,
        rotationW: entity.transform.rotation?.w || 1,
        scaleX: entity.transform.scale?.x || 1,
        scaleY: entity.transform.scale?.y || 1,
        scaleZ: entity.transform.scale?.z || 1
      };
    }

    if (entity.physics) {
      compressed.physics = {
        velocityX: entity.physics.velocity?.x || 0,
        velocityY: entity.physics.velocity?.y || 0,
        velocityZ: entity.physics.velocity?.z || 0,
        flags: this.packPhysicsFlags(entity.physics)
      };
    }

    if (entity.render) {
      const color = entity.render.material?.color || '#ffffff';
      const rgb = this.hexToRGB(typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color);
      compressed.render = {
        colorR: rgb.r,
        colorG: rgb.g,
        colorB: rgb.b,
        meshScale: entity.render.mesh?.scale || 1
      };
    }

    if (entity.network) {
      compressed.network = {
        authorityType: entity.network.authorityType === 'client' ? 1 : entity.network.authorityType === 'shared' ? 2 : 0,
        lastUpdateSequence: entity.network.lastUpdateSequence || 0
      };
    }

    return compressed;
  }

  // Convert compressed entity back to normal format
  static decompressEntity(compressed: any): any {
    const entity: any = {
      networkId: compressed.networkId
    };

    const flags = compressed.componentFlags;

    if (flags & ComponentFlags.TRANSFORM && compressed.transform) {
      entity.transform = {
        position: {
          x: compressed.transform.positionX,
          y: compressed.transform.positionY,
          z: compressed.transform.positionZ
        },
        rotation: {
          x: compressed.transform.rotationX,
          y: compressed.transform.rotationY,
          z: compressed.transform.rotationZ,
          w: compressed.transform.rotationW
        },
        scale: {
          x: compressed.transform.scaleX,
          y: compressed.transform.scaleY,
          z: compressed.transform.scaleZ
        }
      };
    }

    if (flags & ComponentFlags.PHYSICS && compressed.physics) {
      const physicsFlags = this.unpackPhysicsFlags(compressed.physics.flags);
      entity.physics = {
        velocity: {
          x: compressed.physics.velocityX,
          y: compressed.physics.velocityY,
          z: compressed.physics.velocityZ
        },
        ...physicsFlags
      };
    }

    if (flags & ComponentFlags.RENDER && compressed.render) {
      const color = this.rgbToHex(
        compressed.render.colorR,
        compressed.render.colorG,
        compressed.render.colorB
      );
      entity.render = {
        material: {
          color: '#' + color.toString(16).padStart(6, '0')
        },
        mesh: {
          scale: compressed.render.meshScale
        }
      };
    }

    if (flags & ComponentFlags.NETWORK && compressed.network) {
      entity.network = {
        authorityType: compressed.network.authorityType === 1 ? 'client' : compressed.network.authorityType === 2 ? 'shared' : 'server',
        lastUpdateSequence: compressed.network.lastUpdateSequence
      };
    }

    return entity;
  }
} 