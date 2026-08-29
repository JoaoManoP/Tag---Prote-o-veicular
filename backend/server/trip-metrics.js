'use strict';

const EARTH_RADIUS_METERS = 6371000;

function haversineMeters(first, second) {
  const radians = value => (value * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(value));
}

function validPoint(point) {
  return (
    point &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude)) &&
    Math.abs(Number(point.latitude)) <= 90 &&
    Math.abs(Number(point.longitude)) <= 180 &&
    Number.isFinite(Number(point.timestamp))
  );
}

function accuracyOf(point) {
  return Number.isFinite(Number(point?.accuracy)) ? Math.max(0, Number(point.accuracy)) : 25;
}

function movementThreshold(first, second) {
  // GPS de navegador oscila mesmo parado. A banda morta cresce com a incerteza,
  // mas é limitada para não apagar deslocamentos urbanos reais.
  return Math.max(3, Math.min(25, (accuracyOf(first) + accuracyOf(second)) * 0.35));
}

function calculateTrackMetrics(points, options = {}) {
  const maximumAccuracy = Number(options.maximumAccuracy) || 120;
  const maximumGapMs = Number(options.maximumGapMs) || 120000;
  const maximumSpeedMps = Number(options.maximumSpeedMps) || 70;
  const source = (Array.isArray(points) ? points : [])
    .filter(validPoint)
    .map(point => ({
      ...point,
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      timestamp: Number(point.timestamp)
    }))
    .sort((first, second) => first.timestamp - second.timestamp);
  const accurate = source.filter(
    point => !point.suspicious && accuracyOf(point) <= maximumAccuracy
  );
  const track = accurate.length >= 2 ? accurate : source.filter(point => !point.suspicious);

  if (track.length < 2)
    return {
      distanceMeters: 0,
      movingSeconds: 0,
      stoppedSeconds: 0,
      unclassifiedSeconds: 0,
      averageSpeedKmh: 0,
      maximumSpeedKmh: Math.max(0, ...track.map(point => Number(point.speed) || 0)) * 3.6,
      sampleCount: track.length,
      discardedPointCount: Math.max(0, source.length - track.length)
    };

  let distanceMeters = 0;
  let movingMs = 0;
  let stoppedMs = 0;
  let unclassifiedMs = 0;
  let distanceAnchor = track[0];

  for (let index = 1; index < track.length; index += 1) {
    const previous = track[index - 1];
    const current = track[index];
    const elapsedMs = current.timestamp - previous.timestamp;
    if (!(elapsedMs > 0)) continue;
    if (elapsedMs > maximumGapMs) {
      unclassifiedMs += elapsedMs;
      distanceAnchor = current;
      continue;
    }

    const elapsedSeconds = elapsedMs / 1000;
    const step = haversineMeters(distanceAnchor, current);
    const accuracyAllowance = accuracyOf(distanceAnchor) + accuracyOf(current);
    const speeds = [previous.speed, current.speed]
      .filter(value => value !== null && value !== undefined)
      .map(Number)
      .filter(Number.isFinite);
    // Registros legados podem não ter velocidade. Neles mantemos o teto histórico
    // de 2 km por amostra; com velocidade disponível usamos validação física estrita.
    const plausibleDistance = speeds.length
      ? elapsedSeconds * maximumSpeedMps + Math.max(100, accuracyAllowance)
      : Math.max(2000, elapsedSeconds * maximumSpeedMps + Math.max(100, accuracyAllowance));
    if (step > plausibleDistance) {
      unclassifiedMs += elapsedMs;
      distanceAnchor = current;
      continue;
    }

    const threshold = movementThreshold(distanceAnchor, current);
    const speedMps = speeds.length
      ? speeds.reduce((sum, value) => sum + Math.max(0, value), 0) / speeds.length
      : null;
    const moved = step > threshold;
    if (moved) {
      distanceMeters += step;
      distanceAnchor = current;
    }

    if ((speedMps !== null && speedMps >= 0.8) || (moved && step / elapsedSeconds >= 0.8))
      movingMs += elapsedMs;
    else stoppedMs += elapsedMs;
  }

  const maximumSpeedKmh = Math.max(0, ...track.map(point => Number(point.speed) || 0)) * 3.6;
  const movingSeconds = movingMs / 1000;
  return {
    distanceMeters,
    movingSeconds,
    stoppedSeconds: stoppedMs / 1000,
    unclassifiedSeconds: unclassifiedMs / 1000,
    averageSpeedKmh: movingSeconds > 0 ? (distanceMeters / movingSeconds) * 3.6 : 0,
    maximumSpeedKmh,
    sampleCount: track.length,
    discardedPointCount: Math.max(0, source.length - track.length)
  };
}

module.exports = { calculateTrackMetrics, haversineMeters, movementThreshold };
