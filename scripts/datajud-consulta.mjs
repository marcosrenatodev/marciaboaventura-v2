import { readFile } from "node:fs/promises";
import { isValidCnjCaseNumber } from "../packages/contracts/src/index.ts";

const keyPage = "https://datajud-wiki.cnj.jus.br/api-publica/acesso/";
const keyFile = new URL("../.local/datajud-public-key", import.meta.url);
const tribunals = new Map([
  ["816", "tjpr"],
  ["821", "tjrs"],
  ["824", "tjsc"],
  ["404", "trf4"],
]);
const usage = 'Uso: pnpm datajud:consulta "NÚMERO_CNJ" (TJPR, TJSC, TJRS ou TRF4).';

async function publicApiKey() {
  const saved = await readFile(keyFile, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw new Error("Não foi possível ler .local/datajud-public-key.");
  });
  if (saved.trim()) {
    if (!/^[A-Za-z0-9+/_-]{24,}={0,2}$/.test(saved.trim())) {
      throw new Error("A chave em .local/datajud-public-key está em formato inválido. Salve só o valor publicado pelo CNJ.");
    }
    return saved.trim();
  }

  const response = await fetch(keyPage, { signal: AbortSignal.timeout(10_000) });
  if (response.ok) {
    const text = (await response.text()).replace(/<[^>]*>/g, " ");
    const matches = [...text.matchAll(/Authorization:\s*APIKey\s+([A-Za-z0-9+/_-]{24,}={0,2})/gi)];
    const keys = [...new Set(matches.map((match) => match[1]))];
    if (keys.length === 1) return keys[0];
  }
  throw new Error("Não foi possível obter a chave na Wiki do CNJ. Salve a chave pública atual em .local/datajud-public-key.");
}

async function main(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(usage);
    return;
  }
  if (args.length !== 1 || !isValidCnjCaseNumber(args[0])) {
    throw new Error(`Informe um número CNJ válido de 20 dígitos, com ou sem pontuação. ${usage}`);
  }

  const number = args[0].replace(/\D/g, "");
  const tribunal = tribunals.get(number.slice(13, 16));
  if (!tribunal) throw new Error(`Tribunal fora do escopo desta consulta. ${usage}`);

  const key = await publicApiKey();
  const response = await fetch(`https://api-publica.datajud.cnj.jus.br/api_publica_${tribunal}/_search`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `APIKey ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      size: 10,
      _source: ["numeroProcesso", "grau", "classe.nome", "dataHoraUltimaAtualizacao", "movimentos.codigo", "movimentos.nome", "movimentos.dataHora"],
      query: { match: { numeroProcesso: number } },
    }),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(`DataJud retornou HTTP ${response.status}. Confira a chave pública vigente do CNJ e o acesso à API.`);
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after")?.trim() ?? "";
    const seconds = /^\d+$/.test(retryAfter)
      ? Number(retryAfter)
      : Math.max(0, Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000));
    const guidance = Number.isSafeInteger(seconds)
      ? `O servidor pede uma espera de ${seconds} segundos antes de repetir a consulta.`
      : "O servidor não informou um prazo de espera utilizável. Aguarde e tente uma única vez mais tarde.";
    throw new Error(`DataJud limitou as consultas ao ${tribunal.toUpperCase()} (HTTP 429). ${guidance}`);
  }
  if (!response.ok) throw new Error(`DataJud retornou HTTP ${response.status}.`);

  const result = await response.json().catch(() => null);
  if (!Array.isArray(result?.hits?.hits)) throw new Error("DataJud retornou um formato inesperado.");
  if (result.timed_out || result._shards?.failed > 0) throw new Error("DataJud devolveu uma resposta parcial. Tente novamente mais tarde.");
  const records = result.hits.hits.map((hit) => hit?._source).filter((source) => source?.numeroProcesso === number);
  console.log(JSON.stringify({
    fonte: "API Pública do DataJud (CNJ)",
    tribunal: tribunal.toUpperCase(),
    consultadoEm: new Date().toISOString(),
    status: records.length ? "encontrado" : "sem_resultado_exato",
    registros: records.map((source) => ({
      grau: source.grau ?? null,
      classe: source.classe?.nome ?? null,
      atualizadoNaFonteEm: source.dataHoraUltimaAtualizacao ?? null,
      movimentos: (Array.isArray(source.movimentos) ? source.movimentos : [])
        .map(({ codigo, nome, dataHora }) => ({ codigo, nome, dataHora }))
        .sort((a, b) => (Date.parse(b.dataHora) || 0) - (Date.parse(a.dataHora) || 0))
        .slice(0, 10),
    })),
  }, null, 2));
}

main(process.argv.slice(2)).catch((error) => {
  const message = error.name === "TimeoutError" || error.message === "fetch failed"
    ? "Não foi possível conectar à fonte oficial. Confira a rede e tente novamente."
    : error.message;
  console.error(message);
  process.exitCode = 1;
});
