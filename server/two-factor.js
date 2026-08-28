'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireAuth } = require('./auth');
const { getUserRole, ROLES } = require('./authorization');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encodeBase32(buffer) {
  let bits = 0,
    value = 0,
    output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  let bits = 0,
    current = 0;
  const bytes = [];
  for (const character of String(value || '')
    .toUpperCase()
    .replace(/=|\s|-/g, '')) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new Error('Segredo TOTP inválido.');
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret, timestamp = Date.now(), window = 0) {
  const counter = Math.floor(timestamp / 30000) + window,
    bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(bytes).digest(),
    offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

function verifyTotp(secret, code, timestamp = Date.now()) {
  const supplied = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(supplied)) return false;
  return [-1, 0, 1].some(window =>
    crypto.timingSafeEqual(Buffer.from(totp(secret, timestamp, window)), Buffer.from(supplied))
  );
}

function encryptionKey(secret) {
  const value = String(secret || '');
  if (value.length < 32) throw new Error('SESSION_SECRET insuficiente para proteger o 2FA.');
  return crypto.createHash('sha256').update(`rastreon:2fa:${value}`).digest();
}
function encryptSecret(secret, sessionSecret) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(sessionSecret), iv),
    encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64url')).join('.');
}
function decryptSecret(value, sessionSecret) {
  const [iv, tag, encrypted] = String(value || '')
    .split('.')
    .map(part => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(sessionSecret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
function recoveryHash(code, sessionSecret) {
  return crypto
    .createHmac('sha256', encryptionKey(sessionSecret))
    .update(String(code).toUpperCase())
    .digest('hex');
}
function generateRecoveryCodes() {
  return Array.from(
    { length: 8 },
    () =>
      `${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  );
}
function csrf(req, res, next) {
  const supplied = String(req.get('x-csrf-token') || ''),
    expected = String(req.session?.csrfToken || '');
  if (
    supplied.length !== 64 ||
    expected.length !== 64 ||
    !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return res.status(403).json({ error: 'Token de segurança ausente ou inválido.' });
  next();
}

function verifyUserCode(database, user, code, sessionSecret) {
  if (!user?.two_factor_secret_encrypted) return { valid: false };
  if (verifyTotp(decryptSecret(user.two_factor_secret_encrypted, sessionSecret), code))
    return { valid: true, recovery: false };
  const hashes = JSON.parse(user.two_factor_recovery_hashes || '[]'),
    suppliedHash = recoveryHash(code, sessionSecret),
    index = hashes.findIndex(
      hash =>
        hash.length === suppliedHash.length &&
        crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(suppliedHash))
    );
  if (index < 0) return { valid: false };
  hashes.splice(index, 1);
  database
    .prepare('UPDATE users SET two_factor_recovery_hashes=? WHERE id=?')
    .run(JSON.stringify(hashes), user.id);
  return { valid: true, recovery: true };
}

function createTwoFactorGuard(
  database,
  { sessionSecret = process.env.SESSION_SECRET, requiredRoles = [ROLES.DEVELOPER] } = {}
) {
  const required = new Set(requiredRoles);
  return (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Autenticação necessária.' });
    const role = getUserRole(database, req.session.userId),
      user = database
        .prepare(
          'SELECT id,two_factor_secret_encrypted,two_factor_recovery_hashes,two_factor_enabled FROM users WHERE id=?'
        )
        .get(req.session.userId);
    const mandatory = required.has(role) && process.env.ADMIN_2FA_REQUIRED !== 'false';
    if (!mandatory) return next();
    if (!user?.two_factor_enabled)
      return res.status(428).json({
        error: 'Ative a verificação em duas etapas antes desta ação.',
        code: 'TWO_FACTOR_SETUP_REQUIRED'
      });
    const verification = verifyUserCode(
      database,
      user,
      req.get('x-two-factor-code'),
      sessionSecret
    );
    if (!verification.valid)
      return res.status(403).json({
        error: 'Código de verificação em duas etapas inválido.',
        code: 'TWO_FACTOR_CODE_REQUIRED'
      });
    req.twoFactor = verification;
    next();
  };
}

function createTwoFactorRouter({ database, sessionSecret = process.env.SESSION_SECRET } = {}) {
  const router = express.Router(),
    limiter = rateLimit({
      windowMs: 300000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: req => `user:${req.session?.userId || 'anonymous'}`
    });
  router.get('/status', requireAuth, (req, res) => {
    const user = database
        .prepare('SELECT two_factor_enabled AS enabled FROM users WHERE id=?')
        .get(req.session.userId),
      role = getUserRole(database, req.session.userId);
    res.json({
      twoFactor: {
        enabled: Boolean(user?.enabled),
        required: role === ROLES.DEVELOPER && process.env.ADMIN_2FA_REQUIRED !== 'false'
      }
    });
  });
  router.post('/setup', requireAuth, limiter, csrf, (req, res) => {
    const secret = encodeBase32(crypto.randomBytes(20)),
      recoveryCodes = generateRecoveryCodes(),
      encrypted = encryptSecret(secret, sessionSecret),
      hashes = recoveryCodes.map(code => recoveryHash(code, sessionSecret)),
      user = database.prepare('SELECT email FROM users WHERE id=?').get(req.session.userId);
    database
      .prepare(
        'UPDATE users SET two_factor_secret_encrypted=?,two_factor_recovery_hashes=?,two_factor_enabled=0 WHERE id=?'
      )
      .run(encrypted, JSON.stringify(hashes), req.session.userId);
    const issuer = 'RASTREON',
      label = encodeURIComponent(`${issuer}:${user.email}`),
      uri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    res.set('Cache-Control', 'no-store').json({ setup: { secret, uri, recoveryCodes } });
  });
  router.post('/enable', requireAuth, limiter, csrf, (req, res) => {
    const user = database
      .prepare(
        'SELECT id,two_factor_secret_encrypted,two_factor_recovery_hashes,two_factor_enabled FROM users WHERE id=?'
      )
      .get(req.session.userId);
    if (!user?.two_factor_secret_encrypted)
      return res.status(409).json({ error: 'Inicie a configuração do 2FA primeiro.' });
    let secret;
    try {
      secret = decryptSecret(user.two_factor_secret_encrypted, sessionSecret);
    } catch {
      return res.status(409).json({ error: 'Configuração 2FA corrompida. Inicie novamente.' });
    }
    if (!verifyTotp(secret, req.body?.code))
      return res.status(400).json({ error: 'Código TOTP inválido.' });
    database.prepare('UPDATE users SET two_factor_enabled=1 WHERE id=?').run(req.session.userId);
    database
      .prepare(
        "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'TWO_FACTOR_ENABLED','USER',?,'Ativado pelo titular',?)"
      )
      .run(req.session.userId, String(req.session.userId), Date.now());
    res.json({ twoFactor: { enabled: true } });
  });
  router.post('/disable', requireAuth, limiter, csrf, (req, res) => {
    const user = database
      .prepare(
        'SELECT id,two_factor_secret_encrypted,two_factor_recovery_hashes,two_factor_enabled FROM users WHERE id=?'
      )
      .get(req.session.userId);
    if (!user?.two_factor_enabled) return res.status(409).json({ error: '2FA não está ativo.' });
    const verification = verifyUserCode(database, user, req.body?.code, sessionSecret);
    if (!verification.valid) return res.status(403).json({ error: 'Código 2FA inválido.' });
    database
      .prepare(
        'UPDATE users SET two_factor_secret_encrypted=NULL,two_factor_recovery_hashes=NULL,two_factor_enabled=0 WHERE id=?'
      )
      .run(req.session.userId);
    database
      .prepare(
        "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'TWO_FACTOR_DISABLED','USER',?,'Desativado com confirmação 2FA',?)"
      )
      .run(req.session.userId, String(req.session.userId), Date.now());
    res.json({ twoFactor: { enabled: false } });
  });
  return router;
}

module.exports = {
  createTwoFactorRouter,
  createTwoFactorGuard,
  encodeBase32,
  decodeBase32,
  totp,
  verifyTotp,
  encryptSecret,
  decryptSecret
};
