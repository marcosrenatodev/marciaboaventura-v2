import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { AuthButton, AuthFrame, AuthLink, Field, StatusMessage } from "@/AuthUi";
import { useAuth } from "@/auth";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[]; error?: string | string[] }>();
  const token = firstParam(params.token);
  const linkError = firstParam(params.error);
  const { apiConfigured, serviceMaintenance, resetPassword } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setMessage("");
    if (newPassword.length < 12 || newPassword.length > 128) {
      setMessage("A nova senha precisa ter entre 12 e 128 caracteres.");
      return;
    }
    if (newPassword !== confirmation) {
      setMessage("A confirmação não corresponde à nova senha.");
      return;
    }
    if (!token) {
      setMessage("Este link está incompleto. Solicite um novo link de redefinição.");
      return;
    }
    setBusy(true);
    const error = await resetPassword(token, newPassword);
    setBusy(false);
    if (error) setMessage(error);
    else {
      setNewPassword("");
      setConfirmation("");
      router.replace("/login?passwordReset=success" as Href);
    }
  }

  return (
    <AuthFrame title="Criar nova senha" subtitle="Escolha uma senha nova com pelo menos 12 caracteres. Se sua conta tiver proteção em duas etapas, ela continuará ativa.">
      {!apiConfigured ? <StatusMessage>A API não está configurada. Fale com quem administra o app.</StatusMessage> : null}
      {serviceMaintenance ? <StatusMessage>O sistema está em manutenção. Tente novamente depois que a tela inicial indicar que voltou.</StatusMessage> : null}
      {linkError || !token ? <>
        <StatusMessage>Este link expirou, já foi usado ou está incompleto. Solicite outro link.</StatusMessage>
        <AuthLink href="/forgot-password">Solicitar novo link</AuthLink>
      </> : <>
        <Field label="Nova senha" value={newPassword} onChangeText={setNewPassword} secureTextEntry textContentType="newPassword" hint="Use entre 12 e 128 caracteres" />
        <Field label="Confirme a nova senha" value={confirmation} onChangeText={setConfirmation} secureTextEntry textContentType="newPassword" hint="Digite a mesma senha novamente" />
        {message ? <StatusMessage>{message}</StatusMessage> : null}
        <AuthButton label={busy ? "Aguarde…" : "Salvar nova senha"} onPress={() => void submit()} disabled={busy || !apiConfigured || serviceMaintenance || !newPassword || !confirmation} />
        <AuthLink href="/login">Voltar para entrar</AuthLink>
      </>}
    </AuthFrame>
  );
}
