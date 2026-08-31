import type { FloatingToolbarPoint } from "./floating-toolbar-geometry";

export const EDIT_BAR_DOCK_STATE_VERSION = 2 as const;
export const EDIT_BAR_DOCK_OFFSET_LIMIT = 100_000;

export type EditBarDockMode = "docked" | "floating";
/** 展开胶囊 / 收起成圆。收起态是常驻的，不随选区消失。 */
export type EditBarPresentation = "expanded" | "collapsed";

export interface EditBarDockState {
  version: typeof EDIT_BAR_DOCK_STATE_VERSION;
  mode: EditBarDockMode;
  /** 展开态偏移：相对**选区锚点**，所以换选中对象时条会跟着走。 */
  offset: FloatingToolbarPoint;
  presentation: EditBarPresentation;
  /**
   * 收起态位置：**图层内绝对坐标**，刻意不复用 offset。
   * 收起的小圆是用户停在某个角落的常驻物件，若沿用选区锚点，
   * 一换选中它就会自己跑掉。两种形态必须用两套坐标系。
   */
  collapsedPosition: FloatingToolbarPoint | null;
}

function finiteCoordinate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= EDIT_BAR_DOCK_OFFSET_LIMIT
  );
}

function readPoint(value: unknown): FloatingToolbarPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  if (!finiteCoordinate(point.x) || !finiteCoordinate(point.y)) return null;
  return { x: point.x, y: point.y };
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
  // v1 只有 mode + offset。直接丢弃会让所有人的固定偏好归零，所以补默认值升级。
  if (record.version !== 1 && record.version !== EDIT_BAR_DOCK_STATE_VERSION) {
    return null;
  }
  if (record.mode !== "docked" && record.mode !== "floating") return null;
  const offset = readPoint(record.offset);
  if (!offset) return null;
  const presentation =
    record.presentation === "collapsed" ? "collapsed" : "expanded";
  return {
    version: EDIT_BAR_DOCK_STATE_VERSION,
    mode: record.mode,
    offset,
    presentation,
    collapsedPosition: readPoint(record.collapsedPosition),
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
    presentation: state.presentation,
    collapsedPosition: state.collapsedPosition
      ? boundedEditBarDockOffset(state.collapsedPosition)
      : null,
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
