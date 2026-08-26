'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireAuth } = require('./auth');
const { ROLES, requireRole } = require('./authorization');
const { TraccarProvider } = require('./providers/traccar-provider');

const ENTITY_TYPES = new Set([
  'PLACE',
  'FUEL_STATION',
  'ROAD_REPORT',
  'RESTAURANT',
  'SHOPPING',
  'POI'
]);
const REPORT_CATEGORIES = new Set([
  'ACCIDENT',
  'TRAFFIC',
  'BLOCKAGE',
  'ROADWORK',
  'FLOOD',
  'OBJECT',
  'HAZARD',
  'POTHOLE',
  'MOBILE_CAMERA'
]);
const FUEL_TYPES = new Set([
  'GASOLINE',
  'ADDITIVE_GASOLINE',
  'ETHANOL',
  'DIESEL',
  'DIESEL_S10',
  'CNG'
]);
const NOTIFICATION_TYPES = [
  'VEHICLE_OFFLINE',
  'VEHICLE_MOVING',
  'GEOFENCE',
  'SPEED',
  'NEARBY_REPORT',
  'CONVERSATION_REQUEST',
  'COMMENT_REPLY',
  'FUEL_PRICE',
  'PARTNER_BENEFIT'
];
const PHOTO_MIME = new Map([
  ['image/jpeg', { extension: '.jpg', signatures: ['ffd8ff'] }],
  ['image/png', { extension: '.png', signatures: ['89504e470d0a1a0a'] }],
  ['image/webp', { extension: '.webp', signatures: ['52494646'] }]
]);

function cleanText(value, maximum = 500) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim()
        .slice(0, maximum)
    : '';
}

function validId(value) {
  const result = cleanText(value, 180);
  return /^[A-Za-z0-9][A-Za-z0-9._:~-]{1,179}$/.test(result) ? result : null;
}
function coordinate(value, max) {
  const result = Number(value);
  return Number.isFinite(result) && Math.abs(result) <= max ? result : null;
}
function json(value, fallback = []) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function tableExists(database, name) {
  return Boolean(
    database.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name)
  );
}
function uuid() {
  return crypto.randomUUID();
}
function alias(name) {
  const words = cleanText(name, 80).split(/\s+/).filter(Boolean);
  return words.length > 1
    ? `${words[0]} ${words.at(-1)[0].toUpperCase()}.`
    : words[0] || 'Motorista RASTREON';
}
function distanceMeters(a, b) {
  const rad = value => (value * Math.PI) / 180,
    dLat = rad(b.latitude - a.latitude),
    dLng = rad(b.longitude - a.longitude),
    q =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(q));
}
function csrf(req, res, next) {
  const supplied = String(req.get('x-csrf-token') || ''),
    expected = String(req.session?.csrfToken || '');
  if (supplied.length !== 64 || expected.length !== 64)
    return res.status(403).json({ error: 'Token de segurança ausente ou inválido.' });
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ? next()
    : res.status(403).json({ error: 'Token de segurança ausente ou inválido.' });
}
function audit(database, userId, action, targetType, targetId, reason) {
  database
    .prepare(
      'INSERT INTO audit_events (actor_user_id,action,target_type,target_id,reason,created_at) VALUES (?,?,?,?,?,?)'
    )
    .run(
      userId || null,
      action,
      targetType,
      targetId || null,
      cleanText(reason, 300) || null,
      Date.now()
    );
}
function notify(database, userId, type, title, body, entityType = null, entityId = null) {
  const pref = database
    .prepare('SELECT enabled FROM notification_preferences WHERE user_id=? AND type=?')
    .get(userId, type);
  if (pref && !pref.enabled) return null;
  const id = uuid();
  database
    .prepare(
      'INSERT INTO app_notifications (id,user_id,type,title,body,entity_type,entity_id,created_at) VALUES (?,?,?,?,?,?,?,?)'
    )
    .run(
      id,
      userId,
      type,
      cleanText(title, 120),
      cleanText(body, 300),
      entityType,
      entityId,
      Date.now()
    );
  return id;
}
function evaluateHardwareSpeed(database, io, tracking, binding, point) {
  const kmh = Number(point.speed) * 3.6;
  if (!Number.isFinite(kmh) || point.accuracy > 50) return;
  const rule = database
    .prepare(
      'SELECT maximum_kmh AS maximumKmh FROM vehicle_speed_rules WHERE vehicle_id=? AND user_id=? AND enabled=1'
    )
    .get(binding.vehicle_id, binding.user_id);
  if (!rule || kmh <= rule.maximumKmh) return;
  const recent = database
    .prepare(
      "SELECT 1 FROM alerts WHERE user_id=? AND vehicle_id=? AND type='SPEED_LIMIT_EXCEEDED' AND occurred_at>=?"
    )
    .get(binding.user_id, binding.vehicle_id, point.timestamp - 5 * 60000);
  if (recent) return;
  const id = uuid(),
    title = 'Velocidade acima do limite configurado',
    details = {
      measuredKmh: Math.round(kmh),
      configuredKmh: rule.maximumKmh,
      accuracy: point.accuracy,
      source: 'traccar'
    };
  database
    .prepare(
      "INSERT INTO alerts (id,user_id,vehicle_id,tracking_session_id,type,severity,title,details_json,occurred_at,created_at) VALUES (?,?,?,?, 'SPEED_LIMIT_EXCEEDED','warning',?,?,?,?)"
    )
    .run(
      id,
      binding.user_id,
      binding.vehicle_id,
      tracking.id,
      title,
      JSON.stringify(details),
      point.timestamp,
      Date.now()
    );
  notify(
    database,
    binding.user_id,
    'SPEED',
    title,
    `${details.measuredKmh} km/h medidos pelo rastreador.`,
    'VEHICLE',
    String(binding.vehicle_id)
  );
  io?.to?.(tracking.id)?.emit?.('alert:new', {
    id,
    vehicleId: binding.vehicle_id,
    type: 'SPEED_LIMIT_EXCEEDED',
    severity: 'warning',
    title,
    details,
    occurredAt: point.timestamp
  });
}
function expireReports(database, now = Date.now()) {
  return database
    .prepare(
      "UPDATE road_reports SET status='EXPIRED',updated_at=? WHERE status='OPEN' AND expires_at<=?"
    )
    .run(now, now).changes;
}
function reportLifetime(severity) {
  return severity === 'HIGH' ? 6 * 3600000 : severity === 'MEDIUM' ? 3 * 3600000 : 60 * 60000;
}
function publicUser(row) {
  return {
    displayName: alias(row.author_name),
    avatar: row.avatar_data || null,
    contactId: row.chat_enabled ? row.public_contact_id : null
  };
}

function safePhoto(buffer, mime) {
  const rule = PHOTO_MIME.get(mime);
  if (!rule || !Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.length > 5 * 1024 * 1024)
    return null;
  const head = buffer.subarray(0, 12).toString('hex');
  if (!rule.signatures.some(signature => head.startsWith(signature))) return null;
  if (mime === 'image/webp' && buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return null;
  return rule;
}

function serializeStation(database, row, userId) {
  const latest = database
    .prepare(
      `SELECT fuel_type AS fuelType,price_cents AS priceCents,status,source,observed_at AS observedAt FROM fuel_prices WHERE station_id=? AND status!='REJECTED' ORDER BY observed_at DESC`
    )
    .all(row.id);
  const prices = [];
  for (const item of latest)
    if (!prices.some(price => price.fuelType === item.fuelType))
      prices.push({ ...item, price: item.priceCents / 100 });
  const benefit =
    database
      .prepare(
        'SELECT id,description,rules,coupon,redemption,valid_from AS validFrom,valid_until AS validUntil FROM partner_benefits WHERE station_id=? AND enabled=1 AND valid_from<=? AND valid_until>? ORDER BY valid_until LIMIT 1'
      )
      .get(row.id, Date.now(), Date.now()) || null;
  const favorite = Boolean(
    database
      .prepare(
        "SELECT 1 FROM favorite_entities WHERE user_id=? AND entity_type='FUEL_STATION' AND entity_id=?"
      )
      .get(userId, row.id)
  );
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    openingHours: json(row.opening_hours_json),
    services: json(row.services_json),
    phone: row.phone,
    source: row.source,
    confidence: row.confidence,
    verifiedAt: row.verified_at,
    updatedAt: row.updated_at,
    prices,
    partnerBenefit: benefit,
    favorite
  };
}

function createPlatformRouter({
  database,
  uploadDirectory,
  traccarProvider,
  geocodingProvider,
  twoFactorGuard = (_req, _res, next) => next(),
  sessions,
  io
} = {}) {
  if (!database) throw new TypeError('Banco obrigatório.');
  const router = express.Router();
  const photoDirectory = path.resolve(
    uploadDirectory ||
      process.env.COMMUNITY_UPLOAD_DIRECTORY ||
      path.join(__dirname, '..', 'data', 'community-photos')
  );
  fs.mkdirSync(photoDirectory, { recursive: true });
  const writes = rateLimit({
    windowMs: 60000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => `user:${req.session?.userId || 'anonymous'}`
  });
  const messages = rateLimit({
    windowMs: 60000,
    limit: 12,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => `user:${req.session?.userId || 'anonymous'}`
  });
  const admin = requireRole(database, ROLES.ADMIN);
  const developer = requireRole(database, ROLES.DEVELOPER);
  const traccar =
    traccarProvider ||
    new TraccarProvider({
      webhookSecret: process.env.TRACCAR_WEBHOOK_SECRET,
      deviceHashSecret: process.env.TRACCAR_DEVICE_HASH_SECRET
    });

  database
    .prepare(
      "INSERT OR IGNORE INTO px_channels (id,kind,slug,name,description,enabled,created_at) VALUES ('px-geral','REGION','geral','PX Geral','Avisos comunitários sem localização pessoal exata',1,?)"
    )
    .run(Date.now());

  router.get('/status', requireAuth, (req, res) =>
    res.json({
      community: true,
      photos: true,
      conversations: true,
      px: true,
      traccar: process.env.TRACCAR_ENABLED === 'true',
      traffic: {
        available:
          (process.env.MAP_PROVIDER === 'google' && Boolean(process.env.GOOGLE_MAPS_API_KEY)) ||
          (process.env.MAP_PROVIDER === 'mapbox' &&
            Boolean(process.env.MAPBOX_WEB_PUBLIC_TOKEN || process.env.MAPBOX_ACCESS_TOKEN)),
        provider:
          process.env.MAP_PROVIDER === 'google' && process.env.GOOGLE_MAPS_API_KEY
            ? 'Google Maps Traffic Layer'
            : process.env.MAP_PROVIDER === 'mapbox' &&
                (process.env.MAPBOX_WEB_PUBLIC_TOKEN || process.env.MAPBOX_ACCESS_TOKEN)
              ? 'Mapbox Traffic v1'
              : null,
        communityAvailable: true,
        reason:
          (process.env.MAP_PROVIDER === 'google' && process.env.GOOGLE_MAPS_API_KEY) ||
          (process.env.MAP_PROVIDER === 'mapbox' &&
            (process.env.MAPBOX_WEB_PUBLIC_TOKEN || process.env.MAPBOX_ACCESS_TOKEN))
            ? null
            : 'Sem fonte licenciada: somente relatos comunitários identificados como não oficiais.'
      },
      remoteHardwareBlock: false
    })
  );

  router.get('/search', requireAuth, async (req, res) => {
    expireReports(database);
    const query = cleanText(req.query.q, 100);
    if (query.length < 2) return res.json({ results: [] });
    const like = `%${query.replace(/[%_]/g, '\\$&')}%`;
    const latitude = coordinate(req.query.latitude, 90),
      longitude = coordinate(req.query.longitude, 180);
    const results = [];
    for (const row of database
      .prepare(
        "SELECT id,nickname,brand,model FROM vehicles WHERE user_id=? AND (nickname LIKE ? ESCAPE '\\' OR brand LIKE ? ESCAPE '\\' OR model LIKE ? ESCAPE '\\') LIMIT 10"
      )
      .all(req.session.userId, like, like, like))
      results.push({
        type: 'VEHICLE',
        id: String(row.id),
        title: row.nickname,
        subtitle: `${row.brand} ${row.model}`
      });
    for (const row of database
      .prepare(
        "SELECT id,name,brand,address,latitude,longitude FROM fuel_stations WHERE name LIKE ? ESCAPE '\\' OR brand LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\' LIMIT 15"
      )
      .all(like, like, like))
      results.push({
        type: 'FUEL_STATION',
        id: row.id,
        title: row.name,
        subtitle: row.address,
        latitude: row.latitude,
        longitude: row.longitude
      });
    if (tableExists(database, 'community_places'))
      for (const row of database
        .prepare(
          "SELECT id,name,address,latitude,longitude FROM community_places WHERE name LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\' LIMIT 15"
        )
        .all(like, like))
        results.push({
          type: 'PLACE',
          id: row.id,
          title: row.name,
          subtitle: row.address,
          latitude: row.latitude,
          longitude: row.longitude
        });
    for (const row of database
      .prepare(
        "SELECT id,category,description,latitude,longitude FROM road_reports WHERE status='OPEN' AND (description LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\') LIMIT 15"
      )
      .all(like, like))
      results.push({
        type: 'ROAD_REPORT',
        id: row.id,
        title: row.category,
        subtitle: row.description,
        latitude: row.latitude,
        longitude: row.longitude
      });
    for (const row of database
      .prepare(
        "SELECT place_key AS id,label,address,latitude,longitude FROM saved_places WHERE user_id=? AND (label LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\') LIMIT 10"
      )
      .all(req.session.userId, like, like))
      results.push({ type: 'FAVORITE', ...row, title: row.label, subtitle: row.address });
    for (const row of database
      .prepare(
        "SELECT id,planned_route_json AS route,started_at AS startedAt FROM trips WHERE user_id=? AND planned_route_json LIKE ? ESCAPE '\\' ORDER BY started_at DESC LIMIT 8"
      )
      .all(req.session.userId, like)) {
      const route = json(row.route, {});
      results.push({
        type: 'RECENT_ROUTE',
        id: row.id,
        title: route.destinationLabel || 'Rota recente',
        subtitle: route.originLabel
          ? `${route.originLabel} → ${route.destinationLabel || 'destino'}`
          : `Viagem de ${new Date(row.startedAt).toLocaleDateString('pt-BR')}`
      });
    }
    if (geocodingProvider?.search)
      try {
        const addresses = await geocodingProvider.search(query, {
          countryCode: 'br',
          latitude,
          longitude,
          limit: 8
        });
        for (const place of addresses.slice(0, 8))
          results.push({
            type: 'ADDRESS',
            id: `${place.provider}:${place.longitude}:${place.latitude}`,
            title: place.label,
            subtitle: place.type || 'Endereço',
            latitude: place.latitude,
            longitude: place.longitude
          });
      } catch {}
    if (latitude !== null && longitude !== null)
      for (const item of results)
        if (item.latitude != null)
          item.distanceMeters = Math.round(distanceMeters({ latitude, longitude }, item));
    results.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
    res.json({
      results: results.slice(0, 40),
      query,
      filters: { category: req.query.category || null }
    });
  });

  router.get('/stations', requireAuth, (req, res) => {
    const latitude = coordinate(req.query.latitude, 90),
      longitude = coordinate(req.query.longitude, 180),
      radius = Math.min(50000, Math.max(100, Number(req.query.radiusMeters) || 10000));
    let rows = database
      .prepare('SELECT * FROM fuel_stations ORDER BY updated_at DESC LIMIT 250')
      .all();
    if (latitude !== null && longitude !== null)
      rows = rows
        .map(row => ({
          row,
          distanceMeters: Math.round(distanceMeters({ latitude, longitude }, row))
        }))
        .filter(item => item.distanceMeters <= radius)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .map(item => ({ ...item.row, distanceMeters: item.distanceMeters }));
    res.json({
      stations: rows.map(row => ({
        ...serializeStation(database, row, req.session.userId),
        distanceMeters: row.distanceMeters ?? null
      }))
    });
  });

  router.post('/stations', admin, writes, csrf, twoFactorGuard, (req, res) => {
    const name = cleanText(req.body?.name, 160),
      address = cleanText(req.body?.address, 300),
      latitude = coordinate(req.body?.latitude, 90),
      longitude = coordinate(req.body?.longitude, 180);
    if (name.length < 2 || address.length < 4 || latitude === null || longitude === null)
      return res
        .status(400)
        .json({ error: 'Nome, endereço e coordenadas válidas são obrigatórios.' });
    const id = uuid(),
      now = Date.now();
    database
      .prepare(
        "INSERT INTO fuel_stations (id,provider_place_id,name,brand,address,latitude,longitude,opening_hours_json,services_json,phone,source,confidence,verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'PENDING',NULL,?,?)"
      )
      .run(
        id,
        validId(req.body.providerPlaceId),
        name,
        cleanText(req.body.brand, 100) || null,
        address,
        latitude,
        longitude,
        JSON.stringify(
          Array.isArray(req.body.openingHours) ? req.body.openingHours.slice(0, 20) : []
        ),
        JSON.stringify(
          Array.isArray(req.body.services)
            ? req.body.services
                .map(v => cleanText(v, 60))
                .filter(Boolean)
                .slice(0, 30)
            : []
        ),
        cleanText(req.body.phone, 30) || null,
        cleanText(req.body.source, 120) || 'Cadastro administrativo',
        now,
        now
      );
    audit(database, req.session.userId, 'FUEL_STATION_CREATED', 'FUEL_STATION', id, name);
    res.status(201).json({
      station: serializeStation(
        database,
        database.prepare('SELECT * FROM fuel_stations WHERE id=?').get(id),
        req.session.userId
      )
    });
  });

  router.post('/stations/:id/prices', requireAuth, writes, csrf, (req, res) => {
    const station = database.prepare('SELECT id FROM fuel_stations WHERE id=?').get(req.params.id),
      fuelType = cleanText(req.body?.fuelType, 30).toUpperCase(),
      price = Number(req.body?.price),
      observedAt = Number(req.body?.observedAt || Date.now());
    if (!station) return res.status(404).json({ error: 'Posto não encontrado.' });
    if (
      !FUEL_TYPES.has(fuelType) ||
      !Number.isFinite(price) ||
      price <= 0 ||
      price > 100 ||
      !Number.isFinite(observedAt) ||
      observedAt > Date.now() + 300000
    )
      return res.status(400).json({ error: 'Tipo, preço ou data inválidos.' });
    const id = uuid(),
      now = Date.now();
    database
      .prepare(
        "INSERT INTO fuel_prices (id,station_id,fuel_type,price_cents,submitted_by,source,status,evidence_photo_id,observed_at,created_at) VALUES (?,?,?,?,?,'Comunidade RASTREON','PENDING',?,?,?)"
      )
      .run(
        id,
        station.id,
        fuelType,
        Math.round(price * 100),
        req.session.userId,
        validId(req.body.evidencePhotoId),
        observedAt,
        now
      );
    audit(database, req.session.userId, 'FUEL_PRICE_SUBMITTED', 'FUEL_PRICE', id, fuelType);
    res.status(201).json({
      price: {
        id,
        stationId: station.id,
        fuelType,
        price: Math.round(price * 100) / 100,
        status: 'PENDING',
        observedAt
      }
    });
  });

  router.post('/stations/:id/favorite', requireAuth, writes, csrf, (req, res) => {
    if (!database.prepare('SELECT 1 FROM fuel_stations WHERE id=?').get(req.params.id))
      return res.status(404).json({ error: 'Posto não encontrado.' });
    database
      .prepare(
        "INSERT OR IGNORE INTO favorite_entities (user_id,entity_type,entity_id,created_at) VALUES (?,'FUEL_STATION',?,?)"
      )
      .run(req.session.userId, req.params.id, Date.now());
    res.status(204).end();
  });
  router.delete('/stations/:id/favorite', requireAuth, writes, csrf, (req, res) => {
    database
      .prepare(
        "DELETE FROM favorite_entities WHERE user_id=? AND entity_type='FUEL_STATION' AND entity_id=?"
      )
      .run(req.session.userId, req.params.id);
    res.status(204).end();
  });
  router.use('/stations/:id/benefits', twoFactorGuard);
  router.post('/stations/:id/benefits', admin, writes, csrf, (req, res) => {
    const station = database.prepare('SELECT id FROM fuel_stations WHERE id=?').get(req.params.id),
      description = cleanText(req.body?.description, 300),
      rules = cleanText(req.body?.rules, 1000),
      validFrom = Number(req.body?.validFrom),
      validUntil = Number(req.body?.validUntil);
    if (!station) return res.status(404).json({ error: 'Posto não encontrado.' });
    if (
      description.length < 3 ||
      rules.length < 3 ||
      !Number.isFinite(validFrom) ||
      !Number.isFinite(validUntil) ||
      validUntil <= validFrom
    )
      return res
        .status(400)
        .json({ error: 'Benefício exige descrição, regras e validade coerente.' });
    const id = uuid(),
      now = Date.now();
    database
      .prepare(
        'INSERT INTO partner_benefits (id,station_id,description,rules,coupon,redemption,valid_from,valid_until,enabled,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)'
      )
      .run(
        id,
        station.id,
        description,
        rules,
        cleanText(req.body.coupon, 80) || null,
        cleanText(req.body.redemption, 500) || null,
        validFrom,
        validUntil,
        req.session.userId,
        now,
        now
      );
    audit(
      database,
      req.session.userId,
      'PARTNER_BENEFIT_CREATED',
      'PARTNER_BENEFIT',
      id,
      description
    );
    res
      .status(201)
      .json({ benefit: { id, stationId: station.id, description, rules, validFrom, validUntil } });
  });

  router.get('/road-reports', requireAuth, (req, res) => {
    expireReports(database);
    const latitude = coordinate(req.query.latitude, 90),
      longitude = coordinate(req.query.longitude, 180),
      radius = Math.min(30000, Math.max(100, Number(req.query.radiusMeters) || 10000));
    let rows = database
      .prepare(
        `SELECT reports.*,users.name AS author_name,users.avatar_data,users.public_contact_id,users.chat_enabled,(SELECT COUNT(*) FROM road_report_votes votes WHERE votes.report_id=reports.id AND vote='CONFIRM') AS confirmations,(SELECT COUNT(*) FROM road_report_votes votes WHERE votes.report_id=reports.id AND vote='DENY') AS denials FROM road_reports reports JOIN users ON users.id=reports.user_id WHERE reports.status='OPEN' ORDER BY reports.created_at DESC LIMIT 300`
      )
      .all();
    if (latitude !== null && longitude !== null)
      rows = rows
        .map(row => ({
          ...row,
          distanceMeters: Math.round(distanceMeters({ latitude, longitude }, row))
        }))
        .filter(row => row.distanceMeters <= radius);
    res.json({
      reports: rows.map(row => ({
        id: row.id,
        category: row.category,
        severity: row.severity,
        description: row.description,
        latitude: row.latitude,
        longitude: row.longitude,
        status: row.status,
        sourceLabel: row.source_label,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        confirmations: row.confirmations,
        denials: row.denials,
        distanceMeters: row.distanceMeters ?? null,
        author: publicUser(row),
        mine: Number(row.user_id) === Number(req.session.userId)
      }))
    });
  });

  router.post('/road-reports', requireAuth, writes, csrf, (req, res) => {
    const category = cleanText(req.body?.category, 30).toUpperCase(),
      severity = cleanText(req.body?.severity, 10).toUpperCase(),
      description = cleanText(req.body?.description, 500),
      latitude = coordinate(req.body?.latitude, 90),
      longitude = coordinate(req.body?.longitude, 180);
    if (
      !REPORT_CATEGORIES.has(category) ||
      !['LOW', 'MEDIUM', 'HIGH'].includes(severity) ||
      description.length < 3 ||
      latitude === null ||
      longitude === null
    )
      return res
        .status(400)
        .json({ error: 'Categoria, gravidade, descrição e posição do evento são obrigatórias.' });
    const id = uuid(),
      now = Date.now(),
      expiresAt = now + reportLifetime(severity);
    database
      .prepare(
        "INSERT INTO road_reports (id,user_id,category,severity,description,latitude,longitude,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'OPEN',?,?,?)"
      )
      .run(
        id,
        req.session.userId,
        category,
        severity,
        description,
        latitude,
        longitude,
        expiresAt,
        now,
        now
      );
    audit(database, req.session.userId, 'ROAD_REPORT_CREATED', 'ROAD_REPORT', id, category);
    res.status(201).json({
      report: {
        id,
        category,
        severity,
        description,
        latitude,
        longitude,
        status: 'OPEN',
        sourceLabel: 'Comunidade RASTREON',
        expiresAt,
        createdAt: now
      }
    });
  });

  router.put('/road-reports/:id/vote', requireAuth, writes, csrf, (req, res) => {
    const vote = cleanText(req.body?.vote, 20).toUpperCase(),
      report = database
        .prepare("SELECT * FROM road_reports WHERE id=? AND status='OPEN'")
        .get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Ocorrência ativa não encontrada.' });
    if (!['CONFIRM', 'DENY', 'RESOLVED'].includes(vote))
      return res.status(400).json({ error: 'Confirmação inválida.' });
    const now = Date.now();
    database
      .prepare(
        'INSERT INTO road_report_votes (report_id,user_id,vote,created_at) VALUES (?,?,?,?) ON CONFLICT(report_id,user_id) DO UPDATE SET vote=excluded.vote,created_at=excluded.created_at'
      )
      .run(report.id, req.session.userId, vote, now);
    const resolved = database
      .prepare(
        "SELECT COUNT(*) AS total FROM road_report_votes WHERE report_id=? AND vote='RESOLVED'"
      )
      .get(report.id).total;
    if (
      resolved >= 2 ||
      (vote === 'RESOLVED' && Number(report.user_id) === Number(req.session.userId))
    )
      database
        .prepare("UPDATE road_reports SET status='RESOLVED',resolved_at=?,updated_at=? WHERE id=?")
        .run(now, now, report.id);
    res.json({
      vote,
      status: database.prepare('SELECT status FROM road_reports WHERE id=?').get(report.id).status
    });
  });

  router.post('/content-reports', requireAuth, writes, csrf, (req, res) => {
    const entityType = cleanText(req.body?.entityType, 30).toUpperCase(),
      entityId = validId(req.body?.entityId),
      reason = cleanText(req.body?.reason, 80),
      details = cleanText(req.body?.details, 500);
    if (
      !entityId ||
      !['ROAD_REPORT', 'COMMENT', 'PX_MESSAGE', 'PHOTO'].includes(entityType) ||
      reason.length < 3
    )
      return res.status(400).json({ error: 'Conteúdo e motivo válidos são obrigatórios.' });
    try {
      const id = uuid();
      database
        .prepare(
          "INSERT INTO content_reports (id,reporter_user_id,entity_type,entity_id,reason,details,status,created_at) VALUES (?,?,?,?,?,?,'OPEN',?)"
        )
        .run(id, req.session.userId, entityType, entityId, reason, details || null, Date.now());
      audit(database, req.session.userId, 'CONTENT_REPORTED', entityType, entityId, reason);
      res.status(201).json({ report: { id, status: 'OPEN' } });
    } catch (error) {
      if (String(error.message).includes('UNIQUE'))
        return res.status(409).json({ error: 'Você já denunciou este conteúdo.' });
      throw error;
    }
  });

  router.get('/comments/:entityType/:entityId', requireAuth, (req, res) => {
    const entityType = cleanText(req.params.entityType, 30).toUpperCase(),
      entityId = validId(req.params.entityId);
    if (!ENTITY_TYPES.has(entityType) || !entityId)
      return res.status(400).json({ error: 'Entidade inválida.' });
    const rows = database
      .prepare(
        `SELECT comments.*,users.name AS author_name,users.avatar_data,users.public_contact_id,users.chat_enabled,(SELECT COUNT(*) FROM comment_reactions r WHERE r.comment_id=comments.id AND r.reaction='LIKE') AS likes FROM entity_comments comments JOIN users ON users.id=comments.user_id WHERE comments.entity_type=? AND comments.entity_id=? AND comments.status='PUBLISHED' ORDER BY comments.created_at DESC LIMIT 100`
      )
      .all(entityType, entityId);
    res.json({
      comments: rows.map(row => ({
        id: row.id,
        parentId: row.parent_id,
        body: row.body,
        author: publicUser(row),
        likes: row.likes,
        mine: Number(row.user_id) === Number(req.session.userId),
        createdAt: row.created_at
      }))
    });
  });
  router.post('/comments/:entityType/:entityId', requireAuth, writes, csrf, (req, res) => {
    const entityType = cleanText(req.params.entityType, 30).toUpperCase(),
      entityId = validId(req.params.entityId),
      body = cleanText(req.body?.body, 1000),
      parentId = validId(req.body?.parentId);
    if (!ENTITY_TYPES.has(entityType) || !entityId || body.length < 2)
      return res.status(400).json({ error: 'Entidade e comentário válidos são obrigatórios.' });
    if (
      parentId &&
      !database
        .prepare(
          "SELECT 1 FROM entity_comments WHERE id=? AND entity_type=? AND entity_id=? AND status='PUBLISHED'"
        )
        .get(parentId, entityType, entityId)
    )
      return res.status(400).json({ error: 'Comentário respondido não encontrado.' });
    const id = uuid(),
      now = Date.now();
    database
      .prepare(
        "INSERT INTO entity_comments (id,entity_type,entity_id,user_id,parent_id,body,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'PUBLISHED',?,?)"
      )
      .run(id, entityType, entityId, req.session.userId, parentId, body, now, now);
    if (parentId) {
      const recipient = database
        .prepare('SELECT user_id FROM entity_comments WHERE id=?')
        .get(parentId);
      if (recipient && Number(recipient.user_id) !== Number(req.session.userId))
        notify(
          database,
          recipient.user_id,
          'COMMENT_REPLY',
          'Nova resposta',
          'Seu comentário recebeu uma resposta.',
          'COMMENT',
          id
        );
    }
    audit(
      database,
      req.session.userId,
      'COMMENT_CREATED',
      entityType,
      entityId,
      parentId ? 'Resposta' : 'Comentário'
    );
    res
      .status(201)
      .json({ comment: { id, entityType, entityId, parentId, body, mine: true, createdAt: now } });
  });
  router.put('/comments/:id/reaction', requireAuth, writes, csrf, (req, res) => {
    const reaction = cleanText(req.body?.reaction, 20).toUpperCase();
    if (
      !['LIKE', 'CONFIRM', 'DENY'].includes(reaction) ||
      !database
        .prepare("SELECT 1 FROM entity_comments WHERE id=? AND status='PUBLISHED'")
        .get(req.params.id)
    )
      return res.status(400).json({ error: 'Comentário ou reação inválidos.' });
    database
      .prepare(
        'INSERT INTO comment_reactions (comment_id,user_id,reaction,created_at) VALUES (?,?,?,?) ON CONFLICT(comment_id,user_id) DO UPDATE SET reaction=excluded.reaction,created_at=excluded.created_at'
      )
      .run(req.params.id, req.session.userId, reaction, Date.now());
    res.json({ reaction });
  });

  router.get('/photos', requireAuth, (req, res) => {
    const entityType = cleanText(req.query.entityType, 30).toUpperCase(),
      entityId = validId(req.query.entityId);
    if (!ENTITY_TYPES.has(entityType) || !entityId)
      return res.status(400).json({ error: 'Entidade inválida.' });
    const rows = database
      .prepare(
        "SELECT id,mime_type AS mimeType,byte_size AS byteSize,status,created_at AS createdAt,user_id AS userId FROM community_photos WHERE entity_type=? AND entity_id=? AND (status='PUBLISHED' OR user_id=?) ORDER BY created_at DESC LIMIT 100"
      )
      .all(entityType, entityId, req.session.userId);
    res.json({
      photos: rows.map(row => ({
        id: row.id,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        status: row.status,
        mine: Number(row.userId) === Number(req.session.userId),
        createdAt: row.createdAt,
        url: `/api/platform/photos/${row.id}/content`
      }))
    });
  });
  router.post(
    '/photos',
    requireAuth,
    writes,
    csrf,
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
    (req, res) => {
      const entityType = cleanText(req.query.entityType, 30).toUpperCase(),
        entityId = validId(req.query.entityId),
        rule = safePhoto(req.body, req.get('content-type')?.split(';')[0]);
      if (!ENTITY_TYPES.has(entityType) || !entityId || !rule)
        return res.status(400).json({
          error: 'Imagem JPEG, PNG ou WebP válida de até 5 MB e entidade são obrigatórias.'
        });
      const id = uuid(),
        storageKey = `${id}${rule.extension}`,
        destination = path.join(photoDirectory, storageKey);
      if (path.dirname(destination) !== photoDirectory)
        return res.status(400).json({ error: 'Destino de upload inválido.' });
      fs.writeFileSync(destination, req.body, { flag: 'wx', mode: 0o600 });
      const status = process.env.COMMUNITY_PHOTO_AUTO_PUBLISH === 'true' ? 'PUBLISHED' : 'PENDING';
      database
        .prepare(
          'INSERT INTO community_photos (id,entity_type,entity_id,user_id,storage_key,mime_type,byte_size,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)'
        )
        .run(
          id,
          entityType,
          entityId,
          req.session.userId,
          storageKey,
          req.get('content-type').split(';')[0],
          req.body.length,
          status,
          Date.now()
        );
      audit(database, req.session.userId, 'COMMUNITY_PHOTO_UPLOADED', entityType, entityId, status);
      res.status(201).json({
        photo: {
          id,
          entityType,
          entityId,
          status,
          byteSize: req.body.length,
          url: status === 'PUBLISHED' ? `/api/platform/photos/${id}/content` : null
        }
      });
    }
  );
  router.get('/photos/:id/content', requireAuth, (req, res) => {
    const photo = database
      .prepare("SELECT * FROM community_photos WHERE id=? AND (status='PUBLISHED' OR user_id=?)")
      .get(req.params.id, req.session.userId);
    if (!photo) return res.status(404).json({ error: 'Foto não encontrada.' });
    const source = path.resolve(photoDirectory, photo.storage_key);
    if (path.dirname(source) !== photoDirectory || !fs.existsSync(source))
      return res.status(404).json({ error: 'Arquivo não encontrado.' });
    res.set({
      'Content-Type': photo.mime_type,
      'Content-Length': photo.byte_size,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(source).pipe(res);
  });

  router.get('/chat/settings', requireAuth, (req, res) => {
    let user = database
      .prepare(
        'SELECT public_contact_id AS contactId,chat_enabled AS enabled FROM users WHERE id=?'
      )
      .get(req.session.userId);
    if (!user.contactId) {
      const contactId = crypto.randomBytes(16).toString('hex');
      database
        .prepare('UPDATE users SET public_contact_id=? WHERE id=?')
        .run(contactId, req.session.userId);
      user = { ...user, contactId };
    }
    res.json({ chat: { contactId: user.contactId, enabled: Boolean(user.enabled) } });
  });
  router.patch('/chat/settings', requireAuth, writes, csrf, (req, res) => {
    const enabled = req.body?.enabled === true;
    const contactId =
      database
        .prepare('SELECT public_contact_id AS value FROM users WHERE id=?')
        .get(req.session.userId)?.value || crypto.randomBytes(16).toString('hex');
    database
      .prepare('UPDATE users SET chat_enabled=?,public_contact_id=? WHERE id=?')
      .run(enabled ? 1 : 0, contactId, req.session.userId);
    audit(
      database,
      req.session.userId,
      'CHAT_SETTING_CHANGED',
      'USER',
      String(req.session.userId),
      enabled ? 'enabled' : 'disabled'
    );
    res.json({ chat: { enabled, contactId } });
  });
  router.post('/conversation-requests', requireAuth, messages, csrf, (req, res) => {
    const contactId = validId(req.body?.recipientContactId),
      contextType = cleanText(req.body?.contextType, 30).toUpperCase(),
      contextId = validId(req.body?.contextId),
      recipient = database
        .prepare('SELECT id,chat_enabled FROM users WHERE public_contact_id=?')
        .get(contactId);
    if (!recipient || !recipient.chat_enabled)
      return res.status(404).json({ error: 'Este usuário não está disponível para conversa.' });
    if (Number(recipient.id) === Number(req.session.userId))
      return res.status(400).json({ error: 'Você não pode conversar consigo mesmo.' });
    if (
      database
        .prepare(
          'SELECT 1 FROM user_blocks WHERE (blocker_user_id=? AND blocked_user_id=?) OR (blocker_user_id=? AND blocked_user_id=?)'
        )
        .get(recipient.id, req.session.userId, req.session.userId, recipient.id)
    )
      return res.status(403).json({ error: 'Conversa não permitida.' });
    const recent = database
      .prepare(
        'SELECT COUNT(*) AS total FROM conversation_requests WHERE sender_user_id=? AND created_at>?'
      )
      .get(req.session.userId, Date.now() - 86400000).total;
    if (recent >= 10)
      return res.status(429).json({ error: 'Limite diário de solicitações atingido.' });
    const id = uuid(),
      now = Date.now();
    database
      .prepare(
        "INSERT INTO conversation_requests (id,sender_user_id,recipient_user_id,context_type,context_id,status,created_at) VALUES (?,?,?,?,?,'PENDING',?)"
      )
      .run(id, req.session.userId, recipient.id, contextType || 'COMMUNITY', contextId, now);
    notify(
      database,
      recipient.id,
      'CONVERSATION_REQUEST',
      'Solicitação de conversa',
      'Um motorista enviou uma solicitação de conversa.',
      'CONVERSATION_REQUEST',
      id
    );
    audit(
      database,
      req.session.userId,
      'CONVERSATION_REQUESTED',
      'CONVERSATION_REQUEST',
      id,
      contextType
    );
    res.status(201).json({ request: { id, status: 'PENDING', createdAt: now } });
  });
  router.get('/conversation-requests', requireAuth, (req, res) => {
    const rows = database
      .prepare(
        `SELECT requests.*,users.name AS sender_name,users.avatar_data FROM conversation_requests requests JOIN users ON users.id=requests.sender_user_id WHERE requests.recipient_user_id=? ORDER BY requests.created_at DESC LIMIT 50`
      )
      .all(req.session.userId);
    res.json({
      requests: rows.map(row => ({
        id: row.id,
        status: row.status,
        contextType: row.context_type,
        contextId: row.context_id,
        sender: { displayName: alias(row.sender_name), avatar: row.avatar_data || null },
        createdAt: row.created_at
      }))
    });
  });
  router.post('/conversation-requests/:id/respond', requireAuth, messages, csrf, (req, res) => {
    const action = cleanText(req.body?.action, 20).toUpperCase(),
      request = database
        .prepare(
          "SELECT * FROM conversation_requests WHERE id=? AND recipient_user_id=? AND status='PENDING'"
        )
        .get(req.params.id, req.session.userId);
    if (!request) return res.status(404).json({ error: 'Solicitação pendente não encontrada.' });
    if (!['ACCEPT', 'DECLINE', 'BLOCK'].includes(action))
      return res.status(400).json({ error: 'Resposta inválida.' });
    const now = Date.now(),
      status = action === 'ACCEPT' ? 'ACCEPTED' : action === 'BLOCK' ? 'BLOCKED' : 'DECLINED';
    let conversationId = null;
    database.transaction(() => {
      database
        .prepare('UPDATE conversation_requests SET status=?,responded_at=? WHERE id=?')
        .run(status, now, request.id);
      if (action === 'BLOCK')
        database
          .prepare(
            'INSERT OR IGNORE INTO user_blocks (blocker_user_id,blocked_user_id,created_at) VALUES (?,?,?)'
          )
          .run(req.session.userId, request.sender_user_id, now);
      if (action === 'ACCEPT') {
        conversationId = uuid();
        database
          .prepare(
            "INSERT INTO conversations (id,request_id,user_a_id,user_b_id,status,created_at,updated_at) VALUES (?,?,?,?,'ACTIVE',?,?)"
          )
          .run(
            conversationId,
            request.id,
            request.sender_user_id,
            request.recipient_user_id,
            now,
            now
          );
      }
      audit(
        database,
        req.session.userId,
        `CONVERSATION_${status}`,
        'CONVERSATION_REQUEST',
        request.id,
        action
      );
    })();
    res.json({ request: { id: request.id, status }, conversationId });
  });
  router.get('/conversations', requireAuth, (req, res) => {
    const rows = database
      .prepare(
        `SELECT conversations.*,CASE WHEN user_a_id=? THEN b.name ELSE a.name END AS peer_name FROM conversations JOIN users a ON a.id=user_a_id JOIN users b ON b.id=user_b_id WHERE (user_a_id=? OR user_b_id=?) ORDER BY updated_at DESC`
      )
      .all(req.session.userId, req.session.userId, req.session.userId);
    res.json({
      conversations: rows.map(row => ({
        id: row.id,
        status: row.status,
        peer: { displayName: alias(row.peer_name) },
        updatedAt: row.updated_at
      }))
    });
  });
  router.get('/conversations/:id/messages', requireAuth, (req, res) => {
    const conversation = database
      .prepare('SELECT * FROM conversations WHERE id=? AND (user_a_id=? OR user_b_id=?)')
      .get(req.params.id, req.session.userId, req.session.userId);
    if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada.' });
    const rows = database
      .prepare(
        "SELECT id,sender_user_id AS senderUserId,body,created_at AS createdAt FROM conversation_messages WHERE conversation_id=? AND status='SENT' ORDER BY created_at DESC LIMIT 100"
      )
      .all(conversation.id)
      .reverse();
    res.json({
      messages: rows.map(row => ({
        ...row,
        mine: Number(row.senderUserId) === Number(req.session.userId),
        senderUserId: undefined
      }))
    });
  });
  router.post('/conversations/:id/messages', requireAuth, messages, csrf, (req, res) => {
    const conversation = database
        .prepare(
          "SELECT * FROM conversations WHERE id=? AND status='ACTIVE' AND (user_a_id=? OR user_b_id=?)"
        )
        .get(req.params.id, req.session.userId, req.session.userId),
      body = cleanText(req.body?.body, 800);
    if (!conversation) return res.status(404).json({ error: 'Conversa ativa não encontrada.' });
    if (body.length < 1) return res.status(400).json({ error: 'Mensagem vazia.' });
    const id = uuid(),
      now = Date.now(),
      recipient =
        Number(conversation.user_a_id) === Number(req.session.userId)
          ? conversation.user_b_id
          : conversation.user_a_id;
    database
      .prepare(
        'INSERT INTO conversation_messages (id,conversation_id,sender_user_id,body,created_at) VALUES (?,?,?,?,?)'
      )
      .run(id, conversation.id, req.session.userId, body, now);
    database.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(now, conversation.id);
    notify(
      database,
      recipient,
      'CONVERSATION_REQUEST',
      'Nova mensagem',
      'Você recebeu uma nova mensagem privada.',
      'CONVERSATION',
      conversation.id
    );
    res.status(201).json({ message: { id, body, mine: true, createdAt: now } });
  });

  router.get('/px/channels', requireAuth, (_req, res) =>
    res.json({
      channels: database
        .prepare(
          'SELECT id,kind,slug,name,description FROM px_channels WHERE enabled=1 ORDER BY name'
        )
        .all()
    })
  );
  router.get('/px/channels/:id/messages', requireAuth, (req, res) => {
    const rows = database
      .prepare(
        `SELECT messages.id,messages.body,messages.created_at,users.name AS author_name,users.avatar_data FROM px_messages messages JOIN users ON users.id=messages.user_id WHERE messages.channel_id=? AND messages.status='PUBLISHED' ORDER BY messages.created_at DESC LIMIT 100`
      )
      .all(req.params.id);
    res.json({
      messages: rows.map(row => ({
        id: row.id,
        body: row.body,
        author: { displayName: alias(row.author_name), avatar: row.avatar_data || null },
        createdAt: row.created_at
      }))
    });
  });
  router.post('/px/channels/:id/messages', requireAuth, messages, csrf, (req, res) => {
    const channel = database
        .prepare('SELECT id FROM px_channels WHERE id=? AND enabled=1')
        .get(req.params.id),
      body = cleanText(req.body?.body, 300);
    if (!channel || body.length < 2)
      return res.status(400).json({ error: 'Canal ou mensagem inválidos.' });
    if (
      /\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(
        body
      )
    )
      return res.status(400).json({ error: 'Não publique telefone ou e-mail no PX.' });
    const id = uuid(),
      now = Date.now();
    database
      .prepare(
        "INSERT INTO px_messages (id,channel_id,user_id,body,status,created_at) VALUES (?,?,?,?,'PUBLISHED',?)"
      )
      .run(id, channel.id, req.session.userId, body, now);
    res.status(201).json({ message: { id, body, createdAt: now } });
  });

  router.get('/notifications', requireAuth, (req, res) =>
    res.json({
      notifications: database
        .prepare(
          'SELECT id,type,title,body,entity_type AS entityType,entity_id AS entityId,created_at AS createdAt,read_at AS readAt FROM app_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100'
        )
        .all(req.session.userId)
    })
  );
  router.get('/notification-preferences', requireAuth, (req, res) => {
    const stored = new Map(
      database
        .prepare('SELECT type,enabled FROM notification_preferences WHERE user_id=?')
        .all(req.session.userId)
        .map(row => [row.type, Boolean(row.enabled)])
    );
    res.json({
      preferences: NOTIFICATION_TYPES.map(type => ({
        type,
        enabled: stored.has(type) ? stored.get(type) : true
      }))
    });
  });
  router.patch('/notification-preferences/:type', requireAuth, writes, csrf, (req, res) => {
    const type = cleanText(req.params.type, 50).toUpperCase();
    if (!NOTIFICATION_TYPES.includes(type) || typeof req.body?.enabled !== 'boolean')
      return res.status(400).json({ error: 'Preferência inválida.' });
    database
      .prepare(
        'INSERT INTO notification_preferences (user_id,type,enabled,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id,type) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at'
      )
      .run(req.session.userId, type, req.body.enabled ? 1 : 0, Date.now());
    res.json({ preference: { type, enabled: req.body.enabled } });
  });
  router.patch('/notifications/:id/read', requireAuth, writes, csrf, (req, res) => {
    const result = database
      .prepare('UPDATE app_notifications SET read_at=? WHERE id=? AND user_id=?')
      .run(Date.now(), req.params.id, req.session.userId);
    if (!result.changes) return res.status(404).json({ error: 'Notificação não encontrada.' });
    res.status(204).end();
  });

  router.use('/admin', (req, res, next) =>
    req.method === 'GET' ? next() : twoFactorGuard(req, res, next)
  );
  router.get('/admin/moderation', admin, (req, res) => {
    expireReports(database);
    res.json({
      contentReports: database
        .prepare(
          "SELECT id,entity_type AS entityType,entity_id AS entityId,reason,details,created_at AS createdAt FROM content_reports WHERE status='OPEN' ORDER BY created_at DESC LIMIT 100"
        )
        .all(),
      pendingPrices: database
        .prepare(
          "SELECT prices.id,stations.name AS stationName,prices.fuel_type AS fuelType,prices.price_cents/100.0 AS price,prices.observed_at AS observedAt FROM fuel_prices prices JOIN fuel_stations stations ON stations.id=prices.station_id WHERE prices.status='PENDING' ORDER BY prices.created_at DESC LIMIT 100"
        )
        .all(),
      pendingPhotos: database
        .prepare(
          "SELECT id,entity_type AS entityType,entity_id AS entityId,mime_type AS mimeType,byte_size AS byteSize,created_at AS createdAt FROM community_photos WHERE status='PENDING' ORDER BY created_at DESC LIMIT 100"
        )
        .all(),
      openRoadReports: database
        .prepare(
          "SELECT id,category,severity,description,expires_at AS expiresAt FROM road_reports WHERE status='OPEN' ORDER BY severity DESC,created_at DESC LIMIT 100"
        )
        .all()
    });
  });
  router.patch('/admin/prices/:id', admin, writes, csrf, (req, res) => {
    const status = cleanText(req.body?.status, 20).toUpperCase();
    if (!['CONFIRMED', 'REJECTED'].includes(status))
      return res.status(400).json({ error: 'Decisão inválida.' });
    const result = database
      .prepare('UPDATE fuel_prices SET status=? WHERE id=?')
      .run(status, req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Preço não encontrado.' });
    audit(
      database,
      req.session.userId,
      `FUEL_PRICE_${status}`,
      'FUEL_PRICE',
      req.params.id,
      cleanText(req.body?.reason, 200)
    );
    res.json({ status });
  });
  router.patch('/admin/photos/:id', admin, writes, csrf, (req, res) => {
    const status = cleanText(req.body?.status, 20).toUpperCase();
    if (!['PUBLISHED', 'HIDDEN'].includes(status))
      return res.status(400).json({ error: 'Decisão inválida.' });
    const result = database
      .prepare('UPDATE community_photos SET status=?,moderated_at=? WHERE id=?')
      .run(status, Date.now(), req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Foto não encontrada.' });
    audit(
      database,
      req.session.userId,
      `PHOTO_${status}`,
      'PHOTO',
      req.params.id,
      cleanText(req.body?.reason, 200)
    );
    res.json({ status });
  });
  router.patch('/admin/content-reports/:id', admin, writes, csrf, (req, res) => {
    const status = cleanText(req.body?.status, 20).toUpperCase();
    if (!['RESOLVED', 'DISMISSED'].includes(status))
      return res.status(400).json({ error: 'Decisão inválida.' });
    const result = database
      .prepare('UPDATE content_reports SET status=?,resolved_by=?,resolved_at=? WHERE id=?')
      .run(status, req.session.userId, Date.now(), req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Denúncia não encontrada.' });
    audit(
      database,
      req.session.userId,
      `CONTENT_REPORT_${status}`,
      'CONTENT_REPORT',
      req.params.id,
      cleanText(req.body?.reason, 200)
    );
    res.json({ status });
  });
  router.get('/admin/audit', admin, (req, res) =>
    res.json({
      events: database
        .prepare(
          'SELECT id,action,target_type AS targetType,target_id AS targetId,reason,created_at AS createdAt FROM audit_events ORDER BY created_at DESC LIMIT 200'
        )
        .all()
    })
  );

  router.use('/developer/tracker-bindings', (req, res, next) =>
    req.method === 'GET' ? next() : twoFactorGuard(req, res, next)
  );
  router.get('/developer/vehicles', developer, (_req, res) =>
    res.json({
      vehicles: database
        .prepare('SELECT id,nickname,brand,model FROM vehicles ORDER BY updated_at DESC LIMIT 200')
        .all()
    })
  );
  router.post('/developer/tracker-bindings', developer, writes, csrf, (req, res) => {
    const vehicle = database
        .prepare('SELECT id,user_id FROM vehicles WHERE id=?')
        .get(req.body?.vehicleId),
      externalId = cleanText(req.body?.externalDeviceId, 120),
      label = cleanText(req.body?.label, 100);
    if (!vehicle || !externalId || label.length < 2)
      return res
        .status(400)
        .json({ error: 'Veículo, identificador externo e rótulo são obrigatórios.' });
    let externalIdHash;
    try {
      externalIdHash = traccar.hashExternalId(externalId);
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
    const id = uuid(),
      now = Date.now();
    database
      .prepare(
        "INSERT INTO tracker_bindings (id,user_id,vehicle_id,provider,external_id_hash,public_label,status,created_at,updated_at) VALUES (?,?,?,'TRACCAR',?,?,'ACTIVE',?,?)"
      )
      .run(id, vehicle.user_id, vehicle.id, externalIdHash, label, now, now);
    audit(database, req.session.userId, 'TRACKER_BINDING_CREATED', 'TRACKER_BINDING', id, label);
    res.status(201).json({
      binding: { id, vehicleId: vehicle.id, provider: 'TRACCAR', label, status: 'ACTIVE' }
    });
  });
  router.get('/developer/tracker-bindings', developer, (_req, res) =>
    res.json({
      bindings: database
        .prepare(
          'SELECT id,vehicle_id AS vehicleId,provider,public_label AS label,status,last_seen_at AS lastSeenAt,created_at AS createdAt FROM tracker_bindings ORDER BY created_at DESC'
        )
        .all()
    })
  );

  const configurableFlags = new Set([
    'COMMUNITY_PLACES_ENABLED',
    'COMMUNITY_PHOTO_AUTO_PUBLISH',
    'TRACCAR_ENABLED',
    'FEATURE_REMOTE_BLOCK_HARDWARE'
  ]);
  router.get('/developer/feature-flags', developer, (_req, res) => {
    const stored = new Map(
      database
        .prepare('SELECT key,enabled,updated_at AS updatedAt FROM feature_flags')
        .all()
        .map(row => [row.key, row])
    );
    res.json({
      flags: [...configurableFlags].map(key => ({
        key,
        enabled: stored.has(key) ? Boolean(stored.get(key).enabled) : process.env[key] === 'true',
        updatedAt: stored.get(key)?.updatedAt || null,
        restartRequired: true,
        safetyLocked: key === 'FEATURE_REMOTE_BLOCK_HARDWARE'
      }))
    });
  });
  router.patch(
    '/developer/feature-flags/:key',
    developer,
    writes,
    csrf,
    twoFactorGuard,
    (req, res) => {
      const key = cleanText(req.params.key, 80).toUpperCase();
      if (!configurableFlags.has(key) || typeof req.body?.enabled !== 'boolean')
        return res.status(400).json({ error: 'Feature flag inválida.' });
      if (key === 'FEATURE_REMOTE_BLOCK_HARDWARE' && req.body.enabled)
        return res.status(409).json({
          error:
            'Bloqueio físico remoto permanece desabilitado até existir integração homologada e segura.'
        });
      database
        .prepare(
          'INSERT INTO feature_flags (key,enabled,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at'
        )
        .run(key, req.body.enabled ? 1 : 0, req.session.userId, Date.now());
      audit(
        database,
        req.session.userId,
        'FEATURE_FLAG_UPDATED',
        'FEATURE_FLAG',
        key,
        String(req.body.enabled)
      );
      res.json({ flag: { key, enabled: req.body.enabled, restartRequired: true } });
    }
  );

  router.post('/integrations/traccar/positions', express.json({ limit: '100kb' }), (req, res) => {
    if (process.env.TRACCAR_ENABLED !== 'true')
      return res.status(503).json({ error: 'Integração Traccar desativada.' });
    if (!traccar.authorize(req.get('authorization') || req.get('x-traccar-secret')))
      return res.status(401).json({ error: 'Credencial Traccar inválida.' });
    let normalized;
    try {
      normalized = traccar.normalize(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (!normalized.ok) return res.status(400).json({ error: normalized.error });
    const binding = database
      .prepare("SELECT * FROM tracker_bindings WHERE external_id_hash=? AND status='ACTIVE'")
      .get(normalized.externalIdHash);
    if (!binding) return res.status(404).json({ error: 'Rastreador não vinculado.' });
    const duplicate = database
      .prepare('SELECT 1 FROM tracker_ingestion_events WHERE event_key=?')
      .get(normalized.eventKey);
    if (duplicate) return res.status(200).json({ accepted: true, duplicate: true });
    const tracking = database
      .prepare(
        "SELECT id FROM tracking_sessions WHERE user_id=? AND closed_at IS NULL AND (expires_at IS NULL OR expires_at>?) AND json_extract(vehicle_json,'$.id')=? ORDER BY created_at DESC LIMIT 1"
      )
      .get(binding.user_id, Date.now(), binding.vehicle_id);
    if (!tracking)
      return res.status(409).json({ error: 'Nenhuma sessão ativa para o veículo vinculado.' });
    const point = normalized.point,
      sequence = Number.parseInt(
        crypto.createHash('sha256').update(normalized.eventKey).digest('hex').slice(0, 12),
        16
      ),
      now = Date.now(),
      deviceId = `TRACCAR-${binding.id.slice(0, 8)}`;
    const publicPoint = { ...point, deviceId, source: 'traccar', sequence, capturedOffline: false };
    database.transaction(() => {
      database
        .prepare(
          'INSERT INTO tracker_ingestion_events (event_key,binding_id,captured_at,telemetry_json,received_at) VALUES (?,?,?,?,?)'
        )
        .run(
          normalized.eventKey,
          binding.id,
          point.timestamp,
          JSON.stringify({
            ignition: point.ignition,
            battery: point.battery,
            network: point.network,
            event: point.event
          }),
          now
        );
      database
        .prepare(
          "INSERT OR IGNORE INTO positions (tracking_session_id,device_id,latitude,longitude,accuracy,speed,heading,altitude,altitude_accuracy,captured_at,received_at,source,captured_offline,sequence_number,accuracy_class,suspicious,suspicion_reason) VALUES (?,?,?,?,?,?,?,?,NULL,?,?,'traccar',0,?,?,0,NULL)"
        )
        .run(
          tracking.id,
          deviceId,
          point.latitude,
          point.longitude,
          point.accuracy,
          point.speed,
          point.heading,
          point.altitude,
          point.timestamp,
          now,
          sequence,
          point.accuracy <= 10
            ? 'Excelente'
            : point.accuracy <= 30
              ? 'Boa'
              : point.accuracy <= 100
                ? 'Regular'
                : 'Baixa'
        );
      database
        .prepare('UPDATE tracker_bindings SET last_seen_at=?,updated_at=? WHERE id=?')
        .run(now, now, binding.id);
    })();
    evaluateHardwareSpeed(database, io, tracking, binding, point);
    const runtime = sessions?.get?.(tracking.id);
    if (runtime) {
      runtime.positions.push(publicPoint);
      if (runtime.positions.length > 10000) runtime.positions.shift();
    }
    io?.to?.(tracking.id)?.emit?.('position:update', publicPoint);
    res.status(202).json({ accepted: true, duplicate: false, source: 'traccar' });
  });

  return router;
}

module.exports = {
  createPlatformRouter,
  cleanText,
  safePhoto,
  expireReports,
  reportLifetime,
  FUEL_TYPES,
  REPORT_CATEGORIES,
  NOTIFICATION_TYPES
};
