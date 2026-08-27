'use strict';

require('dotenv').config();
const crypto = require('crypto');
const { createDatabase } = require('./database');
const { hashPassword, normalizeEmail, validatePassword } = require('./auth');

const staff = [
  { key: 'JOAO', name: 'JOAO' },
  { key: 'GUILHERME', name: 'GUILHERME' }
];

function loadEnvironment(environment = process.env) {
  if (!environment.STAFF_CONFIG_PATH) return environment;
  const fs = require('node:fs');
  const config = JSON.parse(fs.readFileSync(environment.STAFF_CONFIG_PATH, 'utf8'));
  return { ...environment, ...config };
}

function configFor(member, environment = process.env) {
  return {
    name: member.name,
    email: normalizeEmail(environment[`STAFF_${member.key}_EMAIL`]),
    password: environment[`STAFF_${member.key}_PASSWORD`] || ''
  };
}

async function provisionStaff(options = {}) {
  const database = options.database || createDatabase();
  const environment = loadEnvironment(options.environment || process.env);
  const configured = staff.map(member => configFor(member, environment));
  for (const member of configured) {
    if (!member.email || !validatePassword(member.password))
      throw new Error(
        `Configure STAFF_${member.name}_EMAIL e STAFF_${member.name}_PASSWORD com senha forte.`
      );
  }
  try {
    for (const member of configured) {
      const passwordHash = await hashPassword(member.password);
      const contactId = `RT-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const existing = database
        .prepare('SELECT id,public_contact_id AS contactId FROM users WHERE email=?')
        .get(member.email);
      if (existing)
        database
          .prepare(
            "UPDATE users SET name=?,password_hash=?,role='ADMIN',public_contact_id=CASE WHEN public_contact_id GLOB 'RT-[A-Z0-9]*' THEN public_contact_id ELSE ? END WHERE id=?"
          )
          .run(member.name, passwordHash, contactId, existing.id);
      else
        database
          .prepare(
            "INSERT INTO users (name,email,password_hash,role,public_contact_id,created_at) VALUES (?,?,?,'ADMIN',?,?)"
          )
          .run(member.name, member.email, passwordHash, contactId, Date.now());
    }
  } finally {
    if (!options.database) database.close();
  }
  return configured.map(({ name, email }) => ({ name, email, role: 'ADMIN' }));
}

if (require.main === module)
  provisionStaff()
    .then(accounts =>
      console.log(`Equipe provisionada: ${accounts.map(account => account.email).join(', ')}`)
    )
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });

module.exports = { provisionStaff, configFor, loadEnvironment };
