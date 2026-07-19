"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { SelectionPanelAction } from "./selection-context";

export const ADVANCED_TOOLS_PANEL_ID = "advanced-workbench-tools-panel";

export interface AdvancedToolsLauncher {
  id: string;
  label: string;
  controlsId: string;
  available: boolean;
  expanded: boolean;
  unavailableReason?: string;
  toggle: () => void;
}

interface RegisteredToolsLauncher {
  order: number;
  launcher: AdvancedToolsLauncher;
}

interface RegisteredToolsTrigger {
  order: number;
  focus: () => void;
}

const toolsLaunchers = new Map<symbol, RegisteredToolsLauncher>();
const toolsLauncherListeners = new Set<() => void>();
const toolsTriggerFocus = new Map<
  string,
  Map<symbol, RegisteredToolsTrigger>
>();
let toolsLauncherOrder = 0;
let toolsTriggerOrder = 0;
let toolsLauncherSnapshot: AdvancedToolsLauncher | null = null;

function newestToolsLauncher(): AdvancedToolsLauncher | null {
  let newest: RegisteredToolsLauncher | null = null;
  for (const entry of toolsLaunchers.values()) {
    if (!newest || entry.order > newest.order) newest = entry;
  }
  return newest?.launcher || null;
}

function publishToolsLauncher(): void {
  const next = newestToolsLauncher();
  if (Object.is(next, toolsLauncherSnapshot)) return;
  toolsLauncherSnapshot = next;
  toolsLauncherListeners.forEach((listener) => listener());
}

export function registerAdvancedToolsLauncher(
  launcher: AdvancedToolsLauncher,
): () => void {
  const token = Symbol(launcher.id);
  toolsLaunchers.set(token, {
    order: ++toolsLauncherOrder,
    launcher,
  });
  publishToolsLauncher();
  return () => {
    if (!toolsLaunchers.delete(token)) return;
    publishToolsLauncher();
  };
}

export function getAdvancedToolsLauncherSnapshot(): AdvancedToolsLauncher | null {
  return toolsLauncherSnapshot;
}

export function registerAdvancedToolsTrigger(
  launcherId: string,
  focus: () => void,
): () => void {
  const token = Symbol(launcherId);
  const registered =
    toolsTriggerFocus.get(launcherId) ||
    new Map<symbol, RegisteredToolsTrigger>();
  registered.set(token, {
    order: ++toolsTriggerOrder,
    focus,
  });
  toolsTriggerFocus.set(launcherId, registered);
  return () => {
    const current = toolsTriggerFocus.get(launcherId);
    if (!current?.delete(token)) return;
    if (!current.size) {
      toolsTriggerFocus.delete(launcherId);
    }
  };
}

export function focusAdvancedToolsTrigger(launcherId: string): void {
  let newest: RegisteredToolsTrigger | null = null;
  for (const trigger of toolsTriggerFocus.get(launcherId)?.values() || []) {
    if (!newest || trigger.order > newest.order) newest = trigger;
  }
  newest?.focus();
}

function subscribeAdvancedToolsLauncher(listener: () => void): () => void {
  toolsLauncherListeners.add(listener);
  return () => toolsLauncherListeners.delete(listener);
}

export function useAdvancedToolsLauncherRegistration(
  launcher: AdvancedToolsLauncher,
): void {
  useLayoutEffect(
    () => registerAdvancedToolsLauncher(launcher),
    [launcher],
  );
}

export interface AdvancedLayoutState {
  hostPanelVisible: boolean;
  editorToolActive: boolean;
  activeDrawerId: string;
  activeTransientPanelId: string;
  contextBarLeading?: ReactNode;
  contextBarTrailing?: ReactNode;
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

export interface ResolvedAdvancedLayoutState extends AdvancedLayoutState {
  toolsLauncher: AdvancedToolsLauncher | null;
}

export function useAdvancedLayout(): ResolvedAdvancedLayoutState | null {
  const layout = useContext(AdvancedLayoutContext);
  const toolsLauncher = useSyncExternalStore(
    subscribeAdvancedToolsLauncher,
    getAdvancedToolsLauncherSnapshot,
    () => null,
  );
  return useMemo(
    () => (layout ? { ...layout, toolsLauncher } : null),
    [layout, toolsLauncher],
  );
}
