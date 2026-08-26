'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { createDatabase } = require('./database');
const { categoryFor } = require('./road-events');

function parseLine(line, header) {
  const values = line.split(',');
  if (values.length < 3) return null;
  const longitude = Number(values[0]),
    latitude = Number(values[1]);
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  )
    return null;
  if (header) {
    const type = values[2],
      speed = Number(values[3]),
      directionType = Number(values[4]),
      direction = Number(values[5]),
      label = `Radar tipo ${type}${speed > 0 ? ` - ${speed} km/h` : ''}`;
    return {
      longitude,
      latitude,
      label,
      category: 'speed_camera',
      speedLimit: speed > 0 ? speed : null,
      directionType: Number.isFinite(directionType) ? directionType : null,
      direction: Number.isFinite(direction) ? direction : null
    };
  }
  const label = values.slice(2).join(',').trim(),
    match = label.match(/@(\d+)\s*$/),
    speed = match ? Number(match[1]) : null;
  return {
    longitude,
    latitude,
    label: label.replace(/@\d+\s*$/, ''),
    category: categoryFor(label),
    speedLimit: speed > 0 ? speed : null,
    directionType: null,
    direction: null
  };
}
async function main() {
  const source = process.argv[2];
  if (!source || !fs.existsSync(source))
    throw new Error('Uso: npm run road-events:import -- caminho/maparadar.csv');
  const database = createDatabase(),
    statement = database.prepare(
      'INSERT INTO road_events (fingerprint,category,label,longitude,latitude,speed_limit,direction_type,direction,source,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET category=excluded.category,label=excluded.label,speed_limit=excluded.speed_limit,direction_type=excluded.direction_type,direction=excluded.direction,source=excluded.source,imported_at=excluded.imported_at'
    );
  let total = 0,
    skipped = 0,
    first = true,
    hasHeader = false;
  database.exec('BEGIN IMMEDIATE');
  try {
    const reader = readline.createInterface({
      input: fs.createReadStream(source),
      crlfDelay: Infinity
    });
    for await (const line of reader) {
      if (first) {
        first = false;
        hasHeader = /^X,Y,TYPE,SPEED,DirType,Direction/i.test(line);
        if (hasHeader) continue;
      }
      const event = parseLine(line, hasHeader);
      if (!event) {
        skipped++;
        continue;
      }
      const fingerprint = crypto
        .createHash('sha256')
        .update(
          `${event.longitude.toFixed(6)}|${event.latitude.toFixed(6)}|${event.category}|${event.speedLimit || 0}`
        )
        .digest('hex');
      statement.run(
        fingerprint,
        event.category,
        event.label,
        event.longitude,
        event.latitude,
        event.speedLimit,
        event.directionType,
        event.direction,
        'maparadar',
        Date.now()
      );
      total++;
    }
    database.exec('COMMIT');
    console.log(`Eventos viários importados: ${total}; ignorados: ${skipped}.`);
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  } finally {
    database.close();
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
