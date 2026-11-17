import { z } from "zod";

export const OpaqueIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const TimestampSchema = z.string().max(64).datetime({ offset: true });

const ShortTextSchema = z.string().trim().min(1).max(160);
const OptionalTextSchema = z.string().trim().max(4000).nullable();

export const MatterCreateSchema = z.object({
  title: ShortTextSchema,
  description: OptionalTextSchema.optional(),
}).strict();

export const MatterSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  title: ShortTextSchema,
  description: OptionalTextSchema,
  status: z.enum(["active", "archived"]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();

export const CourtCaseCreateSchema = z.object({
  matterId: OpaqueIdSchema.nullable().optional(),
  courtName: ShortTextSchema,
  jurisdiction: z.string().trim().max(120).nullable().optional(),
  caseNumber: z.string().trim().max(80).nullable().optional(),
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

export const TaskCreateSchema = z.object({
  matterId: OpaqueIdSchema.nullable().optional(),
  title: ShortTextSchema,
  notes: OptionalTextSchema.optional(),
  scheduledFor: TimestampSchema.nullable().optional(),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
}).strict();

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

export const FinancialEntryCreateSchema = z.object({
  matterId: OpaqueIdSchema.nullable().optional(),
  caseId: OpaqueIdSchema.nullable().optional(),
  kind: z.enum(["income", "expense"]),
  description: ShortTextSchema,
  amountCents: z.number().int().positive().safe(),
  currency: z.literal("BRL").optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
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
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  occurredAt: TimestampSchema.nullable(),
  timezone: z.string().max(64).nullable(),
  category: z.string().max(80).nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();

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

export const LegalResearchSchema = z.object({
  id: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  query: z.string().trim().min(2).max(600),
  courtId: ResearchCourtIdSchema,
  sourceUrl: z.string().url().regex(/^https:\/\//),
  createdAt: TimestampSchema,
}).strict();

export const StatusChangeSchema = z.object({ status: z.string().trim().min(1).max(32) }).strict();

export const SessionResponseSchema = z.object({
  user: z.object({ id: OpaqueIdSchema, name: ShortTextSchema, email: z.string().email() }).strict(),
  tenant: z.object({ id: OpaqueIdSchema, role: z.enum(["owner", "member"]) }).strict(),
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
    scheduledFor: TimestampSchema.nullable(),
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
export type CourtCase = z.infer<typeof CourtCaseSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskRecord = z.infer<typeof TaskRecordSchema>;
export type Appointment = z.infer<typeof AppointmentSchema>;
export type FinancialEntry = z.infer<typeof FinancialEntrySchema>;
export type LegalResearch = z.infer<typeof LegalResearchSchema>;
export type ResearchCourtId = z.infer<typeof ResearchCourtIdSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type HumanReview = z.infer<typeof HumanReviewSchema>;
export type SourceReference = z.infer<typeof SourceReferenceSchema>;
export type ExternalCaseSignal = z.infer<typeof ExternalCaseSignalSchema>;
