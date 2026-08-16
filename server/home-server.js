'use strict';

const express = require('express');
const helmet = require('helmet');
const path = require('node:path');

function createHomeApplication(options = {}) {
  const app = express();
  const publicDirectory = path.join(__dirname, '..', 'public');
  const appUrl = String(options.appUrl || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'"], scriptSrc: ["'self'"]
  } } }));
  app.get('/home-assets/home.css', (_req, res) => res.sendFile(path.join(publicDirectory, 'css', 'home.css')));
  app.get('/home-assets/home-theme.css', (_req, res) => res.sendFile(path.join(publicDirectory, 'css', 'home-theme.css')));
  app.get('/home-assets/home.js', (_req, res) => res.sendFile(path.join(publicDirectory, 'js', 'home.js')));
  app.get('/home-assets/rastreon-logo.png', (_req, res) => res.sendFile(path.join(publicDirectory, 'images', 'rastreon-logo.png')));
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'rastreon-home' }));
  app.get('/', (_req, res) => res.sendFile(path.join(publicDirectory, 'home.html')));
  for (const route of ['/login.html', '/register.html', '/dashboard']) app.get(route, (_req, res) => res.redirect(`${appUrl}${route}`));
  return app;
}

if (require.main === module) {
  const port = Number(process.env.HOME_PORT) || 3001;
  const host = process.env.HOME_HOST || '0.0.0.0';
  createHomeApplication().listen(port, host, () => console.log(`Rastreon Home disponível em http://localhost:${port}`));
}

module.exports = { createHomeApplication };
