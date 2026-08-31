import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const databaseCriticalPatterns = [
  /^backend\/server\/(?:provision-staff|seed-demo-accounts|set-role)\.js$/,
  /^database\//,
  /^data\//,
  /^deploy\/.*(?:database|migration)/i
];

const runtimeGeneratedFiles = new Set(['frontend/web/js/vehicle-3d-layer.bundle.js']);

export function classifyDatabaseChanges(files) {
  const criticalFiles = [...new Set(files)]
    .filter(file => databaseCriticalPatterns.some(pattern => pattern.test(file)))
    .sort();
  return { requiresApproval: criticalFiles.length > 0, files: criticalFiles };
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function gitLines(root, args, { nul = false } = {}) {
  const output = execFileSync('git', args, { cwd: root, encoding: nul ? 'buffer' : 'utf8' });
  if (nul) return output.toString('utf8').split('\0').filter(Boolean);
  return output
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean);
}

export function createReleaseManifest({ root, baseSha, headSha }) {
  const changedFiles = gitLines(root, ['diff', '--name-only', baseSha, headSha]);
  const trackedFiles = gitLines(root, ['ls-files', '-z'], { nul: true });
  const files = {};
  for (const relativePath of trackedFiles) {
    if (runtimeGeneratedFiles.has(relativePath)) continue;
    const absolutePath = path.join(root, relativePath);
    if (fs.statSync(absolutePath).isFile()) files[relativePath] = hashFile(absolutePath);
  }
  return {
    schemaVersion: 1,
    baseSha,
    headSha,
    database: classifyDatabaseChanges(changedFiles),
    changedFiles,
    files
  };
}

export function verifyReleaseManifest({ root, manifest }) {
  const drift = [];
  for (const [relativePath, expectedHash] of Object.entries(manifest.files || {})) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      drift.push({ file: relativePath, reason: 'missing' });
      continue;
    }
    if (hashFile(absolutePath) !== expectedHash)
      drift.push({ file: relativePath, reason: 'modified' });
  }
  return drift;
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function runCli() {
  const command = process.argv[2];
  if (command === 'create') {
    const root = path.resolve(argument('root') || process.cwd());
    const output = path.resolve(argument('output') || 'rastreon-release-manifest.json');
    const baseSha = argument('base');
    const headSha = argument('head');
    if (!baseSha || !headSha) throw new Error('create exige --base e --head.');
    const manifest = createReleaseManifest({ root, baseSha, headSha });
    fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${manifest.database.requiresApproval ? 'critical' : 'none'}\n`);
    return;
  }
  if (command === 'verify') {
    const root = path.resolve(argument('root') || process.cwd());
    const manifestPath = path.resolve(argument('manifest'));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const drift = verifyReleaseManifest({ root, manifest });
    if (drift.length) {
      console.error('Arquivos da release publicada foram alterados fora do fluxo de deploy:');
      for (const item of drift.slice(0, 50)) console.error(`- ${item.file} (${item.reason})`);
      process.exitCode = 2;
    } else process.stdout.write(`Release ${manifest.headSha} sem divergência no servidor.\n`);
    return;
  }
  throw new Error('Use create ou verify.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
