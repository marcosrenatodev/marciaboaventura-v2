import { AccessibleTextInput } from "@/components/AccessibleTextInput";
import { TourAnchor } from "@/TourAnchors";
import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, useWindowDimensions, View, type TextInputInstance } from "react-native";
import { ActionButton, Card, Heading, Screen } from "@/components/Ui";
import { amountToReceive, financialEntries, formatMoney } from "@/demo";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { colors, styles } from "@/theme";
import { dateInputToIso, formatDateInputDraft, isoDateToInput } from "@/zoned-time";
import { formatCentsInput, parseMoneyInput, sumCents } from "@/money";
import { normalizeWorkspaceSearch } from "@/search";
import { useWorkspaceSearchNavigation } from "@/WorkspaceSearchNavigation";

function localDateKey(date: Date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? match[3] + "/" + match[2] + "/" + match[1] : value;
}

function dueLabel(dueOn: string | null | undefined, today: string) {
  if (!dueOn) return "Sem vencimento informado";
  if (dueOn < today) return "Vencida em " + formatDate(dueOn);
  if (dueOn === today) return "Vence hoje";
  return "Vence em " + formatDate(dueOn);
}

export default function FinanceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ quick?: string | string[] }>();
  const quickAction = Array.isArray(params.quick) ? params.quick[0] : params.quick;
  const hasQuickAction = quickAction === "income" || quickAction === "expense";
  const { searchQueries, setSearchQuery } = useWorkspaceSearchNavigation();
  const searchQuery = searchQueries.finance;
  const normalizedSearch = normalizeWorkspaceSearch(searchQuery);
  const descriptionInput = useRef<TextInputInstance>(null);
  const { width } = useWindowDimensions();
  const { demoMode } = useAuth();
  const api = useWorkData();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [category, setCategory] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const initialQuickKind = quickAction === "expense" ? "expense" : "income";
  const [kindSelection, setKindSelection] = useState<{ route: string | undefined; kind: "income" | "expense" }>(() => ({ route: quickAction, kind: initialQuickKind }));
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntryVersion, setEditingEntryVersion] = useState<string | null>(null);
  const hasFinancialDraft = Boolean(editingEntryId || description.trim() || amount.trim() || dueOn.trim() || category.trim());
  const kind = hasFinancialDraft || kindSelection.route === quickAction ? kindSelection.kind : initialQuickKind;
  const setKind = (value: "income" | "expense") => setKindSelection({ route: quickAction, kind: value });
  const isFormOpen = formOpen || hasQuickAction;
  const [formNavigationVersion, setFormNavigationVersion] = useState(0);
  const [formIssue, setFormIssue] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [entryMessages, setEntryMessages] = useState<Record<string, string>>({});
  const [pendingCancellationEntryId, setPendingCancellationEntryId] = useState<string | null>(null);
  const [statusSavingEntryId, setStatusSavingEntryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    if (!hasQuickAction) return;
    setKindSelection((current) => ({ route: quickAction, kind: hasFinancialDraft ? current.kind : initialQuickKind }));
    if (hasFinancialDraft) setNoticeMessage("Você já tem um rascunho financeiro. Confira o tipo antes de salvar ou descarte-o para começar outro.");
  // Apply the shortcut once when its route changes; edits must not reset the selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAction]);
  useEffect(() => {
    if (demoMode || !isFormOpen) return;
    const frame = requestAnimationFrame(() => descriptionInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [demoMode, isFormOpen, quickAction]);
  const clearQuickAction = () => {
    if (hasQuickAction) router.setParams({ quick: undefined });
  };
  const openForm = () => {
    setFormOpen(true);
    setFormIssue("");
    setNoticeMessage("");
    setFormNavigationVersion((version) => version + 1);
  };
  const closeForm = () => {
    setFormOpen(false);
    setFormIssue("");
    clearQuickAction();
  };
  const resetForm = () => {
    setDescription(""); setAmount(""); setDueOn(""); setCategory(""); setKind("income"); setEditingEntryId(null); setEditingEntryVersion(null);
    setConfirmDiscard(false);
  };
  const changeEntryStatus = (entryId: string, status: "paid" | "cancelled", expectedUpdatedAt: string) => {
    if (statusSavingEntryId) return;
    setStatusSavingEntryId(entryId);
    setEntryMessages((current) => ({ ...current, [entryId]: "" }));
    void api.setFinancialStatus(entryId, status, expectedUpdatedAt)
      .then(() => {
        setEntryMessages((current) => ({
          ...current,
          [entryId]: status === "cancelled" ? "Lançamento cancelado." : "Lançamento atualizado.",
        }));
        setPendingCancellationEntryId(null);
      }, (error: unknown) => {
        setEntryMessages((current) => ({
          ...current,
          [entryId]: error instanceof Error ? error.message : "Não foi possível atualizar o lançamento.",
        }));
      })
      .finally(() => setStatusSavingEntryId(null));
  };
  const saveEntry = () => {
    const amountCents = parseMoneyInput(amount);
    const normalizedDueOn = dueOn.trim() ? dateInputToIso(dueOn) : null;
    const validDueOn = !dueOn.trim() || normalizedDueOn !== null;
    if (!description.trim() || amountCents === null || saving) {
      setFormIssue("Informe uma descrição e um valor maior que zero, com até duas casas decimais."); return;
    }
    if (!validDueOn) {
      setFormIssue("Informe uma data válida no formato DD/MM/AAAA ou deixe o vencimento em branco."); return;
    }
    if (editingEntryId && !api.financialEntries.some((entry) => entry.id === editingEntryId && entry.status === "planned")) {
      setFormIssue("Esse lançamento não está mais previsto. Atualize a lista antes de editar."); return;
    }
    if (editingEntryId && !editingEntryVersion) { setFormIssue("Feche e abra novamente esta edição para conferir a versão atual."); return; }
    setSaving(true); setFormIssue(""); setNoticeMessage("");
    const payload = { description, amountCents, kind, dueOn: normalizedDueOn || null, category: category.trim() || null };
    const wasEditing = Boolean(editingEntryId);
    const operation = editingEntryId && editingEntryVersion
      ? api.updateFinancialEntry(editingEntryId, payload, editingEntryVersion)
      : api.createFinancialEntry(payload);
    void operation.then(() => {
      resetForm(); setFormOpen(false); clearQuickAction();
      setNoticeMessage(wasEditing ? "Alterações salvas." : "Lançamento confirmado pela API.");
    }, (error: unknown) => setFormIssue(error instanceof Error ? error.message : "Não foi possível salvar o lançamento."))
      .finally(() => setSaving(false));
  };
  if (!demoMode) {
    const plannedEntries = api.financialEntries.filter((entry) => (entry.status ?? "planned") === "planned");
    const searchedEntries = api.financialEntries.filter((entry) => normalizeWorkspaceSearch(`${entry.description} ${entry.category ?? ""}`).includes(normalizedSearch));
    const incomePlanned = plannedEntries.filter((entry) => entry.kind === "income").map((entry) => entry.amountCents);
    const expensePlanned = plannedEntries.filter((entry) => entry.kind === "expense").map((entry) => entry.amountCents);
    const today = localDateKey(new Date());
    const hasDraft = hasFinancialDraft;
    const entryForm = isFormOpen ? <View testID="finance-entry-form"><Card>
        <Heading>{editingEntryId ? "Editar lançamento" : "Novo lançamento"}</Heading>
        {formIssue ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{formIssue}</Text> : null}
        <Text style={styles.strong}>Tipo do lançamento</Text>
        <View style={width < 480 ? styles.stack : styles.columns}>
          <ActionButton label={kind === "income" ? "Receita selecionada" : "Receita"} secondary onPress={() => setKind("income")} />
          <ActionButton label={kind === "expense" ? "Despesa selecionada" : "Despesa"} secondary onPress={() => setKind("expense")} />
        </View>
        <AccessibleTextInput ref={descriptionInput} accessibilityLabel="Descrição do lançamento" placeholder="Ex.: Honorários" placeholderTextColor={colors.muted}
          value={description} onChangeText={(value) => { setDescription(value); setFormIssue(""); }} maxLength={160} style={styles.input} />
        <TourAnchor id="finance.amount">
          <AccessibleTextInput accessibilityLabel="Valor em reais e centavos" placeholder="Ex.: 125,00" placeholderTextColor={colors.muted}
            value={amount} onChangeText={(value) => { setAmount(value.replace(/[^\d,.]/g, "")); setFormIssue(""); }} keyboardType="decimal-pad" maxLength={17} style={styles.input} />
        </TourAnchor>
        <AccessibleTextInput accessibilityLabel="Data de vencimento opcional no formato DD/MM/AAAA" placeholder="Vencimento (DD/MM/AAAA) · opcional" placeholderTextColor={colors.muted}
          value={dueOn} onChangeText={(value) => { setDueOn(formatDateInputDraft(value)); setFormIssue(""); }} keyboardType="numbers-and-punctuation" maxLength={10} style={styles.input} />
        <AccessibleTextInput accessibilityLabel="Categoria opcional do lançamento" placeholder="Categoria (opcional) · ex.: honorários" placeholderTextColor={colors.muted}
          value={category} onChangeText={setCategory} maxLength={80} style={styles.input} />
        <Text style={styles.small}>O valor será convertido para centavos inteiros (BRL). Sem parcelas ou dados bancários.</Text>
        <ActionButton label={saving ? "Salvando…" : editingEntryId ? "Salvar alterações" : "Cadastrar lançamento"} disabled={saving} onPress={saveEntry} />
        <ActionButton label={editingEntryId ? "Cancelar edição" : "Cancelar cadastro"} secondary disabled={saving} onPress={() => setConfirmDiscard(true)} />
        {confirmDiscard ? <View style={styles.tight}>
          <Text accessibilityLiveRegion="assertive" style={styles.small}>Descartar este rascunho? As alterações ainda não salvas serão apagadas.</Text>
          <ActionButton label="Descartar rascunho do lançamento" disabled={saving} onPress={() => { resetForm(); closeForm(); }} />
          <ActionButton label="Continuar preenchendo lançamento" secondary disabled={saving} onPress={() => setConfirmDiscard(false)} />
        </View> : null}
      </Card></View> : null;
    return <Screen title="Financeiro" subtitle="Acompanhe receitas e despesas previstas do escritório." scrollToTop={formNavigationVersion} tourScreenId="finance"
      headerAction={<TourAnchor id="finance.new-entry">
        <ActionButton label={isFormOpen ? "Fechar formulário de lançamento" : editingEntryId ? "Continuar edição do lançamento" : hasDraft ? "Continuar lançamento" : "Novo lançamento"}
          accessibilityHint={isFormOpen ? "Fecha o formulário e mantém o rascunho para continuar depois." : "Abre o formulário para registrar uma receita ou despesa."}
          secondary={isFormOpen} onPress={() => isFormOpen ? closeForm() : openForm()} />
      </TourAnchor>}>
      {noticeMessage ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{noticeMessage}</Text> : null}
      <Card>
        <Heading>Valores previstos</Heading>
        {api.loading ? <Text style={styles.small}>Carregando…</Text> : api.sessionInfo && !api.issue ? <View style={styles.stack}>
          <View style={styles.tight}>
            <Text style={styles.eyebrow}>RECEITAS A RECEBER</Text>
            <Text accessibilityLabel="Total de receitas previstas" style={styles.amount}>{formatMoney(sumCents(incomePlanned))}</Text>
          </View>
          <View style={styles.tight}>
            <Text style={styles.eyebrow}>DESPESAS PREVISTAS</Text>
            <Text accessibilityLabel="Total de despesas previstas" style={styles.amount}>{formatMoney(sumCents(expensePlanned))}</Text>
          </View>
        </View> : null}
        {api.sessionInfo && !api.issue && !api.loading ? (() => {
          const overdue = api.financialEntries.filter((entry) => entry.status === "planned" && entry.dueOn && entry.dueOn < today).length;
          return overdue > 0 ? <Text accessibilityLiveRegion="polite" style={styles.badge}>{overdue === 1 ? "1 lançamento vencido" : `${overdue} lançamentos vencidos`} · confira primeiro</Text> : <Text style={styles.small}>Nenhum lançamento vencido.</Text>;
        })() : null}
        <Text style={styles.small}>Totais excluem lançamentos recebidos, pagos ou cancelados. Sem integração bancária ou conciliação.</Text>
      </Card>
      {entryForm}
      <Card>
        <Heading>Lançamentos</Heading>
        {searchQuery ? <View style={styles.tight}><Text style={styles.small}>Resultados para “{searchQuery}”. Os totais acima consideram todo o escritório.</Text><ActionButton label="Limpar busca do financeiro" secondary onPress={() => setSearchQuery("finance", "")} /></View> : null}
        {api.loading ? <Text accessibilityLiveRegion="polite" style={styles.small}>Carregando lançamentos…</Text> : null}
        {api.issue ? <View style={styles.tight}><Text accessibilityLiveRegion="assertive" style={styles.text}>{api.issue}</Text><ActionButton label="Tentar novamente" secondary onPress={() => void api.refresh()} /></View> : null}
        {api.sessionInfo && !api.loading && !api.issue && searchedEntries.length === 0 ? <Text style={styles.text}>{searchQuery ? "Nenhum lançamento corresponde à busca." : "Ainda não há lançamentos."}</Text> : null}
        {api.sessionInfo && !api.issue && [...searchedEntries].sort((x, y) => (x.status === "planned" ? 0 : 1) - (y.status === "planned" ? 0 : 1) || (x.dueOn ?? "9999").localeCompare(y.dueOn ?? "9999")).map((entry) => <View key={entry.id} testID="financial-entry-row" style={styles.tight}>
          <Text style={styles.strong}>{entry.description}</Text>
          <Text style={styles.amount}>{formatMoney(entry.amountCents)}</Text>
          <Text style={styles.text}>{entry.kind === "expense" ? "Despesa" : "Receita"}</Text>
          {entry.category ? <Text style={styles.small}>Categoria: {entry.category}</Text> : null}
          <Text accessibilityLabel={`Status do lançamento ${entry.description}: ${entry.status === "paid" ? (entry.kind === "income" ? "Recebido" : "Pago") : entry.status === "cancelled" ? "Cancelado" : "Previsto"}`}
            style={styles.small}>{entry.status === "paid" ? (entry.kind === "income" ? "Recebido" : "Pago") : entry.status === "cancelled" ? "Cancelado" : "Previsto"}</Text>
          {entryMessages[entry.id] ? <Text accessibilityLiveRegion="polite" style={styles.small}>{entryMessages[entry.id]}</Text> : null}
          {entry.status !== "paid" && entry.status !== "cancelled" ? <Text style={styles.small}>{dueLabel(entry.dueOn, today)}</Text> : null}
          {entry.status === "planned" ? <View style={styles.stack}>
            <ActionButton label={`Editar lançamento: ${entry.description}`} secondary onPress={() => {
              if (editingEntryId === entry.id) { openForm(); return; }
              if (hasDraft) {
                setNoticeMessage("Há um rascunho de lançamento. Continue ou descarte o rascunho antes de editar outro registro.");
                return;
              }
              setEditingEntryId(entry.id); setDescription(entry.description); setAmount(formatCentsInput(entry.amountCents));
              setDueOn(isoDateToInput(entry.dueOn ?? "")); setCategory(entry.category ?? ""); setKind(entry.kind); setEditingEntryVersion(entry.updatedAt); setFormIssue(""); setFormOpen(true);
              setFormNavigationVersion((version) => version + 1);
            }} />
            <ActionButton label={entry.kind === "income" ? `Marcar como recebido: ${entry.description}` : `Marcar como pago: ${entry.description}`} secondary disabled={Boolean(statusSavingEntryId)} onPress={() => {
              changeEntryStatus(entry.id, "paid", entry.updatedAt);
            }} />
            {pendingCancellationEntryId === entry.id ? <View style={styles.tight}>
              <Text style={styles.small}>Cancelar este lançamento previsto? Ele permanecerá no histórico.</Text>
              <ActionButton label={`Confirmar cancelamento: ${entry.description}`} disabled={Boolean(statusSavingEntryId)} onPress={() => {
                changeEntryStatus(entry.id, "cancelled", entry.updatedAt);
              }} />
              <ActionButton label={`Manter lançamento: ${entry.description}`} secondary disabled={Boolean(statusSavingEntryId)} onPress={() => setPendingCancellationEntryId(null)} />
            </View> : <ActionButton label={`Cancelar lançamento: ${entry.description}`} secondary disabled={Boolean(statusSavingEntryId)} onPress={() => {
              setPendingCancellationEntryId(entry.id);
              setEntryMessages((current) => ({ ...current, [entry.id]: "" }));
            }} />}
          </View> : null}
          <View style={styles.divider} />
        </View>)}
      </Card>
    </Screen>;
  }
  return (
    <Screen title="Financeiro" subtitle="Uma visão simples, com valores fictícios." tourScreenId="finance">
      <Card>
        <Text style={styles.eyebrow}>PARA RECEBER NO EXEMPLO</Text>
        <Text style={styles.amount}>{formatMoney(amountToReceive)}</Text>
        <Text style={styles.small}>Não há conta conectada, conciliação ou cobrança.</Text>
      </Card>
      <Card>
        <Heading>Lançamentos de exemplo</Heading>
        {financialEntries.map((entry) => <View key={entry.id} style={styles.stack}>
          <View style={styles.tight}>
            <Text style={styles.strong}>{entry.title}</Text>
            <Text style={styles.text}>{entry.kind === "expense" ? "Despesa" : "Receita"} · {formatMoney(entry.amountCents)}</Text>
            <Text style={styles.badge}>{entry.status} · fictício</Text>
          </View>
          <View style={styles.divider} />
        </View>)}
        <Text style={styles.small}>Origem: dados criados para esta demonstração. Nenhum recebimento foi verificado.</Text>
      </Card>
    </Screen>
  );
}
