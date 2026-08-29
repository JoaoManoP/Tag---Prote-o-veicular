'use strict';

const crypto = require('node:crypto');
const { TrackerDeviceProvider } = require('./tracker-device-provider');

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function numberInRange(value, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

class TraccarProvider extends TrackerDeviceProvider {
  constructor({ webhookSecret, deviceHashSecret } = {}) {
    super();
    this.webhookSecret = String(webhookSecret || '');
    this.deviceHashSecret = String(deviceHashSecret || webhookSecret || '');
  }

  authorize(value) {
    const supplied = String(value || '').replace(/^Bearer\s+/i, '');
    return this.webhookSecret.length >= 24 && safeEqual(supplied, this.webhookSecret);
  }

  hashExternalId(value) {
    if (this.deviceHashSecret.length < 24)
      throw new Error('TRACCAR_DEVICE_HASH_SECRET não configurado.');
    const externalId = String(value || '').trim();
    if (!externalId || externalId.length > 120) throw new Error('Identificador externo inválido.');
    return crypto.createHmac('sha256', this.deviceHashSecret).update(externalId).digest('hex');
  }

  normalize(payload = {}) {
    const position =
      payload.position && typeof payload.position === 'object' ? payload.position : payload;
    const device = payload.device && typeof payload.device === 'object' ? payload.device : {};
    const externalId = device.uniqueId ?? payload.uniqueId ?? position.deviceId;
    const latitude = numberInRange(position.latitude, -90, 90);
    const longitude = numberInRange(position.longitude, -180, 180);
    const timestamp =
      Date.parse(position.fixTime || position.deviceTime || position.serverTime || '') ||
      Number(position.timestamp);
    if (!externalId || latitude === null || longitude === null || !Number.isFinite(timestamp)) {
      return { ok: false, error: 'Payload Traccar sem dispositivo, coordenadas ou data válidos.' };
    }
    const speedKnots = numberInRange(position.speed, 0, 500);
    const accuracy = numberInRange(position.accuracy, 0, 10000) ?? 25;
    return {
      ok: true,
      externalIdHash: this.hashExternalId(externalId),
      eventKey: String(position.id || payload.event?.id || `${externalId}:${timestamp}`).slice(
        0,
        180
      ),
      point: {
        latitude,
        longitude,
        accuracy,
        speed: speedKnots === null ? null : speedKnots * 0.514444,
        heading: numberInRange(position.course ?? position.heading, 0, 360),
        altitude: numberInRange(position.altitude, -1000, 30000),
        timestamp,
        ignition:
          typeof position.attributes?.ignition === 'boolean' ? position.attributes.ignition : null,
        battery: numberInRange(
          position.attributes?.batteryLevel ?? position.attributes?.battery,
          0,
          100
        ),
        network:
          typeof position.network === 'object'
            ? String(position.network.radioType || '') || null
            : null,
        event: String(payload.event?.type || position.attributes?.alarm || '').slice(0, 80) || null
      }
    };
  }
}

module.exports = { TraccarProvider, safeEqual };
