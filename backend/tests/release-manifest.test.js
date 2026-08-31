'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('release separa alterações críticas de banco das alterações comuns', async () => {
  const { classifyDatabaseChanges } = await import('../../deploy/release-manifest.mjs');
  const common = classifyDatabaseChanges([
    'frontend/web/css/style.css',
    'frontend/web/js/dashboard.js',
    'docs/DEPLOY_VPS.md'
  ]);
  assert.equal(common.requiresApproval, false);
  assert.deepEqual(common.files, []);

  const critical = classifyDatabaseChanges([
    'database/migrations.js',
    'database/database.js',
    'backend/server/provision-staff.js',
    'database/init-database.js',
    'database/schema.sql',
    'frontend/web/index.html'
  ]);
  assert.equal(critical.requiresApproval, true);
  assert.deepEqual(critical.files, [
    'backend/server/provision-staff.js',
    'database/database.js',
    'database/init-database.js',
    'database/migrations.js',
    'database/schema.sql'
  ]);
});

test('manifesto bloqueia sobreposição de arquivo alterado diretamente no servidor', async t => {
  const { verifyReleaseManifest } = await import('../../deploy/release-manifest.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rastreon-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const relativePath = 'frontend/web/index.html';
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
