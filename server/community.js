'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireAuth } = require('./auth');
const { ROLES, requireRole } = require('./authorization');

const PLACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:~-]{2,199}$/;
const PROVIDER_PATTERN = /^[a-z][a-z0-9_-]{1,39}$/;
const REPORT_REASONS = new Set(['SPAM', 'ABUSE', 'FALSE_INFORMATION', 'OTHER']);
const MODERATION_STATUSES = new Set(['PUBLISHED', 'HIDDEN']);
const REPORT_STATUSES = new Set(['RESOLVED', 'DISMISSED']);

function parseFeatureFlag(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function normalizeText(value, maximumLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, maximumLength);
}

function validatePlaceId(value) {
  const placeId = typeof value === 'string' ? value.trim() : '';
  return PLACE_ID_PATTERN.test(placeId) ? placeId : null;
}

function validatePlace(value, placeId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Os dados públicos do local são obrigatórios.' };
  }
  const provider = normalizeText(value.provider, 40).toLowerCase();
  const name = normalizeText(value.name, 160);
  const address = normalizeText(value.address, 300);
  if (!PROVIDER_PATTERN.test(provider)) return { error: 'Provedor do local inválido.' };
  const namespaceSeparator = placeId.indexOf(':');
  if (namespaceSeparator > 0 && placeId.slice(0, namespaceSeparator).toLowerCase() !== provider) {
    return { error: 'O identificador do local não corresponde ao provedor informado.' };
  }
  if (name.length < 2) return { error: 'Nome do local inválido.' };

  const hasLatitude = value.latitude !== undefined && value.latitude !== null && value.latitude !== '';
  const hasLongitude = value.longitude !== undefined && value.longitude !== null && value.longitude !== '';
  if (hasLatitude !== hasLongitude) return { error: 'Informe latitude e longitude do local juntas.' };

  let latitude = null;
  let longitude = null;
  if (hasLatitude) {
    latitude = Number(value.latitude);
    longitude = Number(value.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return { error: 'Coordenadas do local inválidas.' };
    }
  }

  return {
    place: { id: placeId, provider, name, address, latitude, longitude }
  };
}

function validateReview(value, { partial = false } = {}) {
  const body = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const hasRating = Object.prototype.hasOwnProperty.call(body, 'rating');
  const hasComment = Object.prototype.hasOwnProperty.call(body, 'comment');
  if (partial && !hasRating && !hasComment) return { error: 'Informe uma nota ou um comentário para atualizar.' };
  if (!partial && (!hasRating || !hasComment)) return { error: 'Nota e comentário são obrigatórios.' };

  let rating;
  if (hasRating) {
    rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { error: 'A nota deve ser um número inteiro de 1 a 5.' };
    }
  }

  let comment;
  if (hasComment) {
    comment = normalizeText(body.comment, 1200);
    if (comment.length < 3) return { error: 'O comentário deve ter entre 3 e 1.200 caracteres.' };
  }
  return { review: { rating, comment } };
}

function validateReport(value) {
  const body = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const reason = normalizeText(body.reason, 40).toUpperCase();
  const details = normalizeText(body.details, 500);
  if (!REPORT_REASONS.has(reason)) return { error: 'Motivo da denúncia inválido.' };
  if (reason === 'OTHER' && details.length < 3) return { error: 'Descreva o motivo da denúncia.' };
  return { report: { reason, details } };
}

function publicDisplayName(value) {
  const words = normalizeText(value, 80).split(/\s+/).filter(Boolean);
  if (!words.length) return 'Usuário Rastreon';
  if (words.length === 1) return words[0];
  return `${words[0]} ${words.at(-1).charAt(0).toUpperCase()}.`;
}

function serializePlace(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeReview(row, currentUserId, { moderation = false } = {}) {
  const author = { displayName: publicDisplayName(row.author_name) };
  if (row.avatar_data) author.avatar = row.avatar_data;
  if (row.chat_enabled && row.public_contact_id) author.contactId = row.public_contact_id;
  const review = {
    id: row.id,
    placeId: row.place_id,
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    author,
    mine: Number(row.user_id) === Number(currentUserId),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (moderation) {
    review.moderation = {
      reason: row.moderation_reason || null,
      moderatedAt: row.moderated_at || null,
      openReports: Number(row.open_reports || 0)
    };
  }
  return review;
}

function initializeCommunitySchema(database) {
  if (!database || typeof database.exec !== 'function' || typeof database.prepare !== 'function') {
    throw new TypeError('Uma conexão SQLite válida é obrigatória para a comunidade.');
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS community_places (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      latitude REAL,
      longitude REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      CHECK(length(id) BETWEEN 3 AND 200),
      CHECK(length(provider) BETWEEN 2 AND 40),
      CHECK(length(name) BETWEEN 2 AND 160),
      CHECK(length(address) <= 300),
      CHECK((latitude IS NULL AND longitude IS NULL) OR
        (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
    );
    CREATE TABLE IF NOT EXISTS community_place_reviews (
      id TEXT PRIMARY KEY,
      place_id TEXT NOT NULL REFERENCES community_places(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL CHECK(length(comment) BETWEEN 3 AND 1200),
      status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK(status IN ('PUBLISHED', 'HIDDEN', 'REMOVED')),
      moderation_reason TEXT,
      moderated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      moderated_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      removed_at INTEGER,
      UNIQUE(place_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_community_reviews_place_status_time
      ON community_place_reviews(place_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_community_reviews_author_time
      ON community_place_reviews(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS community_review_reports (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES community_place_reviews(id) ON DELETE CASCADE,
      reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL CHECK(reason IN ('SPAM', 'ABUSE', 'FALSE_INFORMATION', 'OTHER')),
      details TEXT NOT NULL DEFAULT '' CHECK(length(details) <= 500),
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'RESOLVED', 'DISMISSED')),
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      UNIQUE(review_id, reporter_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_community_reports_status_time
      ON community_review_reports(status, created_at DESC);
  `);
}

function createCommunityWriteLimiter({ windowMs = 60_000, limit = 10 } = {}) {
  return rateLimit({
    windowMs: Math.max(1_000, Number(windowMs) || 60_000),
    limit: Math.max(1, Math.floor(Number(limit) || 10)),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `community-user:${Number(req.session?.userId) || 'anonymous'}`,
    message: {
      error: 'Muitas contribuições em pouco tempo. Aguarde um minuto.',
      code: 'COMMUNITY_RATE_LIMIT'
    }
  });
}

function safeTokenEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || !right) return false;
  const expected = Buffer.from(left);
  const supplied = Buffer.from(right);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function requireCommunityCsrf(req, res, next) {
  if (!safeTokenEqual(req.session?.csrfToken, req.get('x-csrf-token'))) {
    return res.status(403).json({ error: 'Token de segurança inválido.', code: 'INVALID_CSRF_TOKEN' });
  }
  next();
}

function writeAudit(database, { userId, action, targetType, targetId, reason, now }) {
  const auditTable = database.prepare("SELECT 1 AS found FROM sqlite_schema WHERE type = 'table' AND name = 'audit_events'").get();
  if (!auditTable) return;
  database.prepare(`
    INSERT INTO audit_events (actor_user_id, action, target_type, target_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, action, targetType, targetId, normalizeText(reason, 300) || null, now);
}

function upsertPlace(database, place, now) {
  database.prepare(`
    INSERT INTO community_places (id, provider, name, address, latitude, longitude, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      address = CASE WHEN community_places.address = '' THEN excluded.address ELSE community_places.address END,
      latitude = COALESCE(community_places.latitude, excluded.latitude),
      longitude = COALESCE(community_places.longitude, excluded.longitude),
      updated_at = excluded.updated_at
  `).run(place.id, place.provider, place.name, place.address, place.latitude, place.longitude, now, now);
}

function readReview(database, reviewId) {
  return database.prepare(`
    SELECT r.*, u.name AS author_name, u.avatar_data, u.public_contact_id, u.chat_enabled
    FROM community_place_reviews r
    JOIN users u ON u.id = r.user_id
    WHERE r.id = ?
  `).get(reviewId);
}

function listSummary(database, placeId) {
  const row = database.prepare(`
    SELECT COUNT(*) AS review_count, AVG(rating) AS average_rating,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS rating_1,
      SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS rating_2,
      SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS rating_3,
      SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS rating_4,
      SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS rating_5
    FROM community_place_reviews
    WHERE place_id = ? AND status = 'PUBLISHED'
  `).get(placeId);
  const count = Number(row.review_count || 0);
  return {
    count,
    averageRating: count ? Number(Number(row.average_rating).toFixed(2)) : null,
    distribution: {
      1: Number(row.rating_1 || 0),
      2: Number(row.rating_2 || 0),
      3: Number(row.rating_3 || 0),
      4: Number(row.rating_4 || 0),
      5: Number(row.rating_5 || 0)
    }
  };
}

function createCommunityRouter({
  database,
  enabled = process.env.COMMUNITY_PLACES_ENABLED,
  writeLimiter = createCommunityWriteLimiter(),
  csrfMiddleware = requireCommunityCsrf,
  now = () => Date.now()
} = {}) {
  if (!database) throw new TypeError('database é obrigatório.');
  if (typeof writeLimiter !== 'function') throw new TypeError('writeLimiter deve ser um middleware Express.');
  if (typeof csrfMiddleware !== 'function') throw new TypeError('csrfMiddleware deve ser um middleware Express.');

  const active = parseFeatureFlag(enabled, false);
  const router = express.Router();
  router.get('/status', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ enabled: active, version: 1 });
  });
  if (!active) {
    router.use((_req, res) => res.status(404).json({
      error: 'Comentários e avaliações estão desativados.',
      code: 'COMMUNITY_FEATURE_DISABLED'
    }));
    return router;
  }

  initializeCommunitySchema(database);
  router.use(requireAuth);
  const writeGuards = [writeLimiter, csrfMiddleware];
  const administratorOnly = requireRole(database, ROLES.ADMIN);

  router.get('/places/:placeId/reviews', (req, res) => {
    const placeId = validatePlaceId(req.params.placeId);
    if (!placeId) return res.status(400).json({ error: 'Identificador do local inválido.' });
    const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit) || 20)));
    const offset = Math.min(10_000, Math.max(0, Math.floor(Number(req.query.offset) || 0)));
    const rows = database.prepare(`
      SELECT r.*, u.name AS author_name, u.avatar_data, u.public_contact_id, u.chat_enabled
      FROM community_place_reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.place_id = ? AND r.status = 'PUBLISHED'
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ? OFFSET ?
    `).all(placeId, limit, offset);
    const summary = listSummary(database, placeId);
    res.set('Cache-Control', 'private, no-store').json({
      place: serializePlace(database.prepare('SELECT * FROM community_places WHERE id = ?').get(placeId)),
      summary,
      reviews: rows.map((row) => serializeReview(row, req.session.userId)),
      pagination: { limit, offset, total: summary.count, hasMore: offset + rows.length < summary.count }
    });
  });

  router.post('/places/:placeId/reviews', ...writeGuards, (req, res) => {
    const placeId = validatePlaceId(req.params.placeId);
    if (!placeId) return res.status(400).json({ error: 'Identificador do local inválido.' });
    const placeValidation = validatePlace(req.body?.place, placeId);
    if (placeValidation.error) return res.status(400).json({ error: placeValidation.error });
    const reviewValidation = validateReview(req.body);
    if (reviewValidation.error) return res.status(400).json({ error: reviewValidation.error });
    const userId = Number(req.session.userId);
    const existing = database.prepare(`
      SELECT id, status FROM community_place_reviews WHERE place_id = ? AND user_id = ?
    `).get(placeId, userId);
    if (existing) return res.status(409).json({
      error: existing.status === 'REMOVED'
        ? 'Uma avaliação removida para este local não pode ser recriada.'
        : 'Você já avaliou este local. Edite sua avaliação existente.',
      code: 'REVIEW_ALREADY_EXISTS',
      reviewId: existing.id
    });

    const timestamp = Number(now());
    const reviewId = crypto.randomUUID();
    database.transaction(() => {
      upsertPlace(database, placeValidation.place, timestamp);
      database.prepare(`
        INSERT INTO community_place_reviews
          (id, place_id, user_id, rating, comment, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'PUBLISHED', ?, ?)
      `).run(reviewId, placeId, userId, reviewValidation.review.rating,
        reviewValidation.review.comment, timestamp, timestamp);
      writeAudit(database, {
        userId, action: 'COMMUNITY_REVIEW_CREATED', targetType: 'PLACE_REVIEW',
        targetId: reviewId, reason: `Avaliação criada para ${placeId}`, now: timestamp
      });
    })();
    res.status(201).json({
      review: serializeReview(readReview(database, reviewId), userId),
      summary: listSummary(database, placeId)
    });
  });

  router.patch('/reviews/:reviewId', ...writeGuards, (req, res) => {
    const reviewId = validatePlaceId(req.params.reviewId);
    if (!reviewId) return res.status(400).json({ error: 'Identificador da avaliação inválido.' });
    const validation = validateReview(req.body, { partial: true });
    if (validation.error) return res.status(400).json({ error: validation.error });
    const stored = readReview(database, reviewId);
    if (!stored) return res.status(404).json({ error: 'Avaliação não encontrada.' });
    if (Number(stored.user_id) !== Number(req.session.userId)) {
      return res.status(403).json({ error: 'Você só pode editar sua própria avaliação.' });
    }
    if (stored.status === 'REMOVED') return res.status(409).json({ error: 'A avaliação já foi removida.' });

    const timestamp = Number(now());
    database.prepare(`
      UPDATE community_place_reviews SET rating = ?, comment = ?, updated_at = ? WHERE id = ?
    `).run(validation.review.rating ?? stored.rating, validation.review.comment ?? stored.comment, timestamp, reviewId);
    writeAudit(database, {
      userId: Number(req.session.userId), action: 'COMMUNITY_REVIEW_UPDATED', targetType: 'PLACE_REVIEW',
      targetId: reviewId, reason: 'Avaliação atualizada pelo autor', now: timestamp
    });
    res.json({
      review: serializeReview(readReview(database, reviewId), req.session.userId),
      summary: listSummary(database, stored.place_id)
    });
  });

  router.delete('/reviews/:reviewId', ...writeGuards, (req, res) => {
    const reviewId = validatePlaceId(req.params.reviewId);
    if (!reviewId) return res.status(400).json({ error: 'Identificador da avaliação inválido.' });
    const stored = readReview(database, reviewId);
    if (!stored) return res.status(404).json({ error: 'Avaliação não encontrada.' });
    if (Number(stored.user_id) !== Number(req.session.userId)) {
      return res.status(403).json({ error: 'Você só pode remover sua própria avaliação.' });
    }
    if (stored.status === 'REMOVED') return res.status(204).end();
    const timestamp = Number(now());
    database.transaction(() => {
      database.prepare(`
        UPDATE community_place_reviews
        SET status = 'REMOVED', comment = '[removido pelo autor]', moderation_reason = NULL,
          moderated_by = NULL, moderated_at = NULL, updated_at = ?, removed_at = ?
        WHERE id = ?
      `).run(timestamp, timestamp, reviewId);
      database.prepare(`
        UPDATE community_review_reports SET status = 'DISMISSED', resolved_by = ?, resolved_at = ?
        WHERE review_id = ? AND status = 'OPEN'
      `).run(req.session.userId, timestamp, reviewId);
      writeAudit(database, {
        userId: Number(req.session.userId), action: 'COMMUNITY_REVIEW_REMOVED', targetType: 'PLACE_REVIEW',
        targetId: reviewId, reason: 'Avaliação removida pelo autor', now: timestamp
      });
    })();
    res.status(204).end();
  });

  router.post('/reviews/:reviewId/reports', ...writeGuards, (req, res) => {
    const reviewId = validatePlaceId(req.params.reviewId);
    if (!reviewId) return res.status(400).json({ error: 'Identificador da avaliação inválido.' });
    const validation = validateReport(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const review = readReview(database, reviewId);
    if (!review || review.status !== 'PUBLISHED') return res.status(404).json({ error: 'Avaliação não encontrada.' });
    const userId = Number(req.session.userId);
    if (Number(review.user_id) === userId) return res.status(400).json({ error: 'Você não pode denunciar sua própria avaliação.' });
    const existing = database.prepare(`
      SELECT id FROM community_review_reports WHERE review_id = ? AND reporter_user_id = ?
    `).get(reviewId, userId);
    if (existing) return res.status(409).json({ error: 'Esta avaliação já foi denunciada por você.', code: 'REPORT_ALREADY_EXISTS' });

    const timestamp = Number(now());
    const reportId = crypto.randomUUID();
    database.transaction(() => {
      database.prepare(`
        INSERT INTO community_review_reports
          (id, review_id, reporter_user_id, reason, details, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'OPEN', ?)
      `).run(reportId, reviewId, userId, validation.report.reason, validation.report.details, timestamp);
      writeAudit(database, {
        userId, action: 'COMMUNITY_REVIEW_REPORTED', targetType: 'PLACE_REVIEW', targetId: reviewId,
        reason: validation.report.reason, now: timestamp
      });
    })();
    res.status(201).json({ report: { id: reportId, reviewId, status: 'OPEN', createdAt: timestamp } });
  });

  router.get('/moderation/reviews', administratorOnly, (req, res) => {
    const status = normalizeText(req.query.status || 'PUBLISHED', 20).toUpperCase();
    if (!['PUBLISHED', 'HIDDEN', 'REMOVED'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 50)));
    const rows = database.prepare(`
      SELECT r.*, u.name AS author_name, u.avatar_data, u.public_contact_id, u.chat_enabled,
        SUM(CASE WHEN reports.status = 'OPEN' THEN 1 ELSE 0 END) AS open_reports
      FROM community_place_reviews r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN community_review_reports reports ON reports.review_id = r.id
      WHERE r.status = ?
      GROUP BY r.id
      ORDER BY open_reports DESC, r.updated_at DESC
      LIMIT ?
    `).all(status, limit);
    res.set('Cache-Control', 'private, no-store').json({
      reviews: rows.map((row) => serializeReview(row, req.session.userId, { moderation: true }))
    });
  });

  router.patch('/moderation/reviews/:reviewId', administratorOnly, ...writeGuards, (req, res) => {
    const reviewId = validatePlaceId(req.params.reviewId);
    if (!reviewId) return res.status(400).json({ error: 'Identificador da avaliação inválido.' });
    const status = normalizeText(req.body?.status, 20).toUpperCase();
    const reason = normalizeText(req.body?.reason, 300);
    if (!MODERATION_STATUSES.has(status)) return res.status(400).json({ error: 'Ação de moderação inválida.' });
    if (status === 'HIDDEN' && reason.length < 3) return res.status(400).json({ error: 'Informe o motivo da ocultação.' });
    const stored = readReview(database, reviewId);
    if (!stored || stored.status === 'REMOVED') return res.status(404).json({ error: 'Avaliação não encontrada.' });
    const timestamp = Number(now());
    database.transaction(() => {
      database.prepare(`
        UPDATE community_place_reviews SET status = ?, moderation_reason = ?, moderated_by = ?,
          moderated_at = ?, updated_at = ? WHERE id = ?
      `).run(status, status === 'HIDDEN' ? reason : null, req.session.userId, timestamp, timestamp, reviewId);
      if (status === 'HIDDEN') {
        database.prepare(`
          UPDATE community_review_reports SET status = 'RESOLVED', resolved_by = ?, resolved_at = ?
          WHERE review_id = ? AND status = 'OPEN'
        `).run(req.session.userId, timestamp, reviewId);
      }
      writeAudit(database, {
        userId: Number(req.session.userId), action: `COMMUNITY_REVIEW_${status}`,
        targetType: 'PLACE_REVIEW', targetId: reviewId,
        reason: reason || 'Avaliação restaurada pela moderação', now: timestamp
      });
    })();
    const updated = readReview(database, reviewId);
    res.json({ review: serializeReview(updated, req.session.userId, { moderation: true }) });
  });

  router.get('/moderation/reports', administratorOnly, (req, res) => {
    const status = normalizeText(req.query.status || 'OPEN', 20).toUpperCase();
    if (!['OPEN', 'RESOLVED', 'DISMISSED'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const rows = database.prepare(`
      SELECT reports.id, reports.review_id, reports.reason, reports.details, reports.status,
        reports.created_at, reports.resolved_at, places.id AS place_id, places.name AS place_name
      FROM community_review_reports reports
      JOIN community_place_reviews reviews ON reviews.id = reports.review_id
      JOIN community_places places ON places.id = reviews.place_id
      WHERE reports.status = ?
      ORDER BY reports.created_at DESC
      LIMIT 100
    `).all(status);
    res.set('Cache-Control', 'private, no-store').json({
      reports: rows.map((row) => ({
        id: row.id,
        reviewId: row.review_id,
        reason: row.reason,
        details: row.details,
        status: row.status,
        place: { id: row.place_id, name: row.place_name },
        createdAt: row.created_at,
        resolvedAt: row.resolved_at || null
      }))
    });
  });

  router.patch('/moderation/reports/:reportId', administratorOnly, ...writeGuards, (req, res) => {
    const reportId = validatePlaceId(req.params.reportId);
    const status = normalizeText(req.body?.status, 20).toUpperCase();
    if (!reportId) return res.status(400).json({ error: 'Identificador da denúncia inválido.' });
    if (!REPORT_STATUSES.has(status)) return res.status(400).json({ error: 'Resolução da denúncia inválida.' });
    const stored = database.prepare('SELECT id, review_id FROM community_review_reports WHERE id = ?').get(reportId);
    if (!stored) return res.status(404).json({ error: 'Denúncia não encontrada.' });
    const timestamp = Number(now());
    database.prepare(`
      UPDATE community_review_reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?
    `).run(status, req.session.userId, timestamp, reportId);
    writeAudit(database, {
      userId: Number(req.session.userId), action: `COMMUNITY_REPORT_${status}`,
      targetType: 'PLACE_REVIEW_REPORT', targetId: reportId,
      reason: `Denúncia ${status.toLowerCase()}`, now: timestamp
    });
    res.json({ report: { id: reportId, reviewId: stored.review_id, status, resolvedAt: timestamp } });
  });

  return router;
}

module.exports = {
  createCommunityRouter,
  createCommunityWriteLimiter,
  initializeCommunitySchema,
  parseFeatureFlag,
  requireCommunityCsrf,
  validatePlaceId,
  validatePlace,
  validateReview,
  validateReport
};
