'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { io: createClient } = require('socket.io-client');
const { createApplication, sessions } = require('../server/server');

const vehicle = { nickname: 'Carro seguro', plate: 'ABC1D23', brand: 'Marca', model: 'Modelo', year: 2026, version: '1.0', engine: '1.0', transmission: 'Manual', fuel: 'Gasolina', city: 10, road: 14, tank: 45, price: 6.19 };

async function setup(t) {
  sessions.clear();
  const context = createApplication({ databasePath: ':memory:', sessionSecret: 'socket-test-secret-with-at-least-32-chars', silent: true });
  await new Promise((resolve, reject) => context.server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
  const address = context.server.address();
  const url = `http://127.0.0.1:${address.port}`;
  t.after(() => { sessions.clear(); context.close(); });
  return { ...context, url };
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function emit(socket, event, payload) {
  return new Promise(resolve => socket.emit(event, payload, resolve));
}

function mobileInvite(url) { return new URLSearchParams(new URL(url).hash.slice(1)); }
async function pairDevice(agent,created){const token=mobileInvite(created.body.pairUrl).get('token'),resolved=await agent.get(`/api/pairings/resolve?token=${encodeURIComponent(token)}`).expect(200),confirmed=await agent.post(`/api/pairings/${resolved.body.pairing.id}/confirm`).send({name:'Celular de teste'}).expect(201);return{token:confirmed.body.credential,deviceId:confirmed.body.device.id}}

test('convite móvel exige token e não expõe histórico nem placa', async (t) => {
  const { app, database, url } = await setup(t);
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ name: 'Teste Socket', email: 'socket@example.com', password: 'Senha123' }).expect(201);
  const created = await agent.post('/api/sessions').send({ vehicle }).expect(201);
  const invite = new URL(created.body.pairUrl);
  assert.equal(invite.search, '');
  const pairingToken = mobileInvite(created.body.pairUrl).get('token');
  assert.ok(pairingToken);
  const {token,deviceId}=await pairDevice(agent,created);
  const stored = database.prepare('SELECT mobile_token_hash AS hash FROM tracking_sessions WHERE id = ?').get(created.body.id);
  assert.notEqual(stored.hash, token);assert.notEqual(stored.hash,pairingToken);assert.equal(stored.hash.length,64);

  const socket = await connect(url);
  t.after(() => socket.close());
  const denied = await emit(socket, 'session:join', { sessionId: created.body.id, role: 'mobile', token: 'token-invalido-com-tamanho-suficiente-123456',deviceId });
  assert.equal(denied.ok, false);
  const joined = await emit(socket, 'session:join', { sessionId: created.body.id, role: 'mobile', token,deviceId });
  assert.equal(joined.ok, true);
  assert.equal('positions' in joined.session, false);
  assert.equal('interruptions' in joined.session, false);
  assert.equal('plate' in joined.session.vehicle, false);
});

test('Socket.IO rejeita telemetria inválida e limita frequência ao vivo', async (t) => {
  const { app, database, url } = await setup(t);
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ name: 'Teste GPS', email: 'gps@example.com', password: 'Senha123' }).expect(201);
  const created = await agent.post('/api/sessions').send({ vehicle }).expect(201);
  const {token,deviceId}=await pairDevice(agent,created);
  const socket = await connect(url);
  t.after(() => socket.close());
  assert.equal((await emit(socket, 'session:join', { sessionId: created.body.id, role: 'mobile', token,deviceId })).ok, true);

  const base = { deviceId, latitude: -19.58, longitude: -42.64, accuracy: 8, timestamp: Date.now(), source: 'mobile-gps', sequence: 1 };
  const withoutConsent = await emit(socket, 'position:update', base);
  assert.equal(withoutConsent.code, 'CONSENT_REQUIRED');
  assert.equal((await emit(socket, 'consent:grant', { deviceId: base.deviceId, purpose: 'vehicle-tracking' })).ok, true);
  const invalid = await emit(socket, 'position:update', { ...base, accuracy: 20000 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, 'INVALID_ACCURACY');
  const accepted = await emit(socket, 'position:update', base);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.accepted, true);
  const limited = await emit(socket, 'position:update', { ...base, timestamp: Date.now(), sequence: 2 });
  assert.equal(limited.ok, false);
  assert.equal(limited.code, 'RATE_LIMITED');
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM positions').get().total, 1);
  await agent.delete(`/api/devices/${deviceId}`).expect(204);
  const revoked=await emit(socket,'position:update',{...base,timestamp:Date.now()+5000,sequence:3});
  assert.equal(revoked.code,'DEVICE_REVOKED');
});

test('API bloqueia mutação originada por outro site', async (t) => {
  const { app } = await setup(t);
  await request(app).post('/api/auth/register').set('Origin', 'https://site-malicioso.example').send({ name: 'Ataque', email: 'ataque@example.com', password: 'Senha123' }).expect(403);
});
