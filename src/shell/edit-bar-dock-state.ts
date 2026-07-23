import type { FloatingToolbarPoint } from "./floating-toolbar-geometry";

export const EDIT_BAR_DOCK_STATE_VERSION = 1 as const;
export const EDIT_BAR_DOCK_OFFSET_LIMIT = 100_000;

export type EditBarDockMode = "docked" | "floating";

export interface EditBarDockState {
  version: typeof EDIT_BAR_DOCK_STATE_VERSION;
  mode: EditBarDockMode;
  offset: FloatingToolbarPoint;
}

function finiteCoordinate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= EDIT_BAR_DOCK_OFFSET_LIMIT
  );
}

export function boundedEditBarDockOffset(
  point: FloatingToolbarPoint,
): FloatingToolbarPoint {
  return {
    x: Math.max(
      -EDIT_BAR_DOCK_OFFSET_LIMIT,
      Math.min(EDIT_BAR_DOCK_OFFSET_LIMIT, point.x),
    ),
    y: Math.max(
      -EDIT_BAR_DOCK_OFFSET_LIMIT,
      Math.min(EDIT_BAR_DOCK_OFFSET_LIMIT, point.y),
    ),
  };
}

export function normalizeEditBarDockState(
  value: unknown,
): EditBarDockState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== EDIT_BAR_DOCK_STATE_VERSION) return null;
  if (record.mode !== "docked" && record.mode !== "floating") return null;
  if (!record.offset || typeof record.offset !== "object") return null;
  const offset = record.offset as Record<string, unknown>;
  if (!finiteCoordinate(offset.x) || !finiteCoordinate(offset.y)) return null;
  return {
    version: EDIT_BAR_DOCK_STATE_VERSION,
    mode: record.mode,
    offset: { x: offset.x, y: offset.y },
  };
}

export function parseEditBarDockState(raw: string | null): EditBarDockState | null {
  if (!raw) return null;
  try {
    return normalizeEditBarDockState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function serializeEditBarDockState(state: EditBarDockState): string {
  return JSON.stringify({
    version: EDIT_BAR_DOCK_STATE_VERSION,
    mode: state.mode,
    offset: boundedEditBarDockOffset(state.offset),
  });
}

export function editBarDockStorageKey(workbenchId: string): string {
  const normalized = workbenchId.trim() || "workbench";
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `oceanleo:edit-bar-dock:v1:${(hash >>> 0).toString(36)}`;
}
