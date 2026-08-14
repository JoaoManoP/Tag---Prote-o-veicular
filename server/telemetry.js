'use strict';

const ALLOWED_SOURCES = new Set(['mobile-gps', 'simulation']);
const MAX_LIVE_AGE_MS = 5 * 60 * 1000;
const MAX_OFFLINE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 30 * 1000;
const MIN_LIVE_INTERVAL_MS = 250;
const MAX_MESSAGE_BYTES = 12 * 1024;

function haversineMeters(first, second) {
  const radius = 6371000;
  const radians = (value) => value * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

function classifyAccuracy(accuracy) {
  if (!Number.isFinite(accuracy)) return 'Indisponível';
  if (accuracy <= 10) return 'Excelente';
  if (accuracy <= 30) return 'Boa';
  if (accuracy <= 100) return 'Regular';
  return 'Baixa';
}

function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.length <= 40) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function optionalNumber(value, minimum, maximum) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) return null;
  return value;
}

function validateTelemetryPoint(value, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const offline = Boolean(options.offline || value?.capturedOffline);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: 'MALFORMED', error: 'Mensagem de telemetria malformada.' };
  let size;
  try { size = Buffer.byteLength(JSON.stringify(value)); } catch { return { ok: false, code: 'MALFORMED', error: 'Mensagem de telemetria malformada.' }; }
  if (size > MAX_MESSAGE_BYTES) return { ok: false, code: 'TOO_LARGE', error: 'Mensagem de telemetria excede o limite.' };
  if (typeof value.latitude !== 'number' || !Number.isFinite(value.latitude) || value.latitude < -90 || value.latitude > 90) return { ok: false, code: 'INVALID_COORDINATE', error: 'Latitude inválida.' };
  if (typeof value.longitude !== 'number' || !Number.isFinite(value.longitude) || value.longitude < -180 || value.longitude > 180) return { ok: false, code: 'INVALID_COORDINATE', error: 'Longitude inválida.' };
  if (typeof value.accuracy !== 'number' || !Number.isFinite(value.accuracy) || value.accuracy < 0 || value.accuracy > 10000) return { ok: false, code: 'INVALID_ACCURACY', error: 'Precisão inválida.' };
  if (!ALLOWED_SOURCES.has(value.source)) return { ok: false, code: 'INVALID_SOURCE', error: 'Origem de telemetria não autorizada.' };
  if (typeof value.deviceId !== 'string' || !/^[A-Za-z0-9._:-]{3,80}$/.test(value.deviceId)) return { ok: false, code: 'INVALID_DEVICE', error: 'Dispositivo inválido.' };
  const timestamp = parseTimestamp(value.timestamp);
  if (timestamp === null) return { ok: false, code: 'INVALID_TIMESTAMP', error: 'Data da posição inválida.' };
  if (timestamp > now + MAX_FUTURE_SKEW_MS) return { ok: false, code: 'FUTURE_POSITION', error: 'Posição está no futuro.' };
  const maxAge = offline ? MAX_OFFLINE_AGE_MS : MAX_LIVE_AGE_MS;
  if (now - timestamp > maxAge) return { ok: false, code: 'STALE_POSITION', error: 'Posição antiga demais para ser aceita.' };
  if (!Number.isInteger(value.sequence) || value.sequence < 0 || value.sequence > Number.MAX_SAFE_INTEGER) return { ok: false, code: 'INVALID_SEQUENCE', error: 'Sequência inválida.' };
  const speed = optionalNumber(value.speed, 0, 150);
  if (value.speed !== null && value.speed !== undefined && speed === null) return { ok: false, code: 'INVALID_SPEED', error: 'Velocidade inválida.' };
  const heading = optionalNumber(value.heading, 0, 360);
  if (value.heading !== null && value.heading !== undefined && heading === null) return { ok: false, code: 'INVALID_HEADING', error: 'Direção inválida.' };
  const altitude = optionalNumber(value.altitude, -1000, 20000);
  if (value.altitude !== null && value.altitude !== undefined && altitude === null) return { ok: false, code: 'INVALID_ALTITUDE', error: 'Altitude inválida.' };
  const altitudeAccuracy = optionalNumber(value.altitudeAccuracy, 0, 10000);
  if (value.altitudeAccuracy !== null && value.altitudeAccuracy !== undefined && altitudeAccuracy === null) return { ok: false, code: 'INVALID_ALTITUDE_ACCURACY', error: 'Precisão da altitude inválida.' };
  return { ok: true, point: { deviceId: value.deviceId, timestamp, latitude: value.latitude, longitude: value.longitude, accuracy: value.accuracy, altitude, altitudeAccuracy, speed, heading, source: value.source, sequence: value.sequence, capturedOffline: offline, accuracyClass: classifyAccuracy(value.accuracy), suspicious: false, suspicionReason: null, receivedAt: now } };
}

function assessTelemetryPoint(point, previous) {
  if (!previous || point.timestamp <= previous.timestamp) return point;
  const distance = haversineMeters(previous, point);
  const elapsedSeconds = (point.timestamp - previous.timestamp) / 1000;
  const impliedSpeed = distance / elapsedSeconds;
  if (distance > 500 && impliedSpeed > 80) return { ...point, suspicious: true, suspicionReason: `Salto improvável: ${Math.round(distance)} m em ${elapsedSeconds.toFixed(1)} s.` };
  return point;
}

function acceptTelemetryPoint(tracking, value, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const parsed = validateTelemetryPoint(value, { ...options, now });
  if (!parsed.ok) return parsed;
  const point = parsed.point;
  if (!tracking.telemetryState) tracking.telemetryState = new Map();
  const state = tracking.telemetryState.get(point.deviceId) || { lastSequence: -1, lastReceivedAt: 0, previous: null };
  if (!point.capturedOffline && now - state.lastReceivedAt < MIN_LIVE_INTERVAL_MS) return { ok: false, code: 'RATE_LIMITED', error: 'Telemetria enviada com frequência excessiva.' };
  if (point.sequence === state.lastSequence) return { ok: false, code: 'DUPLICATE', error: 'Posição duplicada.' };
  if (point.sequence < state.lastSequence) return { ok: false, code: 'OUT_OF_ORDER', error: 'Sequência fora de ordem.' };
  const assessed = assessTelemetryPoint(point, state.previous);
  tracking.telemetryState.set(point.deviceId, { lastSequence: point.sequence, lastReceivedAt: now, previous: assessed });
  return { ok: true, point: assessed };
}

module.exports = { ALLOWED_SOURCES, MAX_LIVE_AGE_MS, MAX_OFFLINE_AGE_MS, MIN_LIVE_INTERVAL_MS, haversineMeters, classifyAccuracy, validateTelemetryPoint, assessTelemetryPoint, acceptTelemetryPoint };
