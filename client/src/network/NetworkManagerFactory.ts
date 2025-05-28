import { NetworkManager } from './NetworkManager';
import { GeckosNetworkManager } from './GeckosNetworkManager';
import { defaultGeckosConfig } from '../geckos.config';

interface NetworkConfig {
  serverUrl: string;
  port?: number;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  useGeckos?: boolean;
  iceServers?: RTCIceServer[];
}

export type INetworkManager = NetworkManager | GeckosNetworkManager;

export class NetworkManagerFactory {
  static create(config: NetworkConfig): INetworkManager {
    if (config.useGeckos) {
      console.log("Creating Geckos.io (UDP over WebRTC) network manager");
      
      const geckosConfig = {
        serverUrl: config.serverUrl,
        port: config.port || defaultGeckosConfig.server.port,
        reconnectInterval: config.reconnectInterval,
        maxReconnectAttempts: config.maxReconnectAttempts,
        iceServers: config.iceServers
      };
      
      return new GeckosNetworkManager(geckosConfig);
    } else {
      console.log("Creating WebSocket (TCP) network manager");
      
      const wsConfig = {
        serverUrl: config.serverUrl,
        reconnectInterval: config.reconnectInterval,
        maxReconnectAttempts: config.maxReconnectAttempts
      };
      
      return new NetworkManager(wsConfig);
    }
  }
}

// Export shared interfaces for consistency
export type { ClientInput } from './NetworkManager'; 