import { useState } from "react";
import { Redirect } from "expo-router";
import { z } from "zod";
import { AuthButton, AuthFrame, AuthLink, Field, StatusMessage } from "@/AuthUi";
import { useAuth } from "@/auth";

const setupEmail = z.string().trim().email().max(320);

function lengthFeedback(length: number, minimum: number, maximum: number) {
  const met = length >= minimum && length <= maximum;
  const progress = Math.min(length / minimum, 1);
  if (length > maximum) return { met, progress, message: `${length}/${maximum} caracteres · limite excedido` };
  if (met) return { met, progress, message: `${length} caracteres · tamanho adequado` };
  return { met, progress, message: `${length}/${minimum} caracteres · mínimo necessário` };
}

export default function SetupScreen() {
  const { apiConfigured, serviceMaintenance, session, setupOwner } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const nameLength = name.trim().length;
  const nameValid = nameLength > 0 && nameLength <= 120;
  const emailValid = setupEmail.safeParse(email).success;
  const passwordFeedback = lengthFeedback(password.length, 12, 128);
  const codeFeedback = lengthFeedback(setupToken.length, 32, 512);
  const canSubmit = nameValid && emailValid && passwordFeedback.met && codeFeedback.met;

  async function submit() {
    if (!canSubmit || busy || !apiConfigured || serviceMaintenance) return;
    setMessage("");
    setBusy(true);
    const error = await setupOwner({ name, email, password, setupToken });
    setBusy(false);
    if (error) setMessage(error);
    else {
      setPassword("");
      setSetupToken("");
    }
  }

  if (session) return <Redirect href="/(tabs)" />;

  return (
    <AuthFrame title="Configuração inicial" subtitle="Crie a conta responsável pelo escritório. Esta etapa exige um código de configuração fornecido pela administração.">
      {!apiConfigured && <StatusMessage>A API não está configurada. Nenhum dado será enviado. A configuração inicial fica indisponível por enquanto.</StatusMessage>}
      {serviceMaintenance ? <StatusMessage>O sistema está em manutenção. Volte à tela inicial para verificar quando a configuração estiver disponível.</StatusMessage> : null}
      <Field label="Seu nome" value={name} onChangeText={setName} autoCapitalize="words" hint="Digite seu nome, com até 120 caracteres"
        feedback={{
          met: nameValid,
          message: `${nameLength}/120 caracteres · ${nameValid ? "nome preenchido" : nameLength > 120 ? "limite excedido" : "campo obrigatório"}`,
        }} />
      <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" hint="Digite o e-mail da conta"
        feedback={{ met: emailValid, message: emailValid ? "Formato válido" : "Informe um e-mail no formato nome@exemplo.com." }} />
      <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword"
        hint="Escolha uma senha de 12 a 128 caracteres" feedback={passwordFeedback} />
      <Field label="Código de configuração" value={setupToken} onChangeText={setSetupToken} secureTextEntry
        hint="Digite o código de uso inicial. A API confere o código ao enviar." feedback={codeFeedback} />
      {message ? <StatusMessage>{message}</StatusMessage> : null}
      <AuthButton label={busy ? "Configurando…" : "Criar conta responsável"} onPress={submit} disabled={busy || !apiConfigured || serviceMaintenance || !canSubmit} />
      <AuthLink href="/">Voltar</AuthLink>
    </AuthFrame>
  );
}
