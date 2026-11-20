import * as Linking from "expo-linking";
import { useState } from "react";
import { AuthButton, AuthFrame, AuthLink, Field, StatusMessage } from "@/AuthUi";
import { useAuth } from "@/auth";

export default function ForgotPasswordScreen() {
  const { apiConfigured, serviceMaintenance, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setBusy(true);
    setMessage("");
    const error = await requestPasswordReset(email, Linking.createURL("/reset-password"));
    setBusy(false);
    if (error) setMessage(error);
    else setSent(true);
  }

  return (
    <AuthFrame title="Recuperar acesso" subtitle="Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um link seguro para criar outra senha.">
      {!apiConfigured ? <StatusMessage>A API não está configurada. Fale com quem administra o app.</StatusMessage> : null}
      {serviceMaintenance ? <StatusMessage>O sistema está em manutenção. Tente novamente depois que a tela inicial indicar que voltou.</StatusMessage> : null}
      {sent ? <>
        <StatusMessage>Se este e-mail corresponder a uma conta do escritório, uma mensagem de redefinição será enviada. Confira sua caixa de entrada e o spam.</StatusMessage>
        <AuthLink href="/login">Voltar para entrar</AuthLink>
      </> : <>
        <Field label="E-mail da conta" value={email} onChangeText={setEmail} keyboardType="email-address" hint="Digite o e-mail usado para entrar" />
        {message ? <StatusMessage>{message}</StatusMessage> : null}
        <AuthButton label={busy ? "Aguarde…" : "Enviar link de redefinição"} onPress={() => void submit()} disabled={busy || !apiConfigured || serviceMaintenance || !email.trim()} />
        <AuthLink href="/login">Voltar para entrar</AuthLink>
      </>}
    </AuthFrame>
  );
}
