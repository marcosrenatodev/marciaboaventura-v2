const maintenanceMessage = "O sistema do escritório está em manutenção temporária. Nenhuma operação nova foi aceita; quando voltar, confira ações iniciadas pouco antes.";

function retryDelay(retryAfter: string | null) {
  if (!retryAfter || !/^\d+$/.test(retryAfter)) return null;
  const seconds = Number(retryAfter);
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86_400) return null;
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "segundo" : "segundos"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}

export function setupFailureMessage(
  status: number,
  errorCode: unknown,
  retryAfter: string | null,
  serviceMaintenance: boolean,
) {
  if (status === 503 && serviceMaintenance) return maintenanceMessage;

  if (errorCode === "invalid_setup_request") {
    return "Confira os dados: a senha precisa ter de 12 a 128 caracteres e o código deve pertencer a esta API.";
  }
  if (errorCode === "owner_creation_failed") {
    return "Não foi possível criar ou confirmar a conta. Confira o e-mail e a senha; ao tentar novamente, use o mesmo e-mail.";
  }
  if (errorCode === "setup_unavailable") {
    return "A configuração já foi concluída ou outra tentativa está em andamento. Se você enviou o formulário há pouco, tente entrar com o mesmo e-mail; se não concluir, aguarde e tente novamente.";
  }
  if (errorCode === "setup_completion_failed_retry_same_email") {
    return "A conta pode ter sido criada, mas a configuração do escritório não foi confirmada. Aguarde alguns minutos e tente entrar ou repetir com o mesmo e-mail; não use outro.";
  }
  if (errorCode === "setup_unavailable_retry_same_email") {
    return "Ocorreu uma falha temporária. Seus dados continuam no formulário; tente novamente com este mesmo e-mail.";
  }
  if (status === 429 || errorCode === "rate_limited" || errorCode === "rate_limit_unavailable") {
    const wait = retryDelay(retryAfter);
    return wait
      ? `Muitas tentativas de configuração. Aguarde ${wait} e tente novamente; seus dados continuam no formulário.`
      : "Muitas tentativas de configuração. Aguarde um pouco e tente novamente; seus dados continuam no formulário.";
  }
  if (status === 409 || status === 410) {
    return "A configuração inicial já foi concluída ou expirou. Entre com sua conta ou solicite um novo código ao administrador.";
  }
  if (status === 400) {
    return "Não foi possível validar os dados da configuração. Confira nome, e-mail, senha e código.";
  }
  if (status === 401 || status === 403) return "O código de configuração não foi aceito.";
  if (status === 404) return "A configuração inicial não está disponível nesta API.";
  if (status === 503) {
    return "A API não confirmou o resultado da configuração. Tente entrar com o mesmo e-mail; se não houver acesso, tente novamente mais tarde com esse mesmo endereço.";
  }
  return "Não foi possível confirmar o resultado da configuração. Tente entrar com o mesmo e-mail; se não houver acesso, tente novamente mais tarde com esse mesmo endereço.";
}

export function setupTransportFailureMessage(serviceMaintenance: boolean) {
  if (serviceMaintenance) return maintenanceMessage;
  return "Não foi possível confirmar se a configuração terminou. Tente entrar com o mesmo e-mail; se não houver acesso, confira a conexão e tente configurar novamente usando esse mesmo endereço.";
}
