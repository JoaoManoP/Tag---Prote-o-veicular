import { io, Socket } from 'socket.io-client';
import type { Position, TrackingSession } from '../types';
import type { ConvoyPosition } from './convoy';
import { webLocalUrl } from './runtimeUrl';

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
    if (this.socket) {
      this.socket.on('position:update', onPosition);
      onState(this.socket.connected ? 'ONLINE' : 'RECONNECTING');
      return this.socket;
    }
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
  joinConvoy(convoyId: string) {
    return this.emit<{ ok: boolean; error?: string }>('convoy:join', { convoyId });
  }
  sendConvoyPosition(position: Position) {
    return this.emit<{ ok: boolean; error?: string }>('convoy:position', {
      latitude: position.latitude,
      longitude: position.longitude,
      heading: position.heading
    });
  }
  sendConvoySignal(signal: 'STOPPED' | 'HELP' | 'LEAVING') {
    return this.emit<{ ok: boolean; error?: string }>('convoy:signal', { signal });
  }
  onConvoyPosition(listener: (position: ConvoyPosition) => void) {
    this.socket?.on('convoy:position', listener);
    return () => this.socket?.off('convoy:position', listener);
  }
  onConvoySignal(listener: (signal: { userId: number; name: string; signal: string }) => void) {
    this.socket?.on('convoy:signal', listener);
    return () => this.socket?.off('convoy:signal', listener);
  }
  private async emit<T = any>(event: string, payload: unknown) {
    const socket = this.socket;
    if (!socket) throw new Error('Sem conexão com o servidor.');
    if (!socket.connected)
      await new Promise<void>((resolve, reject) => {
        const connected = () => {
          clearTimeout(timeout);
          resolve();
        };
        const timeout = setTimeout(() => {
          socket.off('connect', connected);
          reject(new Error('Tempo esgotado ao conectar com o servidor.'));
        }, 12000);
        socket.once('connect', connected);
      });
    return new Promise<T>((resolve, reject) => {
      socket
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
