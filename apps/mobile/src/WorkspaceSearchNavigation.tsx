import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";
import { useAuth } from "@/auth";

export type ProcessesScreenView = "matters" | "courtCases" | "clients";
export type WorkspaceSearchTarget = ProcessesScreenView | "agenda" | "finance";

type WorkspaceSearchQueries = Record<WorkspaceSearchTarget, string>;

type WorkspaceSearchNavigationValue = {
  searchQueries: WorkspaceSearchQueries;
  processesView: ProcessesScreenView;
  requestSearch: (target: WorkspaceSearchTarget, query: string) => void;
  setSearchQuery: (target: WorkspaceSearchTarget, query: string) => void;
  setProcessesView: (view: ProcessesScreenView) => void;
  showCourtCaseList: () => void;
};

type WorkspaceSearchState = {
  searchQueries: WorkspaceSearchQueries;
  processesView: ProcessesScreenView;
};

const EMPTY_QUERIES: WorkspaceSearchQueries = { matters: "", courtCases: "", clients: "", agenda: "", finance: "" };
const WorkspaceSearchNavigationContext = createContext<WorkspaceSearchNavigationValue | null>(null);

export function WorkspaceSearchNavigationProvider({ children }: PropsWithChildren) {
  const { demoMode, session } = useAuth();
  const identity = demoMode ? "mode:demo" : session?.user.id ? `account:${session.user.id}` : "mode:signed-out";

  return <WorkspaceSearchNavigationState key={identity ?? "anonymous"}>{children}</WorkspaceSearchNavigationState>;
}

function WorkspaceSearchNavigationState({ children }: PropsWithChildren) {
  const [state, setState] = useState<WorkspaceSearchState>(() => ({
    searchQueries: EMPTY_QUERIES,
    processesView: "courtCases",
  }));
  const requestSearch = useCallback((target: WorkspaceSearchTarget, query: string) => {
    const normalizedQuery = query.trim().slice(0, 120);
    setState((current) => ({
      ...current,
      searchQueries: { ...current.searchQueries, [target]: normalizedQuery },
      processesView: target === "matters" || target === "courtCases" || target === "clients" ? target : current.processesView,
    }));
  }, []);
  const setProcessesView = useCallback((view: ProcessesScreenView) => {
    setState((current) => ({ ...current, processesView: view }));
  }, []);
  const setSearchQuery = useCallback((target: WorkspaceSearchTarget, query: string) => {
    setState((current) => ({ ...current, searchQueries: { ...current.searchQueries, [target]: query } }));
  }, []);
  const showCourtCaseList = useCallback(() => {
    setState((current) => ({ ...current, processesView: "courtCases" }));
  }, []);
  const value = useMemo(() => ({ ...state, requestSearch, setSearchQuery, setProcessesView, showCourtCaseList }),
    [state, requestSearch, setSearchQuery, setProcessesView, showCourtCaseList]);

  return <WorkspaceSearchNavigationContext.Provider value={value}>{children}</WorkspaceSearchNavigationContext.Provider>;
}

export function useWorkspaceSearchNavigation() {
  const context = useContext(WorkspaceSearchNavigationContext);
  if (!context) throw new Error("useWorkspaceSearchNavigation precisa do WorkspaceSearchNavigationProvider");
  return context;
}
