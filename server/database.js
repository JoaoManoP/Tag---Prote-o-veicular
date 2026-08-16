'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('./migrations');

class Database extends DatabaseSync {
  pragma(value) { return this.exec(`PRAGMA ${value}`); }
  transaction(operation) {
    return (...args) => {
      this.exec('BEGIN IMMEDIATE');
      try { const result = operation(...args); this.exec('COMMIT'); return result; }
      catch (error) { try { this.exec('ROLLBACK'); } catch {} throw error; }
    };
  }
}

function defaultDatabasePath() {
  const dataDirectory = path.join(__dirname, '..', 'data');
  const legacyPath = path.join(dataDirectory, 'rastro-demo.sqlite');
  return process.env.DATABASE_PATH || (fs.existsSync(legacyPath) ? legacyPath : path.join(dataDirectory, 'rastreon.sqlite'));
}

function createDatabase(databasePath = defaultDatabasePath()) {
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
      mobile_token_hash TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      closed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tracking_owner ON tracking_sessions(user_id, created_at);
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('car', 'motorcycle')),
      plate TEXT,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER,
      version TEXT,
      engine TEXT,
      transmission TEXT,
      fuel TEXT,
      city_consumption REAL NOT NULL,
      road_consumption REAL NOT NULL,
      tank_capacity REAL NOT NULL,
      fuel_price REAL NOT NULL,
      data_source TEXT NOT NULL,
      source_date TEXT,
      selected INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
      tracking_session_id TEXT NOT NULL UNIQUE REFERENCES tracking_sessions(id) ON DELETE CASCADE,
      planned_route_json TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trips_owner_time ON trips(user_id, started_at DESC);
    CREATE TABLE IF NOT EXISTS route_gaps (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      lost_at INTEGER,
      reconnected_at INTEGER NOT NULL,
      duration_ms INTEGER,
      before_position_json TEXT NOT NULL,
      after_position_json TEXT NOT NULL,
      classification TEXT NOT NULL,
      selected_candidate_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_route_gaps_trip ON route_gaps(trip_id, created_at);
    CREATE TABLE IF NOT EXISTS reconstruction_candidates (
      id TEXT PRIMARY KEY,
      route_gap_id TEXT NOT NULL REFERENCES route_gaps(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      route_json TEXT NOT NULL,
      score REAL NOT NULL,
      confidence INTEGER NOT NULL,
      classification TEXT NOT NULL,
      components_json TEXT NOT NULL,
      selected INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reconstruction_gap ON reconstruction_candidates(route_gap_id, confidence DESC);
    CREATE TABLE IF NOT EXISTS vehicle_usage_schedules (
      vehicle_id INTEGER PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 1,
      days_json TEXT NOT NULL,
      time_from TEXT NOT NULL,
      time_to TEXT NOT NULL,
      timezone TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
      trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
      tracking_session_id TEXT REFERENCES tracking_sessions(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      details_json TEXT,
      occurred_at INTEGER NOT NULL,
      read_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_owner_time ON alerts(user_id, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS geofences (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('circle', 'polygon')),
      center_lat REAL NOT NULL,
      center_lng REAL NOT NULL,
      radius_meters REAL NOT NULL,
      polygon_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_geofences_owner_vehicle ON geofences(user_id, vehicle_id);
    CREATE TABLE IF NOT EXISTS geofence_states (
      geofence_id TEXT PRIMARY KEY REFERENCES geofences(id) ON DELETE CASCADE,
      outside_count INTEGER NOT NULL DEFAULT 0,
      confirmed_outside INTEGER NOT NULL DEFAULT 0,
      last_alert_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gamification_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 0,
      display_name TEXT,
      updated_at INTEGER NOT NULL
    );
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_session_sequence ON positions(tracking_session_id, sequence_number) WHERE sequence_number IS NOT NULL;
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
