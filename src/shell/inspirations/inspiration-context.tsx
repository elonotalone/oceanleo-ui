"use client";
import { createContext, useContext, type ReactNode } from "react";
export interface InspirationContextValue {
  siteKey: string;
  appId: string;
  /** Optional host bridge for a conversation outside the enclosing split pane. */
  root?: () => ParentNode | null;
  openConversation?: () => boolean;
}
const InspirationContext = createContext<InspirationContextValue | null>(null);
/** Site packs wrap their app console once; no GuideProvider or bundled prompts required. */
export function InspirationProvider({ value, children }: { value: InspirationContextValue; children: ReactNode }) {
  return <InspirationContext.Provider value={value}>{children}</InspirationContext.Provider>;
}
export function useInspirationContext(): InspirationContextValue | null { return useContext(InspirationContext); }
