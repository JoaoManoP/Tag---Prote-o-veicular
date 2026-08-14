'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApplication, sessions, safePosition, validCoordPair } = require('../server/server');
const { classifyAccuracy, haversineMeters, validateTelemetryPoint, acceptTelemetryPoint } = require('../server/telemetry');

const vehicle = { type: 'car', nickname: 'Carro teste', plate: 'ABC1D23', brand: 'Marca', model: 'Modelo', year: 2024, version: '1.0', engine: '1.0', transmission: 'Manual', fuel: 'Gasolina', city: 10, road: 14, tank: 45, price: 6.19, dataSource: 'Teste automatizado' };
function setup(t) { sessions.clear(); const context = createApplication({ databasePath: ':memory:', sessionSecret: 'test-secret-with-at-least-32-characters', silent: true }); t.after(() => { sessions.clear(); context.database.close(); }); return context; }
function register(agent, overrides = {}) { return agent.post('/api/auth/register').send({ name: 'Usuário Teste', email: 'teste@example.com', password: 'Senha123', ...overrides }); }
function telemetry(overrides = {}) { return { deviceId: 'MOBILE-TEST-001', timestamp: Date.now(), latitude: -19.923456, longitude: -43.934567, accuracy: 8.4, altitude: 852.3, altitudeAccuracy: 12, speed: 11.5, heading: 180, source: 'mobile-gps', sequence: 1, ...overrides }; }

test('health check confirma API e banco', async (t) => { const { app } = setup(t); const response = await request(app).get('/api/health').expect(200); assert.equal(response.body.database, 'connected'); });

test('cadastro cria USER, hash e sessão autenticada sem aceitar função forjada', async (t) => {
  const { app, database } = setup(t);
  const agent = request.agent(app);
  const response = await register(agent, { role: 'DEVELOPER' }).expect(201);
  assert.equal(response.body.user.role, 'USER');
  const row = database.prepare('SELECT email, password_hash, role FROM users').get();
  assert.equal(row.email, 'teste@example.com');
  assert.equal(row.role, 'USER');
  assert.notEqual(row.password_hash, 'Senha123');
  assert.match(row.password_hash, /^\$2[aby]\$/);
  await agent.get('/api/auth/me').expect(200);
});

test('cadastro rejeita entrada inválida e e-mail duplicado', async (t) => { const { app } = setup(t); const agent = request.agent(app); await register(agent, { password: 'fraca' }).expect(400); await register(agent).expect(201); await request(app).post('/api/auth/register').send({ name: 'Outro', email: 'TESTE@example.com', password: 'Outra123' }).expect(409); });
test('login rejeita senha incorreta e aceita credenciais corretas', async (t) => { const { app } = setup(t); await register(request.agent(app)).expect(201); await request(app).post('/api/auth/login').send({ email: 'teste@example.com', password: 'Errada123' }).expect(401); const agent = request.agent(app); await agent.post('/api/auth/login').send({ email: 'teste@example.com', password: 'Senha123' }).expect(200); await agent.get('/api/auth/me').expect(200); });
test('logout revoga sessão', async (t) => { const { app } = setup(t); const agent = request.agent(app); await register(agent).expect(201); await agent.post('/api/auth/logout').expect(204); await agent.get('/api/auth/me').expect(401); });
test('painel e API protegida negam usuário não autenticado', async (t) => { const { app } = setup(t); await request(app).get('/').expect(302).expect('Location', '/login.html'); await request(app).get('/api/vehicles/reference').expect(401); await request(app).post('/api/sessions').send({ vehicle }).expect(401); });

test('ADMIN e DEVELOPER são protegidos no servidor', async (t) => {
  const { app, database } = setup(t);
  const agent = request.agent(app);
  await register(agent).expect(201);
  await agent.get('/api/admin/overview').expect(403);
  await agent.get('/api/lab/info').expect(403);
  const user = database.prepare('SELECT id FROM users WHERE email = ?').get('teste@example.com');
  database.prepare("UPDATE users SET role = 'DEVELOPER' WHERE id = ?").run(user.id);
  await agent.get('/api/lab/info').expect(200);
  await agent.get('/api/admin/overview').expect(403);
  database.prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?").run(user.id);
  await agent.get('/api/admin/overview').expect(200);
  await agent.get('/api/lab/info').expect(403);
});

test('sessão é persistida, expira e permanece isolada por proprietário', async (t) => {
  const { app, database } = setup(t);
  const owner = request.agent(app);
  const stranger = request.agent(app);
  await register(owner).expect(201);
  await register(stranger, { email: 'outro@example.com' }).expect(201);
  const created = await owner.post('/api/sessions').send({ vehicle }).expect(201);
  assert.match(created.body.qrCode, /^data:image\/png;base64,/);
  assert.ok(created.body.expiresAt > created.body.createdAt);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM tracking_sessions').get().total, 1);
  await owner.get(`/api/sessions/${created.body.id}`).expect(200);
  await stranger.get(`/api/sessions/${created.body.id}`).expect(404);
  sessions.get(created.body.id).expiresAt = Date.now() - 1;
  await owner.get(`/api/sessions/${created.body.id}`).expect(404);
});

test('veículos são persistidos e isolados por proprietário', async (t) => {
  const { app } = setup(t);
  const owner = request.agent(app);
  const stranger = request.agent(app);
  await register(owner).expect(201);
  await register(stranger, { email: 'outro@example.com' }).expect(201);
  const created = await owner.post('/api/vehicles').send(vehicle).expect(201);
  const ownerList = await owner.get('/api/vehicles').expect(200);
  const strangerList = await stranger.get('/api/vehicles').expect(200);
  assert.equal(ownerList.body.vehicles.length, 1);
  assert.equal(strangerList.body.vehicles.length, 0);
  await stranger.delete(`/api/vehicles/${created.body.vehicle.id}`).expect(404);
});

test('classifica precisão nos limites definidos', () => { assert.equal(classifyAccuracy(10), 'Excelente'); assert.equal(classifyAccuracy(10.1), 'Boa'); assert.equal(classifyAccuracy(30.1), 'Regular'); assert.equal(classifyAccuracy(100.1), 'Baixa'); });
test('Haversine calcula distância conhecida sem alterar coordenadas', () => { const first = { latitude: 0, longitude: 0 }; const second = { latitude: 0, longitude: 1 }; const distance = haversineMeters(first, second); assert.ok(distance > 111000 && distance < 112000); assert.deepEqual(first, { latitude: 0, longitude: 0 }); });

test('telemetria rejeita coordenada, origem, precisão e posição antiga inválidas', () => {
  assert.equal(validateTelemetryPoint(telemetry({ latitude: 91 })).code, 'INVALID_COORDINATE');
  assert.equal(validateTelemetryPoint(telemetry({ source: 'physical-tag' })).code, 'INVALID_SOURCE');
  assert.equal(validateTelemetryPoint(telemetry({ accuracy: -1 })).code, 'INVALID_ACCURACY');
  assert.equal(validateTelemetryPoint(telemetry({ timestamp: Date.now() - 10 * 60 * 1000 })).code, 'STALE_POSITION');
  assert.equal(validateTelemetryPoint(telemetry()).ok, true);
});

test('telemetria bloqueia duplicação, sequência fora de ordem e frequência excessiva', () => {
  const tracking = { telemetryState: new Map() };
  const now = Date.now();
  assert.equal(acceptTelemetryPoint(tracking, telemetry({ timestamp: now }), { now }).ok, true);
  assert.equal(acceptTelemetryPoint(tracking, telemetry({ timestamp: now + 300 }), { now: now + 300 }).code, 'DUPLICATE');
  assert.equal(acceptTelemetryPoint(tracking, telemetry({ sequence: 0, timestamp: now + 600 }), { now: now + 600 }).code, 'OUT_OF_ORDER');
  assert.equal(acceptTelemetryPoint(tracking, telemetry({ sequence: 2, timestamp: now + 100 }), { now: now + 100 }).code, 'RATE_LIMITED');
});

test('salto impossível é preservado e marcado como suspeito', () => {
  const tracking = { telemetryState: new Map() };
  const now = Date.now();
  const first = acceptTelemetryPoint(tracking, telemetry({ timestamp: now }), { now });
  const second = acceptTelemetryPoint(tracking, telemetry({ latitude: -18, sequence: 2, timestamp: now + 1000 }), { now: now + 1000 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.point.latitude, -18);
  assert.equal(second.point.suspicious, true);
  assert.match(second.point.suspicionReason, /Salto improvável/);
});

test('safePosition segue o contrato estrito e coordenadas de rota são validadas', () => { assert.equal(safePosition({ latitude: 91, longitude: 0 }), null); assert.equal(safePosition(telemetry()).accuracy, 8.4); assert.deepEqual(validCoordPair('-42.5,-19.4'), [-42.5, -19.4]); assert.equal(validCoordPair('x,20'), null); });
