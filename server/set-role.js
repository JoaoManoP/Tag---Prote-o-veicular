'use strict';

const { createDatabase } = require('./database');
const { normalizeEmail } = require('./auth');
const { ROLES } = require('./authorization');

const email = normalizeEmail(process.argv[2]);
const role = String(process.argv[3] || '').toUpperCase();
if (!email || !Object.values(ROLES).includes(role)) {
  console.error('Uso: npm run role:set -- usuario@exemplo.com USER|ADMIN|DEVELOPER');
  process.exitCode = 1;
} else {
  const database = createDatabase();
  const user = database.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) {
    console.error('Usuário não encontrado.');
    process.exitCode = 1;
  } else {
    database.transaction(() => {
      database.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
      database.prepare("INSERT INTO audit_events (actor_user_id, action, target_type, target_id, reason, created_at) VALUES (NULL, 'ROLE_CHANGED_LOCALLY', 'USER', ?, 'Operação local autorizada pelo mantenedor', ?)").run(String(user.id), Date.now());
    })();
    console.log(`Função atualizada para ${role}.`);
  }
  database.close();
}
