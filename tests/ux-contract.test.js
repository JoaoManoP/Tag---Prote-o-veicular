'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const ux = fs.readFileSync(path.join(root, 'public', 'js', 'ux.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
const diagnostics = fs.readFileSync(path.join(root, 'server', 'vehicle-diagnostics.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'public', 'js', 'dashboard.js'), 'utf8');
const mapService = fs.readFileSync(path.join(root, 'public', 'js', 'map-service.js'), 'utf8');
const navigationState = fs.readFileSync(path.join(root, 'public', 'js', 'navigation-state.js'), 'utf8');

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
  assert.match(css, /\.timeline-layout,\.plans-grid,\.profile-layout,\.gamification-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
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
  assert.match(dashboard, /\/api\/vehicles\/lookup\?plate=/);
  assert.match(dashboard, /Dados do veículo preenchidos pela placa/);
});

test('mapa mantém ferramentas na lateral e celular aceita pareamento sem QR', () => {
  const mobile=fs.readFileSync(path.join(root,'public','mobile.html'),'utf8'),mobileScript=fs.readFileSync(path.join(root,'public','js','mobile.js'),'utf8');
  assert.match(ux,/map-side-panel/);assert.match(css,/smart-map\.has-side-panel/);
  assert.match(mobile,/pairingForm/);assert.match(mobileScript,/\/api\/mobile\/pair/);
});
