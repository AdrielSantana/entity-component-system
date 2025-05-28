import { 
  GameStateModel, 
  ComponentFlags, 
  PhysicsFlags, 
  hexToRgb 
} from '../MessageSchemas.js';

export class GameStateSerializer {
  private sequenceNumber = 0;
  private serverStartTime = Date.now(); // Record server start time

  public serializeGameState(gameState: any): ArrayBuffer {
    // Use relative timestamp (seconds since server start)
    const timestampDelta = Math.floor((Date.now() - this.serverStartTime) / 1000);
    const sequence = this.sequenceNumber++;
    
    // Convert entities to the compressed format
    const compressedEntities = gameState.entities.map((entity: any) => {
      return this.compressEntity(entity);
    });

    const compressedGameState = {
      timestampDelta,
      sequence,
      entityCount: compressedEntities.length,
      entities: compressedEntities
    };

    console.log('compressedGameState', compressedGameState);
    console.log('🔍 Debug: entityCount =', compressedGameState.entityCount, 'actual entities =', compressedGameState.entities.length);
    
    try {
      // Serialize to binary format
      const buffer = GameStateModel.toBuffer(compressedGameState);
      
      console.log('📦 Serialization: Input entities =', compressedGameState.entities.length, 'Buffer size =', buffer.byteLength);
      
      // Log compression stats occasionally
      if (this.sequenceNumber % 100 === 0) {
        const jsonSize = JSON.stringify(gameState).length;
        const binarySize = buffer.byteLength;
        const compression = ((jsonSize - binarySize) / jsonSize * 100).toFixed(1);
        console.log(`📦 Compression: JSON ${jsonSize}B → Binary ${binarySize}B (${compression}% smaller)`);
      }
      
      return buffer;
    } catch (error) {
      console.error('❌ Failed to serialize game state:', error);
      console.log('🔍 Game state that failed:', JSON.stringify(compressedGameState, null, 2));
      // Fallback to JSON if serialization fails
      return new TextEncoder().encode(JSON.stringify(gameState));
    }
  }

  private compressEntity(entity: any): any {
    let componentFlags = 0;
    
    // Start with network ID
    const compressed: any = {
      networkId: entity.networkId || ''
    };

    // Transform component - flatten the properties
    if (entity.transform) {
      componentFlags |= ComponentFlags.TRANSFORM;
      compressed.positionX = Math.round(entity.transform.position.x * 100) / 100;
      compressed.positionY = Math.round(entity.transform.position.y * 100) / 100;
      compressed.positionZ = Math.round(entity.transform.position.z * 100) / 100;
      compressed.rotationX = Math.round(entity.transform.rotation.x * 1000) / 1000;
      compressed.rotationY = Math.round(entity.transform.rotation.y * 1000) / 1000;
      compressed.rotationZ = Math.round(entity.transform.rotation.z * 1000) / 1000;
      compressed.rotationW = Math.round(entity.transform.rotation.w * 1000) / 1000;
      compressed.scaleX = Math.round(entity.transform.scale.x * 100) / 100;
      compressed.scaleY = Math.round(entity.transform.scale.y * 100) / 100;
      compressed.scaleZ = Math.round(entity.transform.scale.z * 100) / 100;
    } else {
      // Default transform values
      compressed.positionX = 0;
      compressed.positionY = 0;
      compressed.positionZ = 0;
      compressed.rotationX = 0;
      compressed.rotationY = 0;
      compressed.rotationZ = 0;
      compressed.rotationW = 1;
      compressed.scaleX = 1;
      compressed.scaleY = 1;
      compressed.scaleZ = 1;
    }

    // Physics component - flatten the properties
    if (entity.physics) {
      componentFlags |= ComponentFlags.PHYSICS;
      
      let physicsFlags = 0;
      if (entity.physics.isStatic) physicsFlags |= PhysicsFlags.IS_STATIC;
      if (entity.physics.useGravity) physicsFlags |= PhysicsFlags.USE_GRAVITY;
      
      compressed.velocityX = Math.round(entity.physics.velocity.x * 100) / 100;
      compressed.velocityY = Math.round(entity.physics.velocity.y * 100) / 100;
      compressed.velocityZ = Math.round(entity.physics.velocity.z * 100) / 100;
      compressed.physicsFlags = physicsFlags;
    } else {
      // Default physics values
      compressed.velocityX = 0;
      compressed.velocityY = 0;
      compressed.velocityZ = 0;
      compressed.physicsFlags = 0;
    }

    // Render component - flatten the properties
    if (entity.render) {
      componentFlags |= ComponentFlags.RENDER;
      
      // Convert color to RGB bytes
      let colorR = 255, colorG = 255, colorB = 255;
      if (entity.render.material?.color) {
        try {
          const rgb = hexToRgb(entity.render.material.color);
          colorR = rgb.r;
          colorG = rgb.g;
          colorB = rgb.b;
        } catch (e) {
          // Keep default white if color parsing fails
        }
      }
      
      compressed.colorR = colorR;
      compressed.colorG = colorG;
      compressed.colorB = colorB;
      compressed.meshScale = Math.round((entity.render.mesh?.scale || 1) * 100) / 100;
    } else {
      // Default render values
      compressed.colorR = 255;
      compressed.colorG = 255;
      compressed.colorB = 255;
      compressed.meshScale = 1;
    }

    // Network component - flatten the properties
    if (entity.network || entity.lastValidatedState) {
      componentFlags |= ComponentFlags.NETWORK;
      compressed.authorityType = this.getAuthorityType(entity);
      compressed.lastUpdateSequence = entity.network?.lastProcessedInput || 0;
    } else {
      // Default network values
      compressed.authorityType = 0; // Server authority
      compressed.lastUpdateSequence = 0;
    }

    // Set component flags
    compressed.componentFlags = componentFlags;
    return compressed;
  }

  private getAuthorityType(entity: any): number {
    // Convert authority type to number
    if (!entity.network) return 0; // Server authority by default
    
    switch (entity.network.authorityType) {
      case 'server': return 0;
      case 'client': return 1;
      case 'shared': return 2;
      default: return 0;
    }
  }

  public getCompressionStats() {
    return {
      sequenceNumber: this.sequenceNumber,
      totalSerialized: this.sequenceNumber
    };
  }
} 