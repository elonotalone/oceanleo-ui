import type { ReactNode } from "react";

export interface AdvancedHistoryActions {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

export interface AdvancedViewportActions {
  /** User-facing percent value, for example 100. */
  value: number;
  min?: number;
  max?: number;
  step?: number;
  setValue: (value: number) => void;
  fit?: () => void;
}

export interface AdvancedStageChromeProps {
  toolbar?: ReactNode;
  viewport?: AdvancedViewportActions;
}
