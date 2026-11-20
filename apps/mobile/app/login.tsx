import { useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { AuthButton, AuthFrame, AuthLink, Field, StatusMessage } from "@/AuthUi";
import { useAuth } from "@/auth";

export default function LoginScreen() {
  const params = useLocalSearchParams<{ passwordReset?: string | string[] }>();
  const { apiConfigured, serviceMaintenance, session, signIn, verifySecondFactor } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setMessage("");
    setBusy(true);
    if (twoFactorRequired) {
      const error = await verifySecondFactor(code, useBackupCode ? "backup" : "totp");
      setBusy(false);
      if (error) setMessage(error);
      else setCode("");
      return;
    }

    const result = await signIn(email, password);
    setBusy(false);
    if (result.error) setMessage(result.error);
    else if (result.twoFactorRequired) {
      setPassword("");
      setTwoFactorRequired(true);
      setMessage("Esta conta tem proteção em duas etapas. Digite o código do autenticador para continuar.");
    } else {
      setPassword("");
    }
  }

  if (session) return <Redirect href="/(tabs)" />;

  return (
    <AuthFrame title={twoFactorRequired ? "Confirmar acesso" : "Entrar"} subtitle={twoFactorRequired ? "Use o app autenticador ou um código de recuperação salvo anteriormente." : "Use o e-mail e a senha da sua conta do escritório."}>
      {!apiConfigured && <StatusMessage>A API não está configurada. Entre em contato com quem administra o app.</StatusMessage>}
      {serviceMaintenance ? <StatusMessage>O sistema está em manutenção. Tente novamente depois que a tela inicial indicar que voltou.</StatusMessage> : null}
      {params.passwordReset === "success" ? <StatusMessage>Sua senha foi alterada e as sessões anteriores foram encerradas. Entre com a senha nova.</StatusMessage> : null}
      {twoFactorRequired ? <Field
        label={useBackupCode ? "Código de recuperação" : "Código do autenticador"}
        value={code}
        onChangeText={setCode}
        keyboardType={useBackupCode ? "default" : "number-pad"}
        autoCapitalize={useBackupCode ? "characters" : "none"}
        hint={useBackupCode ? "Cada código de recuperação pode ser usado uma única vez" : "Digite o código atual de seis números"}
      /> : <>
        <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" hint="Digite o e-mail da conta" />
        <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry hint="Digite sua senha" />
      </>}
      {message ? <StatusMessage>{message}</StatusMessage> : null}
      <AuthButton
        testID="auth-login-submit"
        label={busy ? "Aguarde…" : twoFactorRequired ? "Confirmar código" : "Entrar"}
        onPress={submit}
        disabled={busy || !apiConfigured || serviceMaintenance || (twoFactorRequired ? !code.trim() : !email.trim() || !password)}
      />
      {twoFactorRequired ? <>
        <AuthButton label={useBackupCode ? "Usar código do autenticador" : "Usar código de recuperação"} secondary onPress={() => { setUseBackupCode(!useBackupCode); setCode(""); setMessage(""); }} disabled={busy} />
        <AuthButton label="Voltar ao login" secondary onPress={() => { setTwoFactorRequired(false); setUseBackupCode(false); setCode(""); setMessage(""); }} disabled={busy} />
      </> : <AuthLink href="/forgot-password">Esqueci minha senha</AuthLink>}
      <AuthLink href="/">Voltar</AuthLink>
    </AuthFrame>
  );
}
