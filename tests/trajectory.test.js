'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { smoothTrackForDisplay } = require('../server/trajectory');

test('trajeto de exibição preserva extremos e reduz ruído intermediário', () => {
  const track = [
    { latitude: -19.5, longitude: -42.6, accuracy: 8, timestamp: 1 },
    { latitude: -19.499, longitude: -42.595, accuracy: 60, timestamp: 2 },
    { latitude: -19.498, longitude: -42.598, accuracy: 8, timestamp: 3 },
    { latitude: -19.497, longitude: -42.597, accuracy: 8, timestamp: 4 }
  ];
  const display = smoothTrackForDisplay(track);
  assert.deepEqual(display[0], track[0]);
  assert.deepEqual(display.at(-1), track.at(-1));
  assert.equal(display.length, track.length);
  assert.ok(display[1].longitude < track[1].longitude);
});

test('trajeto de exibição ignora pontos de precisão muito baixa sem apagar o histórico bruto', () => {
  const track = [
    { latitude: 0, longitude: 0, accuracy: 10 },
    { latitude: 1, longitude: 1, accuracy: 500 },
    { latitude: 0.001, longitude: 0.001, accuracy: 10 }
  ];
  const display = smoothTrackForDisplay(track);
  assert.equal(track.length, 3);
  assert.equal(display.length, 2);
});
