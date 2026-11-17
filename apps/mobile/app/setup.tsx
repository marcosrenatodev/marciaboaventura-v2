import { useState } from "react";
import { useRouter } from "expo-router";
import { AuthButton, AuthFrame, AuthLink, Field, StatusMessage } from "@/AuthUi";
import { useAuth } from "@/auth";

export default function SetupScreen() {
  const router = useRouter();
  const { apiConfigured, setupOwner } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setMessage("");
    setBusy(true);
    const error = await setupOwner({ name, email, password, setupToken });
    setBusy(false);
    if (error) setMessage(error);
    else {
      setPassword("");
      setSetupToken("");
      router.replace("/(tabs)");
    }
  }

  return (
    <AuthFrame title="Configuração inicial" subtitle="Crie a conta responsável pelo escritório. Esta etapa exige um código de configuração fornecido pela administração.">
      {!apiConfigured && <StatusMessage>A API não está configurada. Nenhum dado será enviado. A configuração inicial fica indisponível por enquanto.</StatusMessage>}
      <Field label="Seu nome" value={name} onChangeText={setName} autoCapitalize="words" hint="Digite seu nome" />
      <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" hint="Digite o e-mail da conta" />
      <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry hint="Escolha uma senha para sua conta" />
      <Field label="Código de configuração" value={setupToken} onChangeText={setSetupToken} secureTextEntry hint="Digite o código de uso inicial" />
      {message ? <StatusMessage>{message}</StatusMessage> : null}
      <AuthButton label={busy ? "Configurando…" : "Criar conta responsável"} onPress={submit} disabled={busy || !apiConfigured || !name.trim() || !email.trim() || !password || !setupToken} />
      <AuthLink href="/">Voltar</AuthLink>
    </AuthFrame>
  );
}
