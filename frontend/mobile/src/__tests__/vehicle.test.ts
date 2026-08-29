import { connectionState, isValidPlate, normalizePlate } from '../utils/vehicle';
test('normaliza placas antigas e Mercosul', () => {
  expect(normalizePlate('abc-1d23')).toBe('ABC1D23');
  expect(isValidPlate('ABC1234')).toBe(true);
  expect(isValidPlate('ABC1D23')).toBe(true);
  expect(isValidPlate('ABC12')).toBe(false);
});
test('distingue conexão offline e atualização antiga', () => {
  expect(connectionState(Date.now(), false)).toBe('OFFLINE');
  expect(connectionState(1, true, 200000)).toBe('STALE');
});
