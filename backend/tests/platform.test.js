'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const request = require('supertest');
const { createDatabase } = require('../../database/database');
const {
  createPlatformRouter,
  expireReports,
  reportLifetime,
  safePhoto
} = require('../server/platform');
const { TraccarProvider } = require('../server/providers/traccar-provider');
const {
  encodeBase32,
  decodeBase32,
  totp,
  verifyTotp,
  encryptSecret,
  decryptSecret
} = require('../server/two-factor');

const CSRF = 'a'.repeat(64);

function setup(t, routerOptions = {}) {
  const database = createDatabase(':memory:'),
    uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'rastreon-platform-'));
  database
    .prepare(
      "INSERT INTO users (id,name,email,password_hash,role,public_contact_id,chat_enabled,created_at) VALUES (1,'Usuário Um','one@example.com','hash','USER','RT-11111111111111111111111111111111',1,?), (2,'Usuário Dois','two@example.com','hash','USER','RT-22222222222222222222222222222222',1,?), (3,'Admin RASTREON','admin@example.com','hash','ADMIN','RT-33333333333333333333333333333333',0,?)"
    )
    .run(Date.now(), Date.now(), Date.now());
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use((req, _res, next) => {
    const userId = Number(req.get('x-test-user'));
    req.session = userId ? { userId, csrfToken: CSRF } : {};
    next();
  });
  app.use('/api/platform', createPlatformRouter({ database, uploadDirectory, ...routerOptions }));
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  t.after(() => {
    database.close();
    fs.rmSync(uploadDirectory, { recursive: true, force: true });
  });
  return { app, database };
}
function auth(call, userId = 1, write = false) {
  call.set('x-test-user', String(userId));
  if (write) call.set('x-csrf-token', CSRF);
  return call;
}

test('postos permanentes preservam histórico, confiança e benefício com validade', async t => {
  const { app, database } = setup(t);
  const created = await auth(
    request(app).post('/api/platform/stations').send({
      name: 'Posto Centro',
      brand: 'RASTREON',
      address: 'Av. Brasil, 100',
      latitude: -19.58,
      longitude: -42.64,
      source: 'Cadastro administrativo'
    }),
    3,
    true
  ).expect(201);
  const stationId = created.body.station.id;
  await auth(
    request(app)
      .post(`/api/platform/stations/${stationId}/prices`)
      .send({ fuelType: 'GASOLINE', price: 6.19, observedAt: Date.now() }),
    1,
    true
  ).expect(201);
  const latestPrice = await auth(
    request(app)
      .post(`/api/platform/stations/${stationId}/prices`)
      .send({ fuelType: 'GASOLINE', price: 6.09, observedAt: Date.now() + 1 }),
    2,
    true
  ).expect(201);
  await auth(
    request(app).put(
      `/api/platform/stations/${stationId}/prices/${latestPrice.body.price.id}/confirm`
    ),
    1,
    true
  ).expect(200);
  await auth(
    request(app).put(
      `/api/platform/stations/${stationId}/prices/${latestPrice.body.price.id}/confirm`
    ),
    2,
    true
  ).expect(200);
  const now = Date.now();
  await auth(
    request(app)
      .post(`/api/platform/stations/${stationId}/benefits`)
      .send({
        description: 'Desconto de teste',
        rules: 'Válido somente no aplicativo.',
        validFrom: now - 1000,
        validUntil: now + 3600000
      }),
    3,
    true
  ).expect(201);
  const listing = await auth(
    request(app).get('/api/platform/stations?latitude=-19.58&longitude=-42.64')
  ).expect(200);
  assert.equal(listing.body.stations[0].prices[0].price, 6.09);
  assert.equal(listing.body.stations[0].prices[0].status, 'CONFIRMED');
  assert.equal(listing.body.stations[0].prices[0].confirmations, 2);
  assert.equal(listing.body.stations[0].partnerBenefit.description, 'Desconto de teste');
  assert.equal(
    database.prepare('SELECT COUNT(*) AS total FROM fuel_prices WHERE station_id=?').get(stationId)
      .total,
    2
  );
});

test('ocorrências comunitárias expiram, aceitam confirmação e nunca se apresentam como oficiais', async t => {
  const { app, database } = setup(t);
  assert.equal(reportLifetime('HIGH') > reportLifetime('LOW'), true);
  const created = await auth(
    request(app).post('/api/platform/road-reports').send({
      category: 'ACCIDENT',
      severity: 'MEDIUM',
      description: 'Faixa parcialmente bloqueada.',
      latitude: -19.58,
      longitude: -42.64
    }),
    1,
    true
  ).expect(201);
  assert.equal(created.body.report.sourceLabel, 'Comunidade RASTREON');
  await auth(
    request(app)
      .put(`/api/platform/road-reports/${created.body.report.id}/vote`)
      .send({ vote: 'CONFIRM' }),
    2,
    true
  ).expect(200);
  database
    .prepare('UPDATE road_reports SET expires_at=? WHERE id=?')
    .run(Date.now() - 1, created.body.report.id);
  assert.equal(expireReports(database), 1);
  const listing = await auth(request(app).get('/api/platform/road-reports')).expect(200);
  assert.equal(listing.body.reports.length, 0);
});

test('conversa só nasce após aceite e não revela e-mail, telefone, placa ou posição', async t => {
  const { app } = setup(t);
  const pending = await auth(
    request(app).post('/api/platform/conversation-requests').send({
      recipientContactId: 'RT-22222222222222222222222222222222',
      contextType: 'PLACE_REVIEW',
      contextId: 'review-123'
    }),
    1,
    true
  ).expect(201);
  const inbox = await auth(request(app).get('/api/platform/conversation-requests'), 2).expect(200);
  assert.equal(inbox.body.requests[0].status, 'PENDING');
  assert.deepEqual(Object.keys(inbox.body.requests[0].sender), ['displayName', 'avatar']);
  assert.doesNotMatch(JSON.stringify(inbox.body), /example\.com|latitude|longitude|plate|phone/i);
  const accepted = await auth(
    request(app)
      .post(`/api/platform/conversation-requests/${pending.body.request.id}/respond`)
      .send({ action: 'ACCEPT' }),
    2,
    true
  ).expect(200);
  await auth(
    request(app)
      .post(`/api/platform/conversations/${accepted.body.conversationId}/messages`)
      .send({ body: 'Olá, tudo bem?' }),
    1,
    true
  ).expect(201);
  const messages = await auth(
    request(app).get(`/api/platform/conversations/${accepted.body.conversationId}/messages`),
    2
  ).expect(200);
  assert.equal(messages.body.messages[0].body, 'Olá, tudo bem?');
  assert.equal('senderUserId' in messages.body.messages[0], false);
});

test('PX bloqueia telefone/e-mail e fotos validam assinatura real, tipo e limite', async t => {
  const { app } = setup(t);
  await auth(
    request(app)
      .post('/api/platform/px/channels/px-geral/messages')
      .send({ body: 'Meu telefone é 31999998888' }),
    1,
    true
  ).expect(400);
  await auth(
    request(app)
      .post('/api/platform/px/channels/px-geral/messages')
      .send({ body: 'Trânsito lento na avenida, dirijam com atenção.' }),
    1,
    true
  ).expect(201);
  assert.equal(safePhoto(Buffer.from('imagem falsa'), 'image/jpeg'), null);
  const jpeg = Buffer.concat([Buffer.from('ffd8ffe000104a464946', 'hex'), Buffer.alloc(20)]);
  assert.equal(safePhoto(jpeg, 'image/jpeg').extension, '.jpg');
});

test('hub comunitário aplica filtros, reações, distância aproximada e localização temporária', async t => {
  const { app } = setup(t);
  const report = await auth(
    request(app).post('/api/platform/road-reports').send({
      category: 'HAZARD',
      severity: 'HIGH',
      description: 'Carga na pista.',
      latitude: -19.58,
      longitude: -42.64
    }),
    1,
    true
  ).expect(201);
  await auth(
    request(app)
      .put(`/api/platform/road-reports/${report.body.report.id}/vote`)
      .send({ vote: 'CONFIRM' }),
    2,
    true
  ).expect(200);
  const filtered = await auth(
    request(app).get('/api/platform/road-reports?category=HAZARD&severity=HIGH&sinceHours=3')
  ).expect(200);
  assert.equal(filtered.body.reports.length, 1);
  assert.equal(filtered.body.reports[0].confirmations, 1);
  assert.ok(filtered.body.reports[0].lastConfirmationAt);

  const px = await auth(
    request(app).post('/api/platform/px/channels/px-ajuda/messages').send({
      body: 'Preciso de apoio próximo à rodovia.',
      latitude: -19.58,
      longitude: -42.64
    }),
    1,
    true
  ).expect(201);
  await auth(
    request(app)
      .put(`/api/platform/px/messages/${px.body.message.id}/reactions`)
      .send({ reaction: 'THANKS' }),
    2,
    true
  ).expect(200);
  const pxMessages = await auth(
    request(app).get('/api/platform/px/channels/px-ajuda/messages?latitude=-19.581&longitude=-42.641'),
    2
  ).expect(200);
  assert.equal(pxMessages.body.messages[0].reactions.thanks, 1);
  assert.equal(pxMessages.body.messages[0].distanceMeters, 500);
  assert.ok(pxMessages.body.messages[0].expiresAt > Date.now());

  const pending = await auth(
    request(app).post('/api/platform/conversation-requests').send({
      recipientContactId: 'RT-22222222222222222222222222222222'
    }),
    1,
    true
  ).expect(201);
  const accepted = await auth(
    request(app)
      .post(`/api/platform/conversation-requests/${pending.body.request.id}/respond`)
      .send({ action: 'ACCEPT' }),
    2,
    true
  ).expect(200);
  await auth(
    request(app)
      .post(`/api/platform/conversations/${accepted.body.conversationId}/messages`)
      .send({ messageType: 'LOCATION', latitude: -19.58, longitude: -42.64 }),
    1,
    true
  ).expect(201);
  const privateMessages = await auth(
    request(app).get(`/api/platform/conversations/${accepted.body.conversationId}/messages`),
    2
  ).expect(200);
  assert.equal(privateMessages.body.messages[0].messageType, 'LOCATION');
  assert.ok(privateMessages.body.messages[0].expiresAt > Date.now());
  await auth(
    request(app)
      .patch(`/api/platform/conversations/${accepted.body.conversationId}`)
      .send({ action: 'ARCHIVE' }),
    2,
    true
  ).expect(200);
  const conversations = await auth(request(app).get('/api/platform/conversations'), 2).expect(200);
  assert.equal(conversations.body.conversations[0].archived, true);
});

test('Traccar autentica, oculta identificador e normaliza nós para telemetria SI', () => {
  const provider = new TraccarProvider({
    webhookSecret: 'webhook-secret-with-32-characters!',
    deviceHashSecret: 'hash-secret-with-at-least-32-chars!'
  });
  assert.equal(provider.authorize('Bearer webhook-secret-with-32-characters!'), true);
  assert.equal(provider.authorize('Bearer errado'), false);
  const normalized = provider.normalize({
    device: { uniqueId: 'IMEI-TESTE-NAO-REAL' },
    position: {
      id: 123,
      latitude: -19.58,
      longitude: -42.64,
      fixTime: '2026-08-25T12:00:00Z',
      speed: 10,
      accuracy: 8,
      course: 180,
      attributes: { ignition: true, batteryLevel: 74 }
    }
  });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.point.speed.toFixed(3), '5.144');
  assert.equal(normalized.point.ignition, true);
  assert.equal(normalized.externalIdHash.includes('IMEI'), false);
});

test('TOTP usa segredo criptografado e janela temporal sem persistir código puro', () => {
  const raw = Buffer.from('12345678901234567890'),
    secret = encodeBase32(raw),
    sessionSecret = 'session-secret-with-more-than-thirty-two-characters';
  assert.deepEqual(decodeBase32(secret), raw);
  const code = totp(secret, 59000);
  assert.equal(code, '287082');
  assert.equal(verifyTotp(secret, code, 59000), true);
  const encrypted = encryptSecret(secret, sessionSecret);
  assert.equal(encrypted.includes(secret), false);
  assert.equal(decryptSecret(encrypted, sessionSecret), secret);
});

test('busca global combina entidades internas e endereço externo mesmo sem módulo antigo de locais', async t => {
  const geocodingProvider = {
    search: async (query, options) => [
      {
        provider: 'test-geocoder',
        label: `${query}, São Paulo`,
        type: 'address',
        latitude: options.latitude,
        longitude: options.longitude
      }
    ]
  };
  const { app, database } = setup(t, { geocodingProvider });
  database
    .prepare(
      "INSERT INTO fuel_stations (id,name,address,latitude,longitude,source,confidence,created_at,updated_at) VALUES ('station-search','Posto Paulista','Avenida Paulista, 1000',-23.5614,-46.6559,'teste','RECENTLY_CONFIRMED',?,?)"
    )
    .run(Date.now(), Date.now());
  const response = await auth(
    request(app).get('/api/platform/search?q=Paulista&latitude=-23.5614&longitude=-46.6559')
  ).expect(200);
  assert.deepEqual(
    new Set(response.body.results.map(result => result.type)),
    new Set(['FUEL_STATION', 'ADDRESS'])
  );
  assert.equal(
    response.body.results.every(result => !('email' in result || 'phone' in result)),
    true
  );
});
