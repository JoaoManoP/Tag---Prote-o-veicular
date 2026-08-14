'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { runMigrations } = require('./migrations');

function createDatabase(databasePath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'rastro-demo.sqlite')) {
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS tracking_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vehicle_json TEXT,
      trip_json TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      closed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tracking_owner ON tracking_sessions(user_id, created_at);
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_session_id TEXT NOT NULL REFERENCES tracking_sessions(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy REAL NOT NULL,
      speed REAL,
      heading REAL,
      altitude REAL,
      altitude_accuracy REAL,
      captured_at INTEGER NOT NULL,
      received_at INTEGER NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('mobile-gps', 'simulation')),
      captured_offline INTEGER NOT NULL DEFAULT 0,
      sequence_number INTEGER NOT NULL,
      accuracy_class TEXT NOT NULL,
      suspicious INTEGER NOT NULL DEFAULT 0,
      suspicion_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_positions_session_time ON positions(tracking_session_id, captured_at);
    CREATE TABLE IF NOT EXISTS interruptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_session_id TEXT NOT NULL REFERENCES tracking_sessions(id) ON DELETE CASCADE,
      lost_at INTEGER,
      reconnected_at INTEGER NOT NULL,
      duration_ms INTEGER,
      point_count INTEGER NOT NULL,
      classification TEXT NOT NULL
    );
  `);
  runMigrations(database);
  return database;
}

function createSessionStore(session, database) {
 class SQLiteSessionStore extends session.Store {
  constructor() {
    super();
    this.getStatement = database.prepare('SELECT data, expires_at FROM auth_sessions WHERE sid = ?');
    this.setStatement = database.prepare('INSERT INTO auth_sessions (sid, data, expires_at) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at');
    this.destroyStatement = database.prepare('DELETE FROM auth_sessions WHERE sid = ?');
  }
  get(sid, callback) { try { const row = this.getStatement.get(sid); if (!row || row.expires_at <= Date.now()) { if (row) this.destroyStatement.run(sid); return callback(null, null); } callback(null, JSON.parse(row.data)); } catch (error) { callback(error); } }
  set(sid, value, callback = () => {}) { try { const expiresAt = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 86400000; this.setStatement.run(sid, JSON.stringify(value), expiresAt); callback(null); } catch (error) { callback(error); } }
  destroy(sid, callback = () => {}) { try { this.destroyStatement.run(sid); callback(null); } catch (error) { callback(error); } }
  touch(sid, value, callback = () => {}) { this.set(sid, value, callback); }
 }
 return new SQLiteSessionStore();
}

module.exports = { createDatabase, createSessionStore };
