'use strict';

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { ConnectionBuffer } = require('./connection-buffer');

function maskRemote(value) {
  const text = String(value || 'unknown');
  return text.includes(':') ? `${text.split(':')[0]}:*` : text;
}

class DeviceConnectionManager extends EventEmitter {
  constructor({ maxBufferBytes = 65536, idleTimeoutMs = 180000, logger = console } = {}) {
    super();
    this.maxBufferBytes = maxBufferBytes;
    this.idleTimeoutMs = idleTimeoutMs;
    this.logger = logger;
    this.connections = new Map();
  }

  register(socket) {
    const connectionId = crypto.randomUUID();
    const state = { connectionId, socket, buffer: new ConnectionBuffer({ maxBytes: this.maxBufferBytes }), connectedAt: Date.now(), lastPacketAt: null, remote: maskRemote(socket.remoteAddress ? `${socket.remoteAddress}:${socket.remotePort}` : 'unknown'), protocol: null };
    this.connections.set(socket, state);
    socket.setKeepAlive?.(true, 30000);
    socket.setTimeout?.(this.idleTimeoutMs);
    this.logger.info?.('[TRACKER CONNECTED]', { connectionId, remote: state.remote });
    this.emit('connected', this.publicState(state));
    return state;
  }

  handleData(socket, chunk) {
    const state = this.connections.get(socket);
    if (!state) return;
    const result = state.buffer.push(chunk);
    if (result.overflow) {
      this.logger.warn?.('[TRACKER BUFFER OVERFLOW]', { connectionId: state.connectionId, bytes: state.buffer.peek().length, incoming: chunk.length });
      this.emit('buffer_overflow', this.publicState(state));
      socket.destroy();
      return;
    }
    state.lastPacketAt = Date.now();
    const packet = Buffer.from(chunk);
    const event = { ...this.publicState(state), bytes: packet.length, hex: packet.toString('hex').slice(0, this.maxBufferBytes * 2) };
    this.logger.info?.('[TRACKER RX]', event);
    this.emit('data', event);
  }

  remove(socket, reason = 'closed') {
    const state = this.connections.get(socket);
    if (!state) return;
    this.connections.delete(socket);
    this.logger.info?.('[TRACKER DISCONNECTED]', { connectionId: state.connectionId, reason });
    this.emit('disconnected', { ...this.publicState(state), reason });
  }

  publicState(state) { return { connectionId: state.connectionId, remote: state.remote, connectedAt: state.connectedAt, lastPacketAt: state.lastPacketAt, protocol: state.protocol, bufferedBytes: state.buffer.peek().length }; }
}

module.exports = { DeviceConnectionManager, maskRemote };
