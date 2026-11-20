import { useRef, useState } from "react";
import { Linking, Text, View } from "react-native";
import { DjenDiscoveryPageLimit, DjenDiscoveryRequestSchema, DjenDiscoveryResponseSchema, formatCnjCaseNumber } from "@marcia/contracts";
import type { z } from "zod";
import { AccessibleTextInput } from "@/components/AccessibleTextInput";
import { ActionButton, Card, Heading } from "@/components/Ui";
import { styles } from "@/theme";

type Query = z.infer<typeof DjenDiscoveryRequestSchema>;
type Page = z.infer<typeof DjenDiscoveryResponseSchema>;
type Candidate = Page["items"][number];
const portal = "https://comunica.pje.jus.br/";

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DjenDiscoveryPanel({ search, onSelect, existingNumbers, selectionBlocked }: {
  search: (query: Query) => Promise<Page>;
  onSelect: (item: Candidate) => void;
  existingNumbers: ReadonlySet<string>;
  selectionBlocked: boolean;
}) {
  const [oabNumber, setOabNumber] = useState("");
  const [oabState, setOabState] = useState("");
  const [startDate, setStartDate] = useState(() => dateDaysAgo(29));
  const [endDate, setEndDate] = useState(() => dateDaysAgo(0));
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const inFlight = useRef(false);

  const latest = pages.at(-1);
  const candidates = new Map<string, Candidate>();
  for (const page of pages) {
    for (const item of page.items) {
      const previous = candidates.get(item.caseNumber);
      if (!previous || item.availableOn > previous.availableOn) candidates.set(item.caseNumber, item);
    }
  }

  async function load(page: number) {
    if (inFlight.current) return;
    const parsed = DjenDiscoveryRequestSchema.safeParse({ oabNumber: oabNumber.trim(), oabState, startDate, endDate, page });
    if (!parsed.success) {
      setIssue("Informe o número da OAB, a UF e um período de até 31 dias. Use AAAA-MM-DD nas datas.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setIssue("");
    try {
      const result = await search(parsed.data);
      if (result.page !== page) throw new Error("O DJEN não confirmou a página solicitada.");
      setPages((current) => page === 1 ? [result] : [...current, result]);
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível consultar o DJEN.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <Card>
    <Heading>Encontrar processos por OAB</Heading>
    <Text style={styles.small}>Busca publicações do DJEN no período e reúne os números CNJ encontrados. Processos sem publicação nesse período podem ficar de fora. Você escolhe o que cadastrar.</Text>
    {!latest ? <>
      <Text style={styles.strong}>Número da OAB</Text>
      <AccessibleTextInput accessibilityLabel="Número da OAB" keyboardType="number-pad" value={oabNumber}
        onChangeText={(value) => setOabNumber(value.replace(/\D/g, ""))} maxLength={12} editable={!busy} autoComplete="off" style={styles.input} />
      <Text style={styles.strong}>UF da inscrição</Text>
      <AccessibleTextInput accessibilityLabel="UF da inscrição" autoCapitalize="characters" value={oabState}
        onChangeText={(value) => setOabState(value.toUpperCase().replace(/[^A-Z]/g, ""))} maxLength={2} editable={!busy} autoComplete="off" style={styles.input} />
      <Text style={styles.strong}>Data inicial (AAAA-MM-DD)</Text>
      <AccessibleTextInput accessibilityLabel="Data inicial" value={startDate} onChangeText={setStartDate}
        maxLength={10} editable={!busy} style={styles.input} />
      <Text style={styles.strong}>Data final (AAAA-MM-DD)</Text>
      <AccessibleTextInput accessibilityLabel="Data final" value={endDate} onChangeText={setEndDate}
        maxLength={10} editable={!busy} style={styles.input} />
      <ActionButton label={busy ? "Consultando…" : "Buscar publicações no DJEN"} disabled={busy}
        accessibilityHint="Envia o número da OAB, a UF e o período ao DJEN." onPress={() => void load(1)} />
    </> : <>
      <Text accessibilityLiveRegion="polite" style={styles.strong}>
        {candidates.size} {candidates.size === 1 ? "processo encontrado" : "processos encontrados"} nas páginas consultadas
      </Text>
      <Text style={styles.small}>{startDate} a {endDate} · Página {latest.page}
        {latest.sourceCount === null ? "" : ` · ${latest.sourceCount} publicações informadas pela fonte`}</Text>
      <Text style={styles.small}>Fonte: DJEN · Consultado em {new Date(latest.checkedAt).toLocaleString("pt-BR")}</Text>
      {pages.some(({ omittedCount }) => omittedCount > 0) ? <Text style={styles.small}>A busca omitiu itens com restrição indicada ou sem dados suficientes para conferência.</Text> : null}
      {!candidates.size ? <Text style={styles.small}>Nenhum processo elegível nesta busca até agora. Confira a inscrição e o período ou consulte a fonte oficial.</Text> : null}
      {selectionBlocked ? <Text style={styles.small}>Conclua ou descarte o cadastro em andamento antes de usar um resultado.</Text> : null}
      {[...candidates.values()].map((item) => {
        const number = formatCnjCaseNumber(item.caseNumber);
        const registered = item.alreadyRegistered || existingNumbers.has(item.caseNumber);
        return <View key={item.caseNumber} style={styles.tight}>
          <Text style={styles.strong}>{item.tribunalCode} · {number}</Text>
          <Text style={styles.small}>Publicação encontrada em {item.availableOn}{registered ? " · Já cadastrado" : ""}</Text>
          {!registered ? <ActionButton label="Revisar cadastro" accessibilityLabel={`Revisar cadastro de ${number}`}
            secondary disabled={selectionBlocked || busy} onPress={() => onSelect(item)} /> : null}
        </View>;
      })}
      {latest.hasMore && latest.page < DjenDiscoveryPageLimit ? <ActionButton label={busy ? "Consultando…" : "Carregar próxima página"}
        disabled={busy} onPress={() => void load(latest.page + 1)} /> : null}
      {latest.hasMore && latest.page === DjenDiscoveryPageLimit ? <Text style={styles.small}>Limite de páginas atingido. Divida o período em buscas menores ou confira no portal.</Text> : null}
      <ActionButton label="Alterar busca por OAB" secondary disabled={busy} onPress={() => { setPages([]); setIssue(""); }} />
    </>}
    {issue ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{issue}</Text> : null}
    <ActionButton label="Abrir portal oficial do DJEN" secondary onPress={() => {
      void Linking.openURL(portal).catch(() => setIssue("Não foi possível abrir o portal do DJEN."));
    }} />
  </Card>;
}
