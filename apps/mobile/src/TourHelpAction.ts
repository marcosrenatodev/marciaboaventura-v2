import { createContext, type ReactNode } from "react";

export type GuidedTourScreenId = "today" | "cases" | "calendar" | "finance" | "research" | "files";
export type TourHelpActionContextValue = { activeScreenId: GuidedTourScreenId | null; action: ReactNode };

export const TourHelpActionContext = createContext<TourHelpActionContextValue | null>(null);
