import { z } from "zod";

export const OpaqueIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const TimestampSchema = z.string().max(64).datetime({ offset: true });

const ShortTextSchema = z.string().trim().min(1).max(160);
const OptionalTextSchema = z.string().trim().max(4000).nullable();
const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  if (year! < 1) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year!, month! - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}, "invalid_date");

export const MatterCreateSchema = z.object({
  title: ShortTextSchema,
  description: OptionalTextSchema.optional(),
  clientId: OpaqueIdSchema.nullable().optional(),
}).strict();

export const ClientCreateSchema = z.object({
  displayName: ShortTextSchema,
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
}).strict();

export const ClientSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  displayName: ShortTextSchema,
  email: z.string().email().max(320).nullable(),
  phone: z.string().max(32).nullable(),
  status: z.enum(["active", "archived"]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();

export const ClientUpdateSchema = z.object({
  expectedUpdatedAt: TimestampSchema,
  displayName: ShortTextSchema.optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"), {
  path: ["expectedUpdatedAt"], message: "at_least_one_field_required",
});

export const MatterClientSchema = z.object({
  id: OpaqueIdSchema,
  displayName: ShortTextSchema,
  status: z.enum(["active", "archived"]),
}).strict();

export const MatterSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  title: ShortTextSchema,
  description: OptionalTextSchema,
  client: MatterClientSchema.nullable(),
  status: z.enum(["active", "archived"]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();

export const MatterUpdateSchema = z.object({
  expectedUpdatedAt: TimestampSchema,
  title: ShortTextSchema.optional(),
  clientId: OpaqueIdSchema.nullable().optional(),
}).strict().refine((value) => value.title !== undefined || value.clientId !== undefined, {
  path: ["expectedUpdatedAt"], message: "at_least_one_field_required",
});

export function formatCnjCaseNumber(value: string): string {
  if (!isCnjCaseNumberCandidate(value)) return value.trim();
  const digits = value.replace(/\D/g, "");
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

export function isCnjCaseNumberCandidate(value: string): boolean {
  return /^[\d\s./-]+$/.test(value.trim()) && value.replace(/\D/g, "").length === 20;
}

export function isValidCnjCaseNumber(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (!isCnjCaseNumberCandidate(value)) return false;
  // Move the check digits to the end and replace them with 00 before calculating the remainder.
  const bodyWithCheckRemainder = `${digits.slice(0, 7)}${digits.slice(9)}00`;
  let remainder = 0;
  for (const digit of bodyWithCheckRemainder) remainder = (remainder * 10 + Number(digit)) % 97;
  const expectedCheckDigits = String(98 - remainder).padStart(2, "0");
  return digits.slice(7, 9) === expectedCheckDigits;
}

const CourtCaseNumberInputSchema = z.string().trim().max(80).nullable().optional()
  .superRefine((value, context) => {
    if (value && isCnjCaseNumberCandidate(value) && !isValidCnjCaseNumber(value)) {
      context.addIssue({ code: "custom", message: "invalid_cnj_check_digits" });
    }
  })
  .transform((value) => typeof value === "string" ? formatCnjCaseNumber(value) : value);

export const CourtCaseCreateSchema = z.object({
  matterId: OpaqueIdSchema.nullable().optional(),
  courtName: ShortTextSchema,
  jurisdiction: z.string().trim().max(120).nullable().optional(),
  caseNumber: CourtCaseNumberInputSchema,
  label: z.string().trim().max(160).nullable().optional(),
}).strict();

export const CourtCaseSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  matterId: OpaqueIdSchema.nullable(),
  courtName: ShortTextSchema,
  jurisdiction: z.string().max(120).nullable(),
  caseNumber: z.string().max(80).nullable(),
  label: z.string().max(160).nullable(),
  status: z.enum(["active", "archived"]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();

export const CourtCasePageSize = 50;
export const CourtCaseCursorSchema = z.object({
  version: z.literal(1),
  createdAt: TimestampSchema,
  caseId: OpaqueIdSchema,
}).strict();
export const CourtCaseListResponseSchema = z.object({
  items: z.array(CourtCaseSchema).max(CourtCasePageSize),
  nextCursor: z.string().max(512).regex(/^[A-Za-z0-9_-]+$/).nullable(),
}).strict();

export const CourtCaseUpdateSchema = z.object({
  expectedUpdatedAt: TimestampSchema,
  matterId: OpaqueIdSchema.nullable().optional(),
  courtName: ShortTextSchema.optional(),
  jurisdiction: z.string().trim().max(120).nullable().optional(),
  caseNumber: CourtCaseNumberInputSchema,
  label: z.string().trim().max(160).nullable().optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"), {
  path: ["expectedUpdatedAt"], message: "at_least_one_field_required",
});

export const CourtCaseNoteCreateSchema = z.object({
  body: z.string().trim().min(1).max(8000),
}).strict();

export const CourtCaseNoteSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  caseId: OpaqueIdSchema,
  source: z.literal("manual"),
  body: z.string().min(1).max(8000),
  createdAt: TimestampSchema,
}).strict();

export const CourtCaseNotesResponseSchema = z.object({
  items: z.array(CourtCaseNoteSchema).max(100),
}).strict();

export const DocumentFileSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  matterId: OpaqueIdSchema.nullable(),
  caseId: OpaqueIdSchema.nullable(),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.literal("application/pdf"),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  status: z.enum(["ready", "archived"]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();

export const DocumentsResponseSchema = z.object({
  items: z.array(DocumentFileSchema).max(100),
}).strict();

export const DocumentConsentVersion = "v2" as const;
export const LegacyDocumentConsentText = "Confirmo que li o documento indicado e quero registrar minha manifestação eletrônica vinculada à minha conta. Entendo que este registro identifica minha conta e o arquivo por hash, não altera o PDF, não usa certificado ICP-Brasil/PAdES e não afirma que este método seja suficiente para qualquer ato." as const;
export const DocumentConsentText = "Confirmo que li esta versão do PDF e quero assiná-la eletronicamente usando minha conta do escritório. O registro associa minha conta, meu nome confirmado, meu consentimento e o hash SHA-256 do arquivo; o PDF original não é alterado. Esta é uma assinatura eletrônica simples do aplicativo, sem certificado ICP-Brasil/PAdES ou carimbo do tempo. Confirme se o destinatário aceita este método para o ato." as const;
const DocumentConsentVersionSchema = z.enum(["v1", "v2"]);
const DocumentConsentTextSchema = z.enum([LegacyDocumentConsentText, DocumentConsentText]);

export const DocumentSigningCreateSchema = z.object({
  consentAccepted: z.literal(true),
  consentVersion: z.literal(DocumentConsentVersion),
  confirmName: z.string().trim().min(1).max(120),
}).strict();

export const DocumentSigningReceiptSchema = z.object({
  id: OpaqueIdSchema,
  documentId: OpaqueIdSchema,
  documentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  signerUserId: OpaqueIdSchema,
  signerName: z.string().trim().min(1).max(120),
  signerEmail: z.string().email().max(320),
  confirmedName: z.string().trim().min(1).max(120),
  consentVersion: DocumentConsentVersionSchema,
  consentText: DocumentConsentTextSchema,
  consentedAt: TimestampSchema,
  requestId: z.string().min(1).max(160),
  canonicalPayload: z.string().min(1).max(4096),
  receiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((receipt, context) => {
  const expectedText = receipt.consentVersion === "v1" ? LegacyDocumentConsentText : DocumentConsentText;
  if (receipt.consentText !== expectedText) {
    context.addIssue({ code: "custom", path: ["consentText"], message: "Consent text does not match its version." });
  }
});

export const DocumentSigningReceiptsResponseSchema = z.object({
  items: z.array(DocumentSigningReceiptSchema).max(100),
}).strict();

export const CloudDriveFileSchema = z.object({
  id: z.string().trim().min(1).max(512),
  name: z.string().trim().min(1).max(512),
  mimeType: z.string().trim().max(256).nullable(),
  size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  modifiedAt: TimestampSchema.nullable(),
  folder: z.boolean(),
}).strict();

export const CloudDriveFilesResponseSchema = z.object({
  items: z.array(CloudDriveFileSchema).max(100),
  nextPageToken: z.string().max(4096).nullable(),
}).strict();

export const CloudDriveImportSchema = z.object({
  fileId: z.string().trim().min(1).max(512),
  caseId: OpaqueIdSchema.nullable().optional(),
}).strict();

export const GooglePickerSessionSchema = z.object({
  developerKey: z.string().trim().min(1).max(512),
  accessToken: z.string().min(1).max(8192),
  expiresAt: TimestampSchema,
}).strict();

export const DocumentArchiveSchema = z.object({ expectedUpdatedAt: TimestampSchema }).strict();
export const DocumentStatusChangeSchema = z.object({
  expectedUpdatedAt: TimestampSchema,
  status: z.enum(["ready", "archived"]),
}).strict();
export const DocumentStatusResponseSchema = z.object({
  status: z.enum(["ready", "archived"]),
  updatedAt: TimestampSchema,
}).strict();

export const CourtPublicationReviewStateSchema = z.object({
  status: z.enum(["pending", "reviewed"]),
  reviewedAt: TimestampSchema.nullable(),
  updatedAt: TimestampSchema.nullable(),
}).strict();

export const CourtPublicationSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  caseId: OpaqueIdSchema,
  source: z.literal("DJEN"),
  sourceHash: z.string().trim().min(12).max(128).regex(/^[A-Za-z0-9_-]+$/),
  environment: z.enum(["homologation", "production"]),
  tribunalCode: z.string().trim().max(24).nullable(),
  communicationType: z.string().trim().max(120).nullable(),
  availableOn: DateOnlySchema.nullable(),
  certificateUrl: z.string().url(),
  firstSeenAt: TimestampSchema,
  lastSeenAt: TimestampSchema,
  review: CourtPublicationReviewStateSchema,
}).strict();

export const CourtPublicationReviewChangeSchema = z.object({
  status: z.enum(["pending", "reviewed"]),
  expectedUpdatedAt: TimestampSchema.nullable(),
}).strict().refine((value) => value.expectedUpdatedAt !== null || value.status === "reviewed", {
  path: ["expectedUpdatedAt"], message: "initial_review_must_be_reviewed",
});

export const CourtPublicationSyncSchema = z.object({
  status: z.enum(["not_checked", "items_returned", "empty_unconfirmed", "rate_limited", "source_error"]),
  environment: z.enum(["homologation", "production"]),
  checkedAt: TimestampSchema.nullable(),
  returnedCount: z.number().int().min(0).max(100),
  warningCode: z.enum(["coverage_unverified", "empty_unconfirmed", "rate_limited", "source_unavailable", "invalid_response", "process_number_required"]).nullable(),
}).strict();

export const CourtPublicationsResponseSchema = z.object({
  providerEnabled: z.boolean(),
  sourceUrl: z.string().url(),
  sync: CourtPublicationSyncSchema,
  items: z.array(CourtPublicationSchema).max(100),
  hasMoreSaved: z.boolean().optional(),
  nextCursor: z.string().max(1024).nullable().optional(),
}).strict();

export const DjenDiscoveryPageLimit = 10;
const oabStates = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

export const DjenDiscoveryRequestSchema = z.object({
  oabNumber: z.string().regex(/^[0-9]{1,12}$/).refine((value) => /[1-9]/.test(value)),
  oabState: z.enum(oabStates),
  startDate: DateOnlySchema,
  endDate: DateOnlySchema,
  page: z.number().int().min(1).max(DjenDiscoveryPageLimit),
}).strict().refine(({ startDate, endDate }) => {
  const elapsed = Date.parse(endDate) - Date.parse(startDate);
  return elapsed >= 0 && elapsed < 31 * 86_400_000;
});

export const DjenDiscoveryResponseSchema = z.object({
  source: z.literal("DJEN"),
  checkedAt: TimestampSchema,
  page: z.number().int().min(1).max(DjenDiscoveryPageLimit),
  sourceCount: z.number().int().nonnegative().nullable(),
  returnedCount: z.number().int().min(0).max(5),
  omittedCount: z.number().int().min(0).max(5),
  hasMore: z.boolean(),
  items: z.array(z.object({
    caseNumber: z.string().regex(/^[0-9]{20}$/).refine(isValidCnjCaseNumber),
    tribunalCode: z.string().regex(/^[A-Z0-9]{2,12}$/),
    availableOn: DateOnlySchema,
    alreadyRegistered: z.boolean(),
  }).strict()).max(5),
}).strict();

export const TaskCreateSchema = z.object({
  matterId: OpaqueIdSchema.nullable().optional(),
  title: ShortTextSchema,
  notes: OptionalTextSchema.optional(),
  scheduledOn: DateOnlySchema.nullable().optional(),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
}).strict();

export const TaskUpdateSchema = z.object({
  expectedUpdatedAt: TimestampSchema,
  title: ShortTextSchema.optional(),
  matterId: OpaqueIdSchema.nullable().optional(),
  scheduledOn: DateOnlySchema.nullable().optional(),
}).strict().refine((value) => value.title !== undefined || value.matterId !== undefined || value.scheduledOn !== undefined, {
  path: ["expectedUpdatedAt"], message: "at_least_one_field_required",
});

export const AppointmentCreateSchema = z.object({
  matterId: OpaqueIdSchema.nullable().optional(),
  caseId: OpaqueIdSchema.nullable().optional(),
  title: ShortTextSchema,
  startsAt: TimestampSchema,
  endsAt: TimestampSchema,
  timezone: z.string().max(64).trim().min(1),
  location: z.string().trim().max(500).nullable().optional(),
  notes: OptionalTextSchema.optional(),
}).strict().refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
  path: ["endsAt"], message: "endsAt_must_follow_startsAt",
});

export const AppointmentSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  matterId: OpaqueIdSchema.nullable(),
  caseId: OpaqueIdSchema.nullable(),
  title: ShortTextSchema,
  startsAt: TimestampSchema,
  endsAt: TimestampSchema,
  timezone: z.string().max(64),
  location: z.string().max(500).nullable(),
  notes: OptionalTextSchema,
  status: z.enum(["scheduled", "cancelled"]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();

export const AppointmentUpdateSchema = z.object({
  expectedUpdatedAt: TimestampSchema,
  title: ShortTextSchema.optional(),
  startsAt: TimestampSchema.optional(),
  endsAt: TimestampSchema.optional(),
  location: z.string().trim().max(500).nullable().optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"), {
  path: ["expectedUpdatedAt"], message: "at_least_one_field_required",
});

export const FinancialEntryCreateSchema = z.object({
  matterId: OpaqueIdSchema.nullable().optional(),
  caseId: OpaqueIdSchema.nullable().optional(),
  kind: z.enum(["income", "expense"]),
  description: ShortTextSchema,
  amountCents: z.number().int().positive().safe(),
  currency: z.literal("BRL").optional(),
  dueOn: DateOnlySchema.nullable().optional(),
  occurredAt: TimestampSchema.nullable().optional(),
  timezone: z.string().max(64).trim().min(1).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
}).strict();

export const FinancialEntrySchema = z.object({
  id: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  matterId: OpaqueIdSchema.nullable(),
  caseId: OpaqueIdSchema.nullable(),
  kind: z.enum(["income", "expense"]),
  description: ShortTextSchema,
  amountCents: z.number().int().positive().safe(),
  currency: z.literal("BRL"),
  status: z.enum(["planned", "paid", "cancelled"]),
  dueOn: DateOnlySchema.nullable(),
  occurredAt: TimestampSchema.nullable(),
  timezone: z.string().max(64).nullable(),
  category: z.string().max(80).nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();

export const FinancialEntryUpdateSchema = z.object({
  expectedUpdatedAt: TimestampSchema,
  kind: z.enum(["income", "expense"]).optional(),
  description: ShortTextSchema.optional(),
  amountCents: z.number().int().positive().safe().optional(),
  dueOn: DateOnlySchema.nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"), {
  path: ["expectedUpdatedAt"], message: "at_least_one_field_required",
});

export const ResearchCourtIdSchema = z.enum(["TJPR", "TJSC", "TJRS", "TRF4", "STJ", "STF"]);
export const ResearchSourceCatalog = {
  TJPR: "https://portal.tjpr.jus.br/jurisprudencia/publico/pesquisa.do?actionType=pesquisar",
  TJSC: "https://www.tjsc.jus.br/web/jurisprudencia/inicio",
  TJRS: "https://www.tjrs.jus.br/novo/buscas-solr/",
  TRF4: "https://eproc-jur.trf4.jus.br/eproc2trf4/externo_controlador.php?acao=jurisprudencia@jurisprudencia/pesquisar",
  STJ: "https://scon.stj.jus.br/SCON/",
  STF: "https://portal.stf.jus.br/jurisprudencia/",
} as const satisfies Record<z.infer<typeof ResearchCourtIdSchema>, string>;

export const LegalResearchCreateSchema = z.object({
  query: z.string().trim().min(2).max(600),
  courtId: ResearchCourtIdSchema,
}).strict();

export const LegalResearchUpdateSchema = LegalResearchCreateSchema.extend({
  expectedUpdatedAt: TimestampSchema,
}).strict();

export const LegalResearchStatusSchema = z.object({
  status: z.enum(["active", "archived"]),
  expectedUpdatedAt: TimestampSchema,
}).strict();

export const LegalResearchSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  query: z.string().trim().min(2).max(600),
  courtId: ResearchCourtIdSchema,
  sourceUrl: z.string().url().regex(/^https:\/\//),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  archivedAt: TimestampSchema.nullable(),
}).strict();

export const LegalResearchPageSize = 50;
export const LegalResearchListStatusSchema = z.enum(["active", "archived", "all"]);
export const LegalResearchCursorSchema = z.object({
  version: z.literal(1),
  status: LegalResearchListStatusSchema,
  archiveGroup: z.union([z.literal(0), z.literal(1)]),
  sortAt: TimestampSchema,
  createdAt: TimestampSchema,
  researchId: OpaqueIdSchema,
}).strict();
export const LegalResearchListResponseSchema = z.object({
  items: z.array(LegalResearchSchema).max(LegalResearchPageSize),
  nextCursor: z.string().max(512).regex(/^[A-Za-z0-9_-]+$/).nullable(),
}).strict();

export const SocialContentPlatformSchema = z.enum(["instagram", "facebook", "tiktok"]);
export const SocialContentDraftCreateSchema = z.object({
  platform: SocialContentPlatformSchema,
  topic: z.string().trim().min(2).max(160),
  content: z.string().trim().min(12).max(5000),
}).strict();
export const SocialContentDraftUpdateSchema = SocialContentDraftCreateSchema.extend({
  expectedUpdatedAt: TimestampSchema,
}).strict();
export const SocialContentDraftSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  platform: SocialContentPlatformSchema,
  topic: z.string().trim().min(2).max(160),
  content: z.string().trim().min(12).max(5000),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();
export const SocialContentDraftsResponseSchema = z.object({ items: z.array(SocialContentDraftSchema).max(100) }).strict();

export const IntegrationProviderSettingsSchema = z.object({
  configured: z.boolean(),
  clientId: z.string().max(512).nullable(),
  tenantId: z.string().max(128).nullable().optional(),
  pickerApiKeyConfigured: z.boolean().optional(),
  clientSecretConfigured: z.boolean(),
  updatedAt: TimestampSchema.nullable(),
  connectionStatus: z.enum(["not_connected", "connected"]),
  refreshState: z.enum(["idle", "pending", "uncertain"]).optional(),
  connectedAccountLabel: z.string().trim().max(320).nullable(),
  connectedAt: TimestampSchema.nullable(),
  grantedScopes: z.array(z.string().trim().min(1).max(256)).max(16),
}).strict();

export const IntegrationSettingsSchema = z.object({
  encryptionAvailable: z.boolean(),
  oauthEnabled: z.boolean(),
  oauthRedirectUris: z.object({
    googleDrive: z.string().url().nullable(),
    microsoftGraph: z.string().url().nullable(),
  }).strict(),
  googlePickerOrigin: z.string().url().nullable(),
  googleDrive: IntegrationProviderSettingsSchema,
  microsoftGraph: IntegrationProviderSettingsSchema,
}).strict();

const IntegrationValueSchema = z.string().trim().min(1).max(512).nullable().optional();
const IntegrationSecretSchema = z.string().min(1).max(4096).optional();

export const IntegrationSettingsUpdateSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("google_drive"),
    pickerApiKey: IntegrationValueSchema,
    clientId: IntegrationValueSchema,
    clientSecret: IntegrationSecretSchema,
    clearClientSecret: z.boolean().optional(),
  }).strict().refine((value) => value.pickerApiKey !== undefined || value.clientId !== undefined || value.clientSecret !== undefined || value.clearClientSecret === true, {
    message: "at_least_one_field_required",
  }).refine((value) => !(value.clientSecret !== undefined && value.clearClientSecret === true), {
    message: "secret_update_conflict",
  }),
  z.object({
    provider: z.literal("microsoft_graph"),
    clientId: IntegrationValueSchema,
    tenantId: z.string().trim().min(1).max(128).nullable().optional(),
    clientSecret: IntegrationSecretSchema,
    clearClientSecret: z.boolean().optional(),
  }).strict().refine((value) => value.clientId !== undefined || value.tenantId !== undefined || value.clientSecret !== undefined || value.clearClientSecret === true, {
    message: "at_least_one_field_required",
  }).refine((value) => !(value.clientSecret !== undefined && value.clearClientSecret === true), {
    message: "secret_update_conflict",
  }),
]);

export const IntegrationConnectionStartSchema = z.object({
  platform: z.enum(["web", "native"]),
}).strict();

export const IntegrationAuthorizationResponseSchema = z.object({
  authorizationUrl: z.string().url().regex(/^https:\/\//),
  expiresAt: TimestampSchema,
}).strict();

export const ExpectedUpdatedAtSchema = z.object({ expectedUpdatedAt: TimestampSchema }).strict();

export const StatusChangeSchema = ExpectedUpdatedAtSchema.extend({ status: z.string().trim().min(1).max(32) }).strict();

export const SessionResponseSchema = z.object({
  user: z.object({ id: OpaqueIdSchema, name: ShortTextSchema, email: z.string().email() }).strict(),
  tenant: z.object({ id: OpaqueIdSchema, role: z.enum(["owner", "member"]) }).strict(),
}).strict();

export const GuidedTourStatusSchema = z.enum(["not_started", "in_progress", "skipped", "completed"]);
export const GuidedTourScreenIdSchema = z.enum(["today", "cases", "calendar", "finance", "research", "files"]);
export const GuidedTourProgressSchema = z.object({
  tourId: z.literal("office_basics_v1"),
  status: GuidedTourStatusSchema,
  stepIndex: z.number().int().min(0).max(5),
  updatedAt: TimestampSchema.nullable(),
}).strict().refine((value) => value.status !== "completed" || (value.stepIndex === 5 && value.updatedAt !== null), {
  path: ["stepIndex"], message: "completed_tour_must_store_final_step",
});
export const GuidedTourProgressUpdateSchema = z.object({
  status: z.enum(["in_progress", "skipped", "completed"]),
  stepIndex: z.number().int().min(0).max(5),
  expectedUpdatedAt: TimestampSchema.nullable(),
}).strict().refine((value) => value.status !== "completed" || value.stepIndex === 5, {
  path: ["stepIndex"], message: "completed_tour_must_store_final_step",
});
export const GuidedTourScreenProgressSchema = z.object({
  tourId: z.literal("office_basics_v1"),
  seenScreenIds: z.array(GuidedTourScreenIdSchema).max(6).refine((screenIds) => new Set(screenIds).size === screenIds.length),
}).strict();
export const GuidedTourScreenSeenUpdateSchema = z.object({
  screenId: GuidedTourScreenIdSchema,
}).strict();

export const MoneySchema = z
  .object({
    amountCents: z.number().int().safe(),
    currency: z.literal("BRL"),
  })
  .strict();

export const MatterSummarySchema = z
  .object({
    id: OpaqueIdSchema,
    tenantId: OpaqueIdSchema,
    title: ShortTextSchema,
    status: z.enum(["active", "archived"]),
    updatedAt: TimestampSchema,
  })
  .strict();

export const TaskSchema = z
  .object({
    id: OpaqueIdSchema,
    tenantId: OpaqueIdSchema,
    matterId: OpaqueIdSchema.nullable(),
    title: ShortTextSchema,
    status: z.enum(["todo", "in_progress", "done", "cancelled"]),
    // Agendamento de trabalho informado pela pessoa; não é prazo jurídico.
    scheduledOn: DateOnlySchema.nullable(),
    updatedAt: TimestampSchema,
  })
  .strict();

export const TaskRecordSchema = TaskSchema.extend({
  notes: OptionalTextSchema,
  createdAt: TimestampSchema,
}).strict();

export const HumanReviewSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }).strict(),
  z
    .object({
      status: z.literal("reviewed"),
      reviewerId: OpaqueIdSchema,
      reviewedAt: TimestampSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("dismissed"),
      reviewerId: OpaqueIdSchema,
      reviewedAt: TimestampSchema,
    })
    .strict(),
]);

const SourceMetadataSchema = z.object({
  provider: ShortTextSchema,
  url: z.string().max(2048).url().regex(/^https:\/\//).nullable(),
  recordId: z.string().trim().min(1).max(256).nullable(),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});

export const SourceReferenceSchema = z.discriminatedUnion("kind", [
  SourceMetadataSchema.extend({
    kind: z.literal("demo"),
    provider: z.literal("Demonstração local"),
    url: z.null(),
    recordId: z.null(),
    payloadHash: z.null(),
    coverage: z.literal("demo"),
  }).strict(),
  SourceMetadataSchema.extend({
    kind: z.literal("external"),
    // Nenhum destes estados declara cobertura integral ou fonte oficial.
    coverage: z.enum(["unknown", "partial"]),
  }).strict(),
]);

export const ExternalCaseSignalSchema = z
  .object({
    id: OpaqueIdSchema,
    tenantId: OpaqueIdSchema,
    matterId: OpaqueIdSchema.nullable(),
    summary: z.string().trim().min(1).max(500),
    source: SourceReferenceSchema,
    observedAt: TimestampSchema,
    lastCheckedAt: TimestampSchema,
    occurredAt: TimestampSchema.nullable(),
    publishedAt: TimestampSchema.nullable(),
    state: z.enum(["unverified", "unavailable", "error"]),
    review: HumanReviewSchema,
  })
  .strict();

export type OpaqueId = z.infer<typeof OpaqueIdSchema>;
export type Timestamp = z.infer<typeof TimestampSchema>;
export type Money = z.infer<typeof MoneySchema>;
export type MatterSummary = z.infer<typeof MatterSummarySchema>;
export type Matter = z.infer<typeof MatterSchema>;
export type Client = z.infer<typeof ClientSchema>;
export type ClientCreate = z.infer<typeof ClientCreateSchema>;
export type ClientUpdate = z.infer<typeof ClientUpdateSchema>;
export type MatterClient = z.infer<typeof MatterClientSchema>;
export type CourtCase = z.infer<typeof CourtCaseSchema>;
export type CourtCaseNote = z.infer<typeof CourtCaseNoteSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskRecord = z.infer<typeof TaskRecordSchema>;
export type Appointment = z.infer<typeof AppointmentSchema>;
export type FinancialEntry = z.infer<typeof FinancialEntrySchema>;
export type LegalResearch = z.infer<typeof LegalResearchSchema>;
export type ResearchCourtId = z.infer<typeof ResearchCourtIdSchema>;
export type SocialContentDraft = z.infer<typeof SocialContentDraftSchema>;
export type SocialContentPlatform = z.infer<typeof SocialContentPlatformSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type GuidedTourProgress = z.infer<typeof GuidedTourProgressSchema>;
export type GuidedTourScreenId = z.infer<typeof GuidedTourScreenIdSchema>;
export type GuidedTourProgressUpdate = z.infer<typeof GuidedTourProgressUpdateSchema>;
export type HumanReview = z.infer<typeof HumanReviewSchema>;
export type SourceReference = z.infer<typeof SourceReferenceSchema>;
export type ExternalCaseSignal = z.infer<typeof ExternalCaseSignalSchema>;
