import { describe, expect, it, vi } from "vitest";
import { discoverDjenCases, DjenProviderError, fetchDjenPublications } from "./djen";

const requestedProcess = "00000000000000000000";
const basePublication = {
  hash: "syntheticPublicationHash001",
  siglaTribunal: "TJXX",
  tipoComunicacao: "Publicação fictícia",
};

function response(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("DJEN OAB case discovery", () => {
  const query = { oabNumber: "111111", oabState: "PR", startDate: "2099-01-01", endDate: "2099-01-31", page: 1 };
  const publication = {
    numero_processo: "99999995320998160000",
    siglaTribunal: "TJPR",
    data_disponibilizacao: "2099-01-12",
    ativo: true,
    destinatarios: [{ nome: "Pessoa sintética" }],
    destinatarioadvogados: [{ advogado: { numero_oab: query.oabNumber, uf_oab: query.oabState, nome: "Advogada sintética" } }],
    texto: "Conteúdo inventado que não pode aparecer no resultado",
  };

  it("uses one bounded request and projects only eligible case metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({
      status: "success", count: 12, items: [
        publication,
        { ...publication, data_disponibilizacao: "2099-01-15" },
        { ...publication, destinatarios: [{ nome: "SIGILO 1" }] },
        { ...publication, destinatarioadvogados: [{ advogado: { numero_oab: query.oabNumber, uf_oab: "SC" } }] },
        { ...publication, ativo: false },
      ],
    }));
    await expect(discoverDjenCases(query, "production", fetcher)).resolves.toEqual({
      sourceCount: 12, returnedCount: 5, omittedCount: 3, hasMore: true, remainingRequests: null,
      items: [{ caseNumber: publication.numero_processo, tribunalCode: "TJPR", availableOn: "2099-01-15" }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const url = new URL(fetcher.mock.calls[0]![0] as string);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      numeroOab: query.oabNumber, ufOab: "PR", dataDisponibilizacaoInicio: query.startDate,
      dataDisponibilizacaoFim: query.endDate, pagina: "1", itensPorPagina: "5",
    });
  });

  it("does not interpret a 429 as an empty result or retry automatically", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({}, { status: 429, headers: { "Retry-After": "90" } }));
    await expect(discoverDjenCases(query, "production", fetcher)).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 90 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("DJEN public read-only response parser", () => {
  it("maps the snake_case fields observed in the manual response without claiming coverage", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({
      count: 99,
      items: [{
        ...basePublication,
        numero_processo: "0000000-00.0000.0.00.0000",
        data_disponibilizacao: "2026-11-19T10:15:30.000Z",
      }],
    }));

    const result = await fetchDjenPublications(requestedProcess, "production", fetcher);

    expect(result.items).toEqual([{
      sourceHash: basePublication.hash,
      tribunalCode: "TJXX",
      communicationType: "Publicação fictícia",
      availableOn: "2026-11-19",
    }]);
    expect(fetcher).toHaveBeenCalledOnce();
    const requestUrl = new URL(fetcher.mock.calls[0]![0] as string);
    expect(requestUrl.origin).toBe("https://comunicaapi.pje.jus.br");
    expect(requestUrl.searchParams.get("numeroProcesso")).toBe(requestedProcess);
    expect(result.remainingRequests).toBeNull();
  });

  it("continues to accept the camelCase aliases while rejecting conflicting aliases", async () => {
    const valid = await fetchDjenPublications(requestedProcess, "homologation", vi.fn<typeof fetch>().mockResolvedValue(response({
      items: [{
        ...basePublication,
        numeroProcesso: requestedProcess,
        dataDisponibilizacao: "2026-11-19",
      }],
    })));
    expect(valid.items[0]?.availableOn).toBe("2026-11-19");

    const conflicting = fetchDjenPublications(requestedProcess, "production", vi.fn<typeof fetch>().mockResolvedValue(response({
      items: [{
        ...basePublication,
        numero_processo: requestedProcess,
        numeroProcesso: "11111111111111111111",
      }],
    })));
    await expect(conflicting).rejects.toMatchObject({ code: "invalid_response" });
  });

  it.each([
    ["the requested process number does not match", { numero_processo: "11111111111111111111" }],
    ["the process number is missing", {}],
    ["the availability date has an invalid calendar day", { numero_processo: requestedProcess, data_disponibilizacao: "2026-02-30" }],
    ["the availability date has a malformed suffix", { numero_processo: requestedProcess, data_disponibilizacao: "2026-11-19garbage" }],
  ])("rejects an item when %s", async (_description, fields) => {
    const result = fetchDjenPublications(requestedProcess, "production", vi.fn<typeof fetch>().mockResolvedValue(response({
      items: [{ ...basePublication, ...fields }],
    })));
    await expect(result).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("does not interpret an empty item list or count as proof of no publication", async () => {
    const result = await fetchDjenPublications(requestedProcess, "production", vi.fn<typeof fetch>().mockResolvedValue(response({
      count: 25,
      items: [],
    })));

    expect(result.items).toEqual([]);
  });

  it("distinguishes a missing or malformed rate-limit header from an explicit zero", async () => {
    const makeResponse = (remaining: string | null) => response({ items: [] }, {
      headers: remaining === null ? { "Content-Type": "application/json" } : {
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": remaining,
      },
    });
    const fetchWithRemaining = (remaining: string | null) => fetchDjenPublications(
      requestedProcess,
      "production",
      vi.fn<typeof fetch>().mockResolvedValue(makeResponse(remaining)),
    );

    await expect(fetchWithRemaining(null)).resolves.toMatchObject({ remainingRequests: null });
    await expect(fetchWithRemaining("unknown")).resolves.toMatchObject({ remainingRequests: null });
    await expect(fetchWithRemaining("0")).resolves.toMatchObject({ remainingRequests: 0 });
  });

  it("preserves a null availability date when the source omits it", async () => {
    const result = await fetchDjenPublications(requestedProcess, "production", vi.fn<typeof fetch>().mockResolvedValue(response({
      items: [{ ...basePublication, numero_processo: requestedProcess, data_disponibilizacao: null }],
    })));

    expect(result.items[0]?.availableOn).toBeNull();
  });

  it("honors Retry-After on a rate-limited response", async () => {
    const result = fetchDjenPublications(requestedProcess, "production", vi.fn<typeof fetch>().mockResolvedValue(
      new Response("", { status: 429, headers: { "Retry-After": "7" } }),
    ));

    await expect(result).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 7,
    } satisfies Partial<DjenProviderError>);
  });

  it("rejects malformed and oversized responses instead of parsing unbounded data", async () => {
    await expect(fetchDjenPublications(requestedProcess, "production", vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{bad json"),
    ))).rejects.toMatchObject({ code: "invalid_response" });

    await expect(fetchDjenPublications(requestedProcess, "production", vi.fn<typeof fetch>().mockResolvedValue(
      new Response("x".repeat(1_048_577)),
    ))).rejects.toMatchObject({ code: "invalid_response" });
  });
});
