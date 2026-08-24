'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApplication, sessions, safePosition, normalizePositionBatch, insertPosition, validCoordPair, parsePoiRoute, applyDataRetention, validateProductionConfig } = require('../server/server');
const { VehicleEfficiencyProvider, estimateConsumption } = require('../server/vehicle-efficiency');
const { VehicleRegistryError, PlateLookupProvider, AutoDevVehicleImageProvider, FipePriceProvider, PhotonGeocodingProvider, NominatimGeocodingProvider, MapboxGeocodingProvider, OsrmRouteProvider, GoogleRouteProvider, decodePolyline } = require('../server/providers');
const { rankReconstructionCandidates, classificationFor, MapMatchingProvider } = require('../server/reconstruction');
const { validateSchedule, isWithinSchedule } = require('../server/schedule');
const { validateGeofence, classifyCirclePosition, classifyPolygonPosition, nextGeofenceState } = require('../server/geofence');
const { calculateSafeScore } = require('../server/gamification');
const { RoadEventService, categoryFor } = require('../server/road-events');

test('preferências de tour e diagnósticos simulados são persistidos separadamente', async (t) => {
  const { app, database } = setup(t);
  const agent = request.agent(app);
  await register(agent).expect(201);
  const saved = await agent.post('/api/vehicles').send({ ...vehicle, type: 'car', dataSource: 'manual' }).expect(201);
  await agent.put('/api/tour-preferences/tracking').send({ completed: true }).expect(200);
  const preferences = await agent.get('/api/tour-preferences').expect(200);
  assert.equal(preferences.body.preferences[0].tourKey, 'tracking');
  await agent.put('/api/vehicle-health/simulation').send({ vehicleId: saved.body.vehicle.id, events: [{ type: 'ABS_WARNING', severity: 'WARNING', detectedAt: 100 }] }).expect(200);
  const health = await agent.get(`/api/vehicle-health?vehicleId=${saved.body.vehicle.id}`).expect(200);
  assert.equal(health.body.events[0].source, 'SIMULATION');
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM alerts').get().total, 0);
});

test('Casa e Trabalho são salvos sem expor coordenadas na resposta', async (t) => {
  const { app } = setup(t);
  const agent = request.agent(app);
  await register(agent).expect(201);
  const saved = await agent.put('/api/saved-places/home').send({ address: 'Rua das Flores, Timóteo - MG', latitude: -19.58, longitude: -42.64 }).expect(200);
  assert.equal(saved.body.place.label, 'Casa');
  assert.equal('latitude' in saved.body.place, false);
  const listed = await agent.get('/api/saved-places').expect(200);
  assert.equal(listed.body.places[0].placeKey, 'home');
});

test('cerco personalizado aceita polígono e pode ser pausado', async (t) => {
  const { app }=setup(t),agent=request.agent(app);await register(agent).expect(201);const saved=await agent.post('/api/vehicles').send({...vehicle,type:'car',dataSource:'manual'}).expect(201);
  const points=[{latitude:-19.58,longitude:-42.64},{latitude:-19.58,longitude:-42.63},{latitude:-19.57,longitude:-42.63}];
  const created=await agent.post(`/api/vehicles/${saved.body.vehicle.id}/polygon-geofences`).send({name:'Área personalizada',points}).expect(201);assert.equal(created.body.geofence.type,'polygon');
  await agent.patch(`/api/geofences/${created.body.geofence.id}/status`).send({enabled:false}).expect(200);
  const listed=await agent.get(`/api/vehicles/${saved.body.vehicle.id}/geofences`).expect(200);assert.equal(listed.body.geofences[0].enabled,false);
  assert.equal(classifyPolygonPosition({latitude:-19.579,longitude:-42.635,accuracy:5},{centerLat:-19.577,centerLng:-42.633,points}).state,'inside');
});

const vehicle = { nickname: 'Carro teste', plate: 'ABC1D23', brand: 'Marca', model: 'Modelo', year: 2024, version: '1.0', engine: '1.0', transmission: 'Manual', fuel: 'Gasolina', city: 10, road: 14, tank: 45, price: 6.19 };
function setup(t, options = {}) { sessions.clear(); const context = createApplication({ databasePath: ':memory:', sessionSecret: 'test-secret-with-at-least-32-characters', silent: true, ...options }); t.after(() => { sessions.clear(); context.database.close(); }); return context; }
function register(agent, overrides = {}) { return agent.post('/api/auth/register').send({ name: 'Usuário Teste', email: 'teste@example.com', password: 'Senha123', ...overrides }); }

test('health check confirma API e banco', async (t) => { const { app } = setup(t); const response = await request(app).get('/api/health').expect(200); assert.equal(response.body.database, 'connected'); });
test('CSP permite assets HTTP na rede local e exige upgrade em produção',async(t)=>{const development=setup(t,{enforceHttpsResources:false});const devResponse=await request(development.app).get('/').expect(200);assert.doesNotMatch(devResponse.headers['content-security-policy']||'',/upgrade-insecure-requests/);const production=setup(t,{enforceHttpsResources:true});const prodResponse=await request(production.app).get('/').expect(200);assert.match(prodResponse.headers['content-security-policy']||'',/upgrade-insecure-requests/)});
test('CSP permite os recursos necessários dos mapas sem liberar origens genéricas',async(t)=>{const{app}=setup(t);const response=await request(app).get('/dashboard').expect(302);const policy=response.headers['content-security-policy']||'';assert.match(policy,/connect-src[^;]*https:\/\/tile\.openstreetmap\.org/);assert.match(policy,/https:\/\/api\.mapbox\.com/);assert.match(policy,/https:\/\/\*\.tiles\.mapbox\.com/);assert.match(policy,/https:\/\/events\.mapbox\.com/);assert.doesNotMatch(policy,/connect-src[^;]*\shttps:\s/)});
test('configuração do mapa gera tiles Mapbox compatíveis com MapLibre', async (t) => { const previous={MAP_PROVIDER:process.env.MAP_PROVIDER,MAP_STYLE_URL:process.env.MAP_STYLE_URL,MAPBOX_ACCESS_TOKEN:process.env.MAPBOX_ACCESS_TOKEN};process.env.MAP_PROVIDER='mapbox';process.env.MAP_STYLE_URL='mapbox://styles/mapbox/navigation-day-v1';process.env.MAPBOX_ACCESS_TOKEN='pk.test-token';t.after(()=>{for(const [key,value] of Object.entries(previous))value===undefined?delete process.env[key]:process.env[key]=value});const { app }=setup(t);const response=await request(app).get('/map-config.js').expect(200);assert.match(response.text,/"provider":"mapbox"/);assert.match(response.text,/"type":"raster"/);assert.doesNotMatch(response.text,/tile\.openstreetmap\.org/);assert.match(response.text,/api\.mapbox\.com\/styles\/v1\/mapbox\/navigation-day-v1\/tiles\/512/);assert.match(response.text,/access_token=pk\.test-token/);});
test('todas as respostas recebem identificador de requisição rastreável', async (t) => { const { app }=setup(t);const generated=await request(app).get('/api/health').expect(200);assert.match(generated.headers['x-request-id'],/^[0-9a-f-]{36}$/);const supplied=await request(app).get('/api/health').set('X-Request-Id','teste-request-123').expect(200);assert.equal(supplied.headers['x-request-id'],'teste-request-123'); });
test('readiness e áreas restritas aplicam papéis no backend', async (t) => { const { app,database }=setup(t);await request(app).get('/api/ready').expect(200,{status:'ready'});const user=request.agent(app);await register(user).expect(201);await user.get('/api/admin/overview').expect(403);await user.get('/api/lab/info').expect(403);database.prepare("UPDATE users SET role='ADMIN' WHERE email=?").run('teste@example.com');await user.get('/api/admin/overview').expect(200);database.prepare("UPDATE users SET role='DEVELOPER' WHERE email=?").run('teste@example.com');await user.get('/api/lab/info').expect(200);await user.post('/api/lab/telemetry/validate').send({deviceId:'LAB-VIRTUAL-TAG',timestamp:Date.now(),latitude:-19.9,longitude:-43.9,accuracy:8,source:'simulation',sequence:1}).expect(200); });
test('cadastro cria usuário, hash e sessão autenticada', async (t) => { const { app, database } = setup(t); const agent = request.agent(app); await register(agent).expect(201); const row = database.prepare('SELECT email, password_hash FROM users').get(); assert.equal(row.email, 'teste@example.com'); assert.notEqual(row.password_hash, 'Senha123'); assert.match(row.password_hash, /^\$2[aby]\$/); await agent.get('/api/auth/me').expect(200); });
test('cadastro persiste o plano escolhido e ignora plano inválido', async (t) => { const { app, database } = setup(t); const family = request.agent(app); const response = await register(family, { email: 'familia@example.com', plan: 'familia' }).expect(201); assert.equal(response.body.subscription.plan, 'familia'); assert.equal(database.prepare('SELECT subscription_plan AS plan FROM users WHERE email = ?').get('familia@example.com').plan, 'familia'); const fallback = request.agent(app); await register(fallback, { email: 'fallback@example.com', plan: 'premium-inexistente' }).expect(201); assert.equal(database.prepare('SELECT subscription_plan AS plan FROM users WHERE email = ?').get('fallback@example.com').plan, 'inteligente'); });
test('cadastro rejeita entrada inválida e e-mail duplicado', async (t) => { const { app } = setup(t); const agent = request.agent(app); await register(agent, { password: 'fraca' }).expect(400); await register(agent).expect(201); await request(app).post('/api/auth/register').send({ name: 'Outro', email: 'TESTE@example.com', password: 'Outra123' }).expect(409); });
test('login rejeita senha incorreta e aceita credenciais corretas', async (t) => { const { app } = setup(t); await register(request.agent(app)).expect(201); await request(app).post('/api/auth/login').send({ email: 'teste@example.com', password: 'Errada123' }).expect(401); const agent = request.agent(app); await agent.post('/api/auth/login').send({ email: 'teste@example.com', password: 'Senha123' }).expect(200); await agent.get('/api/auth/me').expect(200); });
test('logout revoga sessão', async (t) => { const { app } = setup(t); const agent = request.agent(app); await register(agent).expect(201); await agent.post('/api/auth/logout').expect(204); await agent.get('/api/auth/me').expect(401); });
test('troca de senha exige CSRF e revoga as outras sessões',async(t)=>{const{app}=setup(t),primary=request.agent(app),other=request.agent(app);await register(primary).expect(201);await other.post('/api/auth/login').send({email:'teste@example.com',password:'Senha123'}).expect(200);await primary.put('/api/auth/password').send({currentPassword:'Senha123',newPassword:'NovaSenha456'}).expect(403);const csrf=(await primary.get('/api/auth/csrf').expect(200)).body.token;await primary.put('/api/auth/password').set('X-CSRF-Token',csrf).send({currentPassword:'Senha123',newPassword:'fraca'}).expect(400);await primary.put('/api/auth/password').set('X-CSRF-Token',csrf).send({currentPassword:'Senha123',newPassword:'NovaSenha456'}).expect(204);await primary.get('/api/auth/me').expect(200);await other.get('/api/auth/me').expect(401);await request(app).post('/api/auth/login').send({email:'teste@example.com',password:'Senha123'}).expect(401);await request(app).post('/api/auth/login').send({email:'teste@example.com',password:'NovaSenha456'}).expect(200)});
test('home é pública, mas painel e API negam usuário não autenticado', async (t) => { const { app } = setup(t); await request(app).get('/').expect(200); await request(app).get('/dashboard').expect(302).expect('Location', '/login.html'); await request(app).get('/api/vehicles/reference').expect(401); await request(app).post('/api/sessions').send({ vehicle }).expect(401); });
test('sessão de rastreamento é persistida e isolada por proprietário', async (t) => { const { app, database } = setup(t); const owner = request.agent(app); const stranger = request.agent(app); await register(owner).expect(201); await register(stranger, { email: 'outro@example.com' }).expect(201); const created = await owner.post('/api/sessions').send({ vehicle }).expect(201); assert.match(created.body.qrCode, /^data:image\/png;base64,/); assert.equal(database.prepare('SELECT COUNT(*) AS total FROM tracking_sessions').get().total, 1); await owner.get(`/api/sessions/${created.body.id}`).expect(200); await stranger.get(`/api/sessions/${created.body.id}`).expect(404); });
test('pareamento manual é autenticado, cria credencial própria e aceita uso único',async(t)=>{const{app,database}=setup(t),owner=request.agent(app);await register(owner).expect(201);const created=await owner.post('/api/sessions').send({vehicle}).expect(201);assert.match(created.body.pairingCode,/^[A-Z0-9]{8}$/);const resolved=await owner.get(`/api/pairings/resolve?code=${created.body.pairingCode}`).expect(200);const paired=await owner.post(`/api/pairings/${resolved.body.pairing.id}/confirm`).send({name:'Android Chrome'}).expect(201);assert.equal(paired.body.sessionId,created.body.id);assert.ok(paired.body.credential);assert.notEqual(database.prepare('SELECT credential_hash AS hash FROM devices').get().hash,paired.body.credential);await owner.post(`/api/pairings/${resolved.body.pairing.id}/confirm`).expect(409);await owner.get(`/api/pairings/resolve?code=${created.body.pairingCode}`).expect(409)});
test('outro usuário não reivindica pareamento nem dispositivo',async(t)=>{const{app}=setup(t),owner=request.agent(app),other=request.agent(app);await register(owner).expect(201);await register(other,{email:'outro@example.com'}).expect(201);const created=await owner.post('/api/sessions').send({vehicle}).expect(201);await other.get(`/api/pairings/resolve?code=${created.body.pairingCode}`).expect(403)});
test('pareamento expirado e cancelado não pode ser confirmado',async(t)=>{const{app,database}=setup(t),owner=request.agent(app);await register(owner).expect(201);const expired=await owner.post('/api/sessions').send({vehicle}).expect(201);database.prepare('UPDATE pairing_sessions SET expires_at=? WHERE id=?').run(Date.now()-1,expired.body.pairingId);await owner.get(`/api/pairings/resolve?code=${expired.body.pairingCode}`).expect(410);const cancelled=await owner.post('/api/sessions').send({vehicle}).expect(201);await owner.delete(`/api/pairings/${cancelled.body.pairingId}`).expect(204);await owner.post(`/api/pairings/${cancelled.body.pairingId}/confirm`).expect(409)});
test('valida coordenadas, posições e perfil de veículo', () => { assert.equal(safePosition({ latitude: 91, longitude: 0 }), null); assert.equal(safePosition({ latitude: '-23.5', longitude: '-46.6', accuracy: 12 }).accuracy, 12); assert.deepEqual(validCoordPair('-42.5,-19.4'), [-42.5, -19.4]); assert.equal(validCoordPair('x,20'), null); });
test('corredor de POIs aceita até trinta coordenadas válidas',()=>{assert.deepEqual(parsePoiRoute('-42.5,-19.4;-43,-20'),[[-42.5,-19.4],[-43,-20]]);assert.equal(parsePoiRoute('x,-19'),null);assert.equal(parsePoiRoute(Array.from({length:31},()=>'-42,-19').join(';')),null)});

test('perfil apresenta resumo real da conta autenticada', async (t) => {
  const { app } = setup(t);
  const agent = request.agent(app);
  await register(agent).expect(201);
  const response = await agent.get('/api/profile').expect(200);
  assert.equal(response.body.user.email, 'teste@example.com');
  assert.equal(response.body.plan, 'Plano Inteligente — demonstração');
  assert.equal(response.body.vehicleCount, 0);
  assert.deepEqual(response.body.recentTrips, []);
});

test('titular exporta somente os próprios dados sem credenciais ou tokens',async(t)=>{const{app}=setup(t),owner=request.agent(app),other=request.agent(app);await register(owner).expect(201);await register(other,{email:'outro@example.com'}).expect(201);await owner.post('/api/vehicles').send({...vehicle,type:'car',dataSource:'manual'}).expect(201);await other.post('/api/vehicles').send({...vehicle,plate:'XYZ9Z99',type:'car',dataSource:'manual'}).expect(201);const exported=await owner.get('/api/privacy/export').expect(200);assert.match(exported.headers['content-disposition'],/^attachment;/);assert.equal(exported.body.user.email,'teste@example.com');assert.equal(exported.body.vehicles.length,1);assert.equal(exported.body.vehicles[0].plate,'ABC1D23');const serialized=JSON.stringify(exported.body);assert.doesNotMatch(serialized,/password|tokenHash|mobile_token|auth_sessions|Senha123/i);assert.doesNotMatch(serialized,/XYZ9Z99/)});

test('exclusão de conta exige CSRF, senha e frase e remove dados em cascata',async(t)=>{const{app,database}=setup(t),agent=request.agent(app);await register(agent).expect(201);await agent.post('/api/vehicles').send({...vehicle,type:'car',dataSource:'manual'}).expect(201);await agent.delete('/api/privacy/account').send({password:'Senha123',confirmation:'EXCLUIR MINHA CONTA'}).expect(403);const csrf=(await agent.get('/api/auth/csrf').expect(200)).body.token,del=body=>agent.delete('/api/privacy/account').set('X-CSRF-Token',csrf).send(body);await del({password:'errada',confirmation:'EXCLUIR MINHA CONTA'}).expect(401);await del({password:'Senha123',confirmation:'excluir'}).expect(400);await del({password:'Senha123',confirmation:'EXCLUIR MINHA CONTA'}).expect(204);assert.equal(database.prepare('SELECT COUNT(*) AS total FROM users').get().total,0);assert.equal(database.prepare('SELECT COUNT(*) AS total FROM vehicles').get().total,0);const audit=database.prepare("SELECT actor_user_id,action FROM audit_events WHERE action='ACCOUNT_DELETED'").get();assert.equal(audit.actor_user_id,null);await agent.get('/api/auth/me').expect(401)});

test('retenção remove apenas sessões antigas encerradas ou expiradas',async(t)=>{const{database}=setup(t),now=Date.now();database.prepare("INSERT INTO users (name,email,password_hash,created_at) VALUES ('U','u@e.com','hash',?)").run(now);const insert=database.prepare('INSERT INTO tracking_sessions (id,user_id,created_at,expires_at,closed_at) VALUES (?,1,?,?,?)');insert.run('old-closed',now-100*86400000,now-99*86400000,now-99*86400000);insert.run('old-open',now-100*86400000,now+86400000,null);insert.run('recent-closed',now-5*86400000,now+86400000,now-4*86400000);const result=applyDataRetention(database,{now,days:90});assert.equal(result.deletedSessions,1);assert.deepEqual(database.prepare('SELECT id FROM tracking_sessions ORDER BY id').all().map(row=>row.id),['old-open','recent-closed'])});

test('produção exige segredo forte, HTTPS e chaves dos providers externos',()=>{assert.throws(()=>validateProductionConfig({NODE_ENV:'production',PUBLIC_URL:'http://exemplo.test'},{sessionSecret:'curto'}),/SESSION_SECRET.*HTTPS/);assert.throws(()=>validateProductionConfig({NODE_ENV:'production',PUBLIC_URL:'https://exemplo.test',ROUTE_PROVIDER:'google'},{sessionSecret:'x'.repeat(32)}),/GOOGLE_MAPS_API_KEY/);assert.throws(()=>validateProductionConfig({NODE_ENV:'production',PUBLIC_URL:'https://exemplo.test',MAP_PROVIDER:'mapbox'},{sessionSecret:'x'.repeat(32)}),/MAPBOX_ACCESS_TOKEN/);assert.deepEqual(validateProductionConfig({NODE_ENV:'production',PUBLIC_URL:'https://exemplo.test',ROUTE_PROVIDER:'google',GOOGLE_MAPS_API_KEY:'chave',MAP_PROVIDER:'mapbox',MAPBOX_ACCESS_TOKEN:'pk.test'},{sessionSecret:'x'.repeat(32)}),{valid:true})});

test('veículos possuem CRUD persistente e seleção por proprietário', async (t) => {
  const { app, database } = setup(t);
  const owner = request.agent(app);
  await register(owner).expect(201);
  const created = await owner.post('/api/vehicles').send({ ...vehicle, type: 'car', dataSource: 'manual' }).expect(201);
  assert.equal(created.body.vehicle.nickname, 'Carro teste');
  assert.equal(created.body.vehicle.selected, true);
  await owner.put(`/api/vehicles/${created.body.vehicle.id}`).send({ ...vehicle, nickname: 'Carro atualizado', type: 'car', dataSource: 'manual' }).expect(200);
  const listed = await owner.get('/api/vehicles').expect(200);
  assert.equal(listed.body.vehicles.length, 1);
  assert.equal(listed.body.vehicles[0].nickname, 'Carro atualizado');
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM vehicles').get().total, 1);
});

test('usuário não acessa, altera, seleciona ou remove veículo de outro usuário', async (t) => {
  const { app } = setup(t);
  const owner = request.agent(app);
  const stranger = request.agent(app);
  await register(owner).expect(201);
  await register(stranger, { email: 'outro@example.com' }).expect(201);
  const created = await owner.post('/api/vehicles').send({ ...vehicle, type: 'car', dataSource: 'manual' }).expect(201);
  const id = created.body.vehicle.id;
  await stranger.get(`/api/vehicles/${id}`).expect(404);
  await stranger.put(`/api/vehicles/${id}`).send({ ...vehicle, type: 'car' }).expect(404);
  await stranger.post(`/api/vehicles/${id}/select`).expect(404);
  await stranger.post('/api/sessions').send({ vehicleId: id }).expect(404);
  await owner.post('/api/sessions').send({ vehicleId: id }).expect(201);
  await stranger.delete(`/api/vehicles/${id}`).expect(404);
});

test('provider de eficiência normaliza catálogo e mantém fonte explícita', () => {
  const provider = new VehicleEfficiencyProvider();
  const reference = provider.findById('onix-10-mt');
  assert.equal(reference.brand, 'Chevrolet');
  assert.equal(reference.urbanKmPerLiter, 13.3);
  assert.match(reference.source, /PBE Veicular \/ Inmetro/);
  assert.equal(provider.findById('inexistente'), null);
});

test('consumo separa trechos urbano e rodoviário e retorna faixa transparente', () => {
  const result = estimateConsumption({ distanceMeters: 100000, urbanShare: 0.4, urbanKmPerLiter: 10, highwayKmPerLiter: 15, idleMilliseconds: 3600000, fuelPrice: 6, tankCapacityLiters: 50 });
  assert.equal(result.urbanDistanceKm, 40);
  assert.equal(result.highwayDistanceKm, 60);
  assert.equal(result.urbanLiters, 4);
  assert.equal(result.highwayLiters, 4);
  assert.equal(result.idleLiters, 0.8);
  assert.ok(result.maximumLiters > result.minimumLiters);
  assert.ok(result.maximumTankPercent > result.minimumTankPercent);
  assert.equal(estimateConsumption({ distanceMeters: 1000, urbanKmPerLiter: 0, highwayKmPerLiter: 10 }), null);
});

test('API de consumo exige autenticação e retorna estimativa segmentada', async (t) => {
  const { app } = setup(t);
  const payload = { distanceMeters: 50000, urbanShare: 0.5, urbanKmPerLiter: 10, highwayKmPerLiter: 15, fuelPrice: 6, tankCapacityLiters: 50 };
  await request(app).post('/api/consumption/estimate').send(payload).expect(401);
  const agent = request.agent(app);
  await register(agent).expect(201);
  const response = await agent.post('/api/consumption/estimate').send(payload).expect(200);
  assert.equal(response.body.estimate.urbanDistanceKm, 25);
  assert.equal(response.body.estimate.highwayDistanceKm, 25);
  assert.match(response.body.disclaimer, /estimativas/);
});

test('providers normalizam geocodificação e rota OSRM com mocks', async () => {
  const geocoder = new NominatimGeocodingProvider({ baseUrl:'https://nominatim.internal',fetchImpl: async () => ({ ok: true, json: async () => [{ display_name: 'Timóteo, MG', lat: '-19.58', lon: '-42.64', type: 'city' }] }) });
  const places = await geocoder.search('Timóteo');
  assert.equal(places[0].provider, 'nominatim');
  const router = new OsrmRouteProvider({ fetchImpl: async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 1234, duration: 321, geometry: { coordinates: [[-42.64, -19.58], [-42.5, -19.4]] } }] }) }) });
  const result = await router.calculateRoute({ origin: { latitude: -19.58, longitude: -42.64 }, destination: { latitude: -19.4, longitude: -42.5 } });
  assert.equal(result.routes[0].distanceMeters, 1234);
  assert.deepEqual(result.routes[0].geometry[0], [-19.58, -42.64]);
});

test('Photon normaliza resultados GeoJSON sem exigir chave', async () => {
  let requestedUrl;
  const geocoder = new PhotonGeocodingProvider({ fetchImpl: async url => { requestedUrl=url;return { ok:true,json:async()=>({features:[{geometry:{coordinates:[-42.64,-19.58]},properties:{name:'Timóteo',state:'Minas Gerais',country:'Brasil',type:'city'}}]}) }; } });
  const places=await geocoder.search('Timóteo');
  assert.equal(places[0].provider,'photon');
  assert.equal(places[0].latitude,-19.58);
  assert.match(places[0].label,/Timóteo, Minas Gerais, Brasil/);
  assert.match(requestedUrl,/photon\.komoot\.io\/api/);
});

test('Mapbox normaliza busca direta e reversa usando Geocoding v6', async () => {
  const requested=[];
  const feature={geometry:{coordinates:[-42.64,-19.58]},properties:{feature_type:'place',name:'Timóteo',full_address:'Timóteo, Minas Gerais, Brasil',coordinates:{longitude:-42.64,latitude:-19.58},context:{place:{name:'Timóteo'},region:{name:'Minas Gerais'}}}};
  const geocoder=new MapboxGeocodingProvider({accessToken:'pk.test-token',fetchImpl:async url=>{requested.push(url);return{ok:true,json:async()=>({features:[feature]})}}});
  const places=await geocoder.search('Timóteo');
  const reverse=await geocoder.reverse(-19.58,-42.64);
  assert.equal(places[0].provider,'mapbox');
  assert.equal(places[0].latitude,-19.58);
  assert.equal(reverse.city,'Timóteo');
  assert.match(requested[0],/search\/geocode\/v6\/forward/);
  assert.match(requested[1],/search\/geocode\/v6\/reverse/);
  assert.ok(requested.every(url=>url.includes('access_token=pk.test-token')));
});

test('consulta por placa normaliza somente dados públicos do veículo', async () => {
  let requestOptions;
  const provider=new PlateLookupProvider({token:'token-teste',fetchImpl:async(_url,options)=>{requestOptions=options;return{ok:true,json:async()=>({marca:'Fiat',modelo:'Argo',anoModelo:'2024',combustivel:'Flex',renavam:'segredo',chassi:'segredo'})}}});
  const result=await provider.lookup('ABC1D23');
  assert.deepEqual({plate:result.plate,brand:result.brand,model:result.model,year:result.year,fuel:result.fuel},{plate:'ABC1D23',brand:'Fiat',model:'Argo',year:2024,fuel:'Flex'});
  assert.equal('renavam' in result,false);assert.equal('chassis' in result,false);
  assert.equal(requestOptions.headers.Authorization,'Bearer token-teste');
  assert.deepEqual(JSON.parse(requestOptions.body),{tipo:'agregados-basica',placa:'ABC1D23',homolog:false});
});

test('consulta por placa aceita padrões antigo e Mercosul e mantém campos ausentes nulos',async()=>{
  const calls=[];
  const provider=new PlateLookupProvider({token:'segredo-do-provider',fetchImpl:async(_url,options)=>{calls.push(options);return{ok:true,status:200,json:async()=>({marca:'Ford',modelo:'Ka'})}}});
  const old=await provider.lookup('abc-1234'),mercosul=await provider.lookup('abc-1d23');
  assert.equal(old.plate,'ABC1234');assert.equal(mercosul.plate,'ABC1D23');assert.equal(old.version,null);assert.equal(old.engine,null);assert.equal(old.transmission,null);
  assert.doesNotMatch(JSON.stringify(old),/segredo-do-provider/);assert.equal(calls[0].headers.Authorization,'Bearer segredo-do-provider');
  await assert.rejects(()=>provider.lookup('placa ruim'),error=>error.code==='INVALID_PLATE');
});

test('provider de placa padroniza autenticação, limite, timeout, offline e não encontrado',async()=>{
  const statusCode=new Map([[401,'PROVIDER_AUTH_ERROR'],[403,'PROVIDER_AUTH_ERROR'],[429,'PROVIDER_RATE_LIMIT'],[404,'PLATE_NOT_FOUND'],[500,'PROVIDER_UNAVAILABLE']]);
  for(const [status,code] of statusCode){const provider=new PlateLookupProvider({token:'token',fetchImpl:async()=>({ok:false,status})});await assert.rejects(()=>provider.lookup('ABC1D23'),error=>error.code===code)}
  const timeout=new PlateLookupProvider({token:'token',fetchImpl:async()=>{const error=new Error('timeout');error.name='TimeoutError';throw error}});
  await assert.rejects(()=>timeout.lookup('ABC1D23'),error=>error.code==='PROVIDER_TIMEOUT');
  const offline=new PlateLookupProvider({token:'token',fetchImpl:async()=>{throw new Error('offline')}});
  await assert.rejects(()=>offline.lookup('ABC1D23'),error=>error.code==='PROVIDER_UNAVAILABLE');
  await assert.rejects(()=>new PlateLookupProvider().lookup('ABC1D23'),error=>error.code==='PROVIDER_AUTH_ERROR');
});

test('API de placa retorna códigos estáveis e não bloqueia preenchimento manual',async(t)=>{
  const provider={lookup:async()=>{throw new VehicleRegistryError('PROVIDER_TIMEOUT','timeout')}};
  const{app}=setup(t,{plateLookupProvider:provider}),agent=request.agent(app);await register(agent).expect(201);
  const invalid=await agent.get('/api/vehicles/lookup?plate=123').expect(400);assert.equal(invalid.body.code,'INVALID_PLATE');assert.equal(invalid.body.retryable,false);
  const timeout=await agent.get('/api/vehicles/lookup?plate=ABC1D23').expect(502);assert.equal(timeout.body.code,'PROVIDER_TIMEOUT');assert.equal(timeout.body.retryable,true);
});

test('preço de combustível fica separado do veículo, possui fonte e isolamento',async(t)=>{const{app,database}=setup(t),owner=request.agent(app),other=request.agent(app);await register(owner).expect(201);await register(other,{email:'outro@example.com'}).expect(201);const saved=await owner.post('/api/vehicles').send({...vehicle,type:'car',dataSource:'manual'}).expect(201);assert.equal('price' in saved.body.vehicle,false);assert.equal(database.prepare('SELECT fuel_price FROM vehicles WHERE id=?').get(saved.body.vehicle.id).fuel_price,0);await owner.get('/api/fuel-price?fuelType=Gasolina').expect(200,{preference:null});const updated=await owner.put('/api/fuel-price').send({fuelType:'Gasolina',pricePerLiter:6.49,region:'Vale do Aço'}).expect(200);assert.equal(updated.body.preference.source,'user-provided');assert.equal(updated.body.preference.pricePerLiter,6.49);const own=await owner.get('/api/fuel-price?fuelType=Gasolina').expect(200);assert.equal(own.body.preference.region,'Vale do Aço');await other.get('/api/fuel-price?fuelType=Gasolina').expect(200,{preference:null});await owner.put('/api/fuel-price').send({fuelType:'Gasolina',pricePerLiter:0}).expect(400)});

test('provider FIPE valida código e escolhe o ano correspondente',async()=>{const provider=new FipePriceProvider({fetchImpl:async()=>({ok:true,json:async()=>[{codigoFipe:'001004-9',marca:'Fiat',modelo:'Palio',anoModelo:1998,combustivel:'Gasolina',valor:'R$ 10.000,00',mesReferencia:'agosto de 2026'},{codigoFipe:'001004-9',marca:'Fiat',modelo:'Palio',anoModelo:1999,combustivel:'Gasolina',valor:'R$ 11.000,00',mesReferencia:'agosto de 2026'}]})});const price=await provider.lookup('001004-9',{year:1999});assert.equal(price.value,'R$ 11.000,00');assert.equal(price.modelYear,1999);assert.equal(price.provider,'brasilapi-fipe');await assert.rejects(()=>provider.lookup('invalido'),/Código FIPE inválido/)});

test('provider Auto.dev valida VIN, autentica no header e normaliza fotos',async()=>{
  let captured;
  const provider=new AutoDevVehicleImageProvider({apiKey:'segredo-teste',fetchImpl:async(url,options)=>{
    captured={url,options};
    return {ok:true,json:async()=>({data:{retail:['https://cdn.example/1.webp'],wholesale:[{url:'https://cdn.example/2.jpg'}]}})};
  }});
  const result=await provider.lookup('WP0AF2A99KS165242');
  assert.equal(captured.options.headers.Authorization,'Bearer segredo-teste');
  assert.equal(captured.url.includes('segredo-teste'),false);
  assert.deepEqual(result.photos,['https://cdn.example/1.webp','https://cdn.example/2.jpg']);
  await assert.rejects(()=>provider.lookup('VIN-INVALIDO'),/VIN inválido/);
});

test('API FIPE é autenticada e mantém aviso de valor referencial',async(t)=>{const fipePriceProvider={lookup:async(code,{year})=>({code,modelYear:year,value:'R$ 50.000,00',referenceMonth:'agosto de 2026',provider:'mock-fipe'})},{app}=setup(t,{fipePriceProvider}),agent=request.agent(app);await request(app).get('/api/fipe/001004-9').expect(401);await register(agent).expect(201);const response=await agent.get('/api/fipe/001004-9?year=2020').expect(200);assert.equal(response.body.price.value,'R$ 50.000,00');assert.match(response.body.disclaimer,/referência/);await agent.get('/api/fipe/invalido').expect(400)});

test('catálogo viário filtra por raio e categoria sem devolver a base inteira', (t) => {
  const { database }=setup(t),now=Date.now();
  database.prepare('INSERT INTO road_events (fingerprint,category,label,longitude,latitude,speed_limit,source,imported_at) VALUES (?,?,?,?,?,?,?,?)').run('near','speed_camera','Radar 60',-42.64,-19.58,60,'test',now);
  database.prepare('INSERT INTO road_events (fingerprint,category,label,longitude,latitude,speed_limit,source,imported_at) VALUES (?,?,?,?,?,?,?,?)').run('far','speed_bump','Lombada',-43.64,-20.58,null,'test',now);
  const events=new RoadEventService(database).nearby({latitude:-19.58,longitude:-42.64,radiusMeters:2000,categories:['speed_camera']});
  assert.equal(events.length,1);assert.equal(events[0].speedLimit,60);assert.equal(categoryFor('Pedágio - 0 kmh'),'toll');
});

test('Google Routes mantém chave no header e normaliza ETA com trânsito', async () => {
  let captured;
  const router = new GoogleRouteProvider({ apiKey: 'segredo-teste', fetchImpl: async (url, options) => { captured = { url, options }; return { ok: true, json: async () => ({ routes: [{ distanceMeters: 2000, duration: '180s', staticDuration: '150s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' } }] }) }; } });
  const result = await router.calculateRoute({ origin: { latitude: 1, longitude: 2 }, destination: { latitude: 3, longitude: 4 }, vehicleType: 'motorcycle' });
  assert.equal(captured.options.headers['X-Goog-Api-Key'], 'segredo-teste');
  assert.equal(captured.url.includes('segredo-teste'), false);
  assert.equal(JSON.parse(captured.options.body).travelMode, 'TWO_WHEELER');
  assert.equal(result.routes[0].durationSeconds, 150);
  assert.equal(result.routes[0].durationInTrafficSeconds, 180);
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')[0], [38.5, -120.2]);
});

test('providers rejeitam timeout HTTP, resposta malformada e ausência de rota', async () => {
  const failed = new OsrmRouteProvider({ fetchImpl: async () => ({ ok: false, status: 504 }) });
  await assert.rejects(() => failed.calculateRoute({ origin: { latitude: 0, longitude: 0 }, destination: { latitude: 1, longitude: 1 } }), /504/);
  const malformed = new NominatimGeocodingProvider({ baseUrl:'https://nominatim.internal',fetchImpl: async () => ({ ok: true, json: async () => ({ invalid: true }) }) });
  await assert.rejects(() => malformed.search('consulta'), /inválida/);
  const noRoute = new OsrmRouteProvider({ fetchImpl: async () => ({ ok: true, json: async () => ({ code: 'NoRoute', routes: [] }) }) });
  await assert.rejects(() => noRoute.calculateRoute({ origin: { latitude: 0, longitude: 0 }, destination: { latitude: 1, longitude: 1 } }), /Nenhuma rota/);
});

test('viagem persiste rota planejada separada do percurso GPS e calcula comparação', async (t) => {
  const { app, database } = setup(t);
  const agent = request.agent(app);
  await register(agent).expect(201);
  const savedVehicle = await agent.post('/api/vehicles').send({ ...vehicle, type: 'car', dataSource: 'manual' }).expect(201);
  const tracking = await agent.post('/api/sessions').send({ vehicleId: savedVehicle.body.vehicle.id }).expect(201);
  const plannedRoute = { routeId: 'principal', distanceMeters: 2000, durationSeconds: 600, geometry: [[-19.5, -42.6], [-19.49, -42.59]], provider: 'osrm' };
  const trip = await agent.post('/api/trips').send({ trackingSessionId: tracking.body.id, vehicleId: savedVehicle.body.vehicle.id, plannedRoute, startedAt: 1000 }).expect(201);
  database.prepare('INSERT INTO positions (tracking_session_id, device_id, latitude, longitude, accuracy, captured_at, received_at, source, sequence_number, accuracy_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(tracking.body.id, 'test-device', -19.5, -42.6, 8, 1000, 1000, 'mobile-gps', 1, 'Excelente');
  database.prepare('INSERT INTO positions (tracking_session_id, device_id, latitude, longitude, accuracy, captured_at, received_at, source, sequence_number, accuracy_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(tracking.body.id, 'test-device', -19.49, -42.59, 8, 2000, 2000, 'mobile-gps', 2, 'Excelente');
  const detail = await agent.get(`/api/trips/${trip.body.trip.id}`).expect(200);
  assert.deepEqual(detail.body.trip.plannedRoute.geometry, plannedRoute.geometry);
  assert.equal(detail.body.trip.actualTrack.length, 2);
  assert.ok(detail.body.trip.comparison.actualDistanceMeters > 0);
  assert.equal(detail.body.trip.comparison.plannedDistanceMeters, 2000);
  await agent.patch(`/api/trips/${trip.body.trip.id}/finish`).send({ endedAt: 3000 }).expect(200);
});

test('histórico de viagens é isolado por usuário', async (t) => {
  const { app } = setup(t);
  const owner = request.agent(app);
  const stranger = request.agent(app);
  await register(owner).expect(201);
  await register(stranger, { email: 'estranho@example.com' }).expect(201);
  const savedVehicle = await owner.post('/api/vehicles').send({ ...vehicle, type: 'car', dataSource: 'manual' }).expect(201);
  const tracking = await owner.post('/api/sessions').send({ vehicleId: savedVehicle.body.vehicle.id }).expect(201);
  const created = await owner.post('/api/trips').send({ trackingSessionId: tracking.body.id, vehicleId: savedVehicle.body.vehicle.id, plannedRoute: { distanceMeters: 1000, durationSeconds: 300, geometry: [[0, 0], [0.01, 0.01]] } }).expect(201);
  await stranger.get(`/api/trips/${created.body.trip.id}`).expect(404);
  await stranger.patch(`/api/trips/${created.body.trip.id}/finish`).send({ endedAt: Date.now() }).expect(404);
  const list = await stranger.get('/api/trips').expect(200);
  assert.deepEqual(list.body.trips, []);
});

test('lote offline preserva ordem, timestamp e remove sequências repetidas', () => {
  const points = normalizePositionBatch([
    { latitude: -19.3, longitude: -42.3, accuracy: 8, timestamp: 3000, sequence: 3 },
    { latitude: -19.1, longitude: -42.1, accuracy: 8, timestamp: 1000, sequence: 1 },
    { latitude: -19.2, longitude: -42.2, accuracy: 8, timestamp: 2000, sequence: 2 },
    { latitude: -20, longitude: -43, accuracy: 8, timestamp: 9999, sequence: 2 }
  ]);
  assert.deepEqual(points.map((point) => point.sequence), [1, 2, 3]);
  assert.deepEqual(points.map((point) => point.timestamp), [1000, 2000, 3000]);
});

test('persistência de posição é idempotente por sessão e sequence', (t) => {
  const { database } = setup(t);
  const userId = database.prepare('INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run('Teste', 'idempotente@example.com', 'hash', Date.now()).lastInsertRowid;
  database.prepare('INSERT INTO tracking_sessions (id, user_id, created_at) VALUES (?, ?, ?)').run('tracking-idempotente', userId, Date.now());
  const point = safePosition({ latitude: -19.5, longitude: -42.5, accuracy: 10, timestamp: 1234, sequence: 7, capturedOffline: true });
  assert.equal(insertPosition(database, 'tracking-idempotente', point), true);
  assert.equal(insertPosition(database, 'tracking-idempotente', point), false);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM positions WHERE tracking_session_id = ?').get('tracking-idempotente').total, 1);
});

test('reconstrução classifica candidatos com componentes e pesos transparentes', () => {
  const routes = [
    { routeId: 'plausivel', distanceMeters: 6000, durationSeconds: 600, geometry: [[-19.5, -42.6], [-19.45, -42.55]] },
    { routeId: 'improvavel', distanceMeters: 30000, durationSeconds: 2400, geometry: [[-19.5, -42.6], [-20.5, -43.5]] }
  ];
  const ranked = rankReconstructionCandidates({ routes, gapDurationSeconds: 620, speedBefore: 10, speedAfter: 9, headingBefore: 45, headingAfter: 45, plannedGeometry: routes[0].geometry });
  assert.equal(ranked[0].routeId, 'plausivel');
  assert.ok(ranked[0].confidence > ranked[1].confidence);
  assert.equal(typeof ranked[0].components.temporal, 'number');
  assert.equal(classificationFor(80), 'RECONSTRUCTED_HIGH');
  assert.equal(classificationFor(10), 'UNRECONSTRUCTABLE');
});

test('map matching padrão preserva pontos GPS brutos e declara indisponibilidade', async () => {
  const points = [{ latitude: -19.5, longitude: -42.6, timestamp: 1 }];
  const result = await new MapMatchingProvider().match(points);
  assert.deepEqual(result.rawPoints, points);
  assert.notEqual(result.rawPoints, points);
  assert.equal(result.matchedGeometry, null);
  assert.equal(result.provider, 'unavailable');
});

test('API persiste lacuna e alternativas sem alterar posições GPS originais', async (t) => {
  const routeProvider = { calculateRoute: async () => ({ provider: 'mock', routes: [
    { routeId: 'a', distanceMeters: 1000, durationSeconds: 100, geometry: [[-19.5, -42.6], [-19.49, -42.59]] },
    { routeId: 'b', distanceMeters: 1800, durationSeconds: 190, geometry: [[-19.5, -42.6], [-19.48, -42.57], [-19.49, -42.59]] }
  ] }) };
  const { app, database } = setup(t, { routeProvider });
  const agent = request.agent(app);
  await register(agent).expect(201);
  const savedVehicle = await agent.post('/api/vehicles').send({ ...vehicle, type: 'car', dataSource: 'manual' }).expect(201);
  const tracking = await agent.post('/api/sessions').send({ vehicleId: savedVehicle.body.vehicle.id }).expect(201);
  const trip = await agent.post('/api/trips').send({ trackingSessionId: tracking.body.id, vehicleId: savedVehicle.body.vehicle.id, plannedRoute: { distanceMeters: 1000, durationSeconds: 100, geometry: [[-19.5, -42.6], [-19.49, -42.59]] } }).expect(201);
  database.prepare('INSERT INTO positions (tracking_session_id, device_id, latitude, longitude, accuracy, captured_at, received_at, source, sequence_number, accuracy_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(tracking.body.id, 'test-device', -19.5, -42.6, 8, 1000, 1000, 'mobile-gps', 1, 'Excelente');
  const beforeCount = database.prepare('SELECT COUNT(*) AS total FROM positions').get().total;
  const response = await agent.post(`/api/trips/${trip.body.trip.id}/reconstruct`).send({ before: { latitude: -19.5, longitude: -42.6, accuracy: 8, timestamp: 1000, speed: 10, heading: 45 }, after: { latitude: -19.49, longitude: -42.59, accuracy: 8, timestamp: 101000, speed: 10, heading: 45 }, lostAt: 1000, reconnectedAt: 101000, duration: 100000 }).expect(201);
  assert.match(response.body.disclaimer, /não representa confirmação/);
  assert.equal(response.body.alternatives.length, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM route_gaps').get().total, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM reconstruction_candidates').get().total, 2);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM positions').get().total, beforeCount);
});

test('horário autorizado cobre intervalo normal, fim de semana e virada de dia', () => {
  const weekday = { enabled: true, days: [1, 2, 3, 4, 5], from: '07:00', to: '19:00', timezone: 'UTC' };
  assert.equal(isWithinSchedule(weekday, Date.parse('2026-08-17T12:00:00Z')), true);
  assert.equal(isWithinSchedule(weekday, Date.parse('2026-08-17T22:00:00Z')), false);
  assert.equal(isWithinSchedule(weekday, Date.parse('2026-08-16T12:00:00Z')), false);
  const overnight = { enabled: true, days: [1], from: '22:00', to: '06:00', timezone: 'UTC' };
  assert.equal(isWithinSchedule(overnight, Date.parse('2026-08-17T23:00:00Z')), true);
  assert.equal(isWithinSchedule(overnight, Date.parse('2026-08-18T05:30:00Z')), true);
  assert.equal(isWithinSchedule(overnight, Date.parse('2026-08-18T07:00:00Z')), false);
  assert.equal(validateSchedule({ ...weekday, timezone: 'Fuso/Inexistente' }), null);
});

test('horários e alertas são persistidos e isolados por proprietário', async (t) => {
  const { app, database } = setup(t);
  const owner = request.agent(app), stranger = request.agent(app);
  await register(owner).expect(201);
  await register(stranger, { email: 'agenda-outro@example.com' }).expect(201);
  const saved = await owner.post('/api/vehicles').send({ ...vehicle, type: 'car', dataSource: 'manual' }).expect(201);
  const id = saved.body.vehicle.id, schedule = { enabled: true, days: [1, 2, 3, 4, 5], from: '22:00', to: '06:00', timezone: 'America/Sao_Paulo' };
  await owner.put(`/api/vehicles/${id}/schedule`).send(schedule).expect(200);
  const loaded = await owner.get(`/api/vehicles/${id}/schedule`).expect(200);
  assert.deepEqual(loaded.body.schedule.days, schedule.days);
  await stranger.get(`/api/vehicles/${id}/schedule`).expect(404);
  await stranger.put(`/api/vehicles/${id}/schedule`).send(schedule).expect(404);
  const ownerId = database.prepare('SELECT id FROM users WHERE email = ?').get('teste@example.com').id;
  database.prepare('INSERT INTO alerts (id, user_id, vehicle_id, type, severity, title, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('alerta-owner', ownerId, id, 'OUTSIDE_ALLOWED_TIME', 'warning', 'Fora do horário', Date.now(), Date.now());
  const ownerAlerts = await owner.get('/api/alerts').expect(200), strangerAlerts = await stranger.get('/api/alerts').expect(200);
  assert.equal(ownerAlerts.body.alerts.length, 1);
  assert.equal(strangerAlerts.body.alerts.length, 0);
  await stranger.patch('/api/alerts/alerta-owner/read').expect(404);
  await owner.patch('/api/alerts/alerta-owner/read').expect(204);
});

test('geofence circular distingue dentro, fora, borda e precisão ruim', () => {
  const fence = validateGeofence({ name: 'Casa', type: 'circle', centerLat: 0, centerLng: 0, radiusMeters: 100 });
  assert.equal(classifyCirclePosition({ latitude: 0, longitude: 0, accuracy: 5 }, fence).state, 'inside');
  assert.equal(classifyCirclePosition({ latitude: 0.002, longitude: 0, accuracy: 5 }, fence).state, 'outside');
  assert.equal(classifyCirclePosition({ latitude: 0.0009, longitude: 0, accuracy: 15 }, fence).state, 'uncertain');
  assert.equal(classifyCirclePosition({ latitude: 0.002, longitude: 0, accuracy: 120 }, fence).state, 'uncertain');
});

test('histerese exige leituras consecutivas, gera saída, entrada e cooldown', () => {
  const outside = { state: 'outside' }, inside = { state: 'inside' };
  const first = nextGeofenceState({}, outside, 1000000);
  assert.equal(first.event, null);
  const second = nextGeofenceState(first, outside, 1001000);
  assert.equal(second.event, 'GEOFENCE_EXIT');
  const repeated = nextGeofenceState(second, outside, 1002000);
  assert.equal(repeated.event, null);
  const returned = nextGeofenceState(repeated, inside, 1003000);
  assert.equal(returned.event, 'GEOFENCE_ENTER');
});

test('CRUD de geofence pertence exclusivamente ao dono do veículo', async (t) => {
  const { app } = setup(t), owner = request.agent(app), stranger = request.agent(app);
  await register(owner).expect(201);
  await register(stranger, { email: 'geofence-outro@example.com' }).expect(201);
  const saved = await owner.post('/api/vehicles').send({ ...vehicle, type: 'car', dataSource: 'manual' }).expect(201);
  const payload = { name: 'Casa', type: 'circle', centerLat: -19.5, centerLng: -42.6, radiusMeters: 250, enabled: true };
  const created = await owner.post(`/api/vehicles/${saved.body.vehicle.id}/geofences`).send(payload).expect(201);
  await stranger.get(`/api/vehicles/${saved.body.vehicle.id}/geofences`).expect(404);
  await stranger.put(`/api/geofences/${created.body.geofence.id}`).send(payload).expect(404);
  await stranger.delete(`/api/geofences/${created.body.geofence.id}`).expect(404);
  const listed = await owner.get(`/api/vehicles/${saved.body.vehicle.id}/geofences`).expect(200);
  assert.equal(listed.body.geofences.length, 1);
  await owner.delete(`/api/geofences/${created.body.geofence.id}`).expect(204);
});

test('cenário offline demonstrativo persiste pontos em ordem e interrupção', async (t) => {
  const { app, database } = setup(t), agent = request.agent(app);
  await register(agent).expect(201);
  const saved = await agent.post('/api/vehicles').send({ ...vehicle, type: 'car', dataSource: 'manual' }).expect(201);
  const tracking = await agent.post('/api/sessions').send({ vehicleId: saved.body.vehicle.id }).expect(201);
  const points = [3, 1, 2].map(sequence => ({ latitude: -19.5 + sequence / 1000, longitude: -42.6, accuracy: 8, speed: 10, timestamp: 1000 * sequence, sequence }));
  const response = await agent.post('/api/simulations/offline').send({ sessionId: tracking.body.id, points, lostAt: 1000, reconnectedAt: 3000 }).expect(201);
  assert.equal(response.body.received, 3);
  assert.match(response.body.disclaimer, /demonstrativo/);
  assert.deepEqual(database.prepare('SELECT sequence_number AS sequence FROM positions ORDER BY captured_at').all().map(row => row.sequence), [1, 2, 3]);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM interruptions').get().total, 1);
});

test('gamificação não usa velocidade e recompensa práticas seguras', () => {
  const result = calculateSafeScore({ completedTrips: 5, interruptions: 0, scheduleRules: 1, outsideScheduleAlerts: 0, geofences: 1, geofenceExitAlerts: 0, accuratePositionRatio: 1, maximumSpeed: 999 });
  assert.equal(result.score, 100);
  assert.ok(result.achievements.includes('GUARDIAO_DA_AREA'));
  assert.match(result.disclaimer, /Velocidade não gera pontos/);
  assert.equal(calculateSafeScore({ completedTrips: 0 }).score, 0);
});

test('ranking é opt-in, protegido e não expõe usuário sem consentimento', async (t) => {
  const { app } = setup(t), participant = request.agent(app), privateUser = request.agent(app);
  await register(participant).expect(201);
  await register(privateUser, { email: 'privado@example.com' }).expect(201);
  await request(app).get('/api/gamification/ranking').expect(401);
  let ranking = await privateUser.get('/api/gamification/ranking').expect(200);
  assert.deepEqual(ranking.body.ranking, []);
  await participant.put('/api/gamification/me').send({ enabled: true, displayName: 'Motorista Seguro' }).expect(200);
  ranking = await privateUser.get('/api/gamification/ranking').expect(200);
  assert.equal(ranking.body.ranking.length, 1);
  assert.equal(ranking.body.ranking[0].displayName, 'Motorista Seguro');
  assert.match(ranking.body.criteria, /Velocidade não é utilizada/);
  await participant.put('/api/gamification/me').send({ enabled: false, displayName: '' }).expect(200);
  ranking = await privateUser.get('/api/gamification/ranking').expect(200);
  assert.deepEqual(ranking.body.ranking, []);
});

test('capabilities documenta recursos disponíveis sem expor segredos', async (t) => {
  const { app } = setup(t), agent = request.agent(app);
  await register(agent).expect(201);
  const response = await agent.get('/api/capabilities').expect(200);
  assert.equal(response.body.features.offlineQueue, 'indexeddb');
  assert.equal(response.body.features.externalNotifications, false);
  assert.equal(JSON.stringify(response.body).includes('GOOGLE_MAPS_API_KEY'), false);
});
