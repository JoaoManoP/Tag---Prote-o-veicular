'use strict';

const crypto = require('node:crypto');

// 128 bits aleatórios: não revela sequência, data de cadastro ou o ID interno do usuário.
const CONTACT_ID_PATTERN = /^RT-[A-F0-9]{32}$/;

function createPublicContactId() {
  return `RT-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
}

function normalizePublicContactId(value) {
  const contactId = String(value || '')
    .trim()
    .toUpperCase();
  return CONTACT_ID_PATTERN.test(contactId) ? contactId : null;
}

function createPublicContactPayload(contactId) {
  const normalized = normalizePublicContactId(contactId);
  return normalized ? `RASTREON:CONTACT:${normalized}` : null;
}

module.exports = {
  CONTACT_ID_PATTERN,
  createPublicContactId,
  normalizePublicContactId,
  createPublicContactPayload
};
