import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Platform } from "react-native";
import { apiBaseUrl, authClient, type AuthSession } from "@/auth-client";
import { useAuth } from "@/auth";

type SessionInfo = { user: Record<string, unknown>; tenant: { id: string; role: string } };
export type MatterItem = { id: string; title: string; status?: string; description?: string };
export type CourtCaseItem = { id: string; matterId?: string | null; courtName: string; jurisdiction?: string | null; caseNumber?: string | null; label?: string | null; status?: string };
export type TaskItem = { id: string; title: string; status?: string; matterId?: string | null; scheduledFor?: string | null };
export type AppointmentItem = { id: string; title: string; startsAt: string; endsAt: string; timezone: string; location?: string | null; status?: "scheduled" | "cancelled" };
export type FinancialItem = { id: string; description: string; amountCents: number; currency?: string; kind: "income" | "expense"; status?: "planned" | "paid" | "cancelled"; dueOn?: string | null };
export type LegalResearchItem = { id: string; query: string; courtId: "TJPR" | "TJSC" | "TJRS" | "TRF4" | "STJ" | "STF"; sourceUrl: string; createdAt: string };
type ListResponse<T> = { items: T[] };
type WorkContextValue = {
  sessionInfo: SessionInfo | null;
  matters: MatterItem[];
  courtCases: CourtCaseItem[];
  tasks: TaskItem[];
  appointments: AppointmentItem[];
  financialEntries: FinancialItem[];
  legalResearches: LegalResearchItem[];
  loading: boolean;
  issue: string | null;
  refresh: () => Promise<void>;
  createMatter: (title: string) => Promise<void>;
  createCourtCase: (input: Pick<CourtCaseItem, "matterId" | "courtName" | "jurisdiction" | "caseNumber" | "label">) => Promise<void>;
  createTask: (title: string) => Promise<void>;
  setTaskStatus: (id: string, status: "todo" | "in_progress" | "done") => Promise<void>;
  createAppointment: (input: Pick<AppointmentItem, "title" | "startsAt" | "endsAt" | "timezone" | "location">) => Promise<void>;
  cancelAppointment: (id: string) => Promise<void>;
  createFinancialEntry: (entry: Pick<FinancialItem, "description" | "amountCents" | "kind" | "dueOn">) => Promise<void>;
  setFinancialStatus: (id: string, status: "planned" | "paid" | "cancelled") => Promise<void>;
  createLegalResearch: (input: Pick<LegalResearchItem, "query" | "courtId">) => Promise<void>;
};

const WorkContext = createContext<WorkContextValue | null>(null);
const requestInit = { credentials: "include" as const, headers: { Accept: "application/json" } };

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiBaseUrl) throw new Error("A API não está configurada. Defina EXPO_PUBLIC_API_URL para carregar ou salvar dados.");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...requestInit,
    ...init,
    credentials: "include",
    headers: { ...requestInit.headers, ...init?.headers },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("Sua sessão expirou ou não tem acesso ao escritório. Entre novamente.");
    if (response.status >= 500) throw new Error("A API está indisponível no momento. Tente novamente.");
    throw new Error("A API não aceitou a solicitação. Confira os campos e tente novamente.");
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
  const [matters, setMatters] = useState<MatterItem[]>([]);
  const [courtCases, setCourtCases] = useState<CourtCaseItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [financialEntries, setFinancialEntries] = useState<FinancialItem[]>([]);
  const [legalResearches, setLegalResearches] = useState<LegalResearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) {
      setSessionInfo(null); setMatters([]); setCourtCases([]); setTasks([]); setAppointments([]); setFinancialEntries([]); setLegalResearches([]); setIssue(null); setLoading(false);
      return;
    }
    setLoading(true); setIssue(null); setSessionInfo(null); setMatters([]); setCourtCases([]); setTasks([]); setAppointments([]); setFinancialEntries([]); setLegalResearches([]);
    try {
      const cookieHeaders = await authCookieHeaders(session);
      const info = await requestJson<unknown>("/api/session", { headers: cookieHeaders });
      if (!isSessionInfo(info)) throw new Error("A sessão da API não informou usuário e escritório. Nenhum dado foi carregado.");
      setSessionInfo(info);
      const [mattersResult, casesResult, tasksResult, appointmentsResult, financialResult, researchResult] = await Promise.all([
        requestJson<unknown>("/api/matters", { headers: cookieHeaders }), requestJson<unknown>("/api/court-cases", { headers: cookieHeaders }),
        requestJson<unknown>("/api/tasks", { headers: cookieHeaders }), requestJson<unknown>("/api/appointments", { headers: cookieHeaders }),
        requestJson<unknown>("/api/financial-entries", { headers: cookieHeaders }), requestJson<unknown>("/api/legal-researches", { headers: cookieHeaders }),
      ]);
      if (!isList<MatterItem>(mattersResult) || !isList<CourtCaseItem>(casesResult) || !isList<TaskItem>(tasksResult) || !isList<AppointmentItem>(appointmentsResult) || !isList<FinancialItem>(financialResult) || !isList<LegalResearchItem>(researchResult)) {
        throw new Error("A API retornou uma lista em formato inesperado. Os dados não foram exibidos.");
      }
      setMatters(mattersResult.items); setCourtCases(casesResult.items); setTasks(tasksResult.items); setAppointments(appointmentsResult.items);
      setFinancialEntries(financialResult.items); setLegalResearches(researchResult.items);
    } catch (error) {
      setSessionInfo(null); setMatters([]); setCourtCases([]); setTasks([]); setAppointments([]); setFinancialEntries([]); setLegalResearches([]);
      setIssue(error instanceof TypeError ? "Sem conexão com a API. Confira a internet e tente novamente." : error instanceof Error ? error.message : "Não foi possível carregar os dados.");
    } finally { setLoading(false); }
  }, [session]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const post = useCallback(async <T,>(path: string, body: unknown): Promise<T> => {
    const result = await requestJson<{ item: T }>(path, {
      method: "POST", headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) }, body: JSON.stringify(body),
    });
    if (!result || !("item" in result)) throw new Error("A API não confirmou o registro. Atualize a lista para conferir.");
    return result.item;
  }, [session]);

  const createMatter = useCallback(async (title: string) => {
    await post<MatterItem>("/api/matters", { title: title.trim() }); await refresh();
  }, [post, refresh]);
  const createCourtCase = useCallback(async (input: Pick<CourtCaseItem, "matterId" | "courtName" | "jurisdiction" | "caseNumber" | "label">) => {
    await post<CourtCaseItem>("/api/court-cases", {
      ...input, courtName: input.courtName.trim(), jurisdiction: input.jurisdiction?.trim() || null,
      caseNumber: input.caseNumber?.trim() || null, label: input.label?.trim() || null,
    });
    await refresh();
  }, [post, refresh]);
  const createTask = useCallback(async (title: string) => {
    await post<TaskItem>("/api/tasks", { title: title.trim(), matterId: null, status: "todo", scheduledFor: null }); await refresh();
  }, [post, refresh]);
  const changeStatus = useCallback(async (path: string, status: string) => {
    await requestJson(path, { method: "POST", headers: { "Content-Type": "application/json", ...await authCookieHeaders(session) }, body: JSON.stringify({ status }) });
    await refresh();
  }, [session, refresh]);
  const setTaskStatus = useCallback(async (id: string, status: "todo" | "in_progress" | "done") => {
    await changeStatus(`/api/tasks/${encodeURIComponent(id)}/status`, status);
  }, [changeStatus]);
  const createAppointment = useCallback(async (input: Pick<AppointmentItem, "title" | "startsAt" | "endsAt" | "timezone" | "location">) => {
    await post<AppointmentItem>("/api/appointments", { ...input, title: input.title.trim(), matterId: null, caseId: null, notes: null }); await refresh();
  }, [post, refresh]);
  const cancelAppointment = useCallback(async (id: string) => {
    await requestJson(`/api/appointments/${encodeURIComponent(id)}/cancel`, { method: "POST", headers: await authCookieHeaders(session) }); await refresh();
  }, [session, refresh]);
  const createFinancialEntry = useCallback(async (entry: Pick<FinancialItem, "description" | "amountCents" | "kind" | "dueOn">) => {
    await post<FinancialItem>("/api/financial-entries", { ...entry, description: entry.description.trim() }); await refresh();
  }, [post, refresh]);
  const setFinancialStatus = useCallback(async (id: string, status: "planned" | "paid" | "cancelled") => {
    await changeStatus(`/api/financial-entries/${encodeURIComponent(id)}/status`, status);
  }, [changeStatus]);
  const createLegalResearch = useCallback(async (input: Pick<LegalResearchItem, "query" | "courtId">) => {
    await post<LegalResearchItem>("/api/legal-researches", { ...input, query: input.query.trim() }); await refresh();
  }, [post, refresh]);

  const value = useMemo(() => ({ sessionInfo, matters, courtCases, tasks, appointments, financialEntries, legalResearches, loading, issue, refresh, createMatter, createCourtCase, createTask, setTaskStatus, createAppointment, cancelAppointment, createFinancialEntry, setFinancialStatus, createLegalResearch }),
    [sessionInfo, matters, courtCases, tasks, appointments, financialEntries, legalResearches, loading, issue, refresh, createMatter, createCourtCase, createTask, setTaskStatus, createAppointment, cancelAppointment, createFinancialEntry, setFinancialStatus, createLegalResearch]);
  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>;
}

export function useWorkData() {
  const value = useContext(WorkContext);
  if (!value) throw new Error("useWorkData precisa de WorkDataProvider");
  return value;
}
