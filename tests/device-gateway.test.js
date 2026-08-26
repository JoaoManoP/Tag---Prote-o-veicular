const test = require('node:test');
const assert = require('node:assert/strict');
const { ConnectionBuffer } = require('../device-gateway/connection-buffer');
const { DeviceConnectionManager } = require('../device-gateway/connection-manager');

test('ConnectionBuffer recompõe pacotes fragmentados e permite consumo parcial', () => {
  const buffer = new ConnectionBuffer({ maxBytes: 32 });
  buffer.push(Buffer.from('ab'));
  buffer.push(Buffer.from('cdef'));
  assert.equal(buffer.length, 6);
  assert.equal(buffer.peek(3).toString(), 'abc');
  assert.equal(buffer.consume(3).toString(), 'abc');
  assert.equal(buffer.consume().toString(), 'def');
  assert.equal(buffer.length, 0);
});

test('ConnectionBuffer rejeita crescimento acima do limite', () => {
  const buffer = new ConnectionBuffer({ maxBytes: 1024 });
  assert.equal(buffer.push(Buffer.alloc(1024)).overflow, false);
  assert.equal(buffer.push(Buffer.from('x')).overflow, true);
});

test('DeviceConnectionManager registra bytes recebidos e encerra estado', () => {
  const manager = new DeviceConnectionManager({ idleTimeoutMs: 1000, maxBufferBytes: 32 });
  const events = [];
  manager.on('data', (event) => events.push(event));
  const socket = {
    remoteAddress: '127.0.0.1',
    remotePort: 43210,
    setTimeout() {},
    on() {},
    destroy() {},
  };
  const connection = manager.register(socket);
  manager.handleData(socket, Buffer.from([0x01, 0xab]));
  assert.equal(events.length, 1);
  assert.equal(events[0].hex, '01ab');
  assert.equal(events[0].bufferedBytes, 2);
  manager.remove(socket, 'test');
  assert.equal(manager.connections.size, 0);
});
