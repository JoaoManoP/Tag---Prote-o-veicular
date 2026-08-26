'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { createDatabase } = require('../server/database');
const {
  createCommunityRouter,
  createCommunityWriteLimiter,
  parseFeatureFlag
} = require('../server/community');

const CSRF_TOKEN = 'csrf-token-for-community-tests';
const LOCAL_ID = 'google:ChIJ-local-rastreon';
const PLACE = {
  provider: 'google',
  name: 'Praça Primeiro de Maio',
  address: 'Centro, Timóteo - MG',
  latitude: -19.581,
  longitude: -42.647
};

function addUser(database, { id, name, email, role = 'USER' }) {
  database.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, created_at)
    VALUES (?, ?, ?, 'hash-for-test-only', ?, ?)
  `).run(id, name, email, role, Date.now());
}

function setup(t, {
  enabled = true,
  writeLimiter = (_req, _res, next) => next(),
  now
} = {}) {
  const database = createDatabase(':memory:');
  addUser(database, { id: 1, name: 'João da Silva', email: 'joao@example.com' });
  addUser(database, { id: 2, name: 'Maria Oliveira', email: 'maria@example.com' });
  addUser(database, { id: 3, name: 'Admin Rastreon', email: 'admin@example.com', role: 'ADMIN' });
  const app = express();
  app.use(express.json({ limit: '20kb' }));
  app.use((req, _res, next) => {
    const userId = Number(req.get('x-test-user'));
    req.session = Number.isInteger(userId) && userId > 0
      ? { userId, csrfToken: CSRF_TOKEN }
      : {};
    next();
  });
  app.use('/api/community', createCommunityRouter({ database, enabled, writeLimiter, now }));
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  t.after(() => database.close());
  return { app, database };
}

function authenticated(call, userId, { csrf = false } = {}) {
  call.set('x-test-user', String(userId));
  if (csrf) call.set('x-csrf-token', CSRF_TOKEN);
  return call;
}

function createReview(app, userId = 1, overrides = {}) {
  return authenticated(
    request(app)
      .post(`/api/community/places/${encodeURIComponent(LOCAL_ID)}/reviews`)
      .send({ place: PLACE, rating: 5, comment: 'Lugar agradável e bem cuidado.', ...overrides }),
    userId,
    { csrf: true }
  );
}

test('flag da comunidade aceita somente valores explícitos e desativa toda a superfície de dados', async (t) => {
  assert.equal(parseFeatureFlag('true'), true);
  assert.equal(parseFeatureFlag('ON'), true);
  assert.equal(parseFeatureFlag('false'), false);
  assert.equal(parseFeatureFlag(undefined), false);

  const { app, database } = setup(t, { enabled: false });
  await request(app).get('/api/community/status').expect(200, { enabled: false, version: 1 });
  const disabled = await request(app)
    .get(`/api/community/places/${encodeURIComponent(LOCAL_ID)}/reviews`)
    .expect(404);
  assert.equal(disabled.body.code, 'COMMUNITY_FEATURE_DISABLED');
  assert.equal(database.prepare("SELECT name FROM sqlite_schema WHERE name = 'community_place_reviews'").get(), undefined);
});

test('API habilitada exige autenticação, CSRF e valida nota e conteúdo', async (t) => {
  const { app } = setup(t);
  await request(app)
    .get(`/api/community/places/${encodeURIComponent(LOCAL_ID)}/reviews`)
    .expect(401);
  const withoutCsrf = await request(app)
    .post(`/api/community/places/${encodeURIComponent(LOCAL_ID)}/reviews`)
    .set('x-test-user', '1')
    .send({ place: PLACE, rating: 5, comment: 'Comentário válido.' })
    .expect(403);
  assert.equal(withoutCsrf.body.code, 'INVALID_CSRF_TOKEN');
  await createReview(app, 1, { rating: 6 }).expect(400);
  await createReview(app, 1, { rating: 4, comment: '<' }).expect(400);
  await authenticated(
    request(app)
      .post('/api/community/places/google:local-incompativel/reviews')
      .send({ place: { ...PLACE, provider: 'mapbox' }, rating: 4, comment: 'Provedor incompatível.' }),
    1,
    { csrf: true }
  ).expect(400);
  await authenticated(
    request(app)
      .post('/api/community/places/google:%27%20OR%201=1/reviews')
      .send({ place: PLACE, rating: 4, comment: 'Tentativa inválida.' }),
    1,
    { csrf: true }
  ).expect(400);
});

test('avaliações criam resumo paginado sem expor identidade ou localização do autor', async (t) => {
  let timestamp = 1_000;
  const { app, database } = setup(t, { now: () => timestamp++ });
  const first = await createReview(app, 1, {
    authorLatitude: -19.5,
    authorLongitude: -42.6
  }).expect(201);
  assert.equal(first.body.review.rating, 5);
  assert.deepEqual(first.body.review.author, { displayName: 'João S.' });
  assert.equal(first.body.review.mine, true);
  assert.equal('userId' in first.body.review, false);
  assert.equal('email' in first.body.review.author, false);
  assert.equal('latitude' in first.body.review.author, false);
  assert.equal(first.body.summary.averageRating, 5);

  await createReview(app, 2, {
    rating: 3,
    comment: 'Bom, mas poderia ter melhor iluminação.'
  }).expect(201);
  const listing = await authenticated(
    request(app).get(`/api/community/places/${encodeURIComponent(LOCAL_ID)}/reviews?limit=1`),
    1
  ).expect(200);
  assert.equal(listing.body.place.name, PLACE.name);
  assert.equal(listing.body.place.latitude, PLACE.latitude);
  assert.equal(listing.body.summary.count, 2);
  assert.equal(listing.body.summary.averageRating, 4);
  assert.equal(listing.body.summary.distribution['3'], 1);
  assert.equal(listing.body.summary.distribution['5'], 1);
  assert.equal(listing.body.pagination.hasMore, true);
  assert.equal(listing.body.reviews.length, 1);

  const columns = database.prepare('PRAGMA table_info(community_place_reviews)').all().map((column) => column.name);
  assert.equal(columns.some((name) => /lat|lon|location|ip/i.test(name)), false);
  await createReview(app, 1).expect(409);
});

test('edição e remoção respeitam propriedade e exclusão lógica', async (t) => {
  let timestamp = 10_000;
  const { app, database } = setup(t, { now: () => timestamp++ });
  const created = await createReview(app).expect(201);
  const reviewId = created.body.review.id;

  await authenticated(
    request(app).patch(`/api/community/reviews/${reviewId}`).send({ rating: 2 }),
    2,
    { csrf: true }
  ).expect(403);
  const updated = await authenticated(
    request(app).patch(`/api/community/reviews/${reviewId}`).send({ rating: 4, comment: 'Atualizei minha opinião.' }),
    1,
    { csrf: true }
  ).expect(200);
  assert.equal(updated.body.review.rating, 4);
  assert.equal(updated.body.review.comment, 'Atualizei minha opinião.');

  await authenticated(
    request(app).delete(`/api/community/reviews/${reviewId}`),
    2,
    { csrf: true }
  ).expect(403);
  await authenticated(
    request(app).delete(`/api/community/reviews/${reviewId}`),
    1,
    { csrf: true }
  ).expect(204);

  const stored = database.prepare('SELECT status, comment, removed_at FROM community_place_reviews WHERE id = ?').get(reviewId);
  assert.equal(stored.status, 'REMOVED');
  assert.equal(stored.comment, '[removido pelo autor]');
  assert.ok(stored.removed_at);
  const listing = await authenticated(
    request(app).get(`/api/community/places/${encodeURIComponent(LOCAL_ID)}/reviews`),
    1
  ).expect(200);
  assert.equal(listing.body.summary.count, 0);
  assert.deepEqual(listing.body.reviews, []);
});

test('denúncia e moderação ocultam conteúdo e recalculam a avaliação pública', async (t) => {
  let timestamp = 20_000;
  const { app, database } = setup(t, { now: () => timestamp++ });
  const created = await createReview(app, 1).expect(201);
  const reviewId = created.body.review.id;

  await authenticated(
    request(app).post(`/api/community/reviews/${reviewId}/reports`).send({ reason: 'SPAM' }),
    1,
    { csrf: true }
  ).expect(400);
  const reported = await authenticated(
    request(app).post(`/api/community/reviews/${reviewId}/reports`).send({ reason: 'FALSE_INFORMATION', details: 'Informação não corresponde ao local.' }),
    2,
    { csrf: true }
  ).expect(201);
  assert.equal(reported.body.report.status, 'OPEN');
  await authenticated(
    request(app).post(`/api/community/reviews/${reviewId}/reports`).send({ reason: 'SPAM' }),
    2,
    { csrf: true }
  ).expect(409);

  await authenticated(request(app).get('/api/community/moderation/reports'), 2).expect(403);
  const queue = await authenticated(request(app).get('/api/community/moderation/reports'), 3).expect(200);
  assert.equal(queue.body.reports.length, 1);
  assert.equal(queue.body.reports[0].reviewId, reviewId);

  const hidden = await authenticated(
    request(app)
      .patch(`/api/community/moderation/reviews/${reviewId}`)
      .send({ status: 'HIDDEN', reason: 'Conteúdo confirmado como incorreto.' }),
    3,
    { csrf: true }
  ).expect(200);
  assert.equal(hidden.body.review.status, 'HIDDEN');
  assert.equal(hidden.body.review.moderation.reason, 'Conteúdo confirmado como incorreto.');
  assert.equal(database.prepare("SELECT status FROM community_review_reports WHERE review_id = ?").get(reviewId).status, 'RESOLVED');

  const publicListing = await authenticated(
    request(app).get(`/api/community/places/${encodeURIComponent(LOCAL_ID)}/reviews`),
    2
  ).expect(200);
  assert.equal(publicListing.body.summary.count, 0);
  assert.deepEqual(publicListing.body.reviews, []);

  await authenticated(
    request(app)
      .patch(`/api/community/moderation/reviews/${reviewId}`)
      .send({ status: 'PUBLISHED' }),
    3,
    { csrf: true }
  ).expect(200);
  const restored = await authenticated(
    request(app).get(`/api/community/places/${encodeURIComponent(LOCAL_ID)}/reviews`),
    2
  ).expect(200);
  assert.equal(restored.body.summary.count, 1);
});

test('limitador de escrita é aplicável por usuário sem persistir IP', async (t) => {
  const limiter = createCommunityWriteLimiter({ windowMs: 60_000, limit: 1 });
  const { app } = setup(t, { writeLimiter: limiter });
  await createReview(app, 1).expect(201);
  const limited = await authenticated(
    request(app)
      .post('/api/community/places/google:outro-local/reviews')
      .send({ place: { ...PLACE, name: 'Outro local' }, rating: 4, comment: 'Outro comentário válido.' }),
    1,
    { csrf: true }
  ).expect(429);
  assert.equal(limited.body.code, 'COMMUNITY_RATE_LIMIT');

  await authenticated(
    request(app)
      .post('/api/community/places/google:local-da-maria/reviews')
      .send({ place: { ...PLACE, name: 'Local da Maria' }, rating: 4, comment: 'Avaliação independente.' }),
    2,
    { csrf: true }
  ).expect(201);
});
