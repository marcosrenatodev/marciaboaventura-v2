import { AccessibleTextInput } from "@/components/AccessibleTextInput";
import { TourAnchor } from "@/TourAnchors";
import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Platform, Text, useWindowDimensions, View, type TextInputInstance } from "react-native";
import { ActionButton, Card, Heading, Screen, TaskList } from "@/components/Ui";
import { appointments } from "@/demo";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { AgendaMonth } from "@/AgendaMonth";
import { colors, styles } from "@/theme";
import { normalizeWorkspaceSearch } from "@/search";
import { useWorkspaceSearchNavigation } from "@/WorkspaceSearchNavigation";
import { dateInputToIso, formatDateInputDraft, isoDateToInput, zonedInstantToInputs, zonedInputsToInstant } from "@/zoned-time";

type AgendaView = "calendar" | "tasks";

function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
}

export default function AgendaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ quick?: string | string[] }>();
  const quickAction = Array.isArray(params.quick) ? params.quick[0] : params.quick;
  const quickTask = quickAction === "task";
  const searchNavigation = useWorkspaceSearchNavigation();
  const searchQuery = searchNavigation.searchQueries.agenda;
  const normalizedSearch = normalizeWorkspaceSearch(searchQuery);
  const { width } = useWindowDimensions();
  const taskTitleInput = useRef<TextInputInstance>(null);
  const appointmentTitleInput = useRef<TextInputInstance>(null);
  const { demoMode } = useAuth();
  const api = useWorkData();
  const [activeView, setActiveView] = useState<AgendaView>(() => quickTask ? "tasks" : "calendar");
  const currentView: AgendaView = quickTask ? "tasks" : activeView;
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [appointmentFormOpen, setAppointmentFormOpen] = useState(false);
  const [formNavigationVersion, setFormNavigationVersion] = useState(0);
  const [title, setTitle] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [selectedTaskMatterId, setSelectedTaskMatterId] = useState<string | null>(null);
  const [appointmentTitle, setAppointmentTitle] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [appointmentTimeZone, setAppointmentTimeZone] = useState(deviceTimeZone);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [editingAppointmentVersion, setEditingAppointmentVersion] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskVersion, setEditingTaskVersion] = useState<string | null>(null);
  const [taskFormMessage, setTaskFormMessage] = useState("");
  const [appointmentFormMessage, setAppointmentFormMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [taskRowMessages, setTaskRowMessages] = useState<Record<string, string>>({});
  const [appointmentRowMessages, setAppointmentRowMessages] = useState<Record<string, string>>({});
  const [pendingTaskDiscard, setPendingTaskDiscard] = useState(false);
  const [pendingAppointmentDiscard, setPendingAppointmentDiscard] = useState(false);
  const [pendingAppointmentCancellationId, setPendingAppointmentCancellationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [taskStatusSavingId, setTaskStatusSavingId] = useState<string | null>(null);
  const [appointmentStatusSavingId, setAppointmentStatusSavingId] = useState<string | null>(null);
  const isTaskFormOpen = taskFormOpen || quickTask;
  const isAppointmentFormOpen = appointmentFormOpen;

  useEffect(() => {
    if (Platform.OS !== "web" || demoMode || currentView !== "tasks" || !isTaskFormOpen) return;
    const frame = requestAnimationFrame(() => taskTitleInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [currentView, demoMode, isTaskFormOpen, quickAction]);

  useEffect(() => {
    if (Platform.OS !== "web" || demoMode || currentView !== "calendar" || !isAppointmentFormOpen) return;
    const frame = requestAnimationFrame(() => appointmentTitleInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [currentView, demoMode, isAppointmentFormOpen]);

  const clearQuickAction = () => {
    if (quickTask) router.setParams({ quick: undefined });
  };
  const openTaskForm = (date?: string) => {
    if (date && (editingTaskId || title.trim() || taskDate.trim() || selectedTaskMatterId)) {
      setNoticeMessage("Há um rascunho de tarefa. Continue ou descarte-o antes de criar outra para este dia.");
      return;
    }
    if (date) setTaskDate(isoDateToInput(date));
    setActiveView("tasks");
    setTaskFormOpen(true);
    setAppointmentFormOpen(false);
    setPendingTaskDiscard(false);
    setTaskFormMessage("");
    setNoticeMessage("");
    setFormNavigationVersion((version) => version + 1);
  };
  const closeTaskForm = () => {
    setActiveView("tasks");
    setTaskFormOpen(false);
    setPendingTaskDiscard(false);
    setTaskFormMessage("");
    clearQuickAction();
  };
  const discardTaskDraft = () => {
    setTitle("");
    setTaskDate("");
    setSelectedTaskMatterId(null);
    setEditingTaskId(null);
    setEditingTaskVersion(null);
    closeTaskForm();
  };
  const openAppointmentForm = (date?: string) => {
    if (date && (editingAppointmentId || appointmentTitle.trim() || appointmentDate.trim() || startsAt.trim() || endsAt.trim() || location.trim())) {
      setNoticeMessage("Há um rascunho de compromisso. Continue ou descarte-o antes de criar outro para este dia.");
      return;
    }
    if (date) setAppointmentDate(isoDateToInput(date));
    setActiveView("calendar");
    setAppointmentFormOpen(true);
    setTaskFormOpen(false);
    setPendingAppointmentDiscard(false);
    setAppointmentFormMessage("");
    setNoticeMessage("");
    setFormNavigationVersion((version) => version + 1);
  };
  const closeAppointmentForm = () => {
    setAppointmentFormOpen(false);
    setPendingAppointmentDiscard(false);
    setAppointmentFormMessage("");
  };
  const discardAppointmentDraft = () => {
    setAppointmentTitle("");
    setAppointmentDate("");
    setStartsAt("");
    setEndsAt("");
    setLocation("");
    setEditingAppointmentId(null);
    setEditingAppointmentVersion(null);
    setAppointmentTimeZone(deviceTimeZone());
    closeAppointmentForm();
  };
  const switchView = (view: AgendaView) => {
    setActiveView(view);
    if (view === "calendar") {
      setTaskFormOpen(false);
      setPendingTaskDiscard(false);
      clearQuickAction();
    } else {
      setAppointmentFormOpen(false);
      setPendingAppointmentDiscard(false);
    }
    setNoticeMessage("");
  };

  const saveTask = () => {
    if (!title.trim() || saving) { setTaskFormMessage("Informe um título para a tarefa."); return; }
    if (editingTaskId && !api.tasks.some((task) => task.id === editingTaskId && (task.status === "todo" || task.status === "in_progress"))) {
      setTaskFormMessage("Essa tarefa não está mais aberta para edição. Atualize a lista."); return;
    }
    if (editingTaskId && !editingTaskVersion) { setTaskFormMessage("Feche e abra novamente esta edição para conferir a versão atual."); return; }
    const scheduledOn = taskDate.trim() ? dateInputToIso(taskDate) : null;
    if (taskDate.trim() && !scheduledOn) { setTaskFormMessage("Informe uma data válida no formato DD/MM/AAAA ou deixe o campo vazio."); return; }
    const selectedMatter = api.matters.find((matter) => matter.id === selectedTaskMatterId);
    const currentTask = editingTaskId ? api.tasks.find((task) => task.id === editingTaskId) : null;
    if (selectedTaskMatterId && (!selectedMatter || (selectedMatter.status === "archived" && currentTask?.matterId !== selectedMatter.id))) {
      setTaskFormMessage("Escolha um assunto ativo para vincular à tarefa."); return;
    }
    setSaving(true);
    setTaskFormMessage("");
    setNoticeMessage("");
    const wasEditing = Boolean(editingTaskId);
    const operation = editingTaskId && editingTaskVersion
      ? api.updateTask(editingTaskId, title, selectedTaskMatterId, scheduledOn, editingTaskVersion)
      : api.createTask(title, selectedTaskMatterId, scheduledOn);
    void operation.then(() => {
      setActiveView("tasks");
      setTitle(""); setTaskDate(""); setSelectedTaskMatterId(null); setEditingTaskId(null); setEditingTaskVersion(null);
      setTaskFormOpen(false); clearQuickAction();
      setNoticeMessage(wasEditing ? "Alterações da tarefa salvas." : "Tarefa cadastrada na API.");
    }, (error: unknown) => setTaskFormMessage(error instanceof Error ? error.message : "Não foi possível salvar a tarefa."))
      .finally(() => setSaving(false));
  };

  const saveAppointment = () => {
    if (!appointmentTitle.trim() || savingAppointment) { setAppointmentFormMessage("Informe um título para o compromisso."); return; }
    const start = zonedInputsToInstant(appointmentDate, startsAt, appointmentTimeZone);
    const end = zonedInputsToInstant(appointmentDate, endsAt, appointmentTimeZone);
    const timeError = (status: "invalid" | "nonexistent" | "ambiguous") => status === "nonexistent"
      ? "Esse horário não existe no fuso escolhido por causa da mudança de relógio. Escolha outro horário."
      : status === "ambiguous" ? "Esse horário ocorre duas vezes no fuso escolhido. Escolha outro horário para evitar dúvida."
        : "Informe uma data e horários válidos.";
    if (start.status !== "ok") { setAppointmentFormMessage(timeError(start.status)); return; }
    if (end.status !== "ok") { setAppointmentFormMessage(timeError(end.status)); return; }
    if (Date.parse(end.iso) <= Date.parse(start.iso)) { setAppointmentFormMessage("O término precisa ser depois do início."); return; }
    if (editingAppointmentId && !editingAppointmentVersion) { setAppointmentFormMessage("Feche e abra novamente esta edição para conferir a versão atual."); return; }
    setSavingAppointment(true);
    setAppointmentFormMessage("");
    setNoticeMessage("");
    const wasEditing = Boolean(editingAppointmentId);
    const fields = { title: appointmentTitle, startsAt: start.iso, endsAt: end.iso, location: location.trim() || null };
    const operation = editingAppointmentId && editingAppointmentVersion
      ? api.updateAppointment(editingAppointmentId, fields, editingAppointmentVersion)
      : api.createAppointment({ ...fields, timezone: appointmentTimeZone });
    void operation.then(() => {
      setAppointmentTitle(""); setAppointmentDate(""); setStartsAt(""); setEndsAt(""); setLocation("");
      setAppointmentTimeZone(deviceTimeZone()); setEditingAppointmentId(null); setEditingAppointmentVersion(null); setAppointmentFormOpen(false);
      setNoticeMessage(wasEditing ? "Alterações do compromisso salvas." : "Compromisso cadastrado no escritório.");
    }, (error: unknown) => setAppointmentFormMessage(error instanceof Error ? error.message : "Não foi possível salvar o compromisso."))
      .finally(() => setSavingAppointment(false));
  };

  const changeTaskStatus = (taskId: string, status: "todo" | "done", updatedAt: string) => {
    if (taskStatusSavingId) return;
    setTaskStatusSavingId(taskId);
    setTaskRowMessages((current) => ({ ...current, [taskId]: "" }));
    void api.setTaskStatus(taskId, status, updatedAt).then(() => {
      setTaskRowMessages((current) => ({ ...current, [taskId]: "Tarefa atualizada." }));
    }, (error: unknown) => {
      setTaskRowMessages((current) => ({ ...current, [taskId]: error instanceof Error ? error.message : "Não foi possível atualizar a tarefa." }));
    }).finally(() => setTaskStatusSavingId(null));
  };
  const changeAppointmentStatus = (appointmentId: string, updatedAt: string) => {
    if (appointmentStatusSavingId) return;
    setAppointmentStatusSavingId(appointmentId);
    setAppointmentRowMessages((current) => ({ ...current, [appointmentId]: "" }));
    void api.cancelAppointment(appointmentId, updatedAt).then(() => {
      setAppointmentRowMessages((current) => ({ ...current, [appointmentId]: "Compromisso cancelado." }));
      setPendingAppointmentCancellationId(null);
    }, (error: unknown) => {
      setAppointmentRowMessages((current) => ({ ...current, [appointmentId]: error instanceof Error ? error.message : "Não foi possível cancelar o compromisso." }));
    }).finally(() => setAppointmentStatusSavingId(null));
  };

  const taskMatterOptions = api.matters.filter((matter) => matter.status !== "archived" || matter.id === selectedTaskMatterId);
  const orderedTasks = [...api.tasks].sort((left, right) => {
    const leftClosed = left.status === "done" || left.status === "cancelled";
    const rightClosed = right.status === "done" || right.status === "cancelled";
    if (leftClosed !== rightClosed) return leftClosed ? 1 : -1;
    return (left.scheduledOn ?? "9999-12-31").localeCompare(right.scheduledOn ?? "9999-12-31") || left.title.localeCompare(right.title, "pt-BR");
  });
  const searchedAppointments = api.appointments.filter((appointment) => normalizeWorkspaceSearch(`${appointment.title} ${appointment.location ?? ""}`).includes(normalizedSearch));
  const searchedTasks = orderedTasks.filter((task) => normalizeWorkspaceSearch(`${task.title} ${api.matters.find((matter) => matter.id === task.matterId)?.title ?? ""}`).includes(normalizedSearch));
  const hasTaskDraft = Boolean(editingTaskId || title.trim() || taskDate.trim() || selectedTaskMatterId);
  const hasAppointmentDraft = Boolean(editingAppointmentId || appointmentTitle.trim() || appointmentDate.trim() || startsAt.trim() || endsAt.trim() || location.trim());

  const taskForm = isTaskFormOpen ? <Card testID="agenda-task-form">
    <Heading>{editingTaskId ? "Editar tarefa" : "Nova tarefa"}</Heading>
    <Text style={styles.small}>Organize um próximo passo; esta data não confirma prazo processual.</Text>
    <AccessibleTextInput testID="agenda-task-title-input" ref={taskTitleInput} accessibilityLabel="Título da tarefa" placeholder="Ex.: Separar documentos" placeholderTextColor={colors.muted}
      value={title} onChangeText={(value) => { setTitle(value); setTaskFormMessage(""); }} editable={!saving} maxLength={160} style={styles.input} />
    <AccessibleTextInput testID="agenda-task-date-input" accessibilityLabel="Data da tarefa (DD/MM/AAAA, opcional)" placeholder="Data para organizar · DD/MM/AAAA (opcional)" placeholderTextColor={colors.muted}
      value={taskDate} onChangeText={(value) => { setTaskDate(formatDateInputDraft(value)); setTaskFormMessage(""); }} editable={!saving} keyboardType="numbers-and-punctuation" maxLength={10} style={styles.input} />
    <View style={styles.tight}>
      <Text style={styles.strong}>Assunto relacionado (opcional)</Text>
      <ActionButton label={selectedTaskMatterId ? "Remover vínculo com assunto" : "Sem assunto vinculado"} secondary disabled={saving} onPress={() => setSelectedTaskMatterId(null)} />
      {taskMatterOptions.map((matter) => <ActionButton key={matter.id}
        label={selectedTaskMatterId === matter.id ? `Selecionado: ${matter.title}` : `Selecionar assunto: ${matter.title}`}
        secondary disabled={saving} onPress={() => setSelectedTaskMatterId(matter.id)} />)}
      {api.matters.filter((matter) => matter.status !== "archived").length === 0 && !api.loading ? <Text style={styles.small}>Cadastre um assunto em Processos para organizar a tarefa por pasta.</Text> : null}
    </View>
    {taskFormMessage ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{taskFormMessage}</Text> : null}
    <ActionButton label={saving ? "Salvando…" : editingTaskId ? "Salvar alterações da tarefa" : "Cadastrar tarefa"} disabled={saving} onPress={saveTask} />
    <ActionButton label={editingTaskId ? "Cancelar edição da tarefa" : "Cancelar cadastro da tarefa"} secondary disabled={saving} onPress={() => setPendingTaskDiscard(true)} />
    {pendingTaskDiscard ? <View style={styles.tight}>
      <Text accessibilityLiveRegion="assertive" style={styles.small}>{editingTaskId
        ? "Descartar as alterações? A tarefa já salva continuará como está."
        : "Descartar este cadastro? Os campos preenchidos serão apagados; nada foi salvo ainda."}</Text>
      <ActionButton label={editingTaskId ? "Descartar alterações da tarefa" : "Descartar cadastro da tarefa"} disabled={saving} onPress={discardTaskDraft} />
      <ActionButton label="Continuar editando tarefa" secondary disabled={saving} onPress={() => setPendingTaskDiscard(false)} />
    </View> : null}
  </Card> : null;

  const appointmentForm = isAppointmentFormOpen ? <Card testID="agenda-appointment-form">
    <Heading>{editingAppointmentId ? "Editar compromisso" : "Novo compromisso"}</Heading>
    <Text style={styles.small}>Audiências e reuniões são lembretes de trabalho. Confira qualquer prazo no canal oficial.</Text>
    <AccessibleTextInput testID="agenda-appointment-title-input" ref={appointmentTitleInput} accessibilityLabel="Título do compromisso" placeholder="Ex.: Reunião de preparação" placeholderTextColor={colors.muted}
      value={appointmentTitle} onChangeText={(value) => { setAppointmentTitle(value); setAppointmentFormMessage(""); }} editable={!savingAppointment} maxLength={160} style={styles.input} />
    <AccessibleTextInput testID="agenda-appointment-date-input" accessibilityLabel="Data do compromisso (DD/MM/AAAA)" placeholder="DD/MM/AAAA" placeholderTextColor={colors.muted}
      value={appointmentDate} onChangeText={(value) => { setAppointmentDate(formatDateInputDraft(value)); setAppointmentFormMessage(""); }} editable={!savingAppointment} keyboardType="numbers-and-punctuation" maxLength={10} style={styles.input} />
    <View style={styles.columns}>
      <AccessibleTextInput testID="agenda-appointment-start-input" accessibilityLabel="Horário de início (HH:MM)" placeholder="Início · HH:MM" placeholderTextColor={colors.muted}
        value={startsAt} onChangeText={(value) => { setStartsAt(value); setAppointmentFormMessage(""); }} editable={!savingAppointment} keyboardType="numbers-and-punctuation" maxLength={5} style={[styles.input, styles.flexible]} />
      <AccessibleTextInput testID="agenda-appointment-end-input" accessibilityLabel="Horário de término (HH:MM)" placeholder="Término · HH:MM" placeholderTextColor={colors.muted}
        value={endsAt} onChangeText={(value) => { setEndsAt(value); setAppointmentFormMessage(""); }} editable={!savingAppointment} keyboardType="numbers-and-punctuation" maxLength={5} style={[styles.input, styles.flexible]} />
    </View>
    <AccessibleTextInput accessibilityLabel="Local do compromisso (opcional)" placeholder="Local ou link (opcional)" placeholderTextColor={colors.muted}
      value={location} onChangeText={(value) => { setLocation(value); setAppointmentFormMessage(""); }} editable={!savingAppointment} maxLength={500} style={styles.input} />
    <Text style={styles.small}>Horários no fuso {appointmentTimeZone}. Horários ambíguos ou inexistentes por mudança de relógio são recusados para evitar deslocamentos silenciosos.</Text>
    {appointmentFormMessage ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{appointmentFormMessage}</Text> : null}
    <ActionButton label={savingAppointment ? "Salvando compromisso…" : editingAppointmentId ? "Salvar alterações do compromisso" : "Cadastrar compromisso"} disabled={savingAppointment} onPress={saveAppointment} />
    <ActionButton label={editingAppointmentId ? "Cancelar edição do compromisso" : "Cancelar cadastro do compromisso"} secondary disabled={savingAppointment} onPress={() => setPendingAppointmentDiscard(true)} />
    {pendingAppointmentDiscard ? <View style={styles.tight}>
      <Text accessibilityLiveRegion="assertive" style={styles.small}>{editingAppointmentId
        ? "Descartar as alterações? O compromisso salvo continuará como está."
        : "Descartar este cadastro? Os campos preenchidos serão apagados; nada foi salvo ainda."}</Text>
      <ActionButton label={editingAppointmentId ? "Descartar alterações do compromisso" : "Descartar cadastro do compromisso"} disabled={savingAppointment} onPress={discardAppointmentDraft} />
      <ActionButton label="Continuar editando compromisso" secondary disabled={savingAppointment} onPress={() => setPendingAppointmentDiscard(false)} />
    </View> : null}
  </Card> : null;

  if (!demoMode) return <Screen title="Agenda e tarefas" subtitle="Organize compromissos e próximos passos. Nada aqui confirma um prazo processual." tourScreenId="calendar"
    scrollToTop={formNavigationVersion}
    headerAction={currentView === "tasks"
      ? <TourAnchor id="agenda.new-entry"><ActionButton
        testID="agenda-new-entry" label={isTaskFormOpen ? "Fechar formulário de tarefa" : editingTaskId ? "Continuar edição da tarefa" : hasTaskDraft ? "Continuar tarefa" : "Nova tarefa"}
        accessibilityHint={isTaskFormOpen ? "Fecha o formulário mantendo o rascunho para continuar depois." : "Abre o formulário para organizar um próximo passo."}
        secondary={isTaskFormOpen} disabled={saving || savingAppointment} onPress={() => isTaskFormOpen ? closeTaskForm() : openTaskForm()} /></TourAnchor>
      : <TourAnchor id="agenda.new-entry"><ActionButton
        testID="agenda-new-entry" label={isAppointmentFormOpen ? "Fechar formulário de compromisso" : editingAppointmentId ? "Continuar edição do compromisso" : hasAppointmentDraft ? "Continuar compromisso" : "Novo compromisso"}
        accessibilityHint={isAppointmentFormOpen ? "Fecha o formulário mantendo o rascunho para continuar depois." : "Abre o formulário para anotar uma audiência ou reunião."}
        secondary={isAppointmentFormOpen} disabled={saving || savingAppointment} onPress={() => isAppointmentFormOpen ? closeAppointmentForm() : openAppointmentForm()} /></TourAnchor>}>
    {searchQuery ? <Card><Text style={styles.eyebrow}>BUSCA DO ESCRITÓRIO</Text><Text style={styles.strong}>Resultados para “{searchQuery}”</Text><Text style={styles.small}>A lista de compromissos e tarefas está filtrada. O calendário continua mostrando todos os itens.</Text><ActionButton label="Limpar busca da agenda" secondary onPress={() => searchNavigation.setSearchQuery("agenda", "")} /></Card> : null}
    {currentView === "calendar" ? appointmentForm : null}
    {!isAppointmentFormOpen ? <View style={width < 480 ? styles.stack : styles.columns}>
      <ActionButton testID="agenda-view-calendar" label={currentView === "calendar" ? "Agenda selecionada" : "Agenda"} secondary={currentView !== "calendar"} disabled={saving || savingAppointment} onPress={() => switchView("calendar")} />
      <ActionButton testID="agenda-view-tasks" label={currentView === "tasks" ? "Tarefas selecionadas" : "Tarefas"} secondary={currentView !== "tasks"} disabled={saving || savingAppointment} onPress={() => switchView("tasks")} />
    </View> : null}
    {noticeMessage ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{noticeMessage}</Text> : null}
    <View style={currentView === "calendar" && !isAppointmentFormOpen ? undefined : { display: "none" }}>
      <AgendaMonth tasks={api.tasks} appointments={api.appointments} loading={api.loading} issue={api.issue}
        onCreateTaskForDay={(date) => openTaskForm(date)} onCreateAppointmentForDay={(date) => openAppointmentForm(date)} />
    </View>
    {currentView === "calendar" ? <>
      <Card>
        <Heading>Próximos compromissos</Heading>
        {api.loading ? <Text accessibilityLiveRegion="polite" style={styles.small}>Carregando compromissos…</Text> : null}
        {api.issue ? <View style={styles.tight}><Text accessibilityLiveRegion="assertive" style={styles.text}>{api.issue}</Text><ActionButton label="Tentar novamente" secondary onPress={() => void api.refresh()} /></View> : null}
        {api.sessionInfo && !api.loading && !api.issue && searchedAppointments.length === 0 ? <Text style={styles.text}>{searchQuery ? "Nenhum compromisso corresponde à busca." : "Nenhum compromisso cadastrado."}</Text> : null}
        {api.sessionInfo && !api.issue && searchedAppointments.map((appointment) => <View key={appointment.id} testID="agenda-appointment-row" style={styles.tight}>
          <Text style={styles.strong}>{appointment.title}</Text>
          <Text style={styles.small}>{new Intl.DateTimeFormat("pt-BR", { timeZone: appointment.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(appointment.startsAt))} · {appointment.timezone}</Text>
          {appointment.location ? <Text style={styles.small}>{appointment.location}</Text> : null}
          <Text accessibilityLabel={`Status do compromisso ${appointment.title}: ${appointment.status === "cancelled" ? "Cancelado" : "Agendado"}`}
            style={styles.badge}>{appointment.status === "cancelled" ? "Cancelado" : "Agendado · lembrete de trabalho"}</Text>
          <Text style={styles.small}>Lembrete de trabalho · não é prazo processual confirmado.</Text>
          {appointmentRowMessages[appointment.id] ? <Text accessibilityLiveRegion="polite" style={styles.small}>{appointmentRowMessages[appointment.id]}</Text> : null}
          {appointment.status === "scheduled" ? <ActionButton label={`Editar compromisso: ${appointment.title}`} secondary disabled={saving || savingAppointment} onPress={() => {
            if (editingAppointmentId === appointment.id) { openAppointmentForm(); return; }
            if (hasAppointmentDraft) { setNoticeMessage("Há um rascunho de compromisso. Continue ou descarte-o antes de editar outro."); return; }
            try {
              const startInput = zonedInstantToInputs(appointment.startsAt, appointment.timezone);
              const endInput = zonedInstantToInputs(appointment.endsAt, appointment.timezone);
              if (startInput.date !== endInput.date) { setNoticeMessage("Este compromisso atravessa a meia-noite; crie uma nova versão e cancele a anterior para preservar as datas corretamente."); return; }
              setEditingAppointmentId(appointment.id); setAppointmentTitle(appointment.title); setAppointmentDate(startInput.date);
              setStartsAt(startInput.time); setEndsAt(endInput.time); setLocation(appointment.location ?? "");
              setEditingAppointmentVersion(appointment.updatedAt); setAppointmentTimeZone(appointment.timezone); setAppointmentFormMessage("");
              openAppointmentForm();
            } catch {
              setNoticeMessage("Não foi possível interpretar o fuso desse compromisso. Ele continua salvo; revise o fuso na configuração do aparelho.");
            }
          }} /> : null}
          {appointment.status === "scheduled" ? pendingAppointmentCancellationId === appointment.id ? <View style={styles.tight}>
            <Text style={styles.small}>Cancelar este compromisso? Ele permanecerá no histórico.</Text>
            <ActionButton label={`Confirmar cancelamento: ${appointment.title}`} disabled={Boolean(appointmentStatusSavingId)} onPress={() => changeAppointmentStatus(appointment.id, appointment.updatedAt)} />
            <ActionButton label={`Manter compromisso: ${appointment.title}`} secondary disabled={Boolean(appointmentStatusSavingId)} onPress={() => setPendingAppointmentCancellationId(null)} />
          </View> : <ActionButton label={`Cancelar compromisso: ${appointment.title}`} secondary disabled={Boolean(appointmentStatusSavingId)} onPress={() => setPendingAppointmentCancellationId(appointment.id)} /> : null}
          <View style={styles.divider} />
        </View>)}
      </Card>
    </> : null}
    {currentView === "tasks" ? <>
      {taskForm}
      <Card>
        <Heading>Tarefas cadastradas</Heading>
        {api.loading ? <Text accessibilityLiveRegion="polite" style={styles.small}>Carregando tarefas…</Text> : null}
        {api.issue ? <View style={styles.tight}><Text accessibilityLiveRegion="assertive" style={styles.text}>{api.issue}</Text><ActionButton label="Tentar novamente" secondary onPress={() => void api.refresh()} /></View> : null}
        {api.sessionInfo && !api.loading && !api.issue && searchedTasks.length === 0 ? <Text style={styles.text}>{searchQuery ? "Nenhuma tarefa corresponde à busca." : "Ainda não há tarefas cadastradas."}</Text> : null}
        {api.sessionInfo && !api.issue && searchedTasks.map((task) => {
          const linkedMatter = api.matters.find((matter) => matter.id === task.matterId);
          const linkedMatterLabel = linkedMatter
            ? `${linkedMatter.status === "archived" ? "Assunto arquivado" : "Assunto"}: ${linkedMatter.title}`
            : "Sem assunto vinculado";
          const taskStatusLabel = task.status === "done" ? "Concluída" : task.status === "in_progress" ? "Em andamento" : task.status === "cancelled" ? "Cancelada" : "A fazer";
          return <View key={task.id} testID="agenda-task-row" style={styles.tight}>
            <Text style={styles.strong}>{task.title}</Text>
            <Text accessibilityLabel={`Assunto da tarefa ${task.title}: ${linkedMatter?.title ?? "Sem assunto vinculado"}${linkedMatter?.status === "archived" ? " (arquivado)" : ""}`} style={styles.small}>{linkedMatterLabel}</Text>
            <Text accessibilityLabel={`Status da tarefa ${task.title}: ${taskStatusLabel}`} style={styles.small}>{taskStatusLabel}</Text>
            <Text style={styles.small}>{task.scheduledOn ? `Organizada para ${isoDateToInput(task.scheduledOn)}` : "Sem data de organização"} · lembrete de trabalho, não prazo judicial.</Text>
            {taskRowMessages[task.id] ? <Text accessibilityLiveRegion="polite" style={styles.small}>{taskRowMessages[task.id]}</Text> : null}
            {task.status === "todo" || task.status === "in_progress" ? <ActionButton label={`Editar tarefa: ${task.title}`} secondary disabled={saving || savingAppointment} onPress={() => {
              if (editingTaskId === task.id) { openTaskForm(); return; }
              if (hasTaskDraft) { setNoticeMessage("Há um rascunho de tarefa. Continue ou descarte-o antes de editar outra."); return; }
              setEditingTaskId(task.id); setEditingTaskVersion(task.updatedAt); setTitle(task.title);
              setTaskDate(task.scheduledOn ? isoDateToInput(task.scheduledOn) : ""); setSelectedTaskMatterId(task.matterId ?? null); setTaskFormMessage("");
              openTaskForm();
            }} /> : null}
            {task.status !== "cancelled" ? <ActionButton label={task.status === "done" ? `Reabrir tarefa: ${task.title}` : `Concluir tarefa: ${task.title}`} secondary disabled={saving || savingAppointment || Boolean(taskStatusSavingId)} onPress={() => {
              changeTaskStatus(task.id, task.status === "done" ? "todo" : "done", task.updatedAt);
            }} /> : null}
            <View style={styles.divider} />
          </View>;
        })}
      </Card>
    </> : null}
  </Screen>;

  return (
    <Screen title="Agenda" subtitle="Um dia de exemplo para organizar com calma." tourScreenId="calendar">
      <Card>
        <Heading>Compromissos de exemplo</Heading>
        {appointments.map((appointment) => <View key={appointment.time} style={styles.tight}>
          <Text style={styles.time}>{appointment.time}</Text>
          <Text style={styles.strong}>{appointment.title}</Text>
          <Text style={styles.small}>{appointment.detail}</Text>
        </View>)}
        <Text style={styles.small}>Nenhum compromisso real, audiência ou prazo está cadastrado.</Text>
      </Card>
      <Card><Heading>Suas tarefas de exemplo</Heading><TaskList /></Card>
    </Screen>
  );
}
