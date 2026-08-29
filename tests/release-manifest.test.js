'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('release separa alterações críticas de banco das alterações comuns', async () => {
  const { classifyDatabaseChanges } = await import('../scripts/release-manifest.mjs');
  const common = classifyDatabaseChanges([
    'public/css/style.css',
    'public/js/dashboard.js',
    'docs/DEPLOY_VPS.md'
  ]);
  assert.equal(common.requiresApproval, false);
  assert.deepEqual(common.files, []);

  const critical = classifyDatabaseChanges([
    'server/migrations.js',
    'server/database.js',
    'server/provision-staff.js',
    'backend/server/init-database.js',
    'database/schema.sql',
    'public/index.html'
  ]);
  assert.equal(critical.requiresApproval, true);
  assert.deepEqual(critical.files, [
    'backend/server/init-database.js',
    'database/schema.sql',
    'server/database.js',
    'server/migrations.js',
    'server/provision-staff.js'
  ]);
});

test('manifesto bloqueia sobreposição de arquivo alterado diretamente no servidor', async t => {
  const { verifyReleaseManifest } = await import('../scripts/release-manifest.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rastreon-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const relativePath = 'public/index.html';
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, 'versao-publicada');
  const expectedHash = crypto.createHash('sha256').update('versao-publicada').digest('hex');
  const manifest = { headSha: 'published', files: { [relativePath]: expectedHash } };

  assert.deepEqual(verifyReleaseManifest({ root, manifest }), []);
  fs.writeFileSync(absolutePath, 'alteracao-fora-do-deploy');
  assert.deepEqual(verifyReleaseManifest({ root, manifest }), [
    { file: relativePath, reason: 'modified' }
  ]);
});
