'use strict';

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit').rateLimit;
const { ROLES, getUserRole, requireRole } = require('./authorization');
const { normalizePublicContactId } = require('./contact-id');

const id = () => crypto.randomBytes(16).toString('hex');
const now = () => Date.now();
function publicContactId(value) {
  return normalizePublicContactId(value);
}

function activeMember(database, convoyId, userId) {
  return database
    .prepare(
      `SELECT s.id,s.owner_user_id AS ownerId FROM convoy_sessions s
       JOIN convoy_members m ON m.convoy_id=s.id
       WHERE s.id=? AND s.status='ACTIVE' AND m.user_id=? AND m.status='ACCEPTED'`
    )
    .get(convoyId, userId);
}

function convoyState(database, userId) {
  const profile = database
    .prepare('SELECT id AS userId,name,public_contact_id AS contactId FROM users WHERE id=?')
    .get(userId);
  const connections = database
    .prepare(
      `SELECT c.id,c.status,c.requester_user_id AS requesterId,u.id AS userId,u.name,u.public_contact_id AS contactId
       FROM user_connections c JOIN users u ON u.id=CASE WHEN c.requester_user_id=? THEN c.recipient_user_id ELSE c.requester_user_id END
       WHERE (c.requester_user_id=? OR c.recipient_user_id=?) ORDER BY c.updated_at DESC`
    )
    .all(userId, userId, userId);
  const invites = database
    .prepare(
      `SELECT i.id,i.convoy_id AS convoyId,i.status,i.expires_at AS expiresAt,u.name AS ownerName
       FROM convoy_invites i JOIN convoy_sessions s ON s.id=i.convoy_id JOIN users u ON u.id=s.owner_user_id
       WHERE i.invited_user_id=? AND i.status='PENDING' AND s.status='ACTIVE' ORDER BY i.created_at DESC`
    )
    .all(userId);
  const convoy = database
    .prepare(
      `SELECT s.id,s.owner_user_id AS ownerId,s.created_at AS createdAt FROM convoy_sessions s
       JOIN convoy_members m ON m.convoy_id=s.id
       WHERE m.user_id=? AND m.status='ACCEPTED' AND s.status='ACTIVE' ORDER BY s.created_at DESC LIMIT 1`
    )
    .get(userId);
  if (convoy)
    convoy.members = database
      .prepare(
        `SELECT m.user_id AS userId,m.status,m.joined_at AS joinedAt,u.name,u.public_contact_id AS contactId
         FROM convoy_members m JOIN users u ON u.id=m.user_id WHERE m.convoy_id=? ORDER BY m.joined_at`
      )
      .all(convoy.id);
  return { enabled: true, profile, connections, invites, convoy: convoy || null };
}

function createConvoyRouter({
  database,
  requireCsrf,
  writeLimiter,
  twoFactorGuard = (_req, _res, next) => next()
}) {
  const router = express.Router();
  const admin = requireRole(database, ROLES.ADMIN);
  const writes = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => `convoy-admin:${req.session?.userId || 'anonymous'}`,
    message: { error: 'Muitas ações de comboio. Aguarde um minuto.' }
  });
  router.use(admin, twoFactorGuard);
  router.get('/', (req, res) => res.json(convoyState(database, req.auth.userId)));
  router.use(writeLimiter || writes, requireCsrf);

  router.post('/connections', (req, res) => {
    const contactId = publicContactId(req.body?.contactId);
    if (!contactId)
      return res.status(400).json({ error: 'ID RASTREON inválido.' });
    const recipient = database
      .prepare("SELECT id,name FROM users WHERE public_contact_id=? AND role='ADMIN'")
      .get(contactId);
    if (!recipient || recipient.id === req.auth.userId)
      return res.status(404).json({ error: 'Administrador não encontrado.' });
    const existing = database
      .prepare(
        'SELECT id,status FROM user_connections WHERE (requester_user_id=? AND recipient_user_id=?) OR (requester_user_id=? AND recipient_user_id=?)'
      )
      .get(req.auth.userId, recipient.id, recipient.id, req.auth.userId);
    if (existing)
      return res
        .status(409)
        .json({ error: 'Já existe uma solicitação ou conexão.', connection: existing });
    const connectionId = id();
    database
      .prepare(
        'INSERT INTO user_connections (id,requester_user_id,recipient_user_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?)'
      )
      .run(connectionId, req.auth.userId, recipient.id, 'PENDING', now(), now());
    res
      .status(201)
      .json({ connection: { id: connectionId, status: 'PENDING', name: recipient.name } });
  });

  router.patch('/connections/:id', (req, res) => {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['ACCEPTED', 'REJECTED'].includes(status))
      return res.status(400).json({ error: 'Estado inválido.' });
    const result = database
      .prepare(
        "UPDATE user_connections SET status=?,updated_at=? WHERE id=? AND recipient_user_id=? AND status='PENDING'"
      )
      .run(status, now(), req.params.id, req.auth.userId);
    if (!result.changes)
      return res.status(404).json({ error: 'Solicitação pendente não encontrada.' });
    res.json({ ok: true, status });
  });

  router.post('/sessions', (req, res) => {
    const current = convoyState(database, req.auth.userId).convoy;
    if (current) return res.status(409).json({ error: 'Você já participa de um comboio ativo.' });
    const convoyId = id(),
      timestamp = now();
    database.transaction(() => {
      database
        .prepare(
          "INSERT INTO convoy_sessions (id,owner_user_id,status,created_at) VALUES (?,?,'ACTIVE',?)"
        )
        .run(convoyId, req.auth.userId, timestamp);
      database
        .prepare(
          "INSERT INTO convoy_members (convoy_id,user_id,status,joined_at) VALUES (?,?,'ACCEPTED',?)"
        )
        .run(convoyId, req.auth.userId, timestamp);
    })();
    res.status(201).json({ convoy: convoyState(database, req.auth.userId).convoy });
  });

  router.post('/sessions/:id/invites', (req, res) => {
    const session = database
      .prepare(
        "SELECT owner_user_id AS ownerId FROM convoy_sessions WHERE id=? AND status='ACTIVE'"
      )
      .get(req.params.id);
    if (!session || session.ownerId !== req.auth.userId)
      return res.status(403).json({ error: 'Somente o responsável pode convidar.' });
    const contactId = publicContactId(req.body?.contactId);
    const target = database
      .prepare("SELECT id,name FROM users WHERE public_contact_id=? AND role='ADMIN'")
      .get(contactId);
    if (!target) return res.status(404).json({ error: 'Administrador não encontrado.' });
    const connected = database
      .prepare(
        "SELECT 1 FROM user_connections WHERE status='ACCEPTED' AND ((requester_user_id=? AND recipient_user_id=?) OR (requester_user_id=? AND recipient_user_id=?))"
      )
      .get(req.auth.userId, target.id, target.id, req.auth.userId);
    if (!connected)
      return res.status(403).json({ error: 'Aceitem primeiro a conexão entre administradores.' });
    const inviteId = id(),
      token = crypto.randomBytes(32).toString('base64url'),
      timestamp = now();
    database
      .prepare(
        "INSERT INTO convoy_invites (id,convoy_id,invited_user_id,token_hash,status,expires_at,created_at) VALUES (?,?,?,?, 'PENDING',?,?)"
      )
      .run(
        inviteId,
        req.params.id,
        target.id,
        crypto.createHash('sha256').update(token).digest('hex'),
        timestamp + 30 * 60 * 1000,
        timestamp
      );
    res
      .status(201)
      .json({ invite: { id: inviteId, name: target.name, expiresAt: timestamp + 30 * 60 * 1000 } });
  });

  router.patch('/invites/:id', (req, res) => {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['ACCEPTED', 'REJECTED'].includes(status))
      return res.status(400).json({ error: 'Estado inválido.' });
    const invite = database
      .prepare(
        "SELECT convoy_id AS convoyId,expires_at AS expiresAt FROM convoy_invites WHERE id=? AND invited_user_id=? AND status='PENDING'"
      )
      .get(req.params.id, req.auth.userId);
    if (!invite || invite.expiresAt <= now())
      return res.status(404).json({ error: 'Convite inválido ou expirado.' });
    database.transaction(() => {
      database.prepare('UPDATE convoy_invites SET status=? WHERE id=?').run(status, req.params.id);
      if (status === 'ACCEPTED')
        database
          .prepare(
            "INSERT INTO convoy_members (convoy_id,user_id,status,joined_at) VALUES (?,?,'ACCEPTED',?) ON CONFLICT(convoy_id,user_id) DO UPDATE SET status='ACCEPTED',joined_at=excluded.joined_at,left_at=NULL"
          )
          .run(invite.convoyId, req.auth.userId, now());
    })();
    res.json({ ok: true, status, convoyId: status === 'ACCEPTED' ? invite.convoyId : null });
  });

  router.post('/sessions/:id/leave', (req, res) => {
    const session = activeMember(database, req.params.id, req.auth.userId);
    if (!session) return res.status(404).json({ error: 'Comboio ativo não encontrado.' });
    if (session.ownerId === req.auth.userId)
      return res.status(400).json({ error: 'O responsável deve encerrar o comboio.' });
    database
      .prepare("UPDATE convoy_members SET status='LEFT',left_at=? WHERE convoy_id=? AND user_id=?")
      .run(now(), req.params.id, req.auth.userId);
    res.json({ ok: true });
  });

  router.post('/sessions/:id/end', (req, res) => {
    const session = database
      .prepare(
        "SELECT owner_user_id AS ownerId FROM convoy_sessions WHERE id=? AND status='ACTIVE'"
      )
      .get(req.params.id);
    if (!session || session.ownerId !== req.auth.userId)
      return res.status(403).json({ error: 'Somente o responsável pode encerrar.' });
    database.transaction(() => {
      database
        .prepare("UPDATE convoy_sessions SET status='ENDED',ended_at=? WHERE id=?")
        .run(now(), req.params.id);
      database
        .prepare(
          "UPDATE convoy_members SET status='ENDED',left_at=? WHERE convoy_id=? AND status='ACCEPTED'"
        )
        .run(now(), req.params.id);
      database
        .prepare("UPDATE convoy_invites SET status='ENDED' WHERE convoy_id=? AND status='PENDING'")
        .run(req.params.id);
    })();
    res.json({ ok: true });
  });
  return router;
}

function installConvoySocket({ io, database }) {
  io.on('connection', socket => {
    socket.on('convoy:join', ({ convoyId } = {}, acknowledge = () => {}) => {
      const userId = Number(socket.request.session?.userId);
      const account = database
        .prepare('SELECT role,two_factor_enabled AS twoFactorEnabled FROM users WHERE id=?')
        .get(userId);
      const requiresTwoFactor = process.env.ADMIN_2FA_REQUIRED !== 'false';
      if (
        getUserRole(database, userId) !== ROLES.ADMIN ||
        (requiresTwoFactor && !account?.twoFactorEnabled) ||
        !activeMember(database, convoyId, userId)
      )
        return acknowledge({ ok: false, error: 'Acesso ao comboio não autorizado.' });
      socket.join(`convoy:${convoyId}`);
      socket.data.convoyId = convoyId;
      acknowledge({ ok: true });
    });
    socket.on('convoy:position', (payload = {}, acknowledge = () => {}) => {
      const userId = Number(socket.request.session?.userId),
        convoyId = socket.data.convoyId;
      if (!convoyId || !activeMember(database, convoyId, userId)) return acknowledge({ ok: false });
      if (socket.data.lastConvoyPositionAt && now() - socket.data.lastConvoyPositionAt < 900)
        return acknowledge({ ok: false, error: 'Atualização muito frequente.' });
      const latitude = Number(payload.latitude),
        longitude = Number(payload.longitude);
      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      )
        return acknowledge({ ok: false, error: 'Posição inválida.' });
      socket.data.lastConvoyPositionAt = now();
      const user = database.prepare('SELECT name FROM users WHERE id=?').get(userId);
      socket.to(`convoy:${convoyId}`).emit('convoy:position', {
        userId,
        name: user.name,
        latitude,
        longitude,
        heading: Number.isFinite(Number(payload.heading)) ? Number(payload.heading) : null,
        timestamp: now()
      });
      acknowledge({ ok: true });
    });
  });
}

module.exports = { createConvoyRouter, installConvoySocket, convoyState, publicContactId };
