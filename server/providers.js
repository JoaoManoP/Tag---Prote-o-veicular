'use strict';

function decodePolyline(encoded = '') {
  const points = [];
  let index = 0,
    latitude = 0,
    longitude = 0;
  while (index < encoded.length) {
    for (const coordinate of ['latitude', 'longitude']) {
      let result = 0,
        shift = 0,
        byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 31) << shift;
        shift += 5;
      } while (byte >= 32 && index <= encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (coordinate === 'latitude') latitude += delta;
      else longitude += delta;
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
  constructor({ fetchImpl = fetch, baseUrl, timeoutMs = 12000 } = {}) {
    if (!baseUrl) throw new Error('NOMINATIM_BASE_URL própria ou contratada é obrigatória');
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
  }
  async search(query, options = {}) {
    const key = `${query}|${options.countryCode || 'br'}`.toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);
    const data = await requestJson(
      this.fetch,
      `${this.baseUrl}/search?format=jsonv2&limit=6&countrycodes=${encodeURIComponent(options.countryCode || 'br')}&q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Rastreon/1.0 (local educational demo)',
          'Accept-Language': 'pt-BR,pt;q=0.9'
        }
      },
      this.timeoutMs
    );
    if (!Array.isArray(data)) throw new Error('Resposta de geocodificação inválida');
    const results = data
      .map(item => ({
        label: String(item.display_name || '').slice(0, 300),
        latitude: Number(item.lat),
        longitude: Number(item.lon),
        type: String(item.type || '').slice(0, 40),
        provider: 'nominatim'
      }))
      .filter(
        item => item.label && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
      );
    this.cache.set(key, results);
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
    return results;
  }
  async reverse(latitude, longitude) {
    const data = await requestJson(
      this.fetch,
      `${this.baseUrl}/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`,
      { headers: { 'User-Agent': 'Rastreon/1.0', 'Accept-Language': 'pt-BR,pt;q=0.9' } },
      this.timeoutMs
    );
    return {
      label: String(data.display_name || 'Local escolhido').slice(0, 240),
      neighborhood: data.address?.suburb || data.address?.neighbourhood || '',
      city: data.address?.city || data.address?.town || data.address?.municipality || '',
      state: data.address?.state || '',
      provider: 'nominatim'
    };
  }
}

class VehicleRegistryError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'VehicleRegistryError';
    this.code = code;
  }
}

class VehicleRegistryProvider {
  async lookup() {
    throw new VehicleRegistryError(
      'PROVIDER_UNAVAILABLE',
      'Provider de registro veicular não implementado.'
    );
  }
}

class ApiBrasilVehicleProvider extends VehicleRegistryProvider {
  constructor({
    fetchImpl = fetch,
    baseUrl = 'https://gateway.apibrasil.io/api/v2/vehicles/base/001/consulta',
    token = '',
    serviceType = 'agregados-basica',
    homolog = false,
    timeoutMs = 12000
  } = {}) {
    super();
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
    this.token = token;
    this.serviceType = serviceType;
    this.homolog = Boolean(homolog);
    this.timeoutMs = timeoutMs;
  }
  async lookup(plate) {
    const normalized = String(plate || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalized))
      throw new VehicleRegistryError('INVALID_PLATE', 'Placa inválida.');
    if (!this.token)
      throw new VehicleRegistryError(
        'PROVIDER_AUTH_ERROR',
        'Provider de placa sem credencial configurada.'
      );
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Rastreon/1.0'
    };
    const apiPlacas = /\bwdapi2\.com\.br\b/i.test(this.baseUrl);
    if (!apiPlacas) headers.Authorization = `Bearer ${this.token}`;
    let response;
    const requestUrl = apiPlacas
      ? `${this.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(normalized)}/${encodeURIComponent(this.token)}`
      : this.baseUrl;
    const requestOptions = {
      method: apiPlacas ? 'GET' : 'POST',
      headers,
      signal: AbortSignal.timeout(this.timeoutMs)
    };
    if (!apiPlacas)
      requestOptions.body = JSON.stringify({
        tipo: this.serviceType,
        placa: normalized,
        homolog: this.homolog
      });
    try {
      response = await this.fetch(requestUrl, requestOptions);
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError')
        throw new VehicleRegistryError(
          'PROVIDER_TIMEOUT',
          'O provider de placa excedeu o tempo limite.',
          { cause: error }
        );
      throw new VehicleRegistryError('PROVIDER_UNAVAILABLE', 'Provider de placa indisponível.', {
        cause: error
      });
    }
    if (response.status === 401 || response.status === 403)
      throw new VehicleRegistryError(
        'PROVIDER_AUTH_ERROR',
        'Credencial do provider de placa rejeitada.'
      );
    if (response.status === 404)
      throw new VehicleRegistryError('PLATE_NOT_FOUND', 'Veículo não encontrado.');
    if (response.status === 429)
      throw new VehicleRegistryError(
        'PROVIDER_RATE_LIMIT',
        'Limite do provider de placa atingido.'
      );
    if (!response.ok)
      throw new VehicleRegistryError(
        'PROVIDER_UNAVAILABLE',
        `Provider de placa respondeu ${response.status}.`
      );
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new VehicleRegistryError(
        'PROVIDER_UNAVAILABLE',
        'Resposta inválida do provider de placa.',
        { cause: error }
      );
    }
    if (payload?.error === true) {
      const message = String(payload.message || '').toLowerCase();
      if (/token|credencial|autoriz/.test(message))
        throw new VehicleRegistryError(
          'PROVIDER_AUTH_ERROR',
          'Credencial do provider de placa rejeitada.'
        );
      if (/saldo|crédito|credito/.test(message))
        throw new VehicleRegistryError(
          'PROVIDER_RATE_LIMIT',
          'Saldo do provider de placa indisponível.'
        );
      throw new VehicleRegistryError(
        'PROVIDER_UNAVAILABLE',
        String(payload.message || 'Provider de placa recusou a consulta.')
      );
    }
    const data = apiPlacas
      ? payload
      : payload?.data?.veiculo ||
        payload?.data ||
        payload?.response ||
        payload?.result ||
        payload?.informacoes_veiculo ||
        payload;
    const text = (...keys) => {
      for (const key of keys) {
        const value = data?.[key];
        if (value !== undefined && value !== null && String(value).trim())
          return String(value).trim();
      }
      return '';
    };
    const year = Number.parseInt(
      text('anoModelo', 'ano_modelo', 'ano', 'anoFabricacao', 'ano_fabricacao'),
      10
    );
    const nullable = (...keys) => text(...keys) || null,
      normalizedYear = Number.isFinite(year) ? year : null;
    const category = text(
        'tipo',
        'tipoVeiculo',
        'tipo_veiculo',
        'especie',
        'categoria'
      ).toLowerCase(),
      motorcycle = /moto|motocicleta|ciclomotor|scooter/.test(category);
    const vehicle = {
      plate: normalized,
      type: motorcycle ? 'motorcycle' : 'car',
      brand: nullable('marca', 'Marca', 'MARCA', 'brand', 'fabricante'),
      model: nullable('modelo', 'Modelo', 'MODELO', 'model'),
      year: normalizedYear,
      modelYear: normalizedYear,
      version: nullable('versao', 'versão', 'VERSAO', 'submodelo', 'SUBMODELO'),
      engine: nullable('cilindradas', 'CILINDRADAS', 'motor', 'motorizacao', 'motor_descricao'),
      transmission: nullable('cambio', 'câmbio', 'CAMBIO', 'transmissao_descricao'),
      fuel: nullable('combustivel', 'combustível', 'COMBUSTIVEL'),
      color: nullable('cor', 'COR'),
      city: nullable('municipio', 'MUNICIPIO', 'cidade'),
      state: nullable('uf', 'UF', 'estado'),
      fipeCode: nullable('codigoFipe', 'codigo_fipe', 'fipe_codigo'),
      fipeValue: null,
      source: apiPlacas ? 'apiplacas' : 'apibrasil-v2',
      provider: apiPlacas ? 'apiplacas' : 'apibrasil'
    };
    if (!vehicle.brand && !vehicle.model)
      throw new VehicleRegistryError('PLATE_NOT_FOUND', 'Veículo não encontrado.');
    return vehicle;
  }
}

class PlateLookupProvider extends ApiBrasilVehicleProvider {}

class AutoDevVehicleImageProvider {
  constructor({
    apiKey,
    fetchImpl = fetch,
    baseUrl = 'https://api.auto.dev',
    timeoutMs = 12000
  } = {}) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }
  async lookup(vin) {
    const normalized = String(vin || '')
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, '');
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalized)) throw new Error('VIN inválido.');
    if (!this.apiKey) return { available: false, reason: 'not-configured', photos: [] };
    const response = await this.fetch(`${this.baseUrl}/photos/${normalized}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
        'User-Agent': 'Rastreon/1.0'
      },
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (response.status === 404) return { available: false, reason: 'not-found', photos: [] };
    if (!response.ok) throw new Error(`Auto.dev respondeu ${response.status}.`);
    const payload = await response.json();
    const values = [...(payload?.data?.retail || []), ...(payload?.data?.wholesale || [])];
    const photos = values
      .map(value => (typeof value === 'string' ? value : value?.url || value?.link))
      .filter(value => {
        try {
          return new URL(value).protocol === 'https:';
        } catch {
          return false;
        }
      })
      .slice(0, 10);
    return {
      available: photos.length > 0,
      reason: photos.length ? null : 'not-found',
      photos,
      provider: 'auto.dev'
    };
  }
  async fetchImage(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname))
      throw new Error('URL de imagem rejeitada.');
    const response = await this.fetch(parsed, {
      headers: {
        Accept: 'image/avif,image/webp,image/jpeg,image/png',
        'User-Agent': 'Rastreon/1.0'
      },
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    const type = String(response.headers.get('content-type') || '').split(';')[0];
    const length = Number(response.headers.get('content-length') || 0);
    if (
      !response.ok ||
      !['image/avif', 'image/webp', 'image/jpeg', 'image/png'].includes(type) ||
      length > 2 * 1024 * 1024
    )
      throw new Error('Imagem automotiva inválida.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024) throw new Error('Imagem automotiva excede 2 MB.');
    return { bytes, type };
  }
}

class PhotonGeocodingProvider {
  constructor({ fetchImpl = fetch, baseUrl = 'https://photon.komoot.io', timeoutMs = 12000 } = {}) {
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
  }
  async search(query, options = {}) {
    // A instância pública do Photon aceita apenas default/de/en/fr. Enviar `pt`
    // faz a API responder HTTP 400 e foi a causa do autocomplete vazio no painel.
    const language = ['default', 'de', 'en', 'fr'].includes(options.language)
      ? options.language
      : 'default';
    const proximity =
      Number.isFinite(options.latitude) && Number.isFinite(options.longitude)
        ? `|${options.latitude.toFixed(3)},${options.longitude.toFixed(3)}`
        : '';
    const key = `${query}|${language}|${options.countryCode || 'br'}${proximity}`.toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);
    const params = new URLSearchParams({ q: query, limit: '8', lang: language });
    if (Number.isFinite(options.latitude) && Number.isFinite(options.longitude)) {
      params.set('lat', options.latitude);
      params.set('lon', options.longitude);
    }
    const data = await requestJson(
      this.fetch,
      `${this.baseUrl}/api/?${params}`,
      { headers: { 'User-Agent': 'Rastreon/1.0' } },
      this.timeoutMs
    );
    if (!Array.isArray(data?.features)) throw new Error('Resposta de geocodificação inválida');
    const results = data.features
      .map(feature => {
        const properties = feature.properties || {},
          coordinates = feature.geometry?.coordinates || [];
        const label = [
          properties.name,
          properties.street,
          properties.housenumber,
          properties.city || properties.district,
          properties.state,
          properties.country
        ]
          .filter(Boolean)
          .filter((value, index, array) => array.indexOf(value) === index)
          .join(', ');
        return {
          label: String(label).slice(0, 300),
          latitude: Number(coordinates[1]),
          longitude: Number(coordinates[0]),
          type: String(properties.type || properties.osm_value || 'address').slice(0, 40),
          provider: 'photon'
        };
      })
      .filter(
        item => item.label && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
      );
    this.cache.set(key, results);
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
    return results;
  }
  async reverse(latitude, longitude) {
    const params = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
        lang: 'default'
      }),
      data = await requestJson(
        this.fetch,
        `${this.baseUrl}/reverse?${params}`,
        { headers: { 'User-Agent': 'Rastreon/1.0' } },
        this.timeoutMs
      ),
      feature = data?.features?.[0],
      properties = feature?.properties || {};
    if (!feature) throw new Error('Endereço não encontrado');
    const label = [
      properties.name,
      properties.street,
      properties.housenumber,
      properties.district || properties.city,
      properties.state,
      properties.country
    ]
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .join(', ');
    return {
      label: String(label || 'Local escolhido').slice(0, 240),
      neighborhood: String(properties.district || properties.locality || ''),
      city: String(properties.city || properties.county || ''),
      state: String(properties.state || ''),
      provider: 'photon'
    };
  }
}

class FipePriceProvider {
  constructor({
    fetchImpl = fetch,
    baseUrl = 'https://brasilapi.com.br/api/fipe/preco/v1',
    timeoutMs = 12000
  } = {}) {
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }
  async lookup(code, { year } = {}) {
    const normalized = String(code || '').trim();
    if (!/^\d{6}-\d$/.test(normalized)) throw new Error('Código FIPE inválido');
    const data = await requestJson(
      this.fetch,
      `${this.baseUrl}/${encodeURIComponent(normalized)}`,
      { headers: { 'User-Agent': 'Rastreon/1.0' } },
      this.timeoutMs
    );
    if (!Array.isArray(data) || !data.length) throw new Error('Preço FIPE não encontrado');
    const rows = data.map(item => ({
      code: String(item.codigoFipe || normalized),
      brand: String(item.marca || '').slice(0, 80),
      model: String(item.modelo || '').slice(0, 160),
      modelYear: Number(item.anoModelo) || null,
      fuel: String(item.combustivel || '').slice(0, 40),
      value: String(item.valor || '').slice(0, 40),
      referenceMonth: String(item.mesReferencia || '')
        .trim()
        .slice(0, 80),
      consultedAt: String(item.dataConsulta || '').slice(0, 100),
      provider: 'brasilapi-fipe'
    }));
    return rows.find(item => year && item.modelYear === Number(year)) || rows[0];
  }
}

class GoogleGeocodingProvider {
  constructor({
    apiKey,
    fetchImpl = fetch,
    baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json',
    timeoutMs = 12000
  } = {}) {
    if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY é obrigatória');
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
  }
  async search(query, options = {}) {
    const key = `${query}|${options.countryCode || 'br'}`.toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);
    const data = await requestJson(
      this.fetch,
      `${this.baseUrl}?address=${encodeURIComponent(query)}&components=country:${encodeURIComponent(options.countryCode || 'br')}&language=pt-BR&region=br&key=${encodeURIComponent(this.apiKey)}`,
      {},
      this.timeoutMs
    );
    if (!['OK', 'ZERO_RESULTS'].includes(data.status))
      throw new Error(`Google Geocoding respondeu ${data.status || 'erro'}`);
    const results = (data.results || [])
      .slice(0, 6)
      .map(item => ({
        label: String(item.formatted_address || '').slice(0, 300),
        latitude: Number(item.geometry?.location?.lat),
        longitude: Number(item.geometry?.location?.lng),
        type: String(item.types?.[0] || 'address').slice(0, 40),
        provider: 'google'
      }))
      .filter(
        item => item.label && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
      );
    this.cache.set(key, results);
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
    return results;
  }
  async reverse(latitude, longitude) {
    const data = await requestJson(
      this.fetch,
      `${this.baseUrl}?latlng=${latitude},${longitude}&language=pt-BR&region=br&key=${encodeURIComponent(this.apiKey)}`,
      {},
      this.timeoutMs
    );
    if (!['OK', 'ZERO_RESULTS'].includes(data.status) || !data.results?.length)
      throw new Error('Endereço não encontrado');
    const result = data.results[0],
      component = type =>
        result.address_components?.find(item => item.types?.includes(type))?.long_name || '';
    return {
      label: String(result.formatted_address || 'Local escolhido').slice(0, 240),
      neighborhood: component('sublocality') || component('neighborhood'),
      city: component('administrative_area_level_2') || component('locality'),
      state: component('administrative_area_level_1'),
      provider: 'google'
    };
  }
}

class FallbackGeocodingProvider {
  constructor(primary, fallback) {
    this.primary = primary;
    this.fallback = fallback;
  }
  async search(query, options) {
    try {
      const results = await this.primary.search(query, options);
      if (Array.isArray(results) && results.length) return results;
    } catch {}
    return this.fallback.search(query, options);
  }
  async reverse(latitude, longitude) {
    try {
      return await this.primary.reverse(latitude, longitude);
    } catch {
      return this.fallback.reverse(latitude, longitude);
    }
  }
}

class MapboxGeocodingProvider {
  constructor({
    accessToken,
    fetchImpl = fetch,
    baseUrl = 'https://api.mapbox.com/search/geocode/v6',
    timeoutMs = 12000
  } = {}) {
    if (!accessToken) throw new Error('MAPBOX_ACCESS_TOKEN é obrigatório');
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }
  normalize(feature) {
    const properties = feature?.properties || {};
    const coordinates = properties.coordinates || {};
    const longitude = Number(coordinates.longitude ?? feature?.geometry?.coordinates?.[0]);
    const latitude = Number(coordinates.latitude ?? feature?.geometry?.coordinates?.[1]);
    const context = properties.context || {};
    const label =
      properties.full_address ||
      properties.place_formatted ||
      properties.name ||
      feature?.place_name ||
      '';
    return {
      label: String(label).slice(0, 300),
      latitude,
      longitude,
      type: String(properties.feature_type || feature?.type || 'place').slice(0, 40),
      neighborhood: String(context.neighborhood?.name || ''),
      city: String(context.place?.name || context.locality?.name || ''),
      state: String(context.region?.name || ''),
      provider: 'mapbox'
    };
  }
  async search(query, options = {}) {
    const params = new URLSearchParams({
      q: query,
      country: options.countryCode || 'br',
      language: 'pt-BR',
      limit: '6',
      autocomplete: 'true',
      access_token: this.accessToken
    });
    if (Number.isFinite(options.longitude) && Number.isFinite(options.latitude))
      params.set('proximity', `${options.longitude},${options.latitude}`);
    const url = `${this.baseUrl}/forward?${params}`;
    const data = await requestJson(this.fetch, url, {}, this.timeoutMs);
    if (!Array.isArray(data?.features))
      throw new Error('Resposta de geocodificação Mapbox inválida');
    return data.features
      .map(feature => this.normalize(feature))
      .filter(
        place => place.label && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
      );
  }
  async reverse(latitude, longitude) {
    const url = `${this.baseUrl}/reverse?longitude=${encodeURIComponent(longitude)}&latitude=${encodeURIComponent(latitude)}&country=br&language=pt-BR&access_token=${encodeURIComponent(this.accessToken)}`;
    const data = await requestJson(this.fetch, url, {}, this.timeoutMs);
    const place = data?.features
      ?.map(feature => this.normalize(feature))
      .find(
        item => item.label && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
      );
    if (!place) throw new Error('Endereço Mapbox não encontrado');
    return place;
  }
}

function normalizeManeuver(value = '') {
  const text = String(value).toLowerCase();
  if (text.includes('left')) return 'left';
  if (text.includes('right')) return 'right';
  if (text.includes('roundabout') || text.includes('rotary')) return 'roundabout';
  if (text.includes('uturn') || text.includes('u-turn')) return 'uturn';
  if (text.includes('arrive')) return 'arrive';
  if (text.includes('depart')) return 'depart';
  if (text.includes('merge')) return 'merge';
  if (text.includes('fork')) return 'fork';
  return 'straight';
}

class OsrmRouteProvider {
  constructor({
    fetchImpl = fetch,
    baseUrl = 'https://router.project-osrm.org',
    timeoutMs = 12000
  } = {}) {
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }
  async calculateRoute({ origin, destination, waypoints = [], alternatives = 3 }) {
    const coordinates = [origin, ...waypoints, destination]
      .map(point => `${point.longitude},${point.latitude}`)
      .join(';');
    const data = await requestJson(
      this.fetch,
      `${this.baseUrl}/route/v1/driving/${coordinates}?alternatives=${Math.min(3, Math.max(0, alternatives))}&overview=full&geometries=geojson&steps=true`,
      {},
      this.timeoutMs
    );
    if (data.code !== 'Ok' || !Array.isArray(data.routes))
      throw new Error('Nenhuma rota rodoviária encontrada');
    return {
      provider: 'osrm',
      traffic: 'unavailable',
      tolls: 'unavailable',
      routes: data.routes.slice(0, 3).map((route, index) => ({
        routeId: String(index),
        primary: index === 0,
        distanceMeters: Number(route.distance),
        durationSeconds: Number(route.duration),
        durationInTrafficSeconds: null,
        geometry: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]),
        steps: (route.legs || []).flatMap(leg =>
          (leg.steps || []).map(step => ({
            maneuver: normalizeManeuver(step.maneuver?.type || step.maneuver?.modifier),
            instruction: String(
              step.name
                ? `${step.maneuver?.type === 'arrive' ? 'Chegue a' : 'Siga por'} ${step.name}`
                : 'Continue na rota'
            ).slice(0, 240),
            street: String(step.name || '').slice(0, 160),
            distanceMeters: Number(step.distance) || 0,
            durationSeconds: Number(step.duration) || 0,
            location: Array.isArray(step.maneuver?.location)
              ? {
                  latitude: Number(step.maneuver.location[1]),
                  longitude: Number(step.maneuver.location[0])
                }
              : null
          }))
        ),
        tolls: null,
        roadClasses: null,
        confidence: null
      }))
    };
  }
}

class GoogleRouteProvider {
  constructor({ apiKey, fetchImpl = fetch, timeoutMs = 12000 } = {}) {
    if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY é obrigatória para ROUTE_PROVIDER=google');
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }
  async calculateRoute({
    origin,
    destination,
    waypoints = [],
    vehicleType = 'car',
    departureTime,
    alternatives = 3,
    traffic = true,
    avoidTolls = false
  }) {
    const body = {
      origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
      destination: {
        location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } }
      },
      intermediates: waypoints.map(point => ({
        location: { latLng: { latitude: point.latitude, longitude: point.longitude } }
      })),
      routeModifiers: { avoidTolls: Boolean(avoidTolls) },
      travelMode: vehicleType === 'motorcycle' ? 'TWO_WHEELER' : 'DRIVE',
      computeAlternativeRoutes: alternatives > 0,
      languageCode: 'pt-BR',
      units: 'METRIC'
    };
    if (traffic) body.routingPreference = 'TRAFFIC_AWARE';
    if (departureTime) body.departureTime = new Date(departureTime).toISOString();
    const data = await requestJson(
      this.fetch,
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask':
            'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline,routes.routeLabels,routes.warnings,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.navigationInstruction,routes.legs.steps.startLocation,routes.legs.steps.endLocation'
        },
        body: JSON.stringify(body)
      },
      this.timeoutMs
    );
    if (!Array.isArray(data.routes) || !data.routes.length)
      throw new Error('Nenhuma rota rodoviária encontrada');
    const seconds = value => (value ? Number.parseFloat(String(value).replace('s', '')) : null);
    return {
      provider: 'google',
      traffic: traffic ? 'available' : 'not_requested',
      tolls: avoidTolls ? 'avoided' : 'unavailable',
      routes: data.routes.slice(0, 3).map((route, index) => ({
        routeId: String(index),
        primary: index === 0,
        distanceMeters: Number(route.distanceMeters),
        durationSeconds: seconds(route.staticDuration) ?? seconds(route.duration),
        durationInTrafficSeconds: traffic ? seconds(route.duration) : null,
        geometry: decodePolyline(route.polyline?.encodedPolyline),
        steps: (route.legs || []).flatMap(leg =>
          (leg.steps || []).map(step => ({
            maneuver: normalizeManeuver(step.navigationInstruction?.maneuver),
            instruction: String(
              step.navigationInstruction?.instructions || 'Continue na rota'
            ).slice(0, 240),
            street: String(step.navigationInstruction?.instructions || '')
              .split(/\s+(?:em|na|no)\s+/i)
              .at(-1)
              .slice(0, 160),
            distanceMeters: Number(step.distanceMeters) || 0,
            durationSeconds: seconds(step.staticDuration) || 0,
            location: step.endLocation?.latLng
              ? {
                  latitude: Number(step.endLocation.latLng.latitude),
                  longitude: Number(step.endLocation.latLng.longitude)
                }
              : null
          }))
        ),
        tolls: null,
        roadClasses: null,
        confidence: null,
        warnings: route.warnings || []
      }))
    };
  }
}

function createRouteProvider(options = {}) {
  const name = options.name || process.env.ROUTE_PROVIDER || 'osrm';
  if (name === 'google')
    return new GoogleRouteProvider({
      apiKey: options.apiKey || process.env.GOOGLE_MAPS_API_KEY,
      fetchImpl: options.fetchImpl
    });
  if (name === 'osrm' || name === 'demo')
    return new OsrmRouteProvider({ fetchImpl: options.fetchImpl });
  throw new Error(`ROUTE_PROVIDER não suportado: ${name}`);
}

module.exports = {
  VehicleRegistryError,
  VehicleRegistryProvider,
  ApiBrasilVehicleProvider,
  PlateLookupProvider,
  AutoDevVehicleImageProvider,
  FipePriceProvider,
  PhotonGeocodingProvider,
  NominatimGeocodingProvider,
  GoogleGeocodingProvider,
  MapboxGeocodingProvider,
  FallbackGeocodingProvider,
  OsrmRouteProvider,
  GoogleRouteProvider,
  createRouteProvider,
  decodePolyline,
  normalizeManeuver
};
