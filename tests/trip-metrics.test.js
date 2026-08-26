'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTrackMetrics } = require('../server/trip-metrics');

test('métricas removem oscilação de GPS de um veículo parado', () => {
  const track = [
    { latitude: -19.5, longitude: -42.6, accuracy: 12, speed: 0, timestamp: 0 },
    { latitude: -19.50002, longitude: -42.60002, accuracy: 14, speed: 0, timestamp: 10000 },
    { latitude: -19.49999, longitude: -42.59999, accuracy: 12, speed: 0, timestamp: 20000 }
  ];
  const metrics = calculateTrackMetrics(track);
  assert.equal(metrics.distanceMeters, 0);
  assert.equal(metrics.stoppedSeconds, 20);
  assert.equal(metrics.movingSeconds, 0);
});

test('métricas acumulam deslocamento urbano e tempo observado', () => {
  const track = [
    { latitude: 0, longitude: 0, accuracy: 5, speed: 10, timestamp: 0 },
    { latitude: 0, longitude: 0.001, accuracy: 5, speed: 10, timestamp: 10000 },
    { latitude: 0, longitude: 0.002, accuracy: 5, speed: 10, timestamp: 20000 }
  ];
  const metrics = calculateTrackMetrics(track);
  assert.ok(metrics.distanceMeters > 220 && metrics.distanceMeters < 225);
  assert.equal(metrics.movingSeconds, 20);
  assert.equal(metrics.unclassifiedSeconds, 0);
});

test('métricas não inventam distância em lacuna longa ou salto impossível', () => {
  const track = [
    { latitude: 0, longitude: 0, accuracy: 5, speed: 0, timestamp: 0 },
    { latitude: 1, longitude: 1, accuracy: 5, speed: 0, timestamp: 1000 },
    { latitude: 1.001, longitude: 1.001, accuracy: 5, speed: 5, timestamp: 301000 }
  ];
  const metrics = calculateTrackMetrics(track);
  assert.equal(metrics.distanceMeters, 0);
  assert.equal(metrics.unclassifiedSeconds, 301);
});
