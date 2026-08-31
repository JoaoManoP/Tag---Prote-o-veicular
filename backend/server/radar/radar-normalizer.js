'use strict';

const crypto = require('node:crypto');

const TYPES = new Set([
  'fixed_speed_camera',
  'mobile_camera',
  'traffic_light_camera',
  'lane_camera',
  'average_speed_camera',
  'electronic_speed_bump'
]);
const SOURCES = new Set(['OFFICIAL', 'COMMUNITY', 'PARTNER', 'SIMULATION']);

function optionalText(value, max = 160) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function normalizeRadar(input = {}) {
  const latitude = Number(input.latitude),
    longitude = Number(input.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    throw new TypeError('Coordenadas de radar inválidas.');
  const type = TYPES.has(input.type) ? input.type : 'fixed_speed_camera';
  const sourceKind = SOURCES.has(input.sourceKind) ? input.sourceKind : 'OFFICIAL';
  const speedLimit = input.speedLimit == null ? null : Number(input.speedLimit);
  if (speedLimit != null && (!Number.isInteger(speedLimit) || speedLimit < 10 || speedLimit > 200))
    throw new TypeError('Limite de velocidade inválido.');
  const confidence = Math.min(
    1,
    Math.max(0, Number(input.confidence ?? (sourceKind === 'OFFICIAL' ? 0.9 : 0.5)))
  );
  const provider = optionalText(input.provider || input.source, 80);
  if (!provider) throw new TypeError('A fonte do radar é obrigatória.');
  const normalized = {
    type,
    latitude,
    longitude,
    address: optionalText(input.address, 240),
    road: optionalText(input.road, 100),
    km: optionalText(input.km, 40),
    direction: input.direction == null ? null : Number(input.direction),
    speedLimit,
    provider,
    sourceKind,
    verified: Boolean(input.verified),
    lastVerifiedAt: input.lastVerifiedAt == null ? null : Number(input.lastVerifiedAt),
    confidence,
    status: optionalText(input.status || 'ACTIVE', 30),
    city: optionalText(input.city, 100),
    state: optionalText(input.state, 2)?.toUpperCase() || null
  };
  normalized.fingerprint = crypto
    .createHash('sha256')
    .update([latitude.toFixed(6), longitude.toFixed(6), type, speedLimit || 0, provider].join('|'))
    .digest('hex');
  return normalized;
}

function distanceMeters(a, b) {
  const rad = value => (value * Math.PI) / 180,
    dLat = rad(b.latitude - a.latitude),
    dLng = rad(b.longitude - a.longitude);
  const q =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(q));
}

function areProbableDuplicates(a, b, thresholdMeters = 25) {
  if (distanceMeters(a, b) > thresholdMeters) return false;
  if (a.road && b.road && a.road.toLocaleLowerCase('pt-BR') !== b.road.toLocaleLowerCase('pt-BR'))
    return false;
  if (a.km && b.km && a.km !== b.km) return false;
  return a.type === b.type || a.speedLimit === b.speedLimit;
}

module.exports = { normalizeRadar, areProbableDuplicates, distanceMeters, TYPES, SOURCES };
