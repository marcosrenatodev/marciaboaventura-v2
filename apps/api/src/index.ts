import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { z } from "zod";
import {
  AppointmentCreateSchema,
  AppointmentSchema,
  CourtCaseCreateSchema,
  CourtCaseSchema,
  FinancialEntryCreateSchema,
  FinancialEntrySchema,
  LegalResearchCreateSchema,
  LegalResearchSchema,
  ResearchSourceCatalog,
  MatterCreateSchema,
  MatterSchema,
  SessionResponseSchema,
  StatusChangeSchema,
  TaskCreateSchema,
  TaskRecordSchema,
} from "../../../packages/contracts/src/index";

type Bindings = Env & {
  AUTH_BASE_URL: string;
  AUTH_SECRET: string;
  WEB_ORIGIN: string;
  SETUP_OWNER_TOKEN?: string;
};

const responseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
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

function origins(env: Bindings): string[] {
  return [env.WEB_ORIGIN, nativeOrigin];
}

function corsHeaders(request: Request, env: Bindings): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin && origins(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie, x-skip-bt-cookie-cache");
  headers.set("Access-Control-Max-Age", "600");
  return headers;
}

function secureApiResponse(response: Response, cors?: Headers): Response {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  cors?.forEach((value, key) => response.headers.set(key, value));
  return response;
}

type TenantSession = {
  user: { id: string; name: string; email: string };
  tenant: { id: string; role: "owner" | "member" };
};

async function legalResearches(request: Request, env: Bindings, auth: TenantSession): Promise<Response> {
  if (request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT research_id, tenant_id, query, court_id, source_url, created_at FROM legal_researches WHERE tenant_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT 100",
    ).bind(auth.tenant.id).all<Record<string, unknown>>();
    const items = rows.results.map((row) => LegalResearchSchema.parse({
      id: row.research_id, tenantId: row.tenant_id, query: row.query, courtId: row.court_id,
      sourceUrl: row.source_url, createdAt: row.created_at,
    }));
    return jsonResponse({ items }, 200);
  }
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, POST, OPTIONS" });

  const parsed = LegalResearchCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);

  const id = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  const sourceUrl = ResearchSourceCatalog[parsed.data.courtId];
  const insert = env.DB.prepare(
    "INSERT INTO legal_researches (tenant_id, research_id, query, court_id, source_url, created_at, created_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
  ).bind(auth.tenant.id, id, parsed.data.query, parsed.data.courtId, sourceUrl, now, auth.user.id);
  const audit = env.DB.prepare(
    "INSERT INTO legal_research_audit_events (tenant_id, event_id, research_id, actor_user_id, action, created_at, request_id) SELECT ?1, ?2, ?3, ?4, 'created', ?5, ?6 WHERE EXISTS (SELECT 1 FROM legal_researches WHERE tenant_id = ?1 AND research_id = ?3)",
  ).bind(auth.tenant.id, eventId, id, auth.user.id, now, request.headers.get("CF-Ray") ?? crypto.randomUUID());
  try {
    const results = await env.DB.batch([insert, audit]);
    if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ item: LegalResearchSchema.parse({ id, tenantId: auth.tenant.id, ...parsed.data, sourceUrl, createdAt: now }) }, 201);
  } catch {
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

async function tenantSession(request: Request, env: Bindings): Promise<TenantSession | null> {
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
  };
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

function validTimezone(value: string | null | undefined): boolean {
  if (!value) return true;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
}

async function listItems(request: Request, env: Bindings, auth: TenantSession, entity: DomainEntity): Promise<Response> {
  if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, POST, OPTIONS" });
  const { table } = entityTable[entity];
  const rows = await env.DB.prepare(`SELECT * FROM ${table} WHERE tenant_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 100`)
    .bind(auth.tenant.id).all<Record<string, unknown>>();
  const items = rows.results.map((row) => mapRow(entity, row));
  return jsonResponse({ items }, 200);
}

function mapRow(entity: DomainEntity, row: Record<string, unknown>): unknown {
  const base = { tenantId: row.tenant_id, createdAt: row.created_at, updatedAt: row.updated_at };
  switch (entity) {
    case "matter": return MatterSchema.parse({ ...base, id: row.matter_id, title: row.title, description: row.description, status: row.status });
    case "court_case": return CourtCaseSchema.parse({ ...base, id: row.case_id, matterId: row.matter_id, courtName: row.court_name, jurisdiction: row.jurisdiction, caseNumber: row.case_number, label: row.label, status: row.status });
    case "task": return TaskRecordSchema.parse({ ...base, id: row.task_id, matterId: row.matter_id, title: row.title, notes: row.notes, status: row.status, scheduledFor: row.scheduled_for });
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
  const parsedBody = await readJson(request);
  const schema = entity === "matter" ? MatterCreateSchema : entity === "court_case" ? CourtCaseCreateSchema
    : entity === "task" ? TaskCreateSchema : entity === "appointment" ? AppointmentCreateSchema : FinancialEntryCreateSchema;
  const parsed = schema.safeParse(parsedBody);
  if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400);
  const value = parsed.data;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const common = [auth.tenant.id, id];
  let insert: D1PreparedStatement;
  switch (entity) {
    case "matter": {
      const item = value as z.infer<typeof MatterCreateSchema>;
      insert = env.DB.prepare(`INSERT INTO matters (tenant_id, matter_id, title, description, status, created_at, updated_at, created_by_user_id, updated_by_user_id) VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5, ?6, ?6)`)
        .bind(...common, item.title, item.description ?? null, now, auth.user.id);
      break;
    }
    case "court_case": {
      const item = value as z.infer<typeof CourtCaseCreateSchema>;
      insert = env.DB.prepare(`INSERT INTO court_cases (tenant_id, case_id, matter_id, court_name, jurisdiction, case_number, label, status, created_at, updated_at, created_by_user_id, updated_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, ?8, ?9, ?9)`)
        .bind(...common, item.matterId ?? null, item.courtName, item.jurisdiction ?? null, item.caseNumber ?? null, item.label ?? null, now, auth.user.id);
      break;
    }
    case "task": {
      const item = value as z.infer<typeof TaskCreateSchema>;
      insert = env.DB.prepare(`INSERT INTO tasks (tenant_id, task_id, matter_id, title, notes, status, scheduled_for, created_at, updated_at, created_by_user_id, updated_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9, ?9)`)
        .bind(...common, item.matterId ?? null, item.title, item.notes ?? null, item.status ?? "todo", item.scheduledFor ?? null, now, auth.user.id);
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
    if (!(await insertWithAudit(env, auth, entity, id, insert, requestId))) return jsonResponse({ error: "write_failed" }, 500);
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

async function changeStatus(request: Request, env: Bindings, auth: TenantSession, entity: DomainEntity, itemId: string, statusValue: string): Promise<Response> {
  const config = entityTable[entity];
  if (!(config.statusValues as readonly string[]).includes(statusValue)) return jsonResponse({ error: "invalid_request", details: [{ path: "status", code: "invalid_value" }] }, 400);
  const now = new Date().toISOString();
  const deletedAt = statusValue === "archived" || statusValue === "cancelled" ? now : null;
  const update = env.DB.prepare(`UPDATE ${config.table} SET status = ?1, updated_at = ?2, updated_by_user_id = ?3, deleted_at = ?4 WHERE tenant_id = ?5 AND ${config.idColumn} = ?6 AND deleted_at IS NULL`)
    .bind(statusValue, now, auth.user.id, deletedAt, auth.tenant.id, itemId);
  const audit = env.DB.prepare(
    `INSERT INTO audit_events (tenant_id, event_id, actor_user_id, entity_type, entity_id, action, created_at, request_id, metadata)
     SELECT ?1, ?2, ?3, ?4, ?5, 'status_changed', ?6, ?7, ?9 WHERE EXISTS
       (SELECT 1 FROM ${config.table} WHERE tenant_id = ?1 AND ${config.idColumn} = ?5 AND status = ?8 AND updated_at = ?6 AND updated_by_user_id = ?3)`,
  ).bind(auth.tenant.id, crypto.randomUUID(), auth.user.id, entity, itemId, now, request.headers.get("CF-Ray") ?? crypto.randomUUID(), statusValue, JSON.stringify({ status: statusValue }));
  try {
    const results = await env.DB.batch([update, audit]);
    const updateChanges = results[0]?.meta.changes ?? 0;
    const auditChanges = results[1]?.meta.changes ?? 0;
    if (updateChanges !== 1) return jsonResponse({ error: "not_found" }, 404);
    if (auditChanges !== 1) return jsonResponse({ error: "write_failed" }, 500);
    return jsonResponse({ status: statusValue }, 200);
  } catch {
    return jsonResponse({ error: "write_failed" }, 500);
  }
}

function createAuth(env: Bindings, allowSignup = false) {
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
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowSignup,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["CF-Connecting-IP"] },
      useSecureCookies: env.AUTH_BASE_URL.startsWith("https://"),
    },
    plugins: [expo()],
  });
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
  async fetch(request: Request, env: Bindings): Promise<Response> {
    try {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      const headOnly = request.method === "HEAD";
      if (request.method !== "GET" && !headOnly) {
        const response = jsonResponse({ error: "method_not_allowed" }, 405);
        response.headers.set("Allow", "GET, HEAD");
        return response;
      }
      return new Response(headOnly ? null : JSON.stringify({
        status: "ok", service: "marcia-api", stage: "auth-mvp", productionReady: false, database: "not_checked",
      }), { status: 200, headers: responseHeadersForHealth });
    }

    if (pathname === "/api/setup/owner" || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/")) {
      const cors = corsHeaders(request, env);
      const origin = request.headers.get("Origin");
      if (origin && !origins(env).includes(origin)) return jsonResponse({ error: "origin_not_allowed" }, 403);
      if (request.method === "OPTIONS") {
        if (!origin) return jsonResponse({ error: "origin_required" }, 400);
        return new Response(null, { status: 204, headers: cors });
      }
      if (pathname === "/api/setup/owner") return setupOwner(request, env);
      if (pathname.startsWith("/api/auth/")) {
        const response = await createAuth(env).handler(request);
        return secureApiResponse(response, cors);
      }
      if (pathname === "/api/session") {
        if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, OPTIONS" });
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        return jsonResponse(SessionResponseSchema.parse(auth), 200, cors);
      }
      if (pathname === "/api/legal-researches") {
        const auth = await tenantSession(request, env);
        if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
        return secureApiResponse(await legalResearches(request, env, auth), cors);
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
      const itemAction = segments.length === 4 && segments[0] === "api" ? resources[segments[1]!] : undefined;
      if (!entity && !itemAction) return jsonResponse({ error: "not_found" }, 404, cors);
      const auth = await tenantSession(request, env);
      if (!auth) return jsonResponse({ error: "unauthorized" }, 401, cors);
      if (entity) {
        if (request.method === "GET") return secureApiResponse(await listItems(request, env, auth, entity), cors);
        if (request.method === "POST") return secureApiResponse(await createItem(request, env, auth, entity), cors);
        return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "GET, POST, OPTIONS" });
      }
      const id = segments[2]!;
      const action = segments[3]!;
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "POST, OPTIONS" });
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) return jsonResponse({ error: "not_found" }, 404, cors);
      if (action === "archive" && (itemAction === "matter" || itemAction === "court_case")) return secureApiResponse(await changeStatus(request, env, auth, itemAction, id, "archived"), cors);
      if (action === "cancel" && (itemAction === "appointment" || itemAction === "financial_entry")) return secureApiResponse(await changeStatus(request, env, auth, itemAction, id, "cancelled"), cors);
      if (action === "status") {
        const parsed = StatusChangeSchema.safeParse(await readJson(request));
        if (!parsed.success) return jsonResponse({ error: "invalid_request", details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) }, 400, cors);
        return secureApiResponse(await changeStatus(request, env, auth, itemAction!, id, parsed.data.status), cors);
      }
      return jsonResponse({ error: "not_found" }, 404, cors);
    }
    return jsonResponse({ error: "not_found" }, 404);
    } catch {
      return jsonResponse({ error: "internal_error" }, 500);
    }
  },
} satisfies ExportedHandler<Bindings>;
