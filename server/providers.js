'use strict';

function decodePolyline(encoded = '') {
  const points = []; let index = 0, latitude = 0, longitude = 0;
  while (index < encoded.length) {
    for (const coordinate of ['latitude', 'longitude']) {
      let result = 0, shift = 0, byte;
      do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 31) << shift; shift += 5; } while (byte >= 32 && index <= encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (coordinate === 'latitude') latitude += delta; else longitude += delta;
    }
    points.push([latitude / 1e5, longitude / 1e5]);
  }
  return points;
}

async function requestJson(fetchImpl, url, options = {}, timeoutMs = 12000) {
  const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Provider respondeu ${response.status}`);
  return response.json();
}

class NominatimGeocodingProvider {
  constructor({ fetchImpl = fetch, baseUrl = 'https://nominatim.openstreetmap.org', timeoutMs = 12000 } = {}) { this.fetch = fetchImpl; this.baseUrl = baseUrl; this.timeoutMs = timeoutMs; this.cache = new Map(); }
  async search(query, options = {}) { const key = `${query}|${options.countryCode || 'br'}`.toLowerCase(); if (this.cache.has(key)) return this.cache.get(key); const data = await requestJson(this.fetch, `${this.baseUrl}/search?format=jsonv2&limit=6&countrycodes=${encodeURIComponent(options.countryCode || 'br')}&q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'Rastreon/1.0 (local educational demo)', 'Accept-Language': 'pt-BR,pt;q=0.9' } }, this.timeoutMs); if (!Array.isArray(data)) throw new Error('Resposta de geocodificação inválida'); const results = data.map((item) => ({ label: String(item.display_name || '').slice(0, 300), latitude: Number(item.lat), longitude: Number(item.lon), type: String(item.type || '').slice(0, 40), provider: 'nominatim' })).filter((item) => item.label && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)); this.cache.set(key, results); return results; }
}

class OsrmRouteProvider {
  constructor({ fetchImpl = fetch, baseUrl = 'https://router.project-osrm.org', timeoutMs = 12000 } = {}) { this.fetch = fetchImpl; this.baseUrl = baseUrl; this.timeoutMs = timeoutMs; }
  async calculateRoute({ origin, destination, alternatives = 3 }) { const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`; const data = await requestJson(this.fetch, `${this.baseUrl}/route/v1/driving/${coordinates}?alternatives=${Math.min(3, Math.max(0, alternatives))}&overview=full&geometries=geojson&steps=false`, {}, this.timeoutMs); if (data.code !== 'Ok' || !Array.isArray(data.routes)) throw new Error('Nenhuma rota rodoviária encontrada'); return { provider: 'osrm', traffic: 'unavailable', tolls: 'unavailable', routes: data.routes.slice(0, 3).map((route, index) => ({ routeId: String(index), primary: index === 0, distanceMeters: Number(route.distance), durationSeconds: Number(route.duration), durationInTrafficSeconds: null, geometry: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]), tolls: null, roadClasses: null, confidence: null })) }; }
}

class GoogleRouteProvider {
  constructor({ apiKey, fetchImpl = fetch, timeoutMs = 12000 } = {}) { if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY é obrigatória para ROUTE_PROVIDER=google'); this.apiKey = apiKey; this.fetch = fetchImpl; this.timeoutMs = timeoutMs; }
  async calculateRoute({ origin, destination, vehicleType = 'car', departureTime, alternatives = 3, traffic = true }) { const body = { origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } }, destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } }, travelMode: vehicleType === 'motorcycle' ? 'TWO_WHEELER' : 'DRIVE', computeAlternativeRoutes: alternatives > 0, languageCode: 'pt-BR', units: 'METRIC' }; if (traffic) body.routingPreference = 'TRAFFIC_AWARE'; if (departureTime) body.departureTime = new Date(departureTime).toISOString(); const data = await requestJson(this.fetch, 'https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline,routes.routeLabels,routes.warnings' }, body: JSON.stringify(body) }, this.timeoutMs); if (!Array.isArray(data.routes) || !data.routes.length) throw new Error('Nenhuma rota rodoviária encontrada'); const seconds = value => value ? Number.parseFloat(String(value).replace('s', '')) : null; return { provider: 'google', traffic: traffic ? 'available' : 'not_requested', tolls: 'unavailable', routes: data.routes.slice(0, 3).map((route, index) => ({ routeId: String(index), primary: index === 0, distanceMeters: Number(route.distanceMeters), durationSeconds: seconds(route.staticDuration) ?? seconds(route.duration), durationInTrafficSeconds: traffic ? seconds(route.duration) : null, geometry: decodePolyline(route.polyline?.encodedPolyline), tolls: null, roadClasses: null, confidence: null, warnings: route.warnings || [] })) }; }
}

function createRouteProvider(options = {}) { const name = options.name || process.env.ROUTE_PROVIDER || 'osrm'; if (name === 'google') return new GoogleRouteProvider({ apiKey: options.apiKey || process.env.GOOGLE_MAPS_API_KEY, fetchImpl: options.fetchImpl }); if (name === 'osrm' || name === 'demo') return new OsrmRouteProvider({ fetchImpl: options.fetchImpl }); throw new Error(`ROUTE_PROVIDER não suportado: ${name}`); }

module.exports = { NominatimGeocodingProvider, OsrmRouteProvider, GoogleRouteProvider, createRouteProvider, decodePolyline };
