import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { ActionButton, Card, Heading, Screen } from "@/components/Ui";
import { matters } from "@/demo";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { colors, styles } from "@/theme";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export default function MattersScreen() {
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [matterMessage, setMatterMessage] = useState("");
  const [formIssue, setFormIssue] = useState("");
  const [saving, setSaving] = useState(false);
  const [courtName, setCourtName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [caseLabel, setCaseLabel] = useState("");
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null);
  const [caseIssue, setCaseIssue] = useState("");
  const [savingCase, setSavingCase] = useState(false);
  const [focused, setFocused] = useState(false);
  const { demoMode } = useAuth();
  const api = useWorkData();
  if (!demoMode) {
    const normalizedQuery = normalize(query.trim());
    const filteredApi = api.matters.filter((matter) => normalize(matter.title).includes(normalizedQuery));
    const filteredCases = api.courtCases.filter((courtCase) => normalize([
      courtCase.courtName, courtCase.jurisdiction ?? "", courtCase.caseNumber ?? "", courtCase.label ?? "",
      api.matters.find((matter) => matter.id === courtCase.matterId)?.title ?? "",
    ].join(" ")).includes(normalizedQuery));
    return <Screen title="Assuntos e processos" subtitle="Organize pastas de trabalho e cadastre os casos manualmente.">
      <View style={styles.tight}>
        <Text style={styles.strong}>Buscar assuntos e processos</Text>
        <TextInput accessibilityLabel="Buscar assuntos e processos cadastrados" placeholder="Digite para filtrar" placeholderTextColor={colors.muted}
          value={query} onChangeText={setQuery} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={[styles.input, focused && styles.focused]} autoCorrect={false} returnKeyType="search" maxLength={100} />
      </View>
      <ApiStatus loading={api.loading} issue={api.issue} empty={false} emptyText="" onRetry={() => void api.refresh()} />
      {api.sessionInfo && !api.loading && !api.issue && filteredApi.length === 0 ? <Card><Heading>Sem assuntos</Heading><Text style={styles.text}>{query ? "Nenhum assunto corresponde à busca." : "Ainda não há assuntos cadastrados."}</Text></Card> : null}
      {api.sessionInfo && filteredApi.map((matter) => <Card key={matter.id}>
        <Text style={styles.badge}>{matter.status === "archived" ? "Arquivado" : "Ativo"}</Text>
        <Heading>{matter.title}</Heading>
        {matter.description ? <Text style={styles.text}>{matter.description}</Text> : null}
      </Card>)}
      {api.sessionInfo && !api.loading && !api.issue && filteredCases.length === 0 ? <Card><Heading>Sem processos</Heading><Text style={styles.text}>{query ? "Nenhum processo corresponde à busca." : "Ainda não há processos cadastrados."}</Text></Card> : null}
      {api.sessionInfo && filteredCases.map((courtCase) => {
        const linkedMatter = api.matters.find((matter) => matter.id === courtCase.matterId);
        return <Card key={courtCase.id}>
          <Text style={styles.badge}>{courtCase.status === "archived" ? "Arquivado" : "Ativo"}</Text>
          <Heading>{courtCase.label || courtCase.courtName}</Heading>
          {courtCase.label ? <Text style={styles.text}>Tribunal: {courtCase.courtName}</Text> : null}
          {courtCase.jurisdiction ? <Text style={styles.text}>Estado ou região: {courtCase.jurisdiction}</Text> : null}
          {courtCase.caseNumber ? <Text style={styles.text}>Número do processo: {courtCase.caseNumber}</Text> : null}
          <Text style={styles.small}>{linkedMatter ? `Assunto: ${linkedMatter.title}` : "Sem assunto vinculado"}</Text>
          <Text style={styles.small}>Cadastro manual. Nenhum tribunal foi consultado.</Text>
        </Card>;
      })}
      <Card>
        <Heading>Novo assunto</Heading>
        <TextInput accessibilityLabel="Nome do assunto" placeholder="Ex.: Organização de documentos" placeholderTextColor={colors.muted}
          value={title} onChangeText={setTitle} maxLength={160} style={styles.input} />
        <Text style={styles.small}>Não inclua nome de cliente nem número de processo nesta etapa.</Text>
        <ActionButton label={saving ? "Salvando…" : "Cadastrar assunto"} onPress={() => {
          if (!title.trim() || saving) { setFormIssue("Informe um nome para o assunto."); return; }
          setSaving(true); setFormIssue(""); setMatterMessage("");
          void api.createMatter(title).then(() => {
            setTitle(""); setMatterMessage("Assunto cadastrado pela API.");
          }, (error: unknown) => setFormIssue(error instanceof Error ? error.message : "Não foi possível cadastrar.")).finally(() => setSaving(false));
        }} />
        {matterMessage ? <Text accessibilityLiveRegion="polite" style={styles.small}>{matterMessage}</Text> : null}
        {formIssue ? <Text accessibilityLiveRegion="assertive" style={styles.small}>{formIssue}</Text> : null}
      </Card>
      <Card>
        <Heading>Novo processo</Heading>
        {caseIssue ? <Text accessibilityLiveRegion="polite" style={styles.small}>{caseIssue}</Text> : null}
        <Text style={styles.small}>Cadastro manual. Nenhum tribunal foi consultado e nenhum andamento é atualizado automaticamente.</Text>
        <TextInput accessibilityLabel="Tribunal do processo" placeholder="Tribunal (ex.: Tribunal de Justiça do Paraná)" placeholderTextColor={colors.muted}
          value={courtName} onChangeText={setCourtName} maxLength={160} style={styles.input} />
        <TextInput accessibilityLabel="Estado ou região do processo" placeholder="Estado ou região (ex.: PR ou Região Sul)" placeholderTextColor={colors.muted}
          value={jurisdiction} onChangeText={setJurisdiction} maxLength={120} style={styles.input} />
        <TextInput accessibilityLabel="Número do processo, opcional" placeholder="Número do processo (opcional)" placeholderTextColor={colors.muted}
          value={caseNumber} onChangeText={setCaseNumber} maxLength={80} style={styles.input} />
        <Text style={styles.small}>Número é um dado do processo, não um identificador do cadastro. Não validamos formato CNJ nesta etapa.</Text>
        <TextInput accessibilityLabel="Identificação curta, opcional" placeholder="Identificação curta (opcional)" placeholderTextColor={colors.muted}
          value={caseLabel} onChangeText={setCaseLabel} maxLength={160} style={styles.input} />
        <View style={styles.tight}>
          <Text style={styles.strong}>Vincular a um assunto (opcional)</Text>
          <ActionButton label={selectedMatterId ? "Remover vínculo com assunto" : "Sem assunto vinculado"} secondary onPress={() => setSelectedMatterId(null)} />
          {api.matters.filter((matter) => matter.status !== "archived").map((matter) => <ActionButton key={matter.id}
            label={selectedMatterId === matter.id ? `Selecionado: ${matter.title}` : `Selecionar assunto: ${matter.title}`}
            secondary onPress={() => setSelectedMatterId(matter.id)} />)}
          {api.matters.length === 0 && !api.loading ? <Text style={styles.small}>Cadastre um assunto acima para vinculá-lo aqui.</Text> : null}
        </View>
        <ActionButton label={savingCase ? "Salvando…" : "Cadastrar processo"} onPress={() => {
          if (!courtName.trim() || savingCase) { setCaseIssue("Informe o nome do tribunal."); return; }
          setSavingCase(true); setCaseIssue("");
          void api.createCourtCase({
            matterId: selectedMatterId, courtName, jurisdiction, caseNumber, label: caseLabel,
          }).then(() => {
            setCourtName(""); setJurisdiction(""); setCaseNumber(""); setCaseLabel(""); setSelectedMatterId(null);
            setCaseIssue("Processo cadastrado pela API. Nenhum tribunal foi consultado.");
          }, (error: unknown) => setCaseIssue(error instanceof Error ? error.message : "Não foi possível cadastrar o processo.")).finally(() => setSavingCase(false));
        }} />
      </Card>
    </Screen>;
  }
  const filtered = matters.filter((matter) => normalize(`${matter.title} ${matter.label}`).includes(normalize(query.trim())));
  return (
    <Screen title="Seus assuntos" subtitle="Encontre o próximo passo sem perder o contexto.">
      <View style={styles.tight}>
        <Text style={styles.strong}>Buscar nos exemplos</Text>
        <TextInput accessibilityLabel="Buscar um assunto fictício" placeholder="Ex.: contrato ou documentos"
          placeholderTextColor={colors.muted} value={query} onChangeText={setQuery}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={[styles.input, focused && styles.focused]} autoCorrect={false} returnKeyType="search" maxLength={100} />
        <Text style={styles.small}>Use somente palavras de exemplo. Não digite dados de clientes.</Text>
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.small}>{filtered.length} {filtered.length === 1 ? "assunto fictício encontrado" : "assuntos fictícios encontrados"}</Text>
      {filtered.map((matter) => <Card key={matter.id}>
        <Text style={styles.badge}>{matter.label}</Text>
        <Heading>{matter.title}</Heading>
        <Text style={styles.text}>Próximo passo: {matter.nextStep}.</Text>
        <Text style={styles.small}>Origem: demonstração local. Sem número de processo, tribunal ou andamento judicial.</Text>
      </Card>)}
      {filtered.length === 0 && <Card><Heading>Nenhum exemplo encontrado</Heading><Text style={styles.text}>Tente “contrato”, “documentos” ou apague a busca.</Text></Card>}
    </Screen>
  );
}

function ApiStatus({ loading, issue, empty, emptyText, onRetry }: { loading: boolean; issue: string | null; empty: boolean; emptyText: string; onRetry: () => void }) {
  if (loading) return <Text accessibilityLiveRegion="polite" style={styles.small}>Carregando dados do escritório…</Text>;
  if (issue) return <Card><Heading>Não foi possível carregar</Heading><Text accessibilityLiveRegion="assertive" style={styles.text}>{issue}</Text><ActionButton label="Tentar novamente" secondary onPress={onRetry} /></Card>;
  if (empty) return <Card><Heading>Lista vazia</Heading><Text style={styles.text}>{emptyText}</Text></Card>;
  return null;
}
