'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const scriptDir = __dirname;
const codexRoot = path.join(process.env.USERPROFILE || '', '.codex');
const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
const exportRoot = path.join(desktop, `Codex-History-Export-${stamp}`);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function copyIfExists(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

try {
  const sessions = path.join(codexRoot, 'sessions');
  const stateDb = path.join(codexRoot, 'state_5.sqlite');
  if (!fs.existsSync(sessions)) fail(`Sessions directory not found: ${sessions}`);
  if (!fs.existsSync(stateDb)) fail(`History database not found: ${stateDb}`);

  const db = new DatabaseSync(stateDb);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();

  fs.mkdirSync(exportRoot, { recursive: true });
  copyIfExists(sessions, path.join(exportRoot, 'sessions'));
  copyIfExists(path.join(codexRoot, 'archived_sessions'), path.join(exportRoot, 'archived_sessions'));
  copyIfExists(path.join(codexRoot, 'session_index.jsonl'), path.join(exportRoot, 'session_index.source.jsonl'));
  fs.copyFileSync(stateDb, path.join(exportRoot, 'state_5.source.sqlite'));

  const importerSources = {
    'Import-Codex-History-To-OpenAI.cmd': path.join(scriptDir, '..', '01-entry', 'Import-Codex-History-To-OpenAI.cmd'),
    'import-codex-history-to-openai.js': path.join(scriptDir, 'import-codex-history-to-openai.js'),
  };
  for (const [name, source] of Object.entries(importerSources)) {
    if (!fs.existsSync(source)) fail(`Importer component not found: ${source}`);
    fs.copyFileSync(source, path.join(exportRoot, name));
  }

  const manifestFiles = walkFiles(exportRoot)
    .filter(file => path.basename(file) !== 'checksums.json')
    .map(file => ({ path: path.relative(exportRoot, file), sha256: sha256(file), size: fs.statSync(file).size }));
  fs.writeFileSync(path.join(exportRoot, 'checksums.json'), JSON.stringify({ version: 1, files: manifestFiles }, null, 2), 'utf8');

  const sessionCount = manifestFiles.filter(item => item.path.startsWith(`sessions${path.sep}`) && item.path.endsWith('.jsonl')).length;
  const archivedCount = manifestFiles.filter(item => item.path.startsWith(`archived_sessions${path.sep}`) && item.path.endsWith('.jsonl')).length;
  console.log('Export complete.');
  console.log(`Package: ${exportRoot}`);
  console.log(`Active sessions: ${sessionCount}`);
  console.log(`Archived sessions: ${archivedCount}`);
  console.log('Copy the entire export folder to the other computer, then double-click Import-Codex-History-To-OpenAI.cmd inside it.');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
