'use strict';

function columnNames(database, table) {
  return new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
}

function addColumn(database, table, definition) {
  const name = definition.trim().split(/\s+/)[0];
  if (!columnNames(database, table).has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

const migrations = [
  {
    version: 1,
    name: 'platform-foundation',
    up(database) {
      addColumn(database, 'users', "role TEXT NOT NULL DEFAULT 'USER'");
      addColumn(database, 'tracking_sessions', 'expires_at INTEGER');
      database.exec(`
        CREATE TABLE IF NOT EXISTS vehicles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL DEFAULT 'car' CHECK(type IN ('car', 'motorcycle')),
          nickname TEXT NOT NULL,
          plate TEXT,
          brand TEXT NOT NULL,
          model TEXT NOT NULL,
          version TEXT,
          year INTEGER,
          fuel TEXT,
          city_efficiency REAL NOT NULL,
          road_efficiency REAL NOT NULL,
          tank_capacity REAL NOT NULL,
          data_source TEXT NOT NULL,
          source_updated_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(user_id, updated_at DESC);
        CREATE TABLE IF NOT EXISTS consent_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tracking_session_id TEXT NOT NULL REFERENCES tracking_sessions(id) ON DELETE CASCADE,
          device_id TEXT NOT NULL,
          purpose TEXT NOT NULL,
          granted_at INTEGER NOT NULL,
          revoked_at INTEGER,
          user_agent_summary TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_consent_session ON consent_records(tracking_session_id, granted_at DESC);
        CREATE TABLE IF NOT EXISTS audit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT,
          reason TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
      `);

      const positionColumns = columnNames(database, 'positions');
      const positionSchema = database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'positions'").get()?.sql || '';
      if (!positionColumns.has('device_id') || !positionSchema.includes("'mobile-gps'")) {
        database.exec(`
          CREATE TABLE positions_next (
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
          INSERT INTO positions_next (id, tracking_session_id, device_id, latitude, longitude, accuracy, speed, heading, altitude, altitude_accuracy, captured_at, received_at, source, captured_offline, sequence_number, accuracy_class, suspicious, suspicion_reason)
          SELECT id, tracking_session_id, 'legacy-device', latitude, longitude, accuracy, speed, heading, altitude, NULL, captured_at, captured_at, CASE source WHEN 'simulation' THEN 'simulation' ELSE 'mobile-gps' END, captured_offline, id, CASE WHEN accuracy <= 10 THEN 'Excelente' WHEN accuracy <= 30 THEN 'Boa' WHEN accuracy <= 100 THEN 'Regular' ELSE 'Baixa' END, 0, NULL FROM positions;
          DROP TABLE positions;
          ALTER TABLE positions_next RENAME TO positions;
          CREATE INDEX idx_positions_session_time ON positions(tracking_session_id, captured_at);
          CREATE UNIQUE INDEX idx_positions_device_sequence ON positions(tracking_session_id, device_id, sequence_number);
        `);
      }
      database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_device_sequence ON positions(tracking_session_id, device_id, sequence_number)');
      database.exec('PRAGMA optimize');
    }
  },
  {
    version: 2,
    name: 'vehicle-health-and-tour-preferences',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS vehicle_diagnostic_events (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          severity TEXT NOT NULL,
          source TEXT NOT NULL,
          estimated_value REAL,
          metadata_json TEXT,
          detected_at INTEGER NOT NULL,
          cleared_at INTEGER,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_diagnostics_owner_vehicle ON vehicle_diagnostic_events(user_id, vehicle_id, detected_at DESC);
        CREATE TABLE IF NOT EXISTS tour_preferences (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          tour_key TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          dismissed INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY(user_id, tour_key)
        );
      `);
    }
  },
  {
    version: 3,
    name: 'saved-places',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS saved_places (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          place_key TEXT NOT NULL,
          label TEXT NOT NULL,
          address TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(user_id, place_key)
        );
      `);
    }
  },
  {
    version: 4,
    name: 'advanced-geofence-shapes',
    up(database) { const sql=database.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='geofences'").get()?.sql||''; if(sql.includes("'polygon'")){addColumn(database,'geofences','polygon_json TEXT');return;} database.exec(`CREATE TABLE geofences_next (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('circle','polygon')),center_lat REAL NOT NULL,center_lng REAL NOT NULL,radius_meters REAL NOT NULL,polygon_json TEXT,enabled INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);INSERT INTO geofences_next (id,user_id,vehicle_id,name,type,center_lat,center_lng,radius_meters,enabled,created_at,updated_at) SELECT id,user_id,vehicle_id,name,type,center_lat,center_lng,radius_meters,enabled,created_at,updated_at FROM geofences;DROP TABLE geofences;ALTER TABLE geofences_next RENAME TO geofences;CREATE INDEX idx_geofences_owner_vehicle ON geofences(user_id,vehicle_id);`); }
  }
];

function runMigrations(database) {
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  const applied = new Set(database.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    database.transaction(() => {
      migration.up(database);
      database.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(migration.version, migration.name, Date.now());
    })();
  }
}

module.exports = { runMigrations };
