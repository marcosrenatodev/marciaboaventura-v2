import { AccessibleTextInput } from "@/components/AccessibleTextInput";
import { SecretTextInput } from "@/components/SecretTextInput";
import { TotpEnrollmentQr } from "@/components/TotpEnrollmentQr";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Platform, Pressable, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { authClient } from "@/auth-client";
import { useAuth } from "@/auth";
import { ActionButton, Card, Heading, Screen } from "@/components/Ui";
import { colors, styles } from "@/theme";
import { useWorkData } from "@/work-api";

type Enrollment = { secret: string; uri: string };

export default function AccountSecurityScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const api = useWorkData();
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [savedCodes, setSavedCodes] = useState(false);
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [confirmExport, setConfirmExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [exportIssue, setExportIssue] = useState("");
  const userWithSecurity = session ? session.user as typeof session.user & { twoFactorEnabled?: boolean } : undefined;
  const enabled = enabledOverride ?? Boolean(userWithSecurity?.twoFactorEnabled);

  useFocusEffect(useCallback(() => () => {
    setPassword("");
    setEnrollment(null);
    setBackupCodes(null);
    setSavedCodes(false);
    setCode("");
  }, []));

  async function beginEnrollment() {
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.twoFactor.enable({ password, method: "totp", issuer: "Márcia Escritório" });
      if (result.error || !result.data || result.data.method !== "totp") {
        setMessage("Não foi possível iniciar a configuração. Confira a senha e tente novamente.");
      } else {
        const uri = result.data.totpURI;
        const secret = uri.startsWith("otpauth://totp/") ? new URL(uri).searchParams.get("secret") : null;
        if (!secret) {
          setMessage("O autenticador não retornou uma chave válida. Tente iniciar a configuração novamente.");
        } else {
          setEnrollment({ secret, uri });
          setBackupCodes(result.data.backupCodes);
          setSavedCodes(false);
          setCode("");
          setPassword("");
        }
      }
    } catch {
      setMessage("Não foi possível iniciar a configuração. Confira a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnrollment() {
    if (!enrollment || !savedCodes) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code.trim() });
      if (result.error) {
        setMessage("O código não foi aceito. Confira o relógio do telefone e tente o código atual do autenticador.");
      } else {
        setEnabledOverride(true);
        setEnrollment(null);
        setBackupCodes(null);
        setSavedCodes(false);
        setCode("");
        setMessage("Proteção em duas etapas ativada para esta conta.");
      }
    } catch {
      setMessage("Não foi possível confirmar o código. Verifique a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function regenerateBackupCodes() {
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.twoFactor.generateBackupCodes({ password });
      if (result.error || !result.data) {
        setMessage("Não foi possível gerar códigos. Confira a senha e tente novamente.");
      } else {
        setBackupCodes(result.data.backupCodes);
        setSavedCodes(false);
        setPassword("");
        setMessage("Os códigos anteriores deixaram de valer. Guarde estes novos códigos agora.");
      }
    } catch {
      setMessage("Não foi possível gerar códigos. Verifique a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function disableTwoFactor() {
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.twoFactor.disable({ password });
      if (result.error) {
        setMessage("Não foi possível desativar. Confira a senha; se ela estiver correta, saia e entre novamente para atualizar a sessão e tente outra vez.");
      } else {
        setEnabledOverride(false);
        setBackupCodes(null);
        setSavedCodes(false);
        setPassword("");
        setMessage("Proteção em duas etapas desativada.");
      }
    } catch {
      setMessage("Não foi possível desativar. Verifique a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setPasswordMessage("");
    if (newPassword.length < 12 || newPassword.length > 128) {
      setPasswordMessage("A nova senha precisa ter entre 12 e 128 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("A confirmação não corresponde à nova senha.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        setPasswordMessage("Não foi possível alterar a senha. Confira a senha atual e, se a sessão estiver antiga, saia e entre novamente.");
      } else {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordMessage("Senha alterada. As outras sessões foram encerradas.");
      }
    } catch {
      setPasswordMessage("Não foi possível alterar a senha. Verifique a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function exportOfficeData() {
    if (exporting || api.sessionInfo?.tenant.role !== "owner") return;
    setExporting(true);
    setExportIssue("");
    setExportMessage("");
    let temporaryFile: File | null = null;
    try {
      const contents = await api.exportOfficeData();
      const fileName = `marcia-escritorio-dados-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === "web") {
        const objectUrl = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = fileName;
        link.rel = "noopener";
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else {
        if (!(await Sharing.isAvailableAsync())) throw new Error("O compartilhamento de arquivos não está disponível neste dispositivo.");
        temporaryFile = new File(Paths.cache, fileName);
        temporaryFile.create({ intermediates: true, overwrite: true });
        await temporaryFile.write(contents);
        await Sharing.shareAsync(temporaryFile.uri, { mimeType: "application/json", UTI: "public.json", dialogTitle: "Exportar dados do escritório" });
      }
      setConfirmExport(false);
      setExportMessage("Arquivo exportado. Ele contém informações confidenciais; guarde em local privado e compartilhe apenas com pessoas autorizadas.");
    } catch (error) {
      setExportIssue(error instanceof Error ? error.message : "Não foi possível exportar os dados agora.");
    } finally {
      if (temporaryFile?.exists) temporaryFile.delete();
      setExporting(false);
    }
  }

  return (
    <Screen title="Segurança da conta" subtitle="Proteja o acesso ao escritório com um código temporário e mantenha códigos de recuperação em local seguro.">
      <Card>
        <Heading>Proteção em duas etapas</Heading>
        <Text style={styles.text}>{enabled ? "Ativa: além da senha, o app pede um código do autenticador ou um código de recuperação ao entrar." : "Desativada: o acesso depende apenas da senha. Você pode ativá-la com qualquer app compatível com códigos TOTP."}</Text>
        {!enabled && !enrollment ? <>
          <SecretTextInput fieldLabel="senha atual" accessibilityLabel="Senha atual" value={password} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholder="Confirme sua senha atual" placeholderTextColor={colors.muted} />
          <ActionButton label={busy ? "Aguarde…" : "Configurar autenticador"} onPress={() => void beginEnrollment()} disabled={busy || !password} />
        </> : null}

        {enrollment ? <View style={styles.stack}>
          <View style={styles.tight}>
            <Text style={styles.strong}>1. Adicione esta conta ao app autenticador</Text>
            <Text style={styles.small}>No autenticador, escolha adicionar uma conta e escaneie o QR code.</Text>
            <TotpEnrollmentQr uri={enrollment.uri} />
            <Text style={styles.small}>Se estiver no mesmo aparelho ou não puder escanear, use a chave de configuração abaixo. Mantenha o QR code e a chave em privado.</Text>
            <Text testID="totp-enrollment-secret" accessibilityLabel="Chave privada para configurar o autenticador" accessibilityHint="Toque e segure para copiar. Guarde em local privado e não a compartilhe." selectable style={[styles.strong, { color: colors.wine, letterSpacing: 1 }]}>{enrollment.secret}</Text>
          </View>
          {backupCodes ? <View style={styles.tight}>
            <Text style={styles.strong}>2. Guarde estes códigos de recuperação</Text>
            <Text style={styles.small}>Cada código funciona uma vez. Guarde-os fora deste aparelho; eles substituem o autenticador se você perder acesso a ele.</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {backupCodes.map((item) => <Text key={item} testID="two-factor-backup-code" selectable style={styles.badge}>{item}</Text>)}
            </View>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: savedCodes }} accessibilityLabel="Confirmei que guardei os códigos de recuperação" onPress={() => setSavedCodes(!savedCodes)} style={[styles.task, { borderWidth: 2, borderColor: colors.controlLine }]}>
              <Text style={styles.text}>{savedCodes ? "☑" : "□"} Guardei os códigos em local seguro</Text>
            </Pressable>
          </View> : null}
          <View style={styles.tight}>
            <Text style={styles.strong}>3. Confirme que o autenticador está funcionando</Text>
            <AccessibleTextInput accessibilityLabel="Código de seis dígitos do autenticador" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoCapitalize="none" autoCorrect={false} maxLength={6} style={styles.input} placeholder="Código de seis números" placeholderTextColor={colors.muted} />
          </View>
          <ActionButton label={busy ? "Aguarde…" : "Confirmar e ativar"} onPress={() => void confirmEnrollment()} disabled={busy || !savedCodes || code.length !== 6} />
          <ActionButton label="Recomeçar configuração" secondary onPress={() => { setEnrollment(null); setBackupCodes(null); setSavedCodes(false); setCode(""); setMessage(""); }} disabled={busy} />
        </View> : null}

        {enabled && !enrollment ? <View style={styles.stack}>
          {backupCodes ? <View style={styles.tight}>
            <Text style={styles.strong}>Novos códigos de recuperação</Text>
            <Text style={styles.small}>Os códigos anteriores já foram invalidados. Guarde estes em local seguro agora.</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {backupCodes.map((item) => <Text key={item} testID="two-factor-backup-code" selectable style={styles.badge}>{item}</Text>)}
            </View>
            <ActionButton label="Já guardei os novos códigos" onPress={() => { setBackupCodes(null); setSavedCodes(true); }} />
          </View> : <>
            <SecretTextInput fieldLabel="senha atual" accessibilityLabel="Senha atual" value={password} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholder="Confirme sua senha atual" placeholderTextColor={colors.muted} />
            <ActionButton label={busy ? "Aguarde…" : "Gerar novos códigos de recuperação"} secondary onPress={() => void regenerateBackupCodes()} disabled={busy || !password} />
            <Text style={styles.small}>Gerar novos códigos invalida imediatamente os anteriores.</Text>
            <ActionButton label={busy ? "Aguarde…" : "Desativar proteção em duas etapas"} secondary onPress={() => void disableTwoFactor()} disabled={busy || !password} />
          </>}
        </View> : null}
        {message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text> : null}
      </Card>
      <Card>
        <Heading>Trocar senha</Heading>
        <Text style={styles.small}>Use uma senha nova de pelo menos 12 caracteres. Ao trocar, o app encerra suas outras sessões. Se sua sessão estiver antiga, entre novamente antes de continuar.</Text>
        <SecretTextInput fieldLabel="senha atual" accessibilityLabel="Senha atual para alteração" value={currentPassword} onChangeText={setCurrentPassword} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholder="Senha atual" placeholderTextColor={colors.muted} />
        <SecretTextInput fieldLabel="nova senha" accessibilityLabel="Nova senha" value={newPassword} onChangeText={setNewPassword} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholder="Nova senha (12 a 128 caracteres)" placeholderTextColor={colors.muted} />
        <SecretTextInput fieldLabel="confirmação da nova senha" accessibilityLabel="Confirme a nova senha" value={confirmPassword} onChangeText={setConfirmPassword} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholder="Confirme a nova senha" placeholderTextColor={colors.muted} />
        {passwordMessage ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{passwordMessage}</Text> : null}
        <ActionButton label={busy ? "Aguarde…" : "Alterar senha e encerrar outras sessões"} onPress={() => void changePassword()} disabled={busy || !currentPassword || !newPassword || !confirmPassword} />
      </Card>
      <Card>
        <Heading>Recuperação de conta</Heading>
        <Text style={styles.text}>Os códigos de recuperação permitem entrar se você perder o autenticador. Se esquecer a senha, use “Esqueci minha senha” na tela Entrar quando o envio de e-mail estiver configurado. Se perder a senha e todos os fatores, o procedimento assistido de recuperação ainda precisa ser definido. Não compartilhe sua senha, chave ou códigos com o suporte.</Text>
      </Card>
      {api.sessionInfo?.tenant.role === "owner" ? <Card>
        <Heading>Exportar dados do escritório</Heading>
        <Text style={styles.text}>Baixe um arquivo JSON com clientes, processos, notas, agenda, financeiro, consultas salvas, comprovantes e registros de atividade. O arquivo contém dados confidenciais em texto legível; guarde-o em local privado.</Text>
        <Text style={styles.small}>Os PDFs não são incluídos: baixe-os individualmente em Arquivos. Chaves e tokens do Google/Microsoft, senhas e códigos de recuperação nunca são exportados. Este arquivo ainda não pode ser restaurado como backup e pode reunir registros de momentos diferentes se você continuar alterando dados durante a exportação.</Text>
        {confirmExport ? <View style={styles.stack}>
          <Text style={styles.strong}>Confirme que está usando um dispositivo confiável e que vai guardar este arquivo em local privado.</Text>
          <ActionButton label={exporting ? "Preparando exportação…" : "Exportar arquivo JSON"} onPress={() => void exportOfficeData()} disabled={exporting} />
          <ActionButton label="Cancelar" secondary onPress={() => setConfirmExport(false)} disabled={exporting} />
        </View> : <ActionButton label="Preparar exportação" secondary onPress={() => { setExportIssue(""); setExportMessage(""); setConfirmExport(true); }} disabled={exporting} />}
        {exportIssue ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{exportIssue}</Text> : null}
        {exportMessage ? <Text accessibilityRole="status" accessibilityLiveRegion="polite" style={styles.notice}>{exportMessage}</Text> : null}
      </Card> : null}
      <ActionButton label="Voltar ao escritório" secondary onPress={() => router.replace("/(tabs)")} />
    </Screen>
  );
}
