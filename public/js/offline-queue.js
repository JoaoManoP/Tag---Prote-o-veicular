/* global indexedDB */
'use strict';
(function expose(global) {
  class OfflinePositionQueue {
    constructor(sessionId) { this.sessionId = sessionId; this.databasePromise = this.open(); }
    open() { return new Promise((resolve, reject) => { const request = indexedDB.open('rastro-telemetry', 1); request.onupgradeneeded = () => { const database = request.result; if (!database.objectStoreNames.contains('positions')) { const store = database.createObjectStore('positions', { keyPath: 'key' }); store.createIndex('sessionSequence', ['sessionId', 'sequence'], { unique: true }); } }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
    async store(mode = 'readonly') { const database = await this.databasePromise; return database.transaction('positions', mode).objectStore('positions'); }
    async add(position) { const store = await this.store('readwrite'); return new Promise((resolve, reject) => { const request = store.put({ ...position, key: `${this.sessionId}:${position.sequence}`, sessionId: this.sessionId }); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }
    async list(limit = 200) { const store = await this.store(); const index = store.index('sessionSequence'); const range = IDBKeyRange.bound([this.sessionId, Number.MIN_SAFE_INTEGER], [this.sessionId, Number.MAX_SAFE_INTEGER]); return new Promise((resolve, reject) => { const points = []; const request = index.openCursor(range); request.onsuccess = () => { const cursor = request.result; if (!cursor || points.length >= limit) return resolve(points); const { key, sessionId, ...position } = cursor.value; points.push(position); cursor.continue(); }; request.onerror = () => reject(request.error); }); }
    async removeSequences(sequences) { if (!sequences.length) return; const store = await this.store('readwrite'); await Promise.all(sequences.map(sequence => new Promise((resolve, reject) => { const request = store.delete(`${this.sessionId}:${sequence}`); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }))); }
    async count() { const store = await this.store(); const index = store.index('sessionSequence'); const range = IDBKeyRange.bound([this.sessionId, Number.MIN_SAFE_INTEGER], [this.sessionId, Number.MAX_SAFE_INTEGER]); return new Promise((resolve, reject) => { const request = index.count(range); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
    async clear() { const points = await this.list(Number.MAX_SAFE_INTEGER); await this.removeSequences(points.map(point => point.sequence)); }
  }
  global.OfflinePositionQueue = OfflinePositionQueue;
})(window);
