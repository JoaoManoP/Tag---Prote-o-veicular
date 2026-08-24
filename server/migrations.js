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
  },
  {
    version: 5,
    name: 'scoped-mobile-access',
    up(database) { addColumn(database, 'tracking_sessions', 'mobile_token_hash TEXT'); }
  },
  {
    version: 6,
    name: 'road-events-catalog',
    up(database) { database.exec(`
      CREATE TABLE IF NOT EXISTS road_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        label TEXT NOT NULL,
        longitude REAL NOT NULL,
        latitude REAL NOT NULL,
        speed_limit INTEGER,
        direction_type INTEGER,
        direction INTEGER,
        source TEXT NOT NULL,
        imported_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_road_events_bounds ON road_events(latitude, longitude);
      CREATE INDEX IF NOT EXISTS idx_road_events_category_bounds ON road_events(category, latitude, longitude);
    `); }
  },
  {
    version: 7,
    name: 'fuel-price-separation',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS fuel_price_preferences (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          fuel_type TEXT NOT NULL,
          price_per_liter REAL NOT NULL CHECK(price_per_liter > 0 AND price_per_liter <= 100),
          source TEXT NOT NULL,
          region TEXT,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY(user_id, fuel_type)
        );
        CREATE INDEX IF NOT EXISTS idx_fuel_prices_owner_updated ON fuel_price_preferences(user_id, updated_at DESC);
      `);
      if (!columnNames(database, 'vehicles').has('fuel_price')) return;
      const rows=database.prepare('SELECT user_id,fuel,fuel_price,updated_at FROM vehicles WHERE fuel_price > 0 ORDER BY updated_at').all();
      const upsert=database.prepare("INSERT INTO fuel_price_preferences (user_id,fuel_type,price_per_liter,source,region,updated_at) VALUES (?,?,?,'legacy-vehicle-migration',NULL,?) ON CONFLICT(user_id,fuel_type) DO UPDATE SET price_per_liter=excluded.price_per_liter,source=excluded.source,updated_at=excluded.updated_at");
      for(const row of rows)upsert.run(row.user_id,String(row.fuel||'Não informado').slice(0,40),row.fuel_price,row.updated_at);
    }
  },
  {
    version: 8,
    name: 'user-subscription-plan',
    up(database) {
      addColumn(database, 'users', "subscription_plan TEXT NOT NULL DEFAULT 'inteligente'");
      addColumn(database, 'users', "subscription_status TEXT NOT NULL DEFAULT 'demo_active'");
    }
  },
  {
    version: 9,
    name: 'secure-phone-device-pairing',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
          tracking_session_id TEXT REFERENCES tracking_sessions(id) ON DELETE SET NULL,
          type TEXT NOT NULL CHECK(type IN ('PHONE','GPS_TRACKER','OBD','SIMULATOR')),
          name TEXT NOT NULL,
          credential_hash TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
          created_at INTEGER NOT NULL,
          last_seen INTEGER,
          revoked_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_devices_owner_vehicle ON devices(user_id, vehicle_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS pairing_sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
          tracking_session_id TEXT NOT NULL REFERENCES tracking_sessions(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          manual_code_hash TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL CHECK(type IN ('PHONE_TRACKER')),
          status TEXT NOT NULL CHECK(status IN ('PENDING','SCANNED','CONFIRMED','EXPIRED','CANCELLED')),
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          claimed_at INTEGER,
          confirmed_at INTEGER,
          device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
          claimed_user_agent TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_pairing_owner_status ON pairing_sessions(user_id, status, created_at DESC);
      `);
    }
  },
  {
    version: 10,
    name: 'user-profile-avatar',
    up(database) { addColumn(database, 'users', 'avatar_data TEXT'); }
  },
  {
    version: 11,
    name: 'vehicle-vin-for-authorized-images',
    up(database) { addColumn(database, 'vehicles', 'vin TEXT'); }
  },
  {
    version: 12,
    name: 'vehicle-identification-and-image-cache',
    up(database) {
      addColumn(database, 'vehicles', 'manufacture_year INTEGER');
      addColumn(database, 'vehicles', 'color TEXT');
      addColumn(database, 'vehicles', 'image_json TEXT');
      database.exec(`
        CREATE TABLE IF NOT EXISTS vehicle_lookup_cache (
          plate TEXT PRIMARY KEY, make TEXT, model TEXT, version TEXT,
          manufacture_year INTEGER, model_year INTEGER, color TEXT, fuel TEXT, type TEXT,
          provider TEXT NOT NULL, image_json TEXT, created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_vehicle_lookup_expiry ON vehicle_lookup_cache(expires_at);
        CREATE TABLE IF NOT EXISTS vehicle_image_cache (
          cache_key TEXT PRIMARY KEY, make TEXT NOT NULL, model TEXT NOT NULL, year INTEGER,
          found INTEGER NOT NULL DEFAULT 0, image_url TEXT NOT NULL, source TEXT,
          license TEXT, author TEXT, attribution TEXT, reference TEXT,
          created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_vehicle_image_expiry ON vehicle_image_cache(expires_at);
      `);
    }
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
