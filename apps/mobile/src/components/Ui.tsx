import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type PropsWithChildren } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDemo } from "@/demo";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { colors, styles } from "@/theme";

export function Screen({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle: string }>) {
  const router = useRouter();
  const { session, demoMode, signOut, exitDemo } = useAuth();
  const { sessionInfo, issue } = useWorkData();
  const demo = demoMode;
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.demo}>
        <Text style={styles.demoTitle}>{demo ? "Demonstração · dados inteiramente fictícios" : sessionInfo ? "Escritório conectado · dados da API" : "Aguardando conexão segura com o escritório"}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.demoText}>{demo ? "Sem fonte judicial ou backend. Nada é enviado ou salvo." : issue ?? (sessionInfo ? `Sessão confirmada · acesso ${sessionInfo.tenant.role}.` : "Os dados só aparecem depois de confirmar a sessão na API.")}</Text>
        {session || demoMode ? <ActionButton label={session ? "Sair da conta" : "Encerrar demonstração"} secondary onPress={() => {
          if (session) void signOut();
          if (demoMode) exitDemo();
          router.replace("/");
        }} /> : null}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.tight}>
          <Text style={styles.brand}>MÁRCIA BOAVENTURA</Text>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {children}
        <Text style={styles.small}>{demo ? "As mudanças ficam somente nesta sessão. Ao recarregar ou fechar o app, os exemplos recomeçam." : "Dados exibidos pela API do escritório. Se a conexão ou sessão falhar, os registros não serão apresentados como salvos."}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Heading({ children }: PropsWithChildren) {
  return <Text accessibilityRole="header" style={styles.heading}>{children}</Text>;
}

export function ActionButton({ label, onPress, secondary, accessibilityHint }: {
  label: string; onPress: () => void; secondary?: boolean; accessibilityHint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint}
      onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, focused && styles.focused, pressed && styles.pressed]}>
      <Text style={[styles.buttonLabel, secondary && styles.buttonLabelSecondary]}>{label}</Text>
    </Pressable>
  );
}

function TaskRow({ task, onPress }: { task: { id: string; title: string; detail: string; done: boolean }; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: task.done }}
      accessibilityLabel={`${task.title}. ${task.detail}`}
      accessibilityHint="Altera apenas esta tarefa fictícia; toque novamente para desfazer."
      onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.task, task.done && styles.taskDone, focused && styles.focused, pressed && styles.pressed]}>
      <Ionicons accessible={false} name={task.done ? "checkbox" : "square-outline"} size={26} color={task.done ? colors.green : colors.wine} />
      <View style={[styles.flexible, styles.tight]}>
        <Text style={styles.strong}>{task.title}</Text>
        <Text style={styles.small}>{task.detail}</Text>
        <Text style={styles.small}>{task.done ? "Concluída no exemplo · toque para desfazer" : "A fazer no exemplo"}</Text>
      </View>
    </Pressable>
  );
}

export function TaskList() {
  const { tasks, toggleTask } = useDemo();
  return <View style={styles.stack}>{tasks.map((task) => <TaskRow key={task.id} task={task} onPress={() => toggleTask(task.id)} />)}</View>;
}
