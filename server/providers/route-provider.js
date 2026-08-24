'use strict';

class RouteProvider {
  async calculate() { throw new Error('RouteProvider.calculate precisa ser implementado.'); }
}

class OsrmRouteProvider extends RouteProvider {
  constructor(options = {}) { super(); this.baseUrl = options.baseUrl || 'https://router.project-osrm.org'; this.timeoutMs = options.timeoutMs || 12000; }
  async calculate(from, to) {
    const coordinates = `${from.join(',')};${to.join(',')}`;
    const url = `${this.baseUrl}/route/v1/driving/${coordinates}?alternatives=3&overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Rastreon/1.1 (local educational demo)', Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs) });
    if (!response.ok) throw new Error(`Roteador respondeu ${response.status}`);
    const data = await response.json();
    if (data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) return [];
    return data.routes.slice(0, 3).map((route, index) => ({ id: index, primary: index === 0, distance: route.distance, duration: route.duration, geometry: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]) }));
  }
}

module.exports = { RouteProvider, OsrmRouteProvider };
