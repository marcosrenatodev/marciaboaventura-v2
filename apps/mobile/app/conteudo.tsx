import { AccessibleTextInput } from "@/components/AccessibleTextInput";
import { useState } from "react";
import { Linking, Platform, Pressable, Share, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SocialContentDraftCreateSchema } from "@marcia/contracts";
import { ActionButton, Card, Heading, Screen } from "@/components/Ui";
import { useAuth } from "@/auth";
import { useWorkData, type SocialContentDraftItem } from "@/work-api";
import { colors, styles } from "@/theme";

const platforms = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
] as const;

const oabRuleUrl = "https://www.oab.org.br/leisnormas/legislacao/provimentos/205-2021";

export default function ContentScreen() {
  const router = useRouter();
  const { demoMode } = useAuth();
  const api = useWorkData();
  const [platform, setPlatform] = useState<SocialContentDraftItem["platform"]>("instagram");
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [selectedDraftVersion, setSelectedDraftVersion] = useState<string | null>(null);
  const [demoDrafts, setDemoDrafts] = useState<SocialContentDraftItem[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: "new" | "template" } | { type: "open"; draft: SocialContentDraftItem } | null>(null);

  const drafts = demoMode ? demoDrafts : api.socialContentDrafts;
  const selectedDraft = drafts.find((item) => item.id === selectedDraftId) ?? null;
  const dirty = selectedDraft
    ? topic !== selectedDraft.topic || content !== selectedDraft.content || platform !== selectedDraft.platform
    : Boolean(topic.trim() || content.trim());
  const template = "Explique a regra em linguagem simples, informe a fonte pública e diga quais pontos podem depender do caso concreto. Revise a informação e a atualização da fonte antes de publicar.";

  function performAction(action: { type: "new" | "template" } | { type: "open"; draft: SocialContentDraftItem }) {
    setPendingAction(null);
    if (action.type === "new") startNewDraft();
    else if (action.type === "open") loadDraft(action.draft);
    else setContent(template);
  }

  function requestAction(action: { type: "new" | "template" } | { type: "open"; draft: SocialContentDraftItem }) {
    if (saving) return;
    if (action.type === "open" && action.draft.id === selectedDraftId) return;
    if (action.type === "template" ? Boolean(content.trim()) : dirty) setPendingAction(action);
    else performAction(action);
  }

  function startNewDraft() {
    setSelectedDraftId(null);
    setSelectedDraftVersion(null);
    setPlatform("instagram");
    setTopic("");
    setContent("");
    setMessage("Novo rascunho. Salve para encontrá-lo novamente neste escritório.");
  }

  function loadDraft(draft: SocialContentDraftItem) {
    setSelectedDraftId(draft.id);
    setSelectedDraftVersion(draft.updatedAt);
    setPlatform(draft.platform);
    setTopic(draft.topic);
    setContent(draft.content);
    setMessage(`Rascunho carregado para edição · ${platforms.find((item) => item.id === draft.platform)?.label}.`);
  }

  async function saveDraft() {
    const result = SocialContentDraftCreateSchema.safeParse({ platform, topic, content });
    if (!result.success) {
      setMessage(topic.trim().length < 2 ? "Escreva um tema com pelo menos duas letras." : "Escreva um texto com pelo menos 12 caracteres para salvar.");
      return;
    }
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      if (demoMode) {
        const now = new Date().toISOString();
        if (selectedDraft) {
          const updated = { ...selectedDraft, ...result.data, updatedAt: now };
          setDemoDrafts((current) => current.map((item) => item.id === updated.id ? updated : item));
          setSelectedDraftVersion(now);
          setMessage("Rascunho atualizado nesta demonstração. Ele não foi enviado ao escritório.");
        } else {
          const created: SocialContentDraftItem = { id: `demo-${Date.now()}`, ...result.data, createdAt: now, updatedAt: now };
          setDemoDrafts((current) => [created, ...current]);
          setSelectedDraftId(created.id);
          setSelectedDraftVersion(created.updatedAt);
          setMessage("Rascunho salvo apenas nesta demonstração. Ao sair, ele será apagado.");
        }
        return;
      }
      if (selectedDraft) {
        if (!selectedDraftVersion) throw new Error("Reabra o rascunho na lista para carregar a versão atual antes de editá-lo.");
        const updated = await api.updateSocialContentDraft(selectedDraft.id, result.data, selectedDraftVersion);
        setSelectedDraftVersion(updated.updatedAt);
        setMessage("Rascunho atualizado no escritório.");
      } else {
        const created = await api.createSocialContentDraft(result.data);
        setSelectedDraftId(created.id);
        setSelectedDraftVersion(created.updatedAt);
        setMessage("Rascunho salvo no escritório. Nenhuma rede social foi acessada.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o rascunho.");
    } finally {
      setSaving(false);
    }
  }

  async function shareDraft() {
    const result = SocialContentDraftCreateSchema.safeParse({ platform, topic, content });
    if (!result.success) {
      setMessage(topic.trim().length < 2 ? "Escreva um tema antes de compartilhar." : "Escreva o texto antes de compartilhar.");
      return;
    }
    const messageText = `${result.data.topic}\n\n${result.data.content}`;
    if (Platform.OS === "web") {
      try {
        await globalThis.navigator.clipboard.writeText(messageText);
        setMessage("Texto copiado. Abra a rede escolhida, confira o formato e cole manualmente.");
      } catch {
        setMessage("A cópia foi bloqueada pelo navegador. Selecione o texto e copie manualmente.");
      }
      return;
    }
    try {
      await Share.share({ message: messageText });
      setMessage("Menu de compartilhamento aberto. Escolha um destino disponível e revise antes de publicar.");
    } catch {
      setMessage("Não foi possível abrir o menu. Você pode selecionar e copiar o texto manualmente.");
    }
  }

  return <Screen title="Conteúdo para compartilhar" subtitle="Prepare um texto informativo e revise antes de copiar para uma rede social.">
    <ActionButton label="Voltar ao escritório" secondary onPress={() => router.replace("/(tabs)")} />
    <Card style={styles.priority}>
      <Heading>Um rascunho de cada vez</Heading>
      <Text style={styles.text}>Escreva para informar. O app não publica, não impulsiona anúncios e não envia seu texto às redes sociais.</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {platforms.map((item) => {
          const selected = platform === item.id;
          return <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={item.label}
            onPress={() => { setPlatform(item.id); setMessage(""); }}
            style={({ pressed }) => ({ minHeight: 52, minWidth: 104, flexGrow: 1, borderRadius: 12, borderWidth: 2, borderColor: selected ? colors.wine : colors.controlLine,
              backgroundColor: selected ? colors.wineWash : colors.paper, paddingHorizontal: 12, justifyContent: "center", opacity: pressed ? 0.75 : 1 })}>
            <Text style={{ color: selected ? colors.wine : colors.ink, fontSize: 15, fontWeight: "700", textAlign: "center" }}>{item.label}</Text>
          </Pressable>;
        })}
      </View>
      <AccessibleTextInput accessibilityLabel="Tema informativo" placeholder="Tema, sem nome de cliente ou processo" placeholderTextColor={colors.muted}
        value={topic} onChangeText={setTopic} maxLength={160} style={styles.input} />
      <AccessibleTextInput accessibilityLabel="Texto do rascunho" placeholder="Escreva uma explicação geral e indique quando a pessoa deve consultar a fonte oficial." placeholderTextColor={colors.muted}
        value={content} onChangeText={setContent} maxLength={5000} multiline numberOfLines={8} textAlignVertical="top" style={[styles.input, { minHeight: 190 }]} />
      <Text style={styles.small}>{content.length}/5000 caracteres · Rascunhos ficam privados no escritório quando você está conectada.</Text>
      <ActionButton label="Inserir estrutura informativa" secondary onPress={() => requestAction({ type: "template" })} />
      <ActionButton label={saving ? "Salvando…" : selectedDraft ? "Salvar alterações" : "Salvar rascunho"} onPress={() => void saveDraft()} disabled={saving} />
      <ActionButton label="Copiar texto para compartilhar" secondary onPress={() => void shareDraft()} accessibilityHint="Copia ou abre o menu de compartilhamento do aparelho. A publicação fica sob seu controle." />
      {selectedDraft ? <ActionButton label="Começar outro rascunho" secondary onPress={() => requestAction({ type: "new" })} /> : null}
      {pendingAction ? <View style={styles.tight}>
        <Text accessibilityLiveRegion="assertive" style={styles.small}>{pendingAction.type === "template" ? "Substituir o texto atual pela estrutura?" : "Descartar as alterações ainda não salvas e continuar?"}</Text>
        <ActionButton label={pendingAction.type === "template" ? "Substituir texto pela estrutura" : "Descartar alterações e continuar"} disabled={saving} onPress={() => performAction(pendingAction)} />
        <ActionButton label="Continuar editando rascunho" secondary onPress={() => setPendingAction(null)} />
      </View> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text> : null}
    </Card>

    <Card>
      <Heading>Revisão antes de publicar</Heading>
      <Text style={styles.text}>• O texto é objetivo, informativo e verdadeiro.</Text>
      <Text style={styles.text}>• Não contém promessa de resultado, valor, desconto, gratuidade ou convite para litigar.</Text>
      <Text style={styles.text}>• Não inclui caso concreto, resultado, nome de cliente ou informação coberta por sigilo.</Text>
      <Text style={styles.text}>• Qualificações e especialidades são corretas e podem ser comprovadas.</Text>
      <Text style={styles.small}>Este lembrete não analisa conformidade ética nem substitui a conferência profissional. A rede pode exigir imagem ou vídeo; este app prepara somente texto. A opção de compartilhamento disponível varia por aparelho e rede.</Text>
      <ActionButton label="Abrir Provimento 205/2021 da OAB" secondary onPress={() => { void Linking.openURL(oabRuleUrl).catch(() => setMessage("Não foi possível abrir o portal da OAB.")); }} />
    </Card>

    <Card>
      <Heading>Rascunhos do escritório</Heading>
      {demoMode ? <Text style={styles.small}>Exemplos temporários desta demonstração; não são enviados à API.</Text> : null}
      {drafts.length === 0 ? <Text style={styles.text}>Nenhum rascunho salvo.</Text> : drafts.map((draft) => <Pressable key={draft.id} accessibilityRole="button" accessibilityLabel={`Abrir rascunho: ${draft.topic}`}
        onPress={() => requestAction({ type: "open", draft })} style={({ pressed }) => ({ minHeight: 60, justifyContent: "center", padding: 10, borderRadius: 10, backgroundColor: selectedDraftId === draft.id ? colors.wineWash : colors.canvas, opacity: pressed ? 0.75 : 1 })}>
        <Text style={styles.strong}>{draft.topic}</Text>
        <Text style={styles.small}>{platforms.find((item) => item.id === draft.platform)?.label} · atualizado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(draft.updatedAt))}</Text>
      </Pressable>)}
      {api.issue && !demoMode ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{api.issue}</Text> : null}
    </Card>
  </Screen>;
}
