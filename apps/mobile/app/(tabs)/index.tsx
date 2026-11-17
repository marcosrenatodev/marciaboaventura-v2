import { useRouter } from "expo-router";
import { Text, useWindowDimensions, View } from "react-native";
import { ActionButton, Card, Heading, Screen, TaskList } from "@/components/Ui";
import { amountToReceive, appointments, formatMoney, useDemo } from "@/demo";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { styles } from "@/theme";

export default function TodayScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { reviewSeen, setReviewSeen } = useDemo();
  const { demoMode } = useAuth();
  const api = useWorkData();
  if (!demoMode) {
    const toReceive = api.financialEntries.filter((entry) => entry.kind === "income" && entry.status !== "paid" && entry.status !== "cancelled")
      .reduce((total, entry) => total + entry.amountCents, 0);
    return <Screen title="Seu espaço" subtitle="Veja suas tarefas e os registros carregados da API.">
      {api.loading ? <Card><Text accessibilityLiveRegion="polite" style={styles.text}>Carregando dados do escritório…</Text></Card> : null}
      {api.issue ? <Card><Heading>Conexão pendente</Heading><Text accessibilityLiveRegion="assertive" style={styles.text}>{api.issue}</Text><ActionButton label="Tentar novamente" secondary onPress={() => void api.refresh()} /></Card> : null}
      {api.sessionInfo && !api.issue ? <>
        <Card style={styles.priority}>
          <Text style={styles.eyebrow}>PRÓXIMAS AÇÕES</Text>
          <Heading>{api.tasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length} tarefas em aberto</Heading>
          <Text style={styles.small}>Tarefas organizam o trabalho. Nenhuma delas confirma prazo processual.</Text>
          <ActionButton label="Abrir tarefas" secondary onPress={() => router.push("/agenda")} />
        </Card>
        <View style={width >= 800 ? styles.columns : styles.stack}>
          <Card style={width >= 800 ? styles.mainColumn : undefined}>
            <Heading>Tarefas</Heading>
            {api.tasks.length === 0 ? <Text style={styles.text}>Ainda não há tarefas cadastradas.</Text> : api.tasks.map((task) => <View key={task.id} style={styles.tight}>
              <Text style={styles.strong}>{task.title}</Text><Text style={styles.small}>{task.status === "done" ? "Concluída" : task.status === "in_progress" ? "Em andamento" : "A fazer"} · lembrete de trabalho</Text>
            </View>)}
          </Card>
          <Card style={width >= 800 ? styles.sideColumn : undefined}>
            <Text style={styles.eyebrow}>RECEITAS A RECEBER</Text><Text style={styles.amount}>{formatMoney(toReceive)}</Text>
            <Text style={styles.small}>Resumo dos registros desta API.</Text>
            <ActionButton label="Ver financeiro" secondary onPress={() => router.push("/financeiro")} />
          </Card>
        </View>
      </> : null}
    </Screen>;
  }
  return (
    <Screen title="Bom dia, Márcia." subtitle="Seu dia, com uma coisa de cada vez.">
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
    </Screen>
  );
}
