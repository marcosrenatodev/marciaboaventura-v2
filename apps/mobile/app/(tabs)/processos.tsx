import { AccessibleTextInput } from "@/components/AccessibleTextInput";
import { CourtPicker } from "@/components/CourtPicker";
import { DjenDiscoveryPanel } from "@/components/DjenDiscoveryPanel";
import { courtsWithOfficialPortals } from "@/court-portal-options";
import { TourAnchor } from "@/TourAnchors";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Linking, Platform, Pressable, Text, View, type TextInputInstance, type ViewInstance } from "react-native";
import { ActionButton, Card, Heading, Screen } from "@/components/Ui";
import { matters } from "@/demo";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { colors, styles } from "@/theme";
import { IntegrationsSettings } from "@/IntegrationsSettings";
import { normalizeWorkspaceSearch } from "@/search";
import { useWorkspaceSearchNavigation } from "@/WorkspaceSearchNavigation";
import { formatCnjCaseNumber, isCnjCaseNumberCandidate, isValidCnjCaseNumber } from "@marcia/contracts";

const TJPR_PUBLIC_CASE_LOOKUP_URL = "https://consulta.tjpr.jus.br/projudi_consulta/processo/consultaPublica.do?actionType=pesquisar";
const TJSC_PUBLIC_CASE_LOOKUP_URLS = [
  { label: "Abrir consulta pública TJSC · 1º grau", url: "https://eprocwebcon.tjsc.jus.br/consulta1g/externo_controlador.php?acao=processo_consulta_publica" },
  { label: "Abrir consulta pública TJSC · 2º grau", url: "https://eprocwebcon.tjsc.jus.br/consulta2g/externo_controlador.php?acao=processo_consulta_publica" },
];
const TJRS_PUBLIC_CASE_LOOKUP_URL = "https://www.tjrs.jus.br/novo/processos-e-servicos/consultas-processuais/acompanhamento-processual/";
const TRF4_PUBLIC_CASE_LOOKUP_URL = "https://www.trf4.jus.br/trf4/controlador.php?acao=principal";

function isTjprCourt(courtName: string, jurisdiction: string | null | undefined): boolean {
  return /\btjpr\b|parana/.test(normalizeWorkspaceSearch(`${courtName} ${jurisdiction ?? ""}`));
}

type CourtCaseLookupLink = { label: string; url: string };

function courtCaseLookupLinks(courtName: string, jurisdiction: string | null | undefined): CourtCaseLookupLink[] {
  const identity = normalizeWorkspaceSearch(`${courtName} ${jurisdiction ?? ""}`);
  if (isTjprCourt(courtName, jurisdiction)) return [{ label: "Abrir consulta pública TJPR (Projudi)", url: TJPR_PUBLIC_CASE_LOOKUP_URL }];
  if (/\btjsc\b|santa catarina/.test(identity)) return TJSC_PUBLIC_CASE_LOOKUP_URLS;
  if (/\btjrs\b|rio grande do sul/.test(identity)) return [{ label: "Abrir consulta pública TJRS", url: TJRS_PUBLIC_CASE_LOOKUP_URL }];
  if (/\btrf\s*4\b|tribunal regional federal.{0,24}4|\bjf(?:pr|rs|sc)\b/.test(identity)) {
    return [{ label: "Abrir consulta pública TRF4/JF4", url: TRF4_PUBLIC_CASE_LOOKUP_URL }];
  }
  return [];
}

export default function MattersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ quick?: string | string[] }>();
  const quickAction = Array.isArray(params.quick) ? params.quick[0] : params.quick;
  const { demoMode } = useAuth();
  const { searchQueries, processesView, setSearchQuery, setProcessesView, showCourtCaseList } = useWorkspaceSearchNavigation();
  const courtPickerTrigger = useRef<ViewInstance>(null);
  const matterNameInput = useRef<TextInputInstance>(null);
  const [demoQuery, setDemoQuery] = useState("");
  const activeView = !demoMode && quickAction === "case" ? "courtCases" : processesView;
  const query = demoMode ? demoQuery : searchQueries[activeView];
  const updateQuery = (value: string) => demoMode ? setDemoQuery(value) : setSearchQuery(activeView, value);
  const [title, setTitle] = useState("");
  const [matterFormOpen, setMatterFormOpen] = useState(false);
  const [confirmDiscardMatter, setConfirmDiscardMatter] = useState(false);
  const [integrationsView, setIntegrationsView] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [matterMessage, setMatterMessage] = useState("");
  const [formIssue, setFormIssue] = useState("");
  const [saving, setSaving] = useState(false);
  const [courtName, setCourtName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [caseLabel, setCaseLabel] = useState("");
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null);
  const [caseIssue, setCaseIssue] = useState("");
  const [caseMessage, setCaseMessage] = useState("");
  const [caseFormOpen, setCaseFormOpen] = useState(false);
  const [oabSearchOpen, setOabSearchOpen] = useState(false);
  const [discoveredNumber, setDiscoveredNumber] = useState<string | null>(null);
  const [confirmDiscardCase, setConfirmDiscardCase] = useState(false);
  const [formNavigationVersion, setFormNavigationVersion] = useState(0);
  const [savingCase, setSavingCase] = useState(false);
  const [focused, setFocused] = useState(false);
  const [editingMatterId, setEditingMatterId] = useState<string | null>(null);
  const [editingMatterVersion, setEditingMatterVersion] = useState<string | null>(null);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editingCaseVersion, setEditingCaseVersion] = useState<string | null>(null);
  const [pendingArchive, setPendingArchive] = useState<{ entity: "matter" | "court-case"; id: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const api = useWorkData();
  const isCaseFormOpen = caseFormOpen || (!demoMode && quickAction === "case");
  useFocusEffect(useCallback(() => () => setOabSearchOpen(false), []));
  useEffect(() => {
    if (Platform.OS !== "web" || demoMode || activeView !== "courtCases" || !isCaseFormOpen) return;
    const frame = requestAnimationFrame(() => courtPickerTrigger.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [activeView, demoMode, isCaseFormOpen]);
  useEffect(() => {
    if (Platform.OS !== "web" || demoMode || activeView !== "matters" || !matterFormOpen) return;
    const frame = requestAnimationFrame(() => matterNameInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [activeView, demoMode, matterFormOpen]);
  const clearQuickAction = () => {
    if (quickAction === "case") router.setParams({ quick: undefined });
  };
  const openCaseForm = () => {
    setCaseFormOpen(true);
    setConfirmDiscardCase(false);
    setCaseIssue("");
    setCaseMessage("");
    setFormNavigationVersion((version) => version + 1);
  };
  const discardCaseDraft = () => {
    setCourtName(""); setJurisdiction(""); setCaseNumber(""); setCaseLabel(""); setSelectedMatterId(null);
    setEditingCaseId(null); setEditingCaseVersion(null); setCaseIssue(""); setCaseFormOpen(false); setConfirmDiscardCase(false);
    setDiscoveredNumber(null);
    clearQuickAction();
  };
  const openMatterForm = () => {
    setMatterFormOpen(true);
    setConfirmDiscardMatter(false);
    setFormIssue("");
    setMatterMessage("");
    setFormNavigationVersion((version) => version + 1);
  };
  const discardMatterDraft = () => {
    setTitle(""); setSelectedClientId(null); setEditingMatterId(null); setEditingMatterVersion(null);
    setFormIssue(""); setMatterFormOpen(false); setConfirmDiscardMatter(false);
  };
  if (!demoMode) {
    const invalidCnjNumber = isCnjCaseNumberCandidate(caseNumber) && !isValidCnjCaseNumber(caseNumber);
    const normalizedQuery = normalizeWorkspaceSearch(query);
    const filteredApi = api.matters.filter((matter) => normalizeWorkspaceSearch(`${matter.title} ${matter.client?.displayName ?? ""}`).includes(normalizedQuery));
    const filteredCases = api.courtCases.filter((courtCase) => normalizeWorkspaceSearch([
      courtCase.courtName, courtCase.jurisdiction ?? "", courtCase.caseNumber ?? "", courtCase.label ?? "",
      api.matters.find((matter) => matter.id === courtCase.matterId)?.title ?? "",
    ].join(" ")).includes(normalizedQuery));
    const hasCaseDraft = Boolean(editingCaseId || courtName.trim() || jurisdiction.trim() || caseNumber.trim() || caseLabel.trim() || selectedMatterId);
    const fromDjen = !editingCaseId && Boolean(discoveredNumber && caseNumber.replace(/\D/g, "") === discoveredNumber);
    const caseForm = isCaseFormOpen ? <View testID="court-case-form"><Card>
      <Heading>{editingCaseId ? "Editar processo" : "Novo processo"}</Heading>
      {caseIssue ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{caseIssue}</Text> : null}
      <Text style={styles.small}>{fromDjen
        ? "Número sugerido a partir de uma publicação do DJEN. Confira os dados antes de cadastrar."
        : "Cadastro manual. Nenhum tribunal foi consultado e nenhum andamento é atualizado automaticamente."}</Text>
      <CourtPicker courtName={courtName} jurisdiction={jurisdiction} triggerRef={courtPickerTrigger} onSelect={(name, region) => {
        setCourtName(name);
        setJurisdiction(region);
        setCaseIssue("");
      }} />
      <AccessibleTextInput testID="court-jurisdiction-input" accessibilityLabel="Estado ou região do processo" placeholder="Estado ou região (ex.: PR ou Região Sul)" placeholderTextColor={colors.muted}
        value={jurisdiction} onChangeText={(value) => { setJurisdiction(value); setCaseIssue(""); }} maxLength={120} style={styles.input} />
      <AccessibleTextInput testID="court-number-input" accessibilityLabel="Número CNJ ou identificador local, opcional" placeholder="Número CNJ ou identificador local (opcional)" placeholderTextColor={colors.muted}
        value={caseNumber} onChangeText={(value) => { setCaseNumber(formatCnjCaseNumber(value)); setCaseIssue(""); }} maxLength={80} style={[styles.input, invalidCnjNumber && { borderColor: colors.error }]} />
      <Text style={styles.small}>Quando o campo contém somente 20 dígitos e separadores, o app confere o dígito verificador e organiza a formatação CNJ. Outros identificadores locais continuam aceitos como texto.</Text>
      {invalidCnjNumber ? <Text accessibilityLiveRegion="assertive" style={[styles.small, { color: colors.error }]}>O dígito verificador não confere. Revise os 20 dígitos antes de salvar.</Text> : null}
      <AccessibleTextInput accessibilityLabel="Identificação curta, opcional" placeholder="Identificação curta (opcional)" placeholderTextColor={colors.muted}
        value={caseLabel} onChangeText={(value) => { setCaseLabel(value); setCaseIssue(""); }} maxLength={160} style={styles.input} />
      <View style={styles.tight}>
        <Text style={styles.strong}>Vincular a um assunto (opcional)</Text>
        <ActionButton label={selectedMatterId ? "Remover vínculo com assunto" : "Sem assunto vinculado"} secondary onPress={() => { setSelectedMatterId(null); setCaseIssue(""); }} />
        {api.matters.filter((matter) => matter.status !== "archived").map((matter) => <ActionButton key={matter.id}
          label={selectedMatterId === matter.id ? `Selecionado: ${matter.title}` : `Selecionar assunto: ${matter.title}`}
          secondary onPress={() => { setSelectedMatterId(matter.id); setCaseIssue(""); }} />)}
        {api.matters.length === 0 && !api.loading ? <Text style={styles.small}>Cadastre um assunto acima para vinculá-lo aqui.</Text> : null}
      </View>
      <ActionButton label={savingCase ? "Salvando…" : editingCaseId ? "Salvar alterações do processo" : "Cadastrar processo"} disabled={savingCase} onPress={() => {
        if (savingCase) return;
        if (!courtName.trim()) { setCaseIssue("Selecione um tribunal ou informe o nome em Outro tribunal."); return; }
        if (invalidCnjNumber) { setCaseIssue("Revise os 20 dígitos do número CNJ: o dígito verificador não confere."); return; }
        if (editingCaseId && !api.courtCases.some((item) => item.id === editingCaseId && item.status !== "archived")) {
          setCaseIssue("Esse processo não está mais ativo. Atualize a lista antes de editar."); return;
        }
        if (editingCaseId && !editingCaseVersion) { setCaseIssue("Feche e abra novamente esta edição para conferir a versão atual."); return; }
        setSavingCase(true); setCaseIssue(""); setCaseMessage("");
        const input = { matterId: selectedMatterId, courtName, jurisdiction, caseNumber, label: caseLabel };
        const wasEditing = Boolean(editingCaseId);
        const operation = editingCaseId && editingCaseVersion
          ? api.updateCourtCase(editingCaseId, input, editingCaseVersion)
          : api.createCourtCase(input);
        void operation.then(() => {
          setCourtName(""); setJurisdiction(""); setCaseNumber(""); setCaseLabel(""); setSelectedMatterId(null);
          setEditingCaseId(null); setEditingCaseVersion(null); setCaseFormOpen(false); setConfirmDiscardCase(false); clearQuickAction();
          setDiscoveredNumber(null);
          setCaseMessage(wasEditing ? "Alterações do processo salvas. Nenhum tribunal foi consultado."
            : fromDjen ? "Processo cadastrado. Confira os andamentos no portal do tribunal." : "Processo cadastrado pela API. Nenhum tribunal foi consultado.");
        }, (error: unknown) => setCaseIssue(error instanceof Error ? error.message : "Não foi possível cadastrar o processo.")).finally(() => setSavingCase(false));
      }} />
      <ActionButton label="Cancelar" secondary disabled={savingCase} onPress={() => setConfirmDiscardCase(true)} />
      {confirmDiscardCase ? <View style={styles.tight}>
        <Text accessibilityLiveRegion="assertive" style={styles.small}>{editingCaseId
          ? "Descartar as alterações deste formulário? O processo salvo continuará sem mudanças."
          : "Descartar este cadastro? Os campos preenchidos serão apagados; nada foi salvo no escritório ainda."}</Text>
        <ActionButton label={editingCaseId ? "Descartar alterações do processo" : "Descartar cadastro do processo"} disabled={savingCase} onPress={discardCaseDraft} />
        <ActionButton label="Continuar preenchendo processo" secondary disabled={savingCase} onPress={() => setConfirmDiscardCase(false)} />
      </View> : null}
    </Card></View> : null;
    if (integrationsView) return <IntegrationsSettings onBack={() => setIntegrationsView(false)} />;
    const isCaseView = activeView === "courtCases";
    const isClientView = activeView === "clients";
    const viewNavigationKey = activeView === "courtCases" ? 1 : activeView === "matters" ? 2 : 3;
    const titleLabel = isCaseView ? "Processos" : isClientView ? "Clientes" : "Assuntos";
    const headerAction = isClientView ? undefined : isCaseView
      ? <TourAnchor id="cases.new-process">
        <ActionButton label={isCaseFormOpen ? "Fechar formulário de processo" : editingCaseId ? "Continuar edição do processo" : hasCaseDraft ? "Continuar cadastro do processo" : "Novo processo"}
          accessibilityHint={isCaseFormOpen ? "Fecha o formulário mantendo os campos preenchidos para continuar depois." : "Abre o cadastro de processo no início da tela."}
          secondary={isCaseFormOpen} onPress={() => {
            if (isCaseFormOpen) { setCaseFormOpen(false); setConfirmDiscardCase(false); clearQuickAction(); }
            else openCaseForm();
          }} />
      </TourAnchor>
      : <TourAnchor id="matters.new-matter">
        <ActionButton label={matterFormOpen ? "Fechar formulário de assunto" : editingMatterId ? "Continuar edição do assunto" : title.trim() || selectedClientId ? "Continuar cadastro do assunto" : "Novo assunto"}
          accessibilityHint={matterFormOpen ? "Fecha o formulário mantendo os campos preenchidos para continuar depois." : "Abre o cadastro de assunto no início da tela."}
          secondary={matterFormOpen} onPress={() => {
            if (matterFormOpen) { setMatterFormOpen(false); setConfirmDiscardMatter(false); }
            else openMatterForm();
          }} />
      </TourAnchor>;
    return <Screen title={titleLabel} subtitle={isCaseView ? "Acompanhe os processos cadastrados pelo escritório." : isClientView ? "Mantenha os contatos essenciais do escritório." : "Organize pastas de trabalho e vínculos com clientes."} scrollToTop={formNavigationVersion * 4 + viewNavigationKey} tourScreenId="cases"
      headerAction={headerAction}>
      <CollectionNavigation selected={activeView} onSelect={(view) => {
        if (view !== "courtCases") { clearQuickAction(); setOabSearchOpen(false); }
        setProcessesView(view);
      }} />
      {isClientView ? <TourAnchor id="cases.return-to-matters">
        <ActionButton label="Voltar para processos" secondary onPress={showCourtCaseList} />
      </TourAnchor> : null}
      <View style={isClientView ? undefined : { display: "none" }}>
        <ClientDirectory visible={isClientView} api={api} query={searchQueries.clients} onQueryChange={(value) => setSearchQuery("clients", value)} />
      </View>
      {!isClientView && isCaseView && caseMessage ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{caseMessage}</Text> : null}
      {!isClientView && !isCaseView && matterMessage ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{matterMessage}</Text> : null}
      {!isClientView ? <View style={styles.tight}>
        <Text style={styles.strong}>{isCaseView ? "Buscar processos" : "Buscar assuntos"}</Text>
        <AccessibleTextInput accessibilityLabel={isCaseView ? "Buscar processos cadastrados" : "Buscar assuntos cadastrados"} placeholder="Digite para filtrar" placeholderTextColor={colors.muted}
          value={query} onChangeText={updateQuery} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} autoComplete="off"
          style={[styles.input, focused && styles.focused]} autoCorrect={false} returnKeyType="search" maxLength={100} />
        {query ? <ActionButton label={isCaseView ? "Limpar busca de processos" : "Limpar busca de assuntos"} secondary onPress={() => updateQuery("")} /> : null}
      </View> : null}
      {isCaseView && !isCaseFormOpen && (oabSearchOpen || api.sessionInfo?.tenant.role === "owner") ? (
        <ActionButton label={oabSearchOpen ? "Fechar busca por OAB" : "Encontrar processos por OAB"} secondary
          onPress={() => setOabSearchOpen(!oabSearchOpen)} />
      ) : null}
      {isCaseView && oabSearchOpen ? <View style={isCaseFormOpen ? { display: "none" } : undefined}>
        <DjenDiscoveryPanel search={api.discoverCourtCases} selectionBlocked={hasCaseDraft}
          existingNumbers={new Set(api.courtCases.flatMap((item) => item.caseNumber ? [item.caseNumber.replace(/\D/g, "")] : []))}
          onSelect={(item) => {
            if (hasCaseDraft || isCaseFormOpen) return;
            setCourtName(item.tribunalCode);
            setJurisdiction(courtsWithOfficialPortals.find((court) => court.code === item.tribunalCode)?.jurisdiction ?? "");
            setCaseNumber(formatCnjCaseNumber(item.caseNumber));
            setDiscoveredNumber(item.caseNumber);
            openCaseForm();
          }} />
      </View> : null}
      {!isClientView && isCaseView ? caseForm : null}
      {!isClientView && !isCaseView && matterFormOpen ? <View testID="matter-form"><Card>
        <Heading>{editingMatterId ? "Editar assunto" : "Novo assunto"}</Heading>
        {formIssue ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{formIssue}</Text> : null}
        <AccessibleTextInput testID="matter-name-input" ref={matterNameInput} accessibilityLabel="Nome do assunto" placeholder="Ex.: Organização de documentos" placeholderTextColor={colors.muted}
          value={title} onChangeText={(value) => { setTitle(value); setFormIssue(""); }} maxLength={160} style={styles.input} />
        <Text style={styles.small}>Vincule um cliente se este assunto for de uma pessoa cadastrada.</Text>
        <View style={styles.tight}>
          <Text style={styles.strong}>Cliente (opcional)</Text>
          <ActionButton label={selectedClientId ? "Remover vínculo com cliente" : "Sem cliente vinculado"} secondary onPress={() => setSelectedClientId(null)} />
          {api.clients.filter((client) => client.status === "active" || client.id === selectedClientId).map((client) => <ActionButton key={client.id}
            label={`${selectedClientId === client.id ? "Selecionado: " : "Selecionar cliente: "}${client.displayName}${client.status === "archived" ? " (arquivado)" : ""}`}
            secondary onPress={() => setSelectedClientId(client.id)} />)}
          {api.clients.filter((client) => client.status === "active").length === 0 && !api.loading ? <Text style={styles.small}>Cadastre um cliente no diretório para vinculá-lo.</Text> : null}
        </View>
        <ActionButton label={saving ? "Salvando…" : editingMatterId ? "Salvar alterações do assunto" : "Cadastrar assunto"} disabled={saving} onPress={() => {
          if (!title.trim() || saving) { setFormIssue("Informe um nome para o assunto."); return; }
          if (editingMatterId && !api.matters.some((matter) => matter.id === editingMatterId && matter.status !== "archived")) {
            setFormIssue("Esse assunto não está mais ativo. Atualize a lista antes de editar."); return;
          }
          if (editingMatterId && !editingMatterVersion) { setFormIssue("Feche e abra novamente esta edição para conferir a versão atual."); return; }
          setSaving(true); setFormIssue(""); setMatterMessage("");
          const operation = editingMatterId && editingMatterVersion
            ? api.updateMatter(editingMatterId, title, selectedClientId, editingMatterVersion)
            : api.createMatter(title, selectedClientId);
          void operation.then(() => {
            setTitle(""); setSelectedClientId(null); setEditingMatterId(null); setEditingMatterVersion(null); setMatterFormOpen(false); setConfirmDiscardMatter(false);
            setMatterMessage(editingMatterId ? "Alterações do assunto salvas." : "Assunto cadastrado pela API.");
          }, (error: unknown) => setFormIssue(error instanceof Error ? error.message : "Não foi possível cadastrar.")).finally(() => setSaving(false));
        }} />
        <ActionButton label="Cancelar" secondary disabled={saving} onPress={() => setConfirmDiscardMatter(true)} />
        {confirmDiscardMatter ? <View style={styles.tight}>
          <Text accessibilityLiveRegion="assertive" style={styles.small}>{editingMatterId
            ? "Descartar as alterações deste formulário? O assunto salvo continuará sem mudanças."
            : "Descartar este cadastro? Os campos preenchidos serão apagados; nada foi salvo no escritório ainda."}</Text>
          <ActionButton label={editingMatterId ? "Descartar alterações do assunto" : "Descartar cadastro do assunto"} disabled={saving} onPress={discardMatterDraft} />
          <ActionButton label="Continuar preenchendo assunto" secondary disabled={saving} onPress={() => setConfirmDiscardMatter(false)} />
        </View> : null}
      </Card></View> : null}
      {!isClientView ? <ApiStatus loading={api.loading} issue={api.issue} empty={false} emptyText="" onRetry={() => void api.refresh()} /> : null}
      {isCaseView && api.sessionInfo && !api.loading && !api.issue && filteredCases.length === 0 ? <Card><Heading>Sem processos</Heading><Text style={styles.text}>{query
        ? api.courtCasesNextCursor ? "Nenhum processo correspondente entre os processos carregados. Há mais registros para consultar." : "Nenhum processo corresponde à busca."
        : "Ainda não há processos cadastrados."}</Text></Card> : null}
      {!isClientView && !isCaseView && api.sessionInfo && !api.loading && !api.issue && filteredApi.length === 0 ? <Card><Heading>Sem assuntos</Heading><Text style={styles.text}>{query ? "Nenhum assunto corresponde à busca." : "Ainda não há assuntos cadastrados."}</Text></Card> : null}
      {!isClientView && !isCaseView && api.sessionInfo && filteredApi.map((matter) => <Card key={matter.id}>
        <Text style={styles.badge}>{matter.status === "archived" ? "Arquivado" : "Ativo"}</Text>
        <Heading>{matter.title}</Heading>
        <Text style={styles.small}>Cliente: {matter.client?.displayName || "Sem cliente vinculado"}{matter.client?.status === "archived" ? " · cliente arquivado" : ""}</Text>
        {matter.description ? <Text style={styles.text}>{matter.description}</Text> : null}
        {matter.status !== "archived" ? <ActionButton label={`Editar assunto: ${matter.title}`} secondary onPress={() => {
          if (editingMatterId === matter.id) { openMatterForm(); return; }
          if (editingMatterId || title.trim() || selectedClientId) {
            setMatterMessage("Há um rascunho de assunto. Continue ou descarte-o antes de editar outro."); return;
          }
          setEditingMatterId(matter.id); setEditingMatterVersion(matter.updatedAt); setTitle(matter.title); setSelectedClientId(matter.client?.id ?? null); setFormIssue(""); setMatterMessage(""); setMatterFormOpen(true);
        }} /> : null}
        {matter.status === "archived"
          ? <ActionButton label={`Reativar assunto: ${matter.title}`} secondary disabled={statusSaving} onPress={() => {
            setStatusSaving(true); setStatusMessage("");
            void api.setMatterStatus(matter.id, "active", matter.updatedAt).then(() => setStatusMessage(`Assunto reativado: ${matter.title}.`),
              (error: unknown) => setStatusMessage(error instanceof Error ? error.message : "Não foi possível reativar o assunto.")).finally(() => setStatusSaving(false));
          }} />
          : <ActionButton label={`Arquivar assunto: ${matter.title}`} secondary disabled={statusSaving} onPress={() => { setPendingArchive({ entity: "matter", id: matter.id }); setStatusMessage(""); }} />}
        {pendingArchive?.entity === "matter" && pendingArchive.id === matter.id ? <View style={styles.tight}>
          <Text accessibilityLiveRegion="polite" style={styles.small}>O assunto ficará arquivado. O histórico e as tarefas vinculadas continuarão visíveis. Confirma?</Text>
          <ActionButton label={`Confirmar arquivamento do assunto: ${matter.title}`} disabled={statusSaving} onPress={() => {
            setStatusSaving(true); setStatusMessage("");
            void api.setMatterStatus(matter.id, "archived", matter.updatedAt).then(() => { setPendingArchive(null); setStatusMessage(`Assunto arquivado: ${matter.title}.`); },
              (error: unknown) => setStatusMessage(error instanceof Error ? error.message : "Não foi possível arquivar o assunto.")).finally(() => setStatusSaving(false));
          }} />
          <ActionButton label="Cancelar arquivamento do assunto" secondary disabled={statusSaving} onPress={() => setPendingArchive(null)} />
        </View> : null}
      </Card>)}
      {isCaseView && api.sessionInfo && filteredCases.map((courtCase) => {
        const linkedMatter = api.matters.find((matter) => matter.id === courtCase.matterId);
        const officialLookupLinks = courtCaseLookupLinks(courtCase.courtName, courtCase.jurisdiction);
        return <Card key={courtCase.id}>
          <Text style={styles.badge}>{courtCase.status === "archived" ? "Arquivado" : "Ativo"}</Text>
          <Heading>{courtCase.label || courtCase.courtName}</Heading>
          {courtCase.caseNumber ? <Text accessibilityLabel={`Número do processo: ${courtCase.caseNumber}`} style={styles.strong}>{courtCase.caseNumber}</Text> : null}
          {courtCase.label ? <Text style={styles.text}>Tribunal: {courtCase.courtName}</Text> : null}
          {courtCase.jurisdiction ? <Text style={styles.text}>Estado ou região: {courtCase.jurisdiction}</Text> : null}
                    <Text style={styles.small}>{linkedMatter ? `Assunto: ${linkedMatter.title}` : "Sem assunto vinculado"}</Text>
          <Text style={styles.small}>Cadastro manual. Nenhum tribunal foi consultado.</Text>
          {officialLookupLinks.length ? <CourtCaseLookupShortcuts links={officialLookupLinks} caseAccessibleName={courtCase.label || courtCase.caseNumber || courtCase.courtName} /> : null}
          <CourtCaseNotesPanel api={api} courtCase={courtCase} />
          <CourtPublicationsPanel api={api} courtCase={courtCase} />
          <CourtAlertsPanel courtCase={courtCase} />
          {courtCase.status !== "archived" ? <ActionButton label={`Editar processo: ${courtCase.label || courtCase.courtName}`} secondary onPress={() => {
            if (editingCaseId === courtCase.id) { openCaseForm(); return; }
            if (hasCaseDraft) { setCaseMessage("Há um rascunho de processo. Continue ou descarte-o antes de editar outro."); return; }
            setEditingCaseId(courtCase.id); setCourtName(courtCase.courtName); setJurisdiction(courtCase.jurisdiction ?? "");
            setCaseNumber(courtCase.caseNumber ?? ""); setCaseLabel(courtCase.label ?? ""); setSelectedMatterId(courtCase.matterId ?? null);
            setEditingCaseVersion(courtCase.updatedAt); setCaseIssue(""); openCaseForm();
          }} /> : null}
          {courtCase.status === "archived"
            ? <ActionButton label={`Reativar processo: ${courtCase.label || courtCase.courtName}`} secondary disabled={statusSaving} onPress={() => {
              setStatusSaving(true); setStatusMessage("");
              void api.setCourtCaseStatus(courtCase.id, "active", courtCase.updatedAt).then(() => setStatusMessage(`Processo reativado: ${courtCase.label || courtCase.courtName}.`),
                (error: unknown) => setStatusMessage(error instanceof Error ? error.message : "Não foi possível reativar o processo.")).finally(() => setStatusSaving(false));
            }} />
            : <ActionButton label={`Arquivar processo: ${courtCase.label || courtCase.courtName}`} secondary disabled={statusSaving} onPress={() => { setPendingArchive({ entity: "court-case", id: courtCase.id }); setStatusMessage(""); }} />}
          {pendingArchive?.entity === "court-case" && pendingArchive.id === courtCase.id ? <View style={styles.tight}>
            <Text accessibilityLiveRegion="polite" style={styles.small}>O processo ficará arquivado e continuará disponível no histórico. Confirma?</Text>
            <ActionButton label={`Confirmar arquivamento do processo: ${courtCase.label || courtCase.courtName}`} disabled={statusSaving} onPress={() => {
              setStatusSaving(true); setStatusMessage("");
              void api.setCourtCaseStatus(courtCase.id, "archived", courtCase.updatedAt).then(() => { setPendingArchive(null); setStatusMessage(`Processo arquivado: ${courtCase.label || courtCase.courtName}.`); },
                (error: unknown) => setStatusMessage(error instanceof Error ? error.message : "Não foi possível arquivar o processo.")).finally(() => setStatusSaving(false));
            }} />
            <ActionButton label="Cancelar arquivamento do processo" secondary disabled={statusSaving} onPress={() => setPendingArchive(null)} />
          </View> : null}
        </Card>;
      })}
      {isCaseView && api.sessionInfo && api.courtCasesNextCursor ? <Card>
        <Text style={styles.small}>{query
          ? `A busca considera os ${api.courtCases.length} processos já carregados. Carregue mais para ampliar a busca.`
          : `Você carregou ${api.courtCases.length} processos. Há mais registros nesta lista.`}</Text>
        {api.courtCasesIssue ? <Text accessibilityLiveRegion="assertive" style={styles.small}>{api.courtCasesIssue}</Text> : null}
        <ActionButton label={api.courtCasesLoading ? "Carregando processos…" : api.courtCasesIssue ? "Tentar carregar mais processos" : "Carregar mais processos"}
          secondary disabled={api.courtCasesLoading} onPress={() => void api.loadMoreCourtCases()} />
      </Card> : null}
      {!isClientView && statusMessage ? <Text accessibilityLiveRegion="polite" style={styles.small}>{statusMessage}</Text> : null}
      {!isClientView && api.sessionInfo?.tenant.role === "owner" ? <ActionButton label="Configurações de integrações" secondary onPress={() => setIntegrationsView(true)} /> : null}
    </Screen>;
  }
  const filtered = matters.filter((matter) => normalizeWorkspaceSearch(`${matter.title} ${matter.label}`).includes(normalizeWorkspaceSearch(query)));
  return (
    <Screen title="Seus assuntos" subtitle="Encontre o próximo passo sem perder o contexto." tourScreenId="cases">
      <View style={styles.tight}>
        <Text style={styles.strong}>Buscar nos exemplos</Text>
        <AccessibleTextInput accessibilityLabel="Buscar um assunto fictício" placeholder="Ex.: contrato ou documentos"
          placeholderTextColor={colors.muted} value={query} onChangeText={updateQuery}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={[styles.input, focused && styles.focused]} autoCorrect={false} returnKeyType="search" maxLength={100} />
        <Text style={styles.small}>Use somente palavras de exemplo. Não digite dados de clientes.</Text>
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.small}>{filtered.length} {filtered.length === 1 ? "assunto fictício encontrado" : "assuntos fictícios encontrados"}</Text>
      {filtered.map((matter) => <Card key={matter.id}>
        <Text style={styles.badge}>{matter.label}</Text>
        <Heading>{matter.title}</Heading>
        <Text style={styles.text}>Próximo passo: {matter.nextStep}.</Text>
        <Text style={styles.small}>Origem: demonstração local. Sem número de processo, tribunal ou andamento judicial.</Text>
      </Card>)}
      {filtered.length === 0 && <Card><Heading>Nenhum exemplo encontrado</Heading><Text style={styles.text}>Tente “contrato”, “documentos” ou apague a busca.</Text></Card>}
    </Screen>
  );
}

function ApiStatus({ loading, issue, empty, emptyText, onRetry }: { loading: boolean; issue: string | null; empty: boolean; emptyText: string; onRetry: () => void }) {
  if (loading) return <Text accessibilityLiveRegion="polite" style={styles.small}>Carregando dados do escritório…</Text>;
  if (issue) return <Card><Heading>Não foi possível carregar</Heading><Text accessibilityLiveRegion="assertive" style={styles.text}>{issue}</Text><ActionButton label="Tentar novamente" secondary onPress={onRetry} /></Card>;
  if (empty) return <Card><Heading>Lista vazia</Heading><Text style={styles.text}>{emptyText}</Text></Card>;
  return null;
}

function CollectionNavigation({ selected, onSelect }: { selected: "matters" | "courtCases" | "clients"; onSelect: (view: "matters" | "courtCases" | "clients") => void }) {
  const tabs = [
    { id: "matters" as const, label: "Assuntos" },
    { id: "courtCases" as const, label: "Processos" },
    { id: "clients" as const, label: "Clientes" },
  ];
  return <View accessibilityLabel="Coleções do escritório" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
    {tabs.map((tab) => <CollectionTab key={tab.id} id={tab.id} label={tab.label} selected={selected === tab.id} onPress={() => onSelect(tab.id)} />)}
  </View>;
}

function CollectionTab({ id, label, selected, onPress }: { id: string; label: string; selected: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return <Pressable testID={`process-collection-${id}`} accessibilityRole="tab" accessibilityLabel={label}
    accessibilityState={{ selected }} aria-selected={selected} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.button, !selected && styles.buttonSecondary, focused && styles.focused, pressed && styles.pressed,
      { flexGrow: 1, flexBasis: 92, minWidth: 88, paddingHorizontal: 8 }] }>
    <Text style={[styles.buttonLabel, !selected && styles.buttonLabelSecondary, { fontSize: 14 }]}>{label}</Text>
  </Pressable>;
}

type WorkData = ReturnType<typeof useWorkData>;

function CourtCaseNotesPanel({ api, courtCase }: { api: WorkData; courtCase: WorkData["courtCases"][number] }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<WorkData["loadCourtCaseNotes"]>> | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState("");
  const [message, setMessage] = useState("");
  const caseAccessibleName = courtCase.label || courtCase.caseNumber || courtCase.courtName;

  const load = async () => {
    if (loading) return;
    setLoading(true); setIssue("");
    try { setData(await api.loadCourtCaseNotes(courtCase.id)); }
    catch (error) { setIssue(error instanceof Error ? error.message : "Não foi possível carregar as anotações."); }
    finally { setLoading(false); }
  };

  const save = async () => {
    if (saving || !body.trim() || courtCase.status !== "active") return;
    setSaving(true); setIssue(""); setMessage("");
    try {
      await api.createCourtCaseNote(courtCase.id, body);
      setBody("");
      setData(await api.loadCourtCaseNotes(courtCase.id));
      setMessage("Anotação salva no histórico do processo.");
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível salvar a anotação.");
    } finally { setSaving(false); }
  };

  return <View style={styles.tight}>
    <ActionButton label={expanded ? "Fechar anotações internas" : "Anotações e contatos"}
      accessibilityLabel={`${expanded ? "Fechar anotações internas" : "Anotações e contatos"}: ${caseAccessibleName}`} secondary onPress={() => {
      const next = !expanded; setExpanded(next);
      if (next && !data) void load();
    }} />
    {expanded ? <View style={styles.tight}>
      <Text style={styles.small}>Registro interno do escritório. Não é enviado ao tribunal; integrantes autorizados do escritório podem ler as anotações.</Text>
      {loading ? <Text accessibilityLiveRegion="polite" style={styles.small}>Carregando histórico…</Text> : null}
      {issue ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{issue}</Text> : null}
      {data?.items.map((note) => <View key={note.id} style={styles.tight}>
        <Text style={styles.badge}>Anotação manual · {new Date(note.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</Text>
        <Text selectable style={styles.text}>{note.body}</Text>
        <View style={styles.divider} />
      </View>)}
      {data && data.items.length === 0 ? <Text style={styles.small}>Ainda não há anotações neste processo.</Text> : null}
      {courtCase.status === "active" ? <>
        <AccessibleTextInput accessibilityLabel="Nova anotação interna do processo" placeholder="Registre uma ligação, orientação ou providência…"
          placeholderTextColor={colors.muted} value={body} onChangeText={setBody} maxLength={8000}
          multiline textAlignVertical="top" style={[styles.input, { minHeight: 132 }]} />
        <Text style={styles.small}>{body.length}/8000 caracteres · notas são adicionadas ao histórico e não podem ser editadas ou apagadas nesta versão.</Text>
        <ActionButton label={saving ? "Salvando anotação…" : "Adicionar anotação ao histórico"} disabled={saving || !body.trim()} onPress={() => void save()} />
      </> : <Text style={styles.small}>Processo arquivado: histórico disponível para leitura, novas anotações desativadas.</Text>}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text> : null}
    </View> : null}
  </View>;
}

function CourtPublicationsPanel({ api, courtCase }: { api: WorkData; courtCase: WorkData["courtCases"][number] }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<WorkData["loadCourtPublications"]>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState("");
  const [message, setMessage] = useState("");
  const caseAccessibleName = courtCase.label || courtCase.caseNumber || courtCase.courtName;
  const validProcessNumber = Boolean(courtCase.caseNumber && isValidCnjCaseNumber(courtCase.caseNumber));
  const owner = api.sessionInfo?.tenant.role === "owner";

  const load = async () => {
    if (loading) return;
    setLoading(true); setIssue("");
    try { setData(await api.loadCourtPublications(courtCase.id)); }
    catch (error) { setIssue(error instanceof Error ? error.message : "Não foi possível carregar publicações salvas."); }
    finally { setLoading(false); }
  };

  const sync = async () => {
    if (loading || courtCase.status === "archived") return;
    setLoading(true); setIssue(""); setMessage("");
    try {
      const result = await api.syncCourtPublications(courtCase.id);
      setData(result);
      setMessage(result.sync.status === "empty_unconfirmed"
        ? "A fonte respondeu sem itens. Isso não confirma que não houve publicação."
        : `A fonte retornou ${result.sync.returnedCount} item(ns) nesta consulta.`);
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível consultar o DJEN.");
    } finally { setLoading(false); }
  };

  const changeReview = async (item: NonNullable<typeof data>["items"][number]) => {
    if (loading || courtCase.status !== "active") return;
    const nextStatus = item.review.status === "reviewed" ? "pending" : "reviewed";
    setLoading(true); setIssue(""); setMessage("");
    try {
      const review = await api.setCourtPublicationReview(courtCase.id, item.sourceHash, nextStatus, item.review.updatedAt);
      setData((current) => current ? {
        ...current,
        items: current.items.map((candidate) => candidate.sourceHash === item.sourceHash ? { ...candidate, review } : candidate),
      } : current);
      setMessage(nextStatus === "reviewed"
        ? "Marcada como conferida internamente. Isso não confirma ciência nem prazo processual."
        : "Publicação devolvida para conferência interna.");
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível atualizar a conferência interna.");
      try { setData(await api.loadCourtPublications(courtCase.id)); } catch { /* Preserve the last saved view if refresh also fails. */ }
    } finally { setLoading(false); }
  };

  return <View style={styles.tight}>
    <ActionButton label={expanded ? "Fechar publicações do DJEN" : "Acompanhamento de publicações do DJEN"}
      accessibilityLabel={`${expanded ? "Fechar publicações do DJEN" : "Acompanhamento de publicações do DJEN"}: ${caseAccessibleName}`} secondary onPress={() => {
      const next = !expanded; setExpanded(next);
      if (next) void load();
    }} />
    {expanded ? <View style={styles.tight}>
      <Text style={styles.small}>Consulta manual ao DJEN público, somente para este processo. O número será enviado ao CNJ. O app não calcula nem confirma prazos; confira sempre o portal oficial.</Text>
      {!validProcessNumber ? <Text style={styles.small}>Para consultar, cadastre um número CNJ válido de 20 dígitos. Identificadores locais continuam úteis para organização, mas não consultam o DJEN.</Text> : null}
      {loading ? <Text accessibilityLiveRegion="polite" style={styles.small}>Carregando publicações salvas…</Text> : null}
      {issue ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{issue}</Text> : null}
      {data && !data.providerEnabled ? <Text style={styles.small}>O conector está desligado neste ambiente enquanto a validação técnica do DJEN não termina. As consultas salvas continuam disponíveis.</Text> : null}
      {data?.sync.checkedAt ? <Text style={styles.small}>Última consulta: {new Date(data.sync.checkedAt).toLocaleString("pt-BR")} · {data.sync.environment === "production" ? "produção" : "homologação"}</Text> : null}
      {data?.sync.warningCode === "coverage_unverified" ? <Text style={styles.small}>A fonte retornou itens, mas a cobertura e a paginação ainda não foram confirmadas. Confira também o Jus.br e o portal do tribunal.</Text> : null}
      {data?.sync.warningCode === "empty_unconfirmed" ? <Text style={styles.small}>Resposta vazia não confirma ausência de comunicações. Confira o Jus.br e o portal do tribunal.</Text> : null}
      {data?.sync.warningCode === "source_unavailable" || data?.sync.warningCode === "invalid_response"
        ? <Text style={styles.small}>A última tentativa não confirmou a situação no DJEN. Os itens salvos foram preservados; confira a fonte oficial.</Text> : null}
      {data ? <ActionButton label="Abrir consulta oficial do DJEN" secondary onPress={() => {
        void Linking.openURL(data.sourceUrl).catch(() => setIssue("Não foi possível abrir o portal oficial do DJEN."));
      }} /> : null}
      {data?.items.map((item) => <View key={`${item.environment}-${item.sourceHash}`} style={styles.tight}>
        <Text style={styles.badge}>{item.communicationType || "Comunicação do DJEN"}</Text>
        <Text style={styles.text}>{item.availableOn ? `Disponibilizada em ${item.availableOn}` : "Data não informada pela fonte"}{item.tribunalCode ? ` · ${item.tribunalCode}` : ""}</Text>
        <Text accessibilityLabel={item.review.status === "reviewed" ? "Revisão interna concluída" : "Publicação pendente de conferência interna"} style={styles.badge}>
          {item.review.status === "reviewed" ? `Conferida internamente · ${item.review.reviewedAt ? new Date(item.review.reviewedAt).toLocaleString("pt-BR") : "data indisponível"}` : "Pendente de conferência interna"}
        </Text>
        {courtCase.status === "active" ? <ActionButton
          label={item.review.status === "reviewed" ? "Voltar para pendentes de conferência" : "Marcar publicação como conferida"}
          accessibilityHint="Controle interno do escritório. Não confirma ciência, intimação ou prazo judicial."
          secondary disabled={loading || (item.review.status === "reviewed" && !item.review.updatedAt)}
          onPress={() => void changeReview(item)} /> : null}
        <ActionButton label="Abrir certidão oficial" secondary onPress={() => {
          void Linking.openURL(item.certificateUrl).catch(() => setIssue("Não foi possível abrir a certidão do DJEN."));
        }} />
      </View>)}
      {data?.items.length === 0 && data.sync.status === "not_checked" ? <Text style={styles.small}>Ainda não há publicações salvas.</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.small}>{message}</Text> : null}
      {data?.items.length ? <Text style={styles.small}>A conferência é um controle interno e não confirma ciência, início de prazo ou ausência de outras comunicações.</Text> : null}
      {data?.providerEnabled && owner && validProcessNumber && courtCase.status !== "archived" ? <ActionButton
        label={loading ? "Consultando DJEN…" : "Consultar publicações agora"}
        accessibilityHint="Envia o número CNJ deste processo para uma consulta GET pública ao DJEN. Não abre a comunicação nem cria prazo."
        disabled={loading} onPress={() => void sync()} /> : null}
      {courtCase.status === "archived" ? <Text style={styles.small}>Processo arquivado: histórico disponível para leitura, novas consultas desativadas.</Text> : null}
      {owner && data && !data.providerEnabled ? <ActionButton label="Atualizar lista salva" secondary disabled={loading} onPress={() => void load()} /> : null}
    </View> : null}
  </View>;
}

type CourtAlertGuide = {
  description: string;
  links: { label: string; url: string }[];
};

function courtAlertGuide(courtName: string, jurisdiction: string | null | undefined): CourtAlertGuide {
  const identity = normalizeWorkspaceSearch(`${courtName} ${jurisdiction ?? ""}`);
  if (/\btjsc\b|santa catarina/.test(identity)) {
    return {
      description: "No eproc/TJSC, cadastre um e-mail no perfil e ative “Receber prazos por email?”. O tribunal informa que os avisos cobrem eventos lançados com prazo quando a advogada está associada ao processo. O e-mail é informativo e não substitui a conferência no eproc e no DJEN. Este app não recebe nem confirma esses e-mails.",
      links: [
        { label: "Abrir eproc TJSC · 1º grau", url: "https://eproc1g.tjsc.jus.br/eproc/" },
        { label: "Abrir eproc TJSC · 2º grau", url: "https://eproc2g.tjsc.jus.br/eproc/" },
      ],
    };
  }
  if (/\btrf\s?4\b|tribunal regional federal.{0,16}4/.test(identity)) {
    return {
      description: "O TRF4 oferece o Sob Medida para cadastrar processos manualmente ou pela OAB e enviar avisos por e-mail. O cadastro é feito no serviço oficial; as fontes consultadas não documentam API/webhook para trazer esses avisos ao app. A entrega de e-mail pode falhar. Confira sempre no portal do tribunal.",
      links: [{ label: "Ver instruções do TRF4 Sob Medida", url: "https://www.trf4.jus.br/trf4/controlador.php?acao=pagina_visualizar&id_pagina=84" }],
    };
  }
  if (/\btjpr\b|parana/.test(identity)) {
    return {
      description: "A Resolução TJPR 532/2026 prevê consulta automatizada sem login para movimentações públicas pelo SCMPP, mas o manual técnico ainda descreve um acesso legado. O app mantém a atualização automática desligada até o TJPR confirmar o contrato técnico atual. O SCMPP também não substitui avisos de publicação nem o DJEN.",
      links: [{ label: "Abrir portal do TJPR", url: "https://www.tjpr.jus.br/" }],
    };
  }
  if (/\btjrs\b|rio grande do sul/.test(identity)) {
    return {
      description: "Segundo a FAQ oficial, o TJRS Push é gratuito e envia por e-mail movimentações do dia anterior dos processos cadastrados, em geral na manhã seguinte, salvo exceções. O limite publicado é de 300 processos por pessoa e pode mudar. O TJRS classifica o serviço como meramente informativo, sem caráter oficial, e orienta advogados a usar o Portal do Processo Eletrônico para acompanhar processos de 1º e 2º graus. O cadastro (que pede CPF, e-mail e senha) é feito diretamente no TJRS; este app não recebe os avisos nem guarda essa senha. Confira também no tribunal e no DJEN.",
      links: [
        { label: "Abrir TJRS Push (serviço de e-mail)", url: "https://www.tjrs.jus.br/proc/sistema_push/" },
        { label: "Ler FAQ oficial do TJRS Push", url: "https://www.tjrs.jus.br/proc/sistema_push/faq.php" },
      ],
    };
  }
  return {
    description: "O canal de alerta deste tribunal ainda não foi validado para integração com o app. Use a conta e o portal oficiais do tribunal para ativar notificações. O app não lê sua caixa de e-mail nem informa que está monitorando o processo.",
    links: [{ label: "Ver comunicações no portal oficial do CNJ", url: "https://www.cnj.jus.br/jus-br/" }],
  };
}

function CourtCaseLookupShortcuts({ links, caseAccessibleName }: { links: CourtCaseLookupLink[]; caseAccessibleName: string }) {
  const [issue, setIssue] = useState("");
  return <View style={styles.tight}>
    {links.map((link) => <ActionButton key={link.url} label={link.label} accessibilityLabel={`${link.label}: ${caseAccessibleName}`} secondary onPress={() => {
      setIssue("");
      void Linking.openURL(link.url).catch(() => setIssue("Não foi possível abrir a consulta oficial. Tente novamente pelo navegador."));
    }} />)}
    <Text style={styles.small}>Consulta manual no portal oficial. O app não envia o número do processo nem importa o resultado.</Text>
    {issue ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{issue}</Text> : null}
  </View>;
}

function CourtAlertsPanel({ courtCase }: { courtCase: WorkData["courtCases"][number] }) {
  const [expanded, setExpanded] = useState(false);
  const [issue, setIssue] = useState("");
  const guide = courtAlertGuide(courtCase.courtName, courtCase.jurisdiction);
  const caseAccessibleName = courtCase.label || courtCase.caseNumber || courtCase.courtName;
  return <View style={styles.tight}>
    <ActionButton label={expanded ? "Fechar instruções de alertas oficiais" : "Como receber alertas deste tribunal"}
      accessibilityLabel={`${expanded ? "Fechar instruções de alertas oficiais" : "Como receber alertas deste tribunal"}: ${caseAccessibleName}`}
      accessibilityHint="Mostra como configurar alertas no sistema oficial e informa se este app está conectado."
      secondary onPress={() => { setExpanded((current) => !current); setIssue(""); }} />
    {expanded ? <View testID="official-alerts-guide" style={styles.tight}>
      <Text style={styles.badge}>Configuração feita no tribunal · sem sincronização de e-mail com o app</Text>
      <Text style={styles.text}>{guide.description}</Text>
      {guide.links.map((link) => <ActionButton key={link.url} label={link.label} secondary onPress={() => {
        void Linking.openURL(link.url).catch(() => setIssue("Não foi possível abrir a página oficial. Tente novamente pelo navegador."));
      }} />)}
      <ActionButton label="Abrir comunicações do CNJ (Jus.br)" secondary onPress={() => {
        void Linking.openURL("https://www.cnj.jus.br/jus-br/").catch(() => setIssue("Não foi possível abrir a página oficial do CNJ."));
      }} />
      {issue ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{issue}</Text> : null}
    </View> : null}
  </View>;
}

function ClientDirectory({ visible, api, query, onQueryChange }: { visible: boolean; api: WorkData; query: string; onQueryChange: (value: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState("");
  const [message, setMessage] = useState("");
  const nameInput = useRef<TextInputInstance>(null);
  const normalizedQuery = normalizeWorkspaceSearch(query);
  const filteredClients = api.clients.filter((client) => normalizeWorkspaceSearch(`${client.displayName} ${client.email ?? ""} ${client.phone ?? ""}`).includes(normalizedQuery));
  const hasDraft = Boolean(editingId || name.trim() || email.trim() || phone.trim());

  useEffect(() => {
    if (Platform.OS !== "web" || !visible || !formOpen) return;
    const frame = requestAnimationFrame(() => nameInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [formOpen, visible]);

  const resetForm = () => {
    setName(""); setEmail(""); setPhone(""); setEditingId(null); setEditingVersion(null); setIssue(""); setConfirmDiscard(false);
  };

  const saveClient = () => {
    if (!name.trim()) { setIssue("Informe o nome do cliente."); return; }
    if (saving) return;
    if (editingId && !editingVersion) { setIssue("Feche e abra novamente esta edição para conferir a versão atual."); return; }
    setSaving(true); setIssue(""); setMessage("");
    const input = { displayName: name, email: email || null, phone: phone || null };
    const operation = editingId && editingVersion
      ? api.updateClient(editingId, input, editingVersion)
      : api.createClient(input);
    void operation.then(() => {
      const wasEditing = Boolean(editingId);
      resetForm(); setFormOpen(false); setMessage(wasEditing ? "Alterações do cliente salvas." : "Cliente cadastrado.");
    }, (error: unknown) => setIssue(error instanceof Error ? error.message : "Não foi possível salvar o cliente."))
      .finally(() => setSaving(false));
  };

  const changeStatus = (client: WorkData["clients"][number], status: "active" | "archived") => {
    if (saving) return;
    setSaving(true); setIssue(""); setMessage("");
    void api.setClientStatus(client.id, status, client.updatedAt).then(() => {
      setPendingArchive(null); setMessage(status === "archived" ? `Cliente arquivado: ${client.displayName}.` : `Cliente reativado: ${client.displayName}.`);
    }, (error: unknown) => setIssue(error instanceof Error ? error.message : "Não foi possível alterar o status do cliente."))
      .finally(() => setSaving(false));
  };

  return <>
    <ActionButton label={formOpen ? "Fechar formulário de cliente" : editingId ? "Continuar edição do cliente" : hasDraft ? "Continuar cadastro do cliente" : "Novo cliente"}
      secondary={formOpen} accessibilityHint={formOpen ? "Fecha o formulário mantendo os campos para continuar depois." : "Abre o cadastro de cliente antes da lista."}
      onPress={() => { setFormOpen((open) => !open); setConfirmDiscard(false); setIssue(""); }} />
    {formOpen ? <Card testID="client-form">
      <Heading>{editingId ? "Editar cliente" : "Novo cliente"}</Heading>
      {issue ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{issue}</Text> : null}
      <AccessibleTextInput testID="client-name-input" ref={nameInput} accessibilityLabel="Nome do cliente" placeholder="Nome" placeholderTextColor={colors.muted} value={name} onChangeText={(value) => { setName(value); setIssue(""); }} maxLength={160} style={styles.input} />
      <AccessibleTextInput testID="client-email-input" accessibilityLabel="E-mail do cliente, opcional" placeholder="E-mail (opcional)" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} style={styles.input} />
      <AccessibleTextInput testID="client-phone-input" accessibilityLabel="Telefone do cliente, opcional" placeholder="Telefone (opcional)" placeholderTextColor={colors.muted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={40} style={styles.input} />
      <ActionButton label={saving ? "Salvando…" : editingId ? "Salvar alterações do cliente" : "Cadastrar cliente"} disabled={saving} onPress={saveClient} />
      <ActionButton label="Cancelar" secondary disabled={saving} onPress={() => setConfirmDiscard(true)} />
      {confirmDiscard ? <View style={styles.tight}>
        <Text accessibilityLiveRegion="assertive" style={styles.small}>{editingId
          ? "Descartar as alterações deste formulário? O cadastro salvo continuará sem mudanças."
          : "Descartar este cadastro? Os campos preenchidos serão apagados; nada foi salvo no escritório ainda."}</Text>
        <ActionButton label={editingId ? "Descartar alterações do cliente" : "Descartar cadastro do cliente"} disabled={saving} onPress={() => { resetForm(); setFormOpen(false); }} />
        <ActionButton label="Continuar preenchendo cliente" secondary disabled={saving} onPress={() => setConfirmDiscard(false)} />
      </View> : null}
    </Card> : null}
    <View style={styles.tight}>
      <Text style={styles.strong}>Buscar clientes</Text>
      <AccessibleTextInput accessibilityLabel="Buscar clientes por nome, e-mail ou telefone" placeholder="Digite para filtrar" placeholderTextColor={colors.muted}
        value={query} onChangeText={onQueryChange} style={styles.input} autoCorrect={false} autoComplete="off" returnKeyType="search" maxLength={120} />
      {query ? <ActionButton label="Limpar busca de clientes" secondary onPress={() => onQueryChange("")} /> : null}
    </View>
    <ApiStatus loading={api.loading} issue={api.issue} empty={false} emptyText="" onRetry={() => void api.refresh()} />
    {api.sessionInfo && !api.loading && !api.issue && filteredClients.length === 0 ? <Card>
      <Heading>{query ? "Nenhum cliente encontrado" : "Diretório vazio"}</Heading>
      <Text style={styles.text}>{query ? "Nenhum cadastro corresponde à busca." : "Cadastre o primeiro cliente pelo botão Novo cliente acima."}</Text>
    </Card> : null}
    {api.sessionInfo && filteredClients.map((client) => <Card key={client.id}>
      <Text style={styles.badge}>{client.status === "archived" ? "Arquivado" : "Ativo"}</Text>
      <Heading>{client.displayName}</Heading>
      {client.email ? <Text style={styles.text}>{client.email}</Text> : null}
      {client.phone ? <Text style={styles.text}>{client.phone}</Text> : null}
      {client.status === "active" ? <ActionButton label={`Editar cliente: ${client.displayName}`} secondary onPress={() => {
        if (editingId === client.id) { setFormOpen(true); setIssue(""); setMessage(""); return; }
        if (hasDraft) { setMessage("Há um rascunho de cliente. Continue ou descarte-o antes de editar outro."); return; }
        setEditingId(client.id); setEditingVersion(client.updatedAt); setName(client.displayName); setEmail(client.email ?? ""); setPhone(client.phone ?? ""); setIssue(""); setMessage(""); setConfirmDiscard(false); setFormOpen(true);
      }} /> : null}
      {client.status === "archived"
        ? <ActionButton label={`Reativar cliente: ${client.displayName}`} secondary disabled={saving} onPress={() => changeStatus(client, "active")} />
        : <ActionButton label={`Arquivar cliente: ${client.displayName}`} secondary disabled={saving} onPress={() => { setPendingArchive(client.id); setIssue(""); setMessage(""); }} />}
      {pendingArchive === client.id ? <View style={styles.tight}>
        <Text style={styles.small}>O cadastro ficará arquivado e continuará disponível nos assuntos já vinculados. Confirma?</Text>
        <ActionButton label={`Confirmar arquivamento do cliente: ${client.displayName}`} disabled={saving} onPress={() => changeStatus(client, "archived")} />
        <ActionButton label="Cancelar arquivamento do cliente" secondary disabled={saving} onPress={() => setPendingArchive(null)} />
      </View> : null}
    </Card>)}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.small}>{message}</Text> : null}
    {issue && !formOpen ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{issue}</Text> : null}
  </>;
}
