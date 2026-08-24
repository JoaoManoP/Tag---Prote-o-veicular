'use strict';

function usablePoints(points) {
  if (!Array.isArray(points)) return [];
  const valid = points.filter(point => Number.isFinite(point?.latitude)
    && Number.isFinite(point?.longitude)
    && Math.abs(point.latitude) <= 90
    && Math.abs(point.longitude) <= 180);
  const accurate = valid.filter(point => !Number.isFinite(point.accuracy) || point.accuracy <= 80);
  return accurate.length >= 2 ? accurate : valid;
}

function smoothTrackForDisplay(points) {
  const source = usablePoints(points);
  if (source.length <= 2) return source.map(point => ({ ...point }));
  return source.map((point, index) => {
    if (index === 0 || index === source.length - 1) return { ...point };
    const window = source.slice(Math.max(0, index - 2), Math.min(source.length, index + 3));
    let weightTotal = 0, latitude = 0, longitude = 0;
    for (const candidate of window) {
      const weight = 1 / Math.max(3, Number(candidate.accuracy) || 20);
      latitude += candidate.latitude * weight;
      longitude += candidate.longitude * weight;
      weightTotal += weight;
    }
    return { ...point, latitude: latitude / weightTotal, longitude: longitude / weightTotal };
  });
}

module.exports = { smoothTrackForDisplay };
