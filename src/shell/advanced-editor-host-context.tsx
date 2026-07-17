"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { LibraryItem } from "./library-data";

export interface AdvancedEditorHostValue {
  embedded: boolean;
  onSavedItem?: (item: LibraryItem) => void;
}

const AdvancedEditorHostContext =
  createContext<AdvancedEditorHostValue | null>(null);

export function AdvancedEditorHostProvider({
  value,
  children,
}: {
  value: AdvancedEditorHostValue;
  children: ReactNode;
}) {
  return (
    <AdvancedEditorHostContext.Provider value={value}>
      {children}
    </AdvancedEditorHostContext.Provider>
  );
}

export function useAdvancedEditorHost(): AdvancedEditorHostValue {
  return useContext(AdvancedEditorHostContext) || { embedded: false };
}
