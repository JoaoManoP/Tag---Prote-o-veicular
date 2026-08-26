'use strict';

const MAKE_ALIASES = new Map([
  ['GM', 'Chevrolet'], ['GM CHEVROLET', 'Chevrolet'], ['CHEVROLET', 'Chevrolet'],
  ['VW', 'Volkswagen'], ['VW VOLKSWAGEN', 'Volkswagen'], ['VOLKSWAGEN', 'Volkswagen'],
  ['M BENZ', 'Mercedes-Benz'], ['MERCEDES BENZ', 'Mercedes-Benz'], ['MMC', 'Mitsubishi'],
  ['LAND ROVER', 'Land Rover']
]);

const VERSION_WORDS = new Set([
  'ACTIVE', 'ADVENTURE', 'ALLURE', 'ALTIS', 'ATTRACTIVE', 'BLACK', 'COMFORT',
  'COMFORTLINE', 'DRIVE', 'EDITION', 'ELX', 'EX', 'EXL', 'FREEDOM', 'FREESTYLE',
  'GL', 'GLI', 'GLS', 'GRIFFE', 'HIGHLINE', 'HSE', 'LARIAT', 'LIMITED', 'LONGITUDE',
  'LS', 'LT', 'LTZ', 'LX', 'MOVE', 'OUTDOOR', 'PLATINUM', 'PREMIER', 'PREMIUM',
  'RANCH', 'S', 'SE', 'SEL', 'SPORT', 'SPORTING', 'SR', 'SRV', 'SRX', 'STYLE',
  'TITANIUM', 'TOURING', 'TREND', 'TRENDLINE', 'WAY', 'XEI', 'XLT', 'XRE'
]);

const ALLOWED_IMAGE_HOSTS = new Set(['cdn.trustcar.info', 'upload.wikimedia.org']);
const REUSABLE_IMAGE_LICENSE = /^(?:CC0(?:\s|$)|CC\s+BY(?:-SA)?(?:\s|$)|PUBLIC DOMAIN(?:\s|$)|PDM(?:\s|$))/i;

const normalizeWords = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/gi, ' ').trim().replace(/\s+/g, ' ');
const titleCase = value => normalizeWords(value).toLowerCase().replace(/(^|\s)\S/g, letter => letter.toUpperCase());

function normalizeMake(value) {
  const original = String(value || '').trim();
  const aliasKey = normalizeWords(original.replaceAll('/', ' ')).toUpperCase();
  return MAKE_ALIASES.get(aliasKey) || titleCase(original.split('/').at(-1));
}

function normalizeYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1886 && year <= new Date().getFullYear() + 2 ? year : null;
}

function sameNormalizedWords(left, right) {
  return Boolean(normalizeWords(left)) && normalizeWords(left).toLowerCase() === normalizeWords(right).toLowerCase();
}

function makeTitleAliases(make) {
  const canonical = normalizeMake(make);
  const aliases = new Set([normalizeWords(canonical).toLowerCase()]);
  for (const [alias, target] of MAKE_ALIASES) {
    if (sameNormalizedWords(target, canonical)) aliases.add(normalizeWords(alias).toLowerCase());
  }
  return aliases;
}

function titleMatchesVehicle(title, make, model) {
  const normalizedTitle = normalizeWords(title).toLowerCase();
  const normalizedModel = normalizeWords(model).toLowerCase();
  if (!normalizedTitle || !normalizedModel) return false;
  return [...makeTitleAliases(make)].some(alias => normalizedTitle === `${alias} ${normalizedModel}`);
}

function reusableLicense(value) {
  return REUSABLE_IMAGE_LICENSE.test(String(value || '').trim());
}

function metadataText(value, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, maxLength) : null;
}

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isValidPlate(value) {
  return /^[A-Z]{3}(?:[0-9]{4}|[0-9][A-Z][0-9]{2})$/.test(normalizePlate(value));
}

function normalizeVehicleModel(make, model, version = '') {
  const makeOriginal = String(make || '').trim();
  const modelOriginal = String(model || '').trim();
  const makeNormalized = normalizeMake(makeOriginal);
  const makeTokens = new Set([...normalizeWords(makeOriginal).toUpperCase().split(' '), ...normalizeWords(makeNormalized).toUpperCase().split(' ')]);
  let modelWords = normalizeWords(modelOriginal).split(' ').filter(Boolean);
  while (modelWords.length && makeTokens.has(modelWords[0].toUpperCase())) modelWords.shift();
  const technical = /^(?:\d+(?:MT|AT|T|V|CV)?|\d+V|[A-Z]*\d+[A-Z0-9]*|FLEX|DIESEL|GASOLINA|AUT|AUTOMATICO|MANUAL|CVT|TURBO)$/i;
  const firstTechnical = modelWords.findIndex((word, index) => index > 0 && (technical.test(word) || VERSION_WORDS.has(word.toUpperCase())));
  const modelCoreWords = (firstTechnical < 0 ? modelWords : modelWords.slice(0, firstTechnical)).slice(0, 4);
  if (!modelCoreWords.length) modelCoreWords.push(...modelWords.slice(0, 1));
  const originalModelWords = modelOriginal.replaceAll('/', ' ').trim().split(/\s+/).filter(Boolean);
  while (originalModelWords.length && makeTokens.has(normalizeWords(originalModelWords[0]).toUpperCase())) originalModelWords.shift();
  const extractedVersion = String(version || (firstTechnical >= 0 ? originalModelWords.slice(firstTechnical).join(' ') : '')).trim() || null;
  return { makeOriginal: makeOriginal || null, makeNormalized: makeNormalized || null, modelOriginal: modelOriginal || null, modelNormalized: titleCase(modelCoreWords.join(' ')) || null, version: extractedVersion };
}

class FalconVehicleProvider {
  constructor({ token, baseUrl = 'https://beta.falcon-server.com.br/data-hub', fetchImpl = fetch, timeoutMs = 8000 } = {}) {
    this.token = token; this.baseUrl = baseUrl.replace(/\/$/, ''); this.fetch = fetchImpl; this.timeoutMs = timeoutMs;
  }
  async lookup(plate) {
    const normalized = normalizePlate(plate);
    if (!isValidPlate(normalized)) throw Object.assign(new Error('Placa inválida.'), { code: 'INVALID_PLATE' });
    if (!this.token) throw Object.assign(new Error('Falcon sem credencial.'), { code: 'PROVIDER_AUTH_ERROR' });
    let response;
    try { response = await this.fetch(`${this.baseUrl}/private/v1/vehicles/${encodeURIComponent(normalized)}/search`, { headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) }); }
    catch (cause) { throw Object.assign(new Error(cause?.name === 'TimeoutError' ? 'Falcon excedeu o tempo limite.' : 'Falcon indisponível.'), { code: cause?.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE', cause }); }
    if (response.status === 401 || response.status === 403) throw Object.assign(new Error('Credencial Falcon rejeitada.'), { code: 'PROVIDER_AUTH_ERROR' });
    if (response.status === 404) throw Object.assign(new Error('Veículo não encontrado.'), { code: 'PLATE_NOT_FOUND' });
    if (response.status === 429) throw Object.assign(new Error('Limite Falcon atingido.'), { code: 'PROVIDER_RATE_LIMIT' });
    if (!response.ok) throw Object.assign(new Error('Falcon indisponível.'), { code: 'PROVIDER_UNAVAILABLE' });
    let payload; try { payload = await response.json(); } catch { throw Object.assign(new Error('Resposta Falcon inválida.'), { code: 'PROVIDER_UNAVAILABLE' }); }
    const data = payload?.data || {};
    if (!data.marca && !data.modelo) throw Object.assign(new Error('Veículo não encontrado.'), { code: 'PLATE_NOT_FOUND' });
    return { plate: normalized, make: data.marca || null, model: data.modelo || null, version: data.versao || null, manufactureYear: Number(data.ano) || null, modelYear: Number(data.ano_modelo) || Number(data.ano) || null, color: data.cor || null, fuel: data.combustivel || null, type: data.tipo || data.tipo_veiculo || null, provider: 'falcon' };
  }
}

class TrustCarImageProvider {
  constructor({ baseUrl = 'https://carapi.trustcar.info/getImage', fetchImpl = fetch, timeoutMs = 7000 } = {}) {
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async search({ make, model, year, version }) {
    const requestedMake = normalizeMake(make);
    const requestedModel = titleCase(model);
    const requestedYear = year == null ? null : normalizeYear(year);
    const requestedVersion = metadataText(version, 120);
    if (!requestedMake || !requestedModel || (year != null && !requestedYear)) return null;

    const url = new URL(this.baseUrl);
    url.searchParams.set('make', requestedMake);
    url.searchParams.set('model', requestedModel);
    if (requestedYear) url.searchParams.set('year', String(requestedYear));
    if (requestedVersion) url.searchParams.set('version', requestedVersion);
    url.searchParams.set('format', 'json');

    let response;
    try {
      response = await this.fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (cause) {
      throw Object.assign(new Error('Imagem indisponível.'), { code: 'IMAGE_PROVIDER_ERROR', cause });
    }
    if (!response.ok) return null;

    const data = await response.json().catch(() => null);
    if (!data?.found || !data.image_url || !data.make || !data.model || !data.title) return null;
    if (!sameNormalizedWords(normalizeMake(data.make), requestedMake)) return null;
    if (!sameNormalizedWords(data.model, requestedModel)) return null;
    if (!titleMatchesVehicle(data.title, requestedMake, requestedModel)) return null;
    if (requestedYear && normalizeYear(data.year) !== requestedYear) return null;

    const returnedVersion = metadataText(data.version || data.trim || data.versao, 120);
    if (requestedVersion && returnedVersion && !sameNormalizedWords(returnedVersion, requestedVersion)) return null;

    const source = metadataText(data.source, 40);
    const license = metadataText(data.license, 100);
    const attribution = metadataText(data.attribution, 500);
    if (!source || !sameNormalizedWords(source, 'wikimedia') || !reusableLicense(license) || !attribution) return null;

    const attributionSubject = attribution.split(/\s+[—–]\s+/u)[0];
    if (attributionSubject !== attribution && !titleMatchesVehicle(attributionSubject, requestedMake, requestedModel)) return null;

    let imageUrl;
    try { imageUrl = new URL(data.image_url); } catch { return null; }
    if (imageUrl.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.has(imageUrl.hostname.toLowerCase())) return null;

    return {
      found: true,
      url: imageUrl.href,
      source,
      license,
      author: metadataText(data.author, 160),
      attribution,
      reference: metadataText(data.reference, 100)
    };
  }
}

class VehicleLookupService {
  constructor({ database, vehicleProvider, imageProvider, lookupTtlMs = 30 * 86400000, imageTtlMs = 90 * 86400000, logger = console } = {}) {
    this.database = database;
    this.vehicleProvider = vehicleProvider;
    this.imageProvider = imageProvider;
    this.lookupTtlMs = lookupTtlMs;
    this.imageTtlMs = imageTtlMs;
    this.logger = logger;
    this.inflight = new Map();
  }

  placeholder() {
    return {
      found: false,
      url: '/images/vehicle-placeholder.svg',
      source: 'rastreon',
      license: null,
      author: null,
      attribution: 'Placeholder genérico; não representa o veículo consultado',
      reference: null
    };
  }

  imageKey(make, model, year, version) {
    return `strict-v2:${normalizeWords(make).toLowerCase()}:${normalizeWords(model).toLowerCase()}:${year || ''}:${normalizeWords(version).toLowerCase()}`;
  }

  imageIdentity(vehicle) {
    const normalized = normalizeVehicleModel(vehicle?.make || vehicle?.brand, vehicle?.model, vehicle?.version);
    return {
      make: normalized.makeNormalized,
      model: normalized.modelNormalized,
      version: normalized.version,
      year: normalizeYear(vehicle?.modelYear) || normalizeYear(vehicle?.year) || normalizeYear(vehicle?.manufactureYear)
    };
  }

  imageFromCache(row) {
    return {
      found: Boolean(row.found),
      url: row.image_url,
      source: row.source,
      license: row.license,
      author: row.author,
      attribution: row.attribution,
      reference: row.reference
    };
  }

  async resolveImage(vehicle) {
    const identity = this.imageIdentity(vehicle);
    if (!identity.make || !identity.model) return this.placeholder();

    const key = this.imageKey(identity.make, identity.model, identity.year, identity.version);
    const now = Date.now();
    const cached = this.database.prepare('SELECT * FROM vehicle_image_cache WHERE cache_key=? AND expires_at>?').get(key, now);
    if (cached) return this.imageFromCache(cached);

    let image = null;
    if (this.imageProvider?.search) {
      try {
        image = await this.imageProvider.search(identity);
      } catch {
        this.logger.warn?.('vehicle_image.provider_error');
      }
    }
    image ||= this.placeholder();
    this.database.prepare('INSERT INTO vehicle_image_cache (cache_key,make,model,year,found,image_url,source,license,author,attribution,reference,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET found=excluded.found,image_url=excluded.image_url,source=excluded.source,license=excluded.license,author=excluded.author,attribution=excluded.attribution,reference=excluded.reference,updated_at=excluded.updated_at,expires_at=excluded.expires_at').run(key, identity.make, identity.model, identity.year, image.found ? 1 : 0, image.url, image.source, image.license, image.author, image.attribution, image.reference, now, now, now + this.imageTtlMs);
    this.logger.info?.(image.found ? 'vehicle_image.success' : 'vehicle_image.not_found');
    return image;
  }

  async lookup(input) {
    const plate = normalizePlate(input);
    if (!isValidPlate(plate)) throw Object.assign(new Error('Confira a placa informada.'), { code: 'INVALID_PLATE' });
    if (this.inflight.has(plate)) return this.inflight.get(plate);
    const operation = this.lookupOnce(plate).finally(() => this.inflight.delete(plate));
    this.inflight.set(plate, operation);
    return operation;
  }

  async refreshCachedImage(row) {
    const vehicle = this.fromCache(row);
    vehicle.image = await this.resolveImage(vehicle);
    const imageJson = JSON.stringify(vehicle.image);
    if (imageJson !== row.image_json) this.database.prepare('UPDATE vehicle_lookup_cache SET image_json=? WHERE plate=?').run(imageJson, row.plate);
    return vehicle;
  }

  async lookupOnce(plate) {
    const now = Date.now();
    const cached = this.database.prepare('SELECT * FROM vehicle_lookup_cache WHERE plate=?').get(plate);
    if (cached && cached.expires_at > now) {
      this.logger.info?.('vehicle_lookup.cache_hit');
      return { cached: true, vehicle: await this.refreshCachedImage(cached) };
    }

    let raw;
    try {
      raw = await this.vehicleProvider.lookup(plate);
    } catch (error) {
      this.logger.warn?.('vehicle_lookup.provider_error');
      if (cached) return { cached: true, stale: true, vehicle: await this.refreshCachedImage(cached) };
      throw error;
    }

    const normalized = normalizeVehicleModel(raw.make || raw.brand, raw.model, raw.version);
    const vehicle = {
      plate,
      make: normalized.makeNormalized,
      model: normalized.modelNormalized,
      version: normalized.version,
      manufactureYear: raw.manufactureYear || raw.year || null,
      modelYear: raw.modelYear || raw.year || null,
      color: raw.color || null,
      type: raw.type || null,
      fuel: raw.fuel || null,
      provider: raw.provider || raw.source || 'vehicle-provider'
    };
    vehicle.image = await this.resolveImage(vehicle);
    this.database.prepare('INSERT INTO vehicle_lookup_cache (plate,make,model,version,manufacture_year,model_year,color,fuel,type,provider,image_json,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(plate) DO UPDATE SET make=excluded.make,model=excluded.model,version=excluded.version,manufacture_year=excluded.manufacture_year,model_year=excluded.model_year,color=excluded.color,fuel=excluded.fuel,type=excluded.type,provider=excluded.provider,image_json=excluded.image_json,updated_at=excluded.updated_at,expires_at=excluded.expires_at').run(plate,vehicle.make,vehicle.model,vehicle.version,vehicle.manufactureYear,vehicle.modelYear,vehicle.color,vehicle.fuel,vehicle.type,vehicle.provider,JSON.stringify(vehicle.image),now,now,now+this.lookupTtlMs);
    this.logger.info?.('vehicle_lookup.success');
    return { cached: false, vehicle };
  }

  fromCache(row) {
    let image;
    try { image = JSON.parse(row.image_json || 'null'); } catch { image = null; }
    return {
      plate: row.plate,
      make: row.make,
      model: row.model,
      version: row.version,
      manufactureYear: row.manufacture_year,
      modelYear: row.model_year,
      color: row.color,
      fuel: row.fuel,
      type: row.type,
      provider: row.provider,
      image: image || this.placeholder()
    };
  }
}

module.exports={MAKE_ALIASES,normalizePlate,isValidPlate,normalizeVehicleModel,FalconVehicleProvider,TrustCarImageProvider,VehicleLookupService};
