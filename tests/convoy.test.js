'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { createDatabase } = require('../server/database');
const { createConvoyRouter } = require('../server/convoy');
const { provisionStaff } = require('../server/provision-staff');

function user(database, { id, name, role, contactId }) {
  database
    .prepare(
      'INSERT INTO users (id,name,email,password_hash,role,public_contact_id,created_at) VALUES (?,?,?,?,?,?,?)'
    )
    .run(id, name, `${name.toLowerCase()}@example.com`, 'hash', role, contactId, Date.now());
}

function setup() {
  const database = createDatabase(':memory:');
  user(database, { id: 1, name: 'JOAO', role: 'ADMIN', contactId: 'RT-JOAO01' });
  user(database, { id: 2, name: 'GUILHERME', role: 'ADMIN', contactId: 'RT-GUILH1' });
  user(database, { id: 3, name: 'CLIENTE', role: 'USER', contactId: 'RT-USER01' });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId: Number(req.get('x-test-user')) || 3 };
    next();
  });
  app.use(
    '/api/convoy',
    createConvoyRouter({
      database,
      requireCsrf: (_req, _res, next) => next(),
      writeLimiter: (_req, _res, next) => next()
    })
  );
  return { database, app };
}

const as = (app, id) => request(app).get('/api/convoy').set('x-test-user', String(id));
const mutate = (app, id, method, path, body = {}) =>
  request(app)[method](path).set('x-test-user', String(id)).send(body);

test('comboio é invisível para USER e expõe somente IDs públicos para ADMIN', async t => {
  const { database, app } = setup();
  t.after(() => database.close());
  await as(app, 3).expect(403);
  const response = await as(app, 1).expect(200);
  assert.equal(response.body.profile.contactId, 'RT-JOAO01');
  assert.equal(JSON.stringify(response.body).includes('@example.com'), false);
});

test('conexão exige aceite antes do convite e comboio encerra o compartilhamento', async t => {
  const { database, app } = setup();
  t.after(() => database.close());
  const connection = await mutate(app, 1, 'post', '/api/convoy/connections', {
    contactId: 'RT-GUILH1'
  }).expect(201);
  const convoy = await mutate(app, 1, 'post', '/api/convoy/sessions').expect(201);
  await mutate(app, 1, 'post', `/api/convoy/sessions/${convoy.body.convoy.id}/invites`, {
    contactId: 'RT-GUILH1'
  }).expect(403);
  await mutate(app, 2, 'patch', `/api/convoy/connections/${connection.body.connection.id}`, {
    status: 'ACCEPTED'
  }).expect(200);
  const invite = await mutate(
    app,
    1,
    'post',
    `/api/convoy/sessions/${convoy.body.convoy.id}/invites`,
    { contactId: 'RT-GUILH1' }
  ).expect(201);
  await mutate(app, 2, 'patch', `/api/convoy/invites/${invite.body.invite.id}`, {
    status: 'ACCEPTED'
  }).expect(200);
  const joined = await as(app, 2).expect(200);
  assert.equal(joined.body.convoy.id, convoy.body.convoy.id);
  assert.equal(joined.body.convoy.members.length, 2);
  await mutate(app, 1, 'post', `/api/convoy/sessions/${convoy.body.convoy.id}/end`).expect(200);
  assert.equal((await as(app, 2)).body.convoy, null);
  assert.equal(
    database.prepare('SELECT status FROM convoy_invites WHERE id=?').get(invite.body.invite.id)
      .status,
    'ACCEPTED'
  );
});

test('provisionamento cria JOAO e GUILHERME como ADMIN sem senha pura', async () => {
  const database = createDatabase(':memory:');
  try {
    await provisionStaff({
      database,
      environment: {
        STAFF_JOAO_EMAIL: 'joao@empresa.test',
        STAFF_JOAO_PASSWORD: 'SenhaJoao123',
        STAFF_GUILHERME_EMAIL: 'guilherme@empresa.test',
        STAFF_GUILHERME_PASSWORD: 'SenhaGuilherme123'
      }
    });
    const rows = database
      .prepare(
        'SELECT name,email,password_hash AS passwordHash,role,public_contact_id AS contactId FROM users ORDER BY name'
      )
      .all();
    assert.deepEqual(
      rows.map(row => row.name),
      ['GUILHERME', 'JOAO']
    );
    assert.ok(rows.every(row => row.role === 'ADMIN' && /^RT-[A-Z0-9]{6,16}$/.test(row.contactId)));
    assert.ok(rows.every(row => !row.passwordHash.includes('Senha')));
  } finally {
    database.close();
  }
});
