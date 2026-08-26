'use strict';

const { distanceMeters } = require('./radar-normalizer');

function bearing(a, b) {
  const rad = value => value * Math.PI / 180, deg = value => value * 180 / Math.PI;
  const y = Math.sin(rad(b.longitude - a.longitude)) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) - Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(b.longitude - a.longitude));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

function angleDifference(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }

function projectOnSegment(point, start, end) {
  const meanLat = (start.latitude + end.latitude + point.latitude) / 3 * Math.PI / 180;
  const scaleX = 111320 * Math.cos(meanLat), scaleY = 110540;
  const ax = start.longitude * scaleX, ay = start.latitude * scaleY, bx = end.longitude * scaleX, by = end.latitude * scaleY;
  const px = point.longitude * scaleX, py = point.latitude * scaleY, dx = bx - ax, dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return { latitude: (ay + t * dy) / scaleY, longitude: (ax + t * dx) / scaleX, t };
}

function matchRadarsToRoute(route, radars, options = {}) {
  const maxDistanceMeters = Math.min(200, Math.max(20, Number(options.maxDistanceMeters) || 80));
  if (!Array.isArray(route) || route.length < 2) return [];
  const points = route.map(value => Array.isArray(value) ? { latitude: Number(value[0]), longitude: Number(value[1]) } : value);
  return (radars || []).flatMap(radar => {
    let best = null, travelled = 0;
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1], end = points[index], projected = projectOnSegment(radar, start, end), distance = distanceMeters(radar, projected);
      const segmentLength = distanceMeters(start, end), routeBearing = bearing(start, end);
      if (!best || distance < best.distanceFromRouteMeters) best = { distanceFromRouteMeters: distance, distanceAlongRouteMeters: travelled + segmentLength * projected.t, routeBearing };
      travelled += segmentLength;
    }
    if (!best || best.distanceFromRouteMeters > maxDistanceMeters) return [];
    const direction = Number(radar.direction);
    if (Number.isFinite(direction) && angleDifference(direction, best.routeBearing) > 70) return [];
    return [{ ...radar, ...best }];
  }).sort((a, b) => a.distanceAlongRouteMeters - b.distanceAlongRouteMeters);
}

module.exports = { matchRadarsToRoute, projectOnSegment, bearing, angleDifference };
