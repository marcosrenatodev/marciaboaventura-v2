import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ActionButton } from "@/components/Ui";
import type { AppointmentItem, TaskItem } from "@/work-api";
import { colors, styles } from "@/theme";

type CalendarEvent =
  | { kind: "task"; id: string; title: string; status: string }
  | { kind: "appointment"; id: string; title: string; startsAt: string; timezone: string; location: string | null };

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function dateKeyAtTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateKeyAtDeviceTimeZone(value: Date) {
  return dateKeyAtTimeZone(value, Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo");
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function monthStartFromKey(value: string) {
  const date = dateFromKey(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthTitle(value: Date) {
  const title = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(value);
  return title.charAt(0).toLocaleUpperCase("pt-BR") + title.slice(1);
}

function fullDayLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "full" }).format(dateFromKey(value));
}

function dayCountLabel(taskCount: number, appointmentCount: number) {
  const tasks = taskCount === 0 ? "nenhuma tarefa" : `${taskCount} ${taskCount === 1 ? "tarefa" : "tarefas"}`;
  const appointments = appointmentCount === 0
    ? "nenhum compromisso"
    : `${appointmentCount} ${appointmentCount === 1 ? "compromisso" : "compromissos"}`;
  return `${tasks} e ${appointments}`;
}

export function AgendaMonth({ tasks, appointments, loading, issue, onCreateTaskForDay, onCreateAppointmentForDay }: {
  tasks: TaskItem[];
  appointments: AppointmentItem[];
  loading: boolean;
  issue: string | null;
  onCreateTaskForDay: (isoDate: string) => void;
  onCreateAppointmentForDay: (isoDate: string) => void;
}) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  const todayKey = dateKeyAtTimeZone(new Date(), timeZone);
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [month, setMonth] = useState(() => monthStartFromKey(todayKey));
  const [focusedDay, setFocusedDay] = useState<string | null>(null);

  const eventsByDay = useMemo(() => {
    const result = new Map<string, CalendarEvent[]>();
    const addEvent = (key: string, event: CalendarEvent) => result.set(key, [...(result.get(key) ?? []), event]);
    for (const task of tasks) {
      if (task.scheduledOn && task.status !== "cancelled") {
        addEvent(task.scheduledOn, { kind: "task", id: task.id, title: task.title, status: task.status ?? "todo" });
      }
    }
    for (const appointment of appointments) {
      if (appointment.status !== "cancelled") {
        try {
          addEvent(dateKeyAtTimeZone(new Date(appointment.startsAt), appointment.timezone), {
            kind: "appointment", id: appointment.id, title: appointment.title,
            startsAt: appointment.startsAt, timezone: appointment.timezone, location: appointment.location ?? null,
          });
        } catch {
          // A malformed timezone must not prevent the rest of the agenda from rendering.
        }
      }
    }
    return result;
  }, [appointments, tasks]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      return { date, key: dateKeyAtDeviceTimeZone(date), inMonth: date.getMonth() === month.getMonth() };
    });
  }, [month]);

  const selectedEvents = eventsByDay.get(selectedDay) ?? [];
  const selectedDateLabel = fullDayLabel(selectedDay, timeZone);
  const previousMonth = () => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1));
  const nextMonth = () => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1));
  const goToToday = () => { setSelectedDay(todayKey); setMonth(monthStartFromKey(todayKey)); };

  return <View style={styles.card}>
    <View style={styles.tight}>
      <Text accessibilityRole="header" style={styles.heading}>Calendário mensal</Text>
      <Text style={styles.small}>Tarefas e compromissos para organizar a rotina. Não calcula nem confirma prazos judiciais.</Text>
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" onPress={previousMonth}
        style={({ pressed }) => [calendarStyles.monthButton, pressed && styles.pressed]}>
        <Text accessible={false} style={calendarStyles.monthArrow}>‹</Text>
      </Pressable>
      <Text testID="agenda-month-title" accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.strong, { textAlign: "center", flex: 1 }]}>{monthTitle(month)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Mês seguinte" onPress={nextMonth}
        style={({ pressed }) => [calendarStyles.monthButton, pressed && styles.pressed]}>
        <Text accessible={false} style={calendarStyles.monthArrow}>›</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar para hoje" onPress={goToToday}
        style={({ pressed }) => [calendarStyles.todayButton, pressed && styles.pressed]}>
        <Text style={calendarStyles.todayLabel}>Hoje</Text>
      </Pressable>
    </View>
    <View accessibilityRole="list" style={calendarStyles.grid}>
      {WEEKDAYS.map((weekday) => <Text key={weekday} accessibilityRole="text" style={calendarStyles.weekday}>{weekday}</Text>)}
      {days.map(({ date, key, inMonth }) => {
        const dayEvents = eventsByDay.get(key) ?? [];
        const taskCount = dayEvents.filter((event) => event.kind === "task").length;
        const appointmentCount = dayEvents.length - taskCount;
        const selected = key === selectedDay;
        const accessibilityLabel = `${fullDayLabel(key, timeZone)}, ${dayCountLabel(taskCount, appointmentCount)}`;
        return <Pressable key={key} testID={selected ? "agenda-selected-day" : undefined} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
          accessibilityState={{ selected }} onPress={() => {
            setSelectedDay(key);
            if (!inMonth) setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
          }} onFocus={() => setFocusedDay(key)} onBlur={() => setFocusedDay((value) => value === key ? null : value)}
          style={({ pressed }) => [calendarStyles.day, selected && calendarStyles.selectedDay,
            focusedDay === key && calendarStyles.focusedDay, pressed && styles.pressed]}>
          <Text style={[calendarStyles.dayNumber, selected && calendarStyles.selectedDayNumber, !inMonth && calendarStyles.outsideMonth]}>{date.getDate()}</Text>
          <Text style={[calendarStyles.dayCount, selected && calendarStyles.selectedDayNumber]}>{dayEvents.length ? dayEvents.length : " "}</Text>
        </Pressable>;
      })}
    </View>
    <Text style={styles.small}>O número pequeno abaixo do dia mostra quantas tarefas e compromissos estão organizados.</Text>
    <Text style={styles.eyebrow}>DIA SELECIONADO</Text>
    <Text accessibilityLiveRegion="polite" style={styles.strong}>{selectedDateLabel}</Text>
    {loading ? <Text accessibilityLiveRegion="polite" style={styles.small}>Carregando tarefas e compromissos…</Text>
      : issue ? <Text accessibilityLiveRegion="assertive" style={styles.small}>A agenda não pôde ser atualizada. Confira a conexão antes de considerar este dia vazio.</Text>
      : selectedEvents.length === 0 ? <Text style={styles.small}>Nada organizado para este dia. Tarefas sem data aparecem na aba Tarefas.</Text>
      : selectedEvents.map((event) => <View key={`${event.kind}:${event.id}`} style={calendarStyles.event}>
        <Text style={styles.eyebrow}>{event.kind === "task" ? "TAREFA" : "COMPROMISSO"}</Text>
        <Text style={styles.strong}>{event.title}</Text>
        {event.kind === "task" ? <Text style={styles.small}>
          {event.status === "done" ? "Concluída · organização de trabalho" : event.status === "in_progress" ? "Em andamento · organização de trabalho" : "A fazer · organização de trabalho"}
        </Text> : <>
          <Text style={styles.small}>{new Intl.DateTimeFormat("pt-BR", { timeZone: event.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(event.startsAt))} · lembrete de trabalho</Text>
          {event.location ? <Text style={styles.small}>{event.location}</Text> : null}
        </>}
      </View>)}
    <View style={styles.tight}>
      <ActionButton label="Criar tarefa para este dia" secondary onPress={() => onCreateTaskForDay(selectedDay)} />
      <ActionButton label="Criar compromisso para este dia" secondary onPress={() => onCreateAppointmentForDay(selectedDay)} />
    </View>
  </View>;
}

const calendarStyles = {
  grid: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 2 },
  weekday: { flexBasis: "13.4%" as const, flexGrow: 1, minWidth: 34, paddingVertical: 8, color: colors.muted, fontSize: 12, fontWeight: "700" as const, textAlign: "center" as const },
  day: { flexBasis: "13.4%" as const, flexGrow: 1, minWidth: 34, minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: 10, backgroundColor: colors.canvas, borderWidth: 2, borderColor: "transparent" },
  selectedDay: { backgroundColor: colors.wine, borderColor: colors.wine },
  focusedDay: { borderColor: colors.focus },
  dayNumber: { color: colors.ink, fontSize: 14, fontWeight: "600" as const, lineHeight: 17 },
  selectedDayNumber: { color: colors.paper },
  outsideMonth: { color: colors.muted },
  dayCount: { minHeight: 12, color: colors.wine, fontSize: 10, fontWeight: "700" as const, lineHeight: 12 },
  monthButton: { width: 44, height: 44, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: 12, backgroundColor: colors.wineWash },
  monthArrow: { color: colors.wine, fontSize: 30, lineHeight: 34 },
  todayButton: { minWidth: 52, minHeight: 44, paddingHorizontal: 10, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: 12, backgroundColor: colors.wineWash },
  todayLabel: { color: colors.wine, fontSize: 14, fontWeight: "700" as const },
  event: { gap: 4, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.paper },
};
