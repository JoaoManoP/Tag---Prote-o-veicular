'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeVehicleKey,
  resolveVehicleImage
} = require('../../frontend/web/js/vehicle-images');

test('normaliza marca e modelo com acentos, espaços e hífens', () => {
  assert.equal(normalizeVehicleKey('  Citroën C4-Cactus  '), 'citroen-c4-cactus');
  assert.equal(normalizeVehicleKey('VOLKSWAGEN'), 'volkswagen');
});

test('não inventa imagem quando o catálogo não possui o veículo', () => {
  const car = resolveVehicleImage({ brand: 'Chevrolet', model: 'Onix', type: 'car' });
  assert.deepEqual(car, { url: null, source: 'unavailable', matchedBy: null, candidates: [] });
  assert.equal(resolveVehicleImage({ type: 'motorcycle' }).url, null);
});

test('aceita somente caminho local para futura foto do proprietário', () => {
  assert.equal(
    resolveVehicleImage({ customImageUrl: '/uploads/my-car.webp' }).source,
    'owner-upload'
  );
  assert.equal(
    resolveVehicleImage({ customImageUrl: 'javascript:alert(1)' }).source,
    'unavailable'
  );
  assert.equal(
    resolveVehicleImage({ customImageUrl: 'https://example.com/car.jpg' }).source,
    'unavailable'
  );
});

test('aceita imagens remotas somente dos provedores autorizados', () => {
  const trusted = resolveVehicleImage({
    image: { url: 'https://cdn.trustcar.info/vehicles/vectra.jpg', source: 'trustcar' }
  });
  assert.equal(trusted.source, 'trustcar');
  assert.equal(trusted.matchedBy, 'brand-model');
  assert.equal(
    resolveVehicleImage({ image: { url: 'https://example.com/car.jpg' } }).source,
    'unavailable'
  );
});
