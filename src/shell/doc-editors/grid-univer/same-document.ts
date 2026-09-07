/**
 * 打开表格时读哪一份：Univer 工程 → legacy 工程 → office xlsx → 空表。
 *
 * 2026-09-07 前这里还有第一优先级「会话交接」（`live-handoff.ts`）：旧核「编辑」页
 * 与 Univer「专业」页是两棵组件树，切页要靠 globalThis 上的交接把内存里的表带过去。
 * 旧核删掉后（core-swap:delete grid）两种模式是同一个 Univer 实例切 chrome，
 * 没有第二棵树要接，交接连同 flush 登记一起删了。
 */

import type { IWorkbookData } from "@univerjs/presets";
import { emptyGridSheet, type GridSheet } from "../grid-model";
import {
  GRID_LEGACY_PROJECT_SCHEMA,
  GRID_UNIVER_PROJECT_SCHEMA,
  planGridLegacyConversion,
} from "./legacy-conversion";
import { gridSheetsToUniverSnapshot } from "./snapshot";

/** 第二行「专业编辑」页在表格件上的名字。 */
export const GRID_PRO_LABEL = "Univer";

/**
 * 崩溃恢复键。旧核记 `grid:*`，Univer 记 `grid-univer:*`——
 * 旧核已删，但库里可能还躺着旧核写下的 `grid:*` 草稿（形状是 `{sheets:[…]}`），
 * 同一把键会让它被当成工作簿快照灌进 Univer，Univer 另起一本空簿，用户看见白画布。
 * 键名不同 + `isUniverWorkbookSnapshot` 双保险。
 */
export const GRID_UNIVER_RECOVERY_EDITOR_ID = "grid-univer";

/** 只认 Univer 工作簿快照：`sheets` 是对象（不是数组）且至少一张表。 */
export function isUniverWorkbookSnapshot(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const sheets = (payload as { sheets?: unknown }).sheets;
  if (!sheets || typeof sheets !== "object" || Array.isArray(sheets)) return false;
  return Object.keys(sheets as Record<string, unknown>).length > 0;
}

export function sheetsFromLegacyProjectData(data: unknown): GridSheet[] | null {
  if (!data || typeof data !== "object") return null;
  const sheets = (data as { sheets?: unknown }).sheets;
  if (!Array.isArray(sheets) || sheets.length === 0) return null;
  return sheets as GridSheet[];
}

export type GridSameDocumentPlan =
  | {
      kind: "univer";
      snapshot: Partial<IWorkbookData>;
      editable: true;
    }
  | {
      kind: "legacy-stored";
      sheets: GridSheet[];
      snapshot: Partial<IWorkbookData> | null;
      editable: false;
      reason?: string;
    }
  | {
      kind: "office";
      sheets: GridSheet[];
      snapshot: Partial<IWorkbookData>;
      editable: true;
    }
  | {
      kind: "empty";
      snapshot: Partial<IWorkbookData>;
      editable: true;
    };

function snapshotFromSheets(
  sheets: GridSheet[],
  title: string,
): Partial<IWorkbookData> {
  const planned = planGridLegacyConversion({ sheets, title });
  if (planned.ok) return planned.data;
  return gridSheetsToUniverSnapshot(sheets, { name: title }).data;
}

function emptyWorkbookSnapshot(title: string): Partial<IWorkbookData> {
  return gridSheetsToUniverSnapshot([emptyGridSheet()], { name: title }).data;
}

export function planGridSameDocumentOpen(input: {
  schema?: string;
  title?: string;
  univerSnapshot?: Partial<IWorkbookData> | null;
  legacySheets?: GridSheet[] | null;
  officeSheets?: GridSheet[] | null;
}): GridSameDocumentPlan {
  const title = input.title || "工作簿";
  const schema = String(input.schema || "");

  if (schema === GRID_UNIVER_PROJECT_SCHEMA && input.univerSnapshot) {
    return {
      kind: "univer",
      snapshot: input.univerSnapshot,
      editable: true,
    };
  }

  if (input.legacySheets && input.legacySheets.length > 0) {
    const planned = planGridLegacyConversion({
      sheets: input.legacySheets,
      schema: schema || GRID_LEGACY_PROJECT_SCHEMA,
      title,
    });
    return {
      kind: "legacy-stored",
      sheets: input.legacySheets,
      snapshot: planned.ok ? planned.data : null,
      editable: false,
      reason: planned.ok ? undefined : planned.reason,
    };
  }

  if (input.officeSheets && input.officeSheets.length > 0) {
    return {
      kind: "office",
      sheets: input.officeSheets,
      snapshot: snapshotFromSheets(input.officeSheets, title),
      editable: true,
    };
  }

  return { kind: "empty", snapshot: emptyWorkbookSnapshot(title), editable: true };
}

export type UniverSnapshotCell = {
  row: number;
  col: number;
  value: string;
};

/** 从 Univer 快照抽出有字的格子，给舞台灌画布、给探针核对。 */
export function listUniverSnapshotValues(snapshot: unknown): UniverSnapshotCell[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const sheets = (snapshot as { sheets?: unknown }).sheets;
  if (!sheets || typeof sheets !== "object") return [];
  const out: UniverSnapshotCell[] = [];
  for (const sheet of Object.values(sheets as Record<string, unknown>)) {
    if (!sheet || typeof sheet !== "object") continue;
    const cellData = (sheet as { cellData?: unknown }).cellData;
    if (!cellData || typeof cellData !== "object") continue;
    for (const [rowKey, row] of Object.entries(cellData as Record<string, unknown>)) {
      const rowIndex = Number(rowKey);
      if (!Number.isInteger(rowIndex) || !row || typeof row !== "object") continue;
      for (const [colKey, cell] of Object.entries(row as Record<string, unknown>)) {
        const colIndex = Number(colKey);
        if (!Number.isInteger(colIndex) || !cell || typeof cell !== "object") continue;
        const value = (cell as { v?: unknown }).v;
        if (value === undefined || value === null || value === "") continue;
        out.push({ row: rowIndex, col: colIndex, value: String(value) });
      }
    }
  }
  return out;
}

type UniverPaintRange = {
  setValue?: (value: string) => unknown;
};

type UniverPaintSheet = {
  getRange?: (row: number, col: number) => UniverPaintRange | null;
};

type UniverPaintWorkbook = {
  getId?: () => string;
  getActiveSheet?: () => UniverPaintSheet | null;
  setEditable?: (value: boolean) => unknown;
};

export type UniverWorkbookApi = {
  getActiveWorkbook?: () => UniverPaintWorkbook | null;
  createWorkbook?: (data: unknown) => unknown;
  disposeUnit?: (unitId: string) => unknown;
};

export type UniverWorkbookReplaceResult = {
  createdId: string;
  disposedId: string;
  painted: number;
};

function asWorkbook(value: unknown): UniverPaintWorkbook | null {
  if (!value || typeof value !== "object") return null;
  return value as UniverPaintWorkbook;
}

/** 把快照里的字写到当前可见工作簿。createWorkbook 只改模型不刷新时，靠这一下把格子画出来。 */
export function paintUniverWorkbookFromSnapshot(
  workbook: UniverPaintWorkbook | null | undefined,
  snapshot: unknown,
): number {
  const sheet = workbook?.getActiveSheet?.();
  if (!sheet?.getRange) return 0;
  let painted = 0;
  for (const cell of listUniverSnapshotValues(snapshot)) {
    sheet.getRange(cell.row, cell.col)?.setValue?.(cell.value);
    painted += 1;
  }
  return painted;
}

/**
 * Univer 0.25 画布认的是格子上的 `p`（一段 dataStream）。
 * 只有 `v` 的快照会进模型但画不出来，用户看见空表。
 */
export function enrichUniverSnapshotPlainText(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const sheets = (snapshot as { sheets?: unknown }).sheets;
  if (!sheets || typeof sheets !== "object") return snapshot;
  const nextSheets: Record<string, unknown> = {};
  for (const [sheetId, sheet] of Object.entries(sheets as Record<string, unknown>)) {
    if (!sheet || typeof sheet !== "object") {
      nextSheets[sheetId] = sheet;
      continue;
    }
    const cellData = (sheet as { cellData?: unknown }).cellData;
    if (!cellData || typeof cellData !== "object") {
      nextSheets[sheetId] = sheet;
      continue;
    }
    const nextCells: Record<string, Record<string, unknown>> = {};
    for (const [rowKey, row] of Object.entries(cellData as Record<string, unknown>)) {
      if (!row || typeof row !== "object") continue;
      nextCells[rowKey] = {};
      for (const [colKey, cell] of Object.entries(row as Record<string, unknown>)) {
        if (!cell || typeof cell !== "object") continue;
        const current = cell as { v?: unknown; p?: unknown };
        if (current.p || current.v === undefined || current.v === null || current.v === "") {
          nextCells[rowKey][colKey] = current;
          continue;
        }
        const text = String(current.v);
        nextCells[rowKey][colKey] = {
          ...current,
          p: {
            id: `p-${rowKey}-${colKey}`,
            body: {
              dataStream: `${text}\r\n`,
              paragraphs: [{ startIndex: text.length }],
              textRuns: [],
            },
          },
        };
      }
    }
    nextSheets[sheetId] = { ...sheet, cellData: nextCells };
  }
  return { ...snapshot, sheets: nextSheets };
}

/**
 * 先建带数据的那一本，再卸掉 preset 留下的空簿。
 * 反过来卸会让 Univer 处在「一本工作簿都没有」的空窗，新表经常画不出来。
 */
export function replaceUniverWorkbookWithSnapshot(
  api: UniverWorkbookApi,
  snapshot: unknown,
): UniverWorkbookReplaceResult {
  const existing = asWorkbook(api.getActiveWorkbook?.() ?? null);
  const existingId = existing?.getId?.() || "";
  const payload = enrichUniverSnapshotPlainText(snapshot);
  const created = asWorkbook(api.createWorkbook?.(payload) ?? null);
  const createdId = created?.getId?.() || "";
  let disposedId = "";
  if (existingId && createdId && existingId !== createdId && api.disposeUnit) {
    api.disposeUnit(existingId);
    disposedId = existingId;
  }
  const visible = created || asWorkbook(api.getActiveWorkbook?.() ?? null);
  visible?.setEditable?.(true);
  return {
    createdId,
    disposedId,
    painted: listUniverSnapshotValues(payload).length,
  };
}
