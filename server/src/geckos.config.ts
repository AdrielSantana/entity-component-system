export interface GeckosConfig {
    server: {
      port: number;
      iceServers?: any[];
      maxClients?: number;
      authorization?: boolean;
    };
    game: {
      tickRate: number;
    };
    client?: {
      url?: string;
      port?: number;
      authorization?: boolean;
    };
}
  
export const defaultGeckosConfig: GeckosConfig = {
    server: {
        port: 9208,
        iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
        ]
    },
    game: {
        tickRate: 15
    }
};