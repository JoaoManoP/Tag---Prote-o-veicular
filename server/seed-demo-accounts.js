'use strict';

require('dotenv').config();
const { createDatabase } = require('./database');
const { hashPassword } = require('./auth');

const accounts = [
  { name: 'Cliente Demonstração', email: 'cliente@rastreon.demo', password: 'Rastreon#2026', role: 'USER' },
  { name: 'Administrador Demonstração', email: 'admin@rastreon.demo', password: 'Admin#Rastreon2026', role: 'ADMIN' },
  { name: 'Desenvolvedor Demonstração', email: 'dev@rastreon.demo', password: 'Dev#Rastreon2026', role: 'DEVELOPER' }
];

async function seed() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_ACCOUNTS !== 'true') throw new Error('Contas de demonstração não podem ser criadas em produção sem ALLOW_DEMO_ACCOUNTS=true.');
  const database = createDatabase();
  try {
    for (const account of accounts) {
      const passwordHash = await hashPassword(account.password);
      const existing = database.prepare('SELECT id FROM users WHERE email = ?').get(account.email);
      if (existing) database.prepare('UPDATE users SET name = ?, password_hash = ?, role = ? WHERE id = ?').run(account.name, passwordHash, account.role, existing.id);
      else database.prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(account.name, account.email, passwordHash, account.role, Date.now());
    }
  } finally { database.close(); }
  console.log(`Contas de demonstração preparadas: ${accounts.map(account => account.email).join(', ')}`);
}

seed().catch(error => { console.error(error.message); process.exitCode = 1; });
