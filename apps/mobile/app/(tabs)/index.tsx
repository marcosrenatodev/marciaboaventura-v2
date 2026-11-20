import { AccessibleTextInput } from "@/components/AccessibleTextInput";
import { TourAnchor } from "@/TourAnchors";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { ActionButton, Card, Heading, Screen, TaskList } from "@/components/Ui";
import { amountToReceive, appointments, formatMoney, useDemo } from "@/demo";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { colors, styles } from "@/theme";
import { isoDateToInput } from "@/zoned-time";
import { sumCents } from "@/money";
import { formatOpenTaskCount } from "@/open-task-count";
import { normalizeWorkspaceSearch } from "@/search";
import { useWorkspaceSearchNavigation } from "@/WorkspaceSearchNavigation";

function dateKeyInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default function TodayScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { reviewSeen, setReviewSeen } = useDemo();
  const { demoMode } = useAuth();
  const api = useWorkData();
  const { requestSearch } = useWorkspaceSearchNavigation();
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const openSearchResult = (target: "matters" | "courtCases" | "clients" | "agenda" | "finance", pathname: "/processos" | "/agenda" | "/financeiro") => {
    requestSearch(target, workspaceSearch);
    router.push(pathname);
  };
  if (!demoMode) {
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
    const todayKey = dateKeyInTimeZone(new Date(), userTimeZone);
    const todayAppointments = api.appointments.filter((appointment) => {
      if (appointment.status !== "scheduled") return false;
      return dateKeyInTimeZone(new Date(appointment.startsAt), userTimeZone) === todayKey;
    }).sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)).slice(0, 5);
    const openTasks = api.tasks.filter((task) => task.status !== "done" && task.status !== "cancelled")
      .sort((left, right) => (left.scheduledOn ?? "9999-12-31").localeCompare(right.scheduledOn ?? "9999-12-31")).slice(0, 5);
    const openTaskCount = api.tasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length;
    const toReceive = sumCents(api.financialEntries.filter((entry) => entry.kind === "income" && entry.status !== "paid" && entry.status !== "cancelled")
      .map((entry) => entry.amountCents));
    const normalizedQuery = normalizeWorkspaceSearch(workspaceSearch);
    const matches = normalizedQuery.length < 2 ? [] : [
      ...api.courtCases.filter((item) => normalizeWorkspaceSearch([
        item.caseNumber ?? "", item.label ?? "", item.courtName, item.jurisdiction ?? "",
        api.matters.find((matter) => matter.id === item.matterId)?.title ?? "",
      ].join(" ")).includes(normalizedQuery)).slice(0, 3).map((item) => ({
        id: `case-${item.id}`, kind: "Processo", title: item.label || item.caseNumber || item.courtName,
        detail: [item.caseNumber, item.courtName, item.jurisdiction].filter(Boolean).join(" · "),
        open: () => openSearchResult("courtCases", "/processos"),
      })),
      ...api.matters.filter((item) => normalizeWorkspaceSearch(`${item.title} ${item.description ?? ""} ${item.client?.displayName ?? ""}`).includes(normalizedQuery)).slice(0, 3).map((item) => ({
        id: `matter-${item.id}`, kind: "Assunto", title: item.title,
        detail: item.client?.displayName ? `Cliente: ${item.client.displayName}` : "Sem cliente vinculado",
        open: () => openSearchResult("matters", "/processos"),
      })),
      ...api.clients.filter((item) => normalizeWorkspaceSearch(`${item.displayName} ${item.email ?? ""} ${item.phone ?? ""}`).includes(normalizedQuery)).slice(0, 3).map((item) => ({
        id: `client-${item.id}`, kind: "Cliente", title: item.displayName,
        detail: item.email || item.phone || "Contato sem e-mail ou telefone",
        open: () => openSearchResult("clients", "/processos"),
      })),
      ...api.tasks.filter((item) => normalizeWorkspaceSearch(`${item.title} ${api.matters.find((matter) => matter.id === item.matterId)?.title ?? ""}`).includes(normalizedQuery)).slice(0, 3).map((item) => ({
        id: `task-${item.id}`, kind: "Tarefa", title: item.title,
        detail: item.status === "done" ? "Concluída · lembrete de trabalho" : "Em aberto · não é prazo processual",
        open: () => openSearchResult("agenda", "/agenda"),
      })),
      ...api.appointments.filter((item) => normalizeWorkspaceSearch(`${item.title} ${item.location ?? ""}`).includes(normalizedQuery)).slice(0, 3).map((item) => ({
        id: `appointment-${item.id}`, kind: "Compromisso", title: item.title,
        detail: item.location ?? (item.status === "cancelled" ? "Cancelado" : "Lembrete de trabalho"),
        open: () => openSearchResult("agenda", "/agenda"),
      })),
      ...api.financialEntries.filter((item) => normalizeWorkspaceSearch(`${item.description} ${item.category ?? ""}`).includes(normalizedQuery)).slice(0, 3).map((item) => ({
        id: `financial-${item.id}`, kind: item.kind === "income" ? "Receita" : "Despesa", title: item.description,
        detail: item.category ? `Categoria: ${item.category}` : item.status === "paid" ? "Recebida/paga" : "Lançamento sem categoria",
        open: () => openSearchResult("finance", "/financeiro"),
      })),
    ].slice(0, 12);
    return <Screen title="Seu espaço" subtitle="Veja suas tarefas e os registros carregados da API." tourScreenId="today"
      headerAction={<ActionButton label="Nova tarefa" accessibilityHint="Abre a Agenda para registrar um próximo passo de trabalho." onPress={() => router.push({ pathname: "/agenda", params: { quick: "task" } })} />}>
      {api.loading ? <Card><Text accessibilityLiveRegion="polite" style={styles.text}>Carregando dados do escritório…</Text></Card> : null}
      {api.issue ? <Card><Heading>Conexão pendente</Heading><Text accessibilityLiveRegion="assertive" style={styles.text}>{api.issue}</Text><ActionButton label="Tentar novamente" secondary onPress={() => void api.refresh()} /></Card> : null}
      {api.sessionInfo && !api.issue ? <>
        <Card>
          <Heading>Buscar no escritório</Heading>
          <Text style={styles.small}>Clientes, assuntos, processos, tarefas, compromissos e financeiro.</Text>
          <TourAnchor id="today.workspace-search">
            <AccessibleTextInput accessibilityLabel="Buscar clientes, assuntos, processos, tarefas, compromissos ou lançamentos financeiros"
              placeholder="Nome, processo ou palavra-chave" placeholderTextColor={colors.muted}
              value={workspaceSearch} onChangeText={setWorkspaceSearch} autoCorrect={false} autoComplete="off" returnKeyType="search" maxLength={120} style={styles.input} />
          </TourAnchor>
          {workspaceSearch.trim().length > 0 && workspaceSearch.trim().length < 2 ? <Text style={styles.small}>Digite pelo menos duas letras.</Text> : null}
          {normalizedQuery.length >= 2 && matches.length === 0 ? <Text style={styles.text}>Nenhum resultado nos registros carregados.</Text> : null}
          {matches.map((match) => <View key={match.id} style={styles.tight}>
            <Text style={styles.eyebrow}>{match.kind}</Text>
            <Text style={styles.strong}>{match.title}</Text>
            {match.detail ? <Text style={styles.small}>{match.detail}</Text> : null}
            <ActionButton label={`Abrir ${match.kind.toLocaleLowerCase("pt-BR")}: ${match.title}`} secondary onPress={match.open} />
          </View>)}
          {api.courtCasesNextCursor ? <Text style={styles.small}>Há mais processos para carregar. A busca inclui apenas os processos já carregados; abra Processos e use “Carregar mais processos” para ampliar a busca.</Text> : null}
        </Card>
        <Card style={styles.priority}>
          <Text style={styles.eyebrow}>PRÓXIMAS AÇÕES</Text>
          <Heading>{formatOpenTaskCount(openTaskCount)}</Heading>
          <Text style={styles.small}>Tarefas organizam o trabalho. Nenhuma delas confirma prazo processual.</Text>
          <ActionButton label="Abrir tarefas" secondary onPress={() => router.push("/agenda")} />
        </Card>
        <Card testID="today-quick-actions">
          <Heading>Ações rápidas</Heading>
          <Text style={styles.small}>Toque para abrir o campo certo e começar um registro.</Text>
          <View style={width >= 640 ? styles.columns : styles.stack}>
            <View style={styles.flexible}>
              <ActionButton label="Novo processo" accessibilityHint="Abre o cadastro de processo e posiciona o cursor no campo do tribunal." secondary onPress={() => router.push({ pathname: "/processos", params: { quick: "case" } })} />
            </View>
            <View style={styles.flexible}>
              <ActionButton label="Registrar receita" accessibilityHint="Abre o financeiro e prepara um lançamento de receita." secondary onPress={() => router.push({ pathname: "/financeiro", params: { quick: "income" } })} />
              <ActionButton label="Lançar despesa" accessibilityHint="Abre o financeiro e prepara um lançamento de despesa." secondary onPress={() => router.push({ pathname: "/financeiro", params: { quick: "expense" } })} />
            </View>
          </View>
        </Card>
        <Card>
          <Heading>Compromissos de hoje</Heading>
          <Text style={styles.small}>Horários convertidos para o fuso deste aparelho. Confira a fonte oficial quando o encontro for audiência.</Text>
          {todayAppointments.length === 0 ? <Text style={styles.text}>Nenhum compromisso agendado para hoje.</Text> : todayAppointments.map((appointment) => <View key={appointment.id} style={styles.tight}>
            <Text style={styles.time}>{new Intl.DateTimeFormat("pt-BR", { timeZone: userTimeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(appointment.startsAt))}</Text>
            <Text style={styles.strong}>{appointment.title}</Text>
            {appointment.location ? <Text style={styles.small}>{appointment.location}</Text> : null}
          </View>)}
          <ActionButton label="Abrir agenda" secondary onPress={() => router.push("/agenda")} />
        </Card>
        <View style={width >= 800 ? styles.columns : styles.stack}>
          <Card style={width >= 800 ? styles.mainColumn : undefined}>
            <Heading>Tarefas</Heading>
            {openTasks.length === 0 ? <Text style={styles.text}>Nenhuma tarefa em aberto.</Text> : openTasks.map((task) => {
              const linkedMatter = api.matters.find((matter) => matter.id === task.matterId);
              const linkedMatterLabel = linkedMatter
                ? `${linkedMatter.status === "archived" ? "Assunto arquivado" : "Assunto"}: ${linkedMatter.title}`
                : "Sem assunto vinculado";
              return <View key={task.id} style={styles.tight}>
                <Text style={styles.strong}>{task.title}</Text>
                <Text accessibilityLabel={`Assunto da tarefa ${task.title}: ${linkedMatter?.title ?? "Sem assunto vinculado"}${linkedMatter?.status === "archived" ? " (arquivado)" : ""}`} style={styles.small}>{linkedMatterLabel}</Text>
                <Text style={styles.small}>{task.scheduledOn ? `Organizada para ${isoDateToInput(task.scheduledOn)}` : "Sem data de organização"} · não é prazo judicial.</Text>
                <Text style={styles.small}>{task.status === "in_progress" ? "Em andamento" : "A fazer"} · lembrete de trabalho</Text>
              </View>;
            })}
          </Card>
          <Card style={width >= 800 ? styles.sideColumn : undefined}>
            <Text style={styles.eyebrow}>RECEITAS A RECEBER</Text><Text style={styles.amount}>{formatMoney(toReceive)}</Text>
            <Text style={styles.small}>Resumo dos registros desta API.</Text>
            <ActionButton label="Ver financeiro" secondary onPress={() => router.push("/financeiro")} />
          </Card>
        </View>
        <Card>
          <Heading>Conteúdo informativo</Heading>
          <Text style={styles.small}>Prepare um texto, revise e compartilhe manualmente quando estiver pronto.</Text>
          <ActionButton label="Criar rascunho para redes sociais" secondary onPress={() => router.push("../conteudo")} />
        </Card>
      </> : null}
    </Screen>;
  }
  return (
    <Screen title="Bom dia, Márcia." subtitle="Seu dia, com uma coisa de cada vez." tourScreenId="today">
      <ActionButton label="Buscar um assunto de exemplo" secondary onPress={() => router.push("/processos")} />
      <View style={width >= 800 ? styles.columns : styles.stack}>
        <View style={width >= 800 ? styles.mainColumn : styles.stack}>
          <Card style={styles.priority}>
            <Text style={styles.eyebrow}>PRIMEIRO, A SUA ATENÇÃO</Text>
            <Heading>{reviewSeen ? "Você conheceu o fluxo de revisão" : "1 revisão para experimentar"}</Heading>
            <Text style={styles.text}>{reviewSeen
              ? "Exemplo visto. Nenhum prazo foi confirmado e nenhuma providência foi registrada em um processo real."
              : "Veja como conferir a origem de uma comunicação antes de decidir o próximo passo."}</Text>
            <Text style={styles.small}>Origem: exemplo criado para esta tela. Nenhum tribunal foi consultado.</Text>
            {reviewSeen
              ? <ActionButton label="Recomeçar este exemplo" secondary onPress={() => setReviewSeen(false)} />
              : <ActionButton label="Entender a revisão" onPress={() => router.push("/revisao")} />}
          </Card>
          <Card>
            <Heading>Pequenos próximos passos</Heading>
            <Text style={styles.small}>Toque para concluir uma tarefa de exemplo. Você pode desfazer.</Text>
            <TaskList />
          </Card>
        </View>
        <View style={width >= 800 ? styles.sideColumn : styles.stack}>
          <Card>
            <Heading>Agenda do dia</Heading>
            <Text style={styles.small}>Horários fictícios, só para explorar a tela.</Text>
            {appointments.map((appointment) => <View key={appointment.time} style={styles.tight}>
              <Text style={styles.time}>{appointment.time}</Text>
              <Text style={styles.strong}>{appointment.title}</Text>
              <Text style={styles.small}>{appointment.detail}</Text>
            </View>)}
            <ActionButton label="Abrir agenda" secondary onPress={() => router.push("/agenda")} />
          </Card>
          <Card>
            <Text style={styles.eyebrow}>FINANCEIRO DE EXEMPLO</Text>
            <Text style={styles.small}>Honorários a receber</Text>
            <Text style={styles.amount}>{formatMoney(amountToReceive)}</Text>
            <Text style={styles.small}>Valor fictício. Nenhuma conta bancária conectada.</Text>
            <ActionButton label="Ver financeiro" secondary onPress={() => router.push("/financeiro")} />
          </Card>
        </View>
      </View>
      <Card>
        <Heading>Conteúdo informativo</Heading>
        <Text style={styles.small}>Prepare um texto, revise e compartilhe manualmente quando estiver pronto.</Text>
        <ActionButton label="Criar rascunho para redes sociais" secondary onPress={() => router.push("../conteudo")} />
      </Card>
    </Screen>
  );
}
