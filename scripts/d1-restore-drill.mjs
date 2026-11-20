#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID, webcrypto } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseDir = join(repoRoot, ".local", "backup-drills");
const drillId = `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`;
const drillDir = join(baseDir, drillId);
const sourceDir = join(drillDir, "source");
const restoreDir = join(drillDir, "restore");
const truncatedRestoreDir = join(drillDir, "truncated-restore");
const configPath = join(drillDir, "wrangler.jsonc");
const restoreConfigPath = join(restoreDir, "wrangler.jsonc");
const truncatedRestoreConfigPath = join(truncatedRestoreDir, "wrangler.jsonc");
const fixturePath = join(drillDir, "synthetic-fixture.sql");
const dumpPath = join(drillDir, "d1-backup.sql");
const truncatedDumpPath = join(drillDir, "d1-backup-truncated.sql");
const cipherPath = join(drillDir, "synthetic-document-ciphertext.enc");
const sourcePrimaryPath = join(drillDir, "source-primary-ciphertext.enc");
const sourceBackupPath = join(drillDir, "source-backup-ciphertext.enc");
const restoredPrimaryPath = join(drillDir, "restored-primary-ciphertext.enc");
const restoredBackupPath = join(drillDir, "restored-backup-ciphertext.enc");
const manifestPath = join(drillDir, "manifest.json");
const marker = `synthetic-backup-drill-${randomUUID()}`;
const databaseName = `marcia-drill-${randomUUID().slice(0, 8)}`;
const tenantId = randomUUID();
const userId = randomUUID();
const documentId = randomUUID();
const backupCopyId = randomUUID();
const createdAt = new Date().toISOString();
const primaryObjectKey = `tenants/${tenantId}/documents/${documentId}.enc`;
const backupObjectKey = `copies/${tenantId}/${documentId}/${backupCopyId}.enc`;
const primaryBucketName = `${databaseName}-documents`;
const backupBucketName = `${databaseName}-document-backup`;
const restoredPrimaryBucketName = `${databaseName}-restored-documents`;
const restoredBackupBucketName = `${databaseName}-restored-document-backup`;
const plaintext = Buffer.from("%PDF-1.4\n% synthetic backup recovery fixture\n%%EOF\n", "utf8");
const keyBytes = randomBytes(32);
const iv = randomBytes(12);

function writePrivate(path, contents) {
  writeFileSync(path, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

function writePrivateBytes(path, contents) {
  writeFileSync(path, contents, { mode: 0o600, flag: "wx" });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function wrangler(args, cwd = sourceDir) {
  const selectedConfigPath = cwd === restoreDir ? restoreConfigPath
    : cwd === truncatedRestoreDir ? truncatedRestoreConfigPath : configPath;
  execFileSync(
    "pnpm",
    ["--filter", "@marcia/api", "exec", "wrangler", "--cwd", cwd, "--config", selectedConfigPath, ...args],
    { cwd: repoRoot, env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }, stdio: "inherit" },
  );
}

function wranglerOutput(args, cwd = sourceDir) {
  const selectedConfigPath = cwd === restoreDir ? restoreConfigPath
    : cwd === truncatedRestoreDir ? truncatedRestoreConfigPath : configPath;
  return execFileSync(
    "pnpm",
    ["--filter", "@marcia/api", "exec", "wrangler", "--cwd", cwd, "--config", selectedConfigPath, ...args],
    {
      cwd: repoRoot,
      env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
}

function expectWranglerFailure(args, cwd, expectedFailure, message) {
  const selectedConfigPath = cwd === restoreDir ? restoreConfigPath
    : cwd === truncatedRestoreDir ? truncatedRestoreConfigPath : configPath;
  try {
    execFileSync(
      "pnpm",
      ["--filter", "@marcia/api", "exec", "wrangler", "--cwd", cwd, "--config", selectedConfigPath, ...args],
      {
        cwd: repoRoot,
        env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    if (typeof error?.status === "number" && error.status !== 0) {
      const output = [error.stdout, error.stderr, error.message].map(String).join("\n");
      if (expectedFailure.test(output)) return output;
      throw new Error(`${message} The import failed for an unexpected reason: ${output.slice(-1600)}`);
    }
    throw error;
  }
  throw new Error(message);
}

function queryD1(cwd, sql) {
  const output = wranglerOutput([
    "d1", "execute", "DB", "--local", "--json", "--command", sql,
  ], cwd);
  const parsed = JSON.parse(output);
  const statements = Array.isArray(parsed) ? parsed : [parsed];
  return statements.flatMap((statement) => statement.results ?? []);
}

function quoteSql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function createCiphertext() {
  const key = await webcrypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const additionalData = Buffer.from(`marcia-document|1|${tenantId}|${documentId}`, "utf8");
  const ciphertext = Buffer.from(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, key, plaintext));
  return { key, ciphertext, additionalData };
}

async function decryptWithOptionalKey(ciphertext, candidateKeyBytes, ivBytes, additionalData) {
  if (!candidateKeyBytes) return null;
  try {
    const candidateKey = await webcrypto.subtle.importKey("raw", candidateKeyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
    return Buffer.from(await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes, additionalData }, candidateKey, ciphertext));
  } catch {
    return null;
  }
}

function sqlitePathFor(cwd) {
  const stateDir = join(cwd, ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
  if (!existsSync(stateDir)) return null;
  const databaseFile = readdirSync(stateDir).find((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite");
  return databaseFile ? join(stateDir, databaseFile) : null;
}

function makeSeedSql(ciphertext) {
  const byteSize = plaintext.byteLength;
  const plaintextHash = sha256(plaintext);
  const ciphertextHash = sha256(ciphertext);
  const ivBase64 = iv.toString("base64");
  return [
    `CREATE TABLE backup_drill_fixture (id INTEGER PRIMARY KEY, marker TEXT NOT NULL UNIQUE);`,
    `INSERT INTO backup_drill_fixture (id, marker) VALUES (1, ${quoteSql(marker)});`,
    `INSERT INTO organizations (tenant_id, created_at) VALUES (${quoteSql(tenantId)}, ${quoteSql(createdAt)});`,
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (${quoteSql(userId)}, 'Usuário Sintético', 'backup-drill@example.invalid', 1, ${quoteSql(createdAt)}, ${quoteSql(createdAt)});`,
    `INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at) VALUES (${quoteSql(tenantId)}, ${quoteSql(userId)}, 'owner', ${quoteSql(createdAt)});`,
    `INSERT INTO documents (
      tenant_id, document_id, object_key, file_name, mime_type, byte_size, sha256, encryption_key_version,
      encryption_iv, status, created_at, updated_at, created_by_user_id, updated_by_user_id, backup_required
    ) VALUES (
      ${quoteSql(tenantId)}, ${quoteSql(documentId)}, ${quoteSql(primaryObjectKey)}, 'fixture-sintetico.pdf',
      'application/pdf', ${byteSize}, ${quoteSql(plaintextHash)}, 1, ${quoteSql(ivBase64)}, 'uploading',
      ${quoteSql(createdAt)}, ${quoteSql(createdAt)}, ${quoteSql(userId)}, ${quoteSql(userId)}, 1
    );`,
    `INSERT INTO document_backup_copy_events (
      backup_copy_id, tenant_id, document_id, backup_target, backup_object_key, ciphertext_sha256,
      ciphertext_byte_size, encryption_key_version, copied_at
    ) VALUES (
      ${quoteSql(backupCopyId)}, ${quoteSql(tenantId)}, ${quoteSql(documentId)}, 'r2-documents-v1',
      ${quoteSql(backupObjectKey)}, ${quoteSql(ciphertextHash)}, ${ciphertext.byteLength}, 1, ${quoteSql(createdAt)}
    );`,
    `UPDATE documents SET status = 'ready', updated_at = ${quoteSql(createdAt)} WHERE tenant_id = ${quoteSql(tenantId)} AND document_id = ${quoteSql(documentId)};`,
    `INSERT INTO document_audit_events (tenant_id, event_id, document_id, actor_user_id, action, created_at, request_id)
      VALUES (${quoteSql(tenantId)}, ${quoteSql(randomUUID())}, ${quoteSql(documentId)}, ${quoteSql(userId)}, 'upload_started', ${quoteSql(createdAt)}, ${quoteSql(marker)});`,
    "",
  ].join("\n");
}

try {
  mkdirSync(sourceDir, { recursive: true, mode: 0o700 });
  mkdirSync(restoreDir, { recursive: true, mode: 0o700 });
  mkdirSync(truncatedRestoreDir, { recursive: true, mode: 0o700 });
  chmodSync(baseDir, 0o700);
  chmodSync(drillDir, 0o700);
  chmodSync(sourceDir, 0o700);
  chmodSync(restoreDir, 0o700);
  chmodSync(truncatedRestoreDir, 0o700);

  const config = {
    $schema: "../../../apps/api/node_modules/wrangler/config-schema.json",
    name: "marcia-d1-r2-backup-drill-local-only",
    main: "../../../apps/api/src/index.ts",
    compatibility_date: "2026-11-18",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: false,
    preview_urls: false,
    routes: [],
    send_metrics: false,
    d1_databases: [{
      binding: "DB",
      database_name: databaseName,
      database_id: "LOCAL_ONLY_NOT_A_DEPLOYABLE_DATABASE_ID",
      migrations_dir: "../../../apps/api/migrations",
      remote: false,
    }],
    r2_buckets: [
      { binding: "DOCUMENTS", bucket_name: primaryBucketName, remote: false },
      { binding: "BACKUP_DOCUMENTS", bucket_name: backupBucketName, remote: false },
    ],
  };
  writePrivate(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const restoreConfig = {
    ...config,
    name: "marcia-d1-r2-restore-drill-local-only",
    d1_databases: [{
      ...config.d1_databases[0],
      database_name: `${databaseName}-restore`,
      database_id: "LOCAL_RESTORE_ONLY_NOT_A_DEPLOYABLE_DATABASE_ID",
    }],
    r2_buckets: [
      { binding: "DOCUMENTS", bucket_name: restoredPrimaryBucketName, remote: false },
      { binding: "BACKUP_DOCUMENTS", bucket_name: restoredBackupBucketName, remote: false },
    ],
  };
  writePrivate(restoreConfigPath, `${JSON.stringify(restoreConfig, null, 2)}\n`);
  const truncatedRestoreConfig = {
    ...restoreConfig,
    name: "marcia-d1-truncated-restore-drill-local-only",
    d1_databases: [{
      ...restoreConfig.d1_databases[0],
      database_name: `${databaseName}-truncated-restore`,
      database_id: "LOCAL_TRUNCATED_RESTORE_ONLY_NOT_A_DEPLOYABLE_DATABASE_ID",
    }],
  };
  writePrivate(truncatedRestoreConfigPath, `${JSON.stringify(truncatedRestoreConfig, null, 2)}\n`);

  const { key, ciphertext, additionalData } = await createCiphertext();
  const ciphertextHash = sha256(ciphertext);
  const plaintextHash = sha256(plaintext);
  writePrivateBytes(cipherPath, ciphertext);
  writePrivate(fixturePath, makeSeedSql(ciphertext));

  console.log("Aplicando migrations atuais em D1 Wrangler isolado/local.");
  wrangler(["d1", "migrations", "apply", "DB", "--local"]);
  wrangler(["d1", "execute", "DB", "--local", "--file", fixturePath, "--yes"]);

  console.log("Gravando o PDF cifrado sintético nos dois buckets R2 locais.");
  wrangler([
    "r2", "object", "put", `${primaryBucketName}/${primaryObjectKey}`, "--local",
    "--file", cipherPath, "--content-type", "application/octet-stream", "--force",
  ]);
  wrangler([
    "r2", "object", "put", `${backupBucketName}/${backupObjectKey}`, "--local",
    "--file", cipherPath, "--content-type", "application/octet-stream", "--force",
  ]);

  console.log("Exportando D1 em formato importável e copiando o backup R2 para o estado de restauração separado.");
  wrangler([
    "d1", "export", "DB", "--local",
    "--compatibility", "d1", "--skip-confirmation", "--output", dumpPath,
  ]);
  const dump = readFileSync(dumpPath);
  assert(dump.length > 0, "O export D1 ficou vazio; o ensaio foi interrompido.");
  assert(dump.includes(Buffer.from(marker)), "O export não contém o marcador sintético esperado.");
  const markerOffset = dump.indexOf(Buffer.from(marker));
  const truncationPoint = markerOffset + Math.floor(Buffer.byteLength(marker) / 2);
  assert(markerOffset > 0 && truncationPoint < dump.length, "Não foi possível preparar o dump truncado sintético.");
  writePrivateBytes(truncatedDumpPath, dump.subarray(0, truncationPoint));
  console.log("Tentando restaurar um dump intencionalmente truncado em D1 local descartável.");
  expectWranglerFailure(
    ["d1", "execute", "DB", "--local", "--file", truncatedDumpPath, "--yes"],
    truncatedRestoreDir,
    /D1_ERROR|SQLITE_ERROR|incomplete input|unrecognized token|unclosed|syntax error|unterminated/i,
    "O Wrangler aceitou um dump SQL truncado; a restauração deve falhar antes de ser aprovada.",
  );
  const truncatedSqlitePath = sqlitePathFor(truncatedRestoreDir);
  assert(truncatedSqlitePath, "A tentativa de restore não criou a D1 local isolada para inspeção.");
  const truncatedTableCount = Number(execFileSync("sqlite3", [truncatedSqlitePath,
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"], { encoding: "utf8" }).trim());
  const markerTableExists = execFileSync("sqlite3", [truncatedSqlitePath,
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'backup_drill_fixture';"], { encoding: "utf8" }).trim() === "1";
  const markerRows = markerTableExists ? Number(execFileSync("sqlite3", [truncatedSqlitePath,
    `SELECT COUNT(*) FROM backup_drill_fixture WHERE marker = ${quoteSql(marker)};`], { encoding: "utf8" }).trim()) : 0;
  assert(markerRows === 0, "Um dump rejeitado deixou o marcador de restauração parcial ativo.");
  const documentsTableExists = execFileSync("sqlite3", [truncatedSqlitePath,
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'documents';"], { encoding: "utf8" }).trim() === "1";
  const readyDocuments = documentsTableExists ? Number(execFileSync("sqlite3", [truncatedSqlitePath,
    `SELECT COUNT(*) FROM documents WHERE tenant_id = ${quoteSql(tenantId)} AND document_id = ${quoteSql(documentId)} AND status = 'ready';`],
  { encoding: "utf8" }).trim()) : 0;
  assert(readyDocuments === 0, "Um dump rejeitado deixou um documento sintético como pronto na D1 parcial.");
  // Import the complete dump into a separate, empty local D1. The dump already contains
  // d1_migrations, so applying migrations first would correctly reject duplicate IDs.
  wrangler(["d1", "execute", "DB", "--local", "--file", dumpPath, "--yes"], restoreDir);

  wrangler([
    "r2", "object", "get", `${backupBucketName}/${backupObjectKey}`, "--local",
    "--file", sourceBackupPath,
  ]);
  wrangler([
    "r2", "object", "get", `${primaryBucketName}/${primaryObjectKey}`, "--local",
    "--file", sourcePrimaryPath,
  ]);
  const sourceBackupCiphertext = readFileSync(sourceBackupPath);
  const sourcePrimaryCiphertext = readFileSync(sourcePrimaryPath);
  assert(sha256(sourceBackupCiphertext) === ciphertextHash, "A cópia R2 de backup diverge do hash original.");
  assert(sha256(sourcePrimaryCiphertext) === ciphertextHash, "A cópia R2 primária diverge do hash original.");

  wrangler([
    "r2", "object", "put", `${restoredPrimaryBucketName}/${primaryObjectKey}`, "--local",
    "--file", sourceBackupPath, "--content-type", "application/octet-stream", "--force",
  ], restoreDir);
  wrangler([
    "r2", "object", "put", `${restoredBackupBucketName}/${backupObjectKey}`, "--local",
    "--file", sourceBackupPath, "--content-type", "application/octet-stream", "--force",
  ], restoreDir);
  wrangler([
    "r2", "object", "get", `${restoredPrimaryBucketName}/${primaryObjectKey}`, "--local",
    "--file", restoredPrimaryPath,
  ], restoreDir);
  wrangler([
    "r2", "object", "get", `${restoredBackupBucketName}/${backupObjectKey}`, "--local",
    "--file", restoredBackupPath,
  ], restoreDir);
  const restoredPrimaryCiphertext = readFileSync(restoredPrimaryPath);
  const restoredBackupCiphertext = readFileSync(restoredBackupPath);
  assert(sha256(restoredPrimaryCiphertext) === ciphertextHash, "O ciphertext primário restaurado não confere com o SHA-256.");
  assert(sha256(restoredBackupCiphertext) === ciphertextHash, "O ciphertext de backup restaurado não confere com o SHA-256.");
  assert(restoredPrimaryCiphertext.equals(restoredBackupCiphertext), "Os objetos R2 restaurados não são idênticos.");

  const decrypted = Buffer.from(await webcrypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData }, key, restoredPrimaryCiphertext));
  assert(decrypted.equals(plaintext), "O PDF restaurado não descriptografa byte a byte com a chave sintética.");
  assert(sha256(decrypted) === plaintextHash, "O SHA-256 plaintext do documento restaurado diverge do D1.");
  const missingKeyPlaintext = await decryptWithOptionalKey(restoredPrimaryCiphertext, null, iv, additionalData);
  assert(missingKeyPlaintext === null, "O ciphertext foi decifrado quando a chave estava ausente.");
  const wrongKeyPlaintext = await decryptWithOptionalKey(restoredPrimaryCiphertext, randomBytes(32), iv, additionalData);
  assert(wrongKeyPlaintext === null, "O ciphertext foi decifrado com uma chave errada.");

  const restoredMarker = queryD1(restoreDir, "SELECT marker FROM backup_drill_fixture WHERE id = 1");
  assert(restoredMarker.length === 1 && restoredMarker[0].marker === marker, "O marcador sintético não apareceu após restaurar D1.");
  const restoredDocument = queryD1(restoreDir, `SELECT d.tenant_id, d.document_id, d.object_key, d.status,
      d.backup_required, d.sha256, d.byte_size, b.backup_object_key, b.ciphertext_sha256, b.ciphertext_byte_size
    FROM documents d JOIN document_backup_copy_events b
      ON b.tenant_id = d.tenant_id AND b.document_id = d.document_id
    WHERE d.tenant_id = ${quoteSql(tenantId)} AND d.document_id = ${quoteSql(documentId)}`);
  assert(restoredDocument.length === 1, "A referência D1 do PDF/cópia não apareceu após restaurar.");
  assert(restoredDocument[0].status === "ready" && restoredDocument[0].backup_required === 1, "O estado D1 restaurado não exige a cópia esperada.");
  assert(restoredDocument[0].object_key === primaryObjectKey && restoredDocument[0].backup_object_key === backupObjectKey, "As object keys D1 não conferem com os objetos R2 restaurados.");
  assert(restoredDocument[0].sha256 === plaintextHash && Number(restoredDocument[0].byte_size) === plaintext.byteLength, "Os metadados plaintext do D1 restaurado não conferem.");
  assert(restoredDocument[0].ciphertext_sha256 === ciphertextHash && Number(restoredDocument[0].ciphertext_byte_size) === ciphertext.byteLength, "Os metadados do ciphertext no D1 restaurado não conferem.");

  // D1 execute does not expose SQLite PRAGMAs. Run the two integrity checks against
  // Wrangler's local SQLite file after all D1-level restore queries have passed.
  const d1StateDir = join(restoreDir, ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
  const restoredSqliteFile = readdirSync(d1StateDir)
    .find((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite");
  assert(restoredSqliteFile, "Não foi possível localizar o SQLite D1 local restaurado.");
  const restoredSqlitePath = join(d1StateDir, restoredSqliteFile);
  const integrity = execFileSync("sqlite3", [restoredSqlitePath, "PRAGMA integrity_check;"], { encoding: "utf8" }).trim();
  assert(integrity === "ok", "O integrity_check da D1 restaurada falhou.");
  const foreignKeys = execFileSync("sqlite3", [restoredSqlitePath, "PRAGMA foreign_key_check;"], { encoding: "utf8" }).trim();
  assert(foreignKeys.length === 0, "O foreign_key_check da D1 restaurada encontrou referências inválidas.");

  const manifest = {
    format: "marcia-local-d1-r2-drill-v2",
    backupId: drillId,
    generatedAt: new Date().toISOString(),
    database: databaseName,
    source: "wrangler-d1-and-r2-local-only",
    compatibility: "d1",
    sql: {
      file: "d1-backup.sql",
      byteLength: dump.length,
      sha256: sha256(dump),
    },
    document: {
      tenantId,
      documentId,
      keyVersion: 1,
      primaryObjectKey,
      backupObjectKey,
      plaintextByteLength: plaintext.byteLength,
      plaintextSha256: plaintextHash,
      ciphertextByteLength: ciphertext.byteLength,
      ciphertextSha256: ciphertextHash,
      encryptionKeyFingerprint: sha256(keyBytes),
      keyMaterialPersisted: false,
    },
    restoredToSeparateLocalState: true,
    d1MarkerVerified: true,
    d1IntegrityCheck: integrity,
    d1ForeignKeyViolations: 0,
    r2PrimaryAndBackupRestoredAndVerified: true,
    plaintextRoundTripVerified: true,
    truncatedSqlImportRejected: true,
    truncatedSqlDidNotLeaveReadyDocument: true,
    truncatedSqlImportedTableCount: truncatedTableCount,
    aesGcmRejectsMissingKey: true,
    aesGcmRejectsWrongKey: true,
    remoteResourcesUsed: false,
    syntheticDataOnly: true,
  };
  writePrivate(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("Ensaio local D1+R2 concluído: SQL completo/truncado, relações, cópias cifradas, chave ausente/incorreta e PDF foram verificados.");
  console.log(`Artefatos sintéticos protegidos em: ${drillDir}`);
  console.log(`SHA-256 do SQL: ${manifest.sql.sha256}`);
  console.log(`SHA-256 ciphertext: ${ciphertextHash}`);
  console.log("Limite: não valida Time Travel, retenção, locks, recuperação/rotação da chave real, isolamento de conta ou operação remota.");
} catch (error) {
  console.error(`Ensaio local falhou. Artefatos parciais foram preservados em: ${drillDir}`);
  console.error(error instanceof Error ? error.message : "Erro desconhecido");
  process.exitCode = 1;
}
