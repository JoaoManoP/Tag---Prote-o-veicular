'use strict';
const path = require('node:path');
const { createDatabase } = require('./database');
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'rastreon.sqlite');
const database = createDatabase(databasePath);
const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
database.close();
console.log(`Banco inicializado em ${databasePath}`);
console.log(`Tabelas: ${tables.join(', ')}`);
