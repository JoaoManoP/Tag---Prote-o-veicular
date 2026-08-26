'use strict';

const net = require('node:net');

const host = process.env.TRACKER_GATEWAY_HOST || '127.0.0.1';
const port = Number(process.env.TRACKER_TCP_PORT || 5023);
const payloads = [Buffer.from('simulator-login', 'ascii'), Buffer.from('simulator-heartbeat', 'ascii'), Buffer.from('simulator-location', 'ascii')];
const socket = net.createConnection({ host, port }, () => {
  console.log(`[TRACKER SIMULATOR] connected to ${host}:${port}`);
  let index = 0;
  const send = () => { if (index >= payloads.length) return socket.end(); socket.write(payloads[index++]); setTimeout(send, 250); };
  send();
});
socket.on('error', error => { console.error('[TRACKER SIMULATOR ERROR]', error.message); process.exitCode = 1; });
