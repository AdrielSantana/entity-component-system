export interface NetworkMonitorData {
  connected: boolean;
  clientId: string | null;
  latency: number;
  quality: {
    latency: number;
    jitter: number;
    packetLoss: number;
    connectionStrength: 'excellent' | 'good' | 'fair' | 'poor';
  };
  stats: {
    bytesSent: number;
    bytesReceived: number;
    messagesSent: number;
    messagesReceived: number;
    avgLatency: number;
    maxLatency: number;
    minLatency: number;
    connectionUptime: number;
  };
}

export class NetworkMonitor {
  private container: HTMLElement;
  private isVisible = false;
  private data: NetworkMonitorData | null = null;

  constructor() {
    this.container = this.createMonitorUI();
    document.body.appendChild(this.container);
  }

  private createMonitorUI(): HTMLElement {
    const monitor = document.createElement('div');
    monitor.id = 'network-monitor';
    monitor.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px;
      border-radius: 5px;
      font-family: monospace;
      font-size: 12px;
      z-index: 1000;
      min-width: 250px;
      display: none;
      border: 1px solid #444;
    `;
    
    return monitor;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private getQualityColor(strength: string): string {
    switch (strength) {
      case 'excellent': return '#00ff00';
      case 'good': return '#90ff00';
      case 'fair': return '#ffff00';
      case 'poor': return '#ff4500';
      default: return '#ffffff';
    }
  }

  public updateData(data: NetworkMonitorData): void {
    this.data = data;
    this.render();
  }

  private render(): void {
    if (!this.data || !this.isVisible) return;

    const { connected, clientId, quality, stats } = this.data;
    const qualityColor = this.getQualityColor(quality.connectionStrength);

    this.container.innerHTML = `
      <div style="margin-bottom: 8px; font-weight: bold; color: ${connected ? '#00ff00' : '#ff0000'}">
        📡 Network Monitor
      </div>
      
      <div style="margin-bottom: 6px;">
        <div>Status: <span style="color: ${connected ? '#00ff00' : '#ff0000'}">${connected ? 'Connected' : 'Disconnected'}</span></div>
        ${clientId ? `<div>Client ID: ${clientId.substring(0, 8)}...</div>` : ''}
      </div>

      <div style="margin-bottom: 6px;">
        <div style="color: ${qualityColor}; font-weight: bold;">Quality: ${quality.connectionStrength.toUpperCase()}</div>
        <div>Latency: ${quality.latency.toFixed(1)}ms</div>
        <div>Jitter: ${quality.jitter.toFixed(1)}ms</div>
        <div>Min/Avg/Max: ${stats.minLatency === Infinity ? 'N/A' : stats.minLatency.toFixed(0)}/${stats.avgLatency.toFixed(0)}/${stats.maxLatency.toFixed(0)}ms</div>
      </div>

      <div style="margin-bottom: 6px;">
        <div>📤 Sent: ${stats.messagesSent} msgs (${this.formatBytes(stats.bytesSent)})</div>
        <div>📥 Received: ${stats.messagesReceived} msgs (${this.formatBytes(stats.bytesReceived)})</div>
        <div>⏱️ Uptime: ${this.formatUptime(stats.connectionUptime)}</div>
      </div>

      <div style="font-size: 10px; color: #888; margin-top: 6px;">
        Press F3 to toggle this monitor
      </div>
    `;
  }

  public toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? 'block' : 'none';
    if (this.isVisible) {
      this.render();
    }
  }

  public show(): void {
    this.isVisible = true;
    this.container.style.display = 'block';
    this.render();
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
  }

  public cleanup(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
} 