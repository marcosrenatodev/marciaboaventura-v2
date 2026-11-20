import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { AuthButton, AuthFrame, StatusMessage } from "@/AuthUi";
import { useAuth } from "@/auth";
import { styles } from "@/theme";

export default function WelcomeScreen() {
  const router = useRouter();
  const { apiConfigured, checkingSession, connectionIssue, serviceMaintenance, checkServiceStatus, session, enterDemo } = useAuth();

  useEffect(() => { if (!checkingSession && session) router.replace("/(tabs)"); }, [checkingSession, router, session]);
  if (checkingSession) return <AuthFrame title="Verificando acesso" subtitle="Só um momento." />;
  if (session) return null;

  return (
    <AuthFrame title="Bem-vinda" subtitle="Entre para acessar seu espaço de trabalho.">
      {!apiConfigured && <StatusMessage>A API não está configurada. A conta e a configuração inicial ficam indisponíveis até definir EXPO_PUBLIC_API_URL.</StatusMessage>}
      {serviceMaintenance ? <>
        <StatusMessage>O sistema do escritório está em manutenção. Nenhuma operação nova foi aceita. Quando voltar, confira ações iniciadas pouco antes.</StatusMessage>
        <AuthButton label="Verificar se o sistema voltou" secondary onPress={() => void checkServiceStatus()} />
      </> : null}
      {apiConfigured && connectionIssue && !serviceMaintenance && <StatusMessage>Não foi possível verificar a sessão. Confira a conexão com a API e tente entrar novamente.</StatusMessage>}
      <AuthButton label="Entrar com e-mail" onPress={() => router.push("/login")} disabled={!apiConfigured || serviceMaintenance} />
      <AuthButton label="Primeira configuração do escritório" secondary onPress={() => router.push("/setup")} disabled={!apiConfigured || serviceMaintenance} />
      <View style={styles.tight}>
        <Text style={styles.small}>Quer conhecer o scaffold? A demonstração usa exemplos inventados, só nesta sessão, sem API ou dados salvos.</Text>
        <AuthButton label="Explorar demonstração local" secondary onPress={() => { enterDemo(); router.replace("/(tabs)"); }} />
      </View>
    </AuthFrame>
  );
}
