import {
  DocumentConsentText,
  DocumentConsentVersion,
  LegacyDocumentConsentText,
  DocumentFileSchema,
  DocumentsResponseSchema,
  DocumentSigningCreateSchema,
  DocumentSigningReceiptSchema,
  DocumentSigningReceiptsResponseSchema,
  DocumentStatusChangeSchema,
  DocumentStatusResponseSchema,
} from "../../../packages/contracts/src/index";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_DOCUMENT_BYTES + 64 * 1024;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

type DocumentSession = {
  user: { id: string; name: string; email: string };
  tenant: { id: string; role: "owner" | "member" };
};
type DocumentBindings = Env & {
  DOCUMENTS_ENCRYPTION_KEY?: string;
  BACKUP_DOCUMENTS?: R2Bucket;
  DOCUMENT_BACKUP_ENABLED?: string;
};

type DocumentRow = {
  document_id: string;
  tenant_id: string;
  matter_id: string | null;
  case_id: string | null;
  file_name: string;
  mime_type: "application/pdf";
  byte_size: number;
  sha256: string;
  status: "ready" | "archived";
  created_at: string;
  updated_at: string;
};

type DocumentSigningRow = {
  signature_id: string;
  document_id: string;
  document_sha256: string;
  signer_user_id: string;
  signer_name: string;
  signer_email: string;
  confirmed_name: string;
  consent_version: "v1" | typeof DocumentConsentVersion;
  consent_text: typeof LegacyDocumentConsentText | typeof DocumentConsentText;
  consented_at: string;
  request_id: string;
  receipt_sha256: string;
};

type DocumentBackupCopyRow = {
  backup_copy_id: string;
  backup_target: "r2-documents-v1";
  backup_object_key: string;
  ciphertext_sha256: string;
  ciphertext_byte_size: number;
  encryption_key_version: number;
};

type DocumentBackupOutcome = "recovered" | "copy_record_missing" | "backup_binding_unavailable" | "backup_lookup_error"
  | "backup_object_missing" | "backup_metadata_mismatch" | "backup_ciphertext_mismatch"
  | "backup_decryption_failed" | "backup_storage_error";

type SigningReceiptData = {
  id: string;
  documentId: string;
  documentSha256: string;
  signerUserId: string;
  signerName: string;
  signerEmail: string;
  confirmedName: string;
  consentVersion: "v1" | typeof DocumentConsentVersion;
  consentText: typeof LegacyDocumentConsentText | typeof DocumentConsentText;
  consentedAt: string;
  requestId: string;
};

function json(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function fileName(value: string): string {
  const withoutControlCharacters = [...value.normalize("NFKC")]
    .filter((character) => character.charCodeAt(0) >= 0x20 && character.charCodeAt(0) !== 0x7f)
    .join("");
  const clean = withoutControlCharacters
    .split(/[\\/]/).at(-1)?.trim().replace(/[<>:"|?*]/g, "-") ?? "";
  const withoutPdf = clean.replace(/\.pdf$/i, "").trim();
  const stem = [...withoutPdf].slice(0, 175).join("") || "Documento";
  return `${stem}.pdf`;
}

function base64Bytes(value: string): Uint8Array {
  const decoded = atob(value.trim());
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function base64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function decryptAndVerifyDocument(
  ciphertext: Uint8Array,
  key: CryptoKey,
  tenantId: string,
  documentId: string,
  iv: string,
  expectedByteSize: number,
  expectedSha256: string,
  expectedCiphertextSha256?: string,
): Promise<Uint8Array | null> {
  if (expectedCiphertextSha256 && await sha256Hex(ciphertext) !== expectedCiphertextSha256) return null;
  try {
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: base64Bytes(iv),
      additionalData: documentAad(tenantId, documentId),
    }, key, ciphertext));
    if (plaintext.byteLength !== expectedByteSize || await sha256Hex(plaintext) !== expectedSha256) return null;
    return plaintext;
  } catch {
    return null;
  }
}

async function storedCiphertextMatches(
  bucket: R2Bucket,
  objectKey: string,
  expected: { tenantId: string; documentId: string; keyVersion: string; ciphertextSha256: string; byteSize: number },
): Promise<boolean> {
  const object = await bucket.get(objectKey);
  if (!object || object.size !== expected.byteSize
    || object.customMetadata?.tenantId !== expected.tenantId
    || object.customMetadata?.documentId !== expected.documentId
    || object.customMetadata?.keyVersion !== expected.keyVersion
    || object.customMetadata?.ciphertextSha256 !== expected.ciphertextSha256) return false;
  return await sha256Hex(new Uint8Array(await object.arrayBuffer())) === expected.ciphertextSha256;
}

async function documentKey(env: DocumentBindings): Promise<CryptoKey | null> {
  try {
    const encoded = env.DOCUMENTS_ENCRYPTION_KEY;
    if (!encoded) return null;
    const raw = base64Bytes(encoded);
    if (raw.byteLength !== 32) return null;
    return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

function documentAad(tenantId: string, documentId: string): Uint8Array {
  return new TextEncoder().encode(`marcia-document|1|${tenantId}|${documentId}`);
}

function auditStatement(env: DocumentBindings, input: {
  tenantId: string; documentId: string; userId: string; action: string; now: string; requestId: string;
  condition?: string;
}): D1PreparedStatement {
  const condition = input.condition ? ` WHERE ${input.condition}` : "";
  return env.DB.prepare(`INSERT INTO document_audit_events (
    tenant_id, event_id, document_id, actor_user_id, action, created_at, request_id
  ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7${condition}`)
    .bind(input.tenantId, crypto.randomUUID(), input.documentId, input.userId, input.action, input.now, input.requestId);
}

function backupRecoveryStatement(env: DocumentBindings, input: {
  tenantId: string; documentId: string; backupCopyId: string | null; userId: string; requestId: string;
  primaryFailure: string; backupOutcome: DocumentBackupOutcome; primaryRepaired: boolean; now: string;
}): D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO document_backup_recovery_events (
    recovery_event_id, tenant_id, document_id, backup_copy_id, actor_user_id, request_id,
    primary_failure, backup_outcome, primary_repaired, recovered_at
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
    .bind(crypto.randomUUID(), input.tenantId, input.documentId, input.backupCopyId, input.userId,
      input.requestId, input.primaryFailure, input.backupOutcome, input.primaryRepaired ? 1 : 0, input.now);
}

function documentFromRow(row: DocumentRow): unknown {
  return DocumentFileSchema.parse({
    id: row.document_id,
    tenantId: row.tenant_id,
    matterId: row.matter_id,
    caseId: row.case_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function readBoundedBody(request: Request): Promise<Uint8Array | "too_large"> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        return "too_large";
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

async function readSmallJson(request: Request): Promise<unknown | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 4096) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return null; }
}

function canonicalReceiptPayload(receipt: SigningReceiptData): string {
  return JSON.stringify({
    version: 1,
    id: receipt.id,
    documentId: receipt.documentId,
    documentSha256: receipt.documentSha256,
    signerUserId: receipt.signerUserId,
    signerName: receipt.signerName,
    signerEmail: receipt.signerEmail,
    confirmedName: receipt.confirmedName,
    consentVersion: receipt.consentVersion,
    consentText: receipt.consentText,
    consentedAt: receipt.consentedAt,
    requestId: receipt.requestId,
  });
}

async function receiptHash(receipt: SigningReceiptData): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalReceiptPayload(receipt)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function receiptDataFromRow(row: DocumentSigningRow): SigningReceiptData {
  return {
    id: row.signature_id,
    documentId: row.document_id,
    documentSha256: row.document_sha256,
    signerUserId: row.signer_user_id,
    signerName: row.signer_name,
    signerEmail: row.signer_email,
    confirmedName: row.confirmed_name,
    consentVersion: row.consent_version,
    consentText: row.consent_text,
    consentedAt: row.consented_at,
    requestId: row.request_id,
  };
}

function normalizeSignerName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

async function listDocumentSigningRecords(env: DocumentBindings, auth: DocumentSession, documentId: string): Promise<Response> {
  const document = await env.DB.prepare("SELECT document_id FROM documents WHERE tenant_id = ?1 AND document_id = ?2")
    .bind(auth.tenant.id, documentId).first<{ document_id: string }>();
  if (!document) return json({ error: "not_found" }, 404);
  const rows = await env.DB.prepare(`SELECT signature_id, document_id, document_sha256, signer_user_id, signer_name, signer_email,
      confirmed_name, consent_version, consent_text, consented_at, request_id, receipt_sha256
    FROM document_signing_records WHERE tenant_id = ?1 AND document_id = ?2
    ORDER BY consented_at DESC, signature_id DESC LIMIT 100`)
    .bind(auth.tenant.id, documentId).all<DocumentSigningRow>();
  const items = await Promise.all(rows.results.map(async (row) => {
    const data = receiptDataFromRow(row);
    const canonicalPayload = canonicalReceiptPayload(data);
    if (await receiptHash(data) !== row.receipt_sha256) throw new Error("document_signing_receipt_integrity_failed");
    return DocumentSigningReceiptSchema.parse({ ...data, canonicalPayload, receiptSha256: row.receipt_sha256 });
  }));
  return json(DocumentSigningReceiptsResponseSchema.parse({ items }), 200);
}

async function createDocumentSigningRecord(request: Request, env: DocumentBindings, auth: DocumentSession, documentId: string): Promise<Response> {
  const parsed = DocumentSigningCreateSchema.safeParse(await readSmallJson(request));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  if (normalizeSignerName(parsed.data.confirmName) !== normalizeSignerName(auth.user.name)) {
    return json({ error: "signer_name_mismatch" }, 422);
  }

  const document = await env.DB.prepare(`SELECT document_id, sha256, status FROM documents
    WHERE tenant_id = ?1 AND document_id = ?2`)
    .bind(auth.tenant.id, documentId).first<{ document_id: string; sha256: string; status: string }>();
  if (!document) return json({ error: "not_found" }, 404);
  if (document.status !== "ready") return json({ error: "document_not_ready" }, 409);
  const existing = await env.DB.prepare(`SELECT signature_id FROM document_signing_records
    WHERE tenant_id = ?1 AND document_id = ?2 AND signer_user_id = ?3 AND document_sha256 = ?4`)
    .bind(auth.tenant.id, documentId, auth.user.id, document.sha256)
    .first<{ signature_id: string }>();
  if (existing) return json({ error: "document_already_recorded" }, 409);

  // Re-read/decrypt the private R2 object and verify actual bytes before recording consent.
  const storedFile = await downloadDocument(request, env, auth, documentId);
  if (!storedFile.ok) return json({ error: "document_integrity_unavailable" }, 503);
  let pdfBytes: Uint8Array;
  try { pdfBytes = new Uint8Array(await storedFile.arrayBuffer()); }
  catch { return json({ error: "document_integrity_unavailable" }, 503); }
  if (pdfBytes.byteLength < 5 || new TextDecoder().decode(pdfBytes.subarray(0, 5)) !== "%PDF-" || await sha256Hex(pdfBytes) !== document.sha256) {
    return json({ error: "document_integrity_mismatch" }, 503);
  }

  const data: SigningReceiptData = {
    id: crypto.randomUUID(),
    documentId,
    documentSha256: document.sha256,
    signerUserId: auth.user.id,
    signerName: auth.user.name,
    signerEmail: auth.user.email,
    confirmedName: parsed.data.confirmName.normalize("NFKC").trim().replace(/\s+/g, " "),
    consentVersion: DocumentConsentVersion,
    consentText: DocumentConsentText,
    consentedAt: new Date().toISOString(),
    requestId: /^[A-Za-z0-9-]{1,160}$/.test(request.headers.get("CF-Ray") ?? "")
      ? request.headers.get("CF-Ray")!
      : crypto.randomUUID(),
  };
  const digest = await receiptHash(data);
  const receipt = DocumentSigningReceiptSchema.parse({ ...data, canonicalPayload: canonicalReceiptPayload(data), receiptSha256: digest });

  try {
    const result = await env.DB.prepare(`INSERT INTO document_signing_records (
      tenant_id, signature_id, document_id, document_sha256, signer_user_id, signer_name, signer_email,
      confirmed_name, consent_version, consent_text, consented_at, request_id, receipt_sha256
    ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
    WHERE EXISTS (SELECT 1 FROM documents WHERE tenant_id = ?1 AND document_id = ?3 AND sha256 = ?4 AND status = 'ready')
      AND EXISTS (SELECT 1 FROM tenant_memberships WHERE tenant_id = ?1 AND user_id = ?5)`)
      .bind(auth.tenant.id, data.id, data.documentId, data.documentSha256, data.signerUserId, data.signerName, data.signerEmail,
        data.confirmedName, data.consentVersion, data.consentText, data.consentedAt, data.requestId, digest)
      .run();
    if ((result.meta.changes ?? 0) !== 1) return json({ error: "document_not_ready" }, 409);
  } catch {
    const existing = await env.DB.prepare(`SELECT signature_id FROM document_signing_records
      WHERE tenant_id = ?1 AND document_id = ?2 AND signer_user_id = ?3 AND document_sha256 = ?4`)
      .bind(auth.tenant.id, data.documentId, data.signerUserId, data.documentSha256)
      .first<{ signature_id: string }>();
    if (existing) return json({ error: "document_already_recorded" }, 409);
    return json({ error: "document_signing_record_failed" }, 500);
  }
  return json({ item: receipt }, 201);
}

async function listDocuments(request: Request, env: DocumentBindings, auth: DocumentSession): Promise<Response> {
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  const query = `SELECT document_id, tenant_id, matter_id, case_id, file_name, mime_type, byte_size, sha256, status, created_at, updated_at
    FROM documents WHERE tenant_id = ?1 ${includeArchived ? "AND status IN ('ready', 'archived')" : "AND status = 'ready'"}
    ORDER BY created_at DESC, document_id DESC LIMIT 100`;
  const result = await env.DB.prepare(query).bind(auth.tenant.id).all<DocumentRow>();
  return json(DocumentsResponseSchema.parse({ items: result.results.map(documentFromRow) }), 200);
}

async function uploadDocument(request: Request, env: DocumentBindings, auth: DocumentSession): Promise<Response> {
  const key = await documentKey(env);
  if (!key) return json({ error: "document_vault_not_configured" }, 503);
  if (!env.DOCUMENTS) return json({ error: "document_storage_unavailable" }, 503);
  const backupEnabled = env.DOCUMENT_BACKUP_ENABLED === "true";
  if (backupEnabled && !env.BACKUP_DOCUMENTS) return json({ error: "document_backup_unavailable" }, 503);

  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_MULTIPART_BYTES) return json({ error: "document_too_large" }, 413);
  }
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("multipart/form-data;")) {
    return json({ error: "multipart_form_required" }, 415);
  }

  let form: FormData;
  try {
    const boundedBody = await readBoundedBody(request);
    if (boundedBody === "too_large") return json({ error: "document_too_large" }, 413);
    form = await new Response(boundedBody, { headers: { "Content-Type": request.headers.get("Content-Type")! } }).formData();
  }
  catch { return json({ error: "invalid_multipart_form" }, 400); }

  const fileParts = form.getAll("file");
  const upload = fileParts.length === 1 ? fileParts[0] : null;
  if (!(upload instanceof File)) return json({ error: "pdf_file_required" }, 400);
  if (upload.size <= 0) return json({ error: "empty_document" }, 400);
  if (upload.size > MAX_DOCUMENT_BYTES) return json({ error: "document_too_large" }, 413);
  if (!upload.name.toLowerCase().endsWith(".pdf")) return json({ error: "pdf_extension_required" }, 415);
  if (upload.type && upload.type !== "application/pdf" && upload.type !== "application/octet-stream") {
    return json({ error: "pdf_mime_type_required" }, 415);
  }

  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await upload.arrayBuffer()); }
  catch { return json({ error: "document_read_failed" }, 400); }
  if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return json({ error: "pdf_signature_invalid" }, 415);
  }

  const requestedCaseId = form.get("caseId");
  const caseId = typeof requestedCaseId === "string" && requestedCaseId ? requestedCaseId : null;
  if (caseId && !idPattern.test(caseId)) return json({ error: "invalid_case_id" }, 400);
  if (caseId) {
    const linkedCase = await env.DB.prepare("SELECT case_id FROM court_cases WHERE tenant_id = ?1 AND case_id = ?2 AND status = 'active' AND deleted_at IS NULL")
      .bind(auth.tenant.id, caseId).first<{ case_id: string }>();
    if (!linkedCase) return json({ error: "case_not_found_or_archived" }, 404);
  }

  const requestedName = form.get("fileName");
  const displayName = fileName(typeof requestedName === "string" && requestedName.trim() ? requestedName : upload.name);
  const documentId = crypto.randomUUID();
  const objectKey = `tenants/${auth.tenant.id}/documents/${documentId}.enc`;
  const backupCopyId = backupEnabled ? crypto.randomUUID() : null;
  const backupObjectKey = backupCopyId ? `copies/${auth.tenant.id}/${documentId}/${backupCopyId}.enc` : null;
  const now = new Date().toISOString();
  const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID();
  const sha256 = await sha256Hex(bytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: documentAad(auth.tenant.id, documentId) }, key, bytes));
  const ciphertextSha256 = await sha256Hex(ciphertext);
  const ivBase64 = base64(iv);

  try {
    const created = await env.DB.batch([
      env.DB.prepare(`INSERT INTO documents (
        tenant_id, document_id, matter_id, case_id, object_key, file_name, mime_type, byte_size, sha256,
        encryption_key_version, encryption_iv, status, backup_required, created_at, updated_at, created_by_user_id, updated_by_user_id
      ) SELECT ?1, ?2, NULL, ?3, ?4, ?5, 'application/pdf', ?6, ?7, 1, ?8, 'uploading', ?9, ?10, ?10, ?11, ?11
      WHERE EXISTS (SELECT 1 FROM tenant_memberships WHERE tenant_id = ?1 AND user_id = ?11)`)
        .bind(auth.tenant.id, documentId, caseId, objectKey, displayName, bytes.byteLength, sha256,
          ivBase64, backupEnabled ? 1 : 0, now, auth.user.id),
      auditStatement(env, { tenantId: auth.tenant.id, documentId, userId: auth.user.id, action: "upload_started", now, requestId, condition: "changes() = 1" }),
    ]);
    if ((created[0]?.meta.changes ?? 0) !== 1 || (created[1]?.meta.changes ?? 0) !== 1) return json({ error: "document_record_create_failed" }, 500);
  } catch {
    return json({ error: "document_record_create_failed" }, 500);
  }

  try {
    await env.DOCUMENTS.put(objectKey, ciphertext, {
      httpMetadata: { contentType: "application/octet-stream" },
      customMetadata: { tenantId: auth.tenant.id, documentId, keyVersion: "1", ciphertextSha256 },
    });
    if (backupEnabled && backupCopyId && backupObjectKey && env.BACKUP_DOCUMENTS) {
      await env.BACKUP_DOCUMENTS.put(backupObjectKey, ciphertext, {
        httpMetadata: { contentType: "application/octet-stream" },
        customMetadata: {
          tenantId: auth.tenant.id,
          documentId,
          backupTarget: "r2-documents-v1",
          backupCopyId,
          keyVersion: "1",
          ciphertextSha256,
        },
      });
    }
    const primaryVerified = await storedCiphertextMatches(env.DOCUMENTS, objectKey, {
      tenantId: auth.tenant.id,
      documentId,
      keyVersion: "1",
      ciphertextSha256,
      byteSize: ciphertext.byteLength,
    });
    if (!primaryVerified) throw new Error("document_primary_copy_integrity_failed");
    if (backupEnabled && backupObjectKey && env.BACKUP_DOCUMENTS) {
      const backupVerified = await storedCiphertextMatches(env.BACKUP_DOCUMENTS, backupObjectKey, {
        tenantId: auth.tenant.id,
        documentId,
        keyVersion: "1",
        ciphertextSha256,
        byteSize: ciphertext.byteLength,
      });
      if (!backupVerified) throw new Error("document_backup_copy_integrity_failed");
    }
  } catch {
    await env.DOCUMENTS.delete(objectKey).catch(() => undefined);
    if (backupObjectKey && env.BACKUP_DOCUMENTS) await env.BACKUP_DOCUMENTS.delete(backupObjectKey).catch(() => undefined);
    await env.DB.batch([
      env.DB.prepare("UPDATE documents SET status = 'failed', updated_at = ?3, updated_by_user_id = ?4 WHERE tenant_id = ?1 AND document_id = ?2 AND status = 'uploading'")
        .bind(auth.tenant.id, documentId, new Date().toISOString(), auth.user.id),
      auditStatement(env, { tenantId: auth.tenant.id, documentId, userId: auth.user.id, action: "upload_failed", now: new Date().toISOString(), requestId, condition: "changes() = 1" }),
    ]).catch(() => undefined);
    return json({ error: "document_storage_write_failed" }, 503);
  }

  const readyAt = new Date().toISOString();
  try {
    const statements: D1PreparedStatement[] = [];
    if (backupEnabled && backupCopyId && backupObjectKey) {
      statements.push(env.DB.prepare(`INSERT INTO document_backup_copy_events (
        backup_copy_id, tenant_id, document_id, backup_target, backup_object_key, ciphertext_sha256,
        ciphertext_byte_size, encryption_key_version, copied_at
      ) SELECT ?1, ?2, ?3, 'r2-documents-v1', ?4, ?5, ?6, 1, ?7
      WHERE EXISTS (SELECT 1 FROM documents WHERE tenant_id = ?2 AND document_id = ?3 AND status = 'uploading')`)
        .bind(backupCopyId, auth.tenant.id, documentId, backupObjectKey, ciphertextSha256, ciphertext.byteLength, readyAt));
    }
    statements.push(env.DB.prepare("UPDATE documents SET status = 'ready', updated_at = ?3 WHERE tenant_id = ?1 AND document_id = ?2 AND status = 'uploading'")
      .bind(auth.tenant.id, documentId, readyAt));
    statements.push(auditStatement(env, { tenantId: auth.tenant.id, documentId, userId: auth.user.id, action: "upload_completed", now: readyAt, requestId, condition: "changes() = 1" }));
    const completed = await env.DB.batch(statements);
    const backupResult = backupEnabled ? completed[0] : null;
    const readyResult = completed[backupEnabled ? 1 : 0];
    const auditResult = completed[backupEnabled ? 2 : 1];
    if ((backupResult && backupResult.meta.changes !== 1) || readyResult?.meta.changes !== 1 || auditResult?.meta.changes !== 1) {
      throw new Error("document_ready_transition_failed");
    }
  } catch {
    await env.DOCUMENTS.delete(objectKey).catch(() => undefined);
    if (backupObjectKey && env.BACKUP_DOCUMENTS) await env.BACKUP_DOCUMENTS.delete(backupObjectKey).catch(() => undefined);
    await env.DB.batch([
      env.DB.prepare("UPDATE documents SET status = 'failed', updated_at = ?3, updated_by_user_id = ?4 WHERE tenant_id = ?1 AND document_id = ?2 AND status = 'uploading'")
        .bind(auth.tenant.id, documentId, new Date().toISOString(), auth.user.id),
      auditStatement(env, { tenantId: auth.tenant.id, documentId, userId: auth.user.id, action: "upload_failed", now: new Date().toISOString(), requestId, condition: "changes() = 1" }),
    ]).catch(() => undefined);
    return json({ error: "document_finalize_failed" }, 503);
  }

  const item = DocumentFileSchema.parse({
    id: documentId, tenantId: auth.tenant.id, matterId: null, caseId, fileName: displayName,
    mimeType: "application/pdf", byteSize: bytes.byteLength, status: "ready", createdAt: now, updatedAt: readyAt,
  });
  return json({ item }, 201);
}

async function changeDocumentStatus(request: Request, env: DocumentBindings, auth: DocumentSession, documentId: string): Promise<Response> {
  const parsed = DocumentStatusChangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const now = new Date().toISOString();
  const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID();
  const previousStatus = parsed.data.status === "archived" ? "ready" : "archived";
  const action = parsed.data.status === "archived" ? "archived" : "restored";
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE documents SET status = ?4, updated_at = ?5, updated_by_user_id = ?6
        WHERE tenant_id = ?1 AND document_id = ?2 AND status = ?3 AND updated_at = ?7`)
        .bind(auth.tenant.id, documentId, previousStatus, parsed.data.status, now, auth.user.id, parsed.data.expectedUpdatedAt),
      auditStatement(env, { tenantId: auth.tenant.id, documentId, userId: auth.user.id, action, now, requestId, condition: "changes() = 1" }),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) {
      const current = await env.DB.prepare("SELECT status FROM documents WHERE tenant_id = ?1 AND document_id = ?2")
        .bind(auth.tenant.id, documentId).first<{ status: string }>();
      return current ? json({ error: "document_changed" }, 409) : json({ error: "not_found" }, 404);
    }
    return json(DocumentStatusResponseSchema.parse({ status: parsed.data.status, updatedAt: now }), 200);
  } catch {
    return json({ error: "document_archive_failed" }, 500);
  }
}

async function downloadDocument(request: Request, env: DocumentBindings, auth: DocumentSession, documentId: string): Promise<Response> {
  const key = await documentKey(env);
  if (!key) return json({ error: "document_vault_not_configured" }, 503);
  const row = await env.DB.prepare(`SELECT document_id, object_key, file_name, byte_size, sha256, encryption_iv, encryption_key_version
    FROM documents WHERE tenant_id = ?1 AND document_id = ?2 AND status IN ('ready', 'archived')`)
    .bind(auth.tenant.id, documentId).first<{
      document_id: string; object_key: string; file_name: string; byte_size: number; sha256: string;
      encryption_iv: string; encryption_key_version: number;
    }>();
  if (!row) return json({ error: "not_found" }, 404);
  if (row.encryption_key_version !== 1) return json({ error: "document_key_version_unsupported" }, 503);

  let plaintext: Uint8Array | null = null;
  let primaryFailure: "primary_missing" | "primary_metadata_mismatch" | "primary_ciphertext_mismatch" | "primary_decryption_failed" | "primary_storage_error" = "primary_missing";
  try {
    const object = await env.DOCUMENTS.get(row.object_key);
    if (!object) {
      primaryFailure = "primary_missing";
    } else if (object.customMetadata?.tenantId !== auth.tenant.id
      || object.customMetadata?.documentId !== documentId
      || object.customMetadata?.keyVersion !== "1") {
      primaryFailure = "primary_metadata_mismatch";
    } else {
      const ciphertext = new Uint8Array(await object.arrayBuffer());
      const metadataHash = object.customMetadata?.ciphertextSha256;
      if (object.size !== ciphertext.byteLength || (metadataHash && await sha256Hex(ciphertext) !== metadataHash)) {
        primaryFailure = "primary_ciphertext_mismatch";
      } else {
        plaintext = await decryptAndVerifyDocument(
          ciphertext, key, auth.tenant.id, documentId, row.encryption_iv, row.byte_size, row.sha256,
          metadataHash,
        );
        if (!plaintext) primaryFailure = "primary_decryption_failed";
      }
    }
  } catch {
    primaryFailure = "primary_storage_error";
  }

  let backupCopyId: string | null = null;
  let backupOutcome: DocumentBackupOutcome = env.BACKUP_DOCUMENTS ? "copy_record_missing" : "backup_binding_unavailable";
  let primaryRepaired = false;
  if (!plaintext && env.BACKUP_DOCUMENTS) {
    let copy: DocumentBackupCopyRow | null = null;
    try {
      copy = await env.DB.prepare(`SELECT backup_copy_id, backup_target, backup_object_key,
          ciphertext_sha256, ciphertext_byte_size, encryption_key_version
        FROM document_backup_copy_events
        WHERE tenant_id = ?1 AND document_id = ?2
        ORDER BY copied_at DESC, backup_copy_id DESC LIMIT 1`)
        .bind(auth.tenant.id, documentId).first<DocumentBackupCopyRow>();
    } catch {
      backupOutcome = "backup_lookup_error";
    }
    if (copy) {
      backupCopyId = copy.backup_copy_id;
      const expectedBackupKey = `copies/${auth.tenant.id}/${documentId}/${copy.backup_copy_id}.enc`;
      if (copy.backup_target !== "r2-documents-v1" || copy.encryption_key_version !== 1
        || copy.backup_object_key !== expectedBackupKey) {
        backupOutcome = "backup_metadata_mismatch";
      } else {
        try {
          const backupObject = await env.BACKUP_DOCUMENTS.get(copy.backup_object_key);
          if (!backupObject) {
            backupOutcome = "backup_object_missing";
          } else if (backupObject.customMetadata?.tenantId !== auth.tenant.id
            || backupObject.customMetadata?.documentId !== documentId
            || backupObject.customMetadata?.backupTarget !== copy.backup_target
            || backupObject.customMetadata?.backupCopyId !== copy.backup_copy_id
            || backupObject.customMetadata?.keyVersion !== String(copy.encryption_key_version)
            || backupObject.customMetadata?.ciphertextSha256 !== copy.ciphertext_sha256) {
            backupOutcome = "backup_metadata_mismatch";
          } else {
            const ciphertext = new Uint8Array(await backupObject.arrayBuffer());
            if (ciphertext.byteLength !== copy.ciphertext_byte_size || backupObject.size !== copy.ciphertext_byte_size
              || await sha256Hex(ciphertext) !== copy.ciphertext_sha256) {
              backupOutcome = "backup_ciphertext_mismatch";
            } else {
              const recovered = await decryptAndVerifyDocument(
                ciphertext, key, auth.tenant.id, documentId, row.encryption_iv, row.byte_size, row.sha256,
                copy.ciphertext_sha256,
              );
              if (!recovered) {
                backupOutcome = "backup_decryption_failed";
              } else {
                plaintext = recovered;
                backupOutcome = "recovered";
                try {
                  await env.DOCUMENTS.put(row.object_key, ciphertext, {
                    httpMetadata: { contentType: "application/octet-stream" },
                    customMetadata: {
                      tenantId: auth.tenant.id,
                      documentId,
                      keyVersion: String(copy.encryption_key_version),
                      ciphertextSha256: copy.ciphertext_sha256,
                    },
                  });
                  primaryRepaired = await storedCiphertextMatches(env.DOCUMENTS, row.object_key, {
                    tenantId: auth.tenant.id,
                    documentId,
                    keyVersion: String(copy.encryption_key_version),
                    ciphertextSha256: copy.ciphertext_sha256,
                    byteSize: copy.ciphertext_byte_size,
                  });
                } catch {
                  primaryRepaired = false;
                }
              }
            }
          }
        } catch {
          backupOutcome = "backup_storage_error";
        }
      }
    }
  }

  const now = new Date().toISOString();
  const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID();
  if (!plaintext) {
    try {
      const recorded = await backupRecoveryStatement(env, {
        tenantId: auth.tenant.id,
        documentId,
        backupCopyId,
        userId: auth.user.id,
        requestId,
        primaryFailure,
        backupOutcome,
        primaryRepaired: false,
        now,
      }).run();
      if (recorded.meta.changes !== 1) return json({ error: "document_audit_failed" }, 503);
    } catch {
      return json({ error: "document_audit_failed" }, 503);
    }
    return json({ error: "document_object_unavailable" }, 503);
  }

  const statements = [env.DB.prepare(`INSERT INTO document_audit_events (
    tenant_id, event_id, document_id, actor_user_id, action, created_at, request_id
  ) VALUES (?1, ?2, ?3, ?4, 'downloaded', ?5, ?6)`)
    .bind(auth.tenant.id, crypto.randomUUID(), documentId, auth.user.id, now, requestId)];
  if (backupOutcome === "recovered") {
    statements.push(backupRecoveryStatement(env, {
      tenantId: auth.tenant.id,
      documentId,
      backupCopyId,
      userId: auth.user.id,
      requestId,
      primaryFailure,
      backupOutcome,
      primaryRepaired,
      now,
    }));
  }
  try {
    const audited = await env.DB.batch(statements);
    if (audited.some((result) => result.meta.changes !== 1)) return json({ error: "document_audit_failed" }, 503);
  } catch {
    return json({ error: "document_audit_failed" }, 503);
  }

  const safeAscii = row.file_name.normalize("NFKD").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180) || "documento.pdf";
  const encodedName = encodeURIComponent(row.file_name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(plaintext, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(plaintext.byteLength),
      "Content-Disposition": `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function handleDocuments(request: Request, env: DocumentBindings, auth: DocumentSession, segments: string[]): Promise<Response> {
  if (segments.length === 0) {
    if (request.method === "GET") return listDocuments(request, env, auth);
    if (request.method === "POST") return uploadDocument(request, env, auth);
    return json({ error: "method_not_allowed" }, 405);
  }
  const [documentId, action] = segments;
  if (!documentId || !idPattern.test(documentId)) return json({ error: "not_found" }, 404);
  if (segments.length === 2 && action === "signatures") {
    if (request.method === "GET") {
      try { return await listDocumentSigningRecords(env, auth, documentId); }
      catch { return json({ error: "document_signing_receipt_corrupt" }, 503); }
    }
    if (request.method === "POST") return createDocumentSigningRecord(request, env, auth, documentId);
    return json({ error: "method_not_allowed" }, 405);
  }
  if (segments.length === 2 && action === "status" && request.method === "POST") return changeDocumentStatus(request, env, auth, documentId);
  if (segments.length === 2 && action === "download" && request.method === "GET") return downloadDocument(request, env, auth, documentId);
  return json({ error: "method_not_allowed" }, 405);
}

export async function importPdfIntoVault(
  request: Request,
  env: DocumentBindings,
  auth: DocumentSession,
  input: { bytes: Uint8Array; fileName: string; caseId: string | null },
): Promise<Response> {
  const form = new FormData();
  form.set("file", new File([input.bytes], input.fileName, { type: "application/pdf" }));
  form.set("fileName", input.fileName);
  if (input.caseId) form.set("caseId", input.caseId);
  const internal = new Request(new URL("/api/documents", request.url), { method: "POST", body: form });
  return uploadDocument(internal, env, auth);
}
