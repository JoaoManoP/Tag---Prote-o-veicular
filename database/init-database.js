'use strict';
const { createDatabase } = require('./database');
const databasePath = process.env.DATABASE_PATH || 'banco padrão da aplicação';
const database = createDatabase();
const tables = database
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  .all()
  .map(row => row.name);
database.close();
console.log(`Banco inicializado em ${databasePath}`);
console.log(`Tabelas: ${tables.join(', ')}`);
