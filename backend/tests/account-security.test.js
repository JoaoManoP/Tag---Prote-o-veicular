'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApplication, sessions } = require('../server/server');
const {
  NEUTRAL_RESET_MESSAGE,
  normalizePhone,
  createDeliveryProvider
} = require('../server/account-security');

function setup(t) {
  sessions.clear();
  const deliveryProvider = {
    name: 'mock',
    available: true,
    revealCodes: true,
    async send() {
      return { accepted: true };
    }
  };
  const context = createApplication({
    databasePath: ':memory:',
    sessionSecret: 'test-secret-with-at-least-32-characters',
    deliveryProvider,
    silent: true
  });
  t.after(() => {
    sessions.clear();
    context.close();
  });
  return context;
}

function register(agent) {
  return agent.post('/api/auth/register').send({
    name: 'Conta Pública',
    email: 'conta@example.com',
    phone: '(31) 99999-9999',
    password: 'Senha123',
    plan: 'inteligente'
  });
}

test('migration cria verificação de contato e desafios sem armazenar OTP puro', t => {
  const { database } = setup(t);
  const userColumns = database
    .prepare('PRAGMA table_info(users)')
    .all()
    .map(row => row.name);
  const challengeColumns = database
    .prepare('PRAGMA table_info(account_challenges)')
    .all()
    .map(row => row.name);
  assert.ok(userColumns.includes('email_verified_at'));
  assert.ok(userColumns.includes('phone_verified_at'));
  assert.ok(challengeColumns.includes('code_hash'));
  assert.ok(!challengeColumns.includes('code'));
});

test('recuperação responde de forma neutra, expira o código e revoga sessões', async t => {
  const { app, database } = setup(t);
  const agent = request.agent(app);
  await register(agent).expect(201);
  const requested = await request(app)
    .post('/api/account-security/password-reset/request')
    .send({ email: 'conta@example.com' })
    .expect(200);
  assert.equal(requested.body.message, NEUTRAL_RESET_MESSAGE);
  assert.equal(requested.body.provider, 'mock');
  assert.match(requested.body.developmentCode, /^\d{6}$/);
  const stored = database
    .prepare('SELECT code_hash FROM account_challenges WHERE id=?')
    .get(requested.body.challengeId);
  assert.notEqual(stored.code_hash, requested.body.developmentCode);
  await request(app)
    .post('/api/account-security/password-reset/confirm')
    .send({
      challengeId: requested.body.challengeId,
      code: requested.body.developmentCode,
      newPassword: 'NovaSenha456'
    })
    .expect(204);
  await agent.get('/api/auth/me').expect(401);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'conta@example.com', password: 'NovaSenha456' })
    .expect(200);
  await request(app)
    .post('/api/account-security/password-reset/confirm')
    .send({
      challengeId: requested.body.challengeId,
      code: requested.body.developmentCode,
      newPassword: 'OutraSenha789'
    })
    .expect(400);
});

test('requisição não revela se o e-mail está cadastrado', async t => {
  const { app } = setup(t);
  const existingAgent = request.agent(app);
  await register(existingAgent).expect(201);
  const existing = await request(app)
    .post('/api/account-security/password-reset/request')
    .send({ email: 'conta@example.com' })
    .expect(200);
  const missing = await request(app)
    .post('/api/account-security/password-reset/request')
    .send({ email: 'ausente@example.com' })
    .expect(200);
  assert.equal(existing.body.message, missing.body.message);
  assert.equal(existing.body.deliveryAvailable, missing.body.deliveryAvailable);
  assert.match(missing.body.challengeId, /^[a-f0-9-]{36}$/i);
  assert.equal('developmentCode' in missing.body, false);
});

test('provider mock nunca é habilitado em produção e telefone é normalizado', () => {
  assert.equal(
    createDeliveryProvider({ NODE_ENV: 'production', AUTH_DELIVERY_PROVIDER: 'mock' }).available,
    false
  );
  assert.equal(normalizePhone('+55 (31) 99999-9999'), '5531999999999');
  assert.equal(normalizePhone('123'), '');
});
