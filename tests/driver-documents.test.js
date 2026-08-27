'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { createApplication, sessions } = require('../server/server');
const { validDocument, validExpiry } = require('../server/driver-documents');

function setup(t, options = {}) {
  sessions.clear();
  const privateDocumentsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rastreon-cnh-test-'));
  const context = createApplication({
    databasePath: ':memory:',
    sessionSecret: 'test-secret-with-at-least-32-characters',
    privateDocumentsPath,
    silent: true,
    ...options
  });
  t.after(() => {
    sessions.clear();
    context.close();
    fs.rmSync(privateDocumentsPath, { recursive: true, force: true });
  });
  return { ...context, privateDocumentsPath };
}

function register(agent) {
  return agent.post('/api/auth/register').send({
    name: 'Motorista Teste',
    email: 'motorista@example.com',
    phone: '(31) 99999-9999',
    password: 'Senha123',
    plan: 'inteligente'
  });
}

test('CNH usa armazenamento privado, valida assinatura e inicia pendente', async t => {
  const { app, database, privateDocumentsPath } = setup(t);
  const agent = request.agent(app);
  await register(agent).expect(201);
  const csrf = (await agent.get('/api/auth/csrf').expect(200)).body.token;
  const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0xff, 0xd9]);
  const uploaded = await agent
    .post('/api/documents/cnh')
    .set('X-CSRF-Token', csrf)
    .set('Content-Type', 'application/octet-stream')
    .set('X-Document-Type', 'image/jpeg')
    .set('X-CNH-Expiry', '2030-12-31')
    .send(fakeJpeg)
    .expect(201);
  assert.equal(uploaded.body.document.status, 'PENDING');
  assert.equal('documentStorageKey' in uploaded.body.document, false);
  const row = database.prepare('SELECT * FROM driver_documents').get();
  assert.equal(
    path.dirname(path.join(privateDocumentsPath, row.document_storage_key)),
    privateDocumentsPath
  );
  assert.equal(fs.existsSync(path.join(privateDocumentsPath, row.document_storage_key)), true);
  const listed = await agent.get('/api/documents/cnh').expect(200);
  assert.equal(listed.body.document.status, 'PENDING');
  await agent
    .delete('/api/privacy/account')
    .set('X-CSRF-Token', csrf)
    .send({ password: 'Senha123', confirmation: 'EXCLUIR MINHA CONTA' })
    .expect(204);
  assert.equal(fs.existsSync(path.join(privateDocumentsPath, row.document_storage_key)), false);
});

test('política de CNH bloqueia rastreamento ausente, pendente ou vencido', async t => {
  const { app, database } = setup(t, { cnhRequired: true });
  const agent = request.agent(app);
  await register(agent).expect(201);
  await agent
    .post('/api/sessions')
    .send({})
    .expect(428)
    .expect(res => {
      assert.equal(res.body.code, 'CNH_REQUIRED');
    });
  const csrf = (await agent.get('/api/auth/csrf').expect(200)).body.token;
  await agent
    .post('/api/documents/cnh')
    .set('X-CSRF-Token', csrf)
    .set('Content-Type', 'application/octet-stream')
    .set('X-Document-Type', 'image/jpeg')
    .set('X-CNH-Expiry', '2030-12-31')
    .send(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))
    .expect(201);
  await agent
    .post('/api/sessions')
    .send({})
    .expect(428)
    .expect(res => {
      assert.equal(res.body.code, 'CNH_PENDING');
    });
  database
    .prepare("UPDATE driver_documents SET status='APPROVED',cnh_expiry_date='2020-01-01'")
    .run();
  await agent
    .post('/api/sessions')
    .send({})
    .expect(428)
    .expect(res => {
      assert.equal(res.body.code, 'CNH_INVALID');
    });
});

test('validação rejeita conteúdo disfarçado e validade inválida', () => {
  assert.equal(validDocument(Buffer.from('arquivo falso'), 'application/pdf'), false);
  assert.equal(validDocument(Buffer.from('%PDF-1.7'), 'application/pdf'), true);
  assert.equal(validExpiry('2020-01-01'), false);
  assert.equal(validExpiry('2030-12-31'), true);
});
