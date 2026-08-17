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
  async search(query, options = {}) { const key = `${query}|${options.countryCode || 'br'}`.toLowerCase(); if (this.cache.has(key)) return this.cache.get(key); const data = await requestJson(this.fetch, `${this.baseUrl}/search?format=jsonv2&limit=6&countrycodes=${encodeURIComponent(options.countryCode || 'br')}&q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'Rastreon/1.0 (local educational demo)', 'Accept-Language': 'pt-BR,pt;q=0.9' } }, this.timeoutMs); if (!Array.isArray(data)) throw new Error('Resposta de geocodificação inválida'); const results = data.map((item) => ({ label: String(item.display_name || '').slice(0, 300), latitude: Number(item.lat), longitude: Number(item.lon), type: String(item.type || '').slice(0, 40), provider: 'nominatim' })).filter((item) => item.label && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)); this.cache.set(key, results); if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value); return results; }
}

class PlateLookupProvider {
  constructor({ fetchImpl = fetch, baseUrl = 'https://placa-fipe.apibrasil.com.br/placa/consulta', token = '', timeoutMs = 12000 } = {}) { this.fetch=fetchImpl;this.baseUrl=baseUrl;this.token=token;this.timeoutMs=timeoutMs; }
  async lookup(plate) {
    const normalized=String(plate||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalized))throw new Error('Placa inválida');
    const headers={'Content-Type':'application/json','Accept':'application/json','User-Agent':'Rastreon/1.0'};
    if(this.token)headers.Authorization=`Bearer ${this.token}`;
    const payload=await requestJson(this.fetch,this.baseUrl,{method:'POST',headers,body:JSON.stringify({placa:normalized})},this.timeoutMs);
    const data=payload?.data||payload?.response||payload?.result||payload;
    const text=(...keys)=>{for(const key of keys){const value=data?.[key];if(value!==undefined&&value!==null&&String(value).trim())return String(value).trim()}return''};
    const year=Number.parseInt(text('anoModelo','ano_modelo','ano','anoFabricacao'),10);
    const vehicle={plate:normalized,brand:text('marca','Marca','brand'),model:text('modelo','Modelo','model'),year:Number.isFinite(year)?year:null,version:text('versao','versão','submodelo'),engine:text('cilindradas','motor','motorizacao'),transmission:text('cambio','câmbio'),fuel:text('combustivel','combustível'),color:text('cor'),fipeCode:text('codigoFipe','codigo_fipe','fipe_codigo'),provider:'api-brasil'};
    if(!vehicle.brand&&!vehicle.model)throw new Error('Veículo não encontrado');
    return vehicle;
  }
}

class PhotonGeocodingProvider {
  constructor({ fetchImpl = fetch, baseUrl = 'https://photon.komoot.io', timeoutMs = 12000 } = {}) { this.fetch = fetchImpl; this.baseUrl = baseUrl; this.timeoutMs = timeoutMs; this.cache = new Map(); }
  async search(query, options = {}) {
    const key = `${query}|${options.language || 'pt'}`.toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);
    const params = new URLSearchParams({ q: query, limit: '6', lang: options.language || 'pt' });
    if (Number.isFinite(options.latitude) && Number.isFinite(options.longitude)) { params.set('lat', options.latitude); params.set('lon', options.longitude); }
    const data = await requestJson(this.fetch, `${this.baseUrl}/api/?${params}`, { headers: { 'User-Agent': 'Rastreon/1.0' } }, this.timeoutMs);
    if (!Array.isArray(data?.features)) throw new Error('Resposta de geocodificação inválida');
    const results = data.features.map(feature => {
      const properties = feature.properties || {}, coordinates = feature.geometry?.coordinates || [];
      const label = [properties.name, properties.street, properties.housenumber, properties.city || properties.district, properties.state, properties.country].filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).join(', ');
      return { label: String(label).slice(0,300), latitude: Number(coordinates[1]), longitude: Number(coordinates[0]), type: String(properties.type || properties.osm_value || 'address').slice(0,40), provider: 'photon' };
    }).filter(item => item.label && Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    this.cache.set(key, results); if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value); return results;
  }
}

class GoogleGeocodingProvider {
  constructor({ apiKey, fetchImpl = fetch, baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json', timeoutMs = 12000 } = {}) { if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY é obrigatória'); this.apiKey = apiKey; this.fetch = fetchImpl; this.baseUrl = baseUrl; this.timeoutMs = timeoutMs; this.cache = new Map(); }
  async search(query, options = {}) { const key = `${query}|${options.countryCode || 'br'}`.toLowerCase(); if (this.cache.has(key)) return this.cache.get(key); const data = await requestJson(this.fetch, `${this.baseUrl}?address=${encodeURIComponent(query)}&components=country:${encodeURIComponent(options.countryCode || 'br')}&language=pt-BR&region=br&key=${encodeURIComponent(this.apiKey)}`, {}, this.timeoutMs); if (!['OK','ZERO_RESULTS'].includes(data.status)) throw new Error(`Google Geocoding respondeu ${data.status || 'erro'}`); const results = (data.results || []).slice(0, 6).map(item => ({ label: String(item.formatted_address || '').slice(0, 300), latitude: Number(item.geometry?.location?.lat), longitude: Number(item.geometry?.location?.lng), type: String(item.types?.[0] || 'address').slice(0, 40), provider: 'google' })).filter(item => item.label && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)); this.cache.set(key, results); if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value); return results; }
}

class FallbackGeocodingProvider {
  constructor(primary,fallback){this.primary=primary;this.fallback=fallback}
  async search(query,options){try{return await this.primary.search(query,options)}catch{return this.fallback.search(query,options)}}
}

function normalizeManeuver(value = '') { const text=String(value).toLowerCase(); if(text.includes('left'))return'left';if(text.includes('right'))return'right';if(text.includes('roundabout')||text.includes('rotary'))return'roundabout';if(text.includes('uturn')||text.includes('u-turn'))return'uturn';if(text.includes('arrive'))return'arrive';if(text.includes('depart'))return'depart';if(text.includes('merge'))return'merge';if(text.includes('fork'))return'fork';return'straight'; }

class OsrmRouteProvider {
  constructor({ fetchImpl = fetch, baseUrl = 'https://router.project-osrm.org', timeoutMs = 12000 } = {}) { this.fetch = fetchImpl; this.baseUrl = baseUrl; this.timeoutMs = timeoutMs; }
  async calculateRoute({ origin, destination, alternatives = 3 }) { const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`; const data = await requestJson(this.fetch, `${this.baseUrl}/route/v1/driving/${coordinates}?alternatives=${Math.min(3, Math.max(0, alternatives))}&overview=full&geometries=geojson&steps=true`, {}, this.timeoutMs); if (data.code !== 'Ok' || !Array.isArray(data.routes)) throw new Error('Nenhuma rota rodoviária encontrada'); return { provider: 'osrm', traffic: 'unavailable', tolls: 'unavailable', routes: data.routes.slice(0, 3).map((route, index) => ({ routeId: String(index), primary: index === 0, distanceMeters: Number(route.distance), durationSeconds: Number(route.duration), durationInTrafficSeconds: null, geometry: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]), steps:(route.legs||[]).flatMap(leg=>(leg.steps||[]).map(step=>({ maneuver:normalizeManeuver(step.maneuver?.type||step.maneuver?.modifier), instruction:String(step.name?`${step.maneuver?.type==='arrive'?'Chegue a':'Siga por'} ${step.name}`:'Continue na rota').slice(0,240), street:String(step.name||'').slice(0,160), distanceMeters:Number(step.distance)||0, durationSeconds:Number(step.duration)||0, location:Array.isArray(step.maneuver?.location)?{latitude:Number(step.maneuver.location[1]),longitude:Number(step.maneuver.location[0])}:null }))), tolls: null, roadClasses: null, confidence: null })) }; }
}

class GoogleRouteProvider {
  constructor({ apiKey, fetchImpl = fetch, timeoutMs = 12000 } = {}) { if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY é obrigatória para ROUTE_PROVIDER=google'); this.apiKey = apiKey; this.fetch = fetchImpl; this.timeoutMs = timeoutMs; }
  async calculateRoute({ origin, destination, vehicleType = 'car', departureTime, alternatives = 3, traffic = true }) { const body = { origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } }, destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } }, travelMode: vehicleType === 'motorcycle' ? 'TWO_WHEELER' : 'DRIVE', computeAlternativeRoutes: alternatives > 0, languageCode: 'pt-BR', units: 'METRIC' }; if (traffic) body.routingPreference = 'TRAFFIC_AWARE'; if (departureTime) body.departureTime = new Date(departureTime).toISOString(); const data = await requestJson(this.fetch, 'https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline,routes.routeLabels,routes.warnings,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.navigationInstruction,routes.legs.steps.startLocation,routes.legs.steps.endLocation' }, body: JSON.stringify(body) }, this.timeoutMs); if (!Array.isArray(data.routes) || !data.routes.length) throw new Error('Nenhuma rota rodoviária encontrada'); const seconds = value => value ? Number.parseFloat(String(value).replace('s', '')) : null; return { provider: 'google', traffic: traffic ? 'available' : 'not_requested', tolls: 'unavailable', routes: data.routes.slice(0, 3).map((route, index) => ({ routeId: String(index), primary: index === 0, distanceMeters: Number(route.distanceMeters), durationSeconds: seconds(route.staticDuration) ?? seconds(route.duration), durationInTrafficSeconds: traffic ? seconds(route.duration) : null, geometry: decodePolyline(route.polyline?.encodedPolyline), steps:(route.legs||[]).flatMap(leg=>(leg.steps||[]).map(step=>({maneuver:normalizeManeuver(step.navigationInstruction?.maneuver),instruction:String(step.navigationInstruction?.instructions||'Continue na rota').slice(0,240),street:String(step.navigationInstruction?.instructions||'').split(/\s+(?:em|na|no)\s+/i).at(-1).slice(0,160),distanceMeters:Number(step.distanceMeters)||0,durationSeconds:seconds(step.staticDuration)||0,location:step.endLocation?.latLng?{latitude:Number(step.endLocation.latLng.latitude),longitude:Number(step.endLocation.latLng.longitude)}:null}))), tolls: null, roadClasses: null, confidence: null, warnings: route.warnings || [] })) }; }
}

function createRouteProvider(options = {}) { const name = options.name || process.env.ROUTE_PROVIDER || 'osrm'; if (name === 'google') return new GoogleRouteProvider({ apiKey: options.apiKey || process.env.GOOGLE_MAPS_API_KEY, fetchImpl: options.fetchImpl }); if (name === 'osrm' || name === 'demo') return new OsrmRouteProvider({ fetchImpl: options.fetchImpl }); throw new Error(`ROUTE_PROVIDER não suportado: ${name}`); }

module.exports = { PlateLookupProvider, PhotonGeocodingProvider, NominatimGeocodingProvider, GoogleGeocodingProvider, FallbackGeocodingProvider, OsrmRouteProvider, GoogleRouteProvider, createRouteProvider, decodePolyline, normalizeManeuver };
