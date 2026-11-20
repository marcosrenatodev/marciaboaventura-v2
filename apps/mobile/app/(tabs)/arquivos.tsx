import { AccessibleTextInput } from "@/components/AccessibleTextInput";
import { TourAnchor } from "@/TourAnchors";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { openGooglePdfPicker } from "@/google-picker";
import { ActionButton, Card, Heading, Screen } from "@/components/Ui";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { colors, styles } from "@/theme";
import { DocumentConsentText } from "@marcia/contracts";

const maxDocumentBytes = 10 * 1024 * 1024;
type DriveFolder = { id: string; name: string };
type SelectedDriveFile = { provider: "google_drive" | "microsoft_graph"; id: string; name: string };
const formatBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;

export default function DocumentsScreen() {
  const { demoMode, session } = useAuth();
  const api = useWorkData();
  const loadDocuments = api.loadDocuments;
  const loadIntegrationSettings = api.loadIntegrationSettings;
  const sessionTenantId = api.sessionInfo?.tenant.id ?? null;
  const signerProfileName = typeof api.sessionInfo?.user.name === "string" ? api.sessionInfo.user.name : "";
  const loadedTenantId = useRef<string | null>(null);
  const [documents, setDocuments] = useState<Awaited<ReturnType<typeof api.loadDocuments>>["items"]>([]);
  const [documentFormOpen, setDocumentFormOpen] = useState(false);
  const [formNavigationVersion, setFormNavigationVersion] = useState(0);
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [selectedDriveFile, setSelectedDriveFile] = useState<SelectedDriveFile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [caseQuery, setCaseQuery] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null);
  const [openSigningDocumentId, setOpenSigningDocumentId] = useState<string | null>(null);
  const [signingRecords, setSigningRecords] = useState<Record<string, Awaited<ReturnType<typeof api.loadDocumentSigningRecords>>["items"]>>({});
  const [signingConfirmName, setSigningConfirmName] = useState("");
  const [signingConsentAccepted, setSigningConsentAccepted] = useState(false);
  const [signingDocumentId, setSigningDocumentId] = useState<string | null>(null);
  const [issue, setIssue] = useState("");
  const [message, setMessage] = useState("");
  const [integrationState, setIntegrationState] = useState<{ tenantId: string; value: Awaited<ReturnType<typeof api.loadIntegrationSettings>> } | null>(null);
  const integrationSettings = integrationState?.tenantId === sessionTenantId ? integrationState.value : null;
  const [integrationIssueTenantId, setIntegrationIssueTenantId] = useState<string | null>(null);
  const integrationsLoaded = Boolean(sessionTenantId && (
    integrationState?.tenantId === sessionTenantId || integrationIssueTenantId === sessionTenantId
  ));
  const integrationLoadFailed = Boolean(sessionTenantId && integrationIssueTenantId === sessionTenantId);
  const [driveFiles, setDriveFiles] = useState<Awaited<ReturnType<typeof api.loadMicrosoftDriveFiles>>["items"]>([]);
  const [driveFolderStack, setDriveFolderStack] = useState<DriveFolder[]>([]);
  const [drivePageToken, setDrivePageToken] = useState<string | null>(null);
  const [driveFilter, setDriveFilter] = useState("");
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveImportingId, setDriveImportingId] = useState<string | null>(null);
  const [driveOpened, setDriveOpened] = useState(false);
  const [driveTenantId, setDriveTenantId] = useState<string | null>(null);

  const resetDocumentDraft = () => {
    setDocumentFormOpen(false);
    setSelectedFile(null); setSelectedDriveFile(null); setDisplayName("");
    setCaseQuery(""); setSelectedCaseId(null);
    setDriveFiles([]); setDriveFolderStack([]); setDrivePageToken(null); setDriveFilter("");
    setDriveOpened(false); setDriveTenantId(sessionTenantId);
  };

  const load = useCallback(async () => {
    if (demoMode || !session || !sessionTenantId) {
      loadedTenantId.current = null;
      setDocuments([]); setSelectedFile(null); setDisplayName(""); setSelectedCaseId(null);
      setSelectedDriveFile(null); setDocumentFormOpen(false); setCaseQuery("");
      setSigningRecords({}); setOpenSigningDocumentId(null); setSigningConfirmName(""); setSigningConsentAccepted(false);
      setDriveFiles([]); setDriveFolderStack([]); setDrivePageToken(null); setDriveFilter(""); setDriveOpened(false); setDriveTenantId(null);
      return;
    }
    if (loadedTenantId.current !== sessionTenantId) {
      loadedTenantId.current = sessionTenantId;
      setDocuments([]); setSelectedFile(null); setDisplayName(""); setSelectedCaseId(null);
      setSelectedDriveFile(null); setDocumentFormOpen(false); setCaseQuery("");
      setSigningRecords({}); setOpenSigningDocumentId(null); setSigningConfirmName(""); setSigningConsentAccepted(false);
      setDriveFiles([]); setDriveFolderStack([]); setDrivePageToken(null); setDriveFilter(""); setDriveOpened(false); setDriveTenantId(null);
    }
    setLoading(true);
    setIssue("");
    try { setDocuments((await loadDocuments(includeArchived)).items); }
    catch (error) { setIssue(error instanceof Error ? error.message : "Não foi possível carregar os documentos."); }
    finally { setLoading(false); }
  }, [loadDocuments, demoMode, includeArchived, session, sessionTenantId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  useEffect(() => {
    let active = true;
    if (demoMode || !session || !sessionTenantId) return;
    loadIntegrationSettings().then((value) => {
      if (active) {
        setIntegrationState({ tenantId: sessionTenantId, value });
        setIntegrationIssueTenantId(null);
      }
    }).catch(() => {
      if (active) {
        setIntegrationState(null);
        setIntegrationIssueTenantId(sessionTenantId);
      }
    });
    return () => { active = false; };
  }, [loadIntegrationSettings, demoMode, session, sessionTenantId]);

  const retryIntegrationSettings = async () => {
    if (!session || !sessionTenantId) return;
    setIntegrationIssueTenantId(null);
    try {
      const value = await loadIntegrationSettings();
      setIntegrationState({ tenantId: sessionTenantId, value });
    } catch {
      setIntegrationState(null);
      setIntegrationIssueTenantId(sessionTenantId);
    }
  };

  const matchingCases = useMemo(() => {
    const query = caseQuery.trim().toLocaleLowerCase("pt-BR");
    return api.courtCases.filter((courtCase) => courtCase.status === "active" &&
      `${courtCase.label ?? ""} ${courtCase.courtName} ${courtCase.caseNumber ?? ""}`.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 8);
  }, [api.courtCases, caseQuery]);

  const selectPdf = async () => {
    setIssue(""); setMessage("");
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) { setIssue("O seletor não retornou um arquivo."); return; }
      if (!asset.name.toLowerCase().endsWith(".pdf") || (asset.mimeType && asset.mimeType !== "application/pdf" && asset.mimeType !== "application/octet-stream")) {
        setIssue("Escolha um arquivo PDF."); return;
      }
      if (asset.size !== undefined && asset.size > maxDocumentBytes) {
        setIssue("O PDF precisa ter até 10 MB."); return;
      }
      setSelectedFile(asset);
      setSelectedDriveFile(null);
      setSelectedCaseId(null); setCaseQuery("");
      setDisplayName(asset.name.replace(/\.pdf$/i, ""));
    } catch {
      setIssue("Não foi possível abrir os arquivos. Tente novamente.");
    }
  };

  const loadDriveFolder = async (folderId: string | null, pageToken: string | null = null, append = false) => {
    if (driveTenantId !== sessionTenantId) setDriveFolderStack([]);
    setDriveLoading(true); setIssue("");
    try {
      const result = await api.loadMicrosoftDriveFiles(folderId, pageToken);
      setDriveFiles((current) => append ? [...current, ...result.items] : result.items);
      setDrivePageToken(result.nextPageToken);
      setDriveOpened(true);
      if (sessionTenantId) setDriveTenantId(sessionTenantId);
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível abrir o OneDrive.");
    } finally { setDriveLoading(false); }
  };

  const importCloudFile = async () => {
    if (!selectedDriveFile || driveImportingId) return;
    const { provider, id, name } = selectedDriveFile;
    setDriveImportingId(id); setIssue(""); setMessage("");
    try {
      const item = await api.importCloudDriveFile(provider, id, selectedCaseId);
      setDocuments((current) => [item, ...current.filter((document) => document.id !== item.id)].slice(0, 100));
      setMessage(`“${name}” foi copiado para o cofre privado do escritório.`);
      resetDocumentDraft();
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível importar este PDF.");
    } finally { setDriveImportingId(null); }
  };

  const selectFromGoogleDrive = async () => {
    if (driveImportingId) return;
    setIssue(""); setMessage("");
    try {
      const pickerSession = await api.loadGooglePickerSession();
      await openGooglePdfPicker(pickerSession, (file) => {
        setSelectedDriveFile({ provider: "google_drive", id: file.id, name: file.name || "PDF do Google Drive" });
        setSelectedCaseId(null); setCaseQuery("");
      });
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível abrir o Google Drive.");
    }
  };

  const visibleDriveFiles = useMemo(() => {
    const query = driveFilter.trim().toLocaleLowerCase("pt-BR");
    return driveTenantId === sessionTenantId
      ? driveFiles.filter((item) => !query || item.name.toLocaleLowerCase("pt-BR").includes(query))
      : [];
  }, [driveFiles, driveFilter, driveTenantId, sessionTenantId]);
  const driveActive = driveOpened && driveTenantId === sessionTenantId;
  const hasDocumentDraft = Boolean(selectedFile || selectedDriveFile || displayName.trim() || selectedCaseId || caseQuery.trim() || driveActive);
  const openDocumentForm = () => {
    setDocumentFormOpen(true);
    setIssue(""); setMessage("");
    setFormNavigationVersion((version) => version + 1);
  };
  const closeDocumentForm = () => setDocumentFormOpen(false);

  const upload = async () => {
    if (!selectedFile || saving) return;
    setSaving(true); setIssue(""); setMessage("");
    try {
      const item = await api.uploadDocument(selectedFile, displayName, selectedCaseId);
      setDocuments((current) => [item, ...current.filter((document) => document.id !== item.id)].slice(0, 100));
      setMessage("PDF enviado e protegido no cofre do escritório.");
      resetDocumentDraft();
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível guardar este documento.");
    } finally { setSaving(false); }
  };

  const shareDocument = async (documentId: string, fileName: string) => {
    if (activeDocumentId) return;
    setActiveDocumentId(documentId); setIssue(""); setMessage("");
    let temporaryFile: File | null = null;
    try {
      const bytes = await api.downloadDocument(documentId);
      if (Platform.OS === "web") {
        const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const link = document.createElement("a");
        link.href = objectUrl; link.download = fileName; link.rel = "noopener";
        document.body.append(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        setMessage("Download do PDF iniciado.");
      } else {
        temporaryFile = new File(Paths.cache, `marcia-${documentId}.pdf`);
        temporaryFile.create({ intermediates: true, overwrite: true });
        await temporaryFile.write(bytes);
        if (!(await Sharing.isAvailableAsync())) throw new Error("O compartilhamento de arquivos não está disponível neste dispositivo.");
        await Sharing.shareAsync(temporaryFile.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Compartilhar documento" });
        setMessage("Compartilhamento concluído. O arquivo temporário será removido do cache do app.");
      }
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível baixar ou compartilhar o PDF.");
    } finally {
      if (temporaryFile?.exists) temporaryFile.delete();
      setActiveDocumentId(null);
    }
  };

  const changeStatus = async (documentId: string, status: "ready" | "archived", expectedUpdatedAt: string) => {
    setActiveDocumentId(documentId); setIssue(""); setMessage("");
    try {
      await api.setDocumentStatus(documentId, status, expectedUpdatedAt);
      setPendingArchiveId(null);
      await load();
      setMessage(status === "archived" ? "Documento arquivado. O histórico permanece acessível." : "Documento restaurado para a lista ativa.");
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível atualizar este documento.");
    } finally { setActiveDocumentId(null); }
  };

  const openSigningRecords = async (documentId: string) => {
    if (openSigningDocumentId === documentId) {
      setOpenSigningDocumentId(null);
      setSigningConsentAccepted(false);
      return;
    }
    setIssue(""); setMessage("");
    try {
      const records = await api.loadDocumentSigningRecords(documentId);
      setSigningRecords((current) => ({ ...current, [documentId]: records.items }));
      setSigningConfirmName("");
      setSigningConsentAccepted(false);
      setOpenSigningDocumentId(documentId);
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível carregar o registro deste documento.");
    }
  };

  const signDocumentElectronically = async (documentId: string) => {
    if (!signingConsentAccepted || signingDocumentId) return;
    setSigningDocumentId(documentId); setIssue(""); setMessage("");
    try {
      const item = await api.createDocumentSigningRecord(documentId, signingConfirmName);
      setSigningRecords((current) => ({ ...current, [documentId]: [item, ...(current[documentId] ?? [])] }));
      setSigningConsentAccepted(false);
      setMessage("Assinatura eletrônica registrada. O comprovante está vinculado ao hash do PDF.");
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível registrar a assinatura eletrônica.");
    } finally { setSigningDocumentId(null); }
  };

  const exportSigningReceipt = async (record: Awaited<ReturnType<typeof api.loadDocumentSigningRecords>>["items"][number], documentName: string) => {
    setIssue(""); setMessage("");
    let temporaryFile: File | null = null;
    try {
      const receiptFileName = `comprovante-assinatura-${record.id}.json`;
      const contents = JSON.stringify({
        type: "marcia.electronic-signature.receipt",
        exportVersion: 1,
        documentName,
        receipt: record,
        verification: {
          algorithm: "SHA-256",
          input: "UTF-8 do valor exato de receipt.canonicalPayload",
          expectedDigest: "receipt.receiptSha256",
          limitation: "A assinatura eletrônica simples do aplicativo não é ICP-Brasil/PAdES, assinatura criptográfica do signatário ou carimbo de tempo confiável. O destinatário pode exigir outro método.",
        },
      }, null, 2);
      if (Platform.OS === "web") {
        const objectUrl = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = objectUrl; link.download = receiptFileName; link.rel = "noopener";
        document.body.append(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else {
        temporaryFile = new File(Paths.cache, receiptFileName);
        temporaryFile.create({ intermediates: true, overwrite: true });
        await temporaryFile.write(contents);
        if (!(await Sharing.isAvailableAsync())) throw new Error("O compartilhamento não está disponível neste dispositivo.");
        await Sharing.shareAsync(temporaryFile.uri, { mimeType: "application/json", UTI: "public.json", dialogTitle: "Compartilhar recibo" });
      }
      setMessage("Recibo exportado. Ele inclui dados da conta; compartilhe somente com quem deve receber.");
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "Não foi possível exportar o recibo.");
    } finally {
      if (temporaryFile?.exists) temporaryFile.delete();
    }
  };

  const documentSourceForm = documentFormOpen ? <View testID="documents-source-form">
    <Card>
      <Heading>Adicionar documento</Heading>
      <Text style={styles.small}>Escolha um PDF do aparelho, Google Drive ou OneDrive. O app guarda uma cópia privada; o arquivo original continua na origem. Limite: 10 MB.</Text>
      <TourAnchor id="files.choose-pdf">
        <ActionButton label={selectedFile ? "Escolher outro PDF" : "Escolher PDF do dispositivo"} secondary
          onPress={() => void selectPdf()} disabled={saving || Boolean(driveImportingId) || Boolean(selectedDriveFile)} />
      </TourAnchor>
      {selectedDriveFile ? <Text style={styles.small}>Cancele a seleção do Drive antes de escolher outra origem.</Text> : null}
      {selectedFile ? <View style={styles.tight}>
        <Text style={styles.strong}>{selectedFile.name} · {selectedFile.size ? formatBytes(selectedFile.size) : "tamanho conferido no envio"}</Text>
        <AccessibleTextInput accessibilityLabel="Nome do documento" placeholder="Nome fácil de reconhecer" placeholderTextColor={colors.muted}
          value={displayName} onChangeText={setDisplayName} maxLength={175} style={styles.input} />
      </View> : null}
    </Card>

    <Card>
      <Heading>Google Drive</Heading>
      <Text style={styles.small}>O Google Drive original não será alterado.</Text>
      {integrationLoadFailed ? null : !integrationsLoaded ? <Text style={styles.small}>Verificando a conexão com o Google Drive…</Text>
        : integrationSettings?.googleDrive.connectionStatus === "connected" ? Platform.OS === "web"
          ? <ActionButton label="Escolher PDF no Google Drive" onPress={() => void selectFromGoogleDrive()} disabled={Boolean(selectedFile) || Boolean(selectedDriveFile) || Boolean(driveImportingId)} />
          : <Text style={styles.small}>No celular, use “Escolher PDF do dispositivo”: se o Google Drive estiver disponível no seletor de arquivos do aparelho, você pode escolher o PDF por lá.</Text>
        : <Text style={styles.small}>Google Drive ainda não conectado. Configure em Conta → Integrações.</Text>}
    </Card>

    <Card>
      <Heading>Microsoft OneDrive</Heading>
      <Text style={styles.small}>Apenas leitura: a importação cria uma cópia privada do PDF.</Text>
      {integrationLoadFailed ? null : !integrationsLoaded ? <Text style={styles.small}>Verificando a conexão com o OneDrive…</Text>
        : integrationSettings?.microsoftGraph.connectionStatus === "connected" ? <>
          <ActionButton label={driveLoading ? "Abrindo OneDrive…" : driveActive ? "Atualizar arquivos do OneDrive" : "Abrir arquivos do OneDrive"}
            secondary onPress={() => void loadDriveFolder(driveActive ? driveFolderStack.at(-1)?.id ?? null : null)}
            disabled={driveLoading || Boolean(driveImportingId) || Boolean(selectedFile)} />
          {selectedFile ? <Text style={styles.small}>Cancele a seleção do arquivo atual antes de abrir outra origem.</Text> : null}
          {driveActive ? <View style={styles.tight}>
            {driveFolderStack.length > 0 ? <ActionButton label={`Voltar para ${driveFolderStack.length > 1 ? driveFolderStack.at(-2)!.name : "Meus arquivos"}`} secondary onPress={() => {
              const parent = driveFolderStack.slice(0, -1);
              setDriveFolderStack(parent);
              void loadDriveFolder(parent.at(-1)?.id ?? null);
            }} disabled={driveLoading} /> : null}
            <AccessibleTextInput accessibilityLabel="Filtrar PDFs e pastas nesta tela do OneDrive" placeholder="Filtrar esta pasta" placeholderTextColor={colors.muted}
              value={driveFilter} onChangeText={setDriveFilter} maxLength={100} style={styles.input} />
            {visibleDriveFiles.map((item) => item.folder
              ? <ActionButton key={item.id} label={`Abrir pasta: ${item.name}`} secondary onPress={() => {
                setDriveFolderStack((current) => [...current, { id: item.id, name: item.name }]);
                setDriveFilter("");
                void loadDriveFolder(item.id);
              }} disabled={driveLoading || Boolean(driveImportingId)} />
              : <View key={item.id} style={styles.tight}>
                <Text style={styles.strong}>{item.name}{item.size !== null ? ` · ${formatBytes(item.size)}` : ""}</Text>
                <ActionButton label={selectedDriveFile?.id === item.id ? `Selecionado: ${item.name}` : `Selecionar PDF: ${item.name}`} secondary
                  onPress={() => {
                    setSelectedDriveFile({ provider: "microsoft_graph", id: item.id, name: item.name });
                    setSelectedCaseId(null); setCaseQuery("");
                  }}
                  disabled={driveLoading || Boolean(driveImportingId) || Boolean(selectedFile)} />
              </View>)}
            {visibleDriveFiles.length === 0 ? <Text style={styles.small}>Nenhum PDF ou pasta nesta lista corresponde ao filtro.</Text> : null}
            {drivePageToken ? <ActionButton label={driveLoading ? "Carregando…" : "Carregar mais arquivos"} secondary
              onPress={() => void loadDriveFolder(driveFolderStack.at(-1)?.id ?? null, drivePageToken, true)} disabled={driveLoading} /> : null}
          </View> : null}
        </> : <Text style={styles.small}>Microsoft OneDrive ainda não conectado. Configure em Conta → Integrações.</Text>}
    </Card>

    {integrationLoadFailed ? <Card testID="documents-integration-issue">
      <Text accessibilityLiveRegion="assertive" style={styles.small}>Não foi possível verificar o estado das conexões. Tente novamente antes de usar Google Drive ou OneDrive.</Text>
      <ActionButton label="Tentar verificar conexões" secondary onPress={() => void retryIntegrationSettings()} />
    </Card> : null}

    {selectedDriveFile ? <Card testID="selected-cloud-document">
      <Heading>PDF selecionado</Heading>
      <Text style={styles.eyebrow}>{selectedDriveFile.provider === "google_drive" ? "GOOGLE DRIVE" : "MICROSOFT ONEDRIVE"}</Text>
      <Text style={styles.strong}>{selectedDriveFile.name}</Text>
      <Text style={styles.small}>Confira o arquivo e o processo relacionado antes de copiar para o cofre privado.</Text>
    </Card> : null}

    {selectedFile || selectedDriveFile ? <Card>
      <Heading>Vincular a um processo (opcional)</Heading>
      <AccessibleTextInput accessibilityLabel="Buscar processo para vincular ao documento" placeholder="Buscar processo" placeholderTextColor={colors.muted}
        value={caseQuery} onChangeText={setCaseQuery} maxLength={100} style={styles.input} />
      {selectedCaseId ? <ActionButton label="Remover vínculo com o processo selecionado" secondary onPress={() => setSelectedCaseId(null)} /> : null}
      {matchingCases.map((courtCase) => <ActionButton key={courtCase.id}
        label={`${selectedCaseId === courtCase.id ? "Selecionado: " : "Vincular: "}${courtCase.label || courtCase.courtName}${courtCase.caseNumber ? ` · ${courtCase.caseNumber}` : ""}`}
        secondary onPress={() => setSelectedCaseId(courtCase.id)} />)}
      {matchingCases.length === 0 ? <Text style={styles.small}>Nenhum processo ativo corresponde à busca. O documento pode ficar sem vínculo.</Text> : null}
      {selectedFile ? <View style={styles.tight}>
        <ActionButton label={saving ? "Enviando PDF…" : "Guardar documento"} onPress={() => void upload()} disabled={saving} />
        <ActionButton label="Cancelar seleção do PDF" secondary onPress={() => { setSelectedFile(null); setDisplayName(""); setSelectedCaseId(null); setCaseQuery(""); }} disabled={saving} />
      </View> : null}
      {selectedDriveFile ? <View style={styles.tight}>
        <ActionButton label={driveImportingId ? "Importando PDF…" : "Importar PDF para o cofre"} onPress={() => void importCloudFile()} disabled={Boolean(driveImportingId)} />
        <ActionButton label="Cancelar seleção do arquivo do Drive" secondary onPress={() => { setSelectedDriveFile(null); setSelectedCaseId(null); setCaseQuery(""); }} disabled={Boolean(driveImportingId)} />
      </View> : null}
    </Card> : null}
  </View> : null;

  if (demoMode) return <Screen title="Documentos" subtitle="Arquivos do escritório, organizados com segurança." tourScreenId="files">
    <Card><Heading>Entre para guardar documentos</Heading><Text style={styles.text}>A demonstração não envia, armazena nem compartilha arquivos. Entre na conta do escritório para usar o cofre privado.</Text></Card>
  </Screen>;

  return <Screen title="Documentos" subtitle="Guarde PDFs do escritório e encontre-os pelo processo." tourScreenId="files"
    scrollToTop={formNavigationVersion}
    headerAction={<TourAnchor id="files.add-document"><ActionButton
      label={documentFormOpen ? "Fechar formulário de documento" : hasDocumentDraft ? "Continuar adição de documento" : "Adicionar documento"}
      accessibilityHint={documentFormOpen ? "Fecha as opções e mantém o rascunho para continuar depois." : "Abre as opções para escolher um PDF do aparelho ou de uma conta conectada."}
      secondary={documentFormOpen} disabled={saving || Boolean(driveImportingId)}
      onPress={() => documentFormOpen ? closeDocumentForm() : openDocumentForm()} /></TourAnchor>}>
    {issue ? <Card testID="documents-issue"><Heading>Não foi possível concluir</Heading><Text accessibilityLiveRegion="assertive" style={styles.error}>{issue}</Text><ActionButton label="Tentar novamente" secondary onPress={() => void load()} /></Card> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text> : null}
    {documentSourceForm}
    <Card>
      <Heading>Arquivos do escritório</Heading>
      <Text style={styles.small}>Documentos privados do escritório. Arquivar tira um item da lista ativa sem apagar o arquivo.</Text>
      <ActionButton label={includeArchived ? "Ocultar documentos arquivados" : "Mostrar documentos arquivados"} secondary onPress={() => setIncludeArchived((value) => !value)} />
      <ActionButton label="Atualizar lista de documentos" secondary onPress={() => void load()} disabled={loading} />
      {loading ? <Text accessibilityLiveRegion="polite" style={styles.small}>Carregando documentos do escritório…</Text> : null}
      {!loading && !issue && documents.length === 0 ? <View style={styles.tight}>
        <Heading>Nenhum documento nesta lista</Heading>
        <Text style={styles.text}>{includeArchived ? "Ainda não há documentos disponíveis." : "Seus PDFs aparecerão aqui. Use Adicionar documento para guardar um arquivo do aparelho ou de uma conta conectada."}</Text>
      </View> : null}
    </Card>
    {documents.map((item) => {
      const linkedCase = api.courtCases.find((courtCase) => courtCase.id === item.caseId);
      const currentUserId = typeof api.sessionInfo?.user.id === "string" ? api.sessionInfo.user.id : null;
      const ownSigningRecord = currentUserId !== null && (signingRecords[item.id] ?? []).some((record) => record.signerUserId === currentUserId);
      return <Card key={item.id}>
        <Text style={styles.badge}>{item.status === "archived" ? "Arquivado" : "Disponível"} · {formatBytes(item.byteSize)}</Text>
        <Heading>{item.fileName}</Heading>
        <Text style={styles.small}>Adicionado em {new Date(item.createdAt).toLocaleDateString("pt-BR")}{linkedCase ? ` · ${linkedCase.label || linkedCase.courtName}` : " · Sem processo vinculado"}</Text>
        <ActionButton label={activeDocumentId === item.id ? "Preparando documento…" : `Baixar / compartilhar: ${item.fileName}`} accessibilityLabel={`Baixar / compartilhar documento: ${item.fileName}`} onPress={() => void shareDocument(item.id, item.fileName)} disabled={Boolean(activeDocumentId)} />
        <ActionButton label={openSigningDocumentId === item.id ? "Fechar assinaturas" : item.status === "ready" ? "Assinar eletronicamente" : "Ver assinaturas"}
          accessibilityLabel={`${openSigningDocumentId === item.id ? "Fechar assinaturas" : item.status === "ready" ? "Assinar eletronicamente" : "Ver assinaturas"}: ${item.fileName}`}
          secondary onPress={() => void openSigningRecords(item.id)} disabled={Boolean(signingDocumentId)} />
        {openSigningDocumentId === item.id ? <View style={styles.tight}>
          <Heading>Assinatura eletrônica simples</Heading>
          <Text style={styles.small}>A assinatura usa sua conta autenticada, nome confirmado, consentimento e hash desta versão do PDF. O original fica intacto. Não é assinatura ICP-Brasil/PAdES nem substitui uma exigência do tribunal; confirme se o destinatário aceita este método.</Text>
          {(signingRecords[item.id] ?? []).map((record) => <View key={record.id} style={styles.tight}>
            <Text style={styles.strong}>Assinatura de {record.signerName} ({record.signerEmail}) · {new Date(record.consentedAt).toLocaleString("pt-BR")}</Text>
            <Text style={styles.small}>Nome confirmado: {record.confirmedName}</Text>
            <Text style={styles.small}>Consentimento ({record.consentVersion}): {record.consentText}</Text>
            <Text style={styles.small}>Arquivo (SHA-256): {record.documentSha256}</Text>
            <Text selectable style={styles.small}>Comprovante (SHA-256): {record.receiptSha256}</Text>
            <ActionButton label="Baixar / compartilhar comprovante" accessibilityLabel={`Baixar / compartilhar comprovante: ${item.fileName}`} secondary onPress={() => void exportSigningReceipt(record, item.fileName)} />
          </View>)}
          {(signingRecords[item.id] ?? []).length === 0 ? <Text style={styles.small}>Nenhuma assinatura foi registrada para este arquivo.</Text> : null}
          {item.status === "ready" && !ownSigningRecord ? <View style={styles.tight}>
            <Text style={styles.small}>{DocumentConsentText}</Text>
            <Text style={styles.small}>Para confirmar, digite o nome do perfil autenticado: {signerProfileName || "nome não disponível"}.</Text>
            <AccessibleTextInput accessibilityLabel="Digite seu nome como aparece na conta do escritório" placeholder="Seu nome completo" placeholderTextColor={colors.muted}
              value={signingConfirmName} onChangeText={setSigningConfirmName} maxLength={120} style={styles.input} />
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: signingConsentAccepted }} onPress={() => setSigningConsentAccepted((checked) => !checked)}
              style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={styles.strong}>{signingConsentAccepted ? "☑" : "☐"}</Text>
              <Text style={styles.small}>Li a declaração e quero assinar esta versão do PDF eletronicamente.</Text>
            </Pressable>
            <ActionButton label={signingDocumentId === item.id ? "Assinando…" : "Confirmar assinatura"}
              onPress={() => void signDocumentElectronically(item.id)} disabled={!signingConsentAccepted || !signingConfirmName.trim() || Boolean(signingDocumentId)} />
          </View> : item.status === "ready"
            ? <Text style={styles.small}>Sua assinatura para esta versão do PDF já está registrada.</Text>
            : <Text style={styles.small}>O documento está arquivado. As assinaturas existentes continuam disponíveis, mas não é possível criar outra.</Text>}
        </View> : null}
        {item.status === "ready" ? <>
          <ActionButton label={`Arquivar documento: ${item.fileName}`} secondary onPress={() => setPendingArchiveId(item.id)} disabled={Boolean(activeDocumentId)} />
          {pendingArchiveId === item.id ? <View style={styles.tight}>
            <Text style={styles.small}>O arquivo continuará guardado e poderá ser restaurado. Confirma o arquivamento?</Text>
            <ActionButton label="Confirmar arquivamento" onPress={() => void changeStatus(item.id, "archived", item.updatedAt)} disabled={activeDocumentId === item.id} />
            <ActionButton label="Cancelar arquivamento" secondary onPress={() => setPendingArchiveId(null)} />
          </View> : null}
        </> : <ActionButton label={`Restaurar documento: ${item.fileName}`} secondary onPress={() => void changeStatus(item.id, "ready", item.updatedAt)} disabled={Boolean(activeDocumentId)} />}
      </Card>;
    })}
  </Screen>;
}
