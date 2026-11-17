import { useState } from "react";
import { Text, TextInput, useWindowDimensions, View } from "react-native";
import { ActionButton, Card, Heading, Screen } from "@/components/Ui";
import { amountToReceive, financialEntries, formatMoney } from "@/demo";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { colors, styles } from "@/theme";

function isValidDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function localDateKey(date: Date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? match[3] + "/" + match[2] + "/" + match[1] : value;
}

function dueLabel(dueOn: string | null | undefined, today: string) {
  if (!dueOn) return "Sem vencimento informado";
  if (dueOn < today) return "Vencida em " + formatDate(dueOn);
  if (dueOn === today) return "Vence hoje";
  return "Vence em " + formatDate(dueOn);
}

export default function FinanceScreen() {
  const { width } = useWindowDimensions();
  const { demoMode } = useAuth();
  const api = useWorkData();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  if (!demoMode) {
    const plannedEntries = api.financialEntries.filter((entry) => (entry.status ?? "planned") === "planned");
    const incomePlanned = plannedEntries.filter((entry) => entry.kind === "income")
      .reduce((total, entry) => total + entry.amountCents, 0);
    const expensePlanned = plannedEntries.filter((entry) => entry.kind === "expense")
      .reduce((total, entry) => total + entry.amountCents, 0);
    const today = localDateKey(new Date());
    return <Screen title="Financeiro" subtitle="Registre uma receita ou despesa simples. Valores são enviados como centavos inteiros.">
      <Card>
        <Heading>Valores previstos</Heading>
        {api.loading ? <Text style={styles.small}>Carregando…</Text> : api.sessionInfo && !api.issue ? <View style={styles.stack}>
          <View style={styles.tight}>
            <Text style={styles.eyebrow}>RECEITAS A RECEBER</Text>
            <Text accessibilityLabel="Total de receitas previstas" style={styles.amount}>{formatMoney(incomePlanned)}</Text>
          </View>
          <View style={styles.tight}>
            <Text style={styles.eyebrow}>DESPESAS PREVISTAS</Text>
            <Text accessibilityLabel="Total de despesas previstas" style={styles.amount}>{formatMoney(expensePlanned)}</Text>
          </View>
        </View> : null}
        <Text style={styles.small}>Totais excluem lançamentos recebidos, pagos ou cancelados. Sem integração bancária ou conciliação.</Text>
      </Card>
      <Card>
        <Heading>Novo lançamento</Heading>
        <Text style={styles.strong}>Tipo do lançamento</Text>
        <View style={width < 480 ? styles.stack : styles.columns}>
          <ActionButton label={kind === "income" ? "Receita selecionada" : "Receita"} secondary onPress={() => setKind("income")} />
          <ActionButton label={kind === "expense" ? "Despesa selecionada" : "Despesa"} secondary onPress={() => setKind("expense")} />
        </View>
        <TextInput accessibilityLabel="Descrição do lançamento" placeholder="Ex.: Honorários" placeholderTextColor={colors.muted}
          value={description} onChangeText={setDescription} maxLength={160} style={styles.input} />
        <TextInput accessibilityLabel="Valor em reais e centavos" placeholder="Ex.: 125,00" placeholderTextColor={colors.muted}
          value={amount} onChangeText={(value) => setAmount(value.replace(/[^\d,.]/g, ""))} keyboardType="decimal-pad" maxLength={14} style={styles.input} />
        <TextInput accessibilityLabel="Data de vencimento opcional no formato AAAA-MM-DD" placeholder="Vencimento (AAAA-MM-DD) · opcional" placeholderTextColor={colors.muted}
          value={dueOn} onChangeText={setDueOn} keyboardType="numbers-and-punctuation" maxLength={10} style={styles.input} />
        <Text style={styles.small}>O valor será convertido para centavos inteiros (BRL). Sem parcelas ou dados bancários.</Text>
        <ActionButton label={saving ? "Salvando…" : "Cadastrar lançamento"} onPress={() => {
          const normalizedAmount = amount.trim().replace(",", ".");
          const validAmount = /^\d+(\.\d{1,2})?$/.test(normalizedAmount);
          const amountCents = validAmount ? Math.round(Number(normalizedAmount) * 100) : 0;
          const normalizedDueOn = dueOn.trim();
          const validDueOn = !normalizedDueOn || isValidDate(normalizedDueOn);
          if (!description.trim() || !validAmount || !Number.isSafeInteger(amountCents) || amountCents <= 0 || saving) {
            setMessage("Informe uma descrição e um valor maior que zero, com até centavos."); return;
          }
          if (!validDueOn) {
            setMessage("Informe uma data válida no formato AAAA-MM-DD ou deixe o vencimento em branco."); return;
          }
          setSaving(true); setMessage("");
          void api.createFinancialEntry({ description, amountCents, kind, dueOn: normalizedDueOn || null }).then(() => { setDescription(""); setAmount(""); setDueOn(""); setMessage("Lançamento confirmado pela API."); },
            (error: unknown) => setMessage(error instanceof Error ? error.message : "Não foi possível cadastrar o lançamento.")).finally(() => setSaving(false));
        }} />
        {message ? <Text accessibilityLiveRegion="polite" style={styles.small}>{message}</Text> : null}
      </Card>
      <Card>
        <Heading>Lançamentos</Heading>
        {api.loading ? <Text accessibilityLiveRegion="polite" style={styles.small}>Carregando lançamentos…</Text> : null}
        {api.issue ? <View style={styles.tight}><Text accessibilityLiveRegion="assertive" style={styles.text}>{api.issue}</Text><ActionButton label="Tentar novamente" secondary onPress={() => void api.refresh()} /></View> : null}
        {api.sessionInfo && !api.loading && !api.issue && api.financialEntries.length === 0 ? <Text style={styles.text}>Ainda não há lançamentos.</Text> : null}
        {api.sessionInfo && !api.issue && api.financialEntries.map((entry) => <View key={entry.id} style={styles.tight}>
          <Text style={styles.strong}>{entry.description}</Text>
          <Text style={styles.text}>{entry.kind === "expense" ? "Despesa" : "Receita"} · {formatMoney(entry.amountCents)}</Text>
          <Text style={styles.small}>{entry.status === "paid" ? (entry.kind === "income" ? "Recebido" : "Pago") : entry.status === "cancelled" ? "Cancelado" : "Previsto"}</Text>
          {entry.status !== "paid" && entry.status !== "cancelled" ? <Text style={styles.small}>{dueLabel(entry.dueOn, today)}</Text> : null}
          {entry.status === "planned" ? <View style={styles.stack}>
            <ActionButton label={entry.kind === "income" ? `Marcar como recebido: ${entry.description}` : `Marcar como pago: ${entry.description}`} secondary onPress={() => {
              void api.setFinancialStatus(entry.id, "paid").then(() => setMessage("Lançamento atualizado."), (error: unknown) => setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o lançamento."));
            }} />
            <ActionButton label={`Cancelar lançamento: ${entry.description}`} secondary onPress={() => {
              void api.setFinancialStatus(entry.id, "cancelled").then(() => setMessage("Lançamento cancelado."), (error: unknown) => setMessage(error instanceof Error ? error.message : "Não foi possível cancelar o lançamento."));
            }} />
          </View> : null}
          <View style={styles.divider} />
        </View>)}
      </Card>
    </Screen>;
  }
  return (
    <Screen title="Financeiro" subtitle="Uma visão simples, com valores fictícios.">
      <Card>
        <Text style={styles.eyebrow}>PARA RECEBER NO EXEMPLO</Text>
        <Text style={styles.amount}>{formatMoney(amountToReceive)}</Text>
        <Text style={styles.small}>Não há conta conectada, conciliação ou cobrança.</Text>
      </Card>
      <Card>
        <Heading>Lançamentos de exemplo</Heading>
        {financialEntries.map((entry) => <View key={entry.id} style={styles.stack}>
          <View style={styles.tight}>
            <Text style={styles.strong}>{entry.title}</Text>
            <Text style={styles.text}>{entry.kind === "expense" ? "Despesa" : "Receita"} · {formatMoney(entry.amountCents)}</Text>
            <Text style={styles.badge}>{entry.status} · fictício</Text>
          </View>
          <View style={styles.divider} />
        </View>)}
        <Text style={styles.small}>Origem: dados criados para esta demonstração. Nenhum recebimento foi verificado.</Text>
      </Card>
    </Screen>
  );
}
