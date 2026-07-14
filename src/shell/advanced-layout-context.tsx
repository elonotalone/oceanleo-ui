"use client";

import { createContext, useContext } from "react";

export interface AdvancedLayoutState {
  hostPanelVisible: boolean;
  editorToolActive: boolean;
}

export const AdvancedLayoutContext =
  createContext<AdvancedLayoutState | null>(null);

export function useAdvancedLayout(): AdvancedLayoutState | null {
  return useContext(AdvancedLayoutContext);
}
