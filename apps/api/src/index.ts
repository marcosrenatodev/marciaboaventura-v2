import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { z } from "zod";
import {
  ClientCreateSchema,
  ClientSchema,
  ClientUpdateSchema,
  CloudDriveFilesResponseSchema,
  CloudDriveImportSchema,
  CourtPublicationSchema,
  CourtPublicationReviewChangeSchema,
  CourtPublicationSyncSchema,
  CourtPublicationsResponseSchema,
  DjenDiscoveryRequestSchema,
  DjenDiscoveryResponseSchema,
  AppointmentCreateSchema,
  AppointmentSchema,
  AppointmentUpdateSchema,
  CourtCaseCursorSchema,
  CourtCaseCreateSchema,
  CourtCaseListResponseSchema,
  CourtCasePageSize,
  CourtCaseNoteCreateSchema,
  CourtCaseNoteSchema,
  CourtCaseNotesResponseSchema,
  CourtCaseSchema,
  CourtCaseUpdateSchema,
  ExpectedUpdatedAtSchema,
  FinancialEntryCreateSchema,
  FinancialEntrySchema,
  FinancialEntryUpdateSchema,
  GuidedTourProgressSchema,
  GuidedTourProgressUpdateSchema,
  IntegrationSettingsSchema,
  IntegrationSettingsUpdateSchema,
  IntegrationConnectionStartSchema,
  IntegrationAuthorizationResponseSchema,
  GooglePickerSessionSchema,
  isValidCnjCaseNumber,
  formatCnjCaseNumber,
  GuidedTourScreenProgressSchema,
  GuidedTourScreenSeenUpdateSchema,
  LegalResearchCreateSchema,
  LegalResearchCursorSchema,
  LegalResearchPageSize,
  LegalResearchListStatusSchema,
  LegalResearchSchema,
  LegalResearchStatusSchema,
  LegalResearchUpdateSchema,
  ResearchSourceCatalog,
  SocialContentDraftCreateSchema,
  SocialContentDraftSchema,
  SocialContentDraftUpdateSchema,
  MatterCreateSchema,
  MatterClientSchema,
  MatterSchema,
  MatterUpdateSchema,
  SessionResponseSchema,
  StatusChangeSchema,
  TaskCreateSchema,
  TaskRecordSchema,
  TaskUpdateSchema,
} from "../../../packages/contracts/src/index";
import { discoverDjenCases, djenCertificateUrl, DjenProviderError, fetchDjenPublications, type DjenEnvironment } from "./providers/djen";
import { handleDocuments, importPdfIntoVault } from "./documents";
import { createOfficeDataExport } from "./data-export";
import { apiRateLimitPolicies, consumeD1RateLimit } from "./rate-limit";
import { djenExternalProviderEnabled, djenGate } from "./providers/djen-gate";

type Bindings = Env & {
  AUTH_BASE_URL: string;
  AUTH_SECRET: string;
  WEB_ORIGIN: string;
  AUTH_EMAIL_FROM?: string;
  PASSWORD_RESET_ENABLED?: string;
  EMAIL?: {
    send(message: { to: string; from: string; subject: string; text: string }): Promise<{ messageId: string }>;
  };
  SETUP_OWNER_TOKEN?: string;
  INTEGRATION_CREDENTIALS_KEY?: string;
  INTEGRATION_CREDENTIALS_ENABLED?: string;
  INTEGRATION_OAUTH_ENABLED?: string;
  MARCIA_E2E_OAUTH_FIXTURES?: string;
  MARCIA_E2E_OAUTH_BASE_URL?: string;
  DOCUMENTS_ENCRYPTION_KEY?: string;
  DJEN_ENABLED?: string;
  DJEN_SCHEMA_VERIFIED?: string;
  DJEN_OAB_ENABLED?: string;
  DJEN_ENVIRONMENT?: string;
  DJEN_TEST_FIXTURES?: string;
  SERVICE_MODE?: string;
  MARCIA_E2E_AUTH_FIXTURES?: string;
  MARCIA_E2E_AUTH_CONTROL_SECRET?: string;
};

// This fixture exists only inside an explicitly enabled loopback E2E Worker.
// Reset URLs are kept in isolate memory and consumed once; they are never logged or persisted.
let pendingE2ePasswordReset: { url: string; token: string; expiresAt: number } | undefined;

const apiSecurityHeaders = {
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
} as const;
const responseHeaders = {
  ...apiSecurityHeaders,
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const nativeOrigin = "marcia-demo://";
const setupPayloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  setupToken: z.string().min(32).max(512),
}).strict();

function jsonResponse(body: object, status: number, headers?: HeadersInit): Response {
  const response = new Response(JSON.stringify(body), { status, headers: responseHeaders });
  new Headers(headers).forEach((value, key) => response.headers.set(key, value));
  return response;
}

function serviceMaintenanceEnabled(env: Bindings): boolean {
  const mode = env.SERVICE_MODE?.trim();
  // Unknown non-empty values fail closed so a typo cannot silently re-enable traffic.
  return Boolean(mode && mode !== "normal");
}

function serviceMaintenanceResponse(request: Request, env: Bindings): Response {
  const pathname = new URL(request.url).pathname;
  const cors = pathname.startsWith("/api/") ? corsHeaders(request, env) : undefined;
  return secureApiResponse(jsonResponse({ error: "maintenance" }, 503, { "Retry-After": "60" }), cors);
}

function origins(env: Bindings): string[] {
  return [env.WEB_ORIGIN, nativeOrigin];
}

function isLoopbackE2eAuthFixture(env: Bindings, requestUrl: URL): boolean {
  try {
    const authUrl = new URL(env.AUTH_BASE_URL);
    return env.MARCIA_E2E_AUTH_FIXTURES === "1"
      && Boolean(env.MARCIA_E2E_AUTH_CONTROL_SECRET && env.MARCIA_E2E_AUTH_CONTROL_SECRET.length >= 32)
      && authUrl.protocol === "http:"
      && authUrl.hostname === "127.0.0.1"
      && requestUrl.protocol === "http:"
      && requestUrl.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function corsHeaders(request: Request, env: Bindings): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin && origins(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie, x-skip-bt-cookie-cache");
  headers.set("Access-Control-Expose-Headers", "Retry-After");
  headers.set("Access-Control-Max-Age", "600");
  return headers;
}

function secureApiResponse(response: Response, cors?: Headers): Response {
  if (response.status === 429 && !response.headers.has("Retry-After")) {
    const retryAfter = response.headers.get("X-Retry-After");
    if (retryAfter) response.headers.set("Retry-After", retryAfter);
  }
  response.headers.set("Cache-Control", "no-store");
  for (const [name, value] of Object.entries(apiSecurityHeaders)) response.headers.set(name, value);
  cors?.forEach((value, key) => response.headers.set(key, value));
  return response;
}

type TenantSession = {
  user: { id: string; name: string; email: string };
  tenant: { id: string; role: "owner" | "member" };
  sessionCreatedAt: string;
};

const guidedTourId = "office_basics_v1" as const;

async function readGuidedTourProgress(env: Bindings, auth: TenantSession): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT status, step_index, updated_at FROM guided_tour_progress WHERE tenant_id = ?1 AND user_id = ?2 AND tour_id = ?3",
  ).bind(auth.tenant.id, auth.user.id, guidedTourId).first<{ status: string; step_index: number; updated_at: string }>();
  const progress = row
    ? GuidedTourProgressSchema.parse({ tourId: guidedTourId, status: row.status, stepIndex: row.step_index, updatedAt: row.updated_at })
    : GuidedTourProgressSchema.parse({ tourId: guidedTourId, status: "not_started", stepIndex: 0, updatedAt: null });
  return jsonResponse(progress, 200);
}

async function saveGuidedTourProgress(request: Request, env: Bindings, auth: TenantSession): Promise<Response> {
  const parsed = GuidedTourProgressUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  }
  const { status, stepIndex, expectedUpdatedAt } = parsed.data;
  const now = new Date(Math.max(Date.now(), expectedUpdatedAt ? Date.parse(expectedUpdatedAt) + 1 : Date.now())).toISOString();
  try {
    const result = expectedUpdatedAt === null
      ? await env.DB.prepare(
        "INSERT INTO guided_tour_progress (tenant_id, user_id, tour_id, status, step_index, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (tenant_id, user_id, tour_id) DO NOTHING",
      ).bind(auth.tenant.id, auth.user.id, guidedTourId, status, stepIndex, now).run()
      : await env.DB.prepare(
        "UPDATE guided_tour_progress SET status = ?1, step_index = ?2, updated_at = ?3 WHERE tenant_id = ?4 AND user_id = ?5 AND tour_id = ?6 AND updated_at = ?7",
      ).bind(status, stepIndex, now, auth.tenant.id, auth.user.id, guidedTourId, expectedUpdatedAt).run();
    if ((result.meta.changes ?? 0) !== 1) return jsonResponse({ error: "conflict" }, 409);
    return await readGuidedTourProgress(env, auth);
  } catch {
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

async function readGuidedTourScreenProgress(env: Bindings, auth: TenantSession): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT screen_id FROM guided_tour_screen_progress WHERE tenant_id = ?1 AND user_id = ?2 AND tour_id = ?3 ORDER BY screen_id",
  ).bind(auth.tenant.id, auth.user.id, guidedTourId).all<{ screen_id: string }>();
  return jsonResponse(GuidedTourScreenProgressSchema.parse({
    tourId: guidedTourId,
    seenScreenIds: rows.results.map((row) => row.screen_id),
  }), 200);
}

async function markGuidedTourScreenSeen(request: Request, env: Bindings, auth: TenantSession): Promise<Response> {
  const parsed = GuidedTourScreenSeenUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  }
  try {
    await env.DB.prepare(
      "INSERT INTO guided_tour_screen_progress (tenant_id, user_id, tour_id, screen_id, seen_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM guided_tour_progress WHERE tenant_id = ?1 AND user_id = ?2 AND tour_id = ?3) ON CONFLICT (tenant_id, user_id, tour_id, screen_id) DO NOTHING",
    ).bind(auth.tenant.id, auth.user.id, guidedTourId, parsed.data.screenId, new Date().toISOString()).run();
    return await readGuidedTourScreenProgress(env, auth);
  } catch {
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

function legalResearchFromRow(row: Record<string, unknown>): unknown {
  return LegalResearchSchema.parse({
    id: row.research_id, tenantId: row.tenant_id, query: row.query, courtId: row.court_id,
    sourceUrl: row.source_url, createdAt: row.created_at, updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  });
}

function encodeLegalResearchCursor(cursor: z.infer<typeof LegalResearchCursorSchema>): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeLegalResearchCursor(value: string): z.infer<typeof LegalResearchCursorSchema> | null {
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const parsed = LegalResearchCursorSchema.safeParse(JSON.parse(atob(padded)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function legalResearchIdempotencyHash(query: string, courtId: string): Promise<string> {
  const normalizedQuery = query.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  const digest = await sha256(JSON.stringify([courtId, normalizedQuery]));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function legalResearches(request: Request, env: Bindings, auth: TenantSession): Promise<Response> {
  if (request.method === "GET") {
    const params = new URL(request.url).searchParams;
    const includeArchived = params.get("includeArchived");
    const requestedStatus = params.get("status");
    const statusResult = requestedStatus === null ? null : LegalResearchListStatusSchema.safeParse(requestedStatus);
    if ((includeArchived !== null && includeArchived !== "true" && includeArchived !== "false")
      || (statusResult !== null && !statusResult.success)
      || (includeArchived !== null && requestedStatus !== null)) {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    const status = statusResult?.success ? statusResult.data : includeArchived === "true" ? "all" : "active";
    const cursorValue = params.get("cursor");
    const cursor = cursorValue === null ? null : decodeLegalResearchCursor(cursorValue);
    if (cursorValue !== null && (!cursor || cursor.status !== status
      || (status === "active" && cursor.archiveGroup !== 0)
      || (status === "archived" && cursor.archiveGroup !== 1))) {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    const filters = ["tenant_id = ?1"];
    if (status === "active") filters.push("archived_at IS NULL");
    if (status === "archived") filters.push("archived_at IS NOT NULL");
    const bindings: Array<string | number> = [auth.tenant.id];
    const archiveGroupExpression = "CASE WHEN archived_at IS NULL THEN 0 ELSE 1 END";
    const sortColumn = status === "archived" ? "archived_at" : "created_at";
    if (cursor) {
      filters.push(`(${archiveGroupExpression} > ?2 OR (${archiveGroupExpression} = ?2 AND (${sortColumn} < ?3 OR (${sortColumn} = ?3 AND (created_at < ?4 OR (created_at = ?4 AND research_id < ?5))))))`);
      bindings.push(cursor.archiveGroup, cursor.sortAt, cursor.createdAt, cursor.researchId);
    }
    const rows = await env.DB.prepare(
      `SELECT research_id, tenant_id, query, court_id, source_url, created_at, updated_at, archived_at
       FROM legal_researches WHERE ${filters.join(" AND ")}
       ORDER BY ${archiveGroupExpression} ASC, ${sortColumn} DESC, created_at DESC, research_id DESC LIMIT ${LegalResearchPageSize + 1}`,
    ).bind(...bindings).all<Record<string, unknown>>();
    const hasMore = rows.results.length > LegalResearchPageSize;
    const pageRows = rows.results.slice(0, LegalResearchPageSize);
    const last = pageRows.at(-1);
    const nextCursor = hasMore && last ? encodeLegalResearchCursor({
      version: 1,
      status,
      archiveGroup: last.archived_at === null ? 0 : 1,
      sortAt: String(status === "archived" ? last.archived_at : last.created_at),
      createdAt: String(last.created_at),
      researchId: String(last.research_id),
    }) : null;
    return jsonResponse({ items: pageRows.map(legalResearchFromRow), nextCursor }, 200);
  }
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, POST, OPTIONS" });

  const parsed = LegalResearchCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);

  const normalizedQuery = parsed.data.query.trim();
  const idempotencyHash = await legalResearchIdempotencyHash(normalizedQuery, parsed.data.courtId);
  const findExisting = () => env.DB.prepare(
    `SELECT research_id, tenant_id, query, court_id, source_url, created_at, updated_at, archived_at
     FROM legal_researches WHERE tenant_id = ?1 AND archived_at IS NULL
       AND (idempotency_hash = ?2 OR (idempotency_hash IS NULL AND court_id = ?3 AND lower(trim(query)) = lower(trim(?4))))
     ORDER BY created_at DESC, research_id DESC LIMIT 1`,
  ).bind(auth.tenant.id, idempotencyHash, parsed.data.courtId, normalizedQuery).first<Record<string, unknown>>();
  const existing = await findExisting();
  if (existing) return jsonResponse({ item: legalResearchFromRow(existing) }, 200);

  const id = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  const sourceUrl = ResearchSourceCatalog[parsed.data.courtId];
  const insert = env.DB.prepare(
    "INSERT INTO legal_researches (tenant_id, research_id, query, court_id, source_url, idempotency_hash, created_at, created_by_user_id, updated_at, updated_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?7, ?8)",
  ).bind(auth.tenant.id, id, normalizedQuery, parsed.data.courtId, sourceUrl, idempotencyHash, now, auth.user.id);
  const audit = env.DB.prepare(
    "INSERT INTO legal_research_audit_events (tenant_id, event_id, research_id, actor_user_id, action, created_at, request_id) SELECT ?1, ?2, ?3, ?4, 'created', ?5, ?6 WHERE changes() = 1 AND EXISTS (SELECT 1 FROM legal_researches WHERE tenant_id = ?1 AND research_id = ?3 AND updated_at = ?5)",
  ).bind(auth.tenant.id, eventId, id, auth.user.id, now, request.headers.get("CF-Ray") ?? crypto.randomUUID());
  try {
    const results = await env.DB.batch([insert, audit]);
    if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ item: LegalResearchSchema.parse({ id, tenantId: auth.tenant.id, ...parsed.data, query: normalizedQuery, sourceUrl, createdAt: now, updatedAt: now, archivedAt: null }) }, 201);
  } catch {
    try {
      const duplicate = await findExisting();
      if (duplicate) return jsonResponse({ item: legalResearchFromRow(duplicate) }, 200);
    } catch {
      // Keep the original write failure response if recovery lookup also fails.
    }
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

async function updateLegalResearch(request: Request, env: Bindings, auth: TenantSession, researchId: string): Promise<Response> {
  const parsed = LegalResearchUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  const { expectedUpdatedAt, ...data } = parsed.data;
  const now = new Date(Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1)).toISOString();
  const sourceUrl = ResearchSourceCatalog[data.courtId];
  const idempotencyHash = await legalResearchIdempotencyHash(data.query, data.courtId);
  const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID();
  const eventId = crypto.randomUUID();
  try {
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE legal_researches SET query = ?1, court_id = ?2, source_url = ?3, idempotency_hash = ?4, updated_at = ?5, updated_by_user_id = ?6 WHERE tenant_id = ?7 AND research_id = ?8 AND archived_at IS NULL AND updated_at = ?9")
        .bind(data.query, data.courtId, sourceUrl, idempotencyHash, now, auth.user.id, auth.tenant.id, researchId, expectedUpdatedAt),
      env.DB.prepare("INSERT INTO legal_research_audit_events (tenant_id, event_id, research_id, actor_user_id, action, created_at, request_id, metadata) SELECT ?1, ?2, ?3, ?4, 'updated', ?5, ?6, '{\"fields\":[\"query\",\"courtId\"]}' WHERE changes() = 1 AND EXISTS (SELECT 1 FROM legal_researches WHERE tenant_id = ?1 AND research_id = ?3 AND archived_at IS NULL AND updated_at = ?5)")
        .bind(auth.tenant.id, eventId, researchId, auth.user.id, now, requestId),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) {
      const exists = await env.DB.prepare("SELECT 1 AS present FROM legal_researches WHERE tenant_id = ?1 AND research_id = ?2")
        .bind(auth.tenant.id, researchId).first<{ present: number }>();
      return jsonResponse({ error: exists ? "conflict" : "not_found" }, exists ? 409 : 404);
    }
    const row = await env.DB.prepare("SELECT research_id, tenant_id, query, court_id, source_url, created_at, updated_at, archived_at FROM legal_researches WHERE tenant_id = ?1 AND research_id = ?2")
      .bind(auth.tenant.id, researchId).first<Record<string, unknown>>();
    return row ? jsonResponse({ item: legalResearchFromRow(row) }, 200) : jsonResponse({ error: "write_failed" }, 500);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) return jsonResponse({ error: "conflict" }, 409);
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

async function changeLegalResearchStatus(request: Request, env: Bindings, auth: TenantSession, researchId: string): Promise<Response> {
  const parsed = LegalResearchStatusSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  const { status, expectedUpdatedAt } = parsed.data;
  const now = new Date(Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1)).toISOString();
  const archivedAt = status === "archived" ? now : null;
  const previousStatusCondition = status === "archived" ? "archived_at IS NULL" : "archived_at IS NOT NULL";
  const statusEvent = status === "archived" ? "archived" : "restored";
  const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID();
  const eventId = crypto.randomUUID();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE legal_researches SET archived_at = ?1, updated_at = ?2, updated_by_user_id = ?3 WHERE tenant_id = ?4 AND research_id = ?5 AND updated_at = ?6 AND ${previousStatusCondition}`)
        .bind(archivedAt, now, auth.user.id, auth.tenant.id, researchId, expectedUpdatedAt),
      env.DB.prepare(`INSERT INTO legal_research_audit_events (tenant_id, event_id, research_id, actor_user_id, action, created_at, request_id) SELECT ?1, ?2, ?3, ?4, '${statusEvent}', ?5, ?6 WHERE changes() = 1 AND EXISTS (SELECT 1 FROM legal_researches WHERE tenant_id = ?1 AND research_id = ?3 AND updated_at = ?5 AND ${status === "archived" ? "archived_at IS NOT NULL" : "archived_at IS NULL"})`)
        .bind(auth.tenant.id, eventId, researchId, auth.user.id, now, requestId),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) {
      const exists = await env.DB.prepare("SELECT 1 AS present FROM legal_researches WHERE tenant_id = ?1 AND research_id = ?2")
        .bind(auth.tenant.id, researchId).first<{ present: number }>();
      return jsonResponse({ error: exists ? "conflict" : "not_found" }, exists ? 409 : 404);
    }
    const row = await env.DB.prepare("SELECT research_id, tenant_id, query, court_id, source_url, created_at, updated_at, archived_at FROM legal_researches WHERE tenant_id = ?1 AND research_id = ?2")
      .bind(auth.tenant.id, researchId).first<Record<string, unknown>>();
    return row ? jsonResponse({ item: legalResearchFromRow(row) }, 200) : jsonResponse({ error: "write_failed" }, 500);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) return jsonResponse({ error: "conflict" }, 409);
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

function socialContentDraftFromRow(row: Record<string, unknown>): unknown {
  return SocialContentDraftSchema.parse({
    id: row.draft_id, tenantId: row.tenant_id, platform: row.platform, topic: row.topic,
    content: row.content, createdAt: row.created_at, updatedAt: row.updated_at,
  });
}

async function socialContentDrafts(request: Request, env: Bindings, auth: TenantSession, draftId?: string): Promise<Response> {
  if (request.method === "GET" && !draftId) {
    const rows = await env.DB.prepare(
      "SELECT draft_id, tenant_id, platform, topic, content, created_at, updated_at FROM social_content_drafts WHERE tenant_id = ?1 ORDER BY updated_at DESC, rowid DESC LIMIT 100",
    ).bind(auth.tenant.id).all<Record<string, unknown>>();
    const items = rows.results.map(socialContentDraftFromRow);
    return jsonResponse({ items }, 200);
  }

  if (request.method === "POST" && !draftId) {
    const parsed = SocialContentDraftCreateSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
    const id = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();
    const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID();
    try {
      const results = await env.DB.batch([
        env.DB.prepare("INSERT INTO social_content_drafts (tenant_id, draft_id, platform, topic, content, created_at, updated_at, created_by_user_id, updated_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7, ?7)")
          .bind(auth.tenant.id, id, parsed.data.platform, parsed.data.topic, parsed.data.content, now, auth.user.id),
        env.DB.prepare("INSERT INTO social_content_draft_audit_events (tenant_id, event_id, draft_id, actor_user_id, action, created_at, request_id) SELECT ?1, ?2, ?3, ?4, 'created', ?5, ?6 WHERE changes() = 1 AND EXISTS (SELECT 1 FROM social_content_drafts WHERE tenant_id = ?1 AND draft_id = ?3)")
          .bind(auth.tenant.id, eventId, id, auth.user.id, now, requestId),
      ]);
      if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
      return jsonResponse({ item: SocialContentDraftSchema.parse({ id, tenantId: auth.tenant.id, ...parsed.data, createdAt: now, updatedAt: now }) }, 201);
    } catch {
      return jsonResponse({ error: "write_failed" }, 500);
    }
  }

  if (request.method === "PATCH" && draftId) {
    const parsed = SocialContentDraftUpdateSchema.safeParse(await readJson(request));
    if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
    const id = crypto.randomUUID();
    const { expectedUpdatedAt, ...data } = parsed.data;
    const now = new Date(Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1)).toISOString();
    try {
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE social_content_drafts SET platform = ?1, topic = ?2, content = ?3, updated_at = ?4, updated_by_user_id = ?5 WHERE tenant_id = ?6 AND draft_id = ?7 AND updated_at = ?8")
          .bind(data.platform, data.topic, data.content, now, auth.user.id, auth.tenant.id, draftId, expectedUpdatedAt),
        env.DB.prepare("INSERT INTO social_content_draft_audit_events (tenant_id, event_id, draft_id, actor_user_id, action, created_at, request_id) SELECT ?1, ?2, ?3, ?4, 'updated', ?5, ?6 WHERE changes() = 1 AND EXISTS (SELECT 1 FROM social_content_drafts WHERE tenant_id = ?1 AND draft_id = ?3 AND updated_at = ?5)")
          .bind(auth.tenant.id, id, draftId, auth.user.id, now, request.headers.get("CF-Ray") ?? crypto.randomUUID()),
      ]);
      if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) {
        const existing = await env.DB.prepare("SELECT 1 AS present FROM social_content_drafts WHERE tenant_id = ?1 AND draft_id = ?2").bind(auth.tenant.id, draftId).first<{ present: number }>();
        return jsonResponse({ error: existing ? "conflict" : "not_found" }, existing ? 409 : 404);
      }
      const row = await env.DB.prepare("SELECT draft_id, tenant_id, platform, topic, content, created_at, updated_at FROM social_content_drafts WHERE tenant_id = ?1 AND draft_id = ?2").bind(auth.tenant.id, draftId).first<Record<string, unknown>>();
      if (!row) return jsonResponse({ error: "write_failed" }, 500);
      return jsonResponse({ item: socialContentDraftFromRow(row) }, 200);
    } catch {
      return jsonResponse({ error: "write_failed" }, 500);
    }
  }

  return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: draftId ? "PATCH, OPTIONS" : "GET, POST, OPTIONS" });
}

function clientFromRow(row: Record<string, unknown>): unknown {
  return ClientSchema.parse({
    id: row.client_id, tenantId: row.tenant_id, displayName: row.display_name,
    email: row.email, phone: row.phone, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
  });
}

const StoredIntegrationCredentialSchema = z.object({
  pickerApiKey: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  tenantId: z.string().nullable().optional(),
  clientSecret: z.string().nullable().optional(),
}).strict();

type StoredIntegrationCredential = z.infer<typeof StoredIntegrationCredentialSchema>;
type IntegrationProvider = "google_drive" | "microsoft_graph";
type IntegrationCredentialRow = {
  provider: IntegrationProvider;
  ciphertext: string;
  iv: string;
  key_version: number;
  updated_at: string;
};
type IntegrationConnectionRow = {
  tenant_id: string;
  provider: IntegrationProvider;
  ciphertext: string;
  iv: string;
  key_version: number;
  connected_at: string;
  updated_at: string;
  connected_by_user_id: string;
};
type OAuthTransactionRow = {
  state_hash: string;
  tenant_id: string;
  provider: IntegrationProvider;
  user_id: string;
  code_verifier_ciphertext: string;
  code_verifier_iv: string;
  redirect_uri: string;
  return_platform: "web" | "native";
  status: "pending" | "exchanging";
  expires_at: string;
};

const StoredIntegrationConnectionSchema = z.object({
  accessToken: z.string().min(1).max(8192),
  refreshToken: z.string().min(1).max(8192).nullable(),
  expiresAt: z.string().datetime(),
  accountId: z.string().trim().min(1).max(256),
  accountLabel: z.string().trim().min(1).max(320),
  grantedScopes: z.array(z.string().trim().min(1).max(256)).max(16),
}).strict();
type StoredIntegrationConnection = z.infer<typeof StoredIntegrationConnectionSchema>;

function fromBase64(value: string): Uint8Array {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function toBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function integrationEncryptionKey(env: Bindings): Promise<CryptoKey | null> {
  try {
    if (!env.INTEGRATION_CREDENTIALS_KEY) return null;
    const raw = fromBase64(env.INTEGRATION_CREDENTIALS_KEY.trim());
    if (raw.byteLength !== 32) return null;
    return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

function integrationCredentialAad(tenantId: string, provider: IntegrationProvider, keyVersion = 1): Uint8Array {
  return new TextEncoder().encode(`marcia-integration|${keyVersion}|${tenantId}|${provider}`);
}

async function decryptIntegrationCredential(row: IntegrationCredentialRow, key: CryptoKey, tenantId: string): Promise<StoredIntegrationCredential> {
  if (row.key_version !== 1) throw new Error("Unsupported integration credential key version");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(row.iv), additionalData: integrationCredentialAad(tenantId, row.provider, row.key_version) }, key, fromBase64(row.ciphertext));
  return StoredIntegrationCredentialSchema.parse(JSON.parse(new TextDecoder().decode(plaintext)));
}

async function encryptIntegrationCredential(value: StoredIntegrationCredential, key: CryptoKey, tenantId: string, provider: IntegrationProvider): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(StoredIntegrationCredentialSchema.parse(value)));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: integrationCredentialAad(tenantId, provider) }, key, plaintext);
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) };
}

function integrationConnectionAad(tenantId: string, provider: IntegrationProvider, userId: string, keyVersion = 1): Uint8Array {
  return new TextEncoder().encode(`marcia-integration-connection|${keyVersion}|${tenantId}|${userId}|${provider}`);
}

async function decryptIntegrationConnection(row: IntegrationConnectionRow, key: CryptoKey): Promise<StoredIntegrationConnection> {
  if (row.key_version !== 1) throw new Error("Unsupported integration connection key version");
  const plaintext = await crypto.subtle.decrypt({
    name: "AES-GCM", iv: fromBase64(row.iv),
    additionalData: integrationConnectionAad(row.tenant_id, row.provider, row.connected_by_user_id, row.key_version),
  }, key, fromBase64(row.ciphertext));
  return StoredIntegrationConnectionSchema.parse(JSON.parse(new TextDecoder().decode(plaintext)));
}

async function encryptIntegrationConnection(value: StoredIntegrationConnection, key: CryptoKey, tenantId: string, provider: IntegrationProvider, userId: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(StoredIntegrationConnectionSchema.parse(value)));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: integrationConnectionAad(tenantId, provider, userId) }, key, plaintext);
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) };
}

function base64Url(value: Uint8Array): string {
  return toBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function encryptOAuthVerifier(verifier: string, key: CryptoKey, tenantId: string, userId: string, provider: IntegrationProvider, stateHash: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`marcia-oauth-verifier|1|${tenantId}|${userId}|${provider}|${stateHash}`);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, new TextEncoder().encode(verifier));
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) };
}

async function decryptOAuthVerifier(row: OAuthTransactionRow, key: CryptoKey): Promise<string> {
  const aad = new TextEncoder().encode(`marcia-oauth-verifier|1|${row.tenant_id}|${row.user_id}|${row.provider}|${row.state_hash}`);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(row.code_verifier_iv), additionalData: aad }, key, fromBase64(row.code_verifier_ciphertext));
  const verifier = new TextDecoder().decode(plaintext);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) throw new Error("Invalid OAuth verifier");
  return verifier;
}

function emptyIntegrationStatus(updatedAt: string | null = null) {
  return {
    configured: false,
    clientId: null,
    tenantId: null,
    pickerApiKeyConfigured: false,
    clientSecretConfigured: false,
    updatedAt,
    connectionStatus: "not_connected" as const,
    connectedAccountLabel: null,
    connectedAt: null,
    grantedScopes: [] as string[],
  };
}

function integrationStatus(provider: IntegrationProvider, value: StoredIntegrationCredential, updatedAt: string | null, connection: StoredIntegrationConnection | null = null, connectedAt: string | null = null) {
  const hasValue = Object.values(value).some((item) => typeof item === "string" && item.length > 0);
  const common = {
    configured: hasValue,
    clientId: value.clientId ?? null,
    clientSecretConfigured: Boolean(value.clientSecret),
    updatedAt,
    connectionStatus: connection ? "connected" as const : "not_connected" as const,
    connectedAccountLabel: connection?.accountLabel ?? null,
    connectedAt,
    grantedScopes: connection?.grantedScopes ?? [],
  };
  return provider === "google_drive"
    ? { ...common, pickerApiKeyConfigured: Boolean(value.pickerApiKey), tenantId: null }
    : { ...common, tenantId: value.tenantId ?? null };
}

function configuredOAuthRedirectUri(env: Bindings, provider: IntegrationProvider): string | null {
  try {
    const base = new URL(env.AUTH_BASE_URL);
    if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") return null;
    return new URL(`/api/integrations/${integrationProviderPath(provider)}/callback`, base).toString();
  } catch {
    return null;
  }
}

function configuredPickerOrigin(env: Bindings): string | null {
  try {
    const origin = new URL(env.WEB_ORIGIN);
    if (origin.protocol !== "https:" && origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1") return null;
    return origin.origin;
  } catch {
    return null;
  }
}

async function readIntegrationSettings(env: Bindings, auth: TenantSession): Promise<Response> {
  if (env.INTEGRATION_CREDENTIALS_ENABLED !== "true") return jsonResponse({ error: "integration_settings_disabled" }, 503);
  const [rows, connectionRows] = await Promise.all([
    env.DB.prepare("SELECT provider, ciphertext, iv, key_version, updated_at FROM integration_credentials WHERE tenant_id = ?1")
      .bind(auth.tenant.id).all<IntegrationCredentialRow>(),
    env.DB.prepare("SELECT tenant_id, provider, ciphertext, iv, key_version, connected_at, updated_at, connected_by_user_id FROM integration_connections WHERE tenant_id = ?1")
      .bind(auth.tenant.id).all<IntegrationConnectionRow>(),
  ]);
  const key = await integrationEncryptionKey(env);
  if ((rows.results.length > 0 || connectionRows.results.length > 0) && !key) return jsonResponse({ error: "vault_not_configured" }, 503);
  try {
    const settings: z.infer<typeof IntegrationSettingsSchema> = {
      encryptionAvailable: Boolean(key),
      oauthEnabled: env.INTEGRATION_OAUTH_ENABLED === "true",
      oauthRedirectUris: {
        googleDrive: configuredOAuthRedirectUri(env, "google_drive"),
        microsoftGraph: configuredOAuthRedirectUri(env, "microsoft_graph"),
      },
      googlePickerOrigin: configuredPickerOrigin(env),
      googleDrive: emptyIntegrationStatus(),
      microsoftGraph: emptyIntegrationStatus(),
    };
    const connections = new Map<IntegrationProvider, { value: StoredIntegrationConnection; connectedAt: string }>();
    for (const row of connectionRows.results) {
      if (!key) continue;
      connections.set(row.provider, { value: await decryptIntegrationConnection(row, key), connectedAt: row.connected_at });
    }
    const credentials = new Map<IntegrationProvider, { value: StoredIntegrationCredential; updatedAt: string }>();
    for (const row of rows.results) {
      if (!key) continue;
      credentials.set(row.provider, { value: await decryptIntegrationCredential(row, key, auth.tenant.id), updatedAt: row.updated_at });
    }
    for (const provider of ["google_drive", "microsoft_graph"] as const) {
      const credential = credentials.get(provider);
      const connection = connections.get(provider);
      const status = integrationStatus(provider, credential?.value ?? {}, credential?.updatedAt ?? null, connection?.value ?? null, connection?.connectedAt ?? null);
      if (provider === "google_drive") settings.googleDrive = status;
      else settings.microsoftGraph = status;
    }
    return jsonResponse(IntegrationSettingsSchema.parse(settings), 200);
  } catch {
    return jsonResponse({ error: "vault_unavailable" }, 503);
  }
}

async function saveIntegrationSettings(request: Request, env: Bindings, auth: TenantSession, provider: IntegrationProvider): Promise<Response> {
  const parsed = IntegrationSettingsUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success || parsed.data.provider !== provider) {
    return jsonResponse({ error: "invalid_request", details: parsed.success ? [{ path: "provider", code: "invalid_value" }] : parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  }
  if (env.INTEGRATION_CREDENTIALS_ENABLED !== "true") return jsonResponse({ error: "integration_settings_disabled" }, 503);
  const key = await integrationEncryptionKey(env);
  if (!key) return jsonResponse({ error: "vault_not_configured" }, 503);
  try {
    const currentRow = await env.DB.prepare("SELECT provider, ciphertext, iv, key_version, updated_at FROM integration_credentials WHERE tenant_id = ?1 AND provider = ?2")
      .bind(auth.tenant.id, provider).first<IntegrationCredentialRow>();
    const current = currentRow ? await decryptIntegrationCredential(currentRow, key, auth.tenant.id) : {};
    const next: StoredIntegrationCredential = { ...current };
    const fields: string[] = [];
    if (parsed.data.provider === "google_drive") {
      if (parsed.data.pickerApiKey !== undefined) { next.pickerApiKey = parsed.data.pickerApiKey; fields.push("pickerApiKey"); }
      if (parsed.data.clientId !== undefined) { next.clientId = parsed.data.clientId; fields.push("clientId"); }
    } else {
      if (parsed.data.clientId !== undefined) { next.clientId = parsed.data.clientId; fields.push("clientId"); }
      if (parsed.data.tenantId !== undefined) { next.tenantId = parsed.data.tenantId; fields.push("tenantId"); }
    }
    if (parsed.data.clientSecret !== undefined) { next.clientSecret = parsed.data.clientSecret; fields.push("clientSecret"); }
    else if (parsed.data.clearClientSecret === true) { next.clientSecret = null; fields.push("clientSecret"); }

    const changesOAuthClient = fields.some((field) => field !== "pickerApiKey");
    if (changesOAuthClient) {
      const connection = await env.DB.prepare("SELECT 1 FROM integration_connections WHERE tenant_id = ?1 AND provider = ?2")
        .bind(auth.tenant.id, provider).first();
      if (connection) return jsonResponse({ error: "integration_connected_disconnect_first" }, 409);
      const pending = await env.DB.prepare("SELECT 1 FROM integration_oauth_transactions WHERE tenant_id = ?1 AND provider = ?2 AND expires_at > ?3 LIMIT 1")
        .bind(auth.tenant.id, provider, new Date().toISOString()).first();
      if (pending) return jsonResponse({ error: "integration_oauth_in_progress" }, 409);
    }

    const now = new Date().toISOString();
    const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID();
    const hasAnyCredential = Object.values(next).some((item) => typeof item === "string" && item.length > 0);
    const write = hasAnyCredential
      ? await encryptIntegrationCredential(next, key, auth.tenant.id, provider).then(({ ciphertext, iv }) => env.DB.prepare(`INSERT INTO integration_credentials (tenant_id, provider, ciphertext, iv, key_version, updated_at, updated_by_user_id)
          VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)
          ON CONFLICT (tenant_id, provider) DO UPDATE SET ciphertext = excluded.ciphertext, iv = excluded.iv, key_version = excluded.key_version, updated_at = excluded.updated_at, updated_by_user_id = excluded.updated_by_user_id`)
        .bind(auth.tenant.id, provider, ciphertext, iv, now, auth.user.id))
      : env.DB.prepare("DELETE FROM integration_credentials WHERE tenant_id = ?1 AND provider = ?2").bind(auth.tenant.id, provider);
    const audit = env.DB.prepare("INSERT INTO integration_credential_audit_events (tenant_id, event_id, provider, actor_user_id, action, created_at, request_id, metadata) SELECT ?1, ?2, ?3, ?4, 'credentials_updated', ?5, ?6, ?7 WHERE changes() = 1")
      .bind(auth.tenant.id, crypto.randomUUID(), provider, auth.user.id, now, requestId, JSON.stringify({ fields }));
    const results = await env.DB.batch([write, audit]);
    const writeChanges = results[0]?.meta.changes ?? 0;
    if (writeChanges > 1 || (results[1]?.meta.changes ?? 0) !== writeChanges) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ item: integrationStatus(provider, next, hasAnyCredential ? now : null) }, 200);
  } catch {
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

async function clearIntegrationSettings(request: Request, env: Bindings, auth: TenantSession, provider: IntegrationProvider): Promise<Response> {
  const now = new Date().toISOString();
  try {
    const connection = await env.DB.prepare("SELECT 1 FROM integration_connections WHERE tenant_id = ?1 AND provider = ?2")
      .bind(auth.tenant.id, provider).first();
    if (connection) return jsonResponse({ error: "integration_connected_disconnect_first" }, 409);
    const pending = await env.DB.prepare("SELECT 1 FROM integration_oauth_transactions WHERE tenant_id = ?1 AND provider = ?2 AND expires_at > ?3 LIMIT 1")
      .bind(auth.tenant.id, provider, now).first();
    if (pending) return jsonResponse({ error: "integration_oauth_in_progress" }, 409);
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM integration_credentials WHERE tenant_id = ?1 AND provider = ?2").bind(auth.tenant.id, provider),
      env.DB.prepare("INSERT INTO integration_credential_audit_events (tenant_id, event_id, provider, actor_user_id, action, created_at, request_id, metadata) SELECT ?1, ?2, ?3, ?4, 'credentials_cleared', ?5, ?6, '{}' WHERE changes() = 1")
        .bind(auth.tenant.id, crypto.randomUUID(), provider, auth.user.id, now, request.headers.get("CF-Ray") ?? crypto.randomUUID()),
    ]);
    if ((results[1]?.meta.changes ?? 0) !== (results[0]?.meta.changes ?? 0)) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ item: integrationStatus(provider, {}, null) }, 200);
  } catch {
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

function integrationProviderPath(provider: IntegrationProvider): string {
  return provider === "google_drive" ? "google-drive" : "microsoft-graph";
}

type OAuthProviderEndpoint = "authorize" | "token" | "identity" | "revoke";

function localOAuthFixtureBaseUrl(env: Bindings): URL | null {
  if (env.MARCIA_E2E_OAUTH_FIXTURES !== "1") return null;
  try {
    const api = new URL(env.AUTH_BASE_URL);
    const web = new URL(env.WEB_ORIGIN);
    const fixture = new URL(env.MARCIA_E2E_OAUTH_BASE_URL ?? "http://127.0.0.1:8789");
    const isLoopbackHttp = (url: URL) => url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
    return isLoopbackHttp(api) && isLoopbackHttp(web) && isLoopbackHttp(fixture) ? fixture : null;
  } catch {
    return null;
  }
}

function isLocalOAuthFixtureEnabled(env: Bindings): boolean {
  return localOAuthFixtureBaseUrl(env) !== null;
}

function oauthProviderEndpoint(env: Bindings, provider: IntegrationProvider, endpoint: OAuthProviderEndpoint, tenantId = ""): string {
  const fixtureBase = localOAuthFixtureBaseUrl(env);
  if (endpoint !== "authorize" && fixtureBase) {
    const providerPath = provider === "google_drive" ? "google" : "microsoft";
    return new URL(`/${providerPath}/${endpoint}`, fixtureBase).toString();
  }
  if (provider === "google_drive") {
    switch (endpoint) {
      case "authorize": return "https://accounts.google.com/o/oauth2/v2/auth";
      case "token": return "https://oauth2.googleapis.com/token";
      case "identity": return "https://openidconnect.googleapis.com/v1/userinfo";
      case "revoke": return "https://oauth2.googleapis.com/revoke";
    }
  }
  switch (endpoint) {
    case "authorize": return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`;
    case "token": return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    case "identity": return "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName";
    case "revoke": throw new Error("Microsoft Graph does not expose a provider revocation endpoint for this delegated flow");
  }
}

function driveProviderApiRoot(env: Bindings, provider: IntegrationProvider): string {
  if (isLocalOAuthFixtureEnabled(env)) {
    const providerPath = provider === "google_drive" ? "google" : "microsoft";
    return new URL(`/${providerPath}/drive`, localOAuthFixtureBaseUrl(env)!).toString().replace(/\/$/, "");
  }
  return provider === "google_drive" ? "https://www.googleapis.com/drive" : "https://graph.microsoft.com";
}

function driveProviderUrl(env: Bindings, provider: IntegrationProvider, path: string): URL {
  return new URL(`${driveProviderApiRoot(env, provider)}${path}`);
}

function oauthReturnUrl(env: Bindings, platform: "web" | "native"): string {
  return platform === "native" ? "marcia-demo://oauth" : new URL("/oauth", env.WEB_ORIGIN).toString();
}

async function storedIntegrationCredential(env: Bindings, tenantId: string, provider: IntegrationProvider): Promise<{ value: StoredIntegrationCredential; updatedAt: string } | null> {
  const row = await env.DB.prepare("SELECT provider, ciphertext, iv, key_version, updated_at FROM integration_credentials WHERE tenant_id = ?1 AND provider = ?2")
    .bind(tenantId, provider).first<IntegrationCredentialRow>();
  if (!row) return null;
  const key = await integrationEncryptionKey(env);
  if (!key) throw new Error("Integration credential key unavailable");
  return { value: await decryptIntegrationCredential(row, key, tenantId), updatedAt: row.updated_at };
}

async function startIntegrationAuthorization(request: Request, env: Bindings, auth: TenantSession, provider: IntegrationProvider): Promise<Response> {
  if (env.INTEGRATION_CREDENTIALS_ENABLED !== "true" || env.INTEGRATION_OAUTH_ENABLED !== "true") {
    return jsonResponse({ error: "integration_oauth_disabled" }, 503);
  }
  const parsed = IntegrationConnectionStartSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request" }, 400);

  const key = await integrationEncryptionKey(env);
  if (!key) return jsonResponse({ error: "vault_not_configured" }, 503);
  let credential: StoredIntegrationCredential;
  try {
    const stored = await storedIntegrationCredential(env, auth.tenant.id, provider);
    if (!stored?.value.clientId || !stored.value.clientSecret) return jsonResponse({ error: "integration_credentials_incomplete" }, 409);
    credential = stored.value;
  } catch {
    return jsonResponse({ error: "vault_unavailable" }, 503);
  }

  let redirectUri: string;
  try {
    const authBase = new URL(env.AUTH_BASE_URL);
    if (authBase.protocol !== "https:" && authBase.hostname !== "localhost" && authBase.hostname !== "127.0.0.1") {
      return jsonResponse({ error: "oauth_callback_requires_https" }, 503);
    }
    redirectUri = new URL(`/api/integrations/${integrationProviderPath(provider)}/callback`, authBase).toString();
    if (parsed.data.platform === "web") {
      const appOrigin = new URL(env.WEB_ORIGIN);
      if (appOrigin.protocol !== "https:" && appOrigin.hostname !== "localhost" && appOrigin.hostname !== "127.0.0.1") {
        return jsonResponse({ error: "oauth_app_return_requires_https" }, 503);
      }
    }
  } catch {
    return jsonResponse({ error: "oauth_callback_not_configured" }, 503);
  }

  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const stateHash = [...await sha256(state)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const codeVerifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const codeChallenge = base64Url(await sha256(codeVerifier));
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const encryptedVerifier = await encryptOAuthVerifier(codeVerifier, key, auth.tenant.id, auth.user.id, provider, stateHash);
  const transaction = env.DB.prepare(`INSERT INTO integration_oauth_transactions (
      state_hash, tenant_id, provider, user_id, code_verifier_ciphertext, code_verifier_iv,
      redirect_uri, return_platform, status, expires_at, created_at
    ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?10
    WHERE (SELECT COUNT(*) FROM integration_oauth_transactions WHERE tenant_id = ?2 AND provider = ?3 AND expires_at > ?10) < 3`)
    .bind(stateHash, auth.tenant.id, provider, auth.user.id, encryptedVerifier.ciphertext,
      encryptedVerifier.iv, redirectUri, parsed.data.platform, expiresAt, createdAt);

  const authorizationUrl = new URL(oauthProviderEndpoint(env, provider, "authorize", credential.tenantId ?? ""));
  if (provider === "microsoft_graph" && !/^(common|organizations|consumers|[0-9a-f-]{36})$/i.test(credential.tenantId ?? "")) {
    return jsonResponse({ error: "microsoft_tenant_not_configured" }, 409);
  }
  const scopes = provider === "google_drive"
    ? ["openid", "email", "https://www.googleapis.com/auth/drive.file"]
    : ["offline_access", "User.Read", "Files.Read"];
  authorizationUrl.searchParams.set("client_id", credential.clientId!);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", scopes.join(" "));
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  if (provider === "google_drive") {
    authorizationUrl.searchParams.set("access_type", "offline");
    authorizationUrl.searchParams.set("include_granted_scopes", "true");
    authorizationUrl.searchParams.set("prompt", "consent select_account");
  } else {
    authorizationUrl.searchParams.set("prompt", "select_account");
  }

  try {
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM integration_oauth_transactions WHERE expires_at <= ?1").bind(createdAt),
      transaction,
    ]);
    if ((results[1]?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "oauth_rate_limited" }, 429, { "Retry-After": "60" });
  } catch {
    return jsonResponse({ error: "oauth_transaction_unavailable" }, 503);
  }
  return jsonResponse(IntegrationAuthorizationResponseSchema.parse({ authorizationUrl: authorizationUrl.toString(), expiresAt }), 200);
}

async function readProviderJson(response: Response, maxBytes = 32_768): Promise<Record<string, unknown>> {
  const contentLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error("Provider response too large");
  if (!response.body) throw new Error("Provider response missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Provider response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Provider response invalid");
  return parsed as Record<string, unknown>;
}

async function requestProviderJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), redirect: "manual" });
  if (!response.ok) throw new Error("Provider request failed");
  return readProviderJson(response);
}

function driveProviderRateLimit(response: Response): Response | null {
  if (response.status !== 429) return null;
  const retryAfter = Number(response.headers.get("Retry-After"));
  const retryAfterSeconds = Number.isInteger(retryAfter) ? Math.max(1, Math.min(300, retryAfter)) : 30;
  return jsonResponse({ error: "drive_rate_limited", retryAfterSeconds }, 429, { "Retry-After": String(retryAfterSeconds) });
}

async function readProviderBytes(response: Response, maxBytes: number): Promise<Uint8Array | "too_large"> {
  const contentLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return "too_large";
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return "too_large";
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function oauthTokenReply(value: Record<string, unknown>): { accessToken: string; refreshToken: string | null; expiresIn: number; scopes: string[] } {
  const parsed = z.object({
    access_token: z.string().min(1).max(8192),
    refresh_token: z.string().min(1).max(8192).optional(),
    expires_in: z.number().int().min(60).max(86_400),
    scope: z.string().max(4096).optional(),
    token_type: z.string().trim().toLowerCase().refine((type) => type === "bearer"),
  }).safeParse(value);
  if (!parsed.success) throw new Error("Provider token response invalid");
  const scopes = parsed.data.scope?.split(/\s+/).filter(Boolean).slice(0, 16) ?? [];
  return { accessToken: parsed.data.access_token, refreshToken: parsed.data.refresh_token ?? null, expiresIn: parsed.data.expires_in, scopes };
}

async function loadIntegrationConnection(env: Bindings, tenantId: string, provider: IntegrationProvider): Promise<{ row: IntegrationConnectionRow; value: StoredIntegrationConnection } | null> {
  const row = await env.DB.prepare("SELECT tenant_id, provider, ciphertext, iv, key_version, connected_at, updated_at, connected_by_user_id FROM integration_connections WHERE tenant_id = ?1 AND provider = ?2")
    .bind(tenantId, provider).first<IntegrationConnectionRow>();
  if (!row) return null;
  const key = await integrationEncryptionKey(env);
  if (!key) throw new Error("Integration key unavailable");
  return { row, value: await decryptIntegrationConnection(row, key) };
}

async function integrationAccessToken(env: Bindings, auth: TenantSession, provider: IntegrationProvider): Promise<{ accessToken: string; expiresAt: string } | null> {
  const key = await integrationEncryptionKey(env);
  if (!key) throw new Error("Integration key unavailable");
  const stored = await loadIntegrationConnection(env, auth.tenant.id, provider);
  if (!stored) return null;
  const now = Date.now();
  if (Date.parse(stored.value.expiresAt) > now + 90_000) return { accessToken: stored.value.accessToken, expiresAt: stored.value.expiresAt };
  if (!stored.value.refreshToken) return null;

  const credential = await storedIntegrationCredential(env, auth.tenant.id, provider);
  if (!credential?.value.clientId || !credential.value.clientSecret) return null;
  const tokenUrl = oauthProviderEndpoint(env, provider, "token", credential.value.tenantId ?? "");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: stored.value.refreshToken,
    client_id: credential.value.clientId,
    client_secret: credential.value.clientSecret,
  });
  const response = await fetch(tokenUrl, {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body, signal: AbortSignal.timeout(10_000), redirect: "manual",
  });
  if (!response.ok) {
    const latest = await loadIntegrationConnection(env, auth.tenant.id, provider);
    if (latest && (latest.row.ciphertext !== stored.row.ciphertext || latest.row.iv !== stored.row.iv) && Date.parse(latest.value.expiresAt) > Date.now() + 30_000) {
      return { accessToken: latest.value.accessToken, expiresAt: latest.value.expiresAt };
    }
    return null;
  }
  const tokenReply = oauthTokenReply(await readProviderJson(response));
  const updated = StoredIntegrationConnectionSchema.parse({
    ...stored.value,
    accessToken: tokenReply.accessToken,
    refreshToken: tokenReply.refreshToken ?? stored.value.refreshToken,
    expiresAt: new Date(Date.now() + tokenReply.expiresIn * 1000).toISOString(),
    grantedScopes: tokenReply.scopes.length ? tokenReply.scopes : stored.value.grantedScopes,
  });
  const encrypted = await encryptIntegrationConnection(updated, key, auth.tenant.id, provider, stored.row.connected_by_user_id);
  const updatedAt = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE integration_connections SET ciphertext = ?3, iv = ?4, key_version = 1, updated_at = ?5
      WHERE tenant_id = ?1 AND provider = ?2 AND ciphertext = ?6 AND iv = ?7`)
      .bind(auth.tenant.id, provider, encrypted.ciphertext, encrypted.iv, updatedAt, stored.row.ciphertext, stored.row.iv),
    env.DB.prepare(`INSERT INTO integration_connection_audit_events (
      tenant_id, event_id, provider, actor_user_id, action, created_at, request_id, metadata
    ) SELECT ?1, ?2, ?3, ?4, 'token_refreshed', ?5, ?6, ?7 WHERE changes() = 1`)
      .bind(auth.tenant.id, crypto.randomUUID(), provider, auth.user.id, updatedAt, crypto.randomUUID(), JSON.stringify({ scopes: updated.grantedScopes })),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 1 && (results[1]?.meta.changes ?? 0) === 1) {
    return { accessToken: updated.accessToken, expiresAt: updated.expiresAt };
  }
  const latest = await loadIntegrationConnection(env, auth.tenant.id, provider);
  if (latest && Date.parse(latest.value.expiresAt) > Date.now() + 30_000) {
    return { accessToken: latest.value.accessToken, expiresAt: latest.value.expiresAt };
  }
  return null;
}

async function exchangeIntegrationCode(
  env: Bindings,
  provider: IntegrationProvider,
  credential: StoredIntegrationCredential,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ connection: StoredIntegrationConnection; priorConnection: StoredIntegrationConnection | null }> {
  const tokenUrl = oauthProviderEndpoint(env, provider, "token", credential.tenantId ?? "");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: credential.clientId ?? "",
    client_secret: credential.clientSecret ?? "",
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  const tokens = oauthTokenReply(await requestProviderJson(tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }));
  const scopeKeys = tokens.scopes.map((scope) => scope.toLowerCase().split("/").at(-1));
  const requiredScope = provider === "google_drive" ? "drive.file" : "files.read";
  if (!scopeKeys.includes(requiredScope)) throw new Error("Provider did not grant the requested file scope");

  let accountId: string;
  let accountLabel: string;
  if (provider === "google_drive") {
    const identity = await requestProviderJson(oauthProviderEndpoint(env, provider, "identity"), {
      headers: { Accept: "application/json", Authorization: `Bearer ${tokens.accessToken}` },
    });
    const parsed = z.object({ sub: z.string().min(1).max(256), email: z.string().email().max(320) }).safeParse(identity);
    if (!parsed.success) throw new Error("Google account identity unavailable");
    accountId = parsed.data.sub;
    accountLabel = parsed.data.email;
  } else {
    const identity = await requestProviderJson(oauthProviderEndpoint(env, provider, "identity"), {
      headers: { Accept: "application/json", Authorization: `Bearer ${tokens.accessToken}` },
    });
    const parsed = z.object({
      id: z.string().min(1).max(256),
      mail: z.string().email().max(320).nullable().optional(),
      userPrincipalName: z.string().trim().min(1).max(320).nullable().optional(),
      displayName: z.string().trim().min(1).max(320).optional(),
    }).safeParse(identity);
    if (!parsed.success) throw new Error("Microsoft account identity unavailable");
    accountId = parsed.data.id;
    accountLabel = parsed.data.mail ?? parsed.data.userPrincipalName ?? parsed.data.displayName ?? parsed.data.id;
  }

  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
  return {
    connection: StoredIntegrationConnectionSchema.parse({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      accountId,
      accountLabel,
      grantedScopes: tokens.scopes,
    }),
    priorConnection: null,
  };
}

function integrationCallbackRedirect(env: Bindings, platform: "web" | "native", provider: IntegrationProvider, outcome: "connected" | "denied" | "failed"): Response {
  const destination = new URL(oauthReturnUrl(env, platform));
  destination.searchParams.set("provider", provider);
  destination.searchParams.set("result", outcome);
  return new Response(null, { status: 302, headers: {
    ...apiSecurityHeaders,
    Location: destination.toString(),
    "Cache-Control": "no-store",
  } });
}

async function completeIntegrationAuthorization(request: Request, env: Bindings, provider: IntegrationProvider): Promise<Response> {
  const url = new URL(request.url);
  let configuredOrigin: string;
  try { configuredOrigin = new URL(env.AUTH_BASE_URL).origin; } catch { return jsonResponse({ error: "oauth_callback_not_configured" }, 503); }
  if (url.origin !== configuredOrigin) return jsonResponse({ error: "oauth_callback_mismatch" }, 400);
  const state = url.searchParams.get("state") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return jsonResponse({ error: "oauth_state_invalid_or_expired" }, 400);
  const stateHash = [...await sha256(state)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const now = new Date().toISOString();
  const transaction = await env.DB.prepare(`SELECT state_hash, tenant_id, provider, user_id, code_verifier_ciphertext,
      code_verifier_iv, redirect_uri, return_platform, status, expires_at
    FROM integration_oauth_transactions WHERE state_hash = ?1 AND provider = ?2 AND status = 'pending' AND expires_at > ?3`)
    .bind(stateHash, provider, now).first<OAuthTransactionRow>();
  if (!transaction || transaction.redirect_uri !== `${url.origin}${url.pathname}`) return jsonResponse({ error: "oauth_state_invalid_or_expired" }, 400);
  const claimed = await env.DB.prepare("UPDATE integration_oauth_transactions SET status = 'exchanging' WHERE state_hash = ?1 AND provider = ?2 AND status = 'pending' AND expires_at > ?3")
    .bind(stateHash, provider, now).run();
  if ((claimed.meta.changes ?? 0) !== 1) return jsonResponse({ error: "oauth_state_invalid_or_expired" }, 400);

  const returnTo = (outcome: "connected" | "denied" | "failed") => integrationCallbackRedirect(env, transaction.return_platform, provider, outcome);
  const finish = async (outcome: "denied" | "failed") => {
    await env.DB.prepare("DELETE FROM integration_oauth_transactions WHERE state_hash = ?1 AND status = 'exchanging'")
      .bind(stateHash).run().catch(() => undefined);
    return returnTo(outcome);
  };
  if (url.searchParams.has("error")) return finish("denied");
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096 || env.INTEGRATION_OAUTH_ENABLED !== "true" || env.INTEGRATION_CREDENTIALS_ENABLED !== "true") return finish("failed");

  const key = await integrationEncryptionKey(env);
  if (!key) return finish("failed");
  try {
    const membership = await env.DB.prepare("SELECT role FROM tenant_memberships WHERE tenant_id = ?1 AND user_id = ?2")
      .bind(transaction.tenant_id, transaction.user_id).first<{ role: "owner" | "member" }>();
    if (membership?.role !== "owner") return finish("failed");
    const stored = await storedIntegrationCredential(env, transaction.tenant_id, provider);
    if (!stored?.value.clientId || !stored.value.clientSecret) return finish("failed");
    if (provider === "microsoft_graph" && !/^(common|organizations|consumers|[0-9a-f-]{36})$/i.test(stored.value.tenantId ?? "")) return finish("failed");
    const verifier = await decryptOAuthVerifier(transaction, key);
    const result = await exchangeIntegrationCode(env, provider, stored.value, code, verifier, transaction.redirect_uri);
    const previousRow = await env.DB.prepare("SELECT tenant_id, provider, ciphertext, iv, key_version, connected_at, updated_at, connected_by_user_id FROM integration_connections WHERE tenant_id = ?1 AND provider = ?2")
      .bind(transaction.tenant_id, provider).first<IntegrationConnectionRow>();
    const previous = previousRow ? await decryptIntegrationConnection(previousRow, key) : null;
    let connection = result.connection;
    if (!connection.refreshToken && previous?.accountId === connection.accountId && previous.refreshToken) {
      connection = StoredIntegrationConnectionSchema.parse({ ...connection, refreshToken: previous.refreshToken });
    }
    if (!connection.refreshToken) return finish("failed");
    const encrypted = await encryptIntegrationConnection(connection, key, transaction.tenant_id, provider, transaction.user_id);
    const connectedAt = previousRow?.connected_at ?? new Date().toISOString();
    const updatedAt = new Date().toISOString();
    const write = env.DB.prepare(`INSERT INTO integration_connections (
        tenant_id, provider, ciphertext, iv, key_version, connected_at, updated_at, connected_by_user_id
      ) SELECT ?1, ?2, ?3, ?4, 1, ?5, ?6, ?7
      WHERE EXISTS (SELECT 1 FROM integration_oauth_transactions WHERE state_hash = ?8 AND tenant_id = ?1 AND provider = ?2 AND user_id = ?7 AND status = 'exchanging')
      ON CONFLICT (tenant_id, provider) DO UPDATE SET ciphertext = excluded.ciphertext, iv = excluded.iv,
        key_version = excluded.key_version, updated_at = excluded.updated_at, connected_by_user_id = excluded.connected_by_user_id`)
      .bind(transaction.tenant_id, provider, encrypted.ciphertext, encrypted.iv, connectedAt, updatedAt, transaction.user_id, stateHash);
    const audit = env.DB.prepare(`INSERT INTO integration_connection_audit_events (
        tenant_id, event_id, provider, actor_user_id, action, created_at, request_id, metadata
      ) SELECT ?1, ?2, ?3, ?4, 'connected', ?5, ?6, ?7 WHERE changes() = 1`)
      .bind(transaction.tenant_id, crypto.randomUUID(), provider, transaction.user_id, updatedAt,
        request.headers.get("CF-Ray") ?? crypto.randomUUID(), JSON.stringify({ scopes: connection.grantedScopes }));
    const removeTransaction = env.DB.prepare("DELETE FROM integration_oauth_transactions WHERE state_hash = ?1 AND status = 'exchanging'").bind(stateHash);
    const results = await env.DB.batch([write, audit, removeTransaction]);
    if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) return returnTo("failed");
    return returnTo("connected");
  } catch {
    return finish("failed");
  }
}

async function disconnectIntegration(request: Request, env: Bindings, auth: TenantSession, provider: IntegrationProvider): Promise<Response> {
  const now = new Date().toISOString();
  let priorConnection: StoredIntegrationConnection | null = null;
  try {
    const row = await env.DB.prepare("SELECT tenant_id, provider, ciphertext, iv, key_version, connected_at, updated_at, connected_by_user_id FROM integration_connections WHERE tenant_id = ?1 AND provider = ?2")
      .bind(auth.tenant.id, provider).first<IntegrationConnectionRow>();
    if (row) {
      const key = await integrationEncryptionKey(env);
      if (!key) return jsonResponse({ error: "vault_not_configured" }, 503);
      priorConnection = await decryptIntegrationConnection(row, key);
    }
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM integration_oauth_transactions WHERE tenant_id = ?1 AND provider = ?2").bind(auth.tenant.id, provider),
      env.DB.prepare("DELETE FROM integration_connections WHERE tenant_id = ?1 AND provider = ?2").bind(auth.tenant.id, provider),
      env.DB.prepare(`INSERT INTO integration_connection_audit_events (
          tenant_id, event_id, provider, actor_user_id, action, created_at, request_id, metadata
        ) SELECT ?1, ?2, ?3, ?4, 'disconnected', ?5, ?6, '{}' WHERE changes() = 1`)
        .bind(auth.tenant.id, crypto.randomUUID(), provider, auth.user.id, now, request.headers.get("CF-Ray") ?? crypto.randomUUID()),
    ]);
    if ((results[2]?.meta.changes ?? 0) !== (results[1]?.meta.changes ?? 0)) return jsonResponse({ error: "write_failed" }, 500);
    let providerRevocation: "confirmed" | "not_confirmed" | "not_supported" = provider === "google_drive" ? "not_confirmed" : "not_supported";
    if (provider === "google_drive" && priorConnection?.refreshToken) {
      try {
        const revokeResponse = await fetch(oauthProviderEndpoint(env, provider, "revoke"), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: priorConnection.refreshToken }),
          signal: AbortSignal.timeout(8_000),
          redirect: "manual",
        });
        providerRevocation = revokeResponse.ok || revokeResponse.status === 400 ? "confirmed" : "not_confirmed";
      } catch { providerRevocation = "not_confirmed"; }
    }
    return jsonResponse({
      disconnected: (results[1]?.meta.changes ?? 0) === 1,
      providerRevocation,
    }, 200);
  } catch {
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

async function googlePickerSession(request: Request, env: Bindings, auth: TenantSession): Promise<Response> {
  if (env.INTEGRATION_CREDENTIALS_ENABLED !== "true" || env.INTEGRATION_OAUTH_ENABLED !== "true") {
    return jsonResponse({ error: "integration_oauth_disabled" }, 503);
  }
  const allowedOrigin = configuredPickerOrigin(env);
  const requestOrigin = request.headers.get("Origin");
  const sameOriginFetch = request.headers.get("Sec-Fetch-Site") === "same-origin";
  if (!allowedOrigin || (requestOrigin ? requestOrigin !== allowedOrigin : !sameOriginFetch)) {
    return jsonResponse({ error: "google_picker_origin_denied" }, 403);
  }
  try {
    const credential = await storedIntegrationCredential(env, auth.tenant.id, "google_drive");
    if (!credential?.value.pickerApiKey) return jsonResponse({ error: "google_picker_key_missing" }, 409);
    const token = await integrationAccessToken(env, auth, "google_drive");
    if (!token) return jsonResponse({ error: "integration_reauthorize_required" }, 409);
    const connection = await loadIntegrationConnection(env, auth.tenant.id, "google_drive");
    const granted = connection?.value.grantedScopes.map((scope) => scope.toLowerCase().split("/").at(-1)) ?? [];
    if (!granted.includes("drive.file")) return jsonResponse({ error: "google_drive_file_scope_missing" }, 409);
    return jsonResponse(GooglePickerSessionSchema.parse({
      developerKey: credential.value.pickerApiKey,
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
    }), 200);
  } catch {
    return jsonResponse({ error: "integration_unavailable" }, 503);
  }
}

async function listMicrosoftDriveFiles(request: Request, env: Bindings, auth: TenantSession): Promise<Response> {
  if (env.INTEGRATION_CREDENTIALS_ENABLED !== "true" || env.INTEGRATION_OAUTH_ENABLED !== "true") {
    return jsonResponse({ error: "integration_oauth_disabled" }, 503);
  }
  const params = new URL(request.url).searchParams;
  const parentId = params.get("parentId");
  const pageToken = params.get("pageToken");
  if (parentId && (parentId.length > 512 || !/^[A-Za-z0-9!._-]+$/.test(parentId))) return jsonResponse({ error: "invalid_folder_id" }, 400);
  if (pageToken && (pageToken.length > 4096 || [...pageToken].some((character) => character.charCodeAt(0) < 0x20))) {
    return jsonResponse({ error: "invalid_page_token" }, 400);
  }
  try {
    const token = await integrationAccessToken(env, auth, "microsoft_graph");
    if (!token) return jsonResponse({ error: "integration_reauthorize_required" }, 409);
    const path = parentId
      ? `/v1.0/me/drive/items/${encodeURIComponent(parentId)}/children`
      : "/v1.0/me/drive/root/children";
    const url = driveProviderUrl(env, "microsoft_graph", path);
    url.searchParams.set("$select", "id,name,file,folder,size,lastModifiedDateTime");
    url.searchParams.set("$top", "50");
    url.searchParams.set("$orderby", "name");
    if (pageToken) url.searchParams.set("$skiptoken", pageToken);
    const response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token.accessToken}` },
      signal: AbortSignal.timeout(10_000), redirect: "manual",
    });
    const rateLimit = driveProviderRateLimit(response);
    if (rateLimit) return rateLimit;
    if (!response.ok) return jsonResponse({ error: response.status === 401 || response.status === 403 ? "integration_reauthorize_required" : "drive_provider_unavailable" }, response.status === 401 || response.status === 403 ? 409 : 502);
    const payload = await readProviderJson(response, 128 * 1024);
    const values = z.array(z.unknown()).max(50).safeParse(payload.value);
    if (!values.success) return jsonResponse({ error: "drive_provider_response_invalid" }, 502);
    const items = values.data.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const candidate = value as Record<string, unknown>;
      const parsed = z.object({
        id: z.string().trim().min(1).max(512),
        name: z.string().trim().min(1).max(512),
        file: z.object({ mimeType: z.string().max(256).optional() }).passthrough().optional(),
        folder: z.object({}).passthrough().optional(),
        size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
        lastModifiedDateTime: z.string().datetime({ offset: true }).optional(),
      }).passthrough().safeParse(candidate);
      if (!parsed.success) return [];
      const folder = Boolean(parsed.data.folder);
      const mimeType = parsed.data.file?.mimeType ?? null;
      if (!folder && mimeType !== "application/pdf" && !parsed.data.name.toLowerCase().endsWith(".pdf")) return [];
      return [{
        id: parsed.data.id, name: parsed.data.name, mimeType,
        size: parsed.data.size ?? null, modifiedAt: parsed.data.lastModifiedDateTime ?? null, folder,
      }];
    });
    let nextPageToken: string | null = null;
    if (typeof payload["@odata.nextLink"] === "string") {
      const next = new URL(payload["@odata.nextLink"]);
      if (next.origin !== url.origin || next.pathname !== url.pathname) return jsonResponse({ error: "drive_provider_response_invalid" }, 502);
      nextPageToken = next.searchParams.get("$skiptoken");
      if (nextPageToken && nextPageToken.length > 4096) return jsonResponse({ error: "drive_provider_response_invalid" }, 502);
    }
    return jsonResponse(CloudDriveFilesResponseSchema.parse({ items, nextPageToken }), 200);
  } catch {
    return jsonResponse({ error: "integration_unavailable" }, 503);
  }
}

async function importCloudDriveFile(request: Request, env: Bindings, auth: TenantSession, provider: IntegrationProvider): Promise<Response> {
  if (env.INTEGRATION_CREDENTIALS_ENABLED !== "true" || env.INTEGRATION_OAUTH_ENABLED !== "true") {
    return jsonResponse({ error: "integration_oauth_disabled" }, 503);
  }
  const parsed = CloudDriveImportSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request" }, 400);
  const { fileId, caseId = null } = parsed.data;
  if (provider === "google_drive" && !/^[A-Za-z0-9_-]{1,512}$/.test(fileId)) return jsonResponse({ error: "invalid_file_id" }, 400);
  if (provider === "microsoft_graph" && !/^[A-Za-z0-9!._-]{1,512}$/.test(fileId)) return jsonResponse({ error: "invalid_file_id" }, 400);

  try {
    const token = await integrationAccessToken(env, auth, provider);
    if (!token) return jsonResponse({ error: "integration_reauthorize_required" }, 409);
    let name: string;
    let downloadUrl: URL;
    let downloadHeaders: HeadersInit;
    let microsoftDownload = false;

    if (provider === "google_drive") {
      const metadataUrl = driveProviderUrl(env, provider, `/v3/files/${encodeURIComponent(fileId)}`);
      metadataUrl.searchParams.set("fields", "id,name,mimeType,size,trashed,capabilities(canDownload)");
      const metadataResponse = await fetch(metadataUrl, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token.accessToken}` },
        signal: AbortSignal.timeout(10_000), redirect: "manual",
      });
      const rateLimit = driveProviderRateLimit(metadataResponse);
      if (rateLimit) return rateLimit;
      if (!metadataResponse.ok) return jsonResponse({ error: metadataResponse.status === 401 || metadataResponse.status === 403 ? "drive_file_unavailable" : "drive_provider_unavailable" }, metadataResponse.status === 401 || metadataResponse.status === 403 ? 404 : 502);
      const metadata = await readProviderJson(metadataResponse);
      const item = z.object({
        name: z.string().trim().min(1).max(512),
        mimeType: z.string().trim().min(1).max(256),
        size: z.string().regex(/^\d+$/).transform(Number).optional(),
        trashed: z.boolean().optional(),
        capabilities: z.object({ canDownload: z.boolean().optional() }).optional(),
      }).passthrough().safeParse(metadata);
      if (!item.success || item.data.trashed || item.data.capabilities?.canDownload !== true) return jsonResponse({ error: "drive_file_unavailable" }, 404);
      const googleDoc = item.data.mimeType === "application/vnd.google-apps.document";
      if (item.data.mimeType !== "application/pdf" && !googleDoc) return jsonResponse({ error: "pdf_file_required" }, 415);
      if (!googleDoc && item.data.size !== undefined && item.data.size > 10 * 1024 * 1024) return jsonResponse({ error: "document_too_large" }, 413);
      name = item.data.name.toLowerCase().endsWith(".pdf") ? item.data.name : `${item.data.name}.pdf`;
      downloadUrl = googleDoc
        ? driveProviderUrl(env, provider, `/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`)
        : driveProviderUrl(env, provider, `/v3/files/${encodeURIComponent(fileId)}?alt=media`);
      downloadHeaders = { Authorization: `Bearer ${token.accessToken}`, Accept: "application/pdf" };
    } else {
      const metadataUrl = driveProviderUrl(env, provider, `/v1.0/me/drive/items/${encodeURIComponent(fileId)}`);
      metadataUrl.searchParams.set("$select", "id,name,file,folder,size");
      const metadataResponse = await fetch(metadataUrl, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token.accessToken}` },
        signal: AbortSignal.timeout(10_000), redirect: "manual",
      });
      const rateLimit = driveProviderRateLimit(metadataResponse);
      if (rateLimit) return rateLimit;
      if (!metadataResponse.ok) return jsonResponse({ error: metadataResponse.status === 401 || metadataResponse.status === 403 ? "drive_file_unavailable" : "drive_provider_unavailable" }, metadataResponse.status === 401 || metadataResponse.status === 403 ? 404 : 502);
      const metadata = await readProviderJson(metadataResponse);
      const item = z.object({
        name: z.string().trim().min(1).max(512),
        file: z.object({ mimeType: z.string().max(256).optional() }).passthrough().optional(),
        folder: z.object({}).passthrough().optional(),
        size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
      }).passthrough().safeParse(metadata);
      if (!item.success || !item.data.file || item.data.folder) return jsonResponse({ error: "drive_file_unavailable" }, 404);
      if (item.data.file.mimeType !== "application/pdf" && !item.data.name.toLowerCase().endsWith(".pdf")) return jsonResponse({ error: "pdf_file_required" }, 415);
      if (item.data.size !== undefined && item.data.size > 10 * 1024 * 1024) return jsonResponse({ error: "document_too_large" }, 413);
      name = item.data.name.toLowerCase().endsWith(".pdf") ? item.data.name : `${item.data.name}.pdf`;
      downloadUrl = driveProviderUrl(env, provider, `/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`);
      downloadHeaders = { Authorization: `Bearer ${token.accessToken}`, Accept: "application/pdf, application/octet-stream" };
      microsoftDownload = true;
    }

    let download = await fetch(downloadUrl, {
      headers: downloadHeaders, signal: AbortSignal.timeout(20_000), redirect: "manual",
    });
    if (microsoftDownload && (download.status === 302 || download.status === 303)) {
      const location = download.headers.get("Location");
      if (!location) return jsonResponse({ error: "drive_download_unavailable" }, 502);
      const temporaryUrl = new URL(location);
      const host = temporaryUrl.hostname.toLowerCase();
      const trustedHost = host.endsWith(".1drv.com") || host.endsWith(".sharepoint.com") || host.endsWith(".sharepointonline.com");
      const fixtureBase = localOAuthFixtureBaseUrl(env);
      const localFixtureDownload = fixtureBase !== null && temporaryUrl.origin === fixtureBase.origin
        && /^\/microsoft\/download\/[A-Za-z0-9!._-]{1,512}$/.test(temporaryUrl.pathname);
      if ((temporaryUrl.protocol !== "https:" && !localFixtureDownload) || temporaryUrl.username || temporaryUrl.password
        || (temporaryUrl.port && !localFixtureDownload) || (!trustedHost && !localFixtureDownload)) {
        return jsonResponse({ error: "drive_download_unavailable" }, 502);
      }
      download = await fetch(temporaryUrl, { signal: AbortSignal.timeout(20_000), redirect: "manual" });
    }
    const rateLimit = driveProviderRateLimit(download);
    if (rateLimit) return rateLimit;
    if (!download.ok) return jsonResponse({ error: "drive_download_unavailable" }, 502);
    const bytes = await readProviderBytes(download, 10 * 1024 * 1024);
    if (bytes === "too_large") return jsonResponse({ error: "document_too_large" }, 413);
    if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") return jsonResponse({ error: "pdf_signature_invalid" }, 415);
    return importPdfIntoVault(request, env, auth, { bytes, fileName: name, caseId });
  } catch {
    return jsonResponse({ error: "drive_provider_unavailable" }, 502);
  }
}

type CourtPublicationRow = {
  source_hash: string;
  source_environment: DjenEnvironment;
  tribunal_code: string | null;
  communication_type: string | null;
  available_on: string | null;
  first_seen_at: string;
  last_seen_at: string;
  review_status: "pending" | "reviewed" | null;
  reviewed_at: string | null;
  review_updated_at: string | null;
};
type CourtCaseNoteRow = {
  tenant_id: string;
  note_id: string;
  case_id: string;
  body: string;
  created_at: string;
};
type CourtPublicationSyncRow = {
  status: "items_returned" | "empty_unconfirmed" | "rate_limited" | "source_error";
  source_environment: DjenEnvironment;
  checked_at: string;
  returned_count: number;
  warning_code: "coverage_unverified" | "empty_unconfirmed" | "rate_limited" | "source_unavailable" | "invalid_response" | "process_number_required" | null;
};

function djenEnvironment(env: Bindings): DjenEnvironment | null {
  if (!env.DJEN_ENVIRONMENT || env.DJEN_ENVIRONMENT === "homologation") return "homologation";
  return env.DJEN_ENVIRONMENT === "production" ? "production" : null;
}

function djenProviderEnabled(env: Bindings): boolean {
  return djenExternalProviderEnabled(env.DJEN_ENABLED, env.DJEN_SCHEMA_VERIFIED);
}

async function courtCaseNotes(request: Request, env: Bindings, auth: TenantSession, caseId: string): Promise<Response> {
  const courtCase = await env.DB.prepare("SELECT status FROM court_cases WHERE tenant_id = ?1 AND case_id = ?2 AND deleted_at IS NULL")
    .bind(auth.tenant.id, caseId).first<{ status: "active" | "archived" }>();
  if (!courtCase) return jsonResponse({ error: "not_found" }, 404);

  if (request.method === "GET") {
    const rows = await env.DB.prepare(`SELECT tenant_id, note_id, case_id, body, created_at
      FROM court_case_notes WHERE tenant_id = ?1 AND case_id = ?2
      ORDER BY created_at DESC, note_id DESC LIMIT 100`)
      .bind(auth.tenant.id, caseId).all<CourtCaseNoteRow>();
    return jsonResponse(CourtCaseNotesResponseSchema.parse({ items: rows.results.map((row) => CourtCaseNoteSchema.parse({
      id: row.note_id,
      tenantId: row.tenant_id,
      caseId: row.case_id,
      source: "manual",
      body: row.body,
      createdAt: row.created_at,
    })) }), 200);
  }

  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, POST, OPTIONS" });
  if (courtCase.status !== "active") return jsonResponse({ error: "court_case_archived" }, 409);
  const parsed = CourtCaseNoteCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);

  const noteId = crypto.randomUUID();
  const now = new Date().toISOString();
  const insert = env.DB.prepare(`INSERT INTO court_case_notes (tenant_id, note_id, case_id, body, created_at, created_by_user_id)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (
      SELECT 1 FROM court_cases WHERE tenant_id = ?1 AND case_id = ?3 AND status = 'active' AND deleted_at IS NULL
    )`).bind(auth.tenant.id, noteId, caseId, parsed.data.body, now, auth.user.id);
  const audit = env.DB.prepare(`INSERT INTO court_case_note_audit_events (
      tenant_id, event_id, note_id, case_id, actor_user_id, action, created_at, request_id, metadata
    ) SELECT ?1, ?2, ?3, ?4, ?5, 'created', ?6, ?7, ?8 WHERE changes() = 1`)
    .bind(auth.tenant.id, crypto.randomUUID(), noteId, caseId, auth.user.id, now,
      request.headers.get("CF-Ray") ?? crypto.randomUUID(), JSON.stringify({ characterCount: parsed.data.body.length }));
  try {
    const results = await env.DB.batch([insert, audit]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      const current = await env.DB.prepare("SELECT status FROM court_cases WHERE tenant_id = ?1 AND case_id = ?2 AND deleted_at IS NULL")
        .bind(auth.tenant.id, caseId).first<{ status: "active" | "archived" }>();
      return current?.status === "archived" ? jsonResponse({ error: "court_case_archived" }, 409) : jsonResponse({ error: "not_found" }, 404);
    }
    if ((results[1]?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
    const item = CourtCaseNoteSchema.parse({ id: noteId, tenantId: auth.tenant.id, caseId, source: "manual", body: parsed.data.body, createdAt: now });
    return jsonResponse({ item }, 201);
  } catch {
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

async function readCourtPublications(env: Bindings, auth: TenantSession, caseId: string): Promise<Response> {
  const courtCase = await env.DB.prepare("SELECT case_id FROM court_cases WHERE tenant_id = ?1 AND case_id = ?2 AND deleted_at IS NULL")
    .bind(auth.tenant.id, caseId).first<{ case_id: string }>();
  if (!courtCase) return jsonResponse({ error: "not_found" }, 404);

  const [publicationRows, syncRow] = await Promise.all([
    env.DB.prepare(`SELECT p.source_hash, p.source_environment, p.tribunal_code, p.communication_type, p.available_on, p.first_seen_at, p.last_seen_at,
        r.status AS review_status, r.reviewed_at, r.updated_at AS review_updated_at
      FROM court_publications p LEFT JOIN court_publication_reviews r
        ON r.tenant_id = p.tenant_id AND r.case_id = p.case_id AND r.source_hash = p.source_hash
      WHERE p.tenant_id = ?1 AND p.case_id = ?2
      ORDER BY p.available_on DESC, p.last_seen_at DESC LIMIT 100`)
      .bind(auth.tenant.id, caseId).all<CourtPublicationRow>(),
    env.DB.prepare("SELECT status, source_environment, checked_at, returned_count, warning_code FROM court_publication_syncs WHERE tenant_id = ?1 AND case_id = ?2")
      .bind(auth.tenant.id, caseId).first<CourtPublicationSyncRow>(),
  ]);

  const environment = djenEnvironment(env) ?? "homologation";
  const items = publicationRows.results.map((row) => CourtPublicationSchema.parse({
    id: row.source_hash,
    tenantId: auth.tenant.id,
    caseId,
    source: "DJEN",
    sourceHash: row.source_hash,
    environment: row.source_environment,
    tribunalCode: row.tribunal_code,
    communicationType: row.communication_type,
    availableOn: row.available_on,
    certificateUrl: djenCertificateUrl(row.source_hash, row.source_environment),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    review: {
      status: row.review_status ?? "pending",
      reviewedAt: row.reviewed_at,
      updatedAt: row.review_updated_at,
    },
  }));
  const sync = CourtPublicationSyncSchema.parse(syncRow ? {
    status: syncRow.status,
    environment: syncRow.source_environment,
    checkedAt: syncRow.checked_at,
    returnedCount: syncRow.returned_count,
    warningCode: syncRow.warning_code,
  } : {
    status: "not_checked",
    environment,
    checkedAt: null,
    returnedCount: 0,
    warningCode: null,
  });
  return jsonResponse(CourtPublicationsResponseSchema.parse({
    providerEnabled: djenProviderEnabled(env),
    sourceUrl: "https://comunica.pje.jus.br/",
    sync,
    items,
  }), 200);
}

async function updateCourtPublicationReview(
  request: Request,
  env: Bindings,
  auth: TenantSession,
  caseId: string,
  sourceHash: string,
): Promise<Response> {
  const parsed = CourtPublicationReviewChangeSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  const caseAndPublication = await env.DB.prepare(`SELECT c.status AS case_status FROM court_cases c
      JOIN court_publications p ON p.tenant_id = c.tenant_id AND p.case_id = c.case_id
      WHERE c.tenant_id = ?1 AND c.case_id = ?2 AND p.source_hash = ?3 AND c.deleted_at IS NULL`)
    .bind(auth.tenant.id, caseId, sourceHash).first<{ case_status: "active" | "archived" }>();
  if (!caseAndPublication) return jsonResponse({ error: "not_found" }, 404);
  if (caseAndPublication.case_status !== "active") return jsonResponse({ error: "court_case_archived" }, 409);

  const previousUpdatedAt = parsed.data.expectedUpdatedAt;
  const now = new Date(Math.max(Date.now(), previousUpdatedAt ? Date.parse(previousUpdatedAt) + 1 : 0)).toISOString();
  const reviewed = parsed.data.status === "reviewed";
  const action = reviewed ? "reviewed" : "reopened";
  const write = previousUpdatedAt === null
    ? env.DB.prepare(`INSERT INTO court_publication_reviews (
        tenant_id, case_id, source_hash, status, reviewed_at, reviewed_by_user_id, updated_at, updated_by_user_id
      ) SELECT ?1, ?2, ?3, 'reviewed', ?4, ?5, ?4, ?5 WHERE EXISTS (
        SELECT 1 FROM court_cases c JOIN court_publications p ON p.tenant_id = c.tenant_id AND p.case_id = c.case_id
        WHERE c.tenant_id = ?1 AND c.case_id = ?2 AND p.source_hash = ?3 AND c.status = 'active' AND c.deleted_at IS NULL
      )`).bind(auth.tenant.id, caseId, sourceHash, now, auth.user.id)
    : env.DB.prepare(`UPDATE court_publication_reviews SET status = ?1, reviewed_at = ?2, reviewed_by_user_id = ?3,
        updated_at = ?4, updated_by_user_id = ?5
      WHERE tenant_id = ?6 AND case_id = ?7 AND source_hash = ?8 AND updated_at = ?9 AND status <> ?1
        AND EXISTS (SELECT 1 FROM court_cases WHERE tenant_id = ?6 AND case_id = ?7 AND status = 'active' AND deleted_at IS NULL)`)
      .bind(parsed.data.status, reviewed ? now : null, reviewed ? auth.user.id : null, now, auth.user.id,
        auth.tenant.id, caseId, sourceHash, previousUpdatedAt);
  const audit = env.DB.prepare(`INSERT INTO court_publication_review_audit_events (
      tenant_id, event_id, case_id, source_hash, actor_user_id, action, created_at, request_id
    ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE changes() = 1 AND EXISTS (
      SELECT 1 FROM court_publication_reviews WHERE tenant_id = ?1 AND case_id = ?3 AND source_hash = ?4 AND updated_at = ?7
    )`).bind(auth.tenant.id, crypto.randomUUID(), caseId, sourceHash, auth.user.id, action, now,
      request.headers.get("CF-Ray") ?? crypto.randomUUID());
  try {
    const results = await env.DB.batch([write, audit]);
    if ((results[0]?.meta.changes ?? 0) === 1 && (results[1]?.meta.changes ?? 0) === 1) {
      return jsonResponse({ status: parsed.data.status, reviewedAt: reviewed ? now : null, updatedAt: now }, 200);
    }
  } catch {
    // Resolve below so a stale/repeated action is reported as a conflict, not a generic database error.
  }

  const current = await env.DB.prepare(`SELECT c.status AS case_status, r.updated_at FROM court_cases c
      JOIN court_publications p ON p.tenant_id = c.tenant_id AND p.case_id = c.case_id
      LEFT JOIN court_publication_reviews r ON r.tenant_id = p.tenant_id AND r.case_id = p.case_id AND r.source_hash = p.source_hash
      WHERE c.tenant_id = ?1 AND c.case_id = ?2 AND p.source_hash = ?3 AND c.deleted_at IS NULL`)
    .bind(auth.tenant.id, caseId, sourceHash).first<{ case_status: "active" | "archived"; updated_at: string | null }>();
  if (!current) return jsonResponse({ error: "not_found" }, 404);
  if (current.case_status !== "active") return jsonResponse({ error: "court_case_archived" }, 409);
  return jsonResponse({ error: "conflict", currentUpdatedAt: current.updated_at }, 409);
}

async function acquireCourtProviderSlot(env: Bindings, now: string): Promise<number | null> {
  const nextAllowedAt = new Date(Date.parse(now) + 3_000).toISOString();
  const result = await env.DB.prepare(`INSERT INTO court_provider_rate_limits (provider, next_allowed_at)
      VALUES ('djen', ?1)
      ON CONFLICT (provider) DO UPDATE SET next_allowed_at = excluded.next_allowed_at
      WHERE court_provider_rate_limits.next_allowed_at <= ?2`)
    .bind(nextAllowedAt, now).run();
  if ((result.meta.changes ?? 0) === 1) return null;
  const row = await env.DB.prepare("SELECT next_allowed_at FROM court_provider_rate_limits WHERE provider = 'djen'").first<{ next_allowed_at: string }>();
  return row ? Math.max(1, Math.ceil((Date.parse(row.next_allowed_at) - Date.parse(now)) / 1000)) : 3;
}

async function extendCourtProviderPause(env: Bindings, retryAfterSeconds: number): Promise<void> {
  const nextAllowedAt = new Date(Date.now() + Math.max(3, retryAfterSeconds) * 1000).toISOString();
  await env.DB.prepare("UPDATE court_provider_rate_limits SET next_allowed_at = ?1 WHERE provider = 'djen' AND next_allowed_at < ?1")
    .bind(nextAllowedAt).run();
}

async function searchDjenCasesByOab(request: Request, env: Bindings, auth: TenantSession): Promise<Response> {
  const localFixture = env.DJEN_TEST_FIXTURES === "true";
  const gate = djenGate({
    enabled: env.DJEN_ENABLED,
    schemaVerified: env.DJEN_SCHEMA_VERIFIED,
    testFixtures: env.DJEN_TEST_FIXTURES,
    requestHostname: new URL(request.url).hostname,
  });
  if (gate !== "ready" || (!localFixture && env.DJEN_OAB_ENABLED !== "true")) {
    return jsonResponse({ error: "djen_discovery_disabled" }, 503);
  }
  const environment = djenEnvironment(env);
  if (!environment) return jsonResponse({ error: "djen_configuration_invalid" }, 503);
  const parsed = DjenDiscoveryRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "djen_discovery_invalid_query" }, 422);
  const query = parsed.data;
  const blockedFor = await acquireCourtProviderSlot(env, new Date().toISOString());
  const throttled = (seconds: number) => jsonResponse(
    { error: "djen_rate_limited", retryAfterSeconds: seconds }, 429, { "Retry-After": String(seconds) },
  );
  if (blockedFor !== null) return throttled(blockedFor);

  let result: Awaited<ReturnType<typeof discoverDjenCases>>;
  try {
    const fixture: typeof fetch | undefined = localFixture ? async () => {
      const publication = {
        numero_processo: "99999995320998160000",
        siglaTribunal: "TJPR",
        data_disponibilizacao: query.endDate,
        ativo: true,
        destinatarios: [{ nome: "Pessoa fictícia" }],
        destinatarioadvogados: [{ advogado: { numero_oab: query.oabNumber, uf_oab: query.oabState } }],
      };
      const items = query.page === 1
        ? [...Array.from({ length: 4 }, () => publication), { ...publication, destinatarios: [{ nome: "SIGILO" }] }]
        : query.page === 2 ? [{ ...publication, numero_processo: "99999986820998160000" }] : [];
      return Response.json({ status: "success", count: 6, items });
    } : undefined;
    result = await discoverDjenCases(query, environment, fixture);
  } catch (error) {
    const failure = error instanceof DjenProviderError ? error : new DjenProviderError("source_unavailable");
    if (failure.code === "rate_limited") {
      const wait = Math.max(3, failure.retryAfterSeconds ?? 60);
      await extendCourtProviderPause(env, wait);
      return throttled(wait);
    }
    return jsonResponse({ error: `djen_${failure.code}` }, 502);
  }

  if (result.remainingRequests === 0) await extendCourtProviderPause(env, 60);
  const numbers = result.items.flatMap(({ caseNumber }) => [caseNumber, formatCnjCaseNumber(caseNumber)]);
  const registered = new Set<string>();
  if (numbers.length) {
    const placeholders = numbers.map(() => "?").join(", ");
    const rows = await env.DB.prepare(`SELECT DISTINCT case_number FROM court_cases
      WHERE tenant_id = ? AND deleted_at IS NULL AND case_number IN (${placeholders})`)
      .bind(auth.tenant.id, ...numbers).all<{ case_number: string }>();
    for (const row of rows.results) registered.add(row.case_number.replace(/\D/g, ""));
  }

  return jsonResponse(DjenDiscoveryResponseSchema.parse({
    source: "DJEN",
    checkedAt: new Date().toISOString(),
    page: query.page,
    sourceCount: result.sourceCount,
    returnedCount: result.returnedCount,
    omittedCount: result.omittedCount,
    hasMore: result.hasMore,
    items: result.items.map((item) => ({ ...item, alreadyRegistered: registered.has(item.caseNumber) })),
  }), 200);
}

async function writeCourtPublicationSync(
  env: Bindings,
  request: Request,
  auth: TenantSession,
  caseId: string,
  status: CourtPublicationSyncRow["status"],
  returnedCount: number,
  warningCode: CourtPublicationSyncRow["warning_code"],
  checkedAt: string,
  environment: DjenEnvironment,
  publications: Awaited<ReturnType<typeof fetchDjenPublications>>["items"] = [],
): Promise<boolean> {
  const statements = publications.map((publication) => env.DB.prepare(`INSERT INTO court_publications (
        tenant_id, case_id, source_hash, source_environment, tribunal_code, communication_type, available_on, first_seen_at, last_seen_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
      ON CONFLICT (tenant_id, case_id, source_hash) DO UPDATE SET
        source_environment = excluded.source_environment,
        tribunal_code = excluded.tribunal_code,
        communication_type = excluded.communication_type,
        available_on = excluded.available_on,
        last_seen_at = excluded.last_seen_at`)
    .bind(auth.tenant.id, caseId, publication.sourceHash, environment, publication.tribunalCode,
      publication.communicationType, publication.availableOn, checkedAt));
  statements.push(env.DB.prepare(`INSERT INTO court_publication_syncs (
        tenant_id, case_id, status, source_environment, checked_at, returned_count, warning_code, checked_by_user_id
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT (tenant_id, case_id) DO UPDATE SET
        status = excluded.status,
        source_environment = excluded.source_environment,
        checked_at = excluded.checked_at,
        returned_count = excluded.returned_count,
        warning_code = excluded.warning_code,
        checked_by_user_id = excluded.checked_by_user_id`)
    .bind(auth.tenant.id, caseId, status, environment, checkedAt, returnedCount, warningCode, auth.user.id));
  statements.push(env.DB.prepare(`INSERT INTO court_publication_sync_audit_events (
        tenant_id, event_id, case_id, actor_user_id, status, returned_count, created_at, request_id
      ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE changes() = 1`)
    .bind(auth.tenant.id, crypto.randomUUID(), caseId, auth.user.id, status, returnedCount, checkedAt,
      request.headers.get("CF-Ray") ?? crypto.randomUUID()));
  try {
    const results = await env.DB.batch(statements);
    return (results.at(-2)?.meta.changes ?? 0) === 1 && (results.at(-1)?.meta.changes ?? 0) === 1;
  } catch {
    return false;
  }
}

async function syncCourtPublications(request: Request, env: Bindings, auth: TenantSession, caseId: string): Promise<Response> {
  const localTestFixture = env.DJEN_TEST_FIXTURES === "true";
  const requestHost = new URL(request.url).hostname;
  const gate = djenGate({
    enabled: env.DJEN_ENABLED,
    schemaVerified: env.DJEN_SCHEMA_VERIFIED,
    testFixtures: env.DJEN_TEST_FIXTURES,
    requestHostname: requestHost,
  });
  if (gate === "disabled") return jsonResponse({ error: "djen_disabled" }, 503);
  // The Android emulator reaches this local-only server through the reserved 10.0.2.2 alias.
  if (gate === "fixture_not_local") {
    return jsonResponse({ error: "djen_test_fixture_not_local" }, 503);
  }
  if (gate === "schema_unverified") {
    return jsonResponse({ error: "djen_schema_unverified" }, 503);
  }
  const environment = djenEnvironment(env);
  if (!environment) return jsonResponse({ error: "djen_configuration_invalid" }, 503);

  const courtCase = await env.DB.prepare("SELECT case_id, case_number, status FROM court_cases WHERE tenant_id = ?1 AND case_id = ?2 AND deleted_at IS NULL")
    .bind(auth.tenant.id, caseId).first<{ case_id: string; case_number: string | null; status: "active" | "archived" }>();
  if (!courtCase) return jsonResponse({ error: "not_found" }, 404);
  if (courtCase.status !== "active") return jsonResponse({ error: "court_case_archived" }, 409);
  if (!courtCase.case_number || !isValidCnjCaseNumber(courtCase.case_number)) {
    return jsonResponse({ error: "process_number_required" }, 422);
  }
  const processNumber = courtCase.case_number;

  const requestedAt = new Date().toISOString();
  const retryAfterSeconds = await acquireCourtProviderSlot(env, requestedAt);
  if (retryAfterSeconds !== null) return jsonResponse({ error: "djen_rate_limited", retryAfterSeconds }, 429);

  let sourceResult: Awaited<ReturnType<typeof fetchDjenPublications>>;
  try {
    if (localTestFixture) {
      const fixtureFetcher: typeof fetch = async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.searchParams.get("numeroProcesso") !== processNumber.replace(/\D/g, "")) {
          return new Response("", { status: 400 });
        }
        return new Response(JSON.stringify({
          count: 1,
          items: [{
            hash: "e2eSyntheticPublicationHash001",
            numero_processo: processNumber,
            data_disponibilizacao: "2099-01-02",
            siglaTribunal: "TJXX",
            tipoComunicacao: "Comunicado sintético para teste",
          }],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "X-RateLimit-Remaining": "100" },
        });
      };
      sourceResult = await fetchDjenPublications(processNumber, environment, fixtureFetcher);
    } else {
      sourceResult = await fetchDjenPublications(processNumber, environment);
    }
  } catch (error) {
    const providerError = error instanceof DjenProviderError ? error : new DjenProviderError("source_unavailable");
    const checkedAt = new Date().toISOString();
    const rateLimited = providerError.code === "rate_limited";
    const retryAfter = rateLimited ? Math.max(3, providerError.retryAfterSeconds ?? 30) : null;
    if (retryAfter !== null) await extendCourtProviderPause(env, retryAfter);
    const warningCode = providerError.code;
    const recorded = await writeCourtPublicationSync(env, request, auth, caseId,
      rateLimited ? "rate_limited" : "source_error", 0, warningCode, checkedAt, environment);
    if (!recorded) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ error: `djen_${providerError.code}`, retryAfterSeconds: retryAfter }, rateLimited ? 429 : 502);
  }

  if (sourceResult.remainingRequests === 0) {
    try { await extendCourtProviderPause(env, 60); }
    catch { return jsonResponse({ error: "write_failed" }, 500); }
  }

  const checkedAt = new Date().toISOString();
  const publications = sourceResult.items;
  const status = publications.length > 0 ? "items_returned" : "empty_unconfirmed";
  const warningCode = publications.length > 0 ? "coverage_unverified" : "empty_unconfirmed";
  const saved = await writeCourtPublicationSync(env, request, auth, caseId, status, publications.length,
    warningCode, checkedAt, environment, publications);
  if (!saved) return jsonResponse({ error: "write_failed" }, 500);
  return readCourtPublications(env, auth, caseId);
}

async function clients(request: Request, env: Bindings, auth: TenantSession): Promise<Response> {
  if (request.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM clients WHERE tenant_id = ?1 ORDER BY updated_at DESC, rowid DESC LIMIT 100")
      .bind(auth.tenant.id).all<Record<string, unknown>>();
    return jsonResponse({ items: rows.results.map(clientFromRow) }, 200);
  }
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, POST, OPTIONS" });
  const parsed = ClientCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const insert = env.DB.prepare("INSERT INTO clients (tenant_id, client_id, display_name, email, phone, status, created_at, updated_at, created_by_user_id, updated_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6, ?7, ?7)")
    .bind(auth.tenant.id, id, parsed.data.displayName, parsed.data.email ?? null, parsed.data.phone ?? null, now, auth.user.id);
  const audit = env.DB.prepare("INSERT INTO client_audit_events (tenant_id, event_id, client_id, actor_user_id, action, created_at, request_id) SELECT ?1, ?2, ?3, ?4, 'created', ?5, ?6 WHERE changes() = 1 AND EXISTS (SELECT 1 FROM clients WHERE tenant_id = ?1 AND client_id = ?3 AND created_at = ?5)")
    .bind(auth.tenant.id, crypto.randomUUID(), id, auth.user.id, now, request.headers.get("CF-Ray") ?? crypto.randomUUID());
  try {
    const results = await env.DB.batch([insert, audit]);
    if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
    const row = await env.DB.prepare("SELECT * FROM clients WHERE tenant_id = ?1 AND client_id = ?2").bind(auth.tenant.id, id).first<Record<string, unknown>>();
    return row ? jsonResponse({ item: clientFromRow(row) }, 201) : jsonResponse({ error: "write_failed" }, 500);
  } catch { return jsonResponse({ error: "write_failed" }, 500); }
}

async function updateClient(request: Request, env: Bindings, auth: TenantSession, clientId: string): Promise<Response> {
  const parsed = ClientUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  const updates = ([
    ["displayName", "display_name"], ["email", "email"], ["phone", "phone"],
  ] as const).flatMap(([key, column]) => parsed.data[key] === undefined ? [] : [{ column, value: parsed.data[key] }]);
  const now = new Date(Math.max(Date.now(), Date.parse(parsed.data.expectedUpdatedAt) + 1)).toISOString();
  const assignments = updates.map((item, index) => `${item.column} = ?${index + 1}`);
  const p = updates.length;
  const update = env.DB.prepare(`UPDATE clients SET ${assignments.join(", ")}, updated_at = ?${p + 1}, updated_by_user_id = ?${p + 2} WHERE tenant_id = ?${p + 3} AND client_id = ?${p + 4} AND updated_at = ?${p + 5}`)
    .bind(...updates.map((item) => item.value), now, auth.user.id, auth.tenant.id, clientId, parsed.data.expectedUpdatedAt);
  const audit = env.DB.prepare("INSERT INTO client_audit_events (tenant_id, event_id, client_id, actor_user_id, action, created_at, request_id, metadata) SELECT ?1, ?2, ?3, ?4, 'updated', ?5, ?6, ?7 WHERE changes() = 1 AND EXISTS (SELECT 1 FROM clients WHERE tenant_id = ?1 AND client_id = ?3 AND updated_at = ?5 AND updated_by_user_id = ?4)")
    .bind(auth.tenant.id, crypto.randomUUID(), clientId, auth.user.id, now, request.headers.get("CF-Ray") ?? crypto.randomUUID(), JSON.stringify({ fields: updates.map((item) => item.column) }));
  try {
    const results = await env.DB.batch([update, audit]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      const exists = await env.DB.prepare("SELECT 1 FROM clients WHERE tenant_id = ?1 AND client_id = ?2").bind(auth.tenant.id, clientId).first();
      return exists ? jsonResponse({ error: "conflict" }, 409) : jsonResponse({ error: "not_found" }, 404);
    }
    if ((results[1]?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
    const row = await env.DB.prepare("SELECT * FROM clients WHERE tenant_id = ?1 AND client_id = ?2").bind(auth.tenant.id, clientId).first<Record<string, unknown>>();
    return row ? jsonResponse({ item: clientFromRow(row) }, 200) : jsonResponse({ error: "write_failed" }, 500);
  } catch { return jsonResponse({ error: "write_failed" }, 500); }
}

async function changeClientStatus(request: Request, env: Bindings, auth: TenantSession, clientId: string): Promise<Response> {
  const parsed = StatusChangeSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  if (parsed.data.status !== "active" && parsed.data.status !== "archived") return jsonResponse({ error: "invalid_request", details: [{ path: "status", code: "invalid_value" }] }, 400);
  const fromStatus = parsed.data.status === "active" ? "archived" : "active";
  const now = new Date(Math.max(Date.now(), Date.parse(parsed.data.expectedUpdatedAt) + 1)).toISOString();
  const update = env.DB.prepare("UPDATE clients SET status = ?1, updated_at = ?2, updated_by_user_id = ?3 WHERE tenant_id = ?4 AND client_id = ?5 AND status = ?6 AND updated_at = ?7")
    .bind(parsed.data.status, now, auth.user.id, auth.tenant.id, clientId, fromStatus, parsed.data.expectedUpdatedAt);
  const audit = env.DB.prepare("INSERT INTO client_audit_events (tenant_id, event_id, client_id, actor_user_id, action, created_at, request_id, metadata) SELECT ?1, ?2, ?3, ?4, 'status_changed', ?5, ?6, ?7 WHERE changes() = 1 AND EXISTS (SELECT 1 FROM clients WHERE tenant_id = ?1 AND client_id = ?3 AND updated_at = ?5 AND status = ?8)")
    .bind(auth.tenant.id, crypto.randomUUID(), clientId, auth.user.id, now, request.headers.get("CF-Ray") ?? crypto.randomUUID(), JSON.stringify({ status: parsed.data.status }), parsed.data.status);
  try {
    const results = await env.DB.batch([update, audit]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      const exists = await env.DB.prepare("SELECT 1 FROM clients WHERE tenant_id = ?1 AND client_id = ?2").bind(auth.tenant.id, clientId).first();
      return exists ? jsonResponse({ error: "conflict" }, 409) : jsonResponse({ error: "not_found" }, 404);
    }
    if ((results[1]?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ status: parsed.data.status }, 200);
  } catch { return jsonResponse({ error: "write_failed" }, 500); }
}

const tenantSessionCache = new WeakMap<Request, Promise<TenantSession | null>>();

function tenantSession(request: Request, env: Bindings): Promise<TenantSession | null> {
  const cached = tenantSessionCache.get(request);
  if (cached) return cached;
  const pending = (async (): Promise<TenantSession | null> => {
    const session = await createAuth(env).api.getSession({ headers: request.headers });
    if (!session?.user?.id) return null;
    const membership = await env.DB.prepare(
      `SELECT tenant_id AS id, role FROM tenant_memberships WHERE user_id = ?1
       ORDER BY created_at ASC, tenant_id ASC LIMIT 1`,
    ).bind(session.user.id).first<{ id: string; role: "owner" | "member" }>();
    if (!membership) return null;
    return {
      user: { id: session.user.id, name: session.user.name, email: session.user.email },
      tenant: membership,
      sessionCreatedAt: new Date(session.session.createdAt).toISOString(),
    };
  })();
  tenantSessionCache.set(request, pending);
  return pending;
}

async function readJson(request: Request): Promise<unknown | null> {
  try {
    if (!request.body) return null;
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16_384) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

type DomainEntity = "matter" | "court_case" | "task" | "appointment" | "financial_entry";
const entityTable = {
  matter: { table: "matters", idColumn: "matter_id", statusValues: ["active", "archived"] },
  court_case: { table: "court_cases", idColumn: "case_id", statusValues: ["active", "archived"] },
  task: { table: "tasks", idColumn: "task_id", statusValues: ["todo", "in_progress", "done", "cancelled"] },
  appointment: { table: "appointments", idColumn: "appointment_id", statusValues: ["scheduled", "cancelled"] },
  financial_entry: { table: "financial_entries", idColumn: "entry_id", statusValues: ["planned", "paid", "cancelled"] },
} as const;
const statusTransitions = {
  matter: { active: ["archived"], archived: ["active"] },
  court_case: { active: ["archived"], archived: ["active"] },
  task: { todo: ["done", "in_progress"], in_progress: ["todo"], done: ["todo"], cancelled: ["todo", "in_progress"] },
  appointment: { cancelled: ["scheduled"] },
  financial_entry: { paid: ["planned"], cancelled: ["planned"] },
} as const;

function validTimezone(value: string | null | undefined): boolean {
  if (!value) return true;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
}

async function listItems(request: Request, env: Bindings, auth: TenantSession, entity: DomainEntity): Promise<Response> {
  if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, POST, OPTIONS" });
  if (entity === "court_case") return listCourtCases(request, env, auth);
  const { table } = entityTable[entity];
  const sql = entity === "matter"
    ? `SELECT m.*, c.client_id AS linked_client_id, c.display_name AS linked_client_display_name, c.status AS linked_client_status
       FROM matters m LEFT JOIN matter_clients mc ON mc.tenant_id = m.tenant_id AND mc.matter_id = m.matter_id
       LEFT JOIN clients c ON c.tenant_id = mc.tenant_id AND c.client_id = mc.client_id
       WHERE m.tenant_id = ?1 AND m.deleted_at IS NULL ORDER BY m.created_at DESC, m.rowid DESC LIMIT 100`
    : `SELECT * FROM ${table} WHERE tenant_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 100`;
  const rows = await env.DB.prepare(sql)
    .bind(auth.tenant.id).all<Record<string, unknown>>();
  const items = rows.results.map((row) => mapRow(entity, row));
  return jsonResponse({ items }, 200);
}

function encodeCourtCaseCursor(cursor: z.infer<typeof CourtCaseCursorSchema>): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCourtCaseCursor(value: string): z.infer<typeof CourtCaseCursorSchema> | null {
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const parsed = CourtCaseCursorSchema.safeParse(JSON.parse(atob(padded)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function listCourtCases(request: Request, env: Bindings, auth: TenantSession): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const cursorValues = params.getAll("cursor");
  if (cursorValues.length > 1 || [...params.keys()].some((key) => key !== "cursor")) {
    return jsonResponse({ error: "invalid_query" }, 400);
  }
  const rawCursor = cursorValues[0];
  const cursor = rawCursor === undefined ? null : decodeCourtCaseCursor(rawCursor);
  if (rawCursor !== undefined && !cursor) return jsonResponse({ error: "invalid_cursor" }, 400);

  const limit = CourtCasePageSize + 1;
  const statement = cursor
    ? env.DB.prepare(`SELECT * FROM court_cases
        WHERE tenant_id = ?1 AND deleted_at IS NULL
          AND (created_at < ?2 OR (created_at = ?2 AND case_id < ?3))
        ORDER BY created_at DESC, case_id DESC LIMIT ?4`)
      .bind(auth.tenant.id, cursor.createdAt, cursor.caseId, limit)
    : env.DB.prepare(`SELECT * FROM court_cases
        WHERE tenant_id = ?1 AND deleted_at IS NULL
        ORDER BY created_at DESC, case_id DESC LIMIT ?2`)
      .bind(auth.tenant.id, limit);
  const rows = (await statement.all<Record<string, unknown>>()).results;
  const hasMore = rows.length > CourtCasePageSize;
  const page = rows.slice(0, CourtCasePageSize);
  const lastRow = page.at(-1);
  const nextCursor = hasMore && lastRow
    ? encodeCourtCaseCursor(CourtCaseCursorSchema.parse({ version: 1, createdAt: lastRow.created_at, caseId: lastRow.case_id }))
    : null;
  const response = CourtCaseListResponseSchema.parse({ items: page.map((row) => mapRow("court_case", row)), nextCursor });
  return jsonResponse(response, 200);
}

function mapRow(entity: DomainEntity, row: Record<string, unknown>): unknown {
  const base = { tenantId: row.tenant_id, createdAt: row.created_at, updatedAt: row.updated_at };
  switch (entity) {
    case "matter": return MatterSchema.parse({ ...base, id: row.matter_id, title: row.title, description: row.description,
      client: row.linked_client_id ? MatterClientSchema.parse({ id: row.linked_client_id, displayName: row.linked_client_display_name, status: row.linked_client_status }) : null,
      status: row.status });
    case "court_case": return CourtCaseSchema.parse({ ...base, id: row.case_id, matterId: row.matter_id, courtName: row.court_name, jurisdiction: row.jurisdiction, caseNumber: row.case_number, label: row.label, status: row.status });
    case "task": return TaskRecordSchema.parse({ ...base, id: row.task_id, matterId: row.matter_id, title: row.title, notes: row.notes, status: row.status, scheduledOn: row.scheduled_on });
    case "appointment": return AppointmentSchema.parse({ ...base, id: row.appointment_id, matterId: row.matter_id, caseId: row.case_id, title: row.title, startsAt: row.starts_at, endsAt: row.ends_at, timezone: row.timezone, location: row.location, notes: row.notes, status: row.status });
    case "financial_entry": return FinancialEntrySchema.parse({ ...base, id: row.entry_id, matterId: row.matter_id, caseId: row.case_id, kind: row.kind, description: row.description, amountCents: row.amount_cents, currency: row.currency, status: row.status, dueOn: row.due_on, occurredAt: row.occurred_at, timezone: row.timezone, category: row.category });
  }
}

async function insertWithAudit(
  env: Bindings, auth: TenantSession, entity: DomainEntity, itemId: string,
  insert: D1PreparedStatement, requestId: string,
): Promise<boolean> {
  const { table, idColumn } = entityTable[entity];
  const now = new Date().toISOString();
  const audit = env.DB.prepare(
    `INSERT INTO audit_events (tenant_id, event_id, actor_user_id, entity_type, entity_id, action, created_at, request_id, metadata)
     SELECT ?1, ?2, ?3, ?4, ?5, 'created', ?6, ?7, '{}' WHERE EXISTS
       (SELECT 1 FROM ${table} WHERE tenant_id = ?1 AND ${idColumn} = ?5)`,
  ).bind(auth.tenant.id, crypto.randomUUID(), auth.user.id, entity, itemId, now, requestId);
  const results = await env.DB.batch([insert, audit]);
  return (results[0]?.meta.changes ?? 0) === 1 && (results[1]?.meta.changes ?? 0) === 1;
}

async function createItem(request: Request, env: Bindings, auth: TenantSession, entity: DomainEntity): Promise<Response> {
  if (entity === "matter") return createMatter(request, env, auth);
  const parsedBody = await readJson(request);
  const schema = entity === "court_case" ? CourtCaseCreateSchema
    : entity === "task" ? TaskCreateSchema : entity === "appointment" ? AppointmentCreateSchema : FinancialEntryCreateSchema;
  const parsed = schema.safeParse(parsedBody);
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  const value = parsed.data;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const common = [auth.tenant.id, id];
  let insert: D1PreparedStatement;
  switch (entity) {
    case "court_case": {
      const item = value as z.infer<typeof CourtCaseCreateSchema>;
      insert = env.DB.prepare(`INSERT INTO court_cases (tenant_id, case_id, matter_id, court_name, jurisdiction, case_number, label, status, created_at, updated_at, created_by_user_id, updated_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, ?8, ?9, ?9)`)
        .bind(...common, item.matterId ?? null, item.courtName, item.jurisdiction ?? null, item.caseNumber ?? null, item.label ?? null, now, auth.user.id);
      break;
    }
    case "task": {
      const item = value as z.infer<typeof TaskCreateSchema>;
      if (item.matterId) {
        const activeMatter = await env.DB.prepare("SELECT matter_id FROM matters WHERE tenant_id = ?1 AND matter_id = ?2 AND status = 'active' AND deleted_at IS NULL")
          .bind(auth.tenant.id, item.matterId).first();
        if (!activeMatter) return jsonResponse({ error: "not_found" }, 404);
      }
      const taskSql = item.matterId
        ? `INSERT INTO tasks (tenant_id, task_id, matter_id, title, notes, status, scheduled_on, created_at, updated_at, created_by_user_id, updated_by_user_id)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9, ?9 WHERE EXISTS
             (SELECT 1 FROM matters WHERE tenant_id = ?1 AND matter_id = ?3 AND status = 'active' AND deleted_at IS NULL)`
        : `INSERT INTO tasks (tenant_id, task_id, matter_id, title, notes, status, scheduled_on, created_at, updated_at, created_by_user_id, updated_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9, ?9)`;
      insert = env.DB.prepare(taskSql)
        .bind(...common, item.matterId ?? null, item.title, item.notes ?? null, item.status ?? "todo", item.scheduledOn ?? null, now, auth.user.id);
      break;
    }
    case "appointment": {
      const item = value as z.infer<typeof AppointmentCreateSchema>;
      if (!validTimezone(item.timezone)) return jsonResponse({ error: "invalid_request", details: [{ path: "timezone", code: "invalid_timezone" }] }, 400);
      insert = env.DB.prepare(`INSERT INTO appointments (tenant_id, appointment_id, matter_id, case_id, title, starts_at, ends_at, timezone, location, notes, status, created_at, updated_at, created_by_user_id, updated_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'scheduled', ?11, ?11, ?12, ?12)`)
        .bind(...common, item.matterId ?? null, item.caseId ?? null, item.title, item.startsAt, item.endsAt, item.timezone, item.location ?? null, item.notes ?? null, now, auth.user.id);
      break;
    }
    case "financial_entry": {
      const item = value as z.infer<typeof FinancialEntryCreateSchema>;
      if (!validTimezone(item.timezone)) return jsonResponse({ error: "invalid_request", details: [{ path: "timezone", code: "invalid_timezone" }] }, 400);
      if (item.occurredAt && !item.timezone) return jsonResponse({ error: "invalid_request", details: [{ path: "timezone", code: "required_with_occurredAt" }] }, 400);
      insert = env.DB.prepare(`INSERT INTO financial_entries (tenant_id, entry_id, matter_id, case_id, kind, description, amount_cents, currency, status, due_on, occurred_at, timezone, category, created_at, updated_at, created_by_user_id, updated_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'BRL', 'planned', ?8, ?9, ?10, ?11, ?12, ?12, ?13, ?13)`)
        .bind(...common, item.matterId ?? null, item.caseId ?? null, item.kind, item.description, item.amountCents, item.dueOn ?? null, item.occurredAt ?? null, item.timezone ?? null, item.category ?? null, now, auth.user.id);
      break;
    }
  }
  try {
    const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID();
    if (!(await insertWithAudit(env, auth, entity, id, insert, requestId))) {
      if (entity === "task") {
        const item = value as z.infer<typeof TaskCreateSchema>;
        if (item.matterId) {
          const activeMatter = await env.DB.prepare("SELECT matter_id FROM matters WHERE tenant_id = ?1 AND matter_id = ?2 AND status = 'active' AND deleted_at IS NULL")
            .bind(auth.tenant.id, item.matterId).first();
          if (!activeMatter) return jsonResponse({ error: "not_found" }, 404);
        }
      }
      return jsonResponse({ error: "write_failed" }, 500);
    }
    const table = entityTable[entity].table;
    const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE tenant_id = ?1 AND ${entityTable[entity].idColumn} = ?2 AND deleted_at IS NULL`)
      .bind(auth.tenant.id, id).first<Record<string, unknown>>();
    if (!row) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ item: mapRow(entity, row) }, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes("FOREIGN KEY")) return jsonResponse({ error: "not_found" }, 404);
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

async function createMatter(request: Request, env: Bindings, auth: TenantSession): Promise<Response> {
  const parsed = MatterCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  if (parsed.data.clientId) {
    const activeClient = await env.DB.prepare("SELECT 1 FROM clients WHERE tenant_id = ?1 AND client_id = ?2 AND status = 'active'")
      .bind(auth.tenant.id, parsed.data.clientId).first();
    if (!activeClient) return jsonResponse({ error: "not_found" }, 404);
  }
  const insert = parsed.data.clientId
    ? env.DB.prepare(`INSERT INTO matters (tenant_id, matter_id, title, description, status, created_at, updated_at, created_by_user_id, updated_by_user_id)
       SELECT ?1, ?2, ?3, ?4, 'active', ?5, ?5, ?6, ?6 WHERE EXISTS (SELECT 1 FROM clients WHERE tenant_id = ?1 AND client_id = ?7 AND status = 'active')`)
      .bind(auth.tenant.id, id, parsed.data.title, parsed.data.description ?? null, now, auth.user.id, parsed.data.clientId)
    : env.DB.prepare("INSERT INTO matters (tenant_id, matter_id, title, description, status, created_at, updated_at, created_by_user_id, updated_by_user_id) VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5, ?6, ?6)")
      .bind(auth.tenant.id, id, parsed.data.title, parsed.data.description ?? null, now, auth.user.id);
  const statements: D1PreparedStatement[] = [insert];
  if (parsed.data.clientId) statements.push(env.DB.prepare("INSERT INTO matter_clients (tenant_id, matter_id, client_id, created_at) SELECT ?1, ?2, ?3, ?4 WHERE changes() = 1 AND EXISTS (SELECT 1 FROM clients WHERE tenant_id = ?1 AND client_id = ?3 AND status = 'active')")
    .bind(auth.tenant.id, id, parsed.data.clientId, now));
  statements.push(env.DB.prepare("INSERT INTO audit_events (tenant_id, event_id, actor_user_id, entity_type, entity_id, action, created_at, request_id, metadata) SELECT ?1, ?2, ?3, 'matter', ?4, 'created', ?5, ?6, '{}' WHERE changes() = 1 AND EXISTS (SELECT 1 FROM matters WHERE tenant_id = ?1 AND matter_id = ?4 AND created_at = ?5)")
    .bind(auth.tenant.id, crypto.randomUUID(), auth.user.id, id, now, request.headers.get("CF-Ray") ?? crypto.randomUUID()));
  try {
    const results = await env.DB.batch(statements);
    if ((results[0]?.meta.changes ?? 0) !== 1 || (parsed.data.clientId && (results[1]?.meta.changes ?? 0) !== 1) || (results.at(-1)?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
    const row = await env.DB.prepare(`SELECT m.*, c.client_id AS linked_client_id, c.display_name AS linked_client_display_name, c.status AS linked_client_status
      FROM matters m LEFT JOIN matter_clients mc ON mc.tenant_id = m.tenant_id AND mc.matter_id = m.matter_id
      LEFT JOIN clients c ON c.tenant_id = mc.tenant_id AND c.client_id = mc.client_id WHERE m.tenant_id = ?1 AND m.matter_id = ?2`)
      .bind(auth.tenant.id, id).first<Record<string, unknown>>();
    return row ? jsonResponse({ item: mapRow("matter", row) }, 201) : jsonResponse({ error: "write_failed" }, 500);
  } catch { return jsonResponse({ error: "write_failed" }, 500); }
}

async function changeStatus(request: Request, env: Bindings, auth: TenantSession, entity: DomainEntity, itemId: string, statusValue: string, expectedUpdatedAt: string): Promise<Response> {
  const config = entityTable[entity];
  if (!(config.statusValues as readonly string[]).includes(statusValue)) return jsonResponse({ error: "invalid_request", details: [{ path: "status", code: "invalid_value" }] }, 400);
  const fromStatuses = statusTransitions[entity][statusValue as keyof typeof statusTransitions[typeof entity]] as readonly string[] | undefined;
  if (!fromStatuses?.length) return jsonResponse({ error: "invalid_request", details: [{ path: "status", code: "unsupported_transition" }] }, 400);
  const now = new Date(Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1)).toISOString();
  const deletedAt = null;
  const fromStatusPlaceholders = fromStatuses.map((_, index) => `?${8 + index}`);
  const update = env.DB.prepare(`UPDATE ${config.table} SET status = ?1, updated_at = ?2, updated_by_user_id = ?3, deleted_at = ?4
    WHERE tenant_id = ?5 AND ${config.idColumn} = ?6 AND updated_at = ?7 AND deleted_at IS NULL AND status IN (${fromStatusPlaceholders.join(", ")})`)
    .bind(statusValue, now, auth.user.id, deletedAt, auth.tenant.id, itemId, expectedUpdatedAt, ...fromStatuses);
  const audit = env.DB.prepare(
    `INSERT INTO audit_events (tenant_id, event_id, actor_user_id, entity_type, entity_id, action, created_at, request_id, metadata)
     SELECT ?1, ?2, ?3, ?4, ?5, 'status_changed', ?6, ?7, ?9 WHERE changes() = 1 AND EXISTS
       (SELECT 1 FROM ${config.table} WHERE tenant_id = ?1 AND ${config.idColumn} = ?5 AND status = ?8 AND updated_at = ?6 AND updated_by_user_id = ?3)`,
  ).bind(auth.tenant.id, crypto.randomUUID(), auth.user.id, entity, itemId, now, request.headers.get("CF-Ray") ?? crypto.randomUUID(), statusValue, JSON.stringify({ status: statusValue }));
  try {
    const results = await env.DB.batch([update, audit]);
    const updateChanges = results[0]?.meta.changes ?? 0;
    const auditChanges = results[1]?.meta.changes ?? 0;
    if (updateChanges !== 1) {
      const current = await env.DB.prepare(`SELECT status FROM ${config.table} WHERE tenant_id = ?1 AND ${config.idColumn} = ?2 AND deleted_at IS NULL`)
        .bind(auth.tenant.id, itemId).first<{ status: string }>();
      return current ? jsonResponse({ error: "conflict" }, 409) : jsonResponse({ error: "not_found" }, 404);
    }
    if (auditChanges !== 1) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ status: statusValue }, 200);
  } catch {
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

async function updateFinancialEntry(request: Request, env: Bindings, auth: TenantSession, itemId: string): Promise<Response> {
  const parsed = FinancialEntryUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);

  const columns = ["kind", "description", "amountCents", "dueOn", "category"] as const;
  const columnNames = { kind: "kind", description: "description", amountCents: "amount_cents", dueOn: "due_on", category: "category" } as const;
  const updates: Array<{ column: string; value: string | number | null }> = [];
  for (const key of columns) {
    const value = parsed.data[key];
    if (value !== undefined) updates.push({ column: columnNames[key], value });
  }

  const now = new Date(Math.max(Date.now(), Date.parse(parsed.data.expectedUpdatedAt) + 1)).toISOString();
  const setValues = updates.map((update, index) => `${update.column} = ?${index + 1}`);
  const updatedAtIndex = updates.length + 1;
  const updatedByIndex = updates.length + 2;
  const tenantIndex = updates.length + 3;
  const itemIndex = updates.length + 4;
  const expectedIndex = updates.length + 5;
  const update = env.DB.prepare(
    `UPDATE financial_entries SET ${setValues.join(", ")}, updated_at = ?${updatedAtIndex}, updated_by_user_id = ?${updatedByIndex}
     WHERE tenant_id = ?${tenantIndex} AND entry_id = ?${itemIndex} AND updated_at = ?${expectedIndex} AND status = 'planned' AND deleted_at IS NULL`,
  ).bind(...updates.map((item) => item.value), now, auth.user.id, auth.tenant.id, itemId, parsed.data.expectedUpdatedAt);
  const changedFields = updates.map((item) => item.column);
  const audit = env.DB.prepare(
    `INSERT INTO audit_events (tenant_id, event_id, actor_user_id, entity_type, entity_id, action, created_at, request_id, metadata)
     SELECT ?1, ?2, ?3, 'financial_entry', ?4, 'updated', ?5, ?6, ?7 WHERE changes() = 1 AND EXISTS
       (SELECT 1 FROM financial_entries WHERE tenant_id = ?1 AND entry_id = ?4 AND updated_at = ?5 AND updated_by_user_id = ?3 AND deleted_at IS NULL)`,
  ).bind(auth.tenant.id, crypto.randomUUID(), auth.user.id, itemId, now, request.headers.get("CF-Ray") ?? crypto.randomUUID(), JSON.stringify({ fields: changedFields }));

  try {
    const results = await env.DB.batch([update, audit]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      const current = await env.DB.prepare("SELECT status FROM financial_entries WHERE tenant_id = ?1 AND entry_id = ?2 AND deleted_at IS NULL")
        .bind(auth.tenant.id, itemId).first<{ status: string }>();
      return current ? jsonResponse({ error: "conflict" }, 409) : jsonResponse({ error: "not_found" }, 404);
    }
    if ((results[1]?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
    const row = await env.DB.prepare("SELECT * FROM financial_entries WHERE tenant_id = ?1 AND entry_id = ?2 AND deleted_at IS NULL")
      .bind(auth.tenant.id, itemId).first<Record<string, unknown>>();
    if (!row) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ item: mapRow("financial_entry", row) }, 200);
  } catch {
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

async function updateMatterOrCourtCase(request: Request, env: Bindings, auth: TenantSession, entity: "court_case", itemId: string): Promise<Response> {
  const schema = CourtCaseUpdateSchema;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);

  const specs = [
      { key: "matterId", column: "matter_id" },
      { key: "courtName", column: "court_name" },
      { key: "jurisdiction", column: "jurisdiction" },
      { key: "caseNumber", column: "case_number" },
      { key: "label", column: "label" },
    ];
  const data = parsed.data as Record<string, unknown>;
  const updates: Array<{ column: string; value: string | null }> = [];
  for (const spec of specs) {
    const value = data[spec.key];
    if (value !== undefined) updates.push({ column: spec.column, value: value as string | null });
  }

  const config = entityTable[entity];
  const now = new Date(Math.max(Date.now(), Date.parse(data.expectedUpdatedAt as string) + 1)).toISOString();
  const setValues = updates.map((update, index) => `${update.column} = ?${index + 1}`);
  const updatedAtIndex = updates.length + 1;
  const updatedByIndex = updates.length + 2;
  const tenantIndex = updates.length + 3;
  const itemIndex = updates.length + 4;
  const expectedIndex = updates.length + 5;
  const update = env.DB.prepare(
    `UPDATE ${config.table} SET ${setValues.join(", ")}, updated_at = ?${updatedAtIndex}, updated_by_user_id = ?${updatedByIndex}
     WHERE tenant_id = ?${tenantIndex} AND ${config.idColumn} = ?${itemIndex} AND updated_at = ?${expectedIndex} AND status = 'active' AND deleted_at IS NULL`,
  ).bind(...updates.map((item) => item.value), now, auth.user.id, auth.tenant.id, itemId, data.expectedUpdatedAt as string);
  const audit = env.DB.prepare(
    `INSERT INTO audit_events (tenant_id, event_id, actor_user_id, entity_type, entity_id, action, created_at, request_id, metadata)
     SELECT ?1, ?2, ?3, ?4, ?5, 'updated', ?6, ?7, ?8 WHERE changes() = 1 AND EXISTS
       (SELECT 1 FROM ${config.table} WHERE tenant_id = ?1 AND ${config.idColumn} = ?5 AND updated_at = ?6 AND updated_by_user_id = ?3 AND deleted_at IS NULL)`,
  ).bind(auth.tenant.id, crypto.randomUUID(), auth.user.id, entity, itemId, now, request.headers.get("CF-Ray") ?? crypto.randomUUID(), JSON.stringify({ fields: updates.map((item) => item.column) }));

  try {
    const results = await env.DB.batch([update, audit]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      const current = await env.DB.prepare(`SELECT status FROM ${config.table} WHERE tenant_id = ?1 AND ${config.idColumn} = ?2 AND deleted_at IS NULL`)
        .bind(auth.tenant.id, itemId).first<{ status: string }>();
      return current ? jsonResponse({ error: "conflict" }, 409) : jsonResponse({ error: "not_found" }, 404);
    }
    if ((results[1]?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
    const row = await env.DB.prepare(`SELECT * FROM ${config.table} WHERE tenant_id = ?1 AND ${config.idColumn} = ?2 AND deleted_at IS NULL`)
      .bind(auth.tenant.id, itemId).first<Record<string, unknown>>();
    if (!row) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ item: mapRow(entity, row) }, 200);
  } catch (error) {
    if (error instanceof Error && error.message.includes("FOREIGN KEY")) return jsonResponse({ error: "not_found" }, 404);
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

async function updateMatter(request: Request, env: Bindings, auth: TenantSession, matterId: string): Promise<Response> {
  const parsed = MatterUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  if (parsed.data.clientId) {
    const activeClient = await env.DB.prepare("SELECT 1 FROM clients WHERE tenant_id = ?1 AND client_id = ?2 AND status = 'active'")
      .bind(auth.tenant.id, parsed.data.clientId).first();
    if (!activeClient) return jsonResponse({ error: "not_found" }, 404);
  }
  const now = new Date(Math.max(Date.now(), Date.parse(parsed.data.expectedUpdatedAt) + 1)).toISOString();
  const updateTitle = parsed.data.title !== undefined;
  const set = updateTitle ? "title = ?1, updated_at = ?2, updated_by_user_id = ?3" : "updated_at = ?1, updated_by_user_id = ?2";
  const tenantIndex = updateTitle ? 4 : 3;
  const matterIndex = tenantIndex + 1;
  const expectedIndex = matterIndex + 1;
  const activeGuard = parsed.data.clientId ? ` AND EXISTS (SELECT 1 FROM clients WHERE tenant_id = ?${expectedIndex + 1} AND client_id = ?${expectedIndex + 2} AND status = 'active')` : "";
  const update = env.DB.prepare(`UPDATE matters SET ${set} WHERE tenant_id = ?${tenantIndex} AND matter_id = ?${matterIndex} AND updated_at = ?${expectedIndex} AND status = 'active' AND deleted_at IS NULL${activeGuard}`)
    .bind(...(updateTitle ? [parsed.data.title!, now, auth.user.id] : [now, auth.user.id]), auth.tenant.id, matterId, parsed.data.expectedUpdatedAt, ...(parsed.data.clientId ? [auth.tenant.id, parsed.data.clientId] : []));
  const statements: D1PreparedStatement[] = [update];
  if (parsed.data.clientId !== undefined) {
    statements.push(parsed.data.clientId === null
      ? env.DB.prepare("DELETE FROM matter_clients WHERE tenant_id = ?1 AND matter_id = ?2 AND EXISTS (SELECT 1 FROM matters WHERE tenant_id = ?1 AND matter_id = ?2 AND updated_at = ?3)").bind(auth.tenant.id, matterId, now)
      : env.DB.prepare("INSERT INTO matter_clients (tenant_id, matter_id, client_id, created_at) SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM matters WHERE tenant_id = ?1 AND matter_id = ?2 AND updated_at = ?4) AND EXISTS (SELECT 1 FROM clients WHERE tenant_id = ?1 AND client_id = ?3 AND status = 'active') ON CONFLICT (tenant_id, matter_id) DO UPDATE SET client_id = excluded.client_id, created_at = excluded.created_at")
        .bind(auth.tenant.id, matterId, parsed.data.clientId, now));
  }
  const audit = env.DB.prepare("INSERT INTO audit_events (tenant_id, event_id, actor_user_id, entity_type, entity_id, action, created_at, request_id, metadata) SELECT ?1, ?2, ?3, 'matter', ?4, 'updated', ?5, ?6, ?7 WHERE EXISTS (SELECT 1 FROM matters WHERE tenant_id = ?1 AND matter_id = ?4 AND updated_at = ?5 AND updated_by_user_id = ?3)")
    .bind(auth.tenant.id, crypto.randomUUID(), auth.user.id, matterId, now, request.headers.get("CF-Ray") ?? crypto.randomUUID(), JSON.stringify({ fields: [...(updateTitle ? ["title"] : []), ...(parsed.data.clientId !== undefined ? ["clientId"] : [])] }));
  statements.push(audit);
  try {
    const results = await env.DB.batch(statements);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      const current = await env.DB.prepare("SELECT 1 FROM matters WHERE tenant_id = ?1 AND matter_id = ?2 AND deleted_at IS NULL").bind(auth.tenant.id, matterId).first();
      return current ? jsonResponse({ error: "conflict" }, 409) : jsonResponse({ error: "not_found" }, 404);
    }
    if ((results.at(-1)?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
    const row = await env.DB.prepare(`SELECT m.*, c.client_id AS linked_client_id, c.display_name AS linked_client_display_name, c.status AS linked_client_status
      FROM matters m LEFT JOIN matter_clients mc ON mc.tenant_id = m.tenant_id AND mc.matter_id = m.matter_id
      LEFT JOIN clients c ON c.tenant_id = mc.tenant_id AND c.client_id = mc.client_id WHERE m.tenant_id = ?1 AND m.matter_id = ?2 AND m.deleted_at IS NULL`)
      .bind(auth.tenant.id, matterId).first<Record<string, unknown>>();
    return row ? jsonResponse({ item: mapRow("matter", row) }, 200) : jsonResponse({ error: "write_failed" }, 500);
  } catch { return jsonResponse({ error: "write_failed" }, 500); }
}

async function updateTask(request: Request, env: Bindings, auth: TenantSession, itemId: string): Promise<Response> {
  const parsed = TaskUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  if (parsed.data.matterId) {
    const targetMatter = await env.DB.prepare("SELECT status FROM matters WHERE tenant_id = ?1 AND matter_id = ?2 AND deleted_at IS NULL")
      .bind(auth.tenant.id, parsed.data.matterId).first<{ status: string }>();
    if (!targetMatter) return jsonResponse({ error: "not_found" }, 404);
    if (targetMatter.status !== "active") {
      const currentTask = await env.DB.prepare("SELECT matter_id FROM tasks WHERE tenant_id = ?1 AND task_id = ?2 AND deleted_at IS NULL")
        .bind(auth.tenant.id, itemId).first<{ matter_id: string | null }>();
      if (currentTask?.matter_id !== parsed.data.matterId) return jsonResponse({ error: "invalid_request", details: [{ path: "matterId", code: "matter_not_active" }] }, 400);
    }
  }
  const updates: Array<{ column: string; value: string | null }> = [];
  if (parsed.data.title !== undefined) updates.push({ column: "title", value: parsed.data.title });
  if (parsed.data.matterId !== undefined) updates.push({ column: "matter_id", value: parsed.data.matterId });
  if (parsed.data.scheduledOn !== undefined) updates.push({ column: "scheduled_on", value: parsed.data.scheduledOn });
  const now = new Date(Math.max(Date.now(), Date.parse(parsed.data.expectedUpdatedAt) + 1)).toISOString();
  const setValues = updates.map((update, index) => `${update.column} = ?${index + 1}`);
  const updatedAtIndex = updates.length + 1;
  const updatedByIndex = updates.length + 2;
  const tenantIndex = updates.length + 3;
  const itemIndex = updates.length + 4;
  const expectedIndex = updates.length + 5;
  const targetMatterIndex = updates.length + 6;
  const update = env.DB.prepare(
    `UPDATE tasks SET ${setValues.join(", ")}, updated_at = ?${updatedAtIndex}, updated_by_user_id = ?${updatedByIndex}
     WHERE tenant_id = ?${tenantIndex} AND task_id = ?${itemIndex} AND updated_at = ?${expectedIndex}
       AND status IN ('todo', 'in_progress') AND deleted_at IS NULL
       AND (?${targetMatterIndex} IS NULL OR EXISTS (
         SELECT 1 FROM matters WHERE tenant_id = ?${tenantIndex} AND matter_id = ?${targetMatterIndex} AND status = 'active' AND deleted_at IS NULL
       ) OR matter_id = ?${targetMatterIndex})`,
  ).bind(...updates.map((item) => item.value), now, auth.user.id, auth.tenant.id, itemId, parsed.data.expectedUpdatedAt, parsed.data.matterId ?? null);
  const fields = JSON.stringify({ fields: updates.map((item) => item.column) });
  const audit = env.DB.prepare(
    `INSERT INTO audit_events (tenant_id, event_id, actor_user_id, entity_type, entity_id, action, created_at, request_id, metadata)
     SELECT ?1, ?2, ?3, 'task', ?4, 'updated', ?5, ?6, ?7 WHERE changes() = 1 AND EXISTS
       (SELECT 1 FROM tasks WHERE tenant_id = ?1 AND task_id = ?4 AND updated_at = ?5 AND updated_by_user_id = ?3 AND deleted_at IS NULL)`,
  ).bind(auth.tenant.id, crypto.randomUUID(), auth.user.id, itemId, now, request.headers.get("CF-Ray") ?? crypto.randomUUID(), fields);

  try {
    const results = await env.DB.batch([update, audit]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      const current = await env.DB.prepare("SELECT status FROM tasks WHERE tenant_id = ?1 AND task_id = ?2 AND deleted_at IS NULL")
        .bind(auth.tenant.id, itemId).first<{ status: string }>();
      return current ? jsonResponse({ error: "conflict" }, 409) : jsonResponse({ error: "not_found" }, 404);
    }
    if ((results[1]?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
    const row = await env.DB.prepare("SELECT * FROM tasks WHERE tenant_id = ?1 AND task_id = ?2 AND deleted_at IS NULL")
      .bind(auth.tenant.id, itemId).first<Record<string, unknown>>();
    if (!row) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ item: mapRow("task", row) }, 200);
  } catch (error) {
    if (error instanceof Error && error.message.includes("FOREIGN KEY")) return jsonResponse({ error: "not_found" }, 404);
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

async function updateAppointment(request: Request, env: Bindings, auth: TenantSession, itemId: string): Promise<Response> {
  const parsed = AppointmentUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  const current = await env.DB.prepare("SELECT * FROM appointments WHERE tenant_id = ?1 AND appointment_id = ?2 AND deleted_at IS NULL")
    .bind(auth.tenant.id, itemId).first<Record<string, unknown>>();
  if (!current) return jsonResponse({ error: "not_found" }, 404);
  if (current.status !== "scheduled" || current.updated_at !== parsed.data.expectedUpdatedAt) return jsonResponse({ error: "conflict" }, 409);
  const timezone = String(current.timezone);
  if (!validTimezone(timezone)) return jsonResponse({ error: "write_failed" }, 500);
  const merged = AppointmentCreateSchema.safeParse({
    matterId: current.matter_id, caseId: current.case_id, title: parsed.data.title ?? current.title,
    startsAt: parsed.data.startsAt ?? current.starts_at, endsAt: parsed.data.endsAt ?? current.ends_at,
    timezone, location: parsed.data.location === undefined ? current.location : parsed.data.location,
    notes: current.notes,
  });
  if (!merged.success) return jsonResponse({ error: "invalid_request", details: merged.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);

  const specs = [
    { key: "title", column: "title" },
    { key: "startsAt", column: "starts_at" },
    { key: "endsAt", column: "ends_at" },
    { key: "location", column: "location" },
  ] as const;
  const updates: Array<{ column: string; value: string | null }> = [];
  for (const spec of specs) {
    const value = parsed.data[spec.key];
    if (value !== undefined) updates.push({ column: spec.column, value });
  }
  const now = new Date(Math.max(Date.now(), Date.parse(parsed.data.expectedUpdatedAt) + 1)).toISOString();
  const setValues = updates.map((update, index) => `${update.column} = ?${index + 1}`);
  const updatedAtIndex = updates.length + 1;
  const updatedByIndex = updates.length + 2;
  const tenantIndex = updates.length + 3;
  const itemIndex = updates.length + 4;
  const expectedIndex = updates.length + 5;
  const update = env.DB.prepare(
    `UPDATE appointments SET ${setValues.join(", ")}, updated_at = ?${updatedAtIndex}, updated_by_user_id = ?${updatedByIndex}
     WHERE tenant_id = ?${tenantIndex} AND appointment_id = ?${itemIndex} AND updated_at = ?${expectedIndex} AND status = 'scheduled' AND deleted_at IS NULL`,
  ).bind(...updates.map((item) => item.value), now, auth.user.id, auth.tenant.id, itemId, parsed.data.expectedUpdatedAt);
  const audit = env.DB.prepare(
    `INSERT INTO audit_events (tenant_id, event_id, actor_user_id, entity_type, entity_id, action, created_at, request_id, metadata)
     SELECT ?1, ?2, ?3, 'appointment', ?4, 'updated', ?5, ?6, ?7 WHERE changes() = 1 AND EXISTS
       (SELECT 1 FROM appointments WHERE tenant_id = ?1 AND appointment_id = ?4 AND updated_at = ?5 AND updated_by_user_id = ?3 AND deleted_at IS NULL)`,
  ).bind(auth.tenant.id, crypto.randomUUID(), auth.user.id, itemId, now, request.headers.get("CF-Ray") ?? crypto.randomUUID(), JSON.stringify({ fields: updates.map((item) => item.column) }));

  try {
    const results = await env.DB.batch([update, audit]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      const stillExists = await env.DB.prepare("SELECT appointment_id FROM appointments WHERE tenant_id = ?1 AND appointment_id = ?2 AND deleted_at IS NULL")
        .bind(auth.tenant.id, itemId).first();
      return stillExists ? jsonResponse({ error: "conflict" }, 409) : jsonResponse({ error: "not_found" }, 404);
    }
    if ((results[1]?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
    const row = await env.DB.prepare("SELECT * FROM appointments WHERE tenant_id = ?1 AND appointment_id = ?2 AND deleted_at IS NULL")
      .bind(auth.tenant.id, itemId).first<Record<string, unknown>>();
    if (!row) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ item: mapRow("appointment", row) }, 200);
  } catch (error) {
    if (error instanceof Error && error.message.includes("FOREIGN KEY")) return jsonResponse({ error: "not_found" }, 404);
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

function createAuth(env: Bindings, allowSignup = false, executionContext?: ExecutionContext) {
  const e2eResetFixtureEnabled = isLoopbackE2eAuthFixture(env, new URL(env.AUTH_BASE_URL));
  const resetEmailConfigured = env.PASSWORD_RESET_ENABLED === "true"
    && Boolean(env.AUTH_EMAIL_FROM?.trim())
    && (Boolean(env.EMAIL) || e2eResetFixtureEnabled);
  return betterAuth({
    appName: "Marcia Escritório",
    baseURL: env.AUTH_BASE_URL,
    secret: env.AUTH_SECRET,
    database: env.DB,
    trustedOrigins: origins(env),
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 900, max: 3 },
        "/reset-password": { window: 900, max: 5 },
        "/reset-password/*": { window: 900, max: 5 },
        "/two-factor/enable": { window: 60, max: 5 },
        "/two-factor/verify-totp": { window: 60, max: 10 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
        "/two-factor/generate-backup-codes": { window: 60, max: 5 },
        "/two-factor/disable": { window: 60, max: 5 },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowSignup,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      ...(resetEmailConfigured ? {
        revokeSessionsOnPasswordReset: true,
        resetPasswordTokenExpiresIn: 60 * 60,
        sendResetPassword: async ({ url, token, user }) => {
          if (e2eResetFixtureEnabled) {
            pendingE2ePasswordReset = { url, token, expiresAt: Date.now() + 5 * 60 * 1000 };
            return;
          }
          await env.EMAIL!.send({
            to: user.email,
            from: env.AUTH_EMAIL_FROM!.trim(),
            subject: "Redefinir senha · Márcia Escritório",
            text: `Recebemos uma solicitação para redefinir a senha da sua conta.\n\nAbra este link para escolher uma nova senha (válido por até uma hora):\n${url}\n\nSe você não solicitou a troca, ignore esta mensagem. Não encaminhe este link.`,
          });
        },
      } : {}),
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60 * 3,
      freshAge: 60 * 15,
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["CF-Connecting-IP"] },
      useSecureCookies: env.AUTH_BASE_URL.startsWith("https://"),
      ...(executionContext ? { backgroundTasks: { handler: (promise: Promise<unknown>) => executionContext.waitUntil(promise) } } : {}),
    },
    plugins: [
      expo(),
      twoFactor({
        issuer: "Márcia Escritório",
        trustDeviceMaxAge: 0,
        accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
        backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
      }),
    ],
  });
}

type ApiRateLimitPolicy = (typeof apiRateLimitPolicies)[keyof typeof apiRateLimitPolicies];

async function mutationRateLimitResponse(
  env: Bindings,
  dimensions: readonly string[],
  policy: ApiRateLimitPolicy,
): Promise<Response | null> {
  try {
    const result = await consumeD1RateLimit(env.DB, env.AUTH_SECRET, dimensions, policy);
    if (result.allowed) return null;
    return jsonResponse(
      { error: "rate_limited", retryAfterSeconds: result.retryAfterSeconds },
      429,
      { "Retry-After": String(result.retryAfterSeconds) },
    );
  } catch {
    return jsonResponse({ error: "rate_limit_unavailable" }, 503, { "Retry-After": "5" });
  }
}

async function passwordResetAddressRateLimitResponse(request: Request, env: Bindings): Promise<Response | null> {
  let payload: unknown;
  try {
    payload = await request.clone().json();
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || !("email" in payload) || typeof payload.email !== "string") return null;
  const email = payload.email.trim().toLowerCase();
  if (!email || email.length > 320 || !email.includes("@")) return null;
  try {
    const result = await consumeD1RateLimit(
      env.DB,
      env.AUTH_SECRET,
      ["password-reset-email", email],
      { maxRequests: 3, windowSeconds: 60 * 60 },
    );
    if (result.allowed) return null;
    return jsonResponse(
      { error: "rate_limited", retryAfterSeconds: result.retryAfterSeconds },
      429,
      { "Retry-After": String(result.retryAfterSeconds) },
    );
  } catch {
    return jsonResponse({ error: "rate_limit_unavailable" }, 503, { "Retry-After": "5" });
  }
}

function mutationRateLimitScopes(pathname: string, method: string): Array<{ scope: string; policy: ApiRateLimitPolicy }> {
  const scopes: Array<{ scope: string; policy: ApiRateLimitPolicy }> = [
    { scope: "authenticated-write", policy: apiRateLimitPolicies.authenticatedWrites },
  ];
  if (method === "POST" && pathname === "/api/data-export") {
    scopes.push({ scope: "data-export", policy: apiRateLimitPolicies.dataExports });
  }
  if (method === "POST" && (pathname === "/api/documents"
    || /^\/api\/integrations\/(google-drive|microsoft-graph)\/import$/.test(pathname))) {
    scopes.push({ scope: "document-import", policy: apiRateLimitPolicies.documentImports });
  }
  if (method === "POST" && (pathname === "/api/court-cases/discover-djen"
    || /^\/api\/court-cases\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/publications\/sync$/.test(pathname))) {
    scopes.push({ scope: "court-sync", policy: apiRateLimitPolicies.courtSync });
  }
  return scopes;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

async function readSetupPayload(request: Request) {
  try {
    if (!request.body) return null;
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bodyBytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bodyBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = new TextDecoder().decode(bodyBytes);
    return setupPayloadSchema.parse(JSON.parse(body));
  } catch {
    return null;
  }
}

async function claimSetup(db: D1Database, email: string, claimId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const lease = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const result = await db.prepare(
    `UPDATE setup_control
       SET status = 'pending', candidate_email = COALESCE(candidate_email, ?1),
           claim_id = ?2, lease_expires_at = ?3
     WHERE id = 1 AND status != 'complete'
       AND (claim_id IS NULL OR lease_expires_at < ?4)
       AND (candidate_email IS NULL OR candidate_email = ?1)`,
  ).bind(email, claimId, lease, now).run();
  return (result.meta.changes ?? 0) === 1;
}

async function completeSetup(db: D1Database, userId: string, claimId: string): Promise<boolean> {
  const tenantId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(
      `INSERT INTO organizations (tenant_id)
       SELECT ?1 WHERE EXISTS (
         SELECT 1 FROM setup_control WHERE id = 1 AND status = 'pending' AND claim_id = ?2
       )`,
    ).bind(tenantId, claimId),
    db.prepare(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role)
       SELECT ?1, ?2, 'owner' WHERE EXISTS (
         SELECT 1 FROM setup_control WHERE id = 1 AND status = 'pending' AND claim_id = ?3
       )`,
    ).bind(tenantId, userId, claimId),
    db.prepare(
      `UPDATE setup_control SET status = 'complete', candidate_email = NULL, claim_id = NULL, lease_expires_at = NULL,
         completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = 1 AND status = 'pending' AND claim_id = ?1`,
    ).bind(claimId),
  ]);
  return (results[0]?.meta.changes ?? 0) === 1
    && (results[1]?.meta.changes ?? 0) === 1
    && (results[2]?.meta.changes ?? 0) === 1;
}

async function setupOwner(request: Request, env: Bindings): Promise<Response> {
  const headers = corsHeaders(request, env);
  if (request.method !== "POST") {
    headers.set("Allow", "POST, OPTIONS");
    return jsonResponse({ error: "method_not_allowed" }, 405, headers);
  }
  const sourceIp = request.headers.get("CF-Connecting-IP")?.trim().slice(0, 128) || "unknown-source";
  const setupRateLimit = await mutationRateLimitResponse(
    env,
    ["setup-owner", sourceIp],
    apiRateLimitPolicies.setupOwner,
  );
  if (setupRateLimit) return secureApiResponse(setupRateLimit, headers);
  const payload = await readSetupPayload(request);
  const configuredToken = env.SETUP_OWNER_TOKEN;
  if (!payload || !configuredToken || configuredToken.length < 32
    || !constantTimeEqual(await sha256(payload.setupToken), await sha256(configuredToken))) {
    return jsonResponse({ error: "invalid_setup_request" }, 400, headers);
  }

  const claimId = crypto.randomUUID();
  let claimed = false;
  try {
    claimed = await claimSetup(env.DB, payload.email, claimId);
    if (!claimed) return jsonResponse({ error: "setup_unavailable" }, 409, headers);

    const setupAuth = createAuth(env, true);
    const origin = request.headers.get("Origin") ?? env.WEB_ORIGIN;
    const userExists = await env.DB.prepare("SELECT id FROM user WHERE email = ?1 LIMIT 1")
      .bind(payload.email).first<{ id: string }>();
    const authPath = userExists ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email";
    const authBody = userExists
      ? { email: payload.email, password: payload.password }
      : { name: payload.name, email: payload.email, password: payload.password };
    const authResponse = await setupAuth.handler(new Request(`${env.AUTH_BASE_URL}${authPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "CF-Connecting-IP": request.headers.get("CF-Connecting-IP") ?? "",
        "User-Agent": request.headers.get("User-Agent") ?? "",
      },
      body: JSON.stringify(authBody),
    }));
    if (!authResponse.ok) {
      await env.DB.prepare("UPDATE setup_control SET claim_id = NULL, lease_expires_at = NULL WHERE id = 1 AND claim_id = ?1")
        .bind(claimId).run();
      return jsonResponse({ error: "owner_creation_failed" }, authResponse.status === 409 ? 409 : 400, headers);
    }

    const authResult = await authResponse.clone().json() as { user?: { id?: string } };
    const userId = authResult.user?.id;
    if (!userId || !(await completeSetup(env.DB, userId, claimId))) {
      return jsonResponse({ error: "setup_completion_failed_retry_same_email" }, 503, headers);
    }

    return secureApiResponse(authResponse, headers);
  } catch {
    if (claimed) {
      await env.DB.prepare("UPDATE setup_control SET claim_id = NULL, lease_expires_at = NULL WHERE id = 1 AND claim_id = ?1")
        .bind(claimId).run().catch(() => undefined);
    }
    return jsonResponse({ error: "setup_unavailable_retry_same_email" }, 503, headers);
  }
}

const responseHeadersForHealth = {
  ...responseHeaders,
};

export default {
  async fetch(request: Request, env: Bindings, executionContext: ExecutionContext): Promise<Response> {
    try {
    const requestUrl = new URL(request.url);
    const { pathname } = requestUrl;
    if (pathname === "/health") {
      const headOnly = request.method === "HEAD";
      if (request.method !== "GET" && !headOnly) {
        const response = jsonResponse({ error: "method_not_allowed" }, 405);
        response.headers.set("Allow", "GET, HEAD");
        return response;
      }
      return secureApiResponse(new Response(headOnly ? null : JSON.stringify({
        status: "ok", service: "marcia-api", stage: "auth-mvp", productionReady: false,
        maintenanceMode: serviceMaintenanceEnabled(env), database: "not_checked",
      }), { status: 200, headers: responseHeadersForHealth }), corsHeaders(request, env));
    }

    // Pause all API and local fixture routes before authentication, D1 or R2 access.
    // /health remains a liveness-only endpoint and does not query D1.
    if (serviceMaintenanceEnabled(env) && (pathname.startsWith("/api/") || pathname.startsWith("/__e2e/"))) {
      return serviceMaintenanceResponse(request, env);
    }

    if (pathname === "/__e2e/auth/reset-email" || pathname === "/__e2e/auth/expire-reset-email") {
      if (!isLoopbackE2eAuthFixture(env, requestUrl)
        || request.headers.get("X-Ma-E2E-Control") !== env.MARCIA_E2E_AUTH_CONTROL_SECRET) {
        return jsonResponse({ error: "not_found" }, 404);
      }
      if (pathname === "/__e2e/auth/expire-reset-email") {
        if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "POST" });
        if (!pendingE2ePasswordReset || pendingE2ePasswordReset.expiresAt <= Date.now()) {
          pendingE2ePasswordReset = undefined;
          return jsonResponse({ error: "not_ready" }, 425, { "Retry-After": "1" });
        }
        try {
          const expiredAt = new Date(Date.now() - 1_000).toISOString();
          const result = await env.DB.prepare("UPDATE verification SET expiresAt = ?1 WHERE identifier = ?2")
            .bind(expiredAt, `reset-password:${pendingE2ePasswordReset.token}`).run();
          if (result.meta.changes !== 1) return jsonResponse({ error: "fixture_not_found" }, 404);
          return jsonResponse({ expired: true }, 200);
        } catch {
          return jsonResponse({ error: "fixture_unavailable" }, 503);
        }
      }
      if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET" });
      if (!pendingE2ePasswordReset || pendingE2ePasswordReset.expiresAt <= Date.now()) {
        pendingE2ePasswordReset = undefined;
        return jsonResponse({ error: "not_ready" }, 425, { "Retry-After": "1" });
      }
      const { url } = pendingE2ePasswordReset;
      pendingE2ePasswordReset = undefined;
      return jsonResponse({ url }, 200);
    }

    if (pathname === "/api/setup/owner" || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/")) {
      const cors = corsHeaders(request, env);
      const origin = request.headers.get("Origin");
      if (origin && !origins(env).includes(origin)) return jsonResponse({ error: "origin_not_allowed" }, 403);
      if (request.method === "OPTIONS") {
        if (!origin) return jsonResponse({ error: "origin_required" }, 400);
        return new Response(null, { status: 204, headers: cors });
      }
      const isMutation = request.method === "POST" || request.method === "PUT" || request.method === "PATCH" || request.method === "DELETE";
      const isTrustedOrigin = Boolean(origin && origins(env).includes(origin));
      if (pathname.startsWith("/api/") && isMutation && request.headers.get("Sec-Fetch-Site") === "cross-site" && !isTrustedOrigin) {
        return jsonResponse({ error: "cross_site_request_blocked" }, 403, cors);
      }
      if (pathname === "/api/auth/request-password-reset" && request.method === "POST"
        && env.PASSWORD_RESET_ENABLED === "true" && (env.EMAIL || isLoopbackE2eAuthFixture(env, requestUrl)) && env.AUTH_EMAIL_FROM?.trim()) {
        const limited = await passwordResetAddressRateLimitResponse(request, env);
        if (limited) return secureApiResponse(limited, cors);
      }
      if (pathname.startsWith("/api/") && isMutation
        && pathname !== "/api/setup/owner" && !pathname.startsWith("/api/auth/")) {
        const auth = await tenantSession(request, env);
        if (auth) {
          for (const { scope, policy } of mutationRateLimitScopes(pathname, request.method)) {
            const limited = await mutationRateLimitResponse(
              env,
              ["tenant", auth.tenant.id, "user", auth.user.id, scope],
              policy,
            );
            if (limited) return secureApiResponse(limited, cors);
          }
        }
      }
      if (pathname === "/api/setup/owner") return setupOwner(request, env);
      if (pathname.startsWith("/api/auth/")) {
        const response = await createAuth(env, false, executionContext).handler(request);
        return secureApiResponse(response, cors);
      }
      if (pathname === "/api/session") {
        if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, OPTIONS" });
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        return jsonResponse(SessionResponseSchema.parse({ user: auth.user, tenant: auth.tenant }), 200, cors);
      }
      if (pathname === "/api/data-export") {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        const result = await createOfficeDataExport(request, await readJson(request), env.DB, auth);
        if (!result.ok) {
          const headers = result.error === "method_not_allowed" ? { Allow: "POST, OPTIONS" } : undefined;
          return secureApiResponse(jsonResponse({ error: result.error }, result.status, headers), cors);
        }
        return secureApiResponse(result.response, cors);
      }
      if (pathname === "/api/onboarding/office-tour-v1") {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        if (request.method === "GET") return secureApiResponse(await readGuidedTourProgress(env, auth), cors);
        if (request.method === "PUT") return secureApiResponse(await saveGuidedTourProgress(request, env, auth), cors);
        return secureApiResponse(jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, PUT, OPTIONS" }), cors);
      }
      if (pathname === "/api/onboarding/office-screens-v1") {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        if (request.method === "GET") return secureApiResponse(await readGuidedTourScreenProgress(env, auth), cors);
        if (request.method === "POST") return secureApiResponse(await markGuidedTourScreenSeen(request, env, auth), cors);
        return secureApiResponse(jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, POST, OPTIONS" }), cors);
      }
      const documentSegments = pathname.split("/").filter(Boolean);
      if (documentSegments[0] === "api" && documentSegments[1] === "documents") {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        return secureApiResponse(await handleDocuments(request, env, auth, documentSegments.slice(2)), cors);
      }
      if (pathname === "/api/integrations") {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        if (auth.tenant.role !== "owner") return jsonResponse({ error: "forbidden" }, 403, cors);
        if (request.method === "GET") return secureApiResponse(await readIntegrationSettings(env, auth), cors);
        return secureApiResponse(jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, OPTIONS" }), cors);
      }
      const integrationSegments = pathname.split("/").filter(Boolean);
      if (integrationSegments[0] === "api" && integrationSegments[1] === "integrations" && integrationSegments.length >= 3) {
        const provider: IntegrationProvider | null = integrationSegments[2] === "google-drive"
          ? "google_drive" : integrationSegments[2] === "microsoft-graph" ? "microsoft_graph" : null;
        if (!provider) return jsonResponse({ error: "not_found" }, 404, cors);
        if (integrationSegments.length === 4 && integrationSegments[3] === "callback" && request.method === "GET") {
          return completeIntegrationAuthorization(request, env, provider);
        }
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        if (auth.tenant.role !== "owner") return jsonResponse({ error: "forbidden" }, 403, cors);
        if (integrationSegments.length === 4 && integrationSegments[3] === "picker-session" && provider === "google_drive" && request.method === "GET") {
          return secureApiResponse(await googlePickerSession(request, env, auth), cors);
        }
        if (integrationSegments.length === 4 && integrationSegments[3] === "files" && provider === "microsoft_graph" && request.method === "GET") {
          return secureApiResponse(await listMicrosoftDriveFiles(request, env, auth), cors);
        }
        if (integrationSegments.length === 4 && integrationSegments[3] === "import" && request.method === "POST") {
          return secureApiResponse(await importCloudDriveFile(request, env, auth, provider), cors);
        }
        if (integrationSegments.length === 3 && request.method === "PATCH") return secureApiResponse(await saveIntegrationSettings(request, env, auth, provider), cors);
        if (integrationSegments.length === 4 && integrationSegments[3] === "clear" && request.method === "POST") return secureApiResponse(await clearIntegrationSettings(request, env, auth, provider), cors);
        if (integrationSegments.length === 4 && integrationSegments[3] === "connect" && request.method === "POST") return secureApiResponse(await startIntegrationAuthorization(request, env, auth, provider), cors);
        if (integrationSegments.length === 4 && integrationSegments[3] === "disconnect" && request.method === "POST") return secureApiResponse(await disconnectIntegration(request, env, auth, provider), cors);
        return secureApiResponse(jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, PATCH, POST, OPTIONS" }), cors);
      }
      if (pathname === "/api/court-cases/discover-djen") {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        if (auth.tenant.role !== "owner") return jsonResponse({ error: "forbidden" }, 403, cors);
        if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { ...Object.fromEntries(cors.entries()), Allow: "POST, OPTIONS" });
        return secureApiResponse(await searchDjenCasesByOab(request, env, auth), cors);
      }
      const caseNoteSegments = pathname.split("/").filter(Boolean);
      if (caseNoteSegments[0] === "api" && caseNoteSegments[1] === "court-cases" && caseNoteSegments[3] === "notes") {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        const caseId = caseNoteSegments[2] ?? "";
        if (caseNoteSegments.length !== 4 || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(caseId)) {
          return jsonResponse({ error: "not_found" }, 404, cors);
        }
        return secureApiResponse(await courtCaseNotes(request, env, auth, caseId), cors);
      }
      const publicationSegments = pathname.split("/").filter(Boolean);
      if (publicationSegments[0] === "api" && publicationSegments[1] === "court-cases" && publicationSegments[3] === "publications") {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        const caseId = publicationSegments[2] ?? "";
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(caseId)) return jsonResponse({ error: "not_found" }, 404, cors);
        if (publicationSegments.length === 4 && request.method === "GET") {
          return secureApiResponse(await readCourtPublications(env, auth, caseId), cors);
        }
        if (publicationSegments.length === 5 && publicationSegments[4] === "sync" && request.method === "POST") {
          if (auth.tenant.role !== "owner") return jsonResponse({ error: "forbidden" }, 403, cors);
          return secureApiResponse(await syncCourtPublications(request, env, auth, caseId), cors);
        }
        if (publicationSegments.length === 6 && publicationSegments[5] === "review" && request.method === "POST"
          && /^[A-Za-z0-9_-]{12,128}$/.test(publicationSegments[4] ?? "")) {
          return secureApiResponse(await updateCourtPublicationReview(request, env, auth, caseId, publicationSegments[4]!), cors);
        }
        return secureApiResponse(jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, POST, OPTIONS" }), cors);
      }
      const legalResearchSegments = pathname.split("/").filter(Boolean);
      if (legalResearchSegments[0] === "api" && legalResearchSegments[1] === "legal-researches") {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        if (legalResearchSegments.length === 2) return secureApiResponse(await legalResearches(request, env, auth), cors);
        const researchId = legalResearchSegments[2] ?? "";
        if (legalResearchSegments.length >= 3 && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(researchId)) return jsonResponse({ error: "not_found" }, 404, cors);
        if (legalResearchSegments.length === 3 && request.method === "PATCH") return secureApiResponse(await updateLegalResearch(request, env, auth, researchId), cors);
        if (legalResearchSegments.length === 4 && legalResearchSegments[3] === "status" && request.method === "POST") {
          return secureApiResponse(await changeLegalResearchStatus(request, env, auth, researchId), cors);
        }
        return secureApiResponse(jsonResponse({ error: "method_not_allowed" }, 405, { Allow: legalResearchSegments.length === 3 ? "PATCH, OPTIONS" : "POST, OPTIONS" }), cors);
      }
      const socialDraftSegments = pathname.split("/").filter(Boolean);
      if (socialDraftSegments[0] === "api" && socialDraftSegments[1] === "social-drafts") {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        if (socialDraftSegments.length === 2) return secureApiResponse(await socialContentDrafts(request, env, auth), cors);
        const draftId = socialDraftSegments[2] ?? "";
        if (socialDraftSegments.length !== 3 || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(draftId)) return jsonResponse({ error: "not_found" }, 404, cors);
        return secureApiResponse(await socialContentDrafts(request, env, auth, draftId), cors);
      }
      if (pathname === "/api/clients") {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        return secureApiResponse(await clients(request, env, auth), cors);
      }
      const clientSegments = pathname.split("/").filter(Boolean);
      if (clientSegments[0] === "api" && clientSegments[1] === "clients" && clientSegments.length >= 3) {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        const clientId = clientSegments[2]!;
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(clientId)) return jsonResponse({ error: "not_found" }, 404, cors);
        if (clientSegments.length === 3 && request.method === "PATCH") return secureApiResponse(await updateClient(request, env, auth, clientId), cors);
        if (clientSegments.length === 4 && clientSegments[3] === "status" && request.method === "POST") return secureApiResponse(await changeClientStatus(request, env, auth, clientId), cors);
        return secureApiResponse(jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "PATCH, POST, OPTIONS" }), cors);
      }
      const resources: Record<string, DomainEntity> = {
        matters: "matter",
        "court-cases": "court_case",
        tasks: "task",
        appointments: "appointment",
        "financial-entries": "financial_entry",
      };
      const segments = pathname.split("/").filter(Boolean);
      const entity = segments.length === 2 && segments[0] === "api" ? resources[segments[1]!] : undefined;
      const entityById = segments.length === 3 && segments[0] === "api" ? resources[segments[1]!] : undefined;
      const itemAction = segments.length === 4 && segments[0] === "api" ? resources[segments[1]!] : undefined;
      if (!entity && !entityById && !itemAction) return jsonResponse({ error: "not_found" }, 404, cors);
      const auth = await tenantSession(request, env);
      if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
      if (entity) {
        if (request.method === "GET") return secureApiResponse(await listItems(request, env, auth, entity), cors);
        if (request.method === "POST") return secureApiResponse(await createItem(request, env, auth, entity), cors);
        return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, POST, OPTIONS" });
      }
      if (entityById) {
        if (request.method !== "PATCH") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "PATCH, OPTIONS" });
        const id = segments[2]!;
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) return jsonResponse({ error: "not_found" }, 404, cors);
        if (entityById === "financial_entry") return secureApiResponse(await updateFinancialEntry(request, env, auth, id), cors);
        if (entityById === "matter") return secureApiResponse(await updateMatter(request, env, auth, id), cors);
        if (entityById === "court_case") return secureApiResponse(await updateMatterOrCourtCase(request, env, auth, entityById, id), cors);
        if (entityById === "task") return secureApiResponse(await updateTask(request, env, auth, id), cors);
        if (entityById === "appointment") return secureApiResponse(await updateAppointment(request, env, auth, id), cors);
        return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, OPTIONS" });
      }
      const id = segments[2]!;
      const action = segments[3]!;
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "POST, OPTIONS" });
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) return jsonResponse({ error: "not_found" }, 404, cors);
      if ((action === "archive" && (itemAction === "matter" || itemAction === "court_case")) ||
        (action === "cancel" && (itemAction === "appointment" || itemAction === "financial_entry"))) {
        const parsedVersion = ExpectedUpdatedAtSchema.safeParse(await readJson(request));
        if (!parsedVersion.success) return jsonResponse({ error: "invalid_request", details: parsedVersion.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400, cors);
        return secureApiResponse(await changeStatus(request, env, auth, itemAction!, id,
          action === "archive" ? "archived" : "cancelled", parsedVersion.data.expectedUpdatedAt), cors);
      }
      if (action === "status") {
        const parsed = StatusChangeSchema.safeParse(await readJson(request));
        if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400, cors);
        return secureApiResponse(await changeStatus(request, env, auth, itemAction!, id, parsed.data.status, parsed.data.expectedUpdatedAt), cors);
      }
      return jsonResponse({ error: "not_found" }, 404, cors);
    }
    return jsonResponse({ error: "not_found" }, 404);
    } catch {
      const failure = jsonResponse({ error: "internal_error" }, 500);
      return new URL(request.url).pathname.startsWith("/api/")
        ? secureApiResponse(failure, corsHeaders(request, env))
        : failure;
    }
  },
} satisfies ExportedHandler<Bindings>;
