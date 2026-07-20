import type { LibraryKind } from "./library-data";
import {
  FIXED_WORKSPACE_SLOTS,
  type WorkspaceSlotId,
} from "./workspace-actions";

export type WorkspaceSurfaceRole = "panel" | "entry" | "container";

export interface WorkspaceSurfaceTab<
  TContent = unknown,
  TLibraryItem = unknown,
  TEntry = unknown,
  TMaterial = unknown,
> {
  id: string;
  label: string;
  displayLabel: string;
  slot: WorkspaceSlotId;
  role: WorkspaceSurfaceRole;
  content: TContent;
  libraryItem?: TLibraryItem;
  entries?: readonly TEntry[];
  materials?: readonly TMaterial[];
  kind?: LibraryKind;
  primary?: boolean;
  callbackId?: string | null;
  onDelete?: () => Promise<void> | void;
}

export interface WorkspaceSurfaceModel<TTab extends WorkspaceSurfaceTab> {
  tabs: readonly TTab[];
  groups: Readonly<Record<WorkspaceSlotId, readonly TTab[]>>;
  byId: ReadonlyMap<string, TTab>;
}

export function emptyWorkspaceSurfaceGroups<TTab>(): Record<
  WorkspaceSlotId,
  TTab[]
> {
  return {
    template: [],
    preview: [],
    materials: [],
    mine: [],
    browser: [],
  };
}

export function buildWorkspaceSurfaceModel<
  TTab extends WorkspaceSurfaceTab,
>(tabs: readonly TTab[]): WorkspaceSurfaceModel<TTab> {
  const groups = emptyWorkspaceSurfaceGroups<TTab>();
  const byId = new Map<string, TTab>();
  for (const tab of tabs) {
    groups[tab.slot].push(tab);
    if (!byId.has(tab.id)) byId.set(tab.id, tab);
  }
  return {
    tabs,
    groups,
    byId,
  };
}

export function workspaceSurfaceSlotForId<TTab extends WorkspaceSurfaceTab>(
  model: WorkspaceSurfaceModel<TTab>,
  id: string,
  fallback: (legacyId: string) => WorkspaceSlotId,
): WorkspaceSlotId {
  return model.byId.get(id)?.slot || fallback(id);
}

export function workspaceSurfaceCallerId<TTab extends WorkspaceSurfaceTab>(
  model: WorkspaceSurfaceModel<TTab>,
  slot: WorkspaceSlotId,
): string | null {
  const declared = model.groups[slot].find(
    (tab) => tab.callbackId !== null && tab.callbackId !== undefined,
  );
  if (declared) return declared.callbackId || null;
  return slot === "template" ? null : slot;
}

export function workspaceSurfacePrimaryTab<TTab extends WorkspaceSurfaceTab>(
  model: WorkspaceSurfaceModel<TTab>,
  slot: WorkspaceSlotId,
  activeId = "",
): TTab | null {
  const tabs = model.groups[slot];
  return (
    tabs.find((tab) => tab.id === activeId) ||
    tabs.find((tab) => tab.primary) ||
    tabs[0] ||
    null
  );
}

export const WORKSPACE_SURFACE_SLOTS = FIXED_WORKSPACE_SLOTS;
