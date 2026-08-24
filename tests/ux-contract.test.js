'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const ux = fs.readFileSync(path.join(root, 'public', 'js', 'ux.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
const refreshCss = fs.readFileSync(path.join(root, 'public', 'css', 'dashboard-refresh.css'), 'utf8');
const diagnostics = fs.readFileSync(path.join(root, 'server', 'vehicle-diagnostics.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'public', 'js', 'dashboard.js'), 'utf8');
const mapService = fs.readFileSync(path.join(root, 'public', 'js', 'map-service.js'), 'utf8');
const navigationState = fs.readFileSync(path.join(root, 'public', 'js', 'navigation-state.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'public', 'home.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'public', 'register.html'), 'utf8');
const authClient = fs.readFileSync(path.join(root, 'public', 'js', 'auth.js'), 'utf8');

test('dashboard contem overflow e mantem acoes do mapa no toolbar movel', () => {
  assert.match(css, /html,body\{max-width:100%;overflow-x:hidden\}/);
  assert.match(css, /\.map-toolbar \.actions\{max-width:68%;display:flex;flex-direction:row/);
  assert.match(ux, /matchMedia\('\(min-width:781px\)'\)\.matches/);
});

test('resumo do dashboard não realimenta o observador de mutações',()=>{
  assert.match(ux,/onlineStatus\.className !== onlineClass/);
  assert.doesNotMatch(ux,/byId\('sheetOnline'\)\.className\s*=/);
});

test('planos da home chegam ao cadastro e exibem confirmação', () => {
  assert.match(home, /register\.html\?plano=rastreio/);
  assert.match(home, /register\.html\?plano=inteligente/);
  assert.match(home, /register\.html\?plano=familia/);
  assert.match(register, /id="selectedPlan"/);
  assert.match(authClient, /rastreon-subscription-confirmation/);
});

test('atalhos de planos usam a rota pública da home', () => {
  assert.doesNotMatch(dashboard, /\/home\.html#planos/);
  assert.match(dashboard, /location\.href='\/#planos'/);
});

test('ajuda e tour são pequenos, fecháveis e não navegam automaticamente', () => {
  assert.match(html, /id="helpCenter"/);
  assert.match(html, /id="tourDismiss"/);
  assert.match(html, /id="tourClose"/);
  assert.doesNotMatch(ux, /location\.(assign|replace).*tour/);
});

test('rastreamento aplica divulgação progressiva e três estados no painel', () => {
  assert.match(ux, /'minimized'.*'half'.*'expanded'/s);
  assert.match(css, /\.minimized \.sheet-details\{display:none\}/);
  assert.match(css, /\.technical-open #trackingView \.telemetry-panel/);
});

test('saúde simulada nunca se apresenta como diagnóstico real', () => {
  assert.match(ux, /Fonte: SIMULATION/);
  assert.match(ux, /não diagnostica a central eletrônica/i);
  assert.match(diagnostics, /source: 'SIMULATION'/);
});

test('modo automotivo mantém mapa e oculta controles secundários', () => {
  assert.match(css, /\.automotive-mode \.topbar/);
  assert.match(css, /\.automotive-mode #trackingView #map\{height:100%\}/);
});

test('viagem e cerco usam endereço e escondem coordenadas da interface comum', () => {
  assert.match(ux, /De onde você vai sair/);
  assert.match(ux, /Onde você quer proteger/);
  assert.match(ux, /Escolher no mapa/);
  assert.match(ux, /Pequena/);
  assert.match(ux, /Média/);
  assert.match(ux, /Grande/);
  assert.match(css, /telemetry-panel \.metric-grid.*display:none/s);
  assert.doesNotMatch(ux, /Ponto no mapa \(\$\{/);
});

test('autocomplete limita resultados e detalhes da rota ficam recolhidos', () => {
  assert.match(ux, /places\.slice\(0,4\)/);
  assert.match(ux, /routeDetailsBtn/);
  assert.match(css, /route-summary>small\{display:none\}/);
});

test('busca inferior inicia a viagem e celular permanece opcional',()=>{
  assert.match(dashboard,/Para onde você quer ir\?/);
  assert.match(dashboard,/openQuickTripPanel/);
  assert.match(dashboard,/Iniciar navegação neste dispositivo/);
  assert.match(dashboard,/O site continua funcionando sem conexão com o telefone/);
  assert.match(refreshCss,/wizard>:not\(\.quick-trip-panel\):not\(#routeSummary\)\{display:none/);
});

test('acabamentos do cerco e viagem permanecem progressivos',()=>{
  assert.match(ux,/Desenhar área personalizada/);
  assert.match(ux,/Confirmar e ativar/);
  assert.match(ux,/saved-place:arrival/);
  assert.match(ux,/rastreon-tour-trip/);
  assert.match(ux,/geofences\/\$\{fence\.id\}\/status/);
});

test('navegação usa ícones, separa Perfil e mantém cinco ações no celular', () => {
  assert.match(html, /ui-icons\.svg#history/);
  assert.match(html, /ui-icons\.svg#vehicle/);
  assert.match(html, /ui-icons\.svg#profile/);
  assert.match(html, /class="nav-pill nav-profile" data-view="profile"/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 68px/);
  assert.match(css, /\.nav-primary\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /\.top-nav \.nav-plans\{display:none!important\}/);
});

test('layouts críticos reduzem para uma coluna em telas pequenas', () => {
  assert.match(css, /\.timeline-layout,\.plans-grid,\.profile-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css, /\.form-grid\{grid-template-columns:1fr\}/);
  assert.match(css, /@media\(max-width:390px\)/);
});

test('mapa usa provider configurável, fallback e moldura compacta no desktop', () => {
  assert.match(html, /\/map-config\.js/);
  assert.match(html, /\/js\/map-service\.js/);
  assert.match(mapService, /provider==='maplibre'/);
  assert.match(html, /maplibre-loader\.js/);
  assert.match(mapService, /leaflet-fallback/);
  assert.match(css, /width:min\(1180px,calc\(100vw - 44px\)\)/);
  assert.match(css, /height:min\(690px,calc\(100vh - 128px\)\)/);
});

test('navegação possui manobra, ETA, interpolação, follow e camadas essenciais', () => {
  assert.match(navigationState, /VehiclePositionInterpolator/);
  assert.match(navigationState, /navManeuver/);
  assert.match(navigationState, /navEta/);
  assert.match(navigationState, /dragstart/);
  assert.match(navigationState, /navPerspective/);
  assert.doesNotMatch(navigationState, /navTraffic/);
  assert.match(navigationState, /navRoadEvents/);
  assert.match(css, /\.navigation-hud/);
});

test('cadastro do veículo oferece consulta por placa e não expõe dados pessoais', () => {
  assert.match(dashboard, /lookupPlateBtn/);
  assert.match(dashboard, /\/api\/vehicles\/lookup\/\$\{encodeURIComponent\(plate\)\}/);
  assert.match(dashboard, /Veículo identificado pela placa/);
});

test('mapa mantém ferramentas na lateral e celular possui QR com fallback manual', () => {
  const mobile=fs.readFileSync(path.join(root,'public','mobile.html'),'utf8'),mobileScript=fs.readFileSync(path.join(root,'public','js','mobile.js'),'utf8'),pair=fs.readFileSync(path.join(root,'public','pair.html'),'utf8'),pairScript=fs.readFileSync(path.join(root,'public','js','pair.js'),'utf8');
  assert.match(ux,/map-side-panel/);assert.match(css,/smart-map\.has-side-panel/);
  assert.match(pair,/id="scanBtn"/);assert.match(pair,/id="manualForm"/);assert.match(pairScript,/BarcodeDetector/);assert.match(pairScript,/ZXingBrowser/);assert.match(pairScript,/getUserMedia/);assert.match(pairScript,/getTracks\(\)\.forEach/);assert.match(mobileScript,/device:revoked/);
});

test('garagem gerencia dispositivos e apresenta estados de conexão',()=>{assert.match(html,/id="devicesPanel"/);assert.match(html,/id="connectPhoneBtn"/);assert.match(dashboard,/\/api\/vehicles\/\$\{vehicle\.id\}\/devices/);assert.match(dashboard,/\/api\/devices\/\$\{id\}/);assert.match(dashboard,/Sem atualização/);assert.match(dashboard,/Desvincular/);assert.match(css,/\.device-status\.online/);assert.match(css,/\.device-status\.stale/)});

test('GPS diário usa localização consentida sem exigir sessão de rastreamento', () => {
  assert.match(html, /id="useMyLocationBtn"/);
  assert.match(html, /id="startNavigationBtn"/);
  assert.match(dashboard, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(dashboard, /navigator\.geolocation\.watchPosition/);
  assert.match(dashboard, /Sua posição não é enviada ao rastreamento/);
  assert.match(navigationState, /rastreon:route-deviation/);
  assert.match(navigationState, /navVoice/);
  assert.match(navigationState, /speechSynthesis/);
  assert.match(dashboard, /rerouteFrom/);
});

test('POIs usam a posição atual e oferecem categorias úteis do mapa', () => {
  assert.match(ux, /rastreonLocation\?\.current/);
  for (const category of ['Postos', 'Restaurantes', 'Hotéis', 'Hospitais', 'Farmácias', 'Mercados', 'Oficinas']) assert.match(ux, new RegExp(category));
  assert.match(ux, /Adicionar como parada/);
  assert.match(ux, /escapeHtml\(popupName\)/);
});

test('planejamento aceita paradas reordenáveis e preferência de pedágio', () => {
  assert.match(html, /id="addStopBtn"/);
  assert.match(html, /id="avoidTolls"/);
  assert.match(dashboard, /data-stop-up/);
  assert.match(dashboard, /data-stop-down/);
  assert.match(dashboard, /waypoints=/);
});

test('perfil oferece troca de senha, exportação e exclusão protegida',()=>{assert.match(html,/id="changePasswordBtn"/);assert.match(html,/id="exportDataBtn"/);assert.match(html,/id="deleteAccountBtn"/);assert.match(dashboard,/\/api\/auth\/csrf/);assert.match(dashboard,/X-CSRF-Token/)});

test('preço de combustível é separado do cadastro do veículo e mostra fonte',()=>{assert.doesNotMatch(html,/id="vPrice"/);assert.match(html,/id="fuelPriceInput"/);assert.match(html,/id="fuelPriceSource"/);assert.match(dashboard,/\/api\/fuel-price/);assert.match(dashboard,/user-provided/)});

test('histórico possui reprodução explicitamente separada do GPS ao vivo',()=>{
  assert.match(html,/id="replayBadge"/);
  assert.match(html,/REPRODUÇÃO/);
  assert.match(html,/id="replayTripBtn"/);
  assert.match(dashboard,/function playTripHistory/);
  assert.match(dashboard,/não é ao vivo/);
  assert.match(dashboard,/function renderPosition\(p\).*stopTripReplay/s);
  assert.match(css,/\.replay-badge/);
});
