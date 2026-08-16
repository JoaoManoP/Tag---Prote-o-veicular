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
