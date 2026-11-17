import { createContext, useContext, useState, type PropsWithChildren } from "react";

// Fabricated from scratch. Never replace with office or ZIP data.
export const matters = [
  { id: "demo-a", title: "Revisão de contrato", label: "Assunto de exemplo A", nextStep: "Conferir a minuta fictícia" },
  { id: "demo-b", title: "Organização de documentos", label: "Assunto de exemplo B", nextStep: "Separar a lista de documentos" },
  { id: "demo-c", title: "Preparação de reunião", label: "Assunto de exemplo C", nextStep: "Organizar perguntas para a conversa" },
];

const initialTasks = [
  { id: "task-a", title: "Separar documentos para a reunião", detail: "Assunto de exemplo B", done: false },
  { id: "task-b", title: "Revisar a minuta de contrato", detail: "Assunto de exemplo A", done: false },
  { id: "task-c", title: "Preparar a pauta da conversa", detail: "Assunto de exemplo C", done: true },
];

export const appointments = [
  { time: "10:30", title: "Conversa inicial", detail: "Reunião fictícia · 30 minutos" },
  { time: "14:00", title: "Revisão de documentos", detail: "Tempo reservado no exemplo · 45 minutos" },
];

export const financialEntries = [
  { id: "entry-a", title: "Honorários de exemplo", amountCents: 85000, kind: "income", status: "A receber" },
  { id: "entry-b", title: "Consulta de exemplo", amountCents: 35000, kind: "income", status: "Recebido" },
  { id: "entry-c", title: "Cópias de exemplo", amountCents: 4800, kind: "expense", status: "Pago" },
] as const;

export const amountToReceive = financialEntries.filter((entry) => entry.status === "A receber").reduce((sum, entry) => sum + entry.amountCents, 0);
export const formatMoney = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

type DemoContextValue = {
  tasks: typeof initialTasks;
  toggleTask: (id: string) => void;
  reviewSeen: boolean;
  setReviewSeen: (seen: boolean) => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: PropsWithChildren) {
  const [tasks, setTasks] = useState(initialTasks);
  const [reviewSeen, setReviewSeen] = useState(false);
  function toggleTask(id: string) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done } : task));
  }
  return <DemoContext.Provider value={{ tasks, toggleTask, reviewSeen, setReviewSeen }}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used inside DemoProvider");
  return context;
}
