import type { ReactNode } from "react";

import type { AdvancedFlushResult } from "./advanced-session-context";
import type {
  AdvancedHistoryActions,
  AdvancedViewportActions,
  AdvancedWorkbenchAction,
} from "./advanced-workbench-chrome";
import type { WorkbenchIconName } from "./AdvancedEditorIcon";
import type { EditorAdapterId } from "./workbench-routes";

export interface AdvancedWorkbenchDrawer {
  id: string;
  label: string;
  icon: WorkbenchIconName;
  content: ReactNode;
  hiddenFromRail?: boolean;
}

export interface AdvancedEditorPersistenceAdapter {
  /** Monotonic editor mutation revision, never a saved URL or timestamp. */
  editRevision: string | number;
  dirty: boolean;
  /** Serializes and persists the revision current when this function starts. */
  flush: () => Promise<AdvancedFlushResult> | AdvancedFlushResult;
  recovery?: AdvancedEditorRecoveryAdapter;
}

export interface AdvancedEditorRecoveryAdapter {
  /** Root material + concrete version; stale drafts cannot cross versions. */
  key: string;
  ready: boolean;
  capture: () => unknown | Promise<unknown>;
  restore: (payload: unknown) => boolean | void | Promise<boolean | void>;
}

export interface AdvancedEditorNativeChrome {
  /** The embedded editor owns its formatting/creation toolbar. */
  toolbar?: boolean;
  /** The embedded editor owns content-only viewport controls. */
  viewport?: boolean;
  /** The embedded editor has an additional native close confirmation. */
  closeGuard?: boolean;
}

export interface AdvancedEditorToolbox {
  label: string;
  icon: WorkbenchIconName;
  content: ReactNode;
}

/**
 * Exhaustive route-to-shell contract. Editors own model semantics; the shell
 * owns product chrome, reachability, geometry and the persistence queue.
 */
export interface AdvancedEditorAdapter {
  id: EditorAdapterId;
  label: string;
  stage: ReactNode;
  available?: boolean;
  status?: string;
  toolbox?: AdvancedEditorToolbox;
  drawers?: readonly AdvancedWorkbenchDrawer[];
  contextToolbar?: ReactNode;
  actions?: readonly AdvancedWorkbenchAction[];
  history?: AdvancedHistoryActions;
  viewport?: AdvancedViewportActions;
  nativeChrome?: AdvancedEditorNativeChrome;
  persistence?: AdvancedEditorPersistenceAdapter;
  closeRequestRevision?: number;
}
