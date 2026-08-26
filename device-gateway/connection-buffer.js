'use strict';

class ConnectionBuffer {
  constructor({ maxBytes = 65536 } = {}) {
    this.maxBytes = Math.max(1024, Number(maxBytes) || 65536);
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    if (!Buffer.isBuffer(chunk) || chunk.length === 0) return { accepted: 0, overflow: false };
    if (this.buffer.length + chunk.length > this.maxBytes) return { accepted: 0, overflow: true };
    this.buffer = Buffer.concat([this.buffer, chunk]);
    return { accepted: chunk.length, overflow: false };
  }

  get length() { return this.buffer.length; }

  peek(length) {
    return length === undefined ? this.buffer : this.buffer.subarray(0, Math.max(0, Number(length) || 0));
  }

  consume(length) {
    const size = length === undefined ? this.buffer.length : Math.max(0, Math.min(Number(length) || 0, this.buffer.length));
    const frame = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return frame;
  }

  clear() { this.buffer = Buffer.alloc(0); }
}

module.exports = { ConnectionBuffer };
