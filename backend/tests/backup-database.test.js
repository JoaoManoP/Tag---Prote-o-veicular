'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { backupDatabase, safeTimestamp } = require('../../database/backup-database');

test('backup SQLite é consistente, datado e preserva os dados', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rastrotack-backup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source.sqlite'),
    database = new DatabaseSync(source);
  database.exec("CREATE TABLE sample (value TEXT); INSERT INTO sample VALUES ('preservado')");
  database.close();
  const destination = backupDatabase({
    databasePath: source,
    backupDirectory: path.join(root, 'backups'),
    now: new Date('2026-08-17T12:34:56.000Z')
  });
  assert.equal(
    path.basename(destination),
    `rastreon-${safeTimestamp(new Date('2026-08-17T12:34:56.000Z'))}.sqlite`
  );
  const copy = new DatabaseSync(destination, { readOnly: true });
  assert.equal(copy.prepare('SELECT value FROM sample').get().value, 'preservado');
  assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  copy.close();
});

test('backup recusa banco inexistente ou em memória', () => {
  assert.throws(() => backupDatabase({ databasePath: ':memory:' }), /memória/);
  assert.throws(
    () => backupDatabase({ databasePath: path.join(os.tmpdir(), 'nao-existe-rastrotack.sqlite') }),
    /não encontrado/
  );
});
