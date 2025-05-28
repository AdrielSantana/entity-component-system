import { GameStateModel } from '../MessageSchemas.js';

export class GameStateDeserializer {
  private lastSequence = -1;
  private connectionStartTime = Date.now(); // Record when connection started

  public deserializeGameState(buffer: ArrayBuffer): any | null {
    console.log('🔍 Deserializing buffer size:', buffer.byteLength);
    
    try {
      // Deserialize from binary format
      const compressedState = GameStateModel.fromBuffer(buffer);
      
      console.log('🔍 Compressed state entityCount:', compressedState.entityCount, 'actual entities:', compressedState.entities?.length);
      console.log('🔍 First few entities:', compressedState.entities?.slice(0, 3));
      
      // Validate sequence number to prevent processing old messages
      if (compressedState.sequence <= this.lastSequence) {
        console.log(`⏭️ Skipping old message (seq: ${compressedState.sequence}, last: ${this.lastSequence})`);
        return null;
      }
      
      this.lastSequence = compressedState.sequence;
      
      // Convert relative timestamp back to absolute timestamp
      const timestamp = this.connectionStartTime + (compressedState.timestampDelta * 1000);
      
      // Decompress entities
      const entities = compressedState.entities.map((compressedEntity: any) => {
        return this.decompressEntity(compressedEntity);
      });
      
      console.log('📦 Decompressed entities count:', entities.length);
      
      const gameState = {
        timestamp,
        sequence: compressedState.sequence,
        entities
      };
      
      // Log decompression stats occasionally
      if (compressedState.sequence % 100 === 0) {
        const binarySize = buffer.byteLength;
        const jsonSize = JSON.stringify(gameState).length;
        const savings = ((binarySize / jsonSize) * 100).toFixed(1);
        console.log(`📦 Decompression: Binary ${binarySize}B → JSON ${jsonSize}B (${savings}% of original)`);
      }
      
      return gameState;
    } catch (error) {
      console.error('❌ Failed to deserialize game state:', error);
      console.log('🔍 Buffer that failed (first 100 bytes):', new Uint8Array(buffer.slice(0, 100)));
      return null;
    }
  }

  private decompressEntity(compressed: any): any {
    const entity: any = {
      networkId: compressed.networkId.trim()
    };

    // Transform component - reconstruct from flattened properties
    entity.transform = {
      position: {
        x: compressed.positionX || 0,
        y: compressed.positionY || 0,
        z: compressed.positionZ || 0
      },
      rotation: {
        x: compressed.rotationX || 0,
        y: compressed.rotationY || 0,
        z: compressed.rotationZ || 0,
        w: compressed.rotationW || 1
      },
      scale: {
        x: compressed.scaleX || 1,
        y: compressed.scaleY || 1,
        z: compressed.scaleZ || 1
      }
    };

    // Physics component - reconstruct from flattened properties
    const physicsFlags = compressed.physicsFlags || 0;
    entity.physics = {
      velocity: {
        x: compressed.velocityX || 0,
        y: compressed.velocityY || 0,
        z: compressed.velocityZ || 0
      },
      isStatic: !!(physicsFlags & 1), // PhysicsFlags.IS_STATIC
      useGravity: !!(physicsFlags & 2), // PhysicsFlags.USE_GRAVITY
      isGrounded: !!(physicsFlags & 4) // PhysicsFlags.IS_GROUNDED
    };

    // Render component - reconstruct from flattened properties
    const color = this.rgbToHex(
      compressed.colorR || 255,
      compressed.colorG || 255,
      compressed.colorB || 255
    );
    entity.render = {
      material: {
        color: '#' + color.toString(16).padStart(6, '0')
      },
      mesh: {
        scale: compressed.meshScale || 1
      }
    };

    // Network component - reconstruct from flattened properties
    const authorityMap = ['server', 'client', 'shared'];
    entity.network = {
      authorityType: authorityMap[compressed.authorityType] || 'server',
      lastUpdateSequence: compressed.lastUpdateSequence || 0
    };

    return entity;
  }

  private rgbToHex(r: number, g: number, b: number): number {
    return (r << 16) | (g << 8) | b;
  }

  public getLastSequence(): number {
    return this.lastSequence;
  }

  public resetSequence(): void {
    this.lastSequence = -1;
  }
} 