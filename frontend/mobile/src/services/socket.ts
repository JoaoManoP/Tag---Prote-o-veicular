import { io, Socket } from 'socket.io-client';
import type { Position, TrackingSession } from '../types';
function webLocalUrl(configuredUrl: string) {
  if (typeof window === 'undefined') return configuredUrl;
  const browserHost = window.location.hostname;
  if (browserHost !== 'localhost' && browserHost !== '127.0.0.1') return configuredUrl;
  try {
    const url = new URL(configuredUrl);
    url.hostname = browserHost;
    return url.toString().replace(/\/$/, '');
  } catch {
    return configuredUrl;
  }
}

const SOCKET_URL = webLocalUrl(
  (
    process.env.EXPO_PUBLIC_SOCKET_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
);
export class SocketService {
  private socket: Socket | null = null;
  connect(onPosition: (p: Position) => void, onState: (state: string) => void) {
    if (this.socket) return this.socket;
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true
    });
    socket.on('connect', () => onState('ONLINE'));
    socket.on('disconnect', () => onState('OFFLINE'));
    socket.io.on('reconnect_attempt', () => onState('RECONNECTING'));
    socket.on('position:update', onPosition);
    this.socket = socket;
    return socket;
  }
  joinDashboard(sessionId: string) {
    return this.emit<{ ok: boolean; session?: TrackingSession; error?: string }>('session:join', {
      sessionId,
      role: 'dashboard'
    });
  }
  joinTracker(sessionId: string, token: string, deviceId: string) {
    return this.emit<{ ok: boolean; session?: TrackingSession; error?: string }>('session:join', {
      sessionId,
      role: 'mobile',
      token,
      deviceId
    });
  }
  grantConsent(deviceId: string) {
    return this.emit('consent:grant', { deviceId, purpose: 'vehicle-tracking' });
  }
  revokeConsent(deviceId: string) {
    return this.emit('consent:revoke', { deviceId });
  }
  sendPosition(position: Position) {
    return this.emit<{ ok: boolean; accepted?: boolean; error?: string }>(
      'position:update',
      position
    );
  }
  sendBatch(points: Position[], lostAt?: number) {
    return this.emit<{ ok: boolean; confirmedSequences?: number[]; error?: string }>(
      'positions:batch',
      { points, lostAt }
    );
  }
  private emit<T = any>(event: string, payload: unknown) {
    return new Promise<T>((resolve, reject) => {
      if (!this.socket?.connected) return reject(new Error('Sem conexão com o servidor.'));
      this.socket
        .timeout(12000)
        .emit(event, payload, (error: Error | null, result: T) =>
          error ? reject(error) : resolve(result)
        );
    });
  }
  close() {
    this.socket?.disconnect();
    this.socket = null;
  }
}
export const socketService = new SocketService();
