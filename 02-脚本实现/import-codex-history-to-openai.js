'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const packageRoot = __dirname;
const codexRoot = path.join(process.env.USERPROFILE || '', '.codex');
const sourceDbPath = path.join(packageRoot, 'state_5.source.sqlite');
const targetDbPath = path.join(codexRoot, 'state_5.sqlite');
const catalogDbPath = path.join(codexRoot, 'sqlite', 'codex-dev.db');
const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
const backupRoot = path.join(codexRoot, 'backups_state', 'cross-machine-import', stamp);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
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

function verifyPackage() {
  const manifestPath = path.join(packageRoot, 'checksums.json');
  if (!fs.existsSync(manifestPath)) fail('checksums.json is missing from the export package.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const item of manifest.files) {
    const file = path.join(packageRoot, item.path);
    if (!fs.existsSync(file)) fail(`Export file is missing: ${item.path}`);
    if (sha256(file) !== item.sha256) fail(`Checksum mismatch: ${item.path}`);
  }
}

function copyDatabaseWithSidecars(databasePath, destination) {
  if (!fs.existsSync(databasePath)) return;
  fs.copyFileSync(databasePath, path.join(destination, path.basename(databasePath)));
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${databasePath}${suffix}`;
    if (fs.existsSync(sidecar)) fs.copyFileSync(sidecar, path.join(destination, `${path.basename(databasePath)}${suffix}`));
  }
}

function sessionIdFromFile(file) {
  try {
    const firstLine = fs.readFileSync(file, 'utf8').split(/\r?\n/, 1)[0].replace(/^\uFEFF/, '');
    const record = JSON.parse(firstLine);
    return record.type === 'session_meta' ? (record.payload?.id || record.payload?.session_id) : null;
  } catch {
    return null;
  }
}

function normalizeSessionProvider(file) {
  const original = fs.readFileSync(file, 'utf8');
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  const record = JSON.parse(lines[0].replace(/^\uFEFF/, ''));
  if (record.type !== 'session_meta' || !record.payload?.model_provider || record.payload.model_provider === 'openai') return false;
  record.payload.model_provider = 'openai';
  lines[0] = JSON.stringify(record);
  fs.writeFileSync(file, lines.join(newline), 'utf8');
  return true;
}

function mergeSessionIndex() {
  const sourceIndex = path.join(packageRoot, 'session_index.source.jsonl');
  const targetIndex = path.join(codexRoot, 'session_index.jsonl');
  const byId = new Map();
  for (const file of [targetIndex, sourceIndex]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
      try {
        const item = JSON.parse(line.replace(/^\uFEFF/, ''));
        if (item.id && !byId.has(item.id)) byId.set(item.id, item);
      } catch {}
    }
  }
  fs.writeFileSync(targetIndex, [...byId.values()].map(item => JSON.stringify(item)).join('\n') + '\n', 'utf8');
  return byId.size;
}

function insertThread(targetDb, sourceRow, targetRolloutPath) {
  const targetInfo = targetDb.prepare('PRAGMA table_info(threads)').all();
  const sourceColumns = new Set(Object.keys(sourceRow));
  const requiredMissing = targetInfo.filter(column => column.notnull && column.dflt_value == null && !sourceColumns.has(column.name));
  if (requiredMissing.length) throw new Error(`Target threads schema has unsupported required columns: ${requiredMissing.map(column => column.name).join(', ')}`);
  const columns = targetInfo.map(column => column.name).filter(column => sourceColumns.has(column));
  const row = { ...sourceRow, rollout_path: `\\\\?\\${path.resolve(targetRolloutPath)}`, model_provider: 'openai' };
  const sql = `INSERT OR IGNORE INTO threads (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  return Number(targetDb.prepare(sql).run(...columns.map(column => row[column])).changes);
}

try {
  verifyPackage();
  for (const required of [sourceDbPath, targetDbPath, path.join(packageRoot, 'sessions')]) {
    if (!fs.existsSync(required)) fail(`Required path not found: ${required}`);
  }

  fs.mkdirSync(backupRoot, { recursive: true });
  fs.cpSync(path.join(codexRoot, 'sessions'), path.join(backupRoot, 'sessions'), { recursive: true });
  if (fs.existsSync(path.join(codexRoot, 'archived_sessions'))) {
    fs.cpSync(path.join(codexRoot, 'archived_sessions'), path.join(backupRoot, 'archived_sessions'), { recursive: true });
  }
  copyDatabaseWithSidecars(targetDbPath, backupRoot);
  copyDatabaseWithSidecars(catalogDbPath, backupRoot);
  if (fs.existsSync(path.join(codexRoot, 'session_index.jsonl'))) {
    fs.copyFileSync(path.join(codexRoot, 'session_index.jsonl'), path.join(backupRoot, 'session_index.jsonl'));
  }

  const targetFilesById = new Map();
  for (const rootName of ['sessions', 'archived_sessions']) {
    for (const file of walkFiles(path.join(codexRoot, rootName)).filter(file => file.endsWith('.jsonl'))) {
      const id = sessionIdFromFile(file);
      if (id) targetFilesById.set(id, file);
    }
  }

  let copiedFiles = 0;
  let conflicts = 0;
  for (const rootName of ['sessions', 'archived_sessions']) {
    const sourceRoot = path.join(packageRoot, rootName);
    for (const sourceFile of walkFiles(sourceRoot).filter(file => file.endsWith('.jsonl'))) {
      const id = sessionIdFromFile(sourceFile);
      if (!id) continue;
      if (targetFilesById.has(id)) {
        if (sha256(sourceFile) !== sha256(targetFilesById.get(id))) conflicts += 1;
        continue;
      }
      const targetFile = path.join(codexRoot, rootName, path.relative(sourceRoot, sourceFile));
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.copyFileSync(sourceFile, targetFile);
      targetFilesById.set(id, targetFile);
      copiedFiles += 1;
    }
  }

  let normalizedFiles = 0;
  for (const file of targetFilesById.values()) {
    try { if (normalizeSessionProvider(file)) normalizedFiles += 1; } catch {}
  }

  const sourceDb = new DatabaseSync(sourceDbPath, { readOnly: true });
  const targetDb = new DatabaseSync(targetDbPath);
  const sourceRows = sourceDb.prepare('SELECT * FROM threads').all();
  const existing = targetDb.prepare('SELECT 1 FROM threads WHERE id = ?');
  let insertedThreads = 0;
  targetDb.exec('BEGIN IMMEDIATE');
  try {
    for (const row of sourceRows) {
      if (existing.get(row.id) || !targetFilesById.has(row.id)) continue;
      insertedThreads += insertThread(targetDb, row, targetFilesById.get(row.id));
    }
    targetDb.prepare("UPDATE threads SET model_provider = 'openai' WHERE model_provider <> 'openai'").run();
    targetDb.exec('COMMIT');
  } catch (error) {
    targetDb.exec('ROLLBACK');
    throw error;
  }
  sourceDb.close();
  targetDb.close();

  let normalizedCatalogRows = 0;
  let insertedCatalogRows = 0;
  if (fs.existsSync(catalogDbPath)) {
    const catalogDb = new DatabaseSync(catalogDbPath);
    const tables = new Set(catalogDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
    if (tables.has('local_thread_catalog')) {
      catalogDb.exec('BEGIN IMMEDIATE');
      try {
        if (tables.has('local_thread_catalog_hosts')) {
          catalogDb.prepare("INSERT OR IGNORE INTO local_thread_catalog_hosts (host_id, host_kind) VALUES ('local', 'local')").run();
        }
        let sequence = Number(catalogDb.prepare('SELECT COALESCE(MAX(observation_sequence), 0) AS value FROM local_thread_catalog').get().value);
        const insertCatalog = catalogDb.prepare(`
          INSERT OR IGNORE INTO local_thread_catalog (
            host_id, thread_id, display_title, source_created_at, source_updated_at,
            cwd, source_kind, source_detail, model_provider, git_branch,
            observation_sequence, missing_candidate, thread_source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        `);
        for (const row of sourceRows) {
          if (!targetFilesById.has(row.id)) continue;
          sequence += 1;
          insertedCatalogRows += Number(insertCatalog.run(
            'local', row.id, row.title || row.first_user_message || row.id,
            row.created_at, row.updated_at, row.cwd || '', row.source || 'vscode', null,
            'openai', row.git_branch ?? null, sequence, row.thread_source ?? null
          ).changes);
        }
        normalizedCatalogRows = Number(catalogDb.prepare("UPDATE local_thread_catalog SET model_provider = 'openai' WHERE model_provider <> 'openai'").run().changes);
        if (tables.has('local_thread_catalog_metadata')) {
          catalogDb.prepare('UPDATE local_thread_catalog_metadata SET catalog_revision = catalog_revision + 1 WHERE id = 1').run();
        }
        catalogDb.exec('COMMIT');
      } catch (error) {
        catalogDb.exec('ROLLBACK');
        throw error;
      }
    }
    catalogDb.close();
  }

  const indexEntries = mergeSessionIndex();
  console.log('Import complete.');
  console.log(`New session files copied: ${copiedFiles}`);
  console.log(`New threads inserted into state_5.sqlite: ${insertedThreads}`);
  console.log(`Session files normalized to openai: ${normalizedFiles}`);
  console.log(`New local catalog rows inserted: ${insertedCatalogRows}`);
  console.log(`Existing catalog rows normalized: ${normalizedCatalogRows}`);
  console.log(`Session index entries after merge: ${indexEntries}`);
  console.log(`Conflicting existing session IDs kept on target: ${conflicts}`);
  console.log(`Backup: ${backupRoot}`);
  console.log('Codex++ history repair is not required. Start Codex with the official OpenAI provider and verify history.');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
