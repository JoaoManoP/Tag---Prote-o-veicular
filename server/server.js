'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { createDatabase, createSessionStore } = require('./database');
const { normalizeEmail, validateRegistration, requireAuth, hashPassword, verifyPassword } = require('./auth');
require('dotenv').config();

const sessions = new Map();
const ttlMs = Math.max(1, Number(process.env.SESSION_TTL_MINUTES) || 120) * 60000;
const PBE_MODELS = [
  { id: 'manual', brand: 'Outro', model: 'Preenchimento manual', version: '—', engine: '—', transmission: '—', fuel: 'Flex', city: 10, road: 12, source: 'manual' },
  { id: 'onix-10-mt', brand: 'Chevrolet', model: 'Onix', version: '1.0 MT', engine: '1.0', transmission: 'Manual', fuel: 'Flex (gasolina)', city: 13.3, road: 16.5, tank: 44, source: 'PBE Veicular/Inmetro — valor demonstrativo; confirme o ano/modelo no PBE vigente' },
  { id: 'hb20-10-mt', brand: 'Hyundai', model: 'HB20', version: 'Comfort 1.0 MT', engine: '1.0', transmission: 'Manual', fuel: 'Flex (gasolina)', city: 13.3, road: 15.4, tank: 50, source: 'PBE Veicular/Inmetro — valor demonstrativo; confirme o ano/modelo no PBE vigente' },
  { id: 'corolla-20-cvt', brand: 'Toyota', model: 'Corolla', version: '2.0 CVT', engine: '2.0', transmission: 'CVT', fuel: 'Flex (gasolina)', city: 11.9, road: 14.5, tank: 50, source: 'PBE Veicular/Inmetro — valor demonstrativo; confirme o ano/modelo no PBE vigente' }
];

function optional(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }
function safePosition(value) {
  if (!value || !Number.isFinite(Number(value.latitude)) || !Number.isFinite(Number(value.longitude))) return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude, accuracy: Math.max(0, optional(value.accuracy) ?? 0), speed: optional(value.speed), heading: optional(value.heading), altitude: optional(value.altitude), timestamp: optional(value.timestamp) ?? Date.now(), source: value.source === 'simulation' ? 'simulation' : 'gps', capturedOffline: Boolean(value.capturedOffline), sequence: optional(value.sequence) };
}
function validCoordPair(text) { const parts = String(text || '').split(',').map(Number); return parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && Math.abs(parts[1]) <= 90 && Math.abs(parts[0]) <= 180 ? parts : null; }
function safeJson(value, fallback = null) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function validateVehicle(value) {
  if (!value || typeof value !== 'object') return null;
  const text = (field, max) => typeof value[field] === 'string' ? value[field].trim().slice(0, max) : '';
  const number = (field, min, max) => { const parsed = Number(value[field]); return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null; };
  const vehicle = { nickname: text('nickname', 60), plate: text('plate', 10).toUpperCase(), brand: text('brand', 60), model: text('model', 80), year: number('year', 1950, 2100), version: text('version', 80), engine: text('engine', 40), transmission: text('transmission', 40), fuel: text('fuel', 40), city: number('city', 1, 100), road: number('road', 1, 100), tank: number('tank', 1, 300), price: number('price', 0, 100) };
  return vehicle.nickname && vehicle.brand && vehicle.model && vehicle.city && vehicle.road && vehicle.tank ? vehicle : null;
}
function publicSession(value) { return { id: value.id, createdAt: value.createdAt, closed: value.closed, phoneConnected: value.phoneSockets.size > 0, positions: value.positions, vehicle: value.vehicle, trip: value.trip, interruptions: value.interruptions }; }
async function fetchJson(url) { const response = await fetch(url, { headers: { 'User-Agent': 'RastroDemo/1.0 (local educational demo)', 'Accept-Language': 'pt-BR,pt;q=0.9' }, signal: AbortSignal.timeout(12000) }); if (!response.ok) throw new Error(`Serviço externo respondeu ${response.status}`); return response.json(); }

function createApplication(options = {}) {
  const database = options.database || createDatabase(options.databasePath);
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: false } });
  const publicDir = path.join(__dirname, '..', 'public');
  const configuredSecret = options.sessionSecret || process.env.SESSION_SECRET;
  if (!configuredSecret && process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET é obrigatório em produção.');
  const sessionSecret = configuredSecret || crypto.randomBytes(32).toString('hex');
  if (!configuredSecret && !options.silent) console.warn('AVISO: SESSION_SECRET temporário. Configure o .env para manter logins após reinícios.');
  const sessionMiddleware = session({ name: 'rastro.sid', secret: sessionSecret, store: createSessionStore(session, database), resave: false, saveUninitialized: false, rolling: true, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 } });
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde alguns minutos.' } });

  const hydrateSession = (row) => ({ id: row.id, ownerId: row.user_id, createdAt: row.created_at, closed: Boolean(row.closed_at), positions: database.prepare('SELECT latitude, longitude, accuracy, speed, heading, altitude, captured_at AS timestamp, source, captured_offline AS capturedOffline, sequence_number AS sequence FROM positions WHERE tracking_session_id = ? ORDER BY captured_at LIMIT 10000').all(row.id), phoneSockets: new Set(), vehicle: safeJson(row.vehicle_json), trip: safeJson(row.trip_json), interruptions: database.prepare('SELECT lost_at AS lostAt, reconnected_at AS reconnectedAt, duration_ms AS duration, point_count AS pointCount, classification FROM interruptions WHERE tracking_session_id = ? ORDER BY reconnected_at').all(row.id) });
  for (const row of database.prepare('SELECT * FROM tracking_sessions WHERE closed_at IS NULL AND created_at > ?').all(Date.now() - ttlMs)) sessions.set(row.id, hydrateSession(row));
  const ownedSession = (id, userId) => { const tracking = sessions.get(id); return tracking && tracking.ownerId === userId && !tracking.closed ? tracking : null; };

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'https://*.openstreetmap.org'], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], connectSrc: ["'self'", 'ws:', 'wss:'] } }, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '50kb', strict: true }));
  app.use(sessionMiddleware);
  app.use('/css', express.static(path.join(publicDir, 'css')));
  app.use('/js', express.static(path.join(publicDir, 'js')));
  app.use('/vendor/leaflet', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist')));
  app.get('/login.html', (req, res) => req.session.userId ? res.redirect('/') : res.sendFile(path.join(publicDir, 'login.html')));
  app.get('/register.html', (req, res) => req.session.userId ? res.redirect('/') : res.sendFile(path.join(publicDir, 'register.html')));
  app.get('/mobile.html', (_req, res) => res.sendFile(path.join(publicDir, 'mobile.html')));
  app.get('/', (req, res) => req.session.userId ? res.sendFile(path.join(publicDir, 'index.html')) : res.redirect('/login.html'));

  app.get('/api/health', (_req, res) => res.json({ ok: true, database: 'connected', sessions: sessions.size }));
  app.post('/api/auth/register', authLimiter, async (req, res, next) => { try { const validation = validateRegistration(req.body); if (!validation.valid) return res.status(400).json({ error: validation.errors[0], errors: validation.errors }); const exists = database.prepare('SELECT id FROM users WHERE email = ?').get(validation.data.email); if (exists) return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' }); const passwordHash = await hashPassword(validation.data.password); const result = database.prepare('INSERT INTO users (name, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(validation.data.name, validation.data.email, validation.data.phone || null, passwordHash, Date.now()); req.session.regenerate((error) => { if (error) return next(error); req.session.userId = Number(result.lastInsertRowid); req.session.save((saveError) => saveError ? next(saveError) : res.status(201).json({ user: { id: Number(result.lastInsertRowid), name: validation.data.name, email: validation.data.email } })); }); } catch (error) { next(error); } });
  app.post('/api/auth/login', authLimiter, async (req, res, next) => { try { const email = normalizeEmail(req.body?.email); const password = typeof req.body?.password === 'string' ? req.body.password : ''; if (!email || password.length > 72) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' }); const user = database.prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?').get(email); const valid = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password || 'invalid', '$2b$12$1Qn4A9lMMSv2zImlw6vV6eVYZ8jAlZLRQOGvT/ivKp8XzpAGMmZ2W'); if (!user || !valid) return res.status(401).json({ error: 'E-mail ou senha inválidos.' }); req.session.regenerate((error) => { if (error) return next(error); req.session.userId = user.id; req.session.save((saveError) => saveError ? next(saveError) : res.json({ user: { id: user.id, name: user.name, email: user.email } })); }); } catch (error) { next(error); } });
  app.get('/api/auth/me', requireAuth, (req, res) => { const user = database.prepare('SELECT id, name, email, phone, created_at AS createdAt FROM users WHERE id = ?').get(req.session.userId); if (!user) return req.session.destroy(() => res.status(401).json({ error: 'Sessão inválida.' })); res.json({ user }); });
  app.post('/api/auth/logout', requireAuth, (req, res, next) => req.session.destroy((error) => { if (error) return next(error); res.clearCookie('rastro.sid'); res.status(204).end(); }));

  app.get('/api/vehicles/reference', requireAuth, (_req, res) => res.json(PBE_MODELS));
  app.get('/api/geocode', requireAuth, async (req, res) => { try { const query = typeof req.query.q === 'string' ? req.query.q.trim() : ''; if (query.length < 3 || query.length > 160) return res.status(400).json({ error: 'Informe entre 3 e 160 caracteres.' }); const data = await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=br&q=${encodeURIComponent(query)}`); res.json(data.map((item) => ({ label: String(item.display_name).slice(0, 300), latitude: Number(item.lat), longitude: Number(item.lon), type: String(item.type).slice(0, 40) }))); } catch { res.status(502).json({ error: 'Busca de endereços indisponível no momento.' }); } });
  app.get('/api/route', requireAuth, async (req, res) => { try { const from = validCoordPair(req.query.from); const to = validCoordPair(req.query.to); if (!from || !to) return res.status(400).json({ error: 'Coordenadas inválidas.' }); const coordinates = `${from.join(',')};${to.join(',')}`; const data = await fetchJson(`https://router.project-osrm.org/route/v1/driving/${coordinates}?alternatives=3&overview=full&geometries=geojson&steps=false`); if (data.code !== 'Ok' || !data.routes?.length) return res.status(404).json({ error: 'Nenhuma rota rodoviária encontrada.' }); res.json({ source: 'OSRM/OpenStreetMap', routes: data.routes.slice(0, 3).map((route, index) => ({ id: index, primary: index === 0, distance: route.distance, duration: route.duration, geometry: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]) })) }); } catch { res.status(502).json({ error: 'Roteamento rodoviário indisponível no momento.' }); } });
  app.post('/api/sessions', requireAuth, async (req, res, next) => { try { const vehicle = validateVehicle(req.body?.vehicle); if (!vehicle) return res.status(400).json({ error: 'Perfil do veículo inválido.' }); const id = crypto.randomBytes(16).toString('hex'); const tracking = { id, ownerId: req.session.userId, createdAt: Date.now(), closed: false, positions: [], phoneSockets: new Set(), vehicle, trip: null, interruptions: [] }; database.prepare('INSERT INTO tracking_sessions (id, user_id, vehicle_json, created_at) VALUES (?, ?, ?, ?)').run(id, tracking.ownerId, JSON.stringify(vehicle), tracking.createdAt); sessions.set(id, tracking); const baseUrl = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, ''); const mobileUrl = `${baseUrl}/mobile.html?session=${encodeURIComponent(id)}`; const qrCode = await QRCode.toDataURL(mobileUrl, { width: 300, margin: 1 }); res.status(201).json({ ...publicSession(tracking), mobileUrl, qrCode }); } catch (error) { next(error); } });
  app.get('/api/sessions/:id', requireAuth, (req, res) => { const tracking = ownedSession(req.params.id, req.session.userId); if (!tracking) return res.status(404).json({ error: 'Sessão não encontrada.' }); res.json(publicSession(tracking)); });

  io.engine.use(sessionMiddleware);
  io.on('connection', (socket) => {
    socket.on('session:join', ({ sessionId, role } = {}, acknowledge = () => {}) => { const tracking = sessions.get(typeof sessionId === 'string' ? sessionId : ''); if (!tracking || tracking.closed || !['dashboard', 'mobile'].includes(role)) return acknowledge({ ok: false, error: 'Sessão inválida ou encerrada.' }); if (role === 'dashboard' && socket.request.session?.userId !== tracking.ownerId) return acknowledge({ ok: false, error: 'Acesso não autorizado.' }); socket.data.sessionId = tracking.id; socket.data.role = role; socket.join(tracking.id); if (role === 'mobile') tracking.phoneSockets.add(socket.id); io.to(tracking.id).emit('session:status', { phoneConnected: tracking.phoneSockets.size > 0 }); acknowledge({ ok: true, session: publicSession(tracking) }); });
    const savePosition = (tracking, position) => { database.prepare('INSERT INTO positions (tracking_session_id, latitude, longitude, accuracy, speed, heading, altitude, captured_at, source, captured_offline, sequence_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(tracking.id, position.latitude, position.longitude, position.accuracy, position.speed, position.heading, position.altitude, position.timestamp, position.source, position.capturedOffline ? 1 : 0, position.sequence); tracking.positions.push(position); if (tracking.positions.length > 10000) tracking.positions.shift(); io.to(tracking.id).emit('position:update', position); };
    socket.on('position:update', (payload = {}, acknowledge = () => {}) => { const tracking = sessions.get(socket.data.sessionId); if (!tracking || tracking.closed) return acknowledge({ ok: false, error: 'Sessão encerrada.' }); if (socket.data.role !== 'mobile' && (socket.data.role !== 'dashboard' || socket.request.session?.userId !== tracking.ownerId || payload.source !== 'simulation')) return acknowledge({ ok: false, error: 'Origem não autorizada.' }); const position = safePosition(payload); if (!position) return acknowledge({ ok: false, error: 'Posição inválida.' }); savePosition(tracking, position); acknowledge({ ok: true }); });
    socket.on('positions:batch', (payload = {}, acknowledge = () => {}) => { const tracking = sessions.get(socket.data.sessionId); if (!tracking || tracking.closed || socket.data.role !== 'mobile') return acknowledge({ ok: false, error: 'Sessão indisponível.' }); const points = Array.isArray(payload.points) ? payload.points.slice(0, 2000).map(safePosition).filter(Boolean).sort((a, b) => a.timestamp - b.timestamp) : []; const transaction = database.transaction(() => points.forEach((position) => { position.capturedOffline = true; savePosition(tracking, position); })); transaction(); const gap = { lostAt: optional(payload.lostAt), reconnectedAt: Date.now(), duration: payload.lostAt ? Date.now() - Number(payload.lostAt) : null, pointCount: points.length, classification: points.length >= 3 ? 'Confirmado: coordenadas GPS armazenadas localmente' : points.length ? 'Reconstruído com média confiança' : 'Pendente de reconstrução' }; database.prepare('INSERT INTO interruptions (tracking_session_id, lost_at, reconnected_at, duration_ms, point_count, classification) VALUES (?, ?, ?, ?, ?, ?)').run(tracking.id, gap.lostAt, gap.reconnectedAt, gap.duration, gap.pointCount, gap.classification); tracking.interruptions.push(gap); io.to(tracking.id).emit('offline:recovered', gap); acknowledge({ ok: true, received: points.length, gap }); });
    socket.on('trip:update', (trip = {}, acknowledge = () => {}) => { const tracking = sessions.get(socket.data.sessionId); if (!tracking || socket.data.role !== 'dashboard' || socket.request.session?.userId !== tracking.ownerId) return acknowledge({ ok: false }); const allowed = { startedAt: optional(trip.startedAt), route: trip.route && typeof trip.route === 'object' ? trip.route : null, vehicle: validateVehicle(trip.vehicle) }; tracking.trip = allowed; database.prepare('UPDATE tracking_sessions SET trip_json = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(allowed), tracking.id, tracking.ownerId); io.to(tracking.id).emit('trip:update', tracking.trip); acknowledge({ ok: true }); });
    socket.on('history:clear', () => { const tracking = sessions.get(socket.data.sessionId); if (tracking && socket.data.role === 'dashboard' && socket.request.session?.userId === tracking.ownerId) { database.prepare('DELETE FROM positions WHERE tracking_session_id = ?').run(tracking.id); database.prepare('DELETE FROM interruptions WHERE tracking_session_id = ?').run(tracking.id); tracking.positions = []; tracking.interruptions = []; io.to(tracking.id).emit('history:cleared'); } });
    socket.on('session:close', () => { const tracking = sessions.get(socket.data.sessionId); if (tracking && socket.data.role === 'dashboard' && socket.request.session?.userId === tracking.ownerId) { tracking.closed = true; database.prepare('UPDATE tracking_sessions SET closed_at = ? WHERE id = ? AND user_id = ?').run(Date.now(), tracking.id, tracking.ownerId); io.to(tracking.id).emit('session:closed'); setTimeout(() => sessions.delete(tracking.id), 10000).unref(); } });
    socket.on('disconnect', () => { const tracking = sessions.get(socket.data.sessionId); if (tracking && socket.data.role === 'mobile') { tracking.phoneSockets.delete(socket.id); io.to(tracking.id).emit('session:status', { phoneConnected: tracking.phoneSockets.size > 0 }); } });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint não encontrado.' }));
  app.use((error, _req, res, _next) => { console.error(error.name, error.message); res.status(500).json({ error: 'Erro interno.' }); });
  const cleanup = setInterval(() => { const now = Date.now(); database.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(now); for (const [id, tracking] of sessions) if (tracking.closed || now - tracking.createdAt > ttlMs) sessions.delete(id); }, 60000); cleanup.unref();
  const close = () => { clearInterval(cleanup); io.close(); database.close(); };
  return { app, server, io, database, close };
}

if (require.main === module) { const { server } = createApplication(); const port = Number(process.env.PORT) || 3000; const host = process.env.HOST || '0.0.0.0'; server.listen(port, host, () => console.log(`Rastro Demo disponível em http://localhost:${port} (rede local: ${host}:${port})`)); }
module.exports = { createApplication, sessions, safePosition, validCoordPair, validateVehicle, PBE_MODELS };
