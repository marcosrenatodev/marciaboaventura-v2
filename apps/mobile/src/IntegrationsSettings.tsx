import { AccessibleTextInput } from "@/components/AccessibleTextInput";
import { SecretTextInput } from "@/components/SecretTextInput";
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Text, View } from "react-native";
import { ActionButton, Card, Heading, Screen } from "@/components/Ui";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { IntegrationSettingsUpdateSchema } from "@marcia/contracts";
import type { z } from "zod";
import { colors, styles } from "@/theme";

type IntegrationUpdate = z.infer<typeof IntegrationSettingsUpdateSchema>;

export function IntegrationsSettings({ onBack }: { onBack: () => void }) {
  const { demoMode } = useAuth();
  const api = useWorkData();
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof api.loadIntegrationSettings>> | null>(null);
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleClearSecret, setGoogleClearSecret] = useState(false);
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [microsoftTenantId, setMicrosoftTenantId] = useState("");
  const [microsoftClientSecret, setMicrosoftClientSecret] = useState("");
  const [microsoftClearSecret, setMicrosoftClearSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingClear, setPendingClear] = useState<"google_drive" | "microsoft_graph" | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<"google_drive" | "microsoft_graph" | null>(null);
  const [message, setMessage] = useState("");
  const [messageProvider, setMessageProvider] = useState<"google_drive" | "microsoft_graph" | null>(null);
  const [issue, setIssue] = useState("");

  const loadIntegrationSettings = api.loadIntegrationSettings;
  const ownerRole = api.sessionInfo?.tenant.role;
  const load = useCallback(async () => {
    if (demoMode || ownerRole !== "owner") return;
    try {
      const value = await loadIntegrationSettings();
      setSettings(value);
      setGoogleClientId(value.googleDrive.clientId ?? "");
      setMicrosoftClientId(value.microsoftGraph.clientId ?? "");
      setMicrosoftTenantId(value.microsoftGraph.tenantId ?? "");
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível carregar as configurações.");
    } finally { setLoading(false); }
  }, [demoMode, loadIntegrationSettings, ownerRole]);

  useEffect(() => {
    if (demoMode || ownerRole !== "owner") return;
    let active = true;
    loadIntegrationSettings().then((value) => {
      if (!active) return;
      setSettings(value);
      setGoogleClientId(value.googleDrive.clientId ?? "");
      setMicrosoftClientId(value.microsoftGraph.clientId ?? "");
      setMicrosoftTenantId(value.microsoftGraph.tenantId ?? "");
    }).catch((error: unknown) => {
      if (active) setIssue(error instanceof Error ? error.message : "Não foi possível carregar as configurações.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [demoMode, loadIntegrationSettings, ownerRole]);

  async function save(input: IntegrationUpdate) {
    if (saving) return;
    setSaving(true); setIssue(""); setMessage(""); setMessageProvider(null);
    try {
      await api.saveIntegrationSettings(input);
      setGoogleApiKey(""); setGoogleClientSecret(""); setGoogleClearSecret(false);
      setMicrosoftClientSecret(""); setMicrosoftClearSecret(false);
      setMessage("Credenciais salvas cifradas no servidor. Nenhum segredo foi devolvido ao app.");
      setMessageProvider(input.provider);
      await load();
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível salvar as credenciais.");
    } finally { setSaving(false); }
  }

  async function clear(provider: "google_drive" | "microsoft_graph") {
    if (pendingClear !== provider || saving) return;
    setSaving(true); setIssue(""); setMessage(""); setMessageProvider(null);
    try {
      await api.clearIntegrationSettings(provider);
      setPendingClear(null);
      if (provider === "google_drive") { setGoogleApiKey(""); setGoogleClientId(""); setGoogleClientSecret(""); setGoogleClearSecret(false); }
      else { setMicrosoftClientId(""); setMicrosoftTenantId(""); setMicrosoftClientSecret(""); setMicrosoftClearSecret(false); }
      setMessage("Credenciais removidas do cofre. A conta nunca esteve conectada a arquivos.");
      setMessageProvider(provider);
      await load();
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível remover as credenciais.");
    } finally { setSaving(false); }
  }

  async function connect(provider: "google_drive" | "microsoft_graph") {
    if (saving) return;
    setSaving(true); setIssue(""); setMessage(""); setMessageProvider(null);
    try {
      const authorizationUrl = await api.startIntegrationConnection(provider);
      if (Platform.OS === "web") window.location.assign(authorizationUrl);
      else await Linking.openURL(authorizationUrl);
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível iniciar a conexão segura.");
      setSaving(false);
    }
  }

  async function disconnect(provider: "google_drive" | "microsoft_graph") {
    if (pendingDisconnect !== provider || saving) return;
    setSaving(true); setIssue(""); setMessage(""); setMessageProvider(null);
    try {
      const result = await api.disconnectIntegration(provider);
      setPendingDisconnect(null);
      setMessage(provider === "google_drive"
        ? result.providerRevocation === "confirmed"
          ? "A conta foi desconectada e o token de atualização foi revogado no Google."
          : "A conta foi desconectada deste app. Para remover a autorização no Google, revise os apps conectados na sua Conta Google."
        : "A conta foi desconectada deste app. Para revogar o consentimento Microsoft, revise os aplicativos autorizados na conta ou peça ajuda ao administrador do Microsoft 365.");
      setMessageProvider(provider);
      await load();
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível desconectar a conta.");
    } finally { setSaving(false); }
  }

  if (demoMode) return <Screen title="Integrações" subtitle="Conecte serviços somente em uma sessão real do escritório." tourScreenId="cases">
    <Card><Heading>Demonstração sem conexões</Heading><Text style={styles.text}>Este modo usa exemplos fictícios e não armazena chaves, tokens ou credenciais.</Text></Card>
    <ActionButton label="Voltar para assuntos e processos" secondary onPress={onBack} />
  </Screen>;

  if (api.sessionInfo?.tenant.role !== "owner") return <Screen title="Integrações" subtitle="Configuração reservada à pessoa responsável pelo escritório." tourScreenId="cases">
    <Card><Heading>Acesso de responsável necessário</Heading><Text style={styles.text}>Somente a conta owner pode configurar credenciais de integração.</Text></Card>
    <ActionButton label="Voltar para assuntos e processos" secondary onPress={onBack} />
  </Screen>;

  if (loading && !settings) return <Screen title="Integrações" subtitle="Carregando as configurações seguras do escritório." tourScreenId="cases">
    <Card><Text accessibilityLiveRegion="polite" style={styles.text}>Carregando…</Text></Card>
  </Screen>;

  return <Screen title="Integrações" subtitle="Configure as credenciais do aplicativo. Cada conta só poderá ser conectada depois, com consentimento OAuth." tourScreenId="cases">
    <ActionButton label="Voltar para assuntos e processos" secondary onPress={onBack} />
    <ActionButton label="Atualizar status das conexões" secondary onPress={() => { setLoading(true); void load(); }} disabled={saving} />
    {issue ? <Card><Text accessibilityLiveRegion="assertive" style={styles.error}>{issue}</Text><ActionButton label="Tentar carregar novamente" secondary onPress={() => { setLoading(true); setIssue(""); void load(); }} /></Card> : null}
    {settings && !settings.encryptionAvailable ? <Card style={styles.priority}>
      <Heading>Cofre ainda não configurado</Heading>
      <Text style={styles.text}>A administração precisa cadastrar uma chave AES de 32 bytes no segredo <Text style={styles.strong}>INTEGRATION_CREDENTIALS_KEY</Text> do Worker. Sem essa chave, o app não aceita nem grava credenciais.</Text>
      <Text style={styles.small}>Gere uma chave aleatória fora do app e configure-a pelo Cloudflare Wrangler antes de continuar. Não reutilize a senha da conta nem o segredo Better Auth.</Text>
    </Card> : null}
    {settings?.encryptionAvailable ? <>
      <Card style={styles.priority}>
        <Heading>O que esta tela faz</Heading>
        <Text style={styles.text}>Salva IDs e segredos cifrados no servidor. O segredo nunca volta para o navegador ou celular e nunca aparece em logs de auditoria.</Text>
        <Text style={styles.small}>Use apenas valores fictícios até a revisão concluir MFA/step-up, limite de tentativas, backup/rotação da chave e controles de recuperação.</Text>
        <Text style={styles.small}>Conectar dá ao app acesso de leitura aprovado por você. Em Arquivos, escolha um PDF e faça uma cópia para o cofre privado; o original no Drive não é alterado.</Text>
        {!settings.oauthEnabled ? <Text style={styles.small}>Conexão OAuth está desligada neste ambiente. Ela só pode ser ativada após configurar os redirects do app e concluir a revisão de segurança.</Text> : null}
      </Card>
      <Card>
        <Text style={styles.badge}>{settings.googleDrive.connectionStatus === "connected" ? "Conectada · " + settings.googleDrive.connectedAccountLabel : settings.googleDrive.configured ? "Credenciais salvas · conta não conectada" : "Não configurado"}</Text>
        <Heading>Google Drive</Heading>
        <Text style={styles.small}>A API key do Picker é pública e só identifica o projeto/uso do seletor. Restrinja-a por domínio e API; ela não abre arquivos privados. Para isso também é necessário OAuth.</Text>
        <Text style={styles.small}>A API key serve para o seletor oficial do Google. O app pede acesso por arquivo escolhido (drive.file), e importa apenas o PDF selecionado para o cofre. No celular, use o seletor de arquivos do aparelho.</Text>
        <Text style={styles.small}>No Google Cloud, ative Google Drive API e Google Picker API. Crie uma chave de navegador e limite o uso por HTTP referrer ao domínio do app e a docs.google.com; restrinja a chave à Google Picker API. No OAuth Client Web, copie a origem e o redirect abaixo.</Text>
        <Text selectable style={styles.small}>Authorized JavaScript origin: {settings.googlePickerOrigin ?? "Configure WEB_ORIGIN HTTPS no Worker para gerar a origem."}</Text>
        <Text selectable style={styles.small}>Redirect URI: {settings.oauthRedirectUris.googleDrive ?? "Configure AUTH_BASE_URL HTTPS no Worker para gerar o endereço."}</Text>
        <Text style={styles.strong}>Google Picker API key</Text>
        <SecretTextInput testID="integration-google-picker-key" fieldLabel="chave da API do Google Picker" accessibilityLabel="Google Picker API key" placeholder={settings.googleDrive.pickerApiKeyConfigured ? "Já configurada — deixe em branco para manter" : "API key do Picker"} placeholderTextColor={colors.muted} value={googleApiKey} onChangeText={setGoogleApiKey} autoCapitalize="none" autoCorrect={false} style={styles.input} />
        <Text style={styles.strong}>OAuth Client ID</Text>
        <AccessibleTextInput testID="integration-google-client-id" accessibilityLabel="Google OAuth Client ID" placeholder="ID do cliente OAuth Web" placeholderTextColor={colors.muted} value={googleClientId} onChangeText={setGoogleClientId} autoCapitalize="none" autoCorrect={false} style={styles.input} />
        <Text style={styles.strong}>OAuth Client Secret</Text>
        <SecretTextInput testID="integration-google-client-secret" fieldLabel="segredo OAuth do Google" accessibilityLabel="Google OAuth Client Secret" placeholder={settings.googleDrive.clientSecretConfigured ? "Já configurado — deixe em branco para manter" : "Segredo OAuth"} placeholderTextColor={colors.muted} value={googleClientSecret} onChangeText={setGoogleClientSecret} autoCapitalize="none" autoCorrect={false} style={styles.input} />
        {settings.googleDrive.clientSecretConfigured ? <ActionButton label={googleClearSecret ? "O segredo será removido ao salvar" : "Marcar segredo para remoção"} secondary onPress={() => setGoogleClearSecret((value) => !value)} disabled={saving} /> : null}
        <ActionButton label={saving ? "Salvando…" : "Salvar configuração Google"} onPress={() => {
          const input = {
            provider: "google_drive" as const,
            ...(googleApiKey.trim() ? { pickerApiKey: googleApiKey.trim() } : {}),
            ...(googleClientId.trim() ? { clientId: googleClientId.trim() } : {}),
            ...(googleClientSecret ? { clientSecret: googleClientSecret } : {}),
            ...(googleClearSecret ? { clearClientSecret: true } : {}),
          } satisfies IntegrationUpdate;
          if (Object.keys(input).length === 1) { setIssue("Informe pelo menos um campo novo ou marque a remoção de um segredo."); return; }
          void save(input);
        }} disabled={saving || (googleClearSecret && Boolean(googleClientSecret))} />
        {message && messageProvider === "google_drive" ? <Text testID="integration-google-save-status" accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text> : null}
        {settings.googleDrive.connectionStatus === "connected" ? <>
          {settings.googleDrive.refreshState === "pending" ? <Text accessibilityLiveRegion="polite" style={styles.small}>Atualização da conexão em andamento. Aguarde e atualize esta tela.</Text> : null}
          {settings.googleDrive.refreshState === "uncertain" ? <View style={styles.tight}>
            <Text accessibilityLiveRegion="assertive" style={styles.error}>Não foi possível confirmar a renovação. Reconecte a conta para continuar.</Text>
            <ActionButton label="Reconectar Google Drive" secondary disabled={saving || !settings.oauthEnabled} onPress={() => void connect("google_drive")} />
          </View> : null}
          <Text style={styles.small}>Permissões concedidas: {settings.googleDrive.grantedScopes.join(", ") || "não informadas"}.</Text>
          {pendingDisconnect === "google_drive" ? <View style={styles.tight}>
            <Text style={styles.text}>Desconectar remove os tokens cifrados do app. O consentimento também pode precisar ser revogado na Conta Google. Confirma?</Text>
            <ActionButton label="Confirmar desconexão Google" onPress={() => void disconnect("google_drive")} disabled={saving} />
            <ActionButton label="Cancelar desconexão Google" secondary onPress={() => setPendingDisconnect(null)} disabled={saving} />
          </View> : <ActionButton label="Desconectar Google Drive" secondary onPress={() => setPendingDisconnect("google_drive")} disabled={saving} />}
        </> : <ActionButton label={saving ? "Abrindo Google…" : "Conectar Google Drive"} onPress={() => void connect("google_drive")} disabled={saving || !settings.oauthEnabled || !settings.googleDrive.clientSecretConfigured || !settings.googleDrive.clientId} />}
        <ActionButton label="Remover todas as credenciais Google" secondary onPress={() => setPendingClear("google_drive")} disabled={saving || !settings.googleDrive.configured || settings.googleDrive.connectionStatus === "connected"} />
        {pendingClear === "google_drive" ? <View style={styles.tight}>
          <Text style={styles.text}>Isso apagará a API key, o Client ID e o Client Secret salvos. Confirma?</Text>
          <ActionButton label="Confirmar remoção Google" onPress={() => void clear("google_drive")} disabled={saving} />
          <ActionButton label="Cancelar remoção Google" secondary onPress={() => setPendingClear(null)} disabled={saving} />
        </View> : null}
      </Card>
      <Card>
        <Text style={styles.badge}>{settings.microsoftGraph.connectionStatus === "connected" ? "Conectada · " + settings.microsoftGraph.connectedAccountLabel : settings.microsoftGraph.configured ? "Credenciais salvas · conta não conectada" : "Não configurado"}</Text>
        <Heading>Microsoft OneDrive</Heading>
        <Text style={styles.small}>O Microsoft Graph usa registro de aplicativo Entra e OAuth. Não existe uma API key estática para abrir arquivos privados.</Text>
        <Text style={styles.small}>A conexão pede Files.Read (leitura) e User.Read (identificação da conta). Não permite alterar arquivos. Nesta versão, o seletor abre o OneDrive pessoal conectado; bibliotecas de sites SharePoint exigem outra permissão e ficam para uma etapa própria.</Text>
        <Text style={styles.small}>No Microsoft Entra, registre um aplicativo, adicione uma plataforma Web com o endereço abaixo e habilite as permissões delegadas User.Read e Files.Read. Crie um Client Secret e informe o ID, o tenant e o segredo aqui.</Text>
        <Text selectable style={styles.small}>Redirect URI: {settings.oauthRedirectUris.microsoftGraph ?? "Configure AUTH_BASE_URL HTTPS no Worker para gerar o endereço."}</Text>
        <Text style={styles.strong}>Application / Client ID</Text>
        <AccessibleTextInput accessibilityLabel="Microsoft Application Client ID" placeholder="ID do aplicativo Entra" placeholderTextColor={colors.muted} value={microsoftClientId} onChangeText={setMicrosoftClientId} autoCapitalize="none" autoCorrect={false} style={styles.input} />
        <Text style={styles.strong}>Tenant ID</Text>
        <AccessibleTextInput accessibilityLabel="Microsoft Tenant ID" placeholder="ID do tenant ou valor indicado pelo administrador" placeholderTextColor={colors.muted} value={microsoftTenantId} onChangeText={setMicrosoftTenantId} autoCapitalize="none" autoCorrect={false} style={styles.input} />
        <Text style={styles.strong}>Client Secret</Text>
        <SecretTextInput fieldLabel="segredo do aplicativo Microsoft" accessibilityLabel="Microsoft Client Secret" placeholder={settings.microsoftGraph.clientSecretConfigured ? "Já configurado — deixe em branco para manter" : "Segredo do aplicativo"} placeholderTextColor={colors.muted} value={microsoftClientSecret} onChangeText={setMicrosoftClientSecret} autoCapitalize="none" autoCorrect={false} style={styles.input} />
        {settings.microsoftGraph.clientSecretConfigured ? <ActionButton label={microsoftClearSecret ? "O segredo será removido ao salvar" : "Marcar segredo para remoção"} secondary onPress={() => setMicrosoftClearSecret((value) => !value)} disabled={saving} /> : null}
        <ActionButton label={saving ? "Salvando…" : "Salvar configuração Microsoft"} onPress={() => {
          const input = {
            provider: "microsoft_graph" as const,
            ...(microsoftClientId.trim() ? { clientId: microsoftClientId.trim() } : {}),
            ...(microsoftTenantId.trim() ? { tenantId: microsoftTenantId.trim() } : {}),
            ...(microsoftClientSecret ? { clientSecret: microsoftClientSecret } : {}),
            ...(microsoftClearSecret ? { clearClientSecret: true } : {}),
          } satisfies IntegrationUpdate;
          if (Object.keys(input).length === 1) { setIssue("Informe pelo menos um campo novo ou marque a remoção de um segredo."); return; }
          void save(input);
        }} disabled={saving || (microsoftClearSecret && Boolean(microsoftClientSecret))} />
        {message && messageProvider === "microsoft_graph" ? <Text testID="integration-microsoft-save-status" accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text> : null}
        {settings.microsoftGraph.connectionStatus === "connected" ? <>
          {settings.microsoftGraph.refreshState === "pending" ? <Text accessibilityLiveRegion="polite" style={styles.small}>Atualização da conexão em andamento. Aguarde e atualize esta tela.</Text> : null}
          {settings.microsoftGraph.refreshState === "uncertain" ? <View style={styles.tight}>
            <Text accessibilityLiveRegion="assertive" style={styles.error}>Não foi possível confirmar a renovação. Reconecte a conta para continuar.</Text>
            <ActionButton label="Reconectar Microsoft OneDrive" secondary disabled={saving || !settings.oauthEnabled} onPress={() => void connect("microsoft_graph")} />
          </View> : null}
          <Text style={styles.small}>Permissões concedidas: {settings.microsoftGraph.grantedScopes.join(", ") || "não informadas"}.</Text>
          {pendingDisconnect === "microsoft_graph" ? <View style={styles.tight}>
            <Text style={styles.text}>Desconectar remove os tokens deste app. O consentimento precisa ser revogado nas configurações da conta ou com o administrador do Microsoft 365. Confirma?</Text>
            <ActionButton label="Confirmar desconexão Microsoft" onPress={() => void disconnect("microsoft_graph")} disabled={saving} />
            <ActionButton label="Cancelar desconexão Microsoft" secondary onPress={() => setPendingDisconnect(null)} disabled={saving} />
          </View> : <ActionButton label="Desconectar Microsoft" secondary onPress={() => setPendingDisconnect("microsoft_graph")} disabled={saving} />}
        </> : <ActionButton label={saving ? "Abrindo Microsoft…" : "Conectar Microsoft OneDrive"} onPress={() => void connect("microsoft_graph")} disabled={saving || !settings.oauthEnabled || !settings.microsoftGraph.clientSecretConfigured || !settings.microsoftGraph.clientId} />}
        <ActionButton label="Remover todas as credenciais Microsoft" secondary onPress={() => setPendingClear("microsoft_graph")} disabled={saving || !settings.microsoftGraph.configured || settings.microsoftGraph.connectionStatus === "connected"} />
        {pendingClear === "microsoft_graph" ? <View style={styles.tight}>
          <Text style={styles.text}>Isso apagará o Client ID, o Tenant ID e o Client Secret salvos. Confirma?</Text>
          <ActionButton label="Confirmar remoção Microsoft" onPress={() => void clear("microsoft_graph")} disabled={saving} />
          <ActionButton label="Cancelar remoção Microsoft" secondary onPress={() => setPendingClear(null)} disabled={saving} />
        </View> : null}
      </Card>
    </> : null}
  </Screen>;
}
