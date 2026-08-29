'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { normalizeEmail, validatePassword, requireAuth, hashPassword } = require('./auth');

const PURPOSES = new Set(['EMAIL_VERIFY', 'PHONE_VERIFY', 'PASSWORD_RESET']);
const NEUTRAL_RESET_MESSAGE =
  'Se existir uma conta associada a este e-mail, um código será enviado.';

function normalizePhone(value) {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

function challengeHash(secret, id, code) {
  return crypto.createHmac('sha256', secret).update(`${id}:${code}`).digest('hex');
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function createDeliveryProvider(environment = process.env) {
  if (environment.AUTH_DELIVERY_PROVIDER === 'mock' && environment.NODE_ENV !== 'production')
    return {
      name: 'mock',
      available: true,
      revealCodes: true,
      async send() {
        return { accepted: true };
      }
    };
  return {
    name: 'unavailable',
    available: false,
    revealCodes: false,
    async send() {
      return { accepted: false };
    }
  };
}

function createAccountChallengeService({ database, secret, deliveryProvider }) {
  const provider = deliveryProvider || createDeliveryProvider();

  async function issue({ user, purpose }) {
    if (!PURPOSES.has(purpose)) throw new Error('Finalidade de desafio inválida.');
    if (!provider.available) return { delivered: false, provider: provider.name };
    const channel = purpose === 'PHONE_VERIFY' ? 'phone' : 'email';
    const target = channel === 'phone' ? normalizePhone(user.phone) : normalizeEmail(user.email);
    if (!target) return { delivered: false, provider: provider.name };
    const id = crypto.randomUUID();
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const now = Date.now();
    database.transaction(() => {
      database
        .prepare(
          'UPDATE account_challenges SET consumed_at=? WHERE user_id=? AND purpose=? AND consumed_at IS NULL'
        )
        .run(now, user.id, purpose);
      database
        .prepare(
          'INSERT INTO account_challenges (id,user_id,purpose,code_hash,expires_at,attempts,max_attempts,created_at) VALUES (?,?,?,?,?,?,?,?)'
        )
        .run(id, user.id, purpose, challengeHash(secret, id, code), now + 12 * 60000, 0, 5, now);
    })();
    const sent = await provider.send({ channel, target, code, purpose });
    if (!sent?.accepted) {
      database
        .prepare('UPDATE account_challenges SET consumed_at=? WHERE id=?')
        .run(Date.now(), id);
      return { delivered: false, provider: provider.name };
    }
    return {
      delivered: true,
      provider: provider.name,
      challengeId: id,
      ...(provider.revealCodes ? { developmentCode: code } : {})
    };
  }

  function consume({ challengeId, code, purpose, userId }) {
    if (
      typeof challengeId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(challengeId) ||
      !/^\d{6}$/.test(String(code))
    )
      return { valid: false, reason: 'INVALID' };
    const challenge = database
      .prepare(
        'SELECT id,user_id,purpose,code_hash,expires_at,attempts,max_attempts,consumed_at FROM account_challenges WHERE id=?'
      )
      .get(challengeId);
    if (
      !challenge ||
      challenge.purpose !== purpose ||
      (userId != null && Number(challenge.user_id) !== Number(userId)) ||
      challenge.consumed_at ||
      challenge.expires_at <= Date.now() ||
      challenge.attempts >= challenge.max_attempts
    )
      return { valid: false, reason: 'EXPIRED_OR_INVALID' };
    const supplied = challengeHash(secret, challenge.id, String(code));
    if (!safeEqualHex(supplied, challenge.code_hash)) {
      database
        .prepare('UPDATE account_challenges SET attempts=attempts+1 WHERE id=?')
        .run(challenge.id);
      return { valid: false, reason: 'INVALID' };
    }
    database
      .prepare('UPDATE account_challenges SET consumed_at=? WHERE id=?')
      .run(Date.now(), challenge.id);
    return { valid: true, userId: challenge.user_id };
  }

  return { issue, consume, provider };
}

function createAccountSecurityRouter({ database, secret, requireCsrf, deliveryProvider }) {
  const router = express.Router();
  const service = createAccountChallengeService({ database, secret, deliveryProvider });
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 6,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req =>
      req.session?.userId ? `user:${req.session.userId}` : ipKeyGenerator(req.ip),
    message: { error: 'Muitas tentativas. Aguarde alguns minutos.' }
  });

  router.post('/password-reset/request', limiter, async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const user = email
        ? database.prepare('SELECT id,email,phone FROM users WHERE email=?').get(email)
        : null;
      const result = user
        ? await service.issue({ user, purpose: 'PASSWORD_RESET' })
        : { delivered: false, provider: service.provider.name };
      res.set('Cache-Control', 'no-store').json({
        message: NEUTRAL_RESET_MESSAGE,
        deliveryAvailable: service.provider.available,
        ...(service.provider.available
          ? {
              challengeId: result.challengeId || crypto.randomUUID(),
              provider: service.provider.name
            }
          : {}),
        ...(service.provider.revealCodes && user ? { developmentCode: result.developmentCode } : {})
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/password-reset/confirm', limiter, async (req, res, next) => {
    try {
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      if (!validatePassword(newPassword))
        return res
          .status(400)
          .json({ error: 'A senha deve ter de 8 a 72 caracteres, com letra e número.' });
      const verification = service.consume({
        challengeId: req.body?.challengeId,
        code: req.body?.code,
        purpose: 'PASSWORD_RESET'
      });
      if (!verification.valid)
        return res.status(400).json({ error: 'Código inválido ou expirado.' });
      const passwordHash = await hashPassword(newPassword);
      database.transaction(() => {
        database
          .prepare('UPDATE users SET password_hash=? WHERE id=?')
          .run(passwordHash, verification.userId);
        for (const row of database.prepare('SELECT sid,data FROM auth_sessions').all()) {
          try {
            if (Number(JSON.parse(row.data)?.userId) === Number(verification.userId))
              database.prepare('DELETE FROM auth_sessions WHERE sid=?').run(row.sid);
          } catch {}
        }
        database
          .prepare(
            "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'PASSWORD_RESET','USER',?,'Desafio de recuperação confirmado',?)"
          )
          .run(verification.userId, String(verification.userId), Date.now());
      })();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  for (const [path, purpose, field, verifiedColumn] of [
    ['email', 'EMAIL_VERIFY', 'email', 'email_verified_at'],
    ['phone', 'PHONE_VERIFY', 'phone', 'phone_verified_at']
  ]) {
    router.post(`/${path}/request`, requireAuth, limiter, requireCsrf, async (req, res, next) => {
      try {
        const user = database
          .prepare(`SELECT id,email,phone FROM users WHERE id=?`)
          .get(req.session.userId);
        const result = await service.issue({ user, purpose });
        if (!result.delivered)
          return res.status(503).json({
            error: `Verificação de ${field === 'email' ? 'e-mail' : 'telefone'} indisponível sem provider configurado.`,
            code: 'DELIVERY_PROVIDER_UNAVAILABLE'
          });
        res.set('Cache-Control', 'no-store').json(result);
      } catch (error) {
        next(error);
      }
    });
    router.post(`/${path}/confirm`, requireAuth, limiter, requireCsrf, (req, res) => {
      const verification = service.consume({
        challengeId: req.body?.challengeId,
        code: req.body?.code,
        purpose,
        userId: req.session.userId
      });
      if (!verification.valid)
        return res.status(400).json({ error: 'Código inválido ou expirado.' });
      database
        .prepare(`UPDATE users SET ${verifiedColumn}=? WHERE id=?`)
        .run(Date.now(), req.session.userId);
      res.status(204).end();
    });
  }

  return { router, service };
}

module.exports = {
  NEUTRAL_RESET_MESSAGE,
  normalizePhone,
  createDeliveryProvider,
  createAccountChallengeService,
  createAccountSecurityRouter
};
