import { mergeQueue } from '../services/offlineQueue';
const point = (sequence: number, eventId = `e${sequence}`) => ({
  latitude: -19,
  longitude: -42,
  accuracy: 10,
  timestamp: sequence,
  sequence,
  eventId
});
test('fila ordena e não duplica eventId', () => {
  const values = mergeQueue([point(2)], point(1));
  expect(values.map(v => v.sequence)).toEqual([1, 2]);
  expect(mergeQueue(values, point(3, 'e2'))).toHaveLength(2);
});
