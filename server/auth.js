'use strict';

const bcrypt = require('bcrypt');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeEmail(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function validatePassword(password) { return typeof password === 'string' && password.length >= 8 && password.length <= 72 && /[A-Za-z]/.test(password) && /\d/.test(password); }
function validateRegistration(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = normalizeEmail(body?.email);
  const phone = typeof body?.phone === 'string' ? body.phone.replace(/[^\d+() -]/g, '').trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const errors = [];
  if (name.length < 2 || name.length > 80) errors.push('Nome deve ter entre 2 e 80 caracteres.');
  if (!EMAIL_PATTERN.test(email) || email.length > 160) errors.push('E-mail inválido.');
  if (phone.length > 24) errors.push('Telefone inválido.');
  if (!validatePassword(password)) errors.push('A senha deve ter de 8 a 72 caracteres, com letra e número.');
  return { valid: errors.length === 0, errors, data: { name, email, phone, password } };
}
function requireAuth(req, res, next) { if (!req.session?.userId) return res.status(401).json({ error: 'Autenticação necessária.' }); next(); }
async function hashPassword(password) { return bcrypt.hash(password, 12); }
async function verifyPassword(password, hash) { return bcrypt.compare(password, hash); }

module.exports = { normalizeEmail, validatePassword, validateRegistration, requireAuth, hashPassword, verifyPassword };
