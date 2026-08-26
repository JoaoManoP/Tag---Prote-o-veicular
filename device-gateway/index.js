'use strict';

const net = require('node:net');
const { DeviceConnectionManager } = require('./connection-manager');

const HOST = process.env.TRACKER_GATEWAY_HOST || '127.0.0.1';
const PORT = Number(process.env.TRACKER_TCP_PORT || 5023);
const manager = new DeviceConnectionManager({ maxBufferBytes: Number(process.env.TRACKER_MAX_CONNECTION_BUFFER_BYTES || 65536), idleTimeoutMs: Number(process.env.TRACKER_IDLE_TIMEOUT_MS || 180000) });

const server = net.createServer(socket => {
  manager.register(socket);
  socket.on('data', chunk => manager.handleData(socket, chunk));
  socket.on('timeout', () => socket.destroy());
  socket.on('error', error => manager.logger.warn?.('[TRACKER SOCKET ERROR]', { message: error.message }));
  socket.on('close', () => manager.remove(socket));
});

server.on('error', error => { console.error('[TRACKER GATEWAY ERROR]', error); process.exitCode = 1; });
server.listen(PORT, HOST, () => console.log(`[TRACKER GATEWAY] listening on ${HOST}:${PORT}`));

function shutdown(signal) { console.log(`[TRACKER GATEWAY] ${signal}`); server.close(() => process.exit(0)); for (const socket of manager.connections.keys()) socket.destroy(); }
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { server, manager };
