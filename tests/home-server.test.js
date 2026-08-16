'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createHomeApplication } = require('../server/home-server');

test('home institucional é pública e possui ajuda', async () => {
  const response = await request(createHomeApplication()).get('/').expect(200);
  assert.match(response.text, /Proteção veicular inteligente/i);
  assert.match(response.text, /homeHelpToggle/);
  assert.doesNotMatch(response.text, /login-road-hero/);
});

test('home encaminha acessos da conta para o aplicativo', async () => {
  const app = createHomeApplication({ appUrl: 'https://app.rastreon.example' });
  await request(app).get('/login.html').expect(302).expect('Location', 'https://app.rastreon.example/login.html');
  await request(app).get('/dashboard').expect(302).expect('Location', 'https://app.rastreon.example/dashboard');
});
