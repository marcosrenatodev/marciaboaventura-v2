import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActionButton, Card, Heading, Screen } from "@/components/Ui";
import { useWorkData } from "@/work-api";
import { styles } from "@/theme";

type Provider = "google_drive" | "microsoft_graph";
type Outcome = "connected" | "denied" | "failed";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function IntegrationOAuthResult() {
  const params = useLocalSearchParams<{ provider?: string | string[]; result?: string | string[] }>();
  const providerValue = first(params.provider);
  const resultValue = first(params.result);
  const provider: Provider | null = providerValue === "google_drive" || providerValue === "microsoft_graph" ? providerValue : null;
  const outcome: Outcome | null = resultValue === "connected" || resultValue === "denied" || resultValue === "failed" ? resultValue : null;
  const api = useWorkData();
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const loadIntegrationSettings = api.loadIntegrationSettings;

  useEffect(() => {
    if (!provider || outcome !== "connected") return;
    let active = true;
    loadIntegrationSettings().then((settings) => {
      const providerSettings = provider === "google_drive" ? settings.googleDrive : settings.microsoftGraph;
      if (active) setVerified(providerSettings.connectionStatus === "connected");
    }).catch(() => {
      if (active) setVerified(false);
    });
    return () => { active = false; };
  }, [loadIntegrationSettings, outcome, provider]);

  const heading = outcome === "connected" ? "Conta conectada"
    : outcome === "denied" ? "Conexão cancelada"
      : "Não foi possível conectar";
  const message = outcome === "connected"
    ? verified
      ? "A autorização foi guardada com segurança. A próxima etapa é escolher quais documentos o escritório quer vincular."
      : "O provedor concluiu a autorização, mas não conseguimos confirmar o estado no app. Volte às configurações de integrações e atualize o status."
    : outcome === "denied"
      ? "Nenhuma conta foi conectada. Você pode tentar novamente quando quiser."
      : "A autorização não foi concluída. Nenhum token foi mostrado no app; confira as configurações e tente novamente.";

  return <Screen title="Integração" subtitle="Retorno seguro do serviço de arquivos.">
    <Card>
      <Heading>{heading}</Heading>
      <Text accessibilityLiveRegion="polite" style={styles.text}>{message}</Text>
      {provider ? <Text style={styles.small}>{provider === "google_drive" ? "Google Drive" : "Microsoft OneDrive"}</Text> : null}
    </Card>
    <ActionButton label="Voltar ao escritório" onPress={() => router.replace("/(tabs)/processos")} />
  </Screen>;
}
