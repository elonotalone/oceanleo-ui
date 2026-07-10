/**
 * Shared metadata embedded beside each site's opaque workspace snapshot.
 *
 * Site runtimes never receive these reserved keys. Keeping shared UI state in
 * the same revisioned snapshot makes restore atomic without asking every
 * OceanLeo site to duplicate right-pane persistence.
 */
export const WORKSPACE_UI_SNAPSHOT_KEY = "__oceanleo_ui";
export const LEGACY_WORKSPACE_NOTE_KEY = "__oceanleo_note";

export interface WorkspaceUiSnapshot {
  right_tab?: string;
}

export function normalizeWorkspaceUiSnapshot(
  raw: unknown,
): WorkspaceUiSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const rightTab = (raw as Record<string, unknown>).right_tab;
  return typeof rightTab === "string" && rightTab.length <= 160
    ? { right_tab: rightTab }
    : {};
}

export function mergeWorkspaceSessionSnapshot(
  runtime: Record<string, unknown>,
  ui: WorkspaceUiSnapshot = {},
): Record<string, unknown> {
  const snapshot = { ...runtime };
  delete snapshot[LEGACY_WORKSPACE_NOTE_KEY];
  delete snapshot[WORKSPACE_UI_SNAPSHOT_KEY];
  const normalized = normalizeWorkspaceUiSnapshot(ui);
  if (normalized.right_tab) {
    snapshot[WORKSPACE_UI_SNAPSHOT_KEY] = normalized;
  }
  return snapshot;
}

export function splitWorkspaceSessionSnapshot(
  snapshot: Record<string, unknown>,
): {
  runtime: Record<string, unknown>;
  ui: WorkspaceUiSnapshot;
} {
  const runtime = { ...snapshot };
  const ui = normalizeWorkspaceUiSnapshot(runtime[WORKSPACE_UI_SNAPSHOT_KEY]);
  delete runtime[WORKSPACE_UI_SNAPSHOT_KEY];
  // Old sessions may still carry the retired manual history note. Never pass
  // it into a site runtime and never write it back on the next save.
  delete runtime[LEGACY_WORKSPACE_NOTE_KEY];
  return { runtime, ui };
}
