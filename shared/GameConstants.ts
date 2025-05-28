// Shared Game Constants
// These constants must be identical between client and server for proper prediction

export const GAME_CONSTANTS = {
  PHYSICS: {
    GRAVITY: 9.81,
    MOVE_SPEED: 5,
    JUMP_FORCE: 1,
    MAX_VELOCITY: 10,
    
    // Ground level calculation: Ground at Y=-2, ground height=0.1, player cube height=1
    // So player center should be at Y = -2 + 0.1 + 0.5 = -1.45 when on ground
    GROUND_LEVEL: -1.5,
    GROUND_TOLERANCE: 0.1,
  },
  
  NETWORK: {
    POSITION_TOLERANCE: 0.1, // 10cm tolerance for position reconciliation
    Y_POSITION_TOLERANCE: 0.1, // 5cm tolerance for Y position (more strict)
    PREDICTION_ERROR_THRESHOLD: 0.5, // Threshold for client physics correction
  },
  
  INTERPOLATION: {
    Y_LERP_RATE_STRONG: 0.8, // When position difference is large
    Y_LERP_RATE_NORMAL: 0.5, // Normal Y position correction
    XZ_LERP_RATE: 0.3, // Horizontal movement interpolation
    FALLBACK_LERP_RATE: 0.5, // When falling back to server state
  }
}; 