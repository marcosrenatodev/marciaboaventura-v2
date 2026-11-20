import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Platform } from "react-native";
import { apiBaseUrl, authClient, type AuthSession } from "@/auth-client";
import { useAuth } from "@/auth";
import {
  CourtCaseNoteSchema,
  CourtCaseNotesResponseSchema,
  CourtCaseListResponseSchema,
  CourtPublicationReviewStateSchema,
  CourtPublicationsResponseSchema,
  DjenDiscoveryRequestSchema,
  DjenDiscoveryResponseSchema,
  CloudDriveFilesResponseSchema,
  DocumentConsentVersion,
  DocumentSigningCreateSchema,
  DocumentSigningReceiptSchema,
  DocumentSigningReceiptsResponseSchema,
  DocumentFileSchema,
  DocumentsResponseSchema,
  DocumentStatusResponseSchema,
  GooglePickerSessionSchema,
  GuidedTourProgressSchema,
  GuidedTourProgressUpdateSchema,
  GuidedTourScreenProgressSchema,
  GuidedTourScreenSeenUpdateSchema,
  LegalResearchListResponseSchema,
  LegalResearchSchema,
  IntegrationAuthorizationResponseSchema,
  IntegrationProviderSettingsSchema,
  IntegrationSettingsSchema,
  IntegrationSettingsUpdateSchema,
  SocialContentDraftSchema,
  SocialContentDraftsResponseSchema,
} from "@marcia/contracts";
import type { z } from "zod";

type SessionInfo = { user: Record<string, unknown>; tenant: { id: string; role: string } };
type GuidedTourProgress = z.infer<typeof GuidedTourProgressSchema>;
type GuidedTourScreenId = z.infer<typeof GuidedTourScreenSeenUpdateSchema>["screenId"];
type IntegrationSettings = z.infer<typeof IntegrationSettingsSchema>;
type IntegrationSettingsUpdate = z.infer<typeof IntegrationSettingsUpdateSchema>;
type IntegrationProvider = "google_drive" | "microsoft_graph";
type CourtPublications = z.infer<typeof CourtPublicationsResponseSchema>;
type CourtCaseNotes = z.infer<typeof CourtCaseNotesResponseSchema>;
type Documents = z.infer<typeof DocumentsResponseSchema>;
type DocumentFile = z.infer<typeof DocumentFileSchema>;
type DocumentSigningReceipts = z.infer<typeof DocumentSigningReceiptsResponseSchema>;
type DocumentSigningReceipt = z.infer<typeof DocumentSigningReceiptSchema>;
type PickedDocument = { uri: string; name: string; mimeType?: string | null; size?: number | null; file?: Blob | null };
export type ClientItem = { id: string; tenantId: string; displayName: string; email: string | null; phone: string | null; status: "active" | "archived"; createdAt: string; updatedAt: string };
export type MatterItem = { id: string; title: string; status?: string; description?: string | null; client: { id: string; displayName: string; status: "active" | "archived" } | null; updatedAt: string };
export type CourtCaseItem = { id: string; matterId?: string | null; courtName: string; jurisdiction?: string | null; caseNumber?: string | null; label?: string | null; status?: string; updatedAt: string };
export type TaskItem = { id: string; title: string; status?: string; matterId?: string | null; scheduledOn?: string | null; updatedAt: string };
export type AppointmentItem = { id: string; title: string; startsAt: string; endsAt: string; timezone: string; location?: string | null; status?: "scheduled" | "cancelled"; updatedAt: string };
export type FinancialItem = { id: string; description: string; amountCents: number; currency?: string; kind: "income" | "expense"; status?: "planned" | "paid" | "cancelled"; dueOn?: string | null; category?: string | null; updatedAt: string };
export type FinancialEntryUpdate = Pick<FinancialItem, "description" | "amountCents" | "kind" | "dueOn" | "category">;
export type LegalResearchItem = z.infer<typeof LegalResearchSchema>;
export type SocialContentDraftItem = { id: string; platform: "instagram" | "facebook" | "tiktok"; topic: string; content: string; createdAt: string; updatedAt: string };
type ListResponse<T> = { items: T[] };
type WorkContextValue = {
  sessionInfo: SessionInfo | null;
  guidedTour: GuidedTourProgress | null;
  guidedTourReady: boolean;
  guidedTourScreenIds: GuidedTourScreenId[];
  guidedTourScreenProgressReady: boolean;
  saveGuidedTourProgress: (status: "in_progress" | "skipped" | "completed", stepIndex: number) => Promise<GuidedTourProgress>;
  replayGuidedTour: () => Promise<GuidedTourProgress>;
  markGuidedTourScreenSeen: (screenId: GuidedTourScreenId) => Promise<void>;
  clients: ClientItem[];
  matters: MatterItem[];
  courtCases: CourtCaseItem[];
  courtCasesLoading: boolean;
  courtCasesNextCursor: string | null;
  courtCasesIssue: string | null;
  loadMoreCourtCases: () => Promise<void>;
  tasks: TaskItem[];
  appointments: AppointmentItem[];
  financialEntries: FinancialItem[];
  legalResearches: LegalResearchItem[];
  legalResearchesLoading: boolean;
  legalResearchesNextCursor: string | null;
  loadLegalResearches: (includeArchived?: boolean) => Promise<void>;
  loadMoreLegalResearches: () => Promise<void>;
  updateLegalResearch: (id: string, input: Pick<LegalResearchItem, "query" | "courtId">, expectedUpdatedAt: string) => Promise<void>;
  setLegalResearchStatus: (id: string, status: "active" | "archived", expectedUpdatedAt: string) => Promise<void>;
  socialContentDrafts: SocialContentDraftItem[];
  loading: boolean;
  issue: string | null;
  refresh: () => Promise<void>;
  createMatter: (title: string, clientId: string | null) => Promise<void>;
  updateMatter: (id: string, title: string, clientId: string | null, expectedUpdatedAt: string) => Promise<void>;
  setMatterStatus: (id: string, status: "active" | "archived", expectedUpdatedAt: string) => Promise<void>;
  createClient: (input: Pick<ClientItem, "displayName" | "email" | "phone">) => Promise<void>;
  updateClient: (id: string, input: Pick<ClientItem, "displayName" | "email" | "phone">, expectedUpdatedAt: string) => Promise<void>;
  setClientStatus: (id: string, status: "active" | "archived", expectedUpdatedAt: string) => Promise<void>;
  createCourtCase: (input: Pick<CourtCaseItem, "matterId" | "courtName" | "jurisdiction" | "caseNumber" | "label">) => Promise<void>;
  updateCourtCase: (id: string, input: Pick<CourtCaseItem, "matterId" | "courtName" | "jurisdiction" | "caseNumber" | "label">, expectedUpdatedAt: string) => Promise<void>;
  setCourtCaseStatus: (id: string, status: "active" | "archived", expectedUpdatedAt: string) => Promise<void>;
  createTask: (title: string, matterId: string | null, scheduledOn: string | null) => Promise<void>;
  updateTask: (id: string, title: string, matterId: string | null, scheduledOn: string | null, expectedUpdatedAt: string) => Promise<void>;
  setTaskStatus: (id: string, status: "todo" | "in_progress" | "done", expectedUpdatedAt: string) => Promise<void>;
  createAppointment: (input: Pick<AppointmentItem, "title" | "startsAt" | "endsAt" | "timezone" | "location">) => Promise<void>;
  updateAppointment: (id: string, input: Pick<AppointmentItem, "title" | "startsAt" | "endsAt" | "location">, expectedUpdatedAt: string) => Promise<void>;
  cancelAppointment: (id: string, expectedUpdatedAt: string) => Promise<void>;
  createFinancialEntry: (entry: Pick<FinancialItem, "description" | "amountCents" | "kind" | "dueOn" | "category">) => Promise<void>;
  updateFinancialEntry: (id: string, entry: FinancialEntryUpdate, expectedUpdatedAt: string) => Promise<void>;
  setFinancialStatus: (id: string, status: "planned" | "paid" | "cancelled", expectedUpdatedAt: string) => Promise<void>;
  createLegalResearch: (input: Pick<LegalResearchItem, "query" | "courtId">) => Promise<void>;
  createSocialContentDraft: (input: Pick<SocialContentDraftItem, "platform" | "topic" | "content">) => Promise<SocialContentDraftItem>;
  updateSocialContentDraft: (id: string, input: Pick<SocialContentDraftItem, "platform" | "topic" | "content">, expectedUpdatedAt: string) => Promise<SocialContentDraftItem>;
  loadIntegrationSettings: () => Promise<IntegrationSettings>;
  loadMicrosoftDriveFiles: (parentId?: string | null, pageToken?: string | null) => Promise<z.infer<typeof CloudDriveFilesResponseSchema>>;
  loadGooglePickerSession: () => Promise<z.infer<typeof GooglePickerSessionSchema>>;
  importCloudDriveFile: (provider: IntegrationProvider, fileId: string, caseId: string | null) => Promise<DocumentFile>;
  saveIntegrationSettings: (input: IntegrationSettingsUpdate) => Promise<unknown>;
  clearIntegrationSettings: (provider: IntegrationProvider) => Promise<void>;
  startIntegrationConnection: (provider: IntegrationProvider) => Promise<string>;
  disconnectIntegration: (provider: IntegrationProvider) => Promise<{ disconnected: boolean; providerRevocation: "confirmed" | "not_confirmed" | "not_supported" }>;
  loadCourtPublications: (caseId: string) => Promise<CourtPublications>;
  discoverCourtCases: (query: z.infer<typeof DjenDiscoveryRequestSchema>) => Promise<z.infer<typeof DjenDiscoveryResponseSchema>>;
  syncCourtPublications: (caseId: string) => Promise<CourtPublications>;
  setCourtPublicationReview: (caseId: string, sourceHash: string, status: "pending" | "reviewed", expectedUpdatedAt: string | null) => Promise<z.infer<typeof CourtPublicationReviewStateSchema>>;
  loadCourtCaseNotes: (caseId: string) => Promise<CourtCaseNotes>;
  createCourtCaseNote: (caseId: string, body: string) => Promise<void>;
  loadDocuments: (includeArchived?: boolean) => Promise<Documents>;
  loadDocumentSigningRecords: (documentId: string) => Promise<DocumentSigningReceipts>;
  createDocumentSigningRecord: (documentId: string, confirmName: string) => Promise<DocumentSigningReceipt>;
  uploadDocument: (asset: PickedDocument, displayName: string, caseId: string | null) => Promise<DocumentFile>;
  setDocumentStatus: (documentId: string, status: "ready" | "archived", expectedUpdatedAt: string) => Promise<z.infer<typeof DocumentStatusResponseSchema>>;
  downloadDocument: (documentId: string) => Promise<ArrayBuffer>;
  exportOfficeData: () => Promise<string>;
};

const WorkContext = createContext<WorkContextValue | null>(null);
const requestInit = { credentials: "include" as const, headers: { Accept: "application/json" } };

class WorkApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "WorkApiError";
  }
}

async function throwIfRateLimitError(response: Response): Promise<void> {
  if (response.status !== 429 && response.status !== 503) return;
  const failure = await response.clone().json().catch(() => null) as { error?: string; retryAfterSeconds?: number } | null;
  if (response.status === 429 && failure?.error === "rate_limited") {
    const headerSeconds = Number(response.headers.get("Retry-After"));
    const retryAfterSeconds = Number.isSafeInteger(failure.retryAfterSeconds)
      ? Math.max(1, failure.retryAfterSeconds!)
      : Number.isSafeInteger(headerSeconds) ? Math.max(1, headerSeconds) : 60;
    const wait = retryAfterSeconds >= 60
      ? `${Math.ceil(retryAfterSeconds / 60)} minuto(s)`
      : `${retryAfterSeconds} segundo(s)`;
    throw new WorkApiError(429, `Muitas alterações em pouco tempo. Aguarde ${wait} e tente novamente.`);
  }
  if (response.status === 503 && failure?.error === "rate_limit_unavailable") {
    throw new WorkApiError(503, "O controle de segurança está temporariamente indisponível. Nenhuma alteração foi salva; tente novamente em alguns instantes.");
  }
}

async function throwIfMaintenanceResponse(response: Response): Promise<void> {
  if (response.status !== 503) return;
  const failure = await response.clone().json().catch(() => null) as { error?: string } | null;
  if (failure?.error === "maintenance") {
    throw new WorkApiError(503, "O sistema do escritório está em manutenção temporária. Nenhuma operação nova foi aceita; quando voltar, confira ações iniciadas pouco antes.");
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiBaseUrl) throw new Error("A API não está configurada. Defina EXPO_PUBLIC_API_URL para carregar ou salvar dados.");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...requestInit,
    ...init,
    credentials: "include",
    headers: { ...requestInit.headers, ...init?.headers },
  });
  if (!response.ok) {
    await throwIfMaintenanceResponse(response);
    await throwIfRateLimitError(response);
    if (path.startsWith("/api/documents")) {
      const failure = await response.json().catch(() => null) as { error?: string } | null;
      if (path.endsWith("/signatures")) {
        if (failure?.error === "document_already_recorded") throw new WorkApiError(409, "Sua manifestação para este PDF já está registrada.");
        if (failure?.error === "document_not_ready") throw new WorkApiError(409, "Este documento precisa estar ativo no cofre antes de registrar a manifestação.");
        if (failure?.error === "signer_name_mismatch") throw new WorkApiError(422, "Digite seu nome como aparece na conta do escritório.");
        if (failure?.error === "document_integrity_unavailable") throw new WorkApiError(503, "Não foi possível conferir o PDF guardado. Nenhuma manifestação foi registrada; tente baixar o arquivo e procure a administração se o problema continuar.");
        if (failure?.error === "document_integrity_mismatch") throw new WorkApiError(503, "O PDF guardado não corresponde ao hash original. A manifestação foi bloqueada; procure a administração.");
        if (failure?.error === "document_signing_receipt_corrupt") throw new WorkApiError(503, "O recibo não passou na verificação de integridade. Não registre outro; procure a administração.");
        if (response.status === 400) throw new WorkApiError(400, "Confirme a declaração e confira o nome antes de registrar.");
        if (response.status === 404) throw new WorkApiError(404, "Este documento não está mais disponível neste escritório.");
        if (response.status >= 500) throw new WorkApiError(response.status, "Não foi possível verificar os registros deste documento agora.");
      }
      if (response.status === 413 || failure?.error === "document_too_large") throw new WorkApiError(413, "O PDF excede o limite de 10 MB.");
      if (failure?.error === "pdf_file_required" || failure?.error?.startsWith("pdf_")) throw new WorkApiError(response.status, "Selecione um arquivo PDF válido.");
      if (failure?.error === "document_vault_not_configured") throw new WorkApiError(503, "O cofre de documentos ainda não foi configurado com uma chave segura neste ambiente.");
      if (failure?.error === "case_not_found_or_archived") throw new WorkApiError(404, "O processo selecionado não está ativo. Atualize a lista e tente novamente.");
      if (response.status === 409) throw new WorkApiError(409, "O documento mudou em outra tela. Atualize a lista antes de tentar novamente.");
      if (response.status === 404) throw new WorkApiError(404, "Esse documento não está mais disponível neste escritório.");
      if (response.status >= 500) throw new WorkApiError(response.status, "Não foi possível acessar o cofre agora. Tente novamente.");
      throw new WorkApiError(response.status, "Não foi possível enviar esse arquivo. Confira se é um PDF e tente novamente.");
    }
    if (path.startsWith("/api/integrations")) {
      const failure = await response.json().catch(() => null) as { error?: string; retryAfterSeconds?: number } | null;
      if (response.status === 401 || response.status === 403) {
        if (failure?.error === "google_picker_origin_denied") throw new WorkApiError(403, "A origem web do app não corresponde a WEB_ORIGIN configurada no Worker.");
        throw new WorkApiError(response.status, "Sua sessão expirou ou não tem acesso às integrações deste escritório. Entre novamente.");
      }
      if (response.status === 413 || failure?.error === "document_too_large") throw new WorkApiError(413, "O PDF excede o limite de 10 MB.");
      if (failure?.error === "pdf_signature_invalid") throw new WorkApiError(response.status, "O arquivo selecionado não é um PDF válido.");
      if (failure?.error === "drive_file_unavailable") throw new WorkApiError(404, "Este arquivo não está mais acessível na conta conectada. Atualize a lista e tente novamente.");
      if (failure?.error === "drive_download_unavailable" || failure?.error === "drive_provider_unavailable" || failure?.error === "integration_unavailable") throw new WorkApiError(response.status, "O Google Drive ou OneDrive não respondeu. Tente novamente em alguns instantes.");
      if (failure?.error === "drive_rate_limited") throw new WorkApiError(429, `O Drive pediu uma pausa. Tente novamente em ${failure.retryAfterSeconds ?? 30} segundos.`);
      if (failure?.error === "integration_reauthorize_required") throw new WorkApiError(409, "A autorização expirou ou foi revogada. Reconecte a conta em Processos → Integrações.");
      if (failure?.error === "google_picker_key_missing") throw new WorkApiError(409, "Configure a API key do Google Picker em Processos → Integrações.");
      if (failure?.error === "google_drive_file_scope_missing") throw new WorkApiError(409, "Reconecte o Google Drive e aceite a permissão de seleção de arquivos.");
      if (failure?.error === "pdf_file_required") throw new WorkApiError(415, "Escolha um arquivo PDF ou documento Google compatível.");
      if (failure?.error === "integration_settings_disabled") throw new WorkApiError(503, "A configuração de integrações está desativada neste ambiente até concluir a revisão de segurança.");
      if (failure?.error === "integration_oauth_disabled") throw new WorkApiError(503, "A conexão OAuth está desligada até configurar os endereços de retorno e concluir a revisão de segurança.");
      if (failure?.error === "vault_not_configured") throw new WorkApiError(503, "O cofre de credenciais ainda não foi configurado nesta instalação.");
      if (failure?.error === "integration_connected_disconnect_first") throw new WorkApiError(409, "Desconecte a conta antes de trocar ou remover as credenciais OAuth.");
      if (failure?.error === "integration_oauth_in_progress") throw new WorkApiError(409, "Finalize ou cancele a autorização que está aberta antes de trocar as credenciais.");
      if (failure?.error === "integration_credentials_incomplete") throw new WorkApiError(409, "Salve primeiro o Client ID e o Client Secret do aplicativo.");
      if (failure?.error === "microsoft_tenant_not_configured") throw new WorkApiError(409, "Informe um Tenant ID Microsoft válido antes de conectar.");
      if (response.status === 502) throw new WorkApiError(502, "O serviço de arquivos não conseguiu concluir a importação. O original não foi alterado.");
      if (response.status === 503) throw new WorkApiError(503, "O cofre privado não está disponível nesta instalação.");
      if (response.status === 429) throw new WorkApiError(429, "Muitas tentativas de conexão. Aguarde alguns minutos antes de tentar novamente.");
      if (response.status === 409) throw new WorkApiError(409, "A conexão mudou em outra tela. Atualize as configurações e tente novamente.");
      if (response.status >= 500) throw new WorkApiError(response.status, "Não foi possível acessar o Drive agora. Tente novamente.");
      throw new WorkApiError(response.status, "Não foi possível concluir a operação com o Drive. Atualize e tente novamente.");
    }
    if (response.status === 401 || response.status === 403) throw new WorkApiError(response.status, "Sua sessão expirou ou não tem acesso ao escritório. Entre novamente.");
    if (path === "/api/court-cases/discover-djen") {
      const failure = await response.json().catch(() => null) as { error?: string; retryAfterSeconds?: number } | null;
      if (failure?.error === "djen_discovery_disabled") throw new WorkApiError(response.status, "A busca por OAB ainda não está liberada neste ambiente. Você pode usar o portal oficial.");
      if (failure?.error === "djen_discovery_invalid_query") throw new WorkApiError(response.status, "Confira a OAB, a UF e o período de até 31 dias.");
      if (failure?.error === "djen_rate_limited") throw new WorkApiError(response.status, `A fonte pediu uma pausa. Tente novamente em ${failure.retryAfterSeconds ?? 60} segundos.`);
      throw new WorkApiError(response.status, "Não foi possível carregar esta página do DJEN. Confira a fonte oficial ou tente mais tarde.");
    }
    if (path.includes("/publications")) {
      const failure = await response.json().catch(() => null) as { error?: string; retryAfterSeconds?: number } | null;
      if (path.endsWith("/review") && response.status === 409) {
        if (failure?.error === "court_case_archived") throw new WorkApiError(response.status, "Reative o processo antes de alterar a conferência interna da publicação.");
        throw new WorkApiError(response.status, "A conferência foi alterada em outra tela. Atualize a lista antes de continuar.");
      }
      if (path.endsWith("/review") && response.status === 404) throw new WorkApiError(response.status, "Esta publicação não está mais disponível neste processo.");
      if (failure?.error === "djen_disabled") throw new WorkApiError(response.status, "A consulta ao DJEN está desligada neste ambiente até a validação final do conector.");
      if (failure?.error === "djen_schema_unverified") throw new WorkApiError(response.status, "A consulta real ao DJEN continua bloqueada até a conferência manual dos filtros, paginação e limites oficiais.");
      if (failure?.error === "djen_configuration_invalid") throw new WorkApiError(response.status, "O ambiente do DJEN está configurado com um valor inválido. A consulta foi bloqueada.");
      if (failure?.error === "djen_rate_limited") throw new WorkApiError(response.status, `A fonte pediu uma pausa. Tente novamente em ${failure.retryAfterSeconds ?? 3} segundos.`);
      if (failure?.error === "djen_source_unavailable") throw new WorkApiError(response.status, "O DJEN não respondeu. O app manteve as publicações salvas e não tratou a falha como ausência de publicações.");
      if (failure?.error === "djen_invalid_response") throw new WorkApiError(response.status, "A resposta do DJEN mudou ou veio incompleta. Nada foi substituído; confira diretamente a fonte oficial.");
      if (failure?.error === "process_number_required") throw new WorkApiError(response.status, "Informe um número de processo CNJ válido para consultar o DJEN.");
      if (failure?.error === "court_case_archived") throw new WorkApiError(response.status, "Reative o processo antes de consultar novas publicações.");
      throw new WorkApiError(response.status, "Não foi possível consultar as publicações agora. As informações já salvas continuam disponíveis.");
    }
    if (response.status === 409) throw new WorkApiError(response.status, "Esse registro mudou em outra tela. A lista foi atualizada; saia desta edição e abra novamente para carregar os dados atuais.");
    if (response.status === 503 && path.startsWith("/api/integrations")) {
      const failure = await response.json().catch(() => null) as { error?: string } | null;
      if (failure?.error === "integration_settings_disabled") throw new WorkApiError(503, "A configuração de integrações está desativada neste ambiente até concluir a revisão de segurança.");
      if (failure?.error === "integration_oauth_disabled") throw new WorkApiError(503, "A conexão OAuth está desligada até configurar os endereços de retorno e concluir a revisão de segurança.");
      if (failure?.error === "oauth_callback_requires_https" || failure?.error === "oauth_app_return_requires_https" || failure?.error === "oauth_callback_not_configured") throw new WorkApiError(503, "A administração precisa configurar os endereços HTTPS de retorno do app e do provedor.");
      if (failure?.error === "vault_not_configured") throw new WorkApiError(503, "O cofre de credenciais ainda não foi configurado nesta instalação. A administração precisa provisionar a chave de cifragem no Worker.");
      throw new WorkApiError(503, "Não foi possível abrir o cofre de credenciais. A chave pode estar indisponível ou precisar de recuperação pela administração.");
    }
    if (response.status === 429 && path.startsWith("/api/integrations")) throw new WorkApiError(429, "Muitas tentativas de conexão abertas. Aguarde alguns minutos antes de tentar novamente.");
    if (response.status === 409 && path.startsWith("/api/integrations")) {
      const failure = await response.json().catch(() => null) as { error?: string } | null;
      if (failure?.error === "integration_connected_disconnect_first") throw new WorkApiError(409, "Desconecte a conta antes de trocar ou remover as credenciais OAuth.");
      if (failure?.error === "integration_oauth_in_progress") throw new WorkApiError(409, "Finalize ou cancele a autorização que está aberta antes de trocar as credenciais.");
      if (failure?.error === "integration_credentials_incomplete") throw new WorkApiError(409, "Salve primeiro o Client ID e o Client Secret do aplicativo.");
      if (failure?.error === "microsoft_tenant_not_configured") throw new WorkApiError(409, "Informe um Tenant ID Microsoft válido antes de conectar.");
    }
    if (response.status >= 500) throw new WorkApiError(response.status, "A API está indisponível no momento. Tente novamente.");
    throw new WorkApiError(response.status, "A API não aceitou a solicitação. Confira os campos e tente novamente.");
  }
  return response.json() as Promise<T>;
}

function isSessionInfo(value: unknown): value is SessionInfo {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SessionInfo>;
  return Boolean(candidate.user && typeof candidate.user === "object" && candidate.tenant &&
    typeof candidate.tenant.id === "string" && typeof candidate.tenant.role === "string");
}

function isList<T>(value: unknown): value is ListResponse<T> {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items));
}

async function authCookieHeaders(authSession: AuthSession | null): Promise<Record<string, string>> {
  if (!authSession || Platform.OS === "web") return {};
  // The Expo Better Auth plugin stores the session cookie in SecureStore and
  // exposes it for authenticated calls outside the Better Auth client.
  const cookie = await authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}

export function WorkDataProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [guidedTour, setGuidedTour] = useState<GuidedTourProgress | null>(null);
  const [guidedTourReady, setGuidedTourReady] = useState(false);
  const [guidedTourScreenIds, setGuidedTourScreenIds] = useState<GuidedTourScreenId[]>([]);
  const [guidedTourScreenProgressReady, setGuidedTourScreenProgressReady] = useState(false);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [matters, setMatters] = useState<MatterItem[]>([]);
  const [courtCases, setCourtCases] = useState<CourtCaseItem[]>([]);
  const [courtCasesLoading, setCourtCasesLoading] = useState(false);
  const [courtCasesNextCursor, setCourtCasesNextCursor] = useState<string | null>(null);
  const [courtCasesIssue, setCourtCasesIssue] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [financialEntries, setFinancialEntries] = useState<FinancialItem[]>([]);
  const [legalResearches, setLegalResearches] = useState<LegalResearchItem[]>([]);
  const [legalResearchesLoading, setLegalResearchesLoading] = useState(false);
  const [legalResearchesNextCursor, setLegalResearchesNextCursor] = useState<string | null>(null);
  const [legalResearchesStatus, setLegalResearchesStatus] = useState<"active" | "archived">("active");
  const [socialContentDrafts, setSocialContentDrafts] = useState<SocialContentDraftItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) {
      setSessionInfo(null); setGuidedTour(null); setGuidedTourReady(false); setGuidedTourScreenIds([]); setGuidedTourScreenProgressReady(false); setClients([]); setMatters([]); setCourtCases([]); setCourtCasesLoading(false); setCourtCasesNextCursor(null); setCourtCasesIssue(null); setTasks([]); setAppointments([]); setFinancialEntries([]); setLegalResearches([]); setLegalResearchesLoading(false); setLegalResearchesNextCursor(null); setLegalResearchesStatus("active"); setSocialContentDrafts([]); setIssue(null); setLoading(false);
      return;
    }
    setLoading(true); setIssue(null); setSessionInfo(null); setGuidedTour(null); setGuidedTourReady(false); setGuidedTourScreenIds([]); setGuidedTourScreenProgressReady(false); setClients([]); setMatters([]); setCourtCases([]); setCourtCasesLoading(false); setCourtCasesNextCursor(null); setCourtCasesIssue(null); setTasks([]); setAppointments([]); setFinancialEntries([]); setLegalResearches([]); setLegalResearchesNextCursor(null); setLegalResearchesStatus("active"); setSocialContentDrafts([]);
    try {
      const cookieHeaders = await authCookieHeaders(session);
      const info = await requestJson<unknown>("/api/session", { headers: cookieHeaders });
      if (!isSessionInfo(info)) throw new Error("A sessão da API não informou usuário e escritório. Nenhum dado foi carregado.");
      setSessionInfo(info);
      const guidedTourPromise = requestJson<unknown>("/api/onboarding/office-tour-v1", { headers: cookieHeaders })
        .then((result) => GuidedTourProgressSchema.safeParse(result))
        .catch(() => null);
      const guidedTourScreensPromise = requestJson<unknown>("/api/onboarding/office-screens-v1", { headers: cookieHeaders })
        .then((result) => GuidedTourScreenProgressSchema.safeParse(result))
        .catch(() => null);
      const [clientsResult, mattersResult, casesResult, tasksResult, appointmentsResult, financialResult, researchResult, socialDraftResult] = await Promise.all([
        requestJson<unknown>("/api/clients", { headers: cookieHeaders }), requestJson<unknown>("/api/matters", { headers: cookieHeaders }), requestJson<unknown>("/api/court-cases", { headers: cookieHeaders }),
        requestJson<unknown>("/api/tasks", { headers: cookieHeaders }), requestJson<unknown>("/api/appointments", { headers: cookieHeaders }),
        requestJson<unknown>("/api/financial-entries", { headers: cookieHeaders }), requestJson<unknown>("/api/legal-researches", { headers: cookieHeaders }),
        requestJson<unknown>("/api/social-drafts", { headers: cookieHeaders }),
      ]);
      const courtCasesParsed = CourtCaseListResponseSchema.safeParse(casesResult);
      const legalResearchesParsed = LegalResearchListResponseSchema.safeParse(researchResult);
      const socialDraftsParsed = SocialContentDraftsResponseSchema.safeParse(socialDraftResult);
      if (!isList<ClientItem>(clientsResult) || !isList<MatterItem>(mattersResult) || !courtCasesParsed.success || !isList<TaskItem>(tasksResult) || !isList<AppointmentItem>(appointmentsResult) || !isList<FinancialItem>(financialResult) || !legalResearchesParsed.success || !socialDraftsParsed.success) {
        throw new Error("A API retornou uma lista em formato inesperado. Os dados não foram exibidos.");
      }
      setClients(clientsResult.items); setMatters(mattersResult.items); setCourtCases(courtCasesParsed.data.items); setCourtCasesNextCursor(courtCasesParsed.data.nextCursor); setTasks(tasksResult.items); setAppointments(appointmentsResult.items);
      setFinancialEntries(financialResult.items); setLegalResearches(legalResearchesParsed.data.items); setLegalResearchesNextCursor(legalResearchesParsed.data.nextCursor); setLegalResearchesStatus("active"); setSocialContentDrafts(socialDraftsParsed.data.items);
      const guidedTourResult = await guidedTourPromise;
      let progress = guidedTourResult?.success ? guidedTourResult.data : null;
      if (progress?.status === "not_started") {
        const start = GuidedTourProgressUpdateSchema.parse({ status: "in_progress", stepIndex: 0, expectedUpdatedAt: null });
        try {
          const started = GuidedTourProgressSchema.safeParse(await requestJson<unknown>("/api/onboarding/office-tour-v1", {
            method: "PUT", headers: { "Content-Type": "application/json", ...cookieHeaders }, body: JSON.stringify(start),
          }));
          if (started.success) progress = started.data;
        } catch (error) {
          if (error instanceof WorkApiError && error.status === 409) {
            try {
              const latest = GuidedTourProgressSchema.safeParse(await requestJson<unknown>("/api/onboarding/office-tour-v1", { headers: cookieHeaders }));
              if (latest.success) progress = latest.data;
            } catch {
              // A progress race must not prevent the rest of the workspace from loading.
            }
          }
        }
      }
      setGuidedTour(progress);
      setGuidedTourReady(Boolean(progress));
      const guidedTourScreensResult = await guidedTourScreensPromise;
      setGuidedTourScreenIds(guidedTourScreensResult?.success ? guidedTourScreensResult.data.seenScreenIds : []);
      setGuidedTourScreenProgressReady(Boolean(guidedTourScreensResult?.success));
    } catch (error) {
      setSessionInfo(null); setGuidedTour(null); setGuidedTourReady(false); setGuidedTourScreenIds([]); setGuidedTourScreenProgressReady(false); setClients([]); setMatters([]); setCourtCases([]); setCourtCasesLoading(false); setCourtCasesNextCursor(null); setCourtCasesIssue(null); setTasks([]); setAppointments([]); setFinancialEntries([]); setLegalResearches([]); setLegalResearchesLoading(false); setLegalResearchesNextCursor(null); setLegalResearchesStatus("active"); setSocialContentDrafts([]);
      setIssue(error instanceof TypeError ? "Sem conexão com a API. Confira a internet e tente novamente." : error instanceof Error ? error.message : "Não foi possível carregar os dados.");
    } finally { setLoading(false); }
  }, [session]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const loadMoreCourtCases = useCallback(async () => {
    if (!courtCasesNextCursor || courtCasesLoading) return;
    setCourtCasesLoading(true);
    setCourtCasesIssue(null);
    try {
      const parsed = CourtCaseListResponseSchema.parse(await requestJson<unknown>(
        `/api/court-cases?cursor=${encodeURIComponent(courtCasesNextCursor)}`,
        { headers: await authCookieHeaders(session) },
      ));
      setCourtCases((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        parsed.items.forEach((item) => byId.set(item.id, item));
        return [...byId.values()];
      });
      setCourtCasesNextCursor(parsed.nextCursor);
    } catch (error) {
      setCourtCasesIssue(error instanceof Error ? error.message : "Não foi possível carregar mais processos.");
    } finally {
      setCourtCasesLoading(false);
    }
  }, [courtCasesLoading, courtCasesNextCursor, session]);

  const saveGuidedTourProgress = useCallback(async (status: "in_progress" | "skipped" | "completed", stepIndex: number) => {
    if (!guidedTourReady || !guidedTour) throw new Error("O progresso do tour ainda não foi carregado. Tente novamente.");
    const update = GuidedTourProgressUpdateSchema.parse({ status, stepIndex, expectedUpdatedAt: guidedTour.updatedAt });
    try {
      const result = await requestJson<unknown>("/api/onboarding/office-tour-v1", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) },
        body: JSON.stringify(update),
      });
      const parsed = GuidedTourProgressSchema.safeParse(result);
      if (!parsed.success) throw new Error("A API não confirmou o progresso do tour. Tente novamente.");
      setGuidedTour(parsed.data);
      return parsed.data;
    } catch (error) {
      if (error instanceof WorkApiError && error.status === 409) {
        try {
          const current = GuidedTourProgressSchema.parse(await requestJson<unknown>("/api/onboarding/office-tour-v1", {
            headers: await authCookieHeaders(session),
          }));
          setGuidedTour(current);
          throw new Error("O tour foi atualizado em outra sessão. O progresso atual foi carregado; confira a etapa antes de continuar.");
        } catch (refreshError) {
          if (refreshError instanceof Error && refreshError.message.startsWith("O tour foi atualizado")) throw refreshError;
        }
      }
      throw error;
    }
  }, [guidedTour, guidedTourReady, session]);

  const replayGuidedTour = useCallback(async () => {
    if (!guidedTourReady || !guidedTour) throw new Error("Não foi possível carregar o tour. Confira a conexão e tente novamente.");
    return saveGuidedTourProgress("in_progress", guidedTour.status === "in_progress" ? guidedTour.stepIndex : 0);
  }, [guidedTour, guidedTourReady, saveGuidedTourProgress]);

  const markGuidedTourScreenSeen = useCallback(async (screenId: GuidedTourScreenId) => {
    if (!guidedTourReady || !guidedTour) throw new Error("Não foi possível carregar o progresso da ajuda. Tente novamente.");
    const update = GuidedTourScreenSeenUpdateSchema.parse({ screenId });
    const result = await requestJson<unknown>("/api/onboarding/office-screens-v1", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) },
      body: JSON.stringify(update),
    });
    const parsed = GuidedTourScreenProgressSchema.safeParse(result);
    if (!parsed.success) throw new Error("A API não confirmou que esta orientação foi vista. Tente novamente.");
    setGuidedTourScreenIds(parsed.data.seenScreenIds);
  }, [guidedTour, guidedTourReady, session]);

  const post = useCallback(async <T,>(path: string, body: unknown): Promise<T> => {
    const result = await requestJson<{ item: T }>(path, {
      method: "POST", headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) }, body: JSON.stringify(body),
    });
    if (!result || !("item" in result)) throw new Error("A API não confirmou o registro. Atualize a lista para conferir.");
    return result.item;
  }, [session]);

  const patchItem = useCallback(async <T,>(path: string, body: unknown): Promise<T> => {
    try {
      const result = await requestJson<{ item: T }>(path, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) }, body: JSON.stringify(body),
      });
      if (!result || !("item" in result)) throw new Error("A API não confirmou a edição. Atualize a lista para conferir.");
      return result.item;
    } catch (error) {
      if (error instanceof WorkApiError && error.status === 409) await refresh();
      throw error;
    }
  }, [session, refresh]);

  const postVersionedAction = useCallback(async (path: string, body: Record<string, string>) => {
    try {
      await requestJson(path, { method: "POST", headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) }, body: JSON.stringify(body) });
    } catch (error) {
      if (error instanceof WorkApiError && error.status === 409) {
        await refresh();
        throw new Error("Esse registro mudou em outra tela. A lista foi atualizada; confira o estado antes de tentar novamente.");
      }
      throw error;
    }
    await refresh();
  }, [session, refresh]);

  const createMatter = useCallback(async (title: string, clientId: string | null) => {
    await post<MatterItem>("/api/matters", { title: title.trim(), clientId }); await refresh();
  }, [post, refresh]);
  const updateMatter = useCallback(async (id: string, title: string, clientId: string | null, expectedUpdatedAt: string) => {
    const current = matters.find((item) => item.id === id);
    if (!current || current.status === "archived") throw new Error("O assunto não está mais ativo. Atualize e tente novamente.");
    await patchItem<MatterItem>(`/api/matters/${encodeURIComponent(id)}`, { title: title.trim(), clientId, expectedUpdatedAt });
    await refresh();
  }, [matters, patchItem, refresh]);
  const setMatterStatus = useCallback(async (id: string, status: "active" | "archived", expectedUpdatedAt: string) => {
    const current = matters.find((item) => item.id === id);
    if (!current || current.updatedAt !== expectedUpdatedAt) throw new Error("O assunto mudou. Atualize a lista antes de alterar o status.");
    await postVersionedAction(`/api/matters/${encodeURIComponent(id)}/status`, { status, expectedUpdatedAt });
  }, [matters, postVersionedAction]);
  const createClient = useCallback(async (input: Pick<ClientItem, "displayName" | "email" | "phone">) => {
    await post<ClientItem>("/api/clients", { ...input, displayName: input.displayName.trim(), email: input.email?.trim() || null, phone: input.phone?.trim() || null }); await refresh();
  }, [post, refresh]);
  const updateClient = useCallback(async (id: string, input: Pick<ClientItem, "displayName" | "email" | "phone">, expectedUpdatedAt: string) => {
    const current = clients.find((item) => item.id === id);
    if (!current || current.status !== "active") throw new Error("O cliente não está mais ativo. Atualize e tente novamente.");
    await patchItem<ClientItem>(`/api/clients/${encodeURIComponent(id)}`, { ...input, displayName: input.displayName.trim(), email: input.email?.trim() || null, phone: input.phone?.trim() || null, expectedUpdatedAt });
    await refresh();
  }, [clients, patchItem, refresh]);
  const setClientStatus = useCallback(async (id: string, status: "active" | "archived", expectedUpdatedAt: string) => {
    const current = clients.find((item) => item.id === id);
    if (!current || current.updatedAt !== expectedUpdatedAt) throw new Error("O cliente mudou. Atualize a lista antes de alterar o status.");
    await postVersionedAction(`/api/clients/${encodeURIComponent(id)}/status`, { status, expectedUpdatedAt });
  }, [clients, postVersionedAction]);
  const createCourtCase = useCallback(async (input: Pick<CourtCaseItem, "matterId" | "courtName" | "jurisdiction" | "caseNumber" | "label">) => {
    await post<CourtCaseItem>("/api/court-cases", {
      ...input, courtName: input.courtName.trim(), jurisdiction: input.jurisdiction?.trim() || null,
      caseNumber: input.caseNumber?.trim() || null, label: input.label?.trim() || null,
    });
    await refresh();
  }, [post, refresh]);
  const updateCourtCase = useCallback(async (id: string, input: Pick<CourtCaseItem, "matterId" | "courtName" | "jurisdiction" | "caseNumber" | "label">, expectedUpdatedAt: string) => {
    const current = courtCases.find((item) => item.id === id);
    if (!current || current.status === "archived") throw new Error("O processo não está mais ativo. Atualize e tente novamente.");
    await patchItem<CourtCaseItem>(`/api/court-cases/${encodeURIComponent(id)}`, {
      ...input, courtName: input.courtName.trim(), jurisdiction: input.jurisdiction?.trim() || null,
      caseNumber: input.caseNumber?.trim() || null, label: input.label?.trim() || null,
      expectedUpdatedAt,
    });
    await refresh();
  }, [courtCases, patchItem, refresh]);
  const setCourtCaseStatus = useCallback(async (id: string, status: "active" | "archived", expectedUpdatedAt: string) => {
    const current = courtCases.find((item) => item.id === id);
    if (!current || current.updatedAt !== expectedUpdatedAt) throw new Error("O processo mudou. Atualize a lista antes de alterar o status.");
    await postVersionedAction(`/api/court-cases/${encodeURIComponent(id)}/status`, { status, expectedUpdatedAt });
  }, [courtCases, postVersionedAction]);
  const createTask = useCallback(async (title: string, matterId: string | null, scheduledOn: string | null) => {
    await post<TaskItem>("/api/tasks", { title: title.trim(), matterId, status: "todo", scheduledOn }); await refresh();
  }, [post, refresh]);
  const updateTask = useCallback(async (id: string, title: string, matterId: string | null, scheduledOn: string | null, expectedUpdatedAt: string) => {
    const current = tasks.find((item) => item.id === id);
    if (!current || (current.status !== "todo" && current.status !== "in_progress")) throw new Error("A tarefa não está mais aberta para edição. Atualize a lista.");
    await patchItem<TaskItem>(`/api/tasks/${encodeURIComponent(id)}`, { title: title.trim(), matterId, scheduledOn, expectedUpdatedAt });
    await refresh();
  }, [tasks, patchItem, refresh]);
  const setTaskStatus = useCallback(async (id: string, status: "todo" | "in_progress" | "done", expectedUpdatedAt: string) => {
    await postVersionedAction(`/api/tasks/${encodeURIComponent(id)}/status`, { status, expectedUpdatedAt });
  }, [postVersionedAction]);
  const createAppointment = useCallback(async (input: Pick<AppointmentItem, "title" | "startsAt" | "endsAt" | "timezone" | "location">) => {
    await post<AppointmentItem>("/api/appointments", { ...input, title: input.title.trim(), matterId: null, caseId: null, notes: null }); await refresh();
  }, [post, refresh]);
  const updateAppointment = useCallback(async (id: string, input: Pick<AppointmentItem, "title" | "startsAt" | "endsAt" | "location">, expectedUpdatedAt: string) => {
    const current = appointments.find((item) => item.id === id);
    if (!current || current.status !== "scheduled") throw new Error("O compromisso não está mais agendado para edição. Atualize a lista.");
    await patchItem<AppointmentItem>(`/api/appointments/${encodeURIComponent(id)}`, {
      ...input, title: input.title.trim(), location: input.location?.trim() || null, expectedUpdatedAt,
    });
    await refresh();
  }, [appointments, patchItem, refresh]);
  const cancelAppointment = useCallback(async (id: string, expectedUpdatedAt: string) => {
    await postVersionedAction(`/api/appointments/${encodeURIComponent(id)}/cancel`, { expectedUpdatedAt });
  }, [postVersionedAction]);
  const createFinancialEntry = useCallback(async (entry: Pick<FinancialItem, "description" | "amountCents" | "kind" | "dueOn" | "category">) => {
    await post<FinancialItem>("/api/financial-entries", { ...entry, description: entry.description.trim() }); await refresh();
  }, [post, refresh]);
  const updateFinancialEntry = useCallback(async (id: string, entry: FinancialEntryUpdate, expectedUpdatedAt: string) => {
    const current = financialEntries.find((item) => item.id === id);
    if (!current || current.status !== "planned") throw new Error("O lançamento não está mais previsto. Atualize e tente novamente.");
    await patchItem<FinancialItem>(`/api/financial-entries/${encodeURIComponent(id)}`, {
      ...entry, description: entry.description.trim(), expectedUpdatedAt,
    });
    await refresh();
  }, [financialEntries, patchItem, refresh]);
  const setFinancialStatus = useCallback(async (id: string, status: "planned" | "paid" | "cancelled", expectedUpdatedAt: string) => {
    await postVersionedAction(`/api/financial-entries/${encodeURIComponent(id)}/status`, { status, expectedUpdatedAt });
  }, [postVersionedAction]);
  const loadLegalResearches = useCallback(async (includeArchived = false) => {
    setLegalResearchesLoading(true);
    try {
      const status = includeArchived ? "archived" : "active";
      const parsed = LegalResearchListResponseSchema.parse(await requestJson<unknown>(`/api/legal-researches?status=${status}`, {
        headers: await authCookieHeaders(session),
      }));
      setLegalResearches(parsed.items);
      setLegalResearchesNextCursor(parsed.nextCursor);
      setLegalResearchesStatus(status);
    } finally { setLegalResearchesLoading(false); }
  }, [session]);
  const loadMoreLegalResearches = useCallback(async () => {
    if (!legalResearchesNextCursor || legalResearchesLoading) return;
    setLegalResearchesLoading(true);
    try {
      const parsed = LegalResearchListResponseSchema.parse(await requestJson<unknown>(
        `/api/legal-researches?status=${legalResearchesStatus}&cursor=${encodeURIComponent(legalResearchesNextCursor)}`,
        { headers: await authCookieHeaders(session) },
      ));
      setLegalResearches((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        parsed.items.forEach((item) => byId.set(item.id, item));
        return [...byId.values()];
      });
      setLegalResearchesNextCursor(parsed.nextCursor);
    } finally { setLegalResearchesLoading(false); }
  }, [legalResearchesNextCursor, legalResearchesLoading, legalResearchesStatus, session]);
  const createLegalResearch = useCallback(async (input: Pick<LegalResearchItem, "query" | "courtId">) => {
    await post<LegalResearchItem>("/api/legal-researches", { ...input, query: input.query.trim() }); await refresh();
  }, [post, refresh]);
  const updateLegalResearch = useCallback(async (id: string, input: Pick<LegalResearchItem, "query" | "courtId">, expectedUpdatedAt: string) => {
    const item = LegalResearchSchema.parse(await patchItem<unknown>(`/api/legal-researches/${encodeURIComponent(id)}`, { ...input, expectedUpdatedAt }));
    setLegalResearches((current) => current.map((candidate) => candidate.id === item.id ? item : candidate));
    await refresh();
  }, [patchItem, refresh]);
  const setLegalResearchStatus = useCallback(async (id: string, status: "active" | "archived", expectedUpdatedAt: string) => {
    const result = await post<LegalResearchItem>(`/api/legal-researches/${encodeURIComponent(id)}/status`, { status, expectedUpdatedAt });
    const item = LegalResearchSchema.parse(result);
    if ((item.archivedAt !== null) !== (status === "archived")) throw new Error("A API não confirmou a mudança da consulta salva.");
    await refresh();
  }, [post, refresh]);
  const createSocialContentDraft = useCallback(async (input: Pick<SocialContentDraftItem, "platform" | "topic" | "content">) => {
    const parsed = SocialContentDraftSchema.pick({ platform: true, topic: true, content: true }).parse(input);
    const item = SocialContentDraftSchema.parse(await post<unknown>("/api/social-drafts", parsed)); await refresh(); return item;
  }, [post, refresh]);
  const updateSocialContentDraft = useCallback(async (id: string, input: Pick<SocialContentDraftItem, "platform" | "topic" | "content">, expectedUpdatedAt: string) => {
    const parsed = SocialContentDraftSchema.pick({ platform: true, topic: true, content: true }).parse(input);
    const item = SocialContentDraftSchema.parse(await patchItem<unknown>(`/api/social-drafts/${encodeURIComponent(id)}`, { ...parsed, expectedUpdatedAt }));
    await refresh(); return item;
  }, [patchItem, refresh]);

  const loadIntegrationSettings = useCallback(async () => {
    const result = await requestJson<unknown>("/api/integrations", { headers: await authCookieHeaders(session) });
    return IntegrationSettingsSchema.parse(result);
  }, [session]);
  const loadMicrosoftDriveFiles = useCallback(async (parentId: string | null = null, pageToken: string | null = null) => {
    const params = new URLSearchParams();
    if (parentId) params.set("parentId", parentId);
    if (pageToken) params.set("pageToken", pageToken);
    const suffix = params.size ? `?${params.toString()}` : "";
    const result = await requestJson<unknown>(`/api/integrations/microsoft-graph/files${suffix}`, {
      headers: await authCookieHeaders(session),
    });
    return CloudDriveFilesResponseSchema.parse(result);
  }, [session]);
  const loadGooglePickerSession = useCallback(async () => {
    const result = await requestJson<unknown>("/api/integrations/google-drive/picker-session", {
      headers: await authCookieHeaders(session),
    });
    return GooglePickerSessionSchema.parse(result);
  }, [session]);
  const importCloudDriveFile = useCallback(async (provider: IntegrationProvider, fileId: string, caseId: string | null) => {
    const providerPath = provider === "google_drive" ? "google-drive" : "microsoft-graph";
    const result = await requestJson<{ item: unknown }>(`/api/integrations/${providerPath}/import`, {
      method: "POST", headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) },
      body: JSON.stringify({ fileId, caseId }),
    });
    return DocumentFileSchema.parse(result.item);
  }, [session]);
  const saveIntegrationSettings = useCallback(async (input: IntegrationSettingsUpdate) => {
    const providerPath = input.provider === "google_drive" ? "google-drive" : "microsoft-graph";
    const result = await requestJson<{ item: unknown }>(`/api/integrations/${providerPath}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) }, body: JSON.stringify(input),
    });
    return IntegrationProviderSettingsSchema.parse(result.item);
  }, [session]);
  const clearIntegrationSettings = useCallback(async (provider: IntegrationProvider) => {
    const providerPath = provider === "google_drive" ? "google-drive" : "microsoft-graph";
    const result = await requestJson<{ item: unknown }>(`/api/integrations/${providerPath}/clear`, {
      method: "POST", headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) }, body: "{}",
    });
    IntegrationProviderSettingsSchema.parse(result.item);
  }, [session]);
  const startIntegrationConnection = useCallback(async (provider: IntegrationProvider) => {
    const providerPath = provider === "google_drive" ? "google-drive" : "microsoft-graph";
    const result = await requestJson<unknown>(`/api/integrations/${providerPath}/connect`, {
      method: "POST", headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) },
      body: JSON.stringify({ platform: Platform.OS === "web" ? "web" : "native" }),
    });
    return IntegrationAuthorizationResponseSchema.parse(result).authorizationUrl;
  }, [session]);
  const disconnectIntegration = useCallback(async (provider: IntegrationProvider) => {
    const providerPath = provider === "google_drive" ? "google-drive" : "microsoft-graph";
    return requestJson<{ disconnected: boolean; providerRevocation: "confirmed" | "not_confirmed" | "not_supported" }>(`/api/integrations/${providerPath}/disconnect`, {
      method: "POST", headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) }, body: "{}",
    });
  }, [session]);

  const loadCourtPublications = useCallback(async (caseId: string) => {
    const result = await requestJson<unknown>(`/api/court-cases/${encodeURIComponent(caseId)}/publications`, {
      headers: await authCookieHeaders(session),
    });
    return CourtPublicationsResponseSchema.parse(result);
  }, [session]);
  const discoverCourtCases = useCallback(async (query: z.infer<typeof DjenDiscoveryRequestSchema>) => {
    const result = await requestJson<unknown>("/api/court-cases/discover-djen", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) },
      body: JSON.stringify(query),
    });
    return DjenDiscoveryResponseSchema.parse(result);
  }, [session]);
  const syncCourtPublications = useCallback(async (caseId: string) => {
    const result = await requestJson<unknown>(`/api/court-cases/${encodeURIComponent(caseId)}/publications/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) },
      body: "{}",
    });
    return CourtPublicationsResponseSchema.parse(result);
  }, [session]);
  const setCourtPublicationReview = useCallback(async (
    caseId: string,
    sourceHash: string,
    status: "pending" | "reviewed",
    expectedUpdatedAt: string | null,
  ) => {
    const result = await requestJson<unknown>(`/api/court-cases/${encodeURIComponent(caseId)}/publications/${encodeURIComponent(sourceHash)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) },
      body: JSON.stringify({ status, expectedUpdatedAt }),
    });
    return CourtPublicationReviewStateSchema.parse(result);
  }, [session]);
  const loadCourtCaseNotes = useCallback(async (caseId: string) => {
    const result = await requestJson<unknown>(`/api/court-cases/${encodeURIComponent(caseId)}/notes`, {
      headers: await authCookieHeaders(session),
    });
    return CourtCaseNotesResponseSchema.parse(result);
  }, [session]);
  const createCourtCaseNote = useCallback(async (caseId: string, body: string) => {
    const item = await post<unknown>(`/api/court-cases/${encodeURIComponent(caseId)}/notes`, { body: body.trim() });
    CourtCaseNoteSchema.parse(item);
  }, [post]);

  const loadDocuments = useCallback(async (includeArchived = false) => {
    const result = await requestJson<unknown>(`/api/documents${includeArchived ? "?includeArchived=true" : ""}`, {
      headers: await authCookieHeaders(session),
    });
    return DocumentsResponseSchema.parse(result);
  }, [session]);

  const loadDocumentSigningRecords = useCallback(async (documentId: string) => {
    const result = await requestJson<unknown>(`/api/documents/${encodeURIComponent(documentId)}/signatures`, {
      headers: await authCookieHeaders(session),
    });
    return DocumentSigningReceiptsResponseSchema.parse(result);
  }, [session]);

  const createDocumentSigningRecord = useCallback(async (documentId: string, confirmName: string) => {
    const input = DocumentSigningCreateSchema.parse({ consentAccepted: true, consentVersion: DocumentConsentVersion, confirmName });
    const result = await requestJson<unknown>(`/api/documents/${encodeURIComponent(documentId)}/signatures`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) },
      body: JSON.stringify(input),
    });
    const response = result as { item?: unknown };
    return DocumentSigningReceiptSchema.parse(response?.item);
  }, [session]);

  const uploadDocument = useCallback(async (asset: PickedDocument, displayName: string, caseId: string | null) => {
    if (!apiBaseUrl) throw new Error("A API não está configurada para receber documentos.");
    const body = new FormData();
    let filePart: Blob;
    if (Platform.OS === "web") {
      if (asset.file) filePart = asset.file;
      else {
        const fileResponse = await fetch(asset.uri);
        if (!fileResponse.ok) throw new Error("Não foi possível ler o PDF escolhido neste navegador.");
        filePart = await fileResponse.blob();
      }
    } else {
      filePart = { uri: asset.uri, name: asset.name, type: asset.mimeType || "application/pdf" } as unknown as Blob;
    }
    body.append("file", filePart, asset.name);
    if (displayName.trim()) body.append("fileName", displayName.trim());
    if (caseId) body.append("caseId", caseId);

    const response = await fetch(`${apiBaseUrl}/api/documents`, {
      ...requestInit,
      method: "POST",
      credentials: "include",
      headers: await authCookieHeaders(session),
      body,
    });
    if (!response.ok) {
      await throwIfMaintenanceResponse(response);
      if (response.status === 401 || response.status === 403) throw new WorkApiError(response.status, "Sua sessão expirou ou não tem acesso a este escritório. Entre novamente.");
      if (response.status === 413) throw new WorkApiError(413, "O PDF excede o limite de 10 MB.");
      await throwIfRateLimitError(response);
      const failure = await response.json().catch(() => null) as { error?: string } | null;
      if (failure?.error === "document_vault_not_configured") throw new WorkApiError(503, "O cofre de documentos ainda não foi configurado com uma chave segura neste ambiente.");
      if (failure?.error === "case_not_found_or_archived") throw new WorkApiError(404, "O processo selecionado não está ativo. Atualize a lista e tente novamente.");
      if (failure?.error?.startsWith("pdf_") || failure?.error === "pdf_file_required") throw new WorkApiError(response.status, "Selecione um arquivo PDF válido.");
      if (response.status >= 500) throw new WorkApiError(response.status, "Não foi possível enviar o documento agora. Tente novamente.");
      throw new WorkApiError(response.status, "Não foi possível enviar esse arquivo. Confira se é um PDF e tente novamente.");
    }
    const result = await response.json() as { item?: unknown };
    return DocumentFileSchema.parse(result.item);
  }, [session]);

  const setDocumentStatus = useCallback(async (documentId: string, status: "ready" | "archived", expectedUpdatedAt: string) => {
    return DocumentStatusResponseSchema.parse(await requestJson<unknown>(`/api/documents/${encodeURIComponent(documentId)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) },
      body: JSON.stringify({ status, expectedUpdatedAt }),
    }));
  }, [session]);

  const downloadDocument = useCallback(async (documentId: string) => {
    if (!apiBaseUrl) throw new Error("A API não está configurada para baixar documentos.");
    const response = await fetch(`${apiBaseUrl}/api/documents/${encodeURIComponent(documentId)}/download`, {
      ...requestInit,
      credentials: "include",
      headers: await authCookieHeaders(session),
    });
    if (!response.ok) {
      await throwIfMaintenanceResponse(response);
      if (response.status === 401 || response.status === 403) throw new WorkApiError(response.status, "Sua sessão expirou ou não tem acesso a este escritório. Entre novamente.");
      if (response.status === 404) throw new WorkApiError(404, "Esse documento não está mais disponível neste escritório.");
      if (response.status >= 500) throw new WorkApiError(response.status, "Não foi possível baixar o documento agora. Tente novamente.");
      throw new WorkApiError(response.status, "Não foi possível baixar este documento.");
    }
    return response.arrayBuffer();
  }, [session]);

  const exportOfficeData = useCallback(async () => {
    if (!apiBaseUrl) throw new Error("A API não está configurada para exportar os dados.");
    const response = await fetch(`${apiBaseUrl}/api/data-export`, {
      ...requestInit,
      method: "POST",
      headers: { ...requestInit.headers, "Content-Type": "application/json", ...await authCookieHeaders(session) },
      body: JSON.stringify({ acknowledgeSensitiveData: true, formatVersion: 1 }),
    });
    if (!response.ok) {
      await throwIfMaintenanceResponse(response);
      const failure = await response.json().catch(() => null) as { error?: string; retryAfterSeconds?: number } | null;
      if (response.status === 401) throw new WorkApiError(401, "Sua sessão terminou. Entre novamente e tente exportar.");
      if (failure?.error === "recent_login_required") throw new WorkApiError(403, "Para proteger esses dados, saia da conta e entre novamente antes de exportar.");
      if (failure?.error === "owner_required") throw new WorkApiError(403, "Somente a pessoa responsável pelo escritório pode exportar os dados.");
      if (failure?.error === "export_too_large") throw new WorkApiError(413, "O volume passou do limite desta exportação. Não foi criado arquivo; será necessário um procedimento administrativo de exportação.");
      if (response.status === 429) throw new WorkApiError(429, `Limite de exportação atingido. Tente novamente em ${failure?.retryAfterSeconds ?? 3600} segundos.`);
      if (failure?.error === "export_unavailable" || response.status >= 500) throw new WorkApiError(response.status, "Não foi possível preparar a exportação agora. Tente novamente mais tarde.");
      throw new WorkApiError(response.status, "Não foi possível exportar os dados deste escritório.");
    }
    return response.text();
  }, [session]);

  const value = useMemo(() => ({ sessionInfo, guidedTour, guidedTourReady, guidedTourScreenIds, guidedTourScreenProgressReady, saveGuidedTourProgress, replayGuidedTour, markGuidedTourScreenSeen, clients, matters, courtCases, courtCasesLoading, courtCasesNextCursor, courtCasesIssue, loadMoreCourtCases, tasks, appointments, financialEntries, legalResearches, legalResearchesLoading, legalResearchesNextCursor, loadLegalResearches, loadMoreLegalResearches, socialContentDrafts, loading, issue, refresh, createMatter, updateMatter, setMatterStatus, createClient, updateClient, setClientStatus, createCourtCase, updateCourtCase, setCourtCaseStatus, createTask, updateTask, setTaskStatus, createAppointment, updateAppointment, cancelAppointment, createFinancialEntry, updateFinancialEntry, setFinancialStatus, createLegalResearch, updateLegalResearch, setLegalResearchStatus, createSocialContentDraft, updateSocialContentDraft, loadIntegrationSettings, loadMicrosoftDriveFiles, loadGooglePickerSession, importCloudDriveFile, saveIntegrationSettings, clearIntegrationSettings, startIntegrationConnection, disconnectIntegration, discoverCourtCases, loadCourtPublications, syncCourtPublications, setCourtPublicationReview, loadCourtCaseNotes, createCourtCaseNote, loadDocuments, loadDocumentSigningRecords, createDocumentSigningRecord, uploadDocument, setDocumentStatus, downloadDocument, exportOfficeData }),
    [sessionInfo, guidedTour, guidedTourReady, guidedTourScreenIds, guidedTourScreenProgressReady, saveGuidedTourProgress, replayGuidedTour, markGuidedTourScreenSeen, clients, matters, courtCases, courtCasesLoading, courtCasesNextCursor, courtCasesIssue, loadMoreCourtCases, tasks, appointments, financialEntries, legalResearches, legalResearchesLoading, legalResearchesNextCursor, loadLegalResearches, loadMoreLegalResearches, socialContentDrafts, loading, issue, refresh, createMatter, updateMatter, setMatterStatus, createClient, updateClient, setClientStatus, createCourtCase, updateCourtCase, setCourtCaseStatus, createTask, updateTask, setTaskStatus, createAppointment, updateAppointment, cancelAppointment, createFinancialEntry, updateFinancialEntry, setFinancialStatus, createLegalResearch, updateLegalResearch, setLegalResearchStatus, createSocialContentDraft, updateSocialContentDraft, loadIntegrationSettings, loadMicrosoftDriveFiles, loadGooglePickerSession, importCloudDriveFile, saveIntegrationSettings, clearIntegrationSettings, startIntegrationConnection, disconnectIntegration, discoverCourtCases, loadCourtPublications, syncCourtPublications, setCourtPublicationReview, loadCourtCaseNotes, createCourtCaseNote, loadDocuments, loadDocumentSigningRecords, createDocumentSigningRecord, uploadDocument, setDocumentStatus, downloadDocument, exportOfficeData]);
  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>;
}

export function useWorkData() {
  const value = useContext(WorkContext);
  if (!value) throw new Error("useWorkData precisa de WorkDataProvider");
  return value;
}
