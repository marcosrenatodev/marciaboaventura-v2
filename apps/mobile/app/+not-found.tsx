import { useRouter } from "expo-router";
import { ActionButton, Screen } from "@/components/Ui";

export default function NotFoundScreen() {
  const router = useRouter();
  return <Screen title="Tela não encontrada" subtitle="Volte ao início para continuar a demonstração.">
    <ActionButton label="Ir para Hoje" onPress={() => router.replace("/")} />
  </Screen>;
}
