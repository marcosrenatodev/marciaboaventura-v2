import { AccessibleTextInput } from "@/components/AccessibleTextInput";
import { TourAnchor } from "@/TourAnchors";
import { useState } from "react";
import { Linking, Platform, Pressable, Share, Text, View } from "react-native";
import { LegalResearchCreateSchema, ResearchSourceCatalog, type ResearchCourtId } from "@marcia/contracts";
import { ActionButton, Card, Heading, Screen } from "@/components/Ui";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { researchGuides } from "@/research-guides";
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
  const [showArchived, setShowArchived] = useState(false);
  const [editingResearchId, setEditingResearchId] = useState<string | null>(null);
  const [editingResearchVersion, setEditingResearchVersion] = useState<string | null>(null);
  const [editingQuery, setEditingQuery] = useState("");
  const [editingCourtId, setEditingCourtId] = useState<ResearchCourtId>("TJPR");
  const [confirmDiscardEdit, setConfirmDiscardEdit] = useState(false);
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null);
  const [researchesSaving, setResearchesSaving] = useState(false);
  const [researchesMessage, setResearchesMessage] = useState("");
  const selectedSource = sources.find((source) => source.id === courtId)!;
  const sourceUrl = ResearchSourceCatalog[courtId];
  const researchGuide = researchGuides[courtId];

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
      setShowArchived(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar esta busca.");
    } finally {
      setSaving(false);
    }
  }

  async function loadArchivedSearches(nextArchived: boolean) {
    if (editingResearchId) { setResearchesMessage("Salve ou descarte a edição antes de trocar de lista."); return; }
    setResearchesSaving(true); setResearchesMessage("");
    try {
      await api.loadLegalResearches(nextArchived);
      setShowArchived(nextArchived);
      setEditingResearchId(null); setEditingResearchVersion(null); setPendingArchiveId(null);
    } catch (error) {
      setResearchesMessage(error instanceof Error ? error.message : "Não foi possível carregar as consultas arquivadas.");
    } finally { setResearchesSaving(false); }
  }

  async function loadMoreSavedSearches() {
    setResearchesMessage("");
    try {
      await api.loadMoreLegalResearches();
    } catch (error) {
      setResearchesMessage(error instanceof Error ? error.message : "Não foi possível carregar mais consultas salvas.");
    }
  }

  async function saveResearchEdit() {
    if (!editingResearchId || !editingResearchVersion || researchesSaving) return;
    const parsed = LegalResearchCreateSchema.safeParse({ query: editingQuery, courtId: editingCourtId });
    if (!parsed.success) { setResearchesMessage("Escreva uma questão com pelo menos duas letras antes de salvar."); return; }
    setResearchesSaving(true); setResearchesMessage("");
    try {
      await api.updateLegalResearch(editingResearchId, parsed.data, editingResearchVersion);
      setEditingResearchId(null); setEditingResearchVersion(null); setEditingQuery("");
      setConfirmDiscardEdit(false);
      setResearchesMessage("Alterações da consulta salvas.");
    } catch (error) {
      setResearchesMessage(error instanceof Error ? error.message : "Não foi possível atualizar a consulta salva.");
    } finally { setResearchesSaving(false); }
  }

  async function changeResearchStatus(item: typeof api.legalResearches[number], status: "active" | "archived") {
    if (researchesSaving) return;
    setResearchesSaving(true); setResearchesMessage("");
    try {
      await api.setLegalResearchStatus(item.id, status, item.updatedAt);
      setPendingArchiveId(null);
      if (status === "active") setShowArchived(false);
      setResearchesMessage(status === "archived" ? "Consulta arquivada. Você pode restaurá-la em Consultas arquivadas." : "Consulta restaurada nas buscas recentes.");
    } catch (error) {
      setResearchesMessage(error instanceof Error ? error.message : "Não foi possível alterar a consulta salva.");
    } finally { setResearchesSaving(false); }
  }

  const visibleResearches = api.legalResearches.filter((item) => showArchived ? item.archivedAt !== null : item.archivedAt === null);

  return <Screen title="Pesquisa jurídica" subtitle="Organize a busca e abra a fonte oficial do tribunal em poucos passos." tourScreenId="research">
    <Card style={styles.priority}>
      <Heading>Comece pela questão</Heading>
      <Text style={styles.text}>Use termos jurídicos gerais. Não inclua nomes, documentos, informações de clientes ou peças sigilosas.</Text>
      <TourAnchor id="research.question">
        <AccessibleTextInput accessibilityLabel="Questão jurídica para pesquisar" placeholder="Ex.: responsabilidade civil por falha na prestação de serviço" placeholderTextColor={colors.muted}
          value={query} onChangeText={setQuery} autoComplete="off" autoCorrect={false} maxLength={600} multiline numberOfLines={4} textAlignVertical="top" style={[styles.input, { minHeight: 112 }]} />
      </TourAnchor>
      <Text style={styles.small}>A busca será feita no portal oficial que você abrir. Este app não consulta nem copia ementas automaticamente.</Text>
    </Card>

    <Card>
      <Heading>Escolha onde pesquisar</Heading>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {sources.map((source) => {
          const selected = courtId === source.id;
          return <Pressable key={source.id} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${source.name} — ${source.scope}`}
            onPress={() => { setCourtId(source.id); setMessage(""); }}
            style={({ pressed }) => ({ minHeight: 64, flexBasis: "47%", flexGrow: 0, flexShrink: 0, borderRadius: 12, borderWidth: 2, borderColor: selected ? colors.wine : colors.controlLine,
              backgroundColor: selected ? colors.wineWash : colors.paper, paddingHorizontal: 14, paddingVertical: 8, justifyContent: "center", opacity: pressed ? 0.75 : 1 })}>
            <Text style={{ color: selected ? colors.wine : colors.ink, fontSize: 15, fontWeight: "700", textAlign: "center" }}>{source.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>{source.scope}</Text>
          </Pressable>;
        })}
      </View>
      <Text style={styles.small}>Selecionado: {selectedSource.name} · {selectedSource.scope}</Text>
      <View testID="research-source-guidance" style={styles.tight}>
        <Text style={styles.strong}>Dicas para pesquisar no {selectedSource.name}</Text>
        {researchGuide.steps.map((step, index) => <Text key={`${courtId}-${index}`} style={styles.small}>{index + 1}. {step}</Text>)}
        {researchGuide.caution ? <Text style={styles.small}>Atenção: {researchGuide.caution}</Text> : null}
        {researchGuide.officialGuideUrl ? <ActionButton label={`Ler guia oficial do ${selectedSource.name}`} secondary
          onPress={() => void Linking.openURL(researchGuide.officialGuideUrl!).catch(() => setMessage("Não foi possível abrir o guia oficial agora."))} /> : null}
      </View>
      <ActionButton label="Copiar termos da busca" secondary onPress={() => void copyTerms()} accessibilityHint="Copia os termos para você colar no portal oficial." />
      <TourAnchor id="research.open-source">
        <ActionButton label={`Abrir pesquisa oficial ${courtId}`} onPress={() => void openSource()} accessibilityHint="Abre o portal oficial. A pesquisa não é enviada automaticamente." />
      </TourAnchor>
      <ActionButton label={saving ? "Salvando busca…" : "Salvar busca no escritório"} secondary onPress={() => void saveSearch()} />
      {message ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text> : null}
    </Card>

    <Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Heading>{showArchived ? "Consultas arquivadas" : "Buscas recentes"}</Heading>
        {!demoMode ? <ActionButton label={showArchived ? "Voltar às buscas recentes" : "Ver consultas arquivadas"} secondary
          onPress={() => void loadArchivedSearches(!showArchived)} disabled={researchesSaving || api.legalResearchesLoading} /> : null}
      </View>
      {demoMode ? <Text style={styles.text}>Entre no escritório para salvar e encontrar consultas em outros dispositivos.</Text>
        : api.loading ? <Text accessibilityLiveRegion="polite" style={styles.text}>Carregando buscas salvas…</Text>
        : api.issue ? <View style={styles.tight}><Text accessibilityLiveRegion="assertive" style={styles.text}>{api.issue}</Text><ActionButton label="Tentar novamente" secondary onPress={() => void api.refresh()} /></View>
        : researchesSaving || (api.legalResearchesLoading && visibleResearches.length === 0) ? <Text accessibilityLiveRegion="polite" style={styles.small}>Atualizando consultas…</Text>
        : visibleResearches.length === 0 ? <Text style={styles.text}>{showArchived ? "Nenhuma consulta arquivada." : "Nenhuma busca salva ainda."}</Text>
        : visibleResearches.map((item) => <View key={item.id} style={styles.tight}>
          {item.archivedAt ? <Text style={styles.badge}>Arquivada · pode ser restaurada</Text> : null}
          <Text style={styles.strong}>{item.query}</Text>
          <Text style={styles.small}>{item.courtId} · criada {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</Text>
          {item.updatedAt !== item.createdAt ? <Text style={styles.small}>Atualizada {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.updatedAt))}</Text> : null}
          {!item.archivedAt ? <ActionButton label={`Abrir fonte oficial ${item.courtId}`} secondary onPress={() => { void Linking.openURL(item.sourceUrl).catch(() => setMessage("Não foi possível abrir o portal salvo.")); }} /> : null}
          {!item.archivedAt ? <ActionButton label={`Editar consulta salva: ${item.query}`} secondary onPress={() => {
            if (editingResearchId === item.id) return;
            if (editingResearchId) { setResearchesMessage("Salve ou descarte a edição atual antes de abrir outra consulta."); return; }
            setConfirmDiscardEdit(false);
            setEditingResearchId(item.id); setEditingResearchVersion(item.updatedAt); setEditingQuery(item.query); setEditingCourtId(item.courtId); setPendingArchiveId(null); setResearchesMessage("");
          }} /> : null}
          {editingResearchId === item.id ? <View style={styles.tight}>
            <AccessibleTextInput accessibilityLabel="Editar termos da consulta salva" placeholder="Questão jurídica" placeholderTextColor={colors.muted}
              value={editingQuery} onChangeText={setEditingQuery} autoComplete="off" autoCorrect={false} maxLength={600} multiline numberOfLines={3}
              textAlignVertical="top" style={[styles.input, { minHeight: 96 }]} />
            <Text style={styles.small}>A edição altera somente a consulta salva. Confira os resultados novamente no portal oficial.</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {sources.map((source) => <Pressable key={source.id} accessibilityRole="radio" accessibilityState={{ selected: editingCourtId === source.id }}
                accessibilityLabel={`Tribunal da consulta salva ${source.id}`} onPress={() => setEditingCourtId(source.id)}
                style={({ pressed }) => ({ minHeight: 48, flexBasis: "31%", flexGrow: 1, borderRadius: 10, borderWidth: 2,
                  borderColor: editingCourtId === source.id ? colors.wine : colors.controlLine,
                  backgroundColor: editingCourtId === source.id ? colors.wineWash : colors.paper,
                  justifyContent: "center", alignItems: "center", opacity: pressed ? 0.75 : 1 })}>
                <Text style={{ color: editingCourtId === source.id ? colors.wine : colors.ink, fontSize: 14, fontWeight: "700" }}>{source.id}</Text>
              </Pressable>)}
            </View>
            <ActionButton label="Salvar alterações da consulta" onPress={() => void saveResearchEdit()} disabled={researchesSaving} />
            <ActionButton label="Cancelar edição da consulta" secondary disabled={researchesSaving} onPress={() => setConfirmDiscardEdit(true)} />
            {confirmDiscardEdit ? <View style={styles.tight}>
              <Text accessibilityLiveRegion="assertive" style={styles.small}>Descartar as alterações ainda não salvas desta consulta?</Text>
              <ActionButton label="Descartar alterações da consulta" disabled={researchesSaving} onPress={() => { setEditingResearchId(null); setEditingResearchVersion(null); setEditingQuery(""); setConfirmDiscardEdit(false); setResearchesMessage(""); }} />
              <ActionButton label="Continuar editando consulta" secondary disabled={researchesSaving} onPress={() => setConfirmDiscardEdit(false)} />
            </View> : null}
          </View> : null}
          {!item.archivedAt && pendingArchiveId === item.id ? <View style={styles.tight}>
            <Text style={styles.small}>Ela sairá das buscas recentes, mas ficará arquivada e poderá ser restaurada.</Text>
            <ActionButton label={`Confirmar arquivamento da consulta: ${item.query}`} onPress={() => void changeResearchStatus(item, "archived")} disabled={researchesSaving} />
            <ActionButton label="Cancelar arquivamento da consulta" secondary onPress={() => setPendingArchiveId(null)} />
          </View> : null}
          {!item.archivedAt && pendingArchiveId !== item.id ? <ActionButton label={`Arquivar consulta salva: ${item.query}`} secondary onPress={() => {
            if (editingResearchId) { setResearchesMessage("Salve ou descarte a edição atual antes de arquivar uma consulta."); return; }
            setPendingArchiveId(item.id);
          }} /> : null}
          {item.archivedAt ? <ActionButton label={`Restaurar consulta salva: ${item.query}`} secondary onPress={() => void changeResearchStatus(item, "active")} disabled={researchesSaving} /> : null}
          <View style={styles.divider} />
        </View>)}
      {!demoMode && api.legalResearchesNextCursor ? <ActionButton
        label={api.legalResearchesLoading ? "Carregando…" : showArchived ? "Carregar mais consultas arquivadas" : "Carregar mais buscas"}
        secondary onPress={() => void loadMoreSavedSearches()} disabled={api.legalResearchesLoading || researchesSaving} /> : null}
      {researchesMessage ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{researchesMessage}</Text> : null}
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
