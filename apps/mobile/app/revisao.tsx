import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { ActionButton, Card, Heading, Screen } from "@/components/Ui";
import { useDemo } from "@/demo";
import { styles } from "@/theme";

export default function ReviewScreen() {
  const router = useRouter();
  const { reviewSeen, setReviewSeen } = useDemo();
  return (
    <Screen title="Confira antes de agir" subtitle="Uma explicação do fluxo, com um assunto fictício.">
      <Card>
        <Text style={styles.badge}>Revisão de exemplo</Text>
        <Heading>Entenda a origem</Heading>
        <View style={styles.tight}>
          <Text style={styles.strong}>Assunto</Text>
          <Text style={styles.text}>Revisão de contrato · assunto de exemplo A.</Text>
          <Text style={styles.strong}>Origem</Text>
          <Text style={styles.text}>Conteúdo criado apenas para demonstrar esta tela.</Text>
          <Text style={styles.strong}>Fonte judicial e consulta</Text>
          <Text style={styles.text}>Não disponíveis. Nenhum tribunal ou serviço externo foi consultado.</Text>
          <Text style={styles.strong}>Próximo passo em um caso real</Text>
          <Text style={styles.text}>Abrir a comunicação original na fonte oficial, conferir o contexto e decidir a providência.</Text>
        </View>
      </Card>
      <Card>
        <Heading>A decisão continua com você</Heading>
        <Text style={styles.text}>Este exemplo não calcula nem confirma prazo. Não existe publicação oficial anexada ou ação externa disponível.</Text>
        {reviewSeen
          ? <Text accessibilityLiveRegion="polite" style={styles.notice}>Exemplo concluído nesta sessão. Nenhum prazo confirmado.</Text>
          : <ActionButton label="Entendi este exemplo" accessibilityHint="Marca somente a explicação como vista, sem confirmar qualquer prazo." onPress={() => setReviewSeen(true)} />}
        {reviewSeen && <ActionButton label="Desfazer conclusão do exemplo" secondary onPress={() => setReviewSeen(false)} />}
        <ActionButton label="Voltar para Hoje" secondary onPress={() => router.replace("/")} />
      </Card>
    </Screen>
  );
}
