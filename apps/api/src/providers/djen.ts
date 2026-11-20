import { isValidCnjCaseNumber } from "../../../../packages/contracts/src/index";

export type DjenPublication = {
  sourceHash: string;
  tribunalCode: string | null;
  communicationType: string | null;
  availableOn: string | null;
};

export type DjenEnvironment = "homologation" | "production";

export class DjenProviderError extends Error {
  constructor(
    readonly code: "rate_limited" | "source_unavailable" | "invalid_response",
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
    this.name = "DjenProviderError";
  }
}

const hosts: Record<DjenEnvironment, string> = {
  homologation: "https://hcomunicaapi.cnj.jus.br/api/v1/comunicacao",
  production: "https://comunicaapi.pje.jus.br/api/v1/comunicacao",
};
const publicationHashPattern = /^[A-Za-z0-9_-]{12,128}$/;
const maximumResponseBytes = 1_048_576;
const maximumPageItems = 100;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonEmptyString(record: Record<string, unknown>, key: string, maxLength: number): string | null {
  const value = record[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function normalizedProcessNumber(value: string): string {
  return value.replace(/\D/g, "");
}

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  const isoDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?$/;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) && !isoDateTimePattern.test(value)) {
    throw new DjenProviderError("invalid_response");
  }
  const candidate = value.slice(0, 10);
  const date = new Date(`${candidate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== candidate) {
    throw new DjenProviderError("invalid_response");
  }
  if (value.length > 10 && !Number.isFinite(Date.parse(value))) throw new DjenProviderError("invalid_response");
  return candidate;
}

function aliasedString(
  record: Record<string, unknown>,
  keys: readonly string[],
  maxLength: number,
  normalize: (value: string) => string = (value) => value,
): string | null {
  const values = keys.flatMap((key) => {
    if (!Object.prototype.hasOwnProperty.call(record, key)) return [];
    const value = record[key];
    if (typeof value !== "string") throw new DjenProviderError("invalid_response");
    const normalized = value.trim();
    if (normalized.length === 0 || normalized.length > maxLength) throw new DjenProviderError("invalid_response");
    return [normalized];
  });
  if (values.length === 0) return null;
  if (values.some((value) => normalize(value) !== normalize(values[0]!))) {
    throw new DjenProviderError("invalid_response");
  }
  return values[0]!;
}

function aliasedDate(record: Record<string, unknown>, keys: readonly string[], maxLength: number): string | null {
  const presentKeys = keys.filter((key) => Object.prototype.hasOwnProperty.call(record, key));
  if (presentKeys.length > 0) {
    const values = presentKeys.map((key) => record[key]);
    if (values.every((value) => value === null)) return null;
    if (values.some((value) => value === null)) throw new DjenProviderError("invalid_response");
  }
  const raw = aliasedString(record, keys, maxLength, (value) => dateOnly(value) ?? "");
  return dateOnly(raw);
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maximumResponseBytes) {
    throw new DjenProviderError("invalid_response");
  }
  if (!response.body) throw new DjenProviderError("invalid_response");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalLength += value.byteLength;
      if (totalLength > maximumResponseBytes) {
        await reader.cancel();
        throw new DjenProviderError("invalid_response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new DjenProviderError("invalid_response");
  }
}

function retryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(3600, Math.max(1, Math.ceil(seconds)));
  const date = Date.parse(header);
  if (!Number.isFinite(date)) return null;
  return Math.min(3600, Math.max(1, Math.ceil((date - Date.now()) / 1000)));
}

function parsePublication(value: unknown, expectedProcessNumber: string): DjenPublication {
  const item = asRecord(value);
  if (!item) throw new DjenProviderError("invalid_response");

  const sourceHash = nonEmptyString(item, "hash", 128);
  if (!sourceHash || !publicationHashPattern.test(sourceHash)) throw new DjenProviderError("invalid_response");

  const processNumber = aliasedString(item, ["numero_processo", "numeroProcesso"], 80, normalizedProcessNumber);
  if (!processNumber || normalizedProcessNumber(processNumber) !== expectedProcessNumber) {
    throw new DjenProviderError("invalid_response");
  }

  const availableOn = aliasedDate(item, ["data_disponibilizacao", "dataDisponibilizacao"], 64);
  const tribunalCode = nonEmptyString(item, "siglaTribunal", 24);
  const communicationType = nonEmptyString(item, "tipoComunicacao", 120);
  return {
    sourceHash,
    tribunalCode,
    communicationType,
    availableOn,
  };
}

async function fetchDjenPage(url: URL, fetcher: typeof fetch) {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    });
  } catch {
    throw new DjenProviderError("source_unavailable");
  }

  if (response.status === 429) {
    throw new DjenProviderError("rate_limited", retryAfterSeconds(response));
  }
  if (!response.ok) throw new DjenProviderError("source_unavailable");
  const payload = asRecord(await readLimitedJson(response));
  if (!payload || !Array.isArray(payload.items) || payload.items.length > maximumPageItems) {
    throw new DjenProviderError("invalid_response");
  }

  const remainingHeaderValue = response.headers.get("X-RateLimit-Remaining");
  const remainingHeader = remainingHeaderValue !== null && /^\d+$/.test(remainingHeaderValue.trim())
    ? Number(remainingHeaderValue)
    : Number.NaN;
  const remainingRequests = Number.isSafeInteger(remainingHeader) ? remainingHeader : null;
  return { items: payload.items, count: payload.count, status: payload.status, remainingRequests };
}

export async function fetchDjenPublications(
  processNumber: string,
  environment: DjenEnvironment,
  fetcher: typeof fetch = fetch,
): Promise<{ items: DjenPublication[]; remainingRequests: number | null }> {
  const digits = normalizedProcessNumber(processNumber);
  if (digits.length !== 20) throw new DjenProviderError("invalid_response");

  const url = new URL(hosts[environment]);
  url.searchParams.set("numeroProcesso", digits);
  const result = await fetchDjenPage(url, fetcher);
  return { items: result.items.map((item) => parsePublication(item, digits)), remainingRequests: result.remainingRequests };
}

export async function discoverDjenCases(
  query: { oabNumber: string; oabState: string; startDate: string; endDate: string; page: number },
  environment: DjenEnvironment,
  fetcher: typeof fetch = fetch,
) {
  const pageSize = 5;
  const number = query.oabNumber.replace(/^0+/, "");
  const url = new URL(hosts[environment]);
  url.search = new URLSearchParams({
    numeroOab: number,
    ufOab: query.oabState,
    dataDisponibilizacaoInicio: query.startDate,
    dataDisponibilizacaoFim: query.endDate,
    pagina: String(query.page),
    itensPorPagina: String(pageSize),
  }).toString();

  const result = await fetchDjenPage(url, fetcher);
  if (result.status !== "success" || result.items.length > pageSize) throw new DjenProviderError("invalid_response");
  const sourceCount = typeof result.count === "number" && Number.isSafeInteger(result.count) && result.count >= 0 ? result.count : null;
  const cases = new Map<string, { caseNumber: string; tribunalCode: string; availableOn: string }>();
  let omittedCount = 0;
  for (const value of result.items) {
    const item = asRecord(value);
    const candidate = item && projectDjenDiscoveryItem(item, query, number);
    if (!candidate) {
      omittedCount++;
      continue;
    }
    const previous = cases.get(candidate.caseNumber);
    if (!previous || candidate.availableOn > previous.availableOn) cases.set(candidate.caseNumber, candidate);
  }
  return {
    sourceCount,
    returnedCount: result.items.length,
    omittedCount,
    hasMore: result.items.length === pageSize && (sourceCount === null || sourceCount > query.page * pageSize),
    items: [...cases.values()],
    remainingRequests: result.remainingRequests,
  };
}

function projectDjenDiscoveryItem(
  item: Record<string, unknown>,
  query: { oabState: string; startDate: string; endDate: string },
  number: string,
) {
  if (item.ativo !== true || item.sigiloso === true || item.segredoJustica === true || item.segredo_justica === true) return null;
  if (!Array.isArray(item.destinatarios) || !item.destinatarios.length || item.destinatarios.some((recipient) => {
    const name = asRecord(recipient)?.nome;
    return typeof name !== "string" || !name.trim() || /\bsigilo\b|\bsigiloso\b|segredo de justi[cç]a/i.test(name);
  })) return null;
  if (!Array.isArray(item.destinatarioadvogados) || !item.destinatarioadvogados.some((entry) => {
    const lawyer = asRecord(asRecord(entry)?.advogado);
    return typeof lawyer?.numero_oab === "string" && lawyer.numero_oab.trim().replace(/^0+/, "") === number
      && lawyer.uf_oab === query.oabState;
  })) return null;

  const processNumber = aliasedString(item, ["numero_processo", "numeroProcesso"], 80, normalizedProcessNumber);
  const caseNumber = processNumber && isValidCnjCaseNumber(processNumber) ? normalizedProcessNumber(processNumber) : null;
  const availableOn = aliasedDate(item, ["data_disponibilizacao", "dataDisponibilizacao"], 64);
  const tribunalCode = nonEmptyString(item, "siglaTribunal", 12);
  if (!caseNumber || !availableOn || availableOn < query.startDate || availableOn > query.endDate
    || !tribunalCode || !/^[A-Z0-9]{2,12}$/.test(tribunalCode)) return null;
  return { caseNumber, tribunalCode, availableOn };
}

export function djenCertificateUrl(sourceHash: string, environment: DjenEnvironment): string {
  if (!publicationHashPattern.test(sourceHash)) throw new Error("Invalid DJEN communication hash");
  const host = hosts[environment].replace(/\/api\/v1\/comunicacao$/, "");
  return `${host}/api/v1/comunicacao/${encodeURIComponent(sourceHash)}/certidao`;
}
