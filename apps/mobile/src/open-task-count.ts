export function formatOpenTaskCount(count: number): string {
  return `${count} ${count === 1 ? "tarefa" : "tarefas"} em aberto`;
}
