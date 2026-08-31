'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const webRoot = path.join(__dirname, '..', '..', 'frontend', 'web');

test('home preserva logo completa e video local em loop sem imagem de carro ao fundo', () => {
  const html = fs.readFileSync(path.join(webRoot, 'home.html'), 'utf8');
  const css = fs.readFileSync(path.join(webRoot, 'css', 'home-clean-hero.css'), 'utf8');
  const script = fs.readFileSync(path.join(webRoot, 'js', 'home.js'), 'utf8');

  assert.match(html, /src="\/images\/rastreon-logo\.png"/);
  assert.match(html, /<video[\s\S]*autoplay[\s\S]*muted[\s\S]*loop[\s\S]*playsinline/);
  assert.match(html, /src="\/videos\/rastreon-hero-clean-1080p\.mp4"/);
  assert.doesNotMatch(html, /poster=/);
  assert.doesNotMatch(css, /home-hero-night\.png/);
  assert.match(script, /heroVideo\.loop = true/);
  assert.ok(
    fs.statSync(path.join(webRoot, 'videos', 'rastreon-hero-clean-1080p.mp4')).size > 1_000_000
  );
});
