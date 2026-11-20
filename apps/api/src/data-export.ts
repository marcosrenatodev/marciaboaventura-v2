import { z } from "zod";

export const OfficeDataExportRequestSchema = z.object({
  acknowledgeSensitiveData: z.literal(true),
  formatVersion: z.literal(1),
}).strict();

export type OfficeDataExportActor = {
  user: { id: string; name: string; email: string };
  tenant: { id: string; role: "owner" | "member" };
  sessionCreatedAt: string;
};

type ExportCollectionDefinition = {
  key: string;
  table: string;
  columns: string;
};

const exportCollections = [
  { key: "clients", table: "clients", columns: "tenant_id, client_id, display_name, email, phone, status, created_at, updated_at, created_by_user_id, updated_by_user_id" },
  { key: "matterClients", table: "matter_clients", columns: "tenant_id, matter_id, client_id, created_at" },
  { key: "matters", table: "matters", columns: "tenant_id, matter_id, title, description, status, created_at, updated_at, deleted_at, created_by_user_id, updated_by_user_id" },
  { key: "courtCases", table: "court_cases", columns: "tenant_id, case_id, matter_id, court_name, jurisdiction, case_number, label, status, created_at, updated_at, deleted_at, created_by_user_id, updated_by_user_id" },
  { key: "courtCaseNotes", table: "court_case_notes", columns: "tenant_id, note_id, case_id, body, created_at, created_by_user_id" },
  { key: "tasks", table: "tasks", columns: "tenant_id, task_id, matter_id, title, notes, status, scheduled_for, scheduled_on, created_at, updated_at, deleted_at, created_by_user_id, updated_by_user_id" },
  { key: "appointments", table: "appointments", columns: "tenant_id, appointment_id, matter_id, case_id, title, starts_at, ends_at, timezone, location, notes, status, created_at, updated_at, deleted_at, created_by_user_id, updated_by_user_id" },
  { key: "financialEntries", table: "financial_entries", columns: "tenant_id, entry_id, matter_id, case_id, kind, description, amount_cents, currency, status, due_on, occurred_at, timezone, category, created_at, updated_at, deleted_at, created_by_user_id, updated_by_user_id" },
  { key: "legalResearches", table: "legal_researches", columns: "tenant_id, research_id, query, court_id, source_url, created_at, created_by_user_id, updated_at, updated_by_user_id, archived_at" },
  { key: "courtPublicationSyncs", table: "court_publication_syncs", columns: "tenant_id, case_id, status, source_environment, checked_at, returned_count, warning_code, checked_by_user_id" },
  { key: "courtPublications", table: "court_publications", columns: "tenant_id, case_id, source_hash, source_environment, tribunal_code, communication_type, available_on, first_seen_at, last_seen_at" },
  { key: "courtPublicationReviews", table: "court_publication_reviews", columns: "tenant_id, case_id, source_hash, status, reviewed_at, reviewed_by_user_id, updated_at, updated_by_user_id" },
  { key: "documents", table: "documents", columns: "tenant_id, document_id, matter_id, case_id, file_name, mime_type, byte_size, sha256, status, created_at, updated_at, created_by_user_id, updated_by_user_id" },
  { key: "documentSigningRecords", table: "document_signing_records", columns: "tenant_id, signature_id, document_id, document_sha256, signer_user_id, signer_name, signer_email, confirmed_name, consent_version, consent_text, consented_at, request_id, receipt_sha256" },
  { key: "socialContentDrafts", table: "social_content_drafts", columns: "tenant_id, draft_id, platform, topic, content, created_at, updated_at, created_by_user_id, updated_by_user_id" },
  { key: "guidedTourProgress", table: "guided_tour_progress", columns: "tenant_id, user_id, tour_id, status, step_index, updated_at" },
  { key: "guidedTourScreenProgress", table: "guided_tour_screen_progress", columns: "tenant_id, user_id, tour_id, screen_id, seen_at" },
  { key: "auditEvents", table: "audit_events", columns: "tenant_id, event_id, actor_user_id, entity_type, entity_id, action, created_at, request_id, metadata" },
  { key: "clientAuditEvents", table: "client_audit_events", columns: "tenant_id, event_id, client_id, actor_user_id, action, created_at, request_id, metadata" },
  { key: "courtCaseNoteAuditEvents", table: "court_case_note_audit_events", columns: "tenant_id, event_id, note_id, case_id, actor_user_id, action, created_at, request_id, metadata" },
  { key: "courtPublicationSyncAuditEvents", table: "court_publication_sync_audit_events", columns: "tenant_id, event_id, case_id, actor_user_id, status, returned_count, created_at, request_id" },
  { key: "courtPublicationReviewAuditEvents", table: "court_publication_review_audit_events", columns: "tenant_id, event_id, case_id, source_hash, actor_user_id, action, created_at, request_id" },
  { key: "documentAuditEvents", table: "document_audit_events", columns: "tenant_id, event_id, document_id, actor_user_id, action, created_at, request_id" },
  { key: "documentBackupRecoveryEvents", table: "document_backup_recovery_events", columns: "tenant_id, recovery_event_id, document_id, backup_copy_id, actor_user_id, request_id, primary_failure, backup_outcome, primary_repaired, recovered_at" },
  { key: "legalResearchAuditEvents", table: "legal_research_audit_events", columns: "tenant_id, event_id, research_id, actor_user_id, action, created_at, request_id, metadata" },
  { key: "socialContentDraftAuditEvents", table: "social_content_draft_audit_events", columns: "tenant_id, event_id, draft_id, actor_user_id, action, created_at, request_id" },
  { key: "integrationConnectionMetadata", table: "integration_connections", columns: "tenant_id, provider, connected_at, updated_at, connected_by_user_id" },
  { key: "integrationConnectionAuditEvents", table: "integration_connection_audit_events", columns: "tenant_id, event_id, provider, actor_user_id, action, created_at, request_id, metadata" },
  { key: "dataExportAuditEvents", table: "data_export_audit_events", columns: "tenant_id, event_id, actor_user_id, created_at, request_id, format_version, collection_counts, byte_size" },
] as const satisfies readonly ExportCollectionDefinition[];

const maxCollectionRows = 1_000;
const maxTotalRows = 1_000;
const maxExportBytes = 4 * 1024 * 1024;
const recentSessionMaxAgeMs = 15 * 60 * 1000;

export type OfficeDataExportError = "method_not_allowed" | "invalid_request" | "owner_required"
  | "recent_login_required" | "export_too_large" | "export_unavailable";

export type OfficeDataExportResult =
  | { ok: true; response: Response }
  | { ok: false; error: OfficeDataExportError; status: number; retryAfter?: number };

export async function createOfficeDataExport(
  request: Request,
  requestBody: unknown,
  db: D1Database,
  auth: OfficeDataExportActor,
): Promise<OfficeDataExportResult> {
  if (request.method !== "POST") return { ok: false, error: "method_not_allowed", status: 405 };
  if (auth.tenant.role !== "owner") return { ok: false, error: "owner_required", status: 403 };

  const sessionAge = Date.now() - Date.parse(auth.sessionCreatedAt);
  if (!Number.isFinite(sessionAge) || sessionAge < -60_000 || sessionAge > recentSessionMaxAgeMs) {
    return { ok: false, error: "recent_login_required", status: 403 };
  }

  if (!OfficeDataExportRequestSchema.safeParse(requestBody).success) return { ok: false, error: "invalid_request", status: 400 };

  const collections: Record<string, Record<string, unknown>[]> = {};
  const collectionCounts: Record<string, number> = {};
  let totalRows = 0;

  try {
    for (const collection of exportCollections) {
      const result = await db.prepare(
        `SELECT ${collection.columns} FROM ${collection.table} WHERE tenant_id = ?1 ORDER BY rowid LIMIT ?2`,
      ).bind(auth.tenant.id, maxCollectionRows + 1).all<Record<string, unknown>>();
      if (result.results.length > maxCollectionRows || totalRows + result.results.length > maxTotalRows) {
        return { ok: false, error: "export_too_large", status: 413 };
      }
      collections[collection.key] = result.results;
      collectionCounts[collection.key] = result.results.length;
      totalRows += result.results.length;
    }
  } catch {
    return { ok: false, error: "export_unavailable", status: 503 };
  }

  const exportedAt = new Date().toISOString();
  const payload = {
    format: "marcia.office-data-export",
    formatVersion: 1,
    exportedAt,
    office: { tenantId: auth.tenant.id },
    exportedBy: { userId: auth.user.id, name: auth.user.name, email: auth.user.email },
    limits: { maxCollectionRows, maxTotalRows, maxExportBytes },
    counts: { totalRows, collections: collectionCounts },
    collections,
    excluded: {
      documents: "O arquivo inclui metadados e comprovantes, mas não os PDFs. Baixe os PDFs individualmente em Arquivos.",
      integrations: "Chaves de API, Client Secrets, tokens OAuth e códigos de recuperação nunca são exportados.",
      authentication: "Senhas, sessões, MFA, códigos de recuperação e tokens de redefinição não são exportados.",
    },
    consistency: "As coleções são consultadas em sequência; alterações feitas durante a exportação podem aparecer em momentos diferentes no arquivo.",
    restore: "Este JSON é uma exportação legível dos dados operacionais; ainda não há rotina para restaurá-lo como backup.",
  };
  const serialized = JSON.stringify(payload, null, 2);
  const byteSize = new TextEncoder().encode(serialized).byteLength;
  if (byteSize > maxExportBytes) return { ok: false, error: "export_too_large", status: 413 };

  try {
    await db.prepare(
      `INSERT INTO data_export_audit_events
        (tenant_id, event_id, actor_user_id, created_at, request_id, format_version, collection_counts, byte_size)
       VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)`,
    ).bind(
      auth.tenant.id,
      crypto.randomUUID(),
      auth.user.id,
      exportedAt,
      request.headers.get("CF-Ray") ?? crypto.randomUUID(),
      JSON.stringify(collectionCounts),
      byteSize,
    ).run();
  } catch {
    return { ok: false, error: "export_unavailable", status: 503 };
  }

  return {
    ok: true,
    response: new Response(serialized, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="marcia-office-export-v1.json"',
      },
    }),
  };
}
