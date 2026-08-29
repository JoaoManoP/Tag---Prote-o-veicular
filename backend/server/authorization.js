'use strict';

const ROLES = Object.freeze({ USER: 'USER', ADMIN: 'ADMIN', DEVELOPER: 'DEVELOPER' });
const ROLE_VALUES = new Set(Object.values(ROLES));

function normalizeRole(value) {
  return ROLE_VALUES.has(value) ? value : ROLES.USER;
}

function getUserRole(database, userId) {
  if (!Number.isInteger(Number(userId))) return null;
  const row = database.prepare('SELECT role FROM users WHERE id = ?').get(Number(userId));
  return row ? normalizeRole(row.role) : null;
}

function requireRole(database, ...allowedRoles) {
  const allowed = new Set(allowedRoles.map(normalizeRole));
  return (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Autenticação necessária.' });
    const role = getUserRole(database, req.session.userId);
    if (!role || !allowed.has(role))
      return res.status(403).json({ error: 'Permissão insuficiente.' });
    req.auth = { userId: Number(req.session.userId), role };
    next();
  };
}

function requirePageRole(database, ...allowedRoles) {
  const guard = requireRole(database, ...allowedRoles);
  return (req, res, next) =>
    guard(req, res, error => {
      if (error) return next(error);
      next();
    });
}

module.exports = { ROLES, normalizeRole, getUserRole, requireRole, requirePageRole };
