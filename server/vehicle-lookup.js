'use strict';

const MAKE_ALIASES = new Map([
  ['GM', 'Chevrolet'], ['GM CHEVROLET', 'Chevrolet'], ['CHEVROLET', 'Chevrolet'],
  ['VW', 'Volkswagen'], ['VW VOLKSWAGEN', 'Volkswagen'], ['VOLKSWAGEN', 'Volkswagen'],
  ['M BENZ', 'Mercedes-Benz'], ['MERCEDES BENZ', 'Mercedes-Benz'], ['MMC', 'Mitsubishi'],
  ['LAND ROVER', 'Land Rover']
]);

const normalizeWords = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/gi, ' ').trim().replace(/\s+/g, ' ');
const titleCase = value => normalizeWords(value).toLowerCase().replace(/(^|\s)\S/g, letter => letter.toUpperCase());

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isValidPlate(value) {
  return /^[A-Z]{3}(?:[0-9]{4}|[0-9][A-Z][0-9]{2})$/.test(normalizePlate(value));
}

function normalizeVehicleModel(make, model, version = '') {
  const makeOriginal = String(make || '').trim();
  let modelOriginal = String(model || '').trim();
  const normalizedMakeKey = normalizeWords(makeOriginal.replaceAll('/', ' ')).toUpperCase();
  const makeNormalized = MAKE_ALIASES.get(normalizedMakeKey) || titleCase(makeOriginal.split('/').at(-1));
  const makeTokens = new Set([...normalizeWords(makeOriginal).toUpperCase().split(' '), ...normalizeWords(makeNormalized).toUpperCase().split(' ')]);
  let modelWords = normalizeWords(modelOriginal).split(' ').filter(Boolean);
  while (modelWords.length && makeTokens.has(modelWords[0].toUpperCase())) modelWords.shift();
  const technical = /^(?:\d+(?:\.\d+)?(?:MT|AT|T|V|CV)?|\d+V|[A-Z]*\d+[A-Z0-9-]*|FLEX|DIESEL|GASOLINA|AUT|MANUAL|CVT|TURBO|LT|LTZ|LS|GL|GLS|GLI|EX|EXL|LX|ELX|XEI|ALTIS|COMFORT|PREMIUM)$/i;
  const firstTechnical = modelWords.findIndex((word, index) => index > 0 && technical.test(word));
  const modelCoreWords = (firstTechnical < 0 ? modelWords : modelWords.slice(0, firstTechnical)).slice(0, 3);
  if (!modelCoreWords.length) modelCoreWords.push(...modelWords.slice(0, 1));
  const originalModelWords=modelOriginal.replaceAll('/',' ').trim().split(/\s+/).filter(Boolean);
  while(originalModelWords.length&&makeTokens.has(normalizeWords(originalModelWords[0]).toUpperCase()))originalModelWords.shift();
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
  constructor({ baseUrl = 'https://carapi.trustcar.info/getImage', fetchImpl = fetch, timeoutMs = 7000 } = {}) { this.baseUrl = baseUrl; this.fetch = fetchImpl; this.timeoutMs = timeoutMs; }
  async search({ make, model, year }) {
    const url = new URL(this.baseUrl); url.searchParams.set('make', make); url.searchParams.set('model', model); if (year) url.searchParams.set('year', year); url.searchParams.set('format', 'json');
    let response; try { response = await this.fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) }); } catch (cause) { throw Object.assign(new Error('Imagem indisponível.'), { code: 'IMAGE_PROVIDER_ERROR', cause }); }
    if (!response.ok) return null;
    const data = await response.json().catch(() => null); if (!data?.found || !data.image_url) return null;
    const requestedMake=normalizeWords(make).toLowerCase(),returnedMake=normalizeWords(data.make||make).toLowerCase(),requestedModelTokens=new Set(normalizeWords(model).toLowerCase().split(' ')),returnedModelTokens=normalizeWords(data.model||model).toLowerCase().split(' ');
    if(returnedMake!==requestedMake||!returnedModelTokens.some(token=>requestedModelTokens.has(token)))return null;
    let imageUrl; try { imageUrl = new URL(data.image_url); } catch { return null; }
    if (imageUrl.protocol !== 'https:' || !['cdn.trustcar.info', 'upload.wikimedia.org'].includes(imageUrl.hostname)) return null;
    return { found: true, url: imageUrl.href, source: data.source || 'wikimedia', license: data.license || null, author: data.author || null, attribution: data.attribution || null, reference: data.reference || null };
  }
}

class VehicleLookupService {
  constructor({ database, vehicleProvider, imageProvider, lookupTtlMs = 30 * 86400000, imageTtlMs = 90 * 86400000, logger = console } = {}) { this.database=database;this.vehicleProvider=vehicleProvider;this.imageProvider=imageProvider;this.lookupTtlMs=lookupTtlMs;this.imageTtlMs=imageTtlMs;this.logger=logger;this.inflight=new Map(); }
  placeholder() { return { found: false, url: '/images/vehicle-placeholder.svg', source: 'rastreon', license: null, author: null, attribution: 'Imagem genérica de veículo', reference: null }; }
  imageKey(make, model, year) { return `${normalizeWords(make).toLowerCase()}:${normalizeWords(model).toLowerCase()}:${year || ''}`; }
  async resolveImage(vehicle) {
    const key=this.imageKey(vehicle.make,vehicle.model,vehicle.modelYear),now=Date.now(),cached=this.database.prepare('SELECT * FROM vehicle_image_cache WHERE cache_key=? AND expires_at>?').get(key,now);
    if(cached)return{found:Boolean(cached.found),url:cached.image_url,source:cached.source,license:cached.license,author:cached.author,attribution:cached.attribution,reference:cached.reference};
    const words=vehicle.model.split(' '),short=words[0],attempts=[[vehicle.make,vehicle.model,vehicle.modelYear],[vehicle.make,vehicle.model,null],[vehicle.make,short,vehicle.modelYear],[vehicle.make,short,null]],seen=new Set();let image=null;
    for(const [make,model,year] of attempts){const attempt=`${make}|${model}|${year||''}`;if(seen.has(attempt))continue;seen.add(attempt);try{image=await this.imageProvider.search({make,model,year});if(image)break}catch{this.logger.warn?.('vehicle_image.provider_error')}}
    image ||= this.placeholder();
    this.database.prepare('INSERT INTO vehicle_image_cache (cache_key,make,model,year,found,image_url,source,license,author,attribution,reference,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET found=excluded.found,image_url=excluded.image_url,source=excluded.source,license=excluded.license,author=excluded.author,attribution=excluded.attribution,reference=excluded.reference,updated_at=excluded.updated_at,expires_at=excluded.expires_at').run(key,vehicle.make,vehicle.model,vehicle.modelYear,image.found?1:0,image.url,image.source,image.license,image.author,image.attribution,image.reference,now,now,now+this.imageTtlMs);
    this.logger.info?.(image.found?'vehicle_image.success':'vehicle_image.not_found');return image;
  }
  async lookup(input) {
    const plate=normalizePlate(input);if(!isValidPlate(plate))throw Object.assign(new Error('Confira a placa informada.'),{code:'INVALID_PLATE'});if(this.inflight.has(plate))return this.inflight.get(plate);
    const operation=this.lookupOnce(plate).finally(()=>this.inflight.delete(plate));this.inflight.set(plate,operation);return operation;
  }
  async lookupOnce(plate) {
    const now=Date.now(),cached=this.database.prepare('SELECT * FROM vehicle_lookup_cache WHERE plate=?').get(plate);
    if(cached&&cached.expires_at>now){this.logger.info?.('vehicle_lookup.cache_hit');return{cached:true,vehicle:this.fromCache(cached)}}
    let raw;try{raw=await this.vehicleProvider.lookup(plate)}catch(error){this.logger.warn?.('vehicle_lookup.provider_error');if(cached)return{cached:true,stale:true,vehicle:this.fromCache(cached)};throw error}
    const normalized=normalizeVehicleModel(raw.make||raw.brand,raw.model,raw.version),vehicle={plate,make:normalized.makeNormalized,model:normalized.modelNormalized,version:normalized.version,manufactureYear:raw.manufactureYear||raw.year||null,modelYear:raw.modelYear||raw.year||null,color:raw.color||null,type:raw.type||null,fuel:raw.fuel||null,provider:raw.provider||raw.source||'vehicle-provider'};vehicle.image=await this.resolveImage(vehicle);
    this.database.prepare('INSERT INTO vehicle_lookup_cache (plate,make,model,version,manufacture_year,model_year,color,fuel,type,provider,image_json,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(plate) DO UPDATE SET make=excluded.make,model=excluded.model,version=excluded.version,manufacture_year=excluded.manufacture_year,model_year=excluded.model_year,color=excluded.color,fuel=excluded.fuel,type=excluded.type,provider=excluded.provider,image_json=excluded.image_json,updated_at=excluded.updated_at,expires_at=excluded.expires_at').run(plate,vehicle.make,vehicle.model,vehicle.version,vehicle.manufactureYear,vehicle.modelYear,vehicle.color,vehicle.fuel,vehicle.type,vehicle.provider,JSON.stringify(vehicle.image),now,now,now+this.lookupTtlMs);
    this.logger.info?.('vehicle_lookup.success');return{cached:false,vehicle};
  }
  fromCache(row){return{plate:row.plate,make:row.make,model:row.model,version:row.version,manufactureYear:row.manufacture_year,modelYear:row.model_year,color:row.color,fuel:row.fuel,type:row.type,provider:row.provider,image:JSON.parse(row.image_json||'null')||this.placeholder()}}
}

module.exports={MAKE_ALIASES,normalizePlate,isValidPlate,normalizeVehicleModel,FalconVehicleProvider,TrustCarImageProvider,VehicleLookupService};
