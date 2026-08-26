'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const http = require('node:http');
const os = require('node:os');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { createDatabase, createSessionStore } = require('./database');
const {
  normalizeEmail,
  validatePassword,
  validateRegistration,
  requireAuth,
  hashPassword,
  verifyPassword
} = require('./auth');
const { ROLES, requireRole, requirePageRole } = require('./authorization');
const { VehicleEfficiencyProvider, estimateConsumption } = require('./vehicle-efficiency');
const {
  PlateLookupProvider,
  AutoDevVehicleImageProvider,
  FipePriceProvider,
  PhotonGeocodingProvider,
  NominatimGeocodingProvider,
  GoogleGeocodingProvider,
  MapboxGeocodingProvider,
  FallbackGeocodingProvider,
  createRouteProvider
} = require('./providers');
const {
  FalconVehicleProvider,
  TrustCarImageProvider,
  VehicleLookupService,
  normalizePlate
} = require('./vehicle-lookup');
const { RoadEventService, ALLOWED_CATEGORIES } = require('./road-events');
const { matchRadarsToRoute } = require('./radar/radar-route-matcher');
const { rankReconstructionCandidates, MapMatchingProvider } = require('./reconstruction');
const { validateSchedule, isWithinSchedule } = require('./schedule');
const {
  validateGeofence,
  classifyCirclePosition,
  classifyPolygonPosition,
  nextGeofenceState
} = require('./geofence');
const { createDiagnosticEvent, EVENT_TYPES, SEVERITIES } = require('./vehicle-diagnostics');
const { acceptTelemetryPoint, validateTelemetryPoint } = require('./telemetry');
const { smoothTrackForDisplay } = require('./trajectory');
const { calculateTrackMetrics } = require('./trip-metrics');
const { createCommunityRouter, parseFeatureFlag } = require('./community');
const { createPlatformRouter } = require('./platform');
const { createTwoFactorRouter, createTwoFactorGuard } = require('./two-factor');
require('dotenv').config();

const sessions = new Map();
const ttlMs = Math.max(1, Number(process.env.SESSION_TTL_MINUTES) || 120) * 60000;
const defaultEfficiencyProvider = new VehicleEfficiencyProvider();
const PBE_MODELS = defaultEfficiencyProvider.list();
const poiCache = new Map();
const serviceCache = new Map();
const serviceInflight = new Map();
async function cachedServiceCall(key, producer, ttl = 120000) {
  const cached = serviceCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (serviceInflight.has(key)) return serviceInflight.get(key);
  const pending = Promise.resolve()
    .then(producer)
    .then(value => {
      serviceCache.set(key, { value, expiresAt: Date.now() + ttl });
      return value;
    })
    .finally(() => serviceInflight.delete(key));
  serviceInflight.set(key, pending);
  return pending;
}

function optional(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
function safePosition(value) {
  if (
    !value ||
    !Number.isFinite(Number(value.latitude)) ||
    !Number.isFinite(Number(value.longitude))
  )
    return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    latitude,
    longitude,
    accuracy: Math.max(0, optional(value.accuracy) ?? 0),
    speed: optional(value.speed),
    heading: optional(value.heading),
    altitude: optional(value.altitude),
    timestamp: optional(value.timestamp) ?? Date.now(),
    source: value.source === 'simulation' ? 'simulation' : 'gps',
    capturedOffline: Boolean(value.capturedOffline),
    sequence: optional(value.sequence)
  };
}
function validCoordPair(text) {
  const parts = String(text || '')
    .split(',')
    .map(Number);
  return parts.length === 2 &&
    Number.isFinite(parts[0]) &&
    Number.isFinite(parts[1]) &&
    Math.abs(parts[1]) <= 90 &&
    Math.abs(parts[0]) <= 180
    ? parts
    : null;
}
function parsePoiRoute(text) {
  const raw = String(text || '')
    .split(';')
    .filter(Boolean);
  if (!raw.length) return [];
  if (raw.length > 30) return null;
  const pairs = raw.map(validCoordPair);
  return pairs.some(pair => !pair) ? null : pairs;
}
function safeJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
function tableExists(database, name) {
  return Boolean(
    database.prepare("SELECT 1 AS found FROM sqlite_schema WHERE type='table' AND name=?").get(name)
  );
}
function hashMobileToken(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}
function pairingCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}
function validMobileToken(storedHash, suppliedToken) {
  if (
    typeof storedHash !== 'string' ||
    storedHash.length !== 64 ||
    typeof suppliedToken !== 'string' ||
    suppliedToken.length < 32 ||
    suppliedToken.length > 128
  )
    return false;
  const suppliedHash = hashMobileToken(suppliedToken);
  return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(suppliedHash, 'hex'));
}
function validateVehicle(value) {
  if (!value || typeof value !== 'object') return null;
  const text = (field, max) =>
    typeof value[field] === 'string' ? value[field].trim().slice(0, max) : '';
  const number = (field, min, max) => {
    const parsed = Number(value[field]);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
  };
  const vin = text('vin', 17)
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, '');
  const vehicle = {
    nickname: text('nickname', 60),
    type: value.type === 'motorcycle' ? 'motorcycle' : 'car',
    plate: normalizePlate(text('plate', 10)),
    vin: vin || null,
    brand: text('brand', 60),
    model: text('model', 80),
    year: number('year', 1950, 2100),
    manufactureYear: number('manufactureYear', 1950, 2100),
    version: text('version', 80),
    color: text('color', 40),
    image: null,
    engine: text('engine', 40),
    transmission: text('transmission', 40),
    fuel: text('fuel', 40),
    city: number('city', 1, 100),
    road: number('road', 1, 100),
    tank: number('tank', 1, 300),
    dataSource: text('dataSource', 120) || 'manual',
    sourceDate: text('sourceDate', 20) || null
  };
  if (value.image && typeof value.image === 'object') {
    const imageUrl = String(value.image.url || '').slice(0, 1000);
    if (imageUrl.startsWith('https://') || imageUrl === '/images/vehicle-placeholder.svg')
      vehicle.image = {
        found: Boolean(value.image.found),
        url: imageUrl,
        source: String(value.image.source || '').slice(0, 40) || null,
        license: String(value.image.license || '').slice(0, 100) || null,
        author: String(value.image.author || '').slice(0, 160) || null,
        attribution: String(value.image.attribution || '').slice(0, 500) || null,
        reference: String(value.image.reference || '').slice(0, 100) || null
      };
  }
  if (vehicle.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vehicle.vin)) return null;
  return vehicle.nickname &&
    vehicle.brand &&
    vehicle.model &&
    vehicle.city &&
    vehicle.road &&
    vehicle.tank
    ? vehicle
    : null;
}
function normalizePositionBatch(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .slice(0, 2000)
    .map(safePosition)
    .filter(Boolean)
    .sort(
      (a, b) =>
        (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER) ||
        a.timestamp - b.timestamp
    )
    .filter(position => {
      if (position.sequence == null) return true;
      if (seen.has(position.sequence)) return false;
      seen.add(position.sequence);
      return true;
    });
}
function telemetryPayload(value, source, fallbackDeviceId) {
  return {
    ...value,
    source,
    deviceId: typeof value?.deviceId === 'string' ? value.deviceId : fallbackDeviceId
  };
}
function insertPosition(database, trackingSessionId, position) {
  const accuracyClass =
    position.accuracy <= 10
      ? 'Excelente'
      : position.accuracy <= 30
        ? 'Boa'
        : position.accuracy <= 100
          ? 'Regular'
          : 'Baixa';
  const source = position.source === 'simulation' ? 'simulation' : 'mobile-gps';
  const sequence = position.sequence ?? position.timestamp;
  return (
    database
      .prepare(
        'INSERT OR IGNORE INTO positions (tracking_session_id, device_id, latitude, longitude, accuracy, speed, heading, altitude, altitude_accuracy, captured_at, received_at, source, captured_offline, sequence_number, accuracy_class, suspicious, suspicion_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        trackingSessionId,
        position.deviceId || 'rastreon-web',
        position.latitude,
        position.longitude,
        position.accuracy,
        position.speed,
        position.heading,
        position.altitude,
        null,
        position.timestamp,
        Date.now(),
        source,
        position.capturedOffline ? 1 : 0,
        sequence,
        accuracyClass,
        0,
        null
      ).changes === 1
  );
}
function applyDataRetention(database, { now = Date.now(), days = 0 } = {}) {
  const safeDays = Math.max(0, Math.floor(Number(days) || 0));
  if (!safeDays) return { enabled: false, deletedSessions: 0 };
  const cutoff = now - safeDays * 86400000,
    result = database
      .prepare(
        'DELETE FROM tracking_sessions WHERE created_at < ? AND (closed_at IS NOT NULL OR expires_at < ?)'
      )
      .run(cutoff, now);
  return { enabled: true, days: safeDays, cutoff, deletedSessions: result.changes };
}
function validateProductionConfig(
  environment = process.env,
  { sessionSecret = environment.SESSION_SECRET } = {}
) {
  if (environment.NODE_ENV !== 'production') return { valid: true };
  const errors = [];
  if (typeof sessionSecret !== 'string' || sessionSecret.length < 32)
    errors.push('SESSION_SECRET deve ter pelo menos 32 caracteres.');
  try {
    const publicUrl = new URL(environment.PUBLIC_URL);
    if (publicUrl.protocol !== 'https:') errors.push('PUBLIC_URL deve usar HTTPS em produção.');
  } catch {
    errors.push('PUBLIC_URL HTTPS é obrigatória em produção.');
  }
  if (
    (environment.MAP_PROVIDER === 'google' ||
      environment.ROUTE_PROVIDER === 'google' ||
      environment.GEOCODING_PROVIDER === 'google') &&
    !environment.GOOGLE_MAPS_API_KEY
  )
    errors.push('GOOGLE_MAPS_API_KEY é obrigatória para providers Google.');
  if (
    (environment.ROUTE_PROVIDER === 'google' || environment.GEOCODING_PROVIDER === 'google') &&
    environment.MAP_PROVIDER !== 'google'
  )
    errors.push(
      'Resultados cartográficos Google devem ser exibidos em MAP_PROVIDER=google conforme as políticas da plataforma.'
    );
  if (
    environment.MAP_PROVIDER === 'mapbox' &&
    !(environment.MAPBOX_WEB_PUBLIC_TOKEN || environment.MAPBOX_ACCESS_TOKEN)
  )
    errors.push(
      'MAPBOX_WEB_PUBLIC_TOKEN (ou MAPBOX_ACCESS_TOKEN legado) é obrigatório para MAP_PROVIDER=mapbox.'
    );
  if (
    environment.TRACCAR_ENABLED === 'true' &&
    (!environment.TRACCAR_WEBHOOK_SECRET ||
      environment.TRACCAR_WEBHOOK_SECRET.length < 24 ||
      !environment.TRACCAR_DEVICE_HASH_SECRET ||
      environment.TRACCAR_DEVICE_HASH_SECRET.length < 24)
  )
    errors.push('Traccar exige segredos distintos e fortes para webhook e hash de dispositivo.');
  if (environment.FEATURE_REMOTE_BLOCK_HARDWARE === 'true')
    errors.push('FEATURE_REMOTE_BLOCK_HARDWARE deve permanecer false nesta versão.');
  if (errors.length) throw new Error(`Configuração de produção inválida: ${errors.join(' ')}`);
  return { valid: true };
}
function requireCsrf(req, res, next) {
  const supplied = String(req.get('x-csrf-token') || ''),
    expected = String(req.session?.csrfToken || '');
  if (supplied.length !== 64 || expected.length !== 64)
    return res.status(403).json({ error: 'Token de segurança ausente ou inválido.' });
  const valid = crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  return valid
    ? next()
    : res.status(403).json({ error: 'Token de segurança ausente ou inválido.' });
}
function publicVehicle(row) {
  const cachedImage = safeJson(row.image_json);
  return {
    id: row.id,
    nickname: row.nickname,
    type: row.type,
    plate: row.plate || '',
    hasVin: Boolean(row.vin),
    vinLast4: row.vin ? row.vin.slice(-4) : '',
    image:
      cachedImage ||
      (row.vin ? { url: `/api/vehicles/${row.id}/image`, source: 'auto.dev' } : null),
    brand: row.brand,
    model: row.model,
    year: row.year,
    manufactureYear: row.manufacture_year || null,
    color: row.color || '',
    version: row.version || '',
    engine: row.engine || '',
    transmission: row.transmission || '',
    fuel: row.fuel || '',
    city: row.city_consumption,
    road: row.road_consumption,
    tank: row.tank_capacity,
    dataSource: row.data_source,
    sourceDate: row.source_date,
    selected: Boolean(row.selected),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function localNetworkAddress() {
  for (const entries of Object.values(os.networkInterfaces()))
    for (const entry of entries || [])
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
  return null;
}
function distanceBetween(a, b) {
  const radians = value => (value * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude),
    dLng = radians(b.longitude - a.longitude),
    value =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(value));
}
function validPlannedRoute(value) {
  if (!value || typeof value !== 'object') return null;
  const distanceMeters = Number(value.distanceMeters ?? value.distance),
    durationSeconds = Number(value.durationSeconds ?? value.duration);
  if (!(distanceMeters >= 0) || !(durationSeconds >= 0) || !Array.isArray(value.geometry))
    return null;
  const steps = (Array.isArray(value.steps) ? value.steps : []).slice(0, 1000).map(step => ({
    maneuver: String(step?.maneuver || 'straight').slice(0, 30),
    instruction: String(step?.instruction || 'Continue na rota').slice(0, 240),
    street: String(step?.street || '').slice(0, 160),
    distanceMeters: Number(step?.distanceMeters) || 0,
    durationSeconds: Number(step?.durationSeconds) || 0,
    location:
      step?.location &&
      Number.isFinite(Number(step.location.latitude)) &&
      Number.isFinite(Number(step.location.longitude))
        ? { latitude: Number(step.location.latitude), longitude: Number(step.location.longitude) }
        : null
  }));
  return {
    routeId: String(value.routeId ?? value.id ?? 'primary').slice(0, 100),
    provider: String(value.provider || 'unknown').slice(0, 40),
    distanceMeters,
    durationSeconds,
    durationInTrafficSeconds: Number.isFinite(Number(value.durationInTrafficSeconds))
      ? Number(value.durationInTrafficSeconds)
      : null,
    geometry: value.geometry.slice(0, 50000),
    steps,
    tolls: value.tolls ?? null,
    traffic: value.traffic ?? null
  };
}
function publicSession(value) {
  return {
    id: value.id,
    createdAt: value.createdAt,
    closed: value.closed,
    phoneConnected: value.phoneSockets.size > 0,
    positions: value.positions,
    vehicle: value.vehicle,
    trip: value.trip,
    interruptions: value.interruptions
  };
}
function mobileSession(value) {
  return {
    id: value.id,
    closed: value.closed,
    vehicle: value.vehicle
      ? {
          nickname: value.vehicle.nickname,
          type: value.vehicle.type,
          brand: value.vehicle.brand,
          model: value.vehicle.model,
          version: value.vehicle.version || ''
        }
      : null
  };
}
function createApplication(options = {}) {
  const database = options.database || createDatabase(options.databasePath);
  const efficiencyProvider = options.efficiencyProvider || defaultEfficiencyProvider;
  const photonGeocoder = new PhotonGeocodingProvider({
    baseUrl: process.env.PHOTON_API_URL || 'https://photon.komoot.io'
  });
  const nominatimUrl = process.env.NOMINATIM_BASE_URL;
  if (nominatimUrl && new URL(nominatimUrl).hostname === 'nominatim.openstreetmap.org')
    throw new Error(
      'O Nominatim público não pode ser usado pelo Rastreon. Configure uma instância própria ou contratada.'
    );
  const nominatimGeocoder = nominatimUrl
    ? new NominatimGeocodingProvider({ baseUrl: nominatimUrl })
    : null;
  const mapProviderName = process.env.MAP_PROVIDER || 'maplibre';
  const googleGeocoder =
    mapProviderName === 'google' && process.env.GOOGLE_MAPS_API_KEY
      ? new GoogleGeocodingProvider({ apiKey: process.env.GOOGLE_MAPS_API_KEY })
      : null;
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_WEB_PUBLIC_TOKEN;
  const mapboxGeocoder =
    mapProviderName === 'mapbox' && mapboxToken
      ? new MapboxGeocodingProvider({ accessToken: mapboxToken })
      : null;
  const chainGeocoders = providers =>
    providers
      .filter(Boolean)
      .reduceRight(
        (fallback, provider) =>
          fallback ? new FallbackGeocodingProvider(provider, fallback) : provider,
        null
      );
  const geocoderName =
    process.env.GEOCODING_PROVIDER || (mapProviderName === 'mapbox' ? 'mapbox' : 'photon');
  if (geocoderName === 'nominatim' && !nominatimGeocoder)
    throw new Error(
      'NOMINATIM_BASE_URL própria ou contratada é obrigatória para GEOCODING_PROVIDER=nominatim.'
    );
  const geocoderOrder =
    geocoderName === 'google'
      ? [googleGeocoder, mapboxGeocoder, photonGeocoder, nominatimGeocoder]
      : geocoderName === 'mapbox'
        ? [mapboxGeocoder, googleGeocoder, photonGeocoder, nominatimGeocoder]
        : geocoderName === 'nominatim'
          ? [nominatimGeocoder, photonGeocoder, mapboxGeocoder, googleGeocoder]
          : [photonGeocoder, mapboxGeocoder, googleGeocoder, nominatimGeocoder];
  const geocodingProvider = options.geocodingProvider || chainGeocoders(geocoderOrder);
  const apiPlacasToken = process.env.API_PLACAS_TOKEN;
  const plateLookupProvider =
    options.plateLookupProvider ||
    new PlateLookupProvider({
      baseUrl: apiPlacasToken ? 'https://wdapi2.com.br/consulta' : process.env.PLATE_LOOKUP_URL,
      token: apiPlacasToken || process.env.PLATE_LOOKUP_TOKEN,
      serviceType: process.env.PLATE_LOOKUP_TYPE || 'agregados-basica',
      homolog: process.env.PLATE_LOOKUP_HOMOLOG === 'true'
    });
  const fipePriceProvider =
    options.fipePriceProvider ||
    new FipePriceProvider({
      baseUrl: process.env.FIPE_API_URL || 'https://brasilapi.com.br/api/fipe/preco/v1'
    });
  const vehicleImageProvider =
    options.vehicleImageProvider ||
    new AutoDevVehicleImageProvider({ apiKey: process.env.AUTO_DEV_API_KEY });
  const falconProvider =
    options.falconProvider ||
    new FalconVehicleProvider({
      token: process.env.FALCON_API_TOKEN || process.env.FALCON_DATAHUB_TOKEN,
      baseUrl: process.env.FALCON_API_BASE_URL || 'https://beta.falcon-server.com.br/data-hub'
    });
  const trustCarProvider =
    options.trustCarProvider ||
    (options.databasePath === ':memory:'
      ? { search: async () => null }
      : new TrustCarImageProvider({
          baseUrl: process.env.TRUSTCAR_IMAGE_URL || 'https://carapi.trustcar.info/getImage'
        }));
  const configuredVehicleProvider =
    options.plateLookupProvider ||
    (apiPlacasToken
      ? plateLookupProvider
      : process.env.FALCON_API_TOKEN || process.env.FALCON_DATAHUB_TOKEN
        ? falconProvider
        : plateLookupProvider);
  const vehicleLookupService =
    options.vehicleLookupService ||
    new VehicleLookupService({
      database,
      vehicleProvider: configuredVehicleProvider,
      imageProvider:
        options.trustCarProvider ||
        (options.plateLookupProvider ? { search: async () => null } : trustCarProvider)
    });
  const routeProvider = options.routeProvider || createRouteProvider();
  const mapMatchingProvider = options.mapMatchingProvider || new MapMatchingProvider();
  const roadEventService = new RoadEventService(database);
  const app = express();
  app.set('trust proxy', 'loopback');
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: false }, maxHttpBufferSize: 256 * 1024 });
  const publicDir = path.join(__dirname, '..', 'public');
  const configuredSecret = options.sessionSecret || process.env.SESSION_SECRET;
  validateProductionConfig(process.env, { sessionSecret: configuredSecret });
  const sessionSecret = configuredSecret || crypto.randomBytes(32).toString('hex');
  if (!configuredSecret && !options.silent)
    console.warn(
      'AVISO: SESSION_SECRET temporário. Configure o .env para manter logins após reinícios.'
    );
  const secureCookie =
    options.secureCookie ??
    (process.env.NODE_ENV === 'production' && options.databasePath !== ':memory:');
  const sessionMiddleware = session({
    name: 'rastro.sid',
    secret: sessionSecret,
    store: createSessionStore(session, database),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: 24 * 60 * 60 * 1000 }
  });
  const serviceLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas consultas. Aguarde um minuto.' }
  });
  const plateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req =>
      req.session?.userId ? `user:${req.session.userId}` : ipKeyGenerator(req.ip),
    message: {
      error: 'Muitas consultas de placa. Aguarde um minuto.',
      code: 'PROVIDER_RATE_LIMIT',
      retryable: true
    }
  });
  const pairingLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req =>
      req.session?.userId ? `user:${req.session.userId}` : ipKeyGenerator(req.ip),
    message: {
      error: 'Muitas tentativas de pareamento. Aguarde um minuto.',
      code: 'PAIRING_RATE_LIMIT'
    }
  });

  const hydrateSession = row => ({
    id: row.id,
    ownerId: row.user_id,
    mobileTokenHash: row.mobile_token_hash,
    createdAt: row.created_at,
    closed: Boolean(row.closed_at),
    positions: database
      .prepare(
        'SELECT device_id AS deviceId, latitude, longitude, accuracy, speed, heading, altitude, captured_at AS timestamp, source, captured_offline AS capturedOffline, sequence_number AS sequence FROM positions WHERE tracking_session_id = ? ORDER BY captured_at LIMIT 10000'
      )
      .all(row.id),
    phoneSockets: new Set(),
    telemetryState: new Map(),
    vehicle: safeJson(row.vehicle_json),
    trip: safeJson(row.trip_json),
    interruptions: database
      .prepare(
        'SELECT lost_at AS lostAt, reconnected_at AS reconnectedAt, duration_ms AS duration, point_count AS pointCount, classification FROM interruptions WHERE tracking_session_id = ? ORDER BY reconnected_at'
      )
      .all(row.id)
  });
  for (const row of database
    .prepare('SELECT * FROM tracking_sessions WHERE closed_at IS NULL AND created_at > ?')
    .all(Date.now() - ttlMs))
    sessions.set(row.id, hydrateSession(row));
  const ownedSession = (id, userId) => {
    const tracking = sessions.get(id);
    return tracking && tracking.ownerId === userId && !tracking.closed ? tracking : null;
  };

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const supplied = String(req.get('x-request-id') || '');
    req.requestId = /^[A-Za-z0-9._-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID();
    res.set('X-Request-Id', req.requestId);
    const started = Date.now();
    res.on('finish', () => {
      if (process.env.NODE_ENV === 'production')
        console.log(
          JSON.stringify({
            request_id: req.requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration_ms: Date.now() - started,
            timestamp: new Date().toISOString()
          })
        );
    });
    next();
  });
  const enforceHttpsResources =
    options.enforceHttpsResources ?? process.env.NODE_ENV === 'production';
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https://cdn.trustcar.info',
            'https://upload.wikimedia.org',
            'https://tile.openstreetmap.org',
            'https://*.openstreetmap.org',
            'https://tiles.openfreemap.org',
            'https://*.openfreemap.org',
            'https://api.mapbox.com',
            'https://*.tiles.mapbox.com',
            'https://maps.gstatic.com',
            'https://*.googleapis.com',
            'https://*.ggpht.com'
          ],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          scriptSrc: ["'self'", 'https://maps.googleapis.com', 'https://maps.gstatic.com'],
          workerSrc: ["'self'", 'blob:'],
          connectSrc: [
            "'self'",
            'ws:',
            'wss:',
            'https://tile.openstreetmap.org',
            'https://*.openstreetmap.org',
            'https://tiles.openfreemap.org',
            'https://*.openfreemap.org',
            'https://api.mapbox.com',
            'https://*.tiles.mapbox.com',
            'https://events.mapbox.com',
            'https://maps.googleapis.com',
            'https://maps.gstatic.com'
          ],
          upgradeInsecureRequests: enforceHttpsResources ? [] : null
        }
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'origin-when-cross-origin' }
    })
  );
  app.use(express.json({ limit: '50kb', strict: true }));
  app.use(sessionMiddleware);
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    try {
      if (new URL(origin).host === req.get('host')) return next();
    } catch {}
    return res.status(403).json({ error: 'Origem da requisição não autorizada.' });
  });
  const twoFactorGuard = createTwoFactorGuard(database);
  const twoFactorRouter = createTwoFactorRouter({ database });
  const communityRouter = createCommunityRouter({
    database,
    enabled: process.env.COMMUNITY_PLACES_ENABLED
  });
  const platformRouter = createPlatformRouter({
    database,
    twoFactorGuard,
    sessions,
    io,
    geocodingProvider
  });
  app.use('/api/security/2fa', twoFactorRouter);
  app.use('/api/community', communityRouter);
  app.use('/api/platform', platformRouter);
  app.use('/api/v1/community', communityRouter);
  app.use('/api/v1/platform', platformRouter);
  app.use(
    ['/api/geocode', '/api/reverse-geocode', '/api/route', '/api/trips/:id/reconstruct'],
    serviceLimiter
  );
  // CSS e JavaScript mantêm o mesmo nome entre publicações. Eles precisam ser
  // revalidados para que uma atualização do mapa não fique presa no navegador.
  const sourceAssetOptions = { maxAge: 0, etag: true, immutable: false };
  const staticAssetOptions = { maxAge: '7d', etag: true, immutable: true };
  app.use('/css', express.static(path.join(publicDir, 'css'), sourceAssetOptions));
  app.use('/js', express.static(path.join(publicDir, 'js'), sourceAssetOptions));
  app.use('/images', express.static(path.join(publicDir, 'images'), staticAssetOptions));
  app.use('/models', express.static(path.join(publicDir, 'models'), staticAssetOptions));
  app.use(
    '/vendor/leaflet',
    express.static(
      path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist'),
      staticAssetOptions
    )
  );
  app.use(
    '/vendor/maplibre',
    express.static(
      path.join(__dirname, '..', 'node_modules', 'maplibre-gl', 'dist'),
      staticAssetOptions
    )
  );
  app.use(
    '/vendor/mapbox',
    express.static(
      path.join(__dirname, '..', 'node_modules', 'mapbox-gl', 'dist'),
      staticAssetOptions
    )
  );
  app.use(
    '/vendor/three',
    express.static(path.join(__dirname, '..', 'node_modules', 'three'), staticAssetOptions)
  );
  app.use(
    '/vendor/zxing',
    express.static(
      path.join(__dirname, '..', 'node_modules', '@zxing', 'browser', 'umd'),
      staticAssetOptions
    )
  );
  app.get('/map-config.js', (_req, res) => {
    const provider = process.env.MAP_PROVIDER || 'maplibre';
    const allowMapFallback =
      process.env.ALLOW_MAP_FALLBACK === 'true' || process.env.ALLOW_MAP_FALLBACK === '1';
    const enableDevTools =
      process.env.ENABLE_DEV_TOOLS === 'true' || process.env.ENABLE_DEV_TOOLS === '1';
    const mapboxAccessToken =
      provider === 'mapbox'
        ? process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_WEB_PUBLIC_TOKEN || ''
        : '';
    const defaultMapboxStyle = 'mapbox://styles/mapbox/navigation-day-v1';
    const mapStyleUrl =
      provider === 'mapbox'
        ? process.env.MAP_STYLE_URL || defaultMapboxStyle
        : process.env.MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
    res
      .type('application/javascript')
      .set('Cache-Control', 'no-store')
      .send(
        `window.RASTROTACK_MAP_CONFIG=${JSON.stringify({
          provider,
          mapStyleUrl,
          mapboxAccessToken,
          googleMapsApiKey: provider === 'google' ? process.env.GOOGLE_MAPS_API_KEY || '' : '',
          googleMapsMapId: provider === 'google' ? process.env.GOOGLE_MAPS_MAP_ID || '' : '',
          allowMapFallback,
          enableDevTools
        })};`
      );
  });
  app.get('/login.html', (req, res) =>
    req.session.userId
      ? res.redirect('/dashboard')
      : res.sendFile(path.join(publicDir, 'login.html'))
  );
  app.get('/register.html', (req, res) =>
    req.session.userId
      ? res.redirect('/dashboard')
      : res.sendFile(path.join(publicDir, 'register.html'))
  );
  app.get('/mobile.html', (_req, res) => res.sendFile(path.join(publicDir, 'mobile.html')));
  app.get(['/pair', '/pair.html'], (_req, res) => res.sendFile(path.join(publicDir, 'pair.html')));
  app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'home.html')));
  app.get('/dashboard', (req, res) => {
    if (!req.session.userId) return res.redirect('/login.html');
    const revision = process.env.ASSET_REVISION || '20260826-vehicle-floating-2',
      html = fs
        .readFileSync(path.join(publicDir, 'index.html'), 'utf8')
        .replace(
          /((?:dashboard-refresh\.css|platform-features\.css|community-places\.css|dashboard\.js|ux\.js|map-service\.js|platform-features\.js|community-places\.js|vehicle-3d-config\.js)\?v=)[^"']+/g,
          `$1${revision}`
        );
    res.set('Cache-Control', 'no-store').type('html').send(html);
  });
  app.get('/admin', requirePageRole(database, ROLES.ADMIN), (_req, res) =>
    res.sendFile(path.join(publicDir, 'admin.html'))
  );
  app.get('/lab', requirePageRole(database, ROLES.DEVELOPER), (_req, res) =>
    res.sendFile(path.join(publicDir, 'lab.html'))
  );

  app.get('/api/health', (_req, res) => {
    const databaseOk = database.prepare('SELECT 1 AS ok').get().ok === 1;
    res.json({
      ok: databaseOk,
      database: databaseOk ? 'connected' : 'unavailable',
      sessions: sessions.size
    });
  });
  app.get('/api/ready', (_req, res) => {
    try {
      const databaseOk = database.prepare('SELECT 1 AS ok').get().ok === 1;
      if (!databaseOk) return res.status(503).json({ status: 'not-ready' });
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not-ready' });
    }
  });
  app.get('/api/admin/overview', requireRole(database, ROLES.ADMIN), (_req, res) => {
    const now = Date.now();
    res.json({
      counts: {
        users: database.prepare('SELECT COUNT(*) AS total FROM users').get().total,
        activeSessions: database
          .prepare(
            'SELECT COUNT(*) AS total FROM tracking_sessions WHERE closed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)'
          )
          .get(now).total,
        consentRecords: database.prepare('SELECT COUNT(*) AS total FROM consent_records').get()
          .total
      },
      generatedAt: now
    });
  });
  app.get('/api/lab/info', requireRole(database, ROLES.DEVELOPER), (_req, res) =>
    res.json({
      code: 'LAB-DEMO',
      version: 2,
      environment: process.env.NODE_ENV || 'development',
      physicalTagEnabled: process.env.TRACCAR_ENABLED === 'true',
      remoteHardwareBlock: false
    })
  );
  app.post('/api/lab/telemetry/validate', requireRole(database, ROLES.DEVELOPER), (req, res) => {
    const result = validateTelemetryPoint({ ...req.body, source: 'simulation' }, { offline: true });
    res.status(result.ok ? 200 : 400).json(result);
  });
  app.get('/api/pois', requireAuth, serviceLimiter, async (req, res, next) => {
    try {
      const latitude = Number(req.query.lat),
        longitude = Number(req.query.lng),
        category = String(req.query.category || ''),
        route = parsePoiRoute(req.query.route);
      const tags = {
        fuel: 'amenity=fuel',
        food: 'amenity~"restaurant|fast_food|cafe"',
        hotel: 'tourism~"hotel|motel|guest_house"',
        hospital: 'amenity~"hospital|clinic"',
        pharmacy: 'amenity=pharmacy',
        supermarket: 'shop~"supermarket|convenience"',
        mechanic: 'shop=car_repair',
        charge: 'amenity=charging_station',
        parking: 'amenity=parking',
        police: 'amenity=police',
        camera: 'highway=speed_camera'
      };
      const validCenter =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180;
      if (!validCenter || route === null || !tags[category])
        return res.status(400).json({ error: 'Consulta de locais inválida.' });
      const routeKey = route.length
          ? crypto.createHash('sha256').update(JSON.stringify(route)).digest('hex').slice(0, 16)
          : '',
        key = `${category}:${latitude.toFixed(2)}:${longitude.toFixed(2)}:${routeKey}`,
        cached = poiCache.get(key);
      if (cached && cached.expiresAt > Date.now())
        return res.json({ places: cached.places, cached: true });
      const denseRadius = { food: 2500, pharmacy: 3500, supermarket: 3500, parking: 3500 },
        radius = denseRadius[category] || 5000,
        area = route.length
          ? `(around:1200,${route.map(([lng, lat]) => `${lat},${lng}`).join(',')})`
          : `(around:${radius},${latitude},${longitude})`,
        query = `[out:json][timeout:12];nwr[${tags[category]}]${area};out center 60;`;
      const overpassUrls = String(
        process.env.OVERPASS_API_URLS ||
          process.env.OVERPASS_API_URL ||
          'https://overpass-api.de/api/interpreter'
      )
        .split(',')
        .map(value => value.trim().replace(/\/$/, ''))
        .filter(value => /^https:\/\//.test(value))
        .slice(0, 3);
      let data,
        lastStatus = null;
      for (const overpassUrl of overpassUrls) {
        try {
          const response = await fetch(`${overpassUrl}?data=${encodeURIComponent(query)}`, {
            signal: AbortSignal.timeout(16000),
            headers: { 'User-Agent': 'Rastreon/1.0' }
          });
          lastStatus = response.status;
          if (response.ok) {
            data = await response.json();
            break;
          }
        } catch {}
      }
      if (!data)
        throw new Error(`Serviço de locais indisponível${lastStatus ? ` (${lastStatus})` : ''}.`);
      const places = (Array.isArray(data.elements) ? data.elements : [])
        .slice(0, 60)
        .map(item => ({
          id: `${item.type}-${item.id}`,
          name: String(item.tags?.name || item.tags?.brand || 'Local próximo').slice(0, 100),
          address: [
            item.tags?.['addr:street'],
            item.tags?.['addr:housenumber'],
            item.tags?.['addr:city']
          ]
            .filter(Boolean)
            .join(', ')
            .slice(0, 180),
          category,
          latitude: Number(item.lat ?? item.center?.lat),
          longitude: Number(item.lon ?? item.center?.lon)
        }))
        .filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
      poiCache.set(key, { places, expiresAt: Date.now() + 300000 });
      res.json({ places, cached: false, scope: route.length ? 'route-corridor' : 'nearby' });
    } catch {
      res.status(502).json({ error: 'Locais próximos indisponíveis no momento.' });
    }
  });
  app.get('/api/capabilities', requireAuth, (_req, res) => {
    const apiPlacasConfigured = Boolean(process.env.API_PLACAS_TOKEN),
      falconConfigured = Boolean(process.env.FALCON_API_TOKEN || process.env.FALCON_DATAHUB_TOKEN),
      plateConfigured = Boolean(process.env.PLATE_LOOKUP_TOKEN),
      officialTraffic =
        (process.env.MAP_PROVIDER === 'google' && Boolean(process.env.GOOGLE_MAPS_API_KEY)) ||
        (process.env.MAP_PROVIDER === 'mapbox' &&
          Boolean(process.env.MAPBOX_WEB_PUBLIC_TOKEN || process.env.MAPBOX_ACCESS_TOKEN));
    res.json({
      version: 2,
      trackerMode: process.env.TRACCAR_ENABLED === 'true' ? 'mobile-and-traccar' : 'mobile-demo',
      mapProvider: process.env.MAP_PROVIDER || 'maplibre',
      routeProvider: process.env.ROUTE_PROVIDER || 'osrm',
      placesProvider: 'openstreetmap-overpass',
      plateLookup: {
        provider: apiPlacasConfigured
          ? 'api-placas'
          : falconConfigured
            ? 'falcon'
            : /wdapi2\.com\.br/i.test(process.env.PLATE_LOOKUP_URL || '')
              ? 'api-placas'
              : 'api-brasil',
        configured: apiPlacasConfigured || falconConfigured || plateConfigured,
        cache: 'sqlite'
      },
      features: {
        vehicles: true,
        trips: true,
        dailyNavigation: 'browser-foreground',
        nearbyPlaces: true,
        communityPlaces: parseFeatureFlag(process.env.COMMUNITY_PLACES_ENABLED),
        fuelStations: true,
        fuelPriceHistory: true,
        partnerBenefits: true,
        temporaryRoadReports: true,
        privateConversations: true,
        pxChannels: true,
        communityPhotos: true,
        notificationPreferences: true,
        traccar: process.env.TRACCAR_ENABLED === 'true',
        remoteHardwareBlock: false,
        offlineQueue: 'indexeddb',
        reconstruction: true,
        schedules: true,
        geofences: ['circle', 'polygon'],
        alerts: 'internal',
        liveTraffic: officialTraffic,
        communityTraffic: true,
        mapMatching: 'adapter-unavailable',
        externalNotifications: false
      }
    });
  });
  app.get('/api/road-events', requireAuth, (req, res) => {
    const latitude = Number(req.query.lat),
      longitude = Number(req.query.lng),
      radiusMeters = Number(req.query.radius || 5000),
      categories = String(req.query.categories || '')
        .split(',')
        .filter(value => ALLOWED_CATEGORIES.has(value));
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      return res.status(400).json({ error: 'Coordenadas inválidas.' });
    const events = roadEventService.nearby({
      latitude,
      longitude,
      radiusMeters,
      categories,
      limit: 250
    });
    res.json({
      events,
      count: events.length,
      radiusMeters: Math.min(30000, Math.max(100, radiusMeters || 5000))
    });
  });
  app.get('/api/map/radars', requireAuth, (req, res) => {
    try {
      const events = roadEventService.viewport({
        north: Number(req.query.north),
        south: Number(req.query.south),
        east: Number(req.query.east),
        west: Number(req.query.west),
        categories: ['speed_camera', 'mobile_camera', 'traffic_light_camera'],
        limit: Number(req.query.limit) || 250
      });
      res.json({ radars: events, count: events.length, source: 'catalog' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
  app.get('/api/map/radars/nearby', requireAuth, (req, res) => {
    const latitude = Number(req.query.lat),
      longitude = Number(req.query.lng);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      return res.status(400).json({ error: 'Coordenadas inválidas.' });
    const radars = roadEventService.nearby({
      latitude,
      longitude,
      radiusMeters: Number(req.query.radiusMeters) || 5000,
      categories: ['speed_camera', 'mobile_camera', 'traffic_light_camera'],
      limit: Number(req.query.limit) || 250
    });
    res.json({ radars, count: radars.length });
  });
  app.post('/api/navigation/route/radars', requireAuth, (req, res) => {
    const route = Array.isArray(req.body?.route) ? req.body.route : [];
    if (route.length < 2 || route.length > 10000)
      return res.status(400).json({ error: 'Geometria de rota inválida.' });
    const normalized = route.map(point =>
      Array.isArray(point)
        ? { latitude: Number(point[0]), longitude: Number(point[1]) }
        : { latitude: Number(point?.latitude), longitude: Number(point?.longitude) }
    );
    if (
      normalized.some(
        point => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
      )
    )
      return res.status(400).json({ error: 'Geometria de rota inválida.' });
    const latitudes = normalized.map(point => point.latitude),
      longitudes = normalized.map(point => point.longitude),
      padding = 0.002;
    const candidates = roadEventService.viewport({
      north: Math.max(...latitudes) + padding,
      south: Math.min(...latitudes) - padding,
      east: Math.max(...longitudes) + padding,
      west: Math.min(...longitudes) - padding,
      categories: ['speed_camera', 'mobile_camera', 'traffic_light_camera'],
      limit: 500
    });
    const radars = matchRadarsToRoute(normalized, candidates, {
      maxDistanceMeters: Number(req.body?.maxDistanceMeters) || 80
    });
    res.json({ radars, count: radars.length });
  });
  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const validation = validateRegistration(req.body);
      if (!validation.valid)
        return res.status(400).json({ error: validation.errors[0], errors: validation.errors });
      const exists = database
        .prepare('SELECT id FROM users WHERE email = ?')
        .get(validation.data.email);
      if (exists) return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
      const passwordHash = await hashPassword(validation.data.password);
      const result = database
        .prepare(
          'INSERT INTO users (name, email, phone, password_hash, subscription_plan, subscription_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          validation.data.name,
          validation.data.email,
          validation.data.phone || null,
          passwordHash,
          validation.data.plan,
          'demo_active',
          Date.now()
        );
      req.session.regenerate(error => {
        if (error) return next(error);
        req.session.userId = Number(result.lastInsertRowid);
        req.session.save(saveError =>
          saveError
            ? next(saveError)
            : res.status(201).json({
                user: {
                  id: Number(result.lastInsertRowid),
                  name: validation.data.name,
                  email: validation.data.email
                },
                subscription: { plan: validation.data.plan, status: 'demo_active' }
              })
        );
      });
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!email || password.length > 72)
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      const user = database
        .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
        .get(email);
      const valid = user
        ? await verifyPassword(password, user.password_hash)
        : await verifyPassword(
            password || 'invalid',
            '$2b$12$1Qn4A9lMMSv2zImlw6vV6eVYZ8jAlZLRQOGvT/ivKp8XzpAGMmZ2W'
          );
      if (!user || !valid) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      req.session.regenerate(error => {
        if (error) return next(error);
        req.session.userId = user.id;
        req.session.save(saveError =>
          saveError
            ? next(saveError)
            : res.json({ user: { id: user.id, name: user.name, email: user.email } })
        );
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = database
      .prepare('SELECT id, name, email, phone, created_at AS createdAt FROM users WHERE id = ?')
      .get(req.session.userId);
    if (!user)
      return req.session.destroy(() => res.status(401).json({ error: 'Sessão inválida.' }));
    res.json({ user });
  });
  app.get('/api/auth/csrf', requireAuth, (req, res, next) => {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    req.session.save(error =>
      error
        ? next(error)
        : res.set('Cache-Control', 'no-store').json({ token: req.session.csrfToken })
    );
  });
  app.put('/api/auth/password', requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const currentPassword =
          typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '',
        newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '',
        user = database
          .prepare('SELECT id,password_hash FROM users WHERE id=?')
          .get(req.session.userId);
      if (!user || !(await verifyPassword(currentPassword, user.password_hash)))
        return res.status(401).json({ error: 'Senha atual incorreta.' });
      if (!validatePassword(newPassword))
        return res
          .status(400)
          .json({ error: 'A nova senha deve ter de 8 a 72 caracteres, com letra e número.' });
      if (await verifyPassword(newPassword, user.password_hash))
        return res.status(400).json({ error: 'A nova senha deve ser diferente da atual.' });
      const passwordHash = await hashPassword(newPassword),
        now = Date.now();
      database.transaction(() => {
        database.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash, user.id);
        database
          .prepare(
            "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'PASSWORD_CHANGED','USER',?,'Alteração autenticada pelo titular',?)"
          )
          .run(user.id, String(user.id), now);
        for (const row of database
          .prepare('SELECT sid,data FROM auth_sessions WHERE sid<>?')
          .all(req.sessionID)) {
          const value = safeJson(row.data, {});
          if (Number(value?.userId) === Number(user.id))
            database.prepare('DELETE FROM auth_sessions WHERE sid=?').run(row.sid);
        }
      })();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/auth/logout', requireAuth, (req, res, next) =>
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie('rastro.sid');
      res.status(204).end();
    })
  );

  app.get('/api/vehicles/reference', requireAuth, (_req, res) =>
    res.json(efficiencyProvider.list())
  );
  app.post('/api/consumption/estimate', requireAuth, (req, res) => {
    const result = estimateConsumption(req.body || {});
    if (!result) return res.status(400).json({ error: 'Dados de consumo inválidos.' });
    res.json({
      estimate: result,
      disclaimer:
        'Os valores são estimativas. O consumo real somente poderá ser conhecido por integração autorizada com o veículo, dispositivo OBD-II, abastecimentos ou computador de bordo.'
    });
  });
  app.get('/api/profile', requireAuth, (req, res) => {
    const user = database
      .prepare(
        'SELECT id, name, email, phone, avatar_data AS avatarData, subscription_plan AS subscriptionPlan, subscription_status AS subscriptionStatus, created_at AS createdAt FROM users WHERE id = ?'
      )
      .get(req.session.userId);
    if (!user) return res.status(401).json({ error: 'Sessão inválida.' });
    const vehicleCount = database
      .prepare('SELECT COUNT(*) AS total FROM vehicles WHERE user_id = ?')
      .get(user.id).total;
    const recentTrips = database
      .prepare(
        'SELECT id, created_at AS createdAt, closed_at AS closedAt, vehicle_json AS vehicleJson FROM tracking_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5'
      )
      .all(user.id)
      .map(row => ({
        id: row.id,
        createdAt: row.createdAt,
        closedAt: row.closedAt,
        vehicle: safeJson(row.vehicleJson)
      }));
    const recentAlertCount = database
      .prepare('SELECT COUNT(*) AS total FROM alerts WHERE user_id = ? AND read_at IS NULL')
      .get(user.id).total;
    const planNames = {
      rastreio: 'Plano Rastreio',
      inteligente: 'Plano Inteligente',
      familia: 'Plano Família'
    };
    res.json({
      user,
      plan: `${planNames[user.subscriptionPlan] || planNames.inteligente} — demonstração`,
      subscription: { plan: user.subscriptionPlan, status: user.subscriptionStatus },
      vehicleCount,
      recentTrips,
      recentAlertCount
    });
  });
  app.get('/api/weather/current', requireAuth, async (req, res) => {
    const latitude = Number(req.query.lat),
      longitude = Number(req.query.lng),
      apiKey = process.env.WEATHER_API_KEY,
      baseUrl = String(process.env.WEATHER_API_URL || 'https://api.weatherapi.com/v1').replace(
        /\/$/,
        ''
      );
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      return res.status(400).json({ error: 'Localização inválida.' });
    if (!apiKey)
      return res
        .status(503)
        .json({ error: 'API de clima não configurada.', code: 'WEATHER_NOT_CONFIGURED' });
    try {
      const url = `${baseUrl}/current.json?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(`${latitude},${longitude}`)}&lang=pt`,
        response = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'Rastreon/1.0' },
          signal: AbortSignal.timeout(10000)
        }),
        data = await response.json();
      if (!response.ok)
        return res.status(response.status === 401 || response.status === 403 ? 503 : 502).json({
          error: data?.error?.message || 'Clima indisponível.',
          code: 'WEATHER_PROVIDER_ERROR'
        });
      res.set('Cache-Control', 'private, max-age=300').json({
        location: {
          name: String(data.location?.name || ''),
          region: String(data.location?.region || '')
        },
        current: {
          temperatureC: Number(data.current?.temp_c),
          feelsLikeC: Number(data.current?.feelslike_c),
          condition: String(data.current?.condition?.text || ''),
          humidity: Number(data.current?.humidity),
          windKph: Number(data.current?.wind_kph),
          isDay: Boolean(data.current?.is_day),
          updatedAt: Number(data.current?.last_updated_epoch) * 1000
        },
        provider: 'WeatherAPI.com'
      });
    } catch (error) {
      res.status(502).json({
        error:
          error?.name === 'TimeoutError'
            ? 'A consulta do clima excedeu o tempo limite.'
            : 'Não foi possível consultar o clima.',
        code: 'WEATHER_UNAVAILABLE'
      });
    }
  });
  app.put('/api/profile/avatar', requireAuth, requireCsrf, (req, res) => {
    const avatarData = String(req.body?.avatarData || '');
    if (avatarData && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarData))
      return res.status(400).json({ error: 'Formato de imagem inválido.' });
    if (avatarData.length > 45000)
      return res.status(413).json({ error: 'A foto ficou muito grande. Escolha outra imagem.' });
    database
      .prepare('UPDATE users SET avatar_data=? WHERE id=?')
      .run(avatarData || null, req.session.userId);
    res.json({ avatarData: avatarData || null });
  });
  app.get('/api/privacy/export', requireAuth, (req, res) => {
    const userId = req.session.userId,
      user = database
        .prepare('SELECT id,name,email,phone,role,created_at AS createdAt FROM users WHERE id=?')
        .get(userId);
    if (!user) return res.status(404).json({ error: 'Conta não encontrada.' });
    const tracking = database
        .prepare(
          'SELECT id,vehicle_json AS vehicle,trip_json AS trip,created_at AS createdAt,expires_at AS expiresAt,closed_at AS closedAt FROM tracking_sessions WHERE user_id=? ORDER BY created_at'
        )
        .all(userId)
        .map(row => ({ ...row, vehicle: safeJson(row.vehicle), trip: safeJson(row.trip) })),
      trackingIds = tracking.map(row => row.id),
      owned = sql => database.prepare(sql).all(userId);
    const payload = {
      generatedAt: Date.now(),
      purpose: 'Portabilidade dos dados do titular',
      user,
      vehicles: owned(
        'SELECT id,nickname,type,plate,brand,model,year,version,engine,transmission,fuel,city_consumption AS cityConsumption,road_consumption AS roadConsumption,tank_capacity AS tankCapacity,data_source AS dataSource,created_at AS createdAt,updated_at AS updatedAt FROM vehicles WHERE user_id=?'
      ),
      fuelPrices: owned(
        'SELECT fuel_type AS fuelType,price_per_liter AS pricePerLiter,source,region,updated_at AS updatedAt FROM fuel_price_preferences WHERE user_id=?'
      ),
      trackingSessions: tracking,
      trips: owned(
        'SELECT id,vehicle_id AS vehicleId,tracking_session_id AS trackingSessionId,planned_route_json AS plannedRoute,started_at AS startedAt,ended_at AS endedAt,created_at AS createdAt FROM trips WHERE user_id=?'
      ),
      positions: trackingIds.length
        ? database
            .prepare(
              `SELECT tracking_session_id AS trackingSessionId,device_id AS deviceId,latitude,longitude,accuracy,speed,heading,altitude,captured_at AS capturedAt,received_at AS receivedAt,source,captured_offline AS capturedOffline FROM positions WHERE tracking_session_id IN (${trackingIds.map(() => '?').join(',')}) ORDER BY captured_at`
            )
            .all(...trackingIds)
        : [],
      geofences: owned(
        'SELECT id,vehicle_id AS vehicleId,name,type,center_lat AS centerLat,center_lng AS centerLng,radius_meters AS radiusMeters,polygon_json AS polygon,enabled,created_at AS createdAt,updated_at AS updatedAt FROM geofences WHERE user_id=?'
      ),
      alerts: owned(
        'SELECT id,vehicle_id AS vehicleId,trip_id AS tripId,type,severity,title,details_json AS details,occurred_at AS occurredAt,read_at AS readAt FROM alerts WHERE user_id=?'
      ),
      savedPlaces: owned(
        'SELECT place_key AS placeKey,label,address,latitude,longitude,updated_at AS updatedAt FROM saved_places WHERE user_id=?'
      ),
      communityReviews: tableExists(database, 'community_place_reviews')
        ? owned(
            'SELECT id,place_id AS placeId,rating,comment,status,created_at AS createdAt,updated_at AS updatedAt,removed_at AS removedAt FROM community_place_reviews WHERE user_id=?'
          )
        : [],
      communityReports: tableExists(database, 'community_review_reports')
        ? owned(
            'SELECT id,review_id AS reviewId,reason,details,status,created_at AS createdAt,resolved_at AS resolvedAt FROM community_review_reports WHERE reporter_user_id=?'
          )
        : [],
      consents: trackingIds.length
        ? database
            .prepare(
              `SELECT tracking_session_id AS trackingSessionId,device_id AS deviceId,purpose,granted_at AS grantedAt,revoked_at AS revokedAt FROM consent_records WHERE tracking_session_id IN (${trackingIds.map(() => '?').join(',')})`
            )
            .all(...trackingIds)
        : []
    };
    res
      .set(
        'Content-Disposition',
        `attachment; filename="rastreon-dados-${new Date().toISOString().slice(0, 10)}.json"`
      )
      .json(payload);
  });
  app.delete('/api/privacy/account', requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const password = typeof req.body?.password === 'string' ? req.body.password : '',
        confirmation = String(req.body?.confirmation || ''),
        user = database
          .prepare('SELECT id,password_hash FROM users WHERE id=?')
          .get(req.session.userId);
      if (!user || !(await verifyPassword(password, user.password_hash)))
        return res.status(401).json({ error: 'Senha incorreta.' });
      if (confirmation !== 'EXCLUIR MINHA CONTA')
        return res.status(400).json({ error: 'Confirmação de exclusão inválida.' });
      const ownedIds = database
          .prepare('SELECT id FROM tracking_sessions WHERE user_id=?')
          .all(user.id)
          .map(row => row.id),
        now = Date.now();
      database.transaction(() => {
        database
          .prepare(
            "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'ACCOUNT_DELETED','USER',?,'Exclusão solicitada e autenticada pelo titular',?)"
          )
          .run(user.id, String(user.id), now);
        database.prepare('DELETE FROM users WHERE id=?').run(user.id);
        for (const row of database.prepare('SELECT sid,data FROM auth_sessions').all()) {
          const value = safeJson(row.data, {});
          if (Number(value?.userId) === Number(user.id))
            database.prepare('DELETE FROM auth_sessions WHERE sid=?').run(row.sid);
        }
      })();
      for (const id of ownedIds) sessions.delete(id);
      req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie('rastro.sid');
        res.status(204).end();
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/vehicles', requireAuth, (req, res) =>
    res.json({
      vehicles: database
        .prepare('SELECT * FROM vehicles WHERE user_id = ? ORDER BY selected DESC, updated_at DESC')
        .all(req.session.userId)
        .map(publicVehicle)
    })
  );
  app.get('/api/fuel-price', requireAuth, (req, res) => {
    const fuelType = String(req.query.fuelType || '')
      .trim()
      .slice(0, 40);
    if (!fuelType) return res.status(400).json({ error: 'Informe o tipo de combustível.' });
    const row = database
      .prepare(
        'SELECT fuel_type AS fuelType,price_per_liter AS pricePerLiter,source,region,updated_at AS updatedAt FROM fuel_price_preferences WHERE user_id=? AND fuel_type=?'
      )
      .get(req.session.userId, fuelType);
    res.json({ preference: row || null });
  });
  app.put('/api/fuel-price', requireAuth, (req, res) => {
    const fuelType = String(req.body?.fuelType || '')
        .trim()
        .slice(0, 40),
      pricePerLiter = Number(req.body?.pricePerLiter),
      region =
        String(req.body?.region || '')
          .trim()
          .slice(0, 100) || null;
    if (!fuelType || !Number.isFinite(pricePerLiter) || pricePerLiter <= 0 || pricePerLiter > 100)
      return res.status(400).json({ error: 'Tipo ou preço de combustível inválido.' });
    const now = Date.now();
    database
      .prepare(
        "INSERT INTO fuel_price_preferences (user_id,fuel_type,price_per_liter,source,region,updated_at) VALUES (?,?,?,'user-provided',?,?) ON CONFLICT(user_id,fuel_type) DO UPDATE SET price_per_liter=excluded.price_per_liter,source=excluded.source,region=excluded.region,updated_at=excluded.updated_at"
      )
      .run(req.session.userId, fuelType, pricePerLiter, region, now);
    res.json({
      preference: { fuelType, pricePerLiter, source: 'user-provided', region, updatedAt: now }
    });
  });
  const lookupVehicle = async (req, res) => {
    const plate = normalizePlate(req.params.plate || req.query.plate);
    try {
      const result = await vehicleLookupService.lookup(plate);
      res.set('Cache-Control', 'private, max-age=60').json({
        success: true,
        cached: result.cached,
        stale: Boolean(result.stale),
        vehicle: result.vehicle
      });
    } catch (error) {
      const code = [
          'INVALID_PLATE',
          'PLATE_NOT_FOUND',
          'PROVIDER_UNAVAILABLE',
          'PROVIDER_TIMEOUT',
          'PROVIDER_RATE_LIMIT',
          'PROVIDER_AUTH_ERROR'
        ].includes(error.code)
          ? error.code
          : 'INTERNAL_ERROR',
        status =
          code === 'INVALID_PLATE'
            ? 400
            : code === 'PLATE_NOT_FOUND'
              ? 404
              : code === 'PROVIDER_RATE_LIMIT'
                ? 429
                : code === 'PROVIDER_AUTH_ERROR'
                  ? 503
                  : code === 'INTERNAL_ERROR'
                    ? 500
                    : 502,
        messages = {
          INVALID_PLATE: 'Confira a placa informada.',
          PLATE_NOT_FOUND: 'Não encontramos esse veículo.',
          PROVIDER_UNAVAILABLE: 'Não foi possível consultar o veículo agora. Tente novamente.',
          PROVIDER_TIMEOUT: 'A consulta demorou demais. Tente novamente.',
          PROVIDER_RATE_LIMIT: 'Muitas consultas. Aguarde um minuto.',
          PROVIDER_AUTH_ERROR: 'Consulta automática temporariamente indisponível.',
          INTERNAL_ERROR: 'Não foi possível consultar o veículo agora.'
        };
      res.status(status).json({
        success: false,
        error: messages[code],
        code,
        retryable: ['PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'PROVIDER_RATE_LIMIT'].includes(
          code
        ),
        manualAllowed: true
      });
    }
  };
  app.get('/api/vehicles/lookup/:plate', requireAuth, plateLimiter, lookupVehicle);
  app.get('/api/vehicles/lookup', requireAuth, plateLimiter, lookupVehicle);
  app.get('/api/fipe/:code', requireAuth, serviceLimiter, async (req, res) => {
    try {
      const code = String(req.params.code || ''),
        year = req.query.year == null ? null : Number(req.query.year);
      if (
        !/^\d{6}-\d$/.test(code) ||
        (year != null && (!Number.isInteger(year) || year < 1950 || year > 2100))
      )
        return res.status(400).json({ error: 'Código FIPE ou ano inválido.' });
      const price = await cachedServiceCall(
        `fipe:${code}:${year || ''}`,
        () => fipePriceProvider.lookup(code, { year }),
        86400000
      );
      res.json({
        price,
        disclaimer:
          'Valor de referência da Tabela FIPE; não representa oferta, avaliação individual ou preço garantido.'
      });
    } catch {
      res.status(502).json({ error: 'Consulta FIPE indisponível no momento.' });
    }
  });
  app.get('/api/vehicle-health', requireAuth, (req, res) => {
    const vehicleId = req.query.vehicleId == null ? null : Number(req.query.vehicleId);
    const rows = vehicleId
      ? database
          .prepare(
            'SELECT * FROM vehicle_diagnostic_events WHERE user_id = ? AND vehicle_id = ? AND cleared_at IS NULL ORDER BY detected_at DESC'
          )
          .all(req.session.userId, vehicleId)
      : database
          .prepare(
            'SELECT * FROM vehicle_diagnostic_events WHERE user_id = ? AND cleared_at IS NULL ORDER BY detected_at DESC LIMIT 100'
          )
          .all(req.session.userId);
    res.json({
      events: rows.map(row => ({
        id: row.id,
        vehicleId: row.vehicle_id,
        type: row.type,
        severity: row.severity,
        source: row.source,
        estimatedValue: row.estimated_value,
        metadata: safeJson(row.metadata_json, {}),
        detectedAt: row.detected_at,
        clearedAt: row.cleared_at
      }))
    });
  });
  app.put('/api/vehicle-health/simulation', requireAuth, (req, res) => {
    const vehicleId = Number(req.body?.vehicleId);
    const vehicleRow = database
      .prepare('SELECT id FROM vehicles WHERE id = ? AND user_id = ?')
      .get(vehicleId, req.session.userId);
    if (!vehicleRow) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const values = Array.isArray(req.body?.events)
      ? req.body.events.slice(0, EVENT_TYPES.length)
      : [];
    let events;
    try {
      events = values.map(value =>
        createDiagnosticEvent({ ...value, vehicleId, source: 'SIMULATION', dtc: null })
      );
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    database.transaction(() => {
      database
        .prepare(
          "DELETE FROM vehicle_diagnostic_events WHERE user_id = ? AND vehicle_id = ? AND source = 'SIMULATION'"
        )
        .run(req.session.userId, vehicleId);
      const insert = database.prepare(
        'INSERT INTO vehicle_diagnostic_events (id, user_id, vehicle_id, type, severity, source, estimated_value, metadata_json, detected_at, cleared_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const event of events)
        insert.run(
          event.id,
          req.session.userId,
          vehicleId,
          event.type,
          event.severity,
          event.source,
          event.estimatedValue,
          JSON.stringify(event.metadata),
          event.detectedAt,
          null,
          Date.now()
        );
    })();
    io.to(`user:${req.session.userId}`).emit('vehicle-health:update', { vehicleId, events });
    res.json({
      events,
      simulation: true,
      disclaimer: 'Eventos simulados. O celular não diagnostica a ECU.'
    });
  });
  app.get('/api/tour-preferences', requireAuth, (req, res) =>
    res.json({
      preferences: database
        .prepare(
          'SELECT tour_key AS tourKey, completed, dismissed, updated_at AS updatedAt FROM tour_preferences WHERE user_id = ?'
        )
        .all(req.session.userId)
        .map(row => ({
          ...row,
          completed: Boolean(row.completed),
          dismissed: Boolean(row.dismissed)
        }))
    })
  );
  app.put('/api/tour-preferences/:key', requireAuth, (req, res) => {
    const tourKey = String(req.params.key || '')
      .replace(/[^a-z0-9_-]/gi, '')
      .slice(0, 50);
    if (!tourKey) return res.status(400).json({ error: 'Tour inválido.' });
    const completed = req.body?.completed ? 1 : 0,
      dismissed = req.body?.dismissed ? 1 : 0,
      now = Date.now();
    database
      .prepare(
        'INSERT INTO tour_preferences (user_id, tour_key, completed, dismissed, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, tour_key) DO UPDATE SET completed = excluded.completed, dismissed = excluded.dismissed, updated_at = excluded.updated_at'
      )
      .run(req.session.userId, tourKey, completed, dismissed, now);
    res.json({
      preference: {
        tourKey,
        completed: Boolean(completed),
        dismissed: Boolean(dismissed),
        updatedAt: now
      }
    });
  });
  app.get('/api/vehicles/:id', requireAuth, (req, res) => {
    const row = database
      .prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'Veículo não encontrado.' });
    res.json({ vehicle: publicVehicle(row) });
  });
  app.post('/api/vehicles', requireAuth, async (req, res) => {
    const value = validateVehicle(req.body);
    if (!value) return res.status(400).json({ error: 'Perfil do veículo inválido.' });
    if (
      value.plate &&
      database
        .prepare('SELECT id FROM vehicles WHERE user_id=? AND plate=?')
        .get(req.session.userId, value.plate)
    )
      return res.status(409).json({ error: 'Este veículo já está cadastrado no seu perfil.' });
    if (!value.image)
      value.image = await vehicleLookupService
        .resolveImage({ make: value.brand, model: value.model, modelYear: value.year })
        .catch(() => vehicleLookupService.placeholder());
    const now = Date.now();
    const transaction = database.transaction(() => {
      const total = database
        .prepare('SELECT COUNT(*) AS total FROM vehicles WHERE user_id = ?')
        .get(req.session.userId).total;
      const selected = total === 0 ? 1 : 0;
      const result = database
        .prepare(
          'INSERT INTO vehicles (user_id, nickname, type, plate, vin, brand, model, year, manufacture_year, version, color, image_json, engine, transmission, fuel, city_consumption, road_consumption, tank_capacity, fuel_price, data_source, source_date, selected, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)'
        )
        .run(
          req.session.userId,
          value.nickname,
          value.type,
          value.plate || null,
          value.vin,
          value.brand,
          value.model,
          value.year,
          value.manufactureYear,
          value.version || null,
          value.color || null,
          value.image ? JSON.stringify(value.image) : null,
          value.engine || null,
          value.transmission || null,
          value.fuel || null,
          value.city,
          value.road,
          value.tank,
          value.dataSource,
          value.sourceDate,
          selected,
          now,
          now
        );
      return result.lastInsertRowid;
    });
    const id = transaction();
    res.status(201).json({
      vehicle: publicVehicle(
        database
          .prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?')
          .get(id, req.session.userId)
      )
    });
  });
  app.put('/api/vehicles/:id', requireAuth, (req, res) => {
    const existing = database
      .prepare('SELECT id,vin,image_json FROM vehicles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId);
    if (!existing) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const value = validateVehicle(req.body);
    if (!value) return res.status(400).json({ error: 'Perfil do veículo inválido.' });
    database
      .prepare(
        'UPDATE vehicles SET nickname = ?, type = ?, plate = ?, vin = ?, brand = ?, model = ?, year = ?, manufacture_year = ?, version = ?, color = ?, image_json = ?, engine = ?, transmission = ?, fuel = ?, city_consumption = ?, road_consumption = ?, tank_capacity = ?, fuel_price = 0, data_source = ?, source_date = ?, updated_at = ? WHERE id = ? AND user_id = ?'
      )
      .run(
        value.nickname,
        value.type,
        value.plate || null,
        value.vin || existing.vin,
        value.brand,
        value.model,
        value.year,
        value.manufactureYear,
        value.version || null,
        value.color || null,
        value.image ? JSON.stringify(value.image) : existing.image_json,
        value.engine || null,
        value.transmission || null,
        value.fuel || null,
        value.city,
        value.road,
        value.tank,
        value.dataSource,
        value.sourceDate,
        Date.now(),
        existing.id,
        req.session.userId
      );
    res.json({
      vehicle: publicVehicle(
        database
          .prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?')
          .get(existing.id, req.session.userId)
      )
    });
  });
  app.get('/api/vehicles/:id/image', requireAuth, serviceLimiter, async (req, res) => {
    const row = database
      .prepare('SELECT vin FROM vehicles WHERE id=? AND user_id=?')
      .get(req.params.id, req.session.userId);
    if (!row) return res.status(404).end();
    if (!row.vin) return res.status(404).json({ error: 'VIN não informado.' });
    try {
      const result = await cachedServiceCall(
        `auto-dev-photos:${row.vin}`,
        () => vehicleImageProvider.lookup(row.vin),
        86400000
      );
      if (!result.available || !result.photos[0])
        return res.status(404).json({ error: 'A Auto.dev não possui foto para este VIN.' });
      const image = await vehicleImageProvider.fetchImage(result.photos[0]);
      res
        .set({
          'Content-Type': image.type,
          'Cache-Control': 'private, max-age=86400',
          'X-Content-Type-Options': 'nosniff'
        })
        .send(image.bytes);
    } catch (error) {
      res.status(502).json({ error: 'Imagem automotiva indisponível no momento.' });
    }
  });
  app.post('/api/vehicles/:id/select', requireAuth, (req, res) => {
    const existing = database
      .prepare('SELECT id FROM vehicles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId);
    if (!existing) return res.status(404).json({ error: 'Veículo não encontrado.' });
    database.transaction(() => {
      database
        .prepare('UPDATE vehicles SET selected = 0 WHERE user_id = ?')
        .run(req.session.userId);
      database
        .prepare('UPDATE vehicles SET selected = 1, updated_at = ? WHERE id = ? AND user_id = ?')
        .run(Date.now(), existing.id, req.session.userId);
    })();
    res.json({
      vehicle: publicVehicle(
        database
          .prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?')
          .get(existing.id, req.session.userId)
      )
    });
  });
  app.delete('/api/vehicles/:id', requireAuth, (req, res) => {
    const existing = database
      .prepare('SELECT id, selected FROM vehicles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId);
    if (!existing) return res.status(404).json({ error: 'Veículo não encontrado.' });
    database.transaction(() => {
      database
        .prepare('DELETE FROM vehicles WHERE id = ? AND user_id = ?')
        .run(existing.id, req.session.userId);
      if (existing.selected) {
        const next = database
          .prepare('SELECT id FROM vehicles WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1')
          .get(req.session.userId);
        if (next)
          database
            .prepare('UPDATE vehicles SET selected = 1 WHERE id = ? AND user_id = ?')
            .run(next.id, req.session.userId);
      }
    })();
    res.status(204).end();
  });
  app.get('/api/vehicles/:id/schedule', requireAuth, (req, res) => {
    const vehicle = database
      .prepare('SELECT id FROM vehicles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId);
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const row = database
      .prepare('SELECT * FROM vehicle_usage_schedules WHERE vehicle_id = ? AND user_id = ?')
      .get(vehicle.id, req.session.userId);
    res.json({
      schedule: row
        ? {
            vehicleId: row.vehicle_id,
            enabled: Boolean(row.enabled),
            days: safeJson(row.days_json, []),
            from: row.time_from,
            to: row.time_to,
            timezone: row.timezone,
            updatedAt: row.updated_at
          }
        : null
    });
  });
  app.put('/api/vehicles/:id/schedule', requireAuth, (req, res) => {
    const vehicle = database
      .prepare('SELECT id FROM vehicles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId);
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const schedule = validateSchedule(req.body);
    if (!schedule) return res.status(400).json({ error: 'Horário autorizado inválido.' });
    const now = Date.now();
    database
      .prepare(
        'INSERT INTO vehicle_usage_schedules (vehicle_id, user_id, enabled, days_json, time_from, time_to, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(vehicle_id) DO UPDATE SET enabled = excluded.enabled, days_json = excluded.days_json, time_from = excluded.time_from, time_to = excluded.time_to, timezone = excluded.timezone, updated_at = excluded.updated_at WHERE user_id = excluded.user_id'
      )
      .run(
        vehicle.id,
        req.session.userId,
        schedule.enabled ? 1 : 0,
        JSON.stringify(schedule.days),
        schedule.from,
        schedule.to,
        schedule.timezone,
        now,
        now
      );
    res.json({ schedule: { vehicleId: vehicle.id, ...schedule, updatedAt: now } });
  });
  app.get('/api/vehicles/:id/speed-rule', requireAuth, (req, res) => {
    const vehicle = database
      .prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?')
      .get(req.params.id, req.session.userId);
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const rule = database
      .prepare(
        'SELECT enabled,maximum_kmh AS maximumKmh,updated_at AS updatedAt FROM vehicle_speed_rules WHERE vehicle_id=? AND user_id=?'
      )
      .get(vehicle.id, req.session.userId);
    res.json({ rule: rule ? { ...rule, enabled: Boolean(rule.enabled) } : null });
  });
  app.put('/api/vehicles/:id/speed-rule', requireAuth, requireCsrf, (req, res) => {
    const vehicle = database
        .prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?')
        .get(req.params.id, req.session.userId),
      maximumKmh = Number(req.body?.maximumKmh),
      enabled = req.body?.enabled === true;
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado.' });
    if (!Number.isInteger(maximumKmh) || maximumKmh < 20 || maximumKmh > 200)
      return res.status(400).json({ error: 'O limite deve ficar entre 20 e 200 km/h.' });
    const now = Date.now();
    database
      .prepare(
        'INSERT INTO vehicle_speed_rules (vehicle_id,user_id,enabled,maximum_kmh,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(vehicle_id) DO UPDATE SET enabled=excluded.enabled,maximum_kmh=excluded.maximum_kmh,updated_at=excluded.updated_at WHERE user_id=excluded.user_id'
      )
      .run(vehicle.id, req.session.userId, enabled ? 1 : 0, maximumKmh, now);
    res.json({ rule: { enabled, maximumKmh, updatedAt: now } });
  });
  app.get('/api/vehicles/:id/geofences', requireAuth, (req, res) => {
    const vehicle = database
      .prepare('SELECT id FROM vehicles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId);
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const rows = database
      .prepare(
        'SELECT id, vehicle_id AS vehicleId, name, type, center_lat AS centerLat, center_lng AS centerLng, radius_meters AS radiusMeters, enabled, created_at AS createdAt, updated_at AS updatedAt FROM geofences WHERE vehicle_id = ? AND user_id = ? ORDER BY created_at'
      )
      .all(vehicle.id, req.session.userId);
    res.json({ geofences: rows.map(row => ({ ...row, enabled: Boolean(row.enabled) })) });
  });
  app.post('/api/vehicles/:id/geofences', requireAuth, (req, res) => {
    const vehicle = database
      .prepare('SELECT id FROM vehicles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId);
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const fence = validateGeofence(req.body);
    if (!fence) return res.status(400).json({ error: 'Área de cobertura inválida.' });
    const id = crypto.randomBytes(16).toString('hex'),
      now = Date.now();
    database
      .prepare(
        'INSERT INTO geofences (id, user_id, vehicle_id, name, type, center_lat, center_lng, radius_meters, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        req.session.userId,
        vehicle.id,
        fence.name,
        fence.type,
        fence.centerLat,
        fence.centerLng,
        fence.radiusMeters,
        fence.enabled ? 1 : 0,
        now,
        now
      );
    res
      .status(201)
      .json({ geofence: { id, vehicleId: vehicle.id, ...fence, createdAt: now, updatedAt: now } });
  });
  app.post('/api/vehicles/:id/polygon-geofences', requireAuth, (req, res) => {
    const vehicle = database
      .prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?')
      .get(req.params.id, req.session.userId);
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const fence = validateGeofence({ ...req.body, type: 'polygon' });
    if (!fence) return res.status(400).json({ error: 'Área personalizada inválida.' });
    const id = crypto.randomBytes(16).toString('hex'),
      now = Date.now();
    database
      .prepare(
        'INSERT INTO geofences (id,user_id,vehicle_id,name,type,center_lat,center_lng,radius_meters,polygon_json,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      )
      .run(
        id,
        req.session.userId,
        vehicle.id,
        fence.name,
        'polygon',
        fence.centerLat,
        fence.centerLng,
        fence.radiusMeters,
        JSON.stringify(fence.points),
        fence.enabled ? 1 : 0,
        now,
        now
      );
    res
      .status(201)
      .json({ geofence: { id, vehicleId: vehicle.id, ...fence, createdAt: now, updatedAt: now } });
  });
  app.patch('/api/geofences/:id/status', requireAuth, (req, res) => {
    const enabled = req.body?.enabled ? 1 : 0,
      result = database
        .prepare('UPDATE geofences SET enabled=?,updated_at=? WHERE id=? AND user_id=?')
        .run(enabled, Date.now(), req.params.id, req.session.userId);
    if (!result.changes) return res.status(404).json({ error: 'Área não encontrada.' });
    res.json({ enabled: Boolean(enabled) });
  });
  app.put('/api/geofences/:id', requireAuth, (req, res) => {
    const existing = database
      .prepare('SELECT id, vehicle_id AS vehicleId FROM geofences WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId);
    if (!existing) return res.status(404).json({ error: 'Área de cobertura não encontrada.' });
    const fence = validateGeofence(req.body);
    if (!fence) return res.status(400).json({ error: 'Área de cobertura inválida.' });
    const now = Date.now();
    database
      .prepare(
        'UPDATE geofences SET name = ?, type = ?, center_lat = ?, center_lng = ?, radius_meters = ?, enabled = ?, updated_at = ? WHERE id = ? AND user_id = ?'
      )
      .run(
        fence.name,
        fence.type,
        fence.centerLat,
        fence.centerLng,
        fence.radiusMeters,
        fence.enabled ? 1 : 0,
        now,
        existing.id,
        req.session.userId
      );
    res.json({
      geofence: { id: existing.id, vehicleId: existing.vehicleId, ...fence, updatedAt: now }
    });
  });
  app.delete('/api/geofences/:id', requireAuth, (req, res) => {
    const result = database
      .prepare('DELETE FROM geofences WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.session.userId);
    if (!result.changes)
      return res.status(404).json({ error: 'Área de cobertura não encontrada.' });
    res.status(204).end();
  });
  app.get('/api/alerts', requireAuth, (req, res) => {
    const rows = database
      .prepare(
        'SELECT id, vehicle_id AS vehicleId, trip_id AS tripId, type, severity, title, details_json AS detailsJson, occurred_at AS occurredAt, read_at AS readAt FROM alerts WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 100'
      )
      .all(req.session.userId);
    res.json({
      alerts: rows.map(row => ({
        ...row,
        details: safeJson(row.detailsJson, {}),
        detailsJson: undefined
      }))
    });
  });
  app.patch('/api/alerts/:id/read', requireAuth, (req, res) => {
    const result = database
      .prepare('UPDATE alerts SET read_at = ? WHERE id = ? AND user_id = ?')
      .run(Date.now(), req.params.id, req.session.userId);
    if (!result.changes) return res.status(404).json({ error: 'Alerta não encontrado.' });
    res.status(204).end();
  });
  const tripDetail = (row, includeTrack = true) => {
    const plannedRoute = safeJson(row.planned_route_json, {});
    // A lista e o detalhe usam a mesma métrica. Antes, GET /api/trips omitia os
    // pontos antes do cálculo e por isso toda viagem aparecia com 0 m.
    const metricTrack = database
      .prepare(
        'SELECT latitude, longitude, accuracy, speed, heading, captured_at AS timestamp, source, captured_offline AS capturedOffline, suspicious FROM positions WHERE tracking_session_id = ? ORDER BY captured_at, id'
      )
      .all(row.tracking_session_id);
    const metrics = calculateTrackMetrics(metricTrack);
    const plannedDistanceMeters = Number(plannedRoute.distanceMeters || 0);
    const plannedDurationSeconds = Number(
      plannedRoute.durationInTrafficSeconds ?? plannedRoute.durationSeconds ?? 0
    );
    const actualDurationSeconds = row.ended_at
      ? Math.max(0, row.ended_at - row.started_at) / 1000
      : metricTrack.length > 1
        ? Math.max(0, metricTrack.at(-1).timestamp - row.started_at) / 1000
        : 0;
    const interruptions = database
      .prepare(
        'SELECT lost_at AS lostAt, reconnected_at AS reconnectedAt, duration_ms AS duration, point_count AS pointCount, classification FROM interruptions WHERE tracking_session_id = ? ORDER BY reconnected_at'
      )
      .all(row.tracking_session_id);
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      trackingSessionId: row.tracking_session_id,
      plannedRoute,
      ...(includeTrack ? { actualTrack: metricTrack } : {}),
      interruptions,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
      comparison: {
        plannedDistanceMeters,
        actualDistanceMeters: metrics.distanceMeters,
        distanceDifferenceMeters: metrics.distanceMeters - plannedDistanceMeters,
        plannedDurationSeconds,
        actualDurationSeconds,
        durationDifferenceSeconds: actualDurationSeconds - plannedDurationSeconds,
        movingSeconds: metrics.movingSeconds,
        stoppedSeconds: metrics.stoppedSeconds,
        unclassifiedSeconds: metrics.unclassifiedSeconds,
        offlineSeconds: interruptions.reduce((sum, item) => sum + (item.duration || 0), 0) / 1000,
        gapCount: interruptions.length,
        averageSpeedKmh: metrics.averageSpeedKmh,
        maximumSpeedKmh: metrics.maximumSpeedKmh,
        metricSampleCount: metrics.sampleCount,
        discardedPointCount: metrics.discardedPointCount,
        measurement: 'gps-filtered'
      }
    };
  };
  app.get('/api/trips', requireAuth, (req, res) => {
    const rows = database
      .prepare('SELECT * FROM trips WHERE user_id = ? ORDER BY started_at DESC LIMIT 100')
      .all(req.session.userId);
    res.json({ trips: rows.map(row => tripDetail(row, false)) });
  });
  app.get('/api/trips/:id', requireAuth, (req, res) => {
    const row = database
      .prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'Viagem não encontrada.' });
    res.json({ trip: tripDetail(row, true) });
  });
  app.post('/api/trips', requireAuth, (req, res) => {
    const tracking = database
      .prepare('SELECT id FROM tracking_sessions WHERE id = ? AND user_id = ?')
      .get(req.body?.trackingSessionId, req.session.userId);
    const ownedVehicle = database
      .prepare('SELECT id FROM vehicles WHERE id = ? AND user_id = ?')
      .get(req.body?.vehicleId, req.session.userId);
    if (!tracking || !ownedVehicle)
      return res.status(404).json({ error: 'Sessão ou veículo não encontrado.' });
    const plannedRoute = validPlannedRoute(req.body?.plannedRoute);
    if (!plannedRoute) return res.status(400).json({ error: 'Rota planejada inválida.' });
    const existing = database
      .prepare('SELECT id FROM trips WHERE tracking_session_id = ?')
      .get(tracking.id);
    if (existing) return res.status(409).json({ error: 'Esta sessão já possui uma viagem.' });
    const id = crypto.randomBytes(16).toString('hex'),
      now = Date.now(),
      startedAt = optional(req.body.startedAt) ?? now;
    database
      .prepare(
        'INSERT INTO trips (id, user_id, vehicle_id, tracking_session_id, planned_route_json, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        req.session.userId,
        ownedVehicle.id,
        tracking.id,
        JSON.stringify(plannedRoute),
        startedAt,
        now,
        now
      );
    res.status(201).json({
      trip: tripDetail(database.prepare('SELECT * FROM trips WHERE id = ?').get(id), true)
    });
  });
  app.patch('/api/trips/:id/finish', requireAuth, (req, res) => {
    const row = database
      .prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'Viagem não encontrada.' });
    const endedAt = optional(req.body?.endedAt) ?? Date.now();
    if (endedAt < row.started_at) return res.status(400).json({ error: 'Horário final inválido.' });
    database
      .prepare('UPDATE trips SET ended_at = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(endedAt, Date.now(), row.id, req.session.userId);
    res.json({
      trip: tripDetail(database.prepare('SELECT * FROM trips WHERE id = ?').get(row.id), true)
    });
  });
  app.post('/api/trips/:id/reconstruct', requireAuth, async (req, res) => {
    try {
      const trip = database
        .prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
        .get(req.params.id, req.session.userId);
      if (!trip) return res.status(404).json({ error: 'Viagem não encontrada.' });
      const before = safePosition(req.body?.before),
        after = safePosition(req.body?.after);
      if (!before || !after)
        return res.status(400).json({ error: 'Posições da lacuna inválidas.' });
      const lostAt = optional(req.body?.lostAt),
        reconnectedAt = optional(req.body?.reconnectedAt) ?? after.timestamp,
        durationMs = optional(req.body?.duration) ?? (lostAt ? reconnectedAt - lostAt : null);
      if (!(durationMs > 0)) return res.status(400).json({ error: 'Duração da lacuna inválida.' });
      const routeResult = await routeProvider.calculateRoute({
        origin: { latitude: before.latitude, longitude: before.longitude },
        destination: { latitude: after.latitude, longitude: after.longitude },
        vehicleType: req.body?.vehicleType === 'motorcycle' ? 'motorcycle' : 'car',
        departureTime: lostAt,
        alternatives: 3,
        traffic: true
      });
      const plannedRoute = safeJson(trip.planned_route_json, {});
      const candidates = rankReconstructionCandidates({
        routes: routeResult.routes,
        gapDurationSeconds: durationMs / 1000,
        speedBefore: before.speed,
        speedAfter: after.speed,
        headingBefore: before.heading,
        headingAfter: after.heading,
        plannedGeometry: plannedRoute.geometry || []
      });
      if (!candidates.length)
        return res.status(422).json({ error: 'Não foi possível reconstruir.' });
      const best = candidates[0],
        gapId = crypto.randomBytes(16).toString('hex'),
        now = Date.now(),
        candidateRows = [];
      database.transaction(() => {
        database
          .prepare(
            'INSERT INTO route_gaps (id, trip_id, lost_at, reconnected_at, duration_ms, before_position_json, after_position_json, classification, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .run(
            gapId,
            trip.id,
            lostAt,
            reconnectedAt,
            durationMs,
            JSON.stringify(before),
            JSON.stringify(after),
            best.classification,
            now
          );
        for (const candidate of candidates) {
          const candidateId = crypto.randomBytes(16).toString('hex'),
            selected = candidate === best ? 1 : 0;
          database
            .prepare(
              'INSERT INTO reconstruction_candidates (id, route_gap_id, provider, route_json, score, confidence, classification, components_json, selected, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )
            .run(
              candidateId,
              gapId,
              routeResult.provider,
              JSON.stringify({
                routeId: candidate.routeId,
                distanceMeters: candidate.distanceMeters,
                durationSeconds: candidate.durationSeconds,
                durationInTrafficSeconds: candidate.durationInTrafficSeconds,
                geometry: candidate.geometry
              }),
              candidate.score,
              candidate.confidence,
              candidate.classification,
              JSON.stringify({ values: candidate.components, weights: candidate.weights }),
              selected,
              now
            );
          candidateRows.push({ id: candidateId, ...candidate, selected: Boolean(selected) });
          if (selected)
            database
              .prepare('UPDATE route_gaps SET selected_candidate_id = ? WHERE id = ?')
              .run(candidateId, gapId);
        }
      })();
      const matching = await mapMatchingProvider.match([]);
      res.status(201).json({
        gap: {
          id: gapId,
          tripId: trip.id,
          lostAt,
          reconnectedAt,
          duration: durationMs,
          classification: best.classification
        },
        probableRoute: candidateRows[0],
        alternatives: candidateRows.slice(1),
        mapMatching: {
          provider: matching.provider,
          available: Boolean(matching.matchedGeometry)
        },
        disclaimer:
          'Rota provável calculada por plausibilidade; não representa confirmação do percurso real.'
      });
    } catch (error) {
      if (/Nenhuma rota/.test(error.message))
        return res.status(422).json({ error: 'Não foi possível reconstruir.' });
      res.status(502).json({ error: 'Reconstrução indisponível no momento.' });
    }
  });
  app.get('/api/geocode', requireAuth, async (req, res) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q.trim() : '',
        latitude = Number(req.query.lat),
        longitude = Number(req.query.lng),
        hasProximity =
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          Math.abs(latitude) <= 90 &&
          Math.abs(longitude) <= 180;
      if (query.length < 3 || query.length > 160)
        return res.status(400).json({ error: 'Informe entre 3 e 160 caracteres.' });
      const proximity = hasProximity ? { latitude, longitude } : {},
        cacheLocation = hasProximity ? `:${latitude.toFixed(2)},${longitude.toFixed(2)}` : '',
        places = await cachedServiceCall(
          `geocode:${query.toLocaleLowerCase('pt-BR')}${cacheLocation}`,
          () => geocodingProvider.search(query, { countryCode: 'br', ...proximity }),
          300000
        );
      res.json(places.slice(0, 4));
    } catch {
      res.status(502).json({ error: 'Busca de endereços indisponível no momento.' });
    }
  });
  app.get('/api/reverse-geocode', requireAuth, async (req, res) => {
    try {
      const latitude = Number(req.query.lat),
        longitude = Number(req.query.lng);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      )
        return res.status(400).json({ error: 'Local inválido.' });
      const key = `reverse:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
      const place = await cachedServiceCall(
        key,
        () => geocodingProvider.reverse(latitude, longitude),
        300000
      );
      res.json(place);
    } catch {
      res.status(502).json({ error: 'Não conseguimos identificar este endereço agora.' });
    }
  });
  app.get('/api/saved-places', requireAuth, (req, res) => {
    const rows = database
      .prepare(
        'SELECT place_key AS placeKey, label, address, latitude, longitude, updated_at AS updatedAt FROM saved_places WHERE user_id = ? ORDER BY place_key'
      )
      .all(req.session.userId);
    res.json({ places: rows });
  });
  app.put('/api/saved-places/:key', requireAuth, (req, res) => {
    const placeKey = String(req.params.key || '').toLowerCase();
    if (!['home', 'work'].includes(placeKey))
      return res.status(400).json({ error: 'Local inválido.' });
    const latitude = Number(req.body?.latitude),
      longitude = Number(req.body?.longitude),
      address = String(req.body?.address || '')
        .trim()
        .slice(0, 240),
      label = placeKey === 'home' ? 'Casa' : 'Trabalho';
    if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude))
      return res.status(400).json({ error: 'Endereço inválido.' });
    const now = Date.now();
    database
      .prepare(
        'INSERT INTO saved_places (user_id, place_key, label, address, latitude, longitude, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, place_key) DO UPDATE SET address=excluded.address, latitude=excluded.latitude, longitude=excluded.longitude, updated_at=excluded.updated_at'
      )
      .run(req.session.userId, placeKey, label, address, latitude, longitude, now);
    res.json({ place: { placeKey, label, address, updatedAt: now } });
  });
  app.delete('/api/saved-places/:key', requireAuth, (req, res) => {
    const result = database
      .prepare('DELETE FROM saved_places WHERE user_id = ? AND place_key = ?')
      .run(req.session.userId, String(req.params.key || '').toLowerCase());
    if (!result.changes) return res.status(404).json({ error: 'Local não encontrado.' });
    res.status(204).end();
  });
  app.get('/api/route', requireAuth, async (req, res) => {
    try {
      const from = validCoordPair(req.query.from),
        to = validCoordPair(req.query.to),
        waypointTexts = String(req.query.waypoints || '')
          .split(';')
          .filter(Boolean);
      if (waypointTexts.length > 8)
        return res.status(400).json({ error: 'Use no máximo 8 paradas.' });
      const waypointPairs = waypointTexts.map(validCoordPair);
      if (!from || !to || waypointPairs.some(value => !value))
        return res.status(400).json({ error: 'Coordenadas inválidas.' });
      const result = await routeProvider.calculateRoute({
        origin: { longitude: from[0], latitude: from[1] },
        destination: { longitude: to[0], latitude: to[1] },
        waypoints: waypointPairs.map(value => ({ longitude: value[0], latitude: value[1] })),
        vehicleType: req.query.vehicleType === 'motorcycle' ? 'motorcycle' : 'car',
        departureTime: req.query.departureTime,
        alternatives: 3,
        traffic: true,
        avoidTolls: req.query.avoidTolls === 'true'
      });
      res.json({
        provider: result.provider,
        source: result.provider === 'google' ? 'Google Routes' : 'OSRM/OpenStreetMap',
        traffic: result.traffic,
        tolls: result.tolls,
        routes: result.routes.map((route, index) => ({
          ...route,
          id: route.routeId ?? String(index),
          distance: route.distanceMeters,
          duration: route.durationInTrafficSeconds ?? route.durationSeconds
        }))
      });
    } catch (error) {
      if (/Nenhuma rota/.test(error.message)) return res.status(404).json({ error: error.message });
      res.status(502).json({ error: 'Roteamento rodoviário indisponível no momento.' });
    }
  });
  app.post('/api/simulations/offline', requireAuth, (req, res) => {
    const tracking = ownedSession(req.body?.sessionId, req.session.userId);
    if (!tracking) return res.status(404).json({ error: 'Sessão não encontrada.' });
    const points = normalizePositionBatch(req.body?.points);
    if (points.length < 3)
      return res.status(400).json({ error: 'A simulação offline exige ao menos três pontos.' });
    const accepted = [];
    database.transaction(() =>
      points.forEach(position => {
        position.source = 'simulation';
        position.capturedOffline = true;
        if (insertPosition(database, tracking.id, position)) {
          accepted.push(position);
          tracking.positions.push(position);
          io.to(tracking.id).emit('position:update', position);
        }
      })
    )();
    const lostAt = optional(req.body?.lostAt) ?? points[0].timestamp,
      reconnectedAt = optional(req.body?.reconnectedAt) ?? points.at(-1).timestamp,
      gap = {
        lostAt,
        reconnectedAt,
        duration: Math.max(0, reconnectedAt - lostAt),
        pointCount: accepted.length,
        classification: 'Confirmado: coordenadas de simulação armazenadas offline'
      };
    database
      .prepare(
        'INSERT INTO interruptions (tracking_session_id, lost_at, reconnected_at, duration_ms, point_count, classification) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        tracking.id,
        gap.lostAt,
        gap.reconnectedAt,
        gap.duration,
        gap.pointCount,
        gap.classification
      );
    tracking.interruptions.push(gap);
    io.to(tracking.id).emit('offline:recovered', gap);
    res.status(201).json({
      received: accepted.length,
      gap,
      disclaimer: 'Cenário demonstrativo; não representa GPS real.'
    });
  });
  app.get('/api/vehicles/:id/devices', requireAuth, (req, res) => {
    const vehicle = database
      .prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?')
      .get(req.params.id, req.session.userId);
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const devices = database
      .prepare(
        'SELECT id,type,name,status,created_at AS createdAt,last_seen AS lastSeen,revoked_at AS revokedAt FROM devices WHERE vehicle_id=? AND user_id=? ORDER BY created_at DESC'
      )
      .all(vehicle.id, req.session.userId);
    res.json({ devices });
  });
  app.delete('/api/devices/:id', requireAuth, pairingLimiter, (req, res) => {
    const device = database
      .prepare(
        "SELECT id,tracking_session_id AS sessionId FROM devices WHERE id=? AND user_id=? AND status='ACTIVE'"
      )
      .get(req.params.id, req.session.userId);
    if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado.' });
    const now = Date.now();
    database
      .prepare("UPDATE devices SET status='REVOKED',revoked_at=? WHERE id=? AND user_id=?")
      .run(now, device.id, req.session.userId);
    database
      .prepare(
        "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'DEVICE_REVOKED','DEVICE',?,'Dispositivo revogado pelo titular',?)"
      )
      .run(req.session.userId, device.id, now);
    io.to(`mobile:${device.sessionId}`).emit('device:revoked');
    io.to(device.sessionId).emit('device:revoked', { deviceId: device.id });
    res.status(204).end();
  });
  app.get('/api/pairings/resolve', requireAuth, pairingLimiter, (req, res) => {
    const rawToken = String(req.query.token || ''),
      code = String(req.query.code || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, ''),
      hash = hashMobileToken(rawToken || code);
    if ((rawToken.length < 32 && !code) || code.length > 8)
      return res
        .status(400)
        .json({ error: 'QR Code ou código inválido.', code: 'PAIRING_INVALID' });
    const row = database
      .prepare('SELECT * FROM pairing_sessions WHERE token_hash=? OR manual_code_hash=?')
      .get(hash, hash);
    if (!row) return res.status(404).json({ error: 'QR Code inválido.', code: 'PAIRING_INVALID' });
    if (row.user_id !== req.session.userId)
      return res
        .status(403)
        .json({ error: 'Este pareamento pertence a outra conta.', code: 'PAIRING_FORBIDDEN' });
    if (row.expires_at <= Date.now() && row.status !== 'CONFIRMED') {
      database.prepare("UPDATE pairing_sessions SET status='EXPIRED' WHERE id=?").run(row.id);
      return res.status(410).json({ error: 'Este QR Code expirou.', code: 'PAIRING_EXPIRED' });
    }
    if (row.status === 'CONFIRMED')
      return res
        .status(409)
        .json({ error: 'Este QR Code já foi utilizado.', code: 'PAIRING_USED' });
    if (row.status === 'CANCELLED')
      return res
        .status(410)
        .json({ error: 'Este pareamento foi cancelado.', code: 'PAIRING_CANCELLED' });
    const vehicle = database
      .prepare('SELECT nickname,brand,model,plate FROM vehicles WHERE id=? AND user_id=?')
      .get(row.vehicle_id, req.session.userId);
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const now = Date.now();
    database
      .prepare(
        "UPDATE pairing_sessions SET status='SCANNED',claimed_at=?,claimed_user_agent=? WHERE id=?"
      )
      .run(now, String(req.get('user-agent') || 'Navegador').slice(0, 160), row.id);
    io.to(row.tracking_session_id).emit('pairing:scanned', { pairingId: row.id });
    res.json({
      pairing: {
        id: row.id,
        expiresAt: row.expires_at,
        vehicle: {
          nickname: vehicle.nickname,
          brand: vehicle.brand,
          model: vehicle.model,
          plate: vehicle.plate || ''
        }
      }
    });
  });
  app.post('/api/pairings/:id/confirm', requireAuth, pairingLimiter, (req, res) => {
    const row = database.prepare('SELECT * FROM pairing_sessions WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pareamento não encontrado.' });
    if (row.user_id !== req.session.userId)
      return res.status(403).json({ error: 'Pareamento não autorizado.' });
    if (row.expires_at <= Date.now()) {
      database.prepare("UPDATE pairing_sessions SET status='EXPIRED' WHERE id=?").run(row.id);
      return res.status(410).json({ error: 'Este QR Code expirou.' });
    }
    if (!['PENDING', 'SCANNED'].includes(row.status))
      return res.status(409).json({
        error:
          row.status === 'CONFIRMED' ? 'Este QR Code já foi utilizado.' : 'Pareamento indisponível.'
      });
    const vehicle = database
        .prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?')
        .get(row.vehicle_id, req.session.userId),
      tracking = ownedSession(row.tracking_session_id, req.session.userId);
    if (!vehicle || !tracking)
      return res.status(404).json({ error: 'Veículo ou sessão indisponível.' });
    const deviceId = crypto.randomBytes(16).toString('hex'),
      credential = crypto.randomBytes(32).toString('base64url'),
      now = Date.now(),
      name =
        String(req.body?.name || 'Celular temporário')
          .trim()
          .slice(0, 60) || 'Celular temporário';
    database.transaction(() => {
      database
        .prepare(
          'INSERT INTO devices (id,user_id,vehicle_id,tracking_session_id,type,name,credential_hash,status,created_at) VALUES (?,?,?,?,? ,?,?,?,?)'
        )
        .run(
          deviceId,
          req.session.userId,
          vehicle.id,
          tracking.id,
          'PHONE',
          name,
          hashMobileToken(credential),
          'ACTIVE',
          now
        );
      database
        .prepare(
          "UPDATE pairing_sessions SET status='CONFIRMED',confirmed_at=?,device_id=? WHERE id=?"
        )
        .run(now, deviceId, row.id);
      database
        .prepare('UPDATE tracking_sessions SET mobile_token_hash=? WHERE id=? AND user_id=?')
        .run(hashMobileToken(credential), tracking.id, req.session.userId);
      database
        .prepare(
          "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'DEVICE_PAIRED','DEVICE',?,'Celular temporário confirmado',?)"
        )
        .run(req.session.userId, deviceId, now);
    })();
    tracking.mobileTokenHash = hashMobileToken(credential);
    io.to(tracking.id).emit('device:paired', {
      device: { id: deviceId, type: 'PHONE', name, status: 'ACTIVE', createdAt: now }
    });
    res.status(201).json({
      device: { id: deviceId, type: 'PHONE', name, status: 'ACTIVE' },
      sessionId: tracking.id,
      credential
    });
  });
  app.get('/api/pairings/:id', requireAuth, (req, res) => {
    const row = database
      .prepare(
        'SELECT id,status,expires_at AS expiresAt,device_id AS deviceId FROM pairing_sessions WHERE id=? AND user_id=?'
      )
      .get(req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: 'Pareamento não encontrado.' });
    if (row.expiresAt <= Date.now() && !['CONFIRMED', 'CANCELLED'].includes(row.status)) {
      database.prepare("UPDATE pairing_sessions SET status='EXPIRED' WHERE id=?").run(row.id);
      row.status = 'EXPIRED';
    }
    res.json({ pairing: row });
  });
  app.delete('/api/pairings/:id', requireAuth, pairingLimiter, (req, res) => {
    const result = database
      .prepare(
        "UPDATE pairing_sessions SET status='CANCELLED' WHERE id=? AND user_id=? AND status IN ('PENDING','SCANNED')"
      )
      .run(req.params.id, req.session.userId);
    if (!result.changes) return res.status(404).json({ error: 'Pareamento indisponível.' });
    database
      .prepare(
        "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'PAIRING_CANCELLED','PAIRING_SESSION',?,'Pareamento cancelado pelo titular',?)"
      )
      .run(req.session.userId, req.params.id, Date.now());
    res.status(204).end();
  });
  app.post('/api/sessions', requireAuth, pairingLimiter, async (req, res, next) => {
    try {
      let vehicle;
      if (req.body?.vehicleId != null) {
        const row = database
          .prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?')
          .get(req.body.vehicleId, req.session.userId);
        if (!row) return res.status(404).json({ error: 'Veículo não encontrado.' });
        vehicle = publicVehicle(row);
      } else {
        vehicle = validateVehicle(req.body?.vehicle);
        if (vehicle) {
          const now = Date.now(),
            result = database
              .prepare(
                'INSERT INTO vehicles (user_id,nickname,type,plate,brand,model,year,version,engine,transmission,fuel,city_consumption,road_consumption,tank_capacity,fuel_price,data_source,source_date,selected,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,0,?,?)'
              )
              .run(
                req.session.userId,
                vehicle.nickname,
                vehicle.type,
                vehicle.plate || null,
                vehicle.brand,
                vehicle.model,
                vehicle.year,
                vehicle.version || null,
                vehicle.engine || null,
                vehicle.transmission || null,
                vehicle.fuel || null,
                vehicle.city,
                vehicle.road,
                vehicle.tank,
                vehicle.dataSource,
                vehicle.sourceDate,
                now,
                now
              );
          vehicle = { ...vehicle, id: Number(result.lastInsertRowid) };
        }
      }
      if (!vehicle) return res.status(400).json({ error: 'Perfil do veículo inválido.' });
      const id = crypto.randomBytes(16).toString('hex'),
        pairingId = crypto.randomBytes(16).toString('hex'),
        pairToken = crypto.randomBytes(32).toString('base64url'),
        manualCode = pairingCode(),
        createdAt = Date.now(),
        pairingExpiresAt = createdAt + 5 * 60000;
      const tracking = {
        id,
        ownerId: req.session.userId,
        mobileTokenHash: null,
        createdAt,
        closed: false,
        positions: [],
        phoneSockets: new Set(),
        telemetryState: new Map(),
        vehicle,
        trip: null,
        interruptions: []
      };
      database.transaction(() => {
        database
          .prepare(
            'INSERT INTO tracking_sessions (id, user_id, vehicle_json, mobile_token_hash, created_at, expires_at) VALUES (?, ?, ?, NULL, ?, ?)'
          )
          .run(
            id,
            tracking.ownerId,
            JSON.stringify(vehicle),
            tracking.createdAt,
            tracking.createdAt + ttlMs
          );
        database
          .prepare(
            "INSERT INTO pairing_sessions (id,user_id,vehicle_id,tracking_session_id,token_hash,manual_code_hash,type,status,created_at,expires_at) VALUES (?,?,?,?,?,?,'PHONE_TRACKER','PENDING',?,?)"
          )
          .run(
            pairingId,
            tracking.ownerId,
            vehicle.id,
            id,
            hashMobileToken(pairToken),
            hashMobileToken(manualCode),
            createdAt,
            pairingExpiresAt
          );
        database
          .prepare(
            "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'PAIRING_CREATED','PAIRING_SESSION',?,'Pareamento temporário criado',?)"
          )
          .run(req.session.userId, pairingId, createdAt);
      })();
      sessions.set(id, tracking);
      const baseUrl = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(
          /\/$/,
          ''
        ),
        pairUrl = `${baseUrl}/pair.html#token=${encodeURIComponent(pairToken)}`,
        qrCode = await QRCode.toDataURL(pairUrl, {
          width: 320,
          margin: 4,
          errorCorrectionLevel: 'M'
        });
      res.status(201).json({
        ...publicSession(tracking),
        pairingId,
        pairUrl,
        mobileUrl: pairUrl,
        qrCode,
        pairingCode: manualCode,
        pairingExpiresAt,
        pairingExpiresInMinutes: 5
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/sessions/:id', requireAuth, (req, res) => {
    const tracking = ownedSession(req.params.id, req.session.userId);
    if (!tracking) return res.status(404).json({ error: 'Sessão não encontrada.' });
    res.json(publicSession(tracking));
  });

  io.engine.use(sessionMiddleware);
  io.on('connection', socket => {
    if (socket.request.session?.userId) socket.join(`user:${socket.request.session.userId}`);
    socket.on(
      'session:join',
      ({ sessionId, role, token, deviceId } = {}, acknowledge = () => {}) => {
        const tracking = sessions.get(typeof sessionId === 'string' ? sessionId : '');
        if (!tracking || tracking.closed || !['dashboard', 'mobile'].includes(role))
          return acknowledge({ ok: false, error: 'Sessão inválida ou encerrada.' });
        if (role === 'dashboard' && socket.request.session?.userId !== tracking.ownerId)
          return acknowledge({ ok: false, error: 'Acesso não autorizado.' });
        if (role === 'mobile') {
          const device = database
            .prepare(
              "SELECT id FROM devices WHERE id=? AND tracking_session_id=? AND user_id=? AND status='ACTIVE'"
            )
            .get(deviceId, tracking.id, tracking.ownerId);
          if (!device || !validMobileToken(tracking.mobileTokenHash, token))
            return acknowledge({
              ok: false,
              error: 'Credencial do dispositivo inválida ou revogada.'
            });
          socket.data.deviceId = device.id;
        }
        socket.data.sessionId = tracking.id;
        socket.data.role = role;
        if (role === 'dashboard') socket.join(tracking.id);
        else {
          socket.join(`mobile:${tracking.id}`);
          tracking.phoneSockets.add(socket.id);
          const now = Date.now();
          database
            .prepare('UPDATE devices SET last_seen=? WHERE id=?')
            .run(now, socket.data.deviceId);
          database
            .prepare(
              "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'DEVICE_CONNECTED','DEVICE',?,'Dispositivo conectado por WebSocket',?)"
            )
            .run(tracking.ownerId, socket.data.deviceId, now);
        }
        io.to(tracking.id).emit('session:status', {
          phoneConnected: tracking.phoneSockets.size > 0
        });
        acknowledge({
          ok: true,
          session: role === 'dashboard' ? publicSession(tracking) : mobileSession(tracking)
        });
      }
    );
    const activeConsent = (trackingId, deviceId) =>
      database
        .prepare(
          'SELECT id FROM consent_records WHERE tracking_session_id = ? AND device_id = ? AND revoked_at IS NULL ORDER BY granted_at DESC LIMIT 1'
        )
        .get(trackingId, deviceId);
    const evaluateSpeed = (tracking, position) => {
      const vehicleId = tracking.vehicle?.id,
        kmh = Number(position.speed) * 3.6;
      if (!vehicleId || !Number.isFinite(kmh) || position.accuracy > 50) return;
      const rule = database
        .prepare(
          'SELECT maximum_kmh AS maximumKmh FROM vehicle_speed_rules WHERE vehicle_id=? AND user_id=? AND enabled=1'
        )
        .get(vehicleId, tracking.ownerId);
      if (!rule || kmh <= rule.maximumKmh) return;
      const recent = database
        .prepare(
          "SELECT 1 FROM alerts WHERE user_id=? AND vehicle_id=? AND type='SPEED_LIMIT_EXCEEDED' AND occurred_at>=?"
        )
        .get(tracking.ownerId, vehicleId, position.timestamp - 5 * 60000);
      if (recent) return;
      const alert = {
        id: crypto.randomBytes(16).toString('hex'),
        vehicleId,
        type: 'SPEED_LIMIT_EXCEEDED',
        severity: 'warning',
        title: 'Velocidade acima do limite configurado',
        details: {
          measuredKmh: Math.round(kmh),
          configuredKmh: rule.maximumKmh,
          accuracy: position.accuracy
        },
        occurredAt: position.timestamp
      };
      database
        .prepare(
          'INSERT INTO alerts (id,user_id,vehicle_id,tracking_session_id,type,severity,title,details_json,occurred_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
        )
        .run(
          alert.id,
          tracking.ownerId,
          vehicleId,
          tracking.id,
          alert.type,
          alert.severity,
          alert.title,
          JSON.stringify(alert.details),
          alert.occurredAt,
          Date.now()
        );
      io.to(tracking.id).emit('alert:new', alert);
    };
    socket.on('consent:grant', ({ deviceId, purpose } = {}, acknowledge = () => {}) => {
      const tracking = sessions.get(socket.data.sessionId),
        safeDeviceId = typeof deviceId === 'string' ? deviceId.trim().slice(0, 80) : '',
        safePurpose = purpose === 'vehicle-tracking' ? 'vehicle-tracking' : null;
      if (
        !tracking ||
        tracking.closed ||
        socket.data.role !== 'mobile' ||
        !safeDeviceId ||
        !safePurpose
      )
        return acknowledge({ ok: false, error: 'Consentimento inválido.' });
      if (!activeConsent(tracking.id, safeDeviceId)) {
        const now = Date.now();
        database
          .prepare(
            'INSERT INTO consent_records (tracking_session_id,device_id,purpose,granted_at,user_agent_summary) VALUES (?,?,?,?,?)'
          )
          .run(
            tracking.id,
            safeDeviceId,
            safePurpose,
            now,
            String(socket.request.headers['user-agent'] || '').slice(0, 160)
          );
        database
          .prepare(
            "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'LOCATION_CONSENT_GRANTED','TRACKING_SESSION',?,'Consentimento explícito no dispositivo',?)"
          )
          .run(tracking.ownerId, tracking.id, now);
      }
      acknowledge({ ok: true });
    });
    socket.on('consent:revoke', ({ deviceId } = {}, acknowledge = () => {}) => {
      const tracking = sessions.get(socket.data.sessionId),
        safeDeviceId = typeof deviceId === 'string' ? deviceId.trim().slice(0, 80) : '';
      if (!tracking || socket.data.role !== 'mobile' || !safeDeviceId)
        return acknowledge({ ok: false });
      const now = Date.now(),
        result = database
          .prepare(
            'UPDATE consent_records SET revoked_at = ? WHERE tracking_session_id = ? AND device_id = ? AND revoked_at IS NULL'
          )
          .run(now, tracking.id, safeDeviceId);
      if (result.changes)
        database
          .prepare(
            "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'LOCATION_CONSENT_REVOKED','TRACKING_SESSION',?,'Compartilhamento interrompido no dispositivo',?)"
          )
          .run(tracking.ownerId, tracking.id, now);
      acknowledge({ ok: true, revoked: Boolean(result.changes) });
    });
    const evaluateSchedule = (tracking, position) => {
      const vehicleId = tracking.vehicle?.id;
      if (!vehicleId || !(position.speed > 0.8) || position.accuracy > 50) return;
      const row = database
        .prepare(
          'SELECT * FROM vehicle_usage_schedules WHERE vehicle_id = ? AND user_id = ? AND enabled = 1'
        )
        .get(vehicleId, tracking.ownerId);
      if (!row) return;
      const schedule = {
        enabled: true,
        days: safeJson(row.days_json, []),
        from: row.time_from,
        to: row.time_to,
        timezone: row.timezone
      };
      if (isWithinSchedule(schedule, position.timestamp)) return;
      const recent = database
        .prepare(
          "SELECT id FROM alerts WHERE user_id = ? AND vehicle_id = ? AND type = 'OUTSIDE_ALLOWED_TIME' AND occurred_at >= ? LIMIT 1"
        )
        .get(tracking.ownerId, vehicleId, position.timestamp - 15 * 60000);
      if (recent) return;
      const trip = database
          .prepare('SELECT id FROM trips WHERE tracking_session_id = ?')
          .get(tracking.id),
        alert = {
          id: crypto.randomBytes(16).toString('hex'),
          vehicleId,
          tripId: trip?.id || null,
          type: 'OUTSIDE_ALLOWED_TIME',
          severity: 'warning',
          title: 'Movimentação fora do horário autorizado',
          details: {
            occurredAt: position.timestamp,
            configured: `${schedule.from}–${schedule.to}`,
            timezone: schedule.timezone,
            accuracy: position.accuracy
          },
          occurredAt: position.timestamp
        };
      database
        .prepare(
          'INSERT INTO alerts (id, user_id, vehicle_id, trip_id, tracking_session_id, type, severity, title, details_json, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          alert.id,
          tracking.ownerId,
          alert.vehicleId,
          alert.tripId,
          tracking.id,
          alert.type,
          alert.severity,
          alert.title,
          JSON.stringify(alert.details),
          alert.occurredAt,
          Date.now()
        );
      io.to(tracking.id).emit('alert:new', alert);
    };
    const evaluateGeofences = (tracking, position) => {
      const vehicleId = tracking.vehicle?.id;
      if (!vehicleId) return;
      const fences = database
        .prepare('SELECT * FROM geofences WHERE vehicle_id = ? AND user_id = ? AND enabled = 1')
        .all(vehicleId, tracking.ownerId);
      for (const fence of fences) {
        const classification =
          fence.type === 'polygon'
            ? classifyPolygonPosition(position, {
                centerLat: fence.center_lat,
                centerLng: fence.center_lng,
                points: safeJson(fence.polygon_json, [])
              })
            : classifyCirclePosition(position, {
                centerLat: fence.center_lat,
                centerLng: fence.center_lng,
                radiusMeters: fence.radius_meters
              });
        const stored =
            database.prepare('SELECT * FROM geofence_states WHERE geofence_id = ?').get(fence.id) ||
            {},
          next = nextGeofenceState(
            {
              outsideCount: stored.outside_count,
              confirmedOutside: Boolean(stored.confirmed_outside),
              lastAlertAt: stored.last_alert_at
            },
            classification,
            position.timestamp
          );
        database
          .prepare(
            'INSERT INTO geofence_states (geofence_id, outside_count, confirmed_outside, last_alert_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(geofence_id) DO UPDATE SET outside_count = excluded.outside_count, confirmed_outside = excluded.confirmed_outside, last_alert_at = excluded.last_alert_at, updated_at = excluded.updated_at'
          )
          .run(
            fence.id,
            next.outsideCount || 0,
            next.confirmedOutside ? 1 : 0,
            next.lastAlertAt,
            position.timestamp
          );
        if (next.event === 'PENDING') {
          io.to(tracking.id).emit('geofence:pending', {
            geofenceId: fence.id,
            name: fence.name,
            accuracy: position.accuracy
          });
          continue;
        }
        if (!['GEOFENCE_EXIT', 'GEOFENCE_ENTER'].includes(next.event)) continue;
        const trip = database
            .prepare('SELECT id FROM trips WHERE tracking_session_id = ?')
            .get(tracking.id),
          alert = {
            id: crypto.randomBytes(16).toString('hex'),
            vehicleId,
            tripId: trip?.id || null,
            type: next.event,
            severity: next.event === 'GEOFENCE_EXIT' ? 'critical' : 'info',
            title:
              next.event === 'GEOFENCE_EXIT'
                ? `${fence.name}: saída da área permitida`
                : `${fence.name}: retorno à área permitida`,
            details: {
              geofenceId: fence.id,
              geofenceName: fence.name,
              distanceMeters: classification.distance,
              radiusMeters: fence.radius_meters,
              accuracy: position.accuracy,
              latitude: position.latitude,
              longitude: position.longitude
            },
            occurredAt: position.timestamp
          };
        database
          .prepare(
            'INSERT INTO alerts (id, user_id, vehicle_id, trip_id, tracking_session_id, type, severity, title, details_json, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .run(
            alert.id,
            tracking.ownerId,
            alert.vehicleId,
            alert.tripId,
            tracking.id,
            alert.type,
            alert.severity,
            alert.title,
            JSON.stringify(alert.details),
            alert.occurredAt,
            Date.now()
          );
        io.to(tracking.id).emit('alert:new', alert);
      }
    };
    const evaluateSavedPlaces = (tracking, position) => {
      tracking.arrivedPlaces ||= new Set();
      const places = database
        .prepare(
          'SELECT place_key AS placeKey, label, address, latitude, longitude FROM saved_places WHERE user_id = ?'
        )
        .all(tracking.ownerId);
      for (const place of places) {
        const arrived = distanceBetween(position, place) <= 100;
        if (arrived && !tracking.arrivedPlaces.has(place.placeKey)) {
          tracking.arrivedPlaces.add(place.placeKey);
          io.to(tracking.id).emit('saved-place:arrival', place);
        } else if (!arrived && distanceBetween(position, place) > 250)
          tracking.arrivedPlaces.delete(place.placeKey);
      }
    };
    const savePosition = (tracking, position) => {
      const inserted = insertPosition(database, tracking.id, position);
      if (!inserted) return false;
      tracking.positions.push(position);
      if (tracking.positions.length > 10000) tracking.positions.shift();
      evaluateSchedule(tracking, position);
      evaluateSpeed(tracking, position);
      evaluateGeofences(tracking, position);
      evaluateSavedPlaces(tracking, position);
      io.to(tracking.id).emit('position:update', position);
      return true;
    };
    socket.on('position:update', (payload = {}, acknowledge = () => {}) => {
      const tracking = sessions.get(socket.data.sessionId);
      if (!tracking || tracking.closed)
        return acknowledge({ ok: false, error: 'Sessão encerrada.' });
      if (
        socket.data.role !== 'mobile' &&
        (socket.data.role !== 'dashboard' ||
          socket.request.session?.userId !== tracking.ownerId ||
          payload.source !== 'simulation')
      )
        return acknowledge({ ok: false, error: 'Origem não autorizada.' });
      if (
        socket.data.role === 'mobile' &&
        (socket.data.deviceId !== payload.deviceId ||
          !database
            .prepare("SELECT id FROM devices WHERE id=? AND status='ACTIVE'")
            .get(socket.data.deviceId))
      )
        return acknowledge({
          ok: false,
          error: 'Dispositivo inválido ou revogado.',
          code: 'DEVICE_REVOKED'
        });
      if (
        socket.data.role === 'mobile' &&
        !activeConsent(tracking.id, String(payload.deviceId || '').slice(0, 80))
      )
        return acknowledge({
          ok: false,
          error: 'Consentimento de localização necessário.',
          code: 'CONSENT_REQUIRED'
        });
      const source = socket.data.role === 'mobile' ? 'mobile-gps' : 'simulation',
        candidate = telemetryPayload(
          payload,
          source,
          socket.data.role === 'mobile' ? 'mobile-browser' : 'dashboard-simulation'
        ),
        validation = acceptTelemetryPoint(tracking, candidate);
      if (!validation.ok) {
        if (validation.code === 'DUPLICATE')
          return acknowledge({
            ok: true,
            accepted: false,
            duplicate: true,
            sequence: candidate.sequence
          });
        return acknowledge({ ok: false, error: validation.error, code: validation.code });
      }
      const inserted = savePosition(tracking, validation.point);
      if (socket.data.role === 'mobile')
        database
          .prepare('UPDATE devices SET last_seen=? WHERE id=?')
          .run(Date.now(), socket.data.deviceId);
      acknowledge({
        ok: true,
        accepted: inserted,
        duplicate: !inserted,
        sequence: validation.point.sequence
      });
    });
    socket.on('positions:batch', (payload = {}, acknowledge = () => {}) => {
      const tracking = sessions.get(socket.data.sessionId);
      if (!tracking || tracking.closed || socket.data.role !== 'mobile')
        return acknowledge({ ok: false, error: 'Sessão indisponível.' });
      const rawPoints = (Array.isArray(payload.points) ? payload.points : []).slice(0, 200);
      if (
        !database
          .prepare("SELECT id FROM devices WHERE id=? AND status='ACTIVE'")
          .get(socket.data.deviceId) ||
        rawPoints.some(point => point?.deviceId !== socket.data.deviceId)
      )
        return acknowledge({
          ok: false,
          error: 'Dispositivo inválido ou revogado.',
          code: 'DEVICE_REVOKED'
        });
      if (
        rawPoints.some(
          point => !activeConsent(tracking.id, String(point?.deviceId || '').slice(0, 80))
        )
      )
        return acknowledge({
          ok: false,
          error: 'Consentimento de localização necessário.',
          code: 'CONSENT_REQUIRED'
        });
      const parsed = rawPoints.map(value => ({
          value,
          result: validateTelemetryPoint(telemetryPayload(value, 'mobile-gps', 'mobile-browser'), {
            offline: true
          })
        })),
        rejectedSequences = parsed
          .filter(item => !item.result.ok && Number.isInteger(item.value?.sequence))
          .map(item => item.value.sequence),
        seen = new Set(),
        points = parsed
          .filter(item => item.result.ok)
          .map(item => item.result.point)
          .sort((a, b) => a.sequence - b.sequence)
          .filter(point => !seen.has(point.sequence) && seen.add(point.sequence)),
        acceptedSequences = [],
        confirmedSequences = [
          ...new Set([...points.map(position => position.sequence), ...rejectedSequences])
        ];
      const transaction = database.transaction(() =>
        points.forEach(position => {
          if (savePosition(tracking, position)) acceptedSequences.push(position.sequence);
        })
      );
      transaction();
      if (acceptedSequences.length)
        database
          .prepare('UPDATE devices SET last_seen=? WHERE id=?')
          .run(Date.now(), socket.data.deviceId);
      const gap = {
        lostAt: optional(payload.lostAt),
        reconnectedAt: Date.now(),
        duration: payload.lostAt ? Date.now() - Number(payload.lostAt) : null,
        pointCount: acceptedSequences.length,
        classification:
          acceptedSequences.length >= 3
            ? 'Confirmado: coordenadas GPS armazenadas localmente'
            : acceptedSequences.length
              ? 'Reconstruído com média confiança'
              : 'Pendente de reconstrução'
      };
      if (acceptedSequences.length) {
        database
          .prepare(
            'INSERT INTO interruptions (tracking_session_id, lost_at, reconnected_at, duration_ms, point_count, classification) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            tracking.id,
            gap.lostAt,
            gap.reconnectedAt,
            gap.duration,
            gap.pointCount,
            gap.classification
          );
        tracking.interruptions.push(gap);
        io.to(tracking.id).emit('offline:recovered', gap);
      }
      acknowledge({
        ok: true,
        received: acceptedSequences.length,
        acceptedSequences,
        confirmedSequences,
        rejectedCount: rejectedSequences.length,
        duplicateCount: points.length - acceptedSequences.length,
        gap
      });
    });
    socket.on('trip:update', (trip = {}, acknowledge = () => {}) => {
      const tracking = sessions.get(socket.data.sessionId);
      if (
        !tracking ||
        socket.data.role !== 'dashboard' ||
        socket.request.session?.userId !== tracking.ownerId
      )
        return acknowledge({ ok: false });
      const allowed = {
        startedAt: optional(trip.startedAt),
        route: trip.route && typeof trip.route === 'object' ? trip.route : null,
        vehicle: validateVehicle(trip.vehicle)
      };
      tracking.trip = allowed;
      database
        .prepare('UPDATE tracking_sessions SET trip_json = ? WHERE id = ? AND user_id = ?')
        .run(JSON.stringify(allowed), tracking.id, tracking.ownerId);
      io.to(tracking.id).emit('trip:update', tracking.trip);
      acknowledge({ ok: true });
    });
    socket.on('history:clear', () => {
      const tracking = sessions.get(socket.data.sessionId);
      if (
        tracking &&
        socket.data.role === 'dashboard' &&
        socket.request.session?.userId === tracking.ownerId
      ) {
        database.prepare('DELETE FROM positions WHERE tracking_session_id = ?').run(tracking.id);
        database
          .prepare('DELETE FROM interruptions WHERE tracking_session_id = ?')
          .run(tracking.id);
        tracking.positions = [];
        tracking.interruptions = [];
        io.to(tracking.id).emit('history:cleared');
      }
    });
    socket.on('session:close', () => {
      const tracking = sessions.get(socket.data.sessionId);
      if (
        tracking &&
        socket.data.role === 'dashboard' &&
        socket.request.session?.userId === tracking.ownerId
      ) {
        tracking.closed = true;
        database
          .prepare(
            "UPDATE pairing_sessions SET status='CANCELLED' WHERE tracking_session_id=? AND status IN ('PENDING','SCANNED')"
          )
          .run(tracking.id);
        database
          .prepare('UPDATE tracking_sessions SET closed_at = ? WHERE id = ? AND user_id = ?')
          .run(Date.now(), tracking.id, tracking.ownerId);
        io.to(tracking.id).emit('session:closed');
        io.to(`mobile:${tracking.id}`).emit('session:closed');
        setTimeout(() => sessions.delete(tracking.id), 10000).unref();
      }
    });
    socket.on('disconnect', () => {
      const tracking = sessions.get(socket.data.sessionId);
      if (tracking && socket.data.role === 'mobile') {
        tracking.phoneSockets.delete(socket.id);
        if (socket.data.deviceId)
          database
            .prepare(
              "INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,'DEVICE_DISCONNECTED','DEVICE',?,'Conexão WebSocket encerrada',?)"
            )
            .run(tracking.ownerId, socket.data.deviceId, Date.now());
        io.to(tracking.id).emit('session:status', {
          phoneConnected: tracking.phoneSockets.size > 0
        });
      }
    });
  });

  app.get('/api/trips/:id/display-track', requireAuth, (req, res) => {
    const trip = database
      .prepare(
        'SELECT tracking_session_id AS trackingSessionId FROM trips WHERE id = ? AND user_id = ?'
      )
      .get(req.params.id, req.session.userId);
    if (!trip) return res.status(404).json({ error: 'Viagem não encontrada.' });
    const actualTrack = database
      .prepare(
        'SELECT latitude, longitude, accuracy, speed, heading, captured_at AS timestamp, source, captured_offline AS capturedOffline FROM positions WHERE tracking_session_id = ? ORDER BY captured_at, id'
      )
      .all(trip.trackingSessionId);
    res.json({ displayTrack: smoothTrackForDisplay(actualTrack), pointCount: actualTrack.length });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint não encontrado.' }));
  app.use((error, _req, res, _next) => {
    console.error(error.name, error.message);
    res.status(500).json({ error: 'Erro interno.' });
  });
  const cleanup = setInterval(() => {
    const now = Date.now();
    database.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(now);
    database
      .prepare(
        "UPDATE pairing_sessions SET status='EXPIRED' WHERE expires_at<=? AND status IN ('PENDING','SCANNED')"
      )
      .run(now);
    database
      .prepare(
        'UPDATE tracking_sessions SET closed_at = ? WHERE closed_at IS NULL AND created_at <= ?'
      )
      .run(now, now - ttlMs);
    applyDataRetention(database, {
      now,
      days: options.retentionDays ?? process.env.DATA_RETENTION_DAYS
    });
    for (const [id, tracking] of sessions)
      if (tracking.closed || now - tracking.createdAt > ttlMs) sessions.delete(id);
    for (const [key, value] of serviceCache) if (value.expiresAt <= now) serviceCache.delete(key);
    for (const [key, value] of poiCache) if (value.expiresAt <= now) poiCache.delete(key);
  }, 60000);
  cleanup.unref();
  const close = () => {
    clearInterval(cleanup);
    io.close();
    database.close();
  };
  return { app, server, io, database, close };
}

if (require.main === module) {
  const { server } = createApplication();
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  server.once('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `A porta ${port} já está em uso. O Rastreon provavelmente já está aberto; use a instância existente ou encerre-a com Ctrl+C.`
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  });
  server.listen(port, host, () =>
    console.log(
      `Rastreon disponível em ${process.env.PUBLIC_URL || `http://localhost:${port}`} (escutando em ${host}:${port}; mapa: ${process.env.MAP_PROVIDER || 'maplibre'})`
    )
  );
}
module.exports = {
  createApplication,
  sessions,
  safePosition,
  normalizePositionBatch,
  insertPosition,
  validCoordPair,
  parsePoiRoute,
  validateVehicle,
  applyDataRetention,
  validateProductionConfig,
  PBE_MODELS
};
