const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const projectRoot = path.join(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('keeps the three approved reference screens in the frontend', () => {
  const html = read('frontend/web/index.html');

  [
    'Relatório operacional',
    'Traçado da última viagem',
    'Minha garagem',
    'Rastreadores e dispositivos',
    'Comunidade RASTREON',
    'Ocorrências em destaque',
    'Convoy',
    'Gerenciar comboio'
  ].forEach(copy => assert.match(html, new RegExp(copy, 'i')));

  assert.match(html, /reference-screens\.css/);
  assert.match(html, /reference-screens\.js/);
});

test('keeps reference media archived outside the public frontend', () => {
  [
    'database/reference-assets/README.md',
    'database/reference-assets/specs/REFERENCE_SCREENS.md',
    'database/reference-assets/images/dashboard-map-reference.png',
    'database/reference-assets/images/rastreon-logo-reference.png',
    'database/reference-assets/videos/home-hero-loop-reference.mp4'
  ].forEach(relativePath => {
    const absolutePath = path.join(projectRoot, relativePath);
    assert.ok(fs.existsSync(absolutePath), `${relativePath} must exist`);
    assert.ok(fs.statSync(absolutePath).size > 0, `${relativePath} must not be empty`);
  });
});

test('does not expose demonstration data or simulation controls in the dashboard', () => {
  const publicCode = [
    read('frontend/web/index.html'),
    read('frontend/web/js/dashboard.js'),
    read('frontend/web/js/platform-features.js'),
    read('frontend/web/js/reference-screens.js')
  ].join('\n');

  ['Chevrolet Vectra', 'GVI9371', 'Tentativa de assalto', 'Simular percurso'].forEach(copy =>
    assert.doesNotMatch(publicCode, new RegExp(copy, 'i'))
  );
  assert.match(publicCode, /Nenhum veículo cadastrado/);
  assert.match(publicCode, /Nenhuma viagem neste período/);
});
