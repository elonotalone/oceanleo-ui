/**
 * 表格两页之间的会话交接。故意不引 grid-model / snapshot：
 * 路由接线测试会把 `doc-io` 桩掉，任何间接依赖都会当场红。
 */

export const GRID_PRO_LABEL = "Univer";

/** 与 `legacy-conversion.ts` 的 `GRID_UNIVER_PROJECT_SCHEMA` 同字，这里不 import 以免拉进 Univer。 */
export const GRID_UNIVER_PROJECT_SCHEMA_ID = "oceanleo.grid.univer.v1";

export type GridLiveHandoffSource = "legacy" | "univer";

export type GridLiveHandoff = {
  itemKey: string;
  sheets: unknown[];
  activeSheetId?: string;
  univerSnapshot?: unknown;
  source: GridLiveHandoffSource;
};

export type GridLiveFlushResult = {
  ok: boolean;
  error?: string;
  item?: unknown;
};

type GridLiveFlush = () => Promise<GridLiveFlushResult> | GridLiveFlushResult;

/**
 * 必须挂在 globalThis 上：Univer 舞台是 `dynamic()` 另打的 chunk，
 * 模块级 `let` 会有两份，编辑页写下的交接专业页读不到，用户看见空表。
 */
const STORE_KEY = "__oceanleoGridLiveHandoff";

type GridLiveStore = {
  handoff: GridLiveHandoff | null;
  flush: GridLiveFlush | null;
};

function liveStore(): GridLiveStore {
  const root = globalThis as typeof globalThis & {
    [STORE_KEY]?: GridLiveStore;
  };
  if (!root[STORE_KEY]) {
    root[STORE_KEY] = { handoff: null, flush: null };
  }
  return root[STORE_KEY];
}

export function gridItemKey(item: { id?: unknown; key?: unknown }): string {
  return String(item.key || item.id || "");
}

export function publishGridLiveHandoff(handoff: GridLiveHandoff): void {
  liveStore().handoff = {
    itemKey: String(handoff.itemKey || ""),
    sheets: Array.isArray(handoff.sheets) ? handoff.sheets : [],
    activeSheetId: handoff.activeSheetId,
    univerSnapshot: handoff.univerSnapshot ?? null,
    source: handoff.source,
  };
}

export function peekGridLiveHandoff(itemKey?: string): GridLiveHandoff | null {
  const liveHandoff = liveStore().handoff;
  if (!liveHandoff) return null;
  if (itemKey && liveHandoff.itemKey && liveHandoff.itemKey !== itemKey) {
    return null;
  }
  return liveHandoff;
}

export function takeGridLiveHandoff(itemKey?: string): GridLiveHandoff | null {
  const found = peekGridLiveHandoff(itemKey);
  if (found) liveStore().handoff = null;
  return found;
}

export function clearGridLiveHandoff(): void {
  liveStore().handoff = null;
}

export function registerGridLiveFlush(fn: GridLiveFlush | null): void {
  liveStore().flush = fn;
}

export async function flushGridLiveDocument(): Promise<GridLiveFlushResult> {
  const flush = liveStore().flush;
  if (!flush) return { ok: true };
  return flush();
}

/**
 * 两页各自的崩溃恢复键。旧核记 `grid:*`，Univer 记 `grid-univer:*`。
 * 同一把键会让旧核写下的 `{sheets:[…]}` 草稿在 Univer 页被当成工作簿快照灌进去：
 * Univer 收到看不懂的形状就另起一本空簿（1000×20、无名），用户看见白画布。
 */
export const GRID_UNIVER_RECOVERY_EDITOR_ID = "grid-univer";

/** 只认 Univer 工作簿快照：`sheets` 是对象（不是数组）且至少一张表。 */
export function isUniverWorkbookSnapshot(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const sheets = (payload as { sheets?: unknown }).sheets;
  if (!sheets || typeof sheets !== "object" || Array.isArray(sheets)) return false;
  return Object.keys(sheets as Record<string, unknown>).length > 0;
}

/**
 * 页面刚从同会话交接打开时，本地崩溃草稿一定不比交接新：
 * 草稿是上一页卸载那一刻写的，交接是同一刻的内存内容，二者同源，而且草稿形状可能来自另一页。
 * 这时恢复钩子必须让路，否则会把刚交接来的内容盖掉。
 * `accept` 只在放行时被调用：它可以只校验形状，也可以直接执行恢复并回报是否成功。
 */
export function shouldRestoreGridRecovery(input: {
  openedFromHandoff: boolean;
  payload: unknown;
  accept: (payload: unknown) => boolean;
}): boolean {
  if (input.openedFromHandoff) return false;
  return input.accept(input.payload);
}

/**
 * 旧核只会用 `oceanleo.grid.v1` 去读工程档。
 * Univer 刚存完的 pin 是 univer schema，原样交给旧核会落到空表。
 */
export function itemWithoutUniverProjectPin<T extends { meta?: Record<string, unknown> }>(
  item: T,
): T {
  const schema = String(item.meta?.editor_project_schema || "");
  if (schema !== GRID_UNIVER_PROJECT_SCHEMA_ID) return item;
  return {
    ...item,
    meta: {
      ...(item.meta || {}),
      editor_project_url: "",
      editor_project_schema: "",
    },
  };
}
