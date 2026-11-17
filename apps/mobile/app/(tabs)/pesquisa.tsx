import { useState } from "react";
import { Linking, Platform, Pressable, Share, Text, TextInput, View } from "react-native";
import { LegalResearchCreateSchema, ResearchSourceCatalog, type ResearchCourtId } from "@marcia/contracts";
import { ActionButton, Card, Heading, Screen } from "@/components/Ui";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { colors, styles } from "@/theme";

const sources: { id: ResearchCourtId; name: string; scope: string }[] = [
  { id: "TJPR", name: "TJPR", scope: "Justiça estadual do Paraná" },
  { id: "TJSC", name: "TJSC", scope: "Justiça estadual de Santa Catarina" },
  { id: "TJRS", name: "TJRS", scope: "Justiça estadual do Rio Grande do Sul" },
  { id: "TRF4", name: "TRF4", scope: "Justiça Federal da 4ª Região" },
  { id: "STJ", name: "STJ", scope: "Tribunal Superior de Justiça" },
  { id: "STF", name: "STF", scope: "Supremo Tribunal Federal" },
];

export default function ResearchScreen() {
  const { demoMode } = useAuth();
  const api = useWorkData();
  const [query, setQuery] = useState("");
  const [courtId, setCourtId] = useState<ResearchCourtId>("TJPR");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedSource = sources.find((source) => source.id === courtId)!;
  const sourceUrl = ResearchSourceCatalog[courtId];

  async function copyTerms() {
    if (Platform.OS === "web") {
      try {
        await globalThis.navigator.clipboard.writeText(query.trim());
        setMessage("Consulta copiada. Cole os termos no campo de pesquisa do tribunal.");
      } catch {
        setMessage("O navegador bloqueou a cópia. Selecione os termos e copie manualmente.");
      }
      return;
    }
    try {
      await Share.share({ message: query.trim() });
      setMessage("Use a opção Copiar no menu de compartilhamento para levar os termos ao tribunal.");
    } catch {
      setMessage("Não foi possível abrir o menu de compartilhamento. Você pode selecionar os termos manualmente.");
    }
  }

  async function openSource() {
    try {
      await Linking.openURL(sourceUrl);
      setMessage(`Portal oficial ${courtId} aberto. A consulta não é enviada automaticamente.`);
    } catch {
      setMessage("Não foi possível abrir o portal agora. Tente novamente ou copie o endereço oficial.");
    }
  }

  async function saveSearch() {
    const parsed = LegalResearchCreateSchema.safeParse({ query, courtId });
    if (!parsed.success) {
      setMessage("Escreva uma questão com pelo menos duas letras antes de salvar.");
      return;
    }
    if (demoMode) {
      setMessage("Entre no escritório para salvar esta busca entre dispositivos. A demonstração não grava dados.");
      return;
    }
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      await api.createLegalResearch(parsed.data);
      setMessage("Busca salva no escritório. Os resultados precisam ser conferidos na fonte oficial.");
      setQuery("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar esta busca.");
    } finally {
      setSaving(false);
    }
  }

  return <Screen title="Pesquisa jurídica" subtitle="Organize a busca e abra a fonte oficial do tribunal em poucos passos.">
    <Card style={styles.priority}>
      <Heading>Comece pela questão</Heading>
      <Text style={styles.text}>Use termos jurídicos gerais. Não inclua nomes, documentos, informações de clientes ou peças sigilosas.</Text>
      <TextInput accessibilityLabel="Questão jurídica para pesquisar" placeholder="Ex.: responsabilidade civil por falha na prestação de serviço" placeholderTextColor={colors.muted}
        value={query} onChangeText={setQuery} maxLength={600} multiline numberOfLines={4} textAlignVertical="top" style={[styles.input, { minHeight: 112 }]} />
      <Text style={styles.small}>A busca será feita no portal oficial que você abrir. Este app não consulta nem copia ementas automaticamente.</Text>
    </Card>

    <Card>
      <Heading>Escolha onde pesquisar</Heading>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {sources.map((source) => {
          const selected = courtId === source.id;
          return <Pressable key={source.id} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${source.name} — ${source.scope}`}
            onPress={() => { setCourtId(source.id); setMessage(""); }}
            style={({ pressed }) => ({ minHeight: 64, flexBasis: "47%", flexGrow: 0, flexShrink: 0, borderRadius: 12, borderWidth: 2, borderColor: selected ? colors.wine : colors.line,
              backgroundColor: selected ? colors.wineWash : colors.paper, paddingHorizontal: 14, paddingVertical: 8, justifyContent: "center", opacity: pressed ? 0.75 : 1 })}>
            <Text style={{ color: selected ? colors.wine : colors.ink, fontSize: 15, fontWeight: "700", textAlign: "center" }}>{source.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>{source.scope}</Text>
          </Pressable>;
        })}
      </View>
      <Text style={styles.small}>Selecionado: {selectedSource.name} · {selectedSource.scope}</Text>
      <ActionButton label="Copiar termos da busca" secondary onPress={() => void copyTerms()} accessibilityHint="Copia os termos para você colar no portal oficial." />
      <ActionButton label={`Abrir pesquisa oficial ${courtId}`} onPress={() => void openSource()} accessibilityHint="Abre o portal oficial. A pesquisa não é enviada automaticamente." />
      <ActionButton label={saving ? "Salvando busca…" : "Salvar busca no escritório"} secondary onPress={() => void saveSearch()} />
      {message ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text> : null}
    </Card>

    <Card>
      <Heading>Buscas recentes</Heading>
      {demoMode ? <Text style={styles.text}>Entre no escritório para salvar e encontrar consultas em outros dispositivos.</Text>
        : api.loading ? <Text accessibilityLiveRegion="polite" style={styles.text}>Carregando buscas salvas…</Text>
        : api.issue ? <View style={styles.tight}><Text accessibilityLiveRegion="assertive" style={styles.text}>{api.issue}</Text><ActionButton label="Tentar novamente" secondary onPress={() => void api.refresh()} /></View>
        : api.legalResearches.length === 0 ? <Text style={styles.text}>Nenhuma busca salva ainda.</Text>
        : api.legalResearches.map((item) => <View key={item.id} style={styles.tight}>
          <Text style={styles.strong}>{item.query}</Text>
          <Text style={styles.small}>{item.courtId} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</Text>
          <ActionButton label={`Abrir fonte oficial ${item.courtId}`} secondary onPress={() => { void Linking.openURL(item.sourceUrl).catch(() => setMessage("Não foi possível abrir o portal salvo.")); }} />
          <View style={styles.divider} />
        </View>)}
    </Card>

    <Card>
      <Heading>Como conferir um precedente</Heading>
      <Text style={styles.text}>1. Abra o inteiro teor na fonte oficial e confira número, órgão, relatoria e datas.</Text>
      <Text style={styles.text}>2. Verifique se é repetitivo, repercussão geral, súmula, decisão colegiada ou decisão individual.</Text>
      <Text style={styles.text}>3. Procure distinções, decisões posteriores e entendimentos contrários antes de usar a referência.</Text>
      <Text style={styles.small}>O portal do TJSC também reúne súmulas, informativos, enunciados e jurisprudência em teses; o TRF4 permite filtrar ementa/inteiro teor e precedentes relevantes. O app não classifica autoridade nem atualidade dos resultados.</Text>
    </Card>
  </Screen>;
}
