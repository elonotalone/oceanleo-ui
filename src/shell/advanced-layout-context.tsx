"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SelectionPanelAction } from "./selection-context";

export interface AdvancedLayoutState {
  hostPanelVisible: boolean;
  editorToolActive: boolean;
  activeDrawerId: string;
  activeTransientPanelId: string;
  contextBarLeading?: ReactNode;
  openDrawer: (drawerId: string, panelAction?: SelectionPanelAction) => void;
  openTransientPanel: (
    panelId: string,
    label: ReactNode,
    content: ReactNode,
  ) => void;
  updateTransientPanel: (panelId: string, content: ReactNode) => void;
  closeDrawer: () => void;
}

export const AdvancedLayoutContext =
  createContext<AdvancedLayoutState | null>(null);

export function useAdvancedLayout(): AdvancedLayoutState | null {
  return useContext(AdvancedLayoutContext);
}
