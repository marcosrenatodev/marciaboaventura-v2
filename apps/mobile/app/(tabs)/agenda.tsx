import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { ActionButton, Card, Heading, Screen, TaskList } from "@/components/Ui";
import { appointments } from "@/demo";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { colors, styles } from "@/theme";

export default function AgendaScreen() {
  const { demoMode } = useAuth();
  const api = useWorkData();
  const [title, setTitle] = useState("");
  const [appointmentTitle, setAppointmentTitle] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  if (!demoMode) return <Screen title="Agenda e tarefas" subtitle="Organize compromissos e próximos passos. Nada aqui confirma um prazo processual.">
    <Card>
      <Heading>Nova tarefa</Heading>
      <TextInput accessibilityLabel="Título da tarefa" placeholder="Ex.: Separar documentos" placeholderTextColor={colors.muted}
        value={title} onChangeText={setTitle} maxLength={160} style={styles.input} />
      <ActionButton label={saving ? "Salvando…" : "Cadastrar tarefa"} onPress={() => {
        if (!title.trim() || saving) { setMessage("Informe um título para a tarefa."); return; }
        setSaving(true); setMessage("");
        void api.createTask(title).then(() => { setTitle(""); setMessage("Tarefa cadastrada na API."); }, (error: unknown) => setMessage(error instanceof Error ? error.message : "Não foi possível cadastrar a tarefa.")).finally(() => setSaving(false));
      }} />
      {message ? <Text accessibilityLiveRegion="polite" style={styles.small}>{message}</Text> : null}
    </Card>
    <Card>
      <Heading>Novo compromisso</Heading>
      <Text style={styles.small}>Audiências e reuniões são lembretes de trabalho. Confira qualquer prazo no canal oficial.</Text>
      <TextInput accessibilityLabel="Título do compromisso" placeholder="Ex.: Reunião de preparação" placeholderTextColor={colors.muted}
        value={appointmentTitle} onChangeText={setAppointmentTitle} maxLength={160} style={styles.input} />
      <TextInput accessibilityLabel="Data do compromisso (AAAA-MM-DD)" placeholder="AAAA-MM-DD" placeholderTextColor={colors.muted}
        value={appointmentDate} onChangeText={setAppointmentDate} keyboardType="numbers-and-punctuation" maxLength={10} style={styles.input} />
      <View style={styles.columns}>
        <TextInput accessibilityLabel="Horário de início (HH:MM)" placeholder="Início · HH:MM" placeholderTextColor={colors.muted}
          value={startsAt} onChangeText={setStartsAt} keyboardType="numbers-and-punctuation" maxLength={5} style={[styles.input, styles.flexible]} />
        <TextInput accessibilityLabel="Horário de término (HH:MM)" placeholder="Término · HH:MM" placeholderTextColor={colors.muted}
          value={endsAt} onChangeText={setEndsAt} keyboardType="numbers-and-punctuation" maxLength={5} style={[styles.input, styles.flexible]} />
      </View>
      <TextInput accessibilityLabel="Local do compromisso (opcional)" placeholder="Local ou link (opcional)" placeholderTextColor={colors.muted}
        value={location} onChangeText={setLocation} maxLength={500} style={styles.input} />
      <Text style={styles.small}>Horários no fuso deste aparelho: {Intl.DateTimeFormat().resolvedOptions().timeZone || "fuso local"}.</Text>
      <ActionButton label={saving ? "Salvando compromisso…" : "Cadastrar compromisso"} onPress={() => {
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate);
        const validTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
        const start = validDate && validTime(startsAt) ? new Date(`${appointmentDate}T${startsAt}:00`) : null;
        const end = validDate && validTime(endsAt) ? new Date(`${appointmentDate}T${endsAt}:00`) : null;
        const dateMatches = start && start.getFullYear() === Number(appointmentDate.slice(0, 4)) && start.getMonth() + 1 === Number(appointmentDate.slice(5, 7)) && start.getDate() === Number(appointmentDate.slice(8, 10));
        if (!appointmentTitle.trim() || !dateMatches || !start || !end || end <= start || saving) {
          setMessage("Informe título, data válida e horários; o término deve ser depois do início."); return;
        }
        setSaving(true); setMessage("");
        void api.createAppointment({ title: appointmentTitle, startsAt: start.toISOString(), endsAt: end.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo", location: location.trim() || null })
          .then(() => { setAppointmentTitle(""); setStartsAt(""); setEndsAt(""); setLocation(""); setMessage("Compromisso cadastrado no escritório."); },
            (error: unknown) => setMessage(error instanceof Error ? error.message : "Não foi possível cadastrar o compromisso."))
          .finally(() => setSaving(false));
      }} />
      {message ? <Text accessibilityLiveRegion="polite" style={styles.small}>{message}</Text> : null}
    </Card>
    <Card>
      <Heading>Próximos compromissos</Heading>
      {api.loading ? <Text accessibilityLiveRegion="polite" style={styles.small}>Carregando compromissos…</Text> : null}
      {api.sessionInfo && !api.issue && api.appointments.length === 0 ? <Text style={styles.text}>Nenhum compromisso cadastrado.</Text> : null}
      {api.sessionInfo && !api.issue && api.appointments.map((appointment) => <View key={appointment.id} style={styles.tight}>
        <Text style={styles.strong}>{appointment.title}</Text>
        <Text style={styles.small}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(appointment.startsAt))} · {appointment.timezone}</Text>
        {appointment.location ? <Text style={styles.small}>{appointment.location}</Text> : null}
        <Text style={styles.small}>Lembrete de trabalho · não é prazo processual confirmado.</Text>
        <ActionButton label={`Cancelar compromisso: ${appointment.title}`} secondary onPress={() => {
          void api.cancelAppointment(appointment.id).then(() => setMessage("Compromisso cancelado."), (error: unknown) => setMessage(error instanceof Error ? error.message : "Não foi possível cancelar o compromisso."));
        }} />
        <View style={styles.divider} />
      </View>)}
    </Card>
    <Card>
      <Heading>Tarefas cadastradas</Heading>
      {api.loading ? <Text accessibilityLiveRegion="polite" style={styles.small}>Carregando tarefas…</Text> : null}
      {api.issue ? <View style={styles.tight}><Text accessibilityLiveRegion="assertive" style={styles.text}>{api.issue}</Text><ActionButton label="Tentar novamente" secondary onPress={() => void api.refresh()} /></View> : null}
      {api.sessionInfo && !api.loading && !api.issue && api.tasks.length === 0 ? <Text style={styles.text}>Ainda não há tarefas cadastradas.</Text> : null}
      {api.sessionInfo && !api.issue && api.tasks.map((task) => <View key={task.id} style={styles.tight}>
        <Text style={styles.strong}>{task.title}</Text>
        <Text style={styles.small}>{task.status === "done" ? "Concluída" : task.status === "in_progress" ? "Em andamento" : task.status === "cancelled" ? "Cancelada" : "A fazer"}</Text>
        <Text style={styles.small}>{task.scheduledFor ? `Organizada para ${task.scheduledFor}` : "Sem agendamento"} · lembrete de trabalho, não prazo judicial.</Text>
        {task.status !== "cancelled" ? <ActionButton label={task.status === "done" ? `Reabrir tarefa: ${task.title}` : `Concluir tarefa: ${task.title}`} secondary onPress={() => {
          void api.setTaskStatus(task.id, task.status === "done" ? "todo" : "done").then(() => setMessage("Tarefa atualizada."), (error: unknown) => setMessage(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa."));
        }} /> : null}
      </View>)}
    </Card>
  </Screen>;
  return (
    <Screen title="Agenda" subtitle="Um dia de exemplo para organizar com calma.">
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
