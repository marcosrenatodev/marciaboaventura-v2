import { useState } from "react";
import { useRouter } from "expo-router";
import { AuthButton, AuthFrame, AuthLink, Field, StatusMessage } from "@/AuthUi";
import { useAuth } from "@/auth";

export default function LoginScreen() {
  const router = useRouter();
  const { apiConfigured, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setMessage("");
    setBusy(true);
    const error = await signIn(email, password);
    setBusy(false);
    if (error) setMessage(error);
    else {
      setPassword("");
      router.replace("/(tabs)");
    }
  }

  return (
    <AuthFrame title="Entrar" subtitle="Use o e-mail e a senha da sua conta do escritório.">
      {!apiConfigured && <StatusMessage>A API não está configurada. Entre em contato com quem administra o app.</StatusMessage>}
      <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" hint="Digite o e-mail da conta" />
      <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry hint="Digite sua senha" />
      {message ? <StatusMessage>{message}</StatusMessage> : null}
      <AuthButton label={busy ? "Entrando…" : "Entrar"} onPress={submit} disabled={busy || !apiConfigured || !email.trim() || !password} />
      <AuthLink href="/">Voltar</AuthLink>
    </AuthFrame>
  );
}
