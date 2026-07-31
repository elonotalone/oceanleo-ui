import { strToU8, zipSync } from "fflate";
import {
  GRID_CONSTANTS,
  GRID_FONT_SCALE,
  GRID_IR_MAX_BYTES,
  GRID_IR_MIN_BYTES,
  GRID_LAYOUT,
  GRID_PALETTE,
  GRID_XLSX_MAX_BYTES,
  GRID_XLSX_MIN_BYTES,
  gridCellValue,
  gridDisplayFormat,
  gridIrByteLength,
  sanitizeSheetName,
  serializeGridIrProject,
  validateGridIrProject,
  type GridCellFormat,
  type GridIrCell,
  type GridIrColumn,
  type GridIrProject,
  type GridIrSheet,
  type GridSheet,
} from "./grid-model";
import {
  GRID_FORMULA_MAX_DEPTH,
  evaluateGridCell,
  gridColumnName,
  inspectGridFormula,
  parseGridReference,
  type GridFormulaScalar,
} from "./grid-formula";

function usedBounds(sheet: GridSheet): { rows: number; cols: number } {
  let rows = sheet.rows.length;
  let cols = sheet.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  while (rows > 1 && (sheet.rows[rows - 1] || []).every((value) => value === "")) {
    rows -= 1;
  }
  while (
    cols > 1 &&
    sheet.rows.slice(0, rows).every((row) => (row[cols - 1] ?? "") === "")
  ) {
    cols -= 1;
  }
  return { rows: Math.max(1, rows), cols: Math.max(1, cols) };
}

function exportValue(value: string, format: GridCellFormat): unknown {
  if (format.type === "date") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (
    format.type === "number" ||
    format.type === "currency" ||
    format.type === "percent"
  ) {
    const parsed = Number(value.replace(/,/g, "").replace(/%$/, ""));
    if (Number.isFinite(parsed)) {
      return format.type === "percent" && value.trim().endsWith("%")
        ? parsed / 100
        : parsed;
    }
  }
  return value;
}

function excelColor(value: string | undefined): { argb: string } | undefined {
  const hex = String(value || "").replace("#", "");
  return /^[0-9a-f]{6}$/i.test(hex)
    ? { argb: `FF${hex.toUpperCase()}` }
    : undefined;
}

/**
 * Route-owned XLSX projection. The default/module interop is deliberate:
 * ExcelJS is CommonJS in Node smoke tests but exposed as a namespace by bundlers.
 */
export async function buildGridRouteWorkbookBlob(
  sheets: GridSheet[],
  options: { headerRow?: boolean } = {},
): Promise<Blob> {
  const { headerRow = true } = options;
  const imported = (await import("exceljs")) as typeof import("exceljs") & {
    default?: typeof import("exceljs");
  };
  const ExcelJS = imported.Workbook ? imported : (imported.default ?? imported);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OceanLeo";
  workbook.created = new Date();
  for (const source of sheets) {
    const bounds = usedBounds(source);
    const worksheet = workbook.addWorksheet(sanitizeSheetName(source.name));
    for (let row = 0; row < bounds.rows; row += 1) {
      for (let col = 0; col < bounds.cols; col += 1) {
        const raw = gridCellValue(source, row, col);
        const format = gridDisplayFormat(source, row, col);
        const target = worksheet.getCell(row + 1, col + 1);
        if (raw.startsWith("=")) {
          const result = evaluateGridCell(source.rows, row, col);
          target.value = {
            formula: raw.slice(1),
            result:
              typeof result === "number" || typeof result === "string"
                ? result
                : 0,
          };
        } else {
          target.value = exportValue(raw, format) as string | number | Date;
        }
        const decimals = Math.max(0, Math.min(8, format.decimals ?? 2));
        if (format.type === "currency") {
          target.numFmt = `¥#,##0${decimals ? `.${"0".repeat(decimals)}` : ""}`;
        } else if (format.type === "percent") {
          target.numFmt = `0${decimals ? `.${"0".repeat(decimals)}` : ""}%`;
        } else if (format.type === "date") {
          target.numFmt = "yyyy-mm-dd";
        } else if (format.type === "number") {
          target.numFmt = `0${decimals ? `.${"0".repeat(decimals)}` : ""}`;
        }
        if (format.bold || format.color) {
          target.font = {
            bold: Boolean(format.bold),
            ...(excelColor(format.color)
              ? { color: excelColor(format.color) }
              : {}),
          };
        }
        if (format.align) {
          target.alignment = { horizontal: format.align, vertical: "middle" };
        }
        const background = excelColor(format.background);
        if (background) {
          target.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: background,
          };
        }
      }
    }
    // Merge after assigning values. In ExcelJS, writing a merged slave cell
    // redirects to the master and would otherwise overwrite its content.
    for (const merge of source.merges) {
      worksheet.mergeCells(
        merge.firstRow + 1,
        merge.firstCol + 1,
        merge.lastRow + 1,
        merge.lastCol + 1,
      );
    }
    if (headerRow && bounds.cols > 0) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, bounds.rows), column: bounds.cols },
      };
      worksheet.views = [{ state: "frozen", ySplit: 1 }];
    }
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ------------------------------------------------------------------------- *
 * `oceanleo.grid.v1` emit pipeline — spec §3.2 / §5.1 / §8
 *
 * The `<f>` + `<v>` pairing below is the whole reason this path exists. Our own
 * cover renderer is LibreOffice headless, which never recalculates an xlsx and
 * reads only the cached `<v>`; a workbook emitted with formulas but no cache
 * therefore renders as a wall of zeroes on the first screen and in the preview
 * image. That is the "hollow" look this carrier is meant to end, so
 * `computed → emitted` refuses to run until every formula has a cache value.
 * ------------------------------------------------------------------------- */

export const GRID_XLSX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type GridPipelineState =
  | "empty"
  | "ir-validated"
  | "formula-linked"
  | "computed"
  | "emitted"
  | "ready"
  | "invalid"
  | "cyclic";

export const GRID_PIPELINE_STATES: readonly GridPipelineState[] = [
  "empty",
  "ir-validated",
  "formula-linked",
  "computed",
  "emitted",
  "ready",
  "invalid",
  "cyclic",
];

/**
 * §3.2 "非法迁移". Recorded as data so the contract test can assert that no run
 * of the pipeline ever produces one of them — in particular
 * `ir-validated → emitted` (skips linking and evaluation, ships an all-zero
 * first screen) and `empty → ready` (the 194–199 B shell's production path).
 */
export const GRID_ILLEGAL_TRANSITIONS: readonly (readonly [
  GridPipelineState,
  GridPipelineState,
])[] = [
  ["ir-validated", "emitted"],
  ["cyclic", "computed"],
  ["cyclic", "ready"],
  ["formula-linked", "ready"],
  ["empty", "ready"],
];

const LEGAL_TRANSITIONS: readonly (readonly [
  GridPipelineState,
  GridPipelineState,
])[] = [
  ["empty", "ir-validated"],
  ["empty", "invalid"],
  ["ir-validated", "formula-linked"],
  ["ir-validated", "invalid"],
  ["formula-linked", "cyclic"],
  ["formula-linked", "computed"],
  ["formula-linked", "invalid"],
  ["computed", "emitted"],
  ["computed", "invalid"],
  ["emitted", "ready"],
  ["emitted", "invalid"],
];

export function isLegalGridTransition(
  from: GridPipelineState,
  to: GridPipelineState,
): boolean {
  return LEGAL_TRANSITIONS.some(
    (entry) => entry[0] === from && entry[1] === to,
  );
}

export interface GridPipelineTransition {
  from: GridPipelineState;
  to: GridPipelineState;
  trigger: string;
}

export interface GridPipelineIssue {
  code: string;
  message: string;
  path?: string;
}

export interface GridCompleteness {
  ok: boolean;
  sheetCount: number;
  cellCount: number;
  maxDataRows: number;
  minColumns: number;
  formulaCells: number;
  formulaRatioPercent: number;
  cachedFormulaCells: number;
  totalRows: number;
  attributionEntries: number;
  titleLength: number;
  failures: GridPipelineIssue[];
}

export interface GridDeadTableProbe {
  sheet: string;
  address: string;
  before: GridFormulaScalar;
  probe: GridFormulaScalar;
  changedFormulas: string[];
}

export interface GridDeadTableProof {
  ok: boolean;
  probes: GridDeadTableProbe[];
  inertCells: string[];
}

export interface GridXlsxEntry {
  name: string;
  data: string;
}

export interface GridPipelineResult {
  state: GridPipelineState;
  transitions: GridPipelineTransition[];
  issues: GridPipelineIssue[];
  project?: GridIrProject;
  /** IR with every `{f}` carrying a recomputed `v` (§3.2 `computed`). */
  computed?: GridIrProject;
  irBytes?: number;
  /** Ordered OOXML parts; the same shape `zipBuffer`/`zipSync` consumes. */
  parts?: GridXlsxEntry[];
  xlsxBytes?: Uint8Array;
  completeness?: GridCompleteness;
  liveness?: GridDeadTableProof;
  /** §6 F4 requires the full address chain of the cycle, not just a flag. */
  cycle?: string[];
}

function xmlText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Control characters are illegal in XML 1.0 and make Excel show a repair
    // prompt, which §9 C-8 forbids.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function isFormulaCell(
  cell: GridIrCell,
): cell is { f: string; v?: number | string | boolean } {
  return cell !== null && typeof cell === "object";
}

/** IR grid (header row excluded) projected into the evaluator's string grid. */
function evaluationRows(sheet: GridIrSheet): string[][] {
  const header = sheet.headerRow
    ? [sheet.columns.map((column) => column.name)]
    : [];
  const body = sheet.rows.map((row) =>
    row.map((cell) => {
      if (cell === null) return "";
      if (isFormulaCell(cell)) return `=${cell.f.replace(/^=/, "")}`;
      if (typeof cell === "boolean") return cell ? "TRUE" : "FALSE";
      return String(cell);
    }),
  );
  return [...header, ...body];
}

function rowOffset(sheet: GridIrSheet): number {
  return sheet.headerRow ? 1 : 0;
}

function cellAddress(sheet: GridIrSheet, row: number, col: number): string {
  return `${sheet.name}!${gridColumnName(col)}${row + rowOffset(sheet) + 1}`;
}

interface Workbook {
  rowsBySheet: Record<string, string[][]>;
  namedRanges: Record<string, string>;
}

function buildWorkbook(project: GridIrProject): Workbook {
  const rowsBySheet: Record<string, string[][]> = {};
  for (const sheet of project.sheets) {
    rowsBySheet[sheet.name] = evaluationRows(sheet);
  }
  const namedRanges: Record<string, string> = {};
  for (const entry of project.namedRanges || []) {
    namedRanges[entry.name] = entry.ref;
  }
  return { rowsBySheet, namedRanges };
}

/**
 * §3.2 `ir-validated → formula-linked`: every `{f}` reference must resolve
 * inside this workbook or through `namedRanges`. A reference to a sheet that is
 * not in the package is `invalid`, not a runtime `#REF!` for the reader to find.
 */
function linkFormulas(
  project: GridIrProject,
  workbook: Workbook,
): GridPipelineIssue[] {
  const issues: GridPipelineIssue[] = [];
  const sheetNames = new Set(
    project.sheets.map((sheet) => sheet.name.toLowerCase()),
  );
  project.sheets.forEach((sheet, sheetIndex) => {
    sheet.rows.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (!isFormulaCell(cell)) return;
        const path = `/sheets/${sheetIndex}/rows/${rowIndex}/${colIndex}`;
        const address = cellAddress(sheet, rowIndex, colIndex);
        const inspection = inspectGridFormula(cell.f);
        for (const violation of inspection.violations) {
          issues.push({
            code: violation.code,
            message: `${address}：${violation.detail}`,
            path,
          });
        }
        for (const qualified of inspection.qualifiedReferences) {
          const name = qualified
            .slice(0, qualified.indexOf("!"))
            .replace(/^'|'$/g, "")
            .toLowerCase();
          if (!sheetNames.has(name)) {
            issues.push({
              code: "grid-formula-unknown-sheet",
              message: `${address}：引用了不存在的工作表 ${qualified}`,
              path,
            });
          }
        }
        for (const name of inspection.names) {
          if (!(name in workbook.namedRanges)) {
            const matched = Object.keys(workbook.namedRanges).some(
              (candidate) => candidate.toUpperCase() === name,
            );
            if (!matched) {
              issues.push({
                code: "grid-formula-unknown-name",
                message: `${address}：${name} 既不是单元格也不是 namedRanges 条目`,
                path,
              });
            }
          }
        }
        for (const reference of inspection.references) {
          const position = parseGridReference(reference);
          const rows = workbook.rowsBySheet[sheet.name] || [];
          if (
            !position ||
            position.row < 0 ||
            position.row >= Math.max(rows.length, 1) ||
            position.col >= GRID_CONSTANTS.C5_maxColumns
          ) {
            issues.push({
              code: "grid-formula-out-of-range",
              message: `${address}：引用 ${reference} 落在工作表之外`,
              path,
            });
          }
        }
      });
    });
  });
  return issues;
}

/**
 * §3.2 `formula-linked → cyclic`. Returns the full address chain so §6 F4's
 * "MUST print the complete cell address sequence" holds; a bare boolean leaves
 * the author guessing which of interest → net income → cash → debt closed the
 * loop.
 */
function findCycle(
  project: GridIrProject,
  workbook: Workbook,
): string[] | null {
  const dependencies = new Map<string, string[]>();
  const label = new Map<string, string>();
  for (const sheet of project.sheets) {
    const offset = rowOffset(sheet);
    sheet.rows.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const key = `${sheet.name.toLowerCase()}!${rowIndex + offset}:${colIndex}`;
        label.set(key, cellAddress(sheet, rowIndex, colIndex));
        if (!isFormulaCell(cell)) return;
        const inspection = inspectGridFormula(cell.f);
        const targets: string[] = [];
        const push = (sheetName: string, reference: string) => {
          const position = parseGridReference(reference);
          if (position) {
            targets.push(
              `${sheetName.toLowerCase()}!${position.row}:${position.col}`,
            );
          }
        };
        for (const reference of inspection.references) {
          push(sheet.name, reference);
        }
        for (const qualified of inspection.qualifiedReferences) {
          const separator = qualified.indexOf("!");
          push(
            qualified.slice(0, separator).replace(/^'|'$/g, ""),
            qualified.slice(separator + 1),
          );
        }
        for (const range of inspection.ranges) {
          const [first, last] = range.split(":");
          const firstBody = first.includes("!")
            ? first.slice(first.indexOf("!") + 1)
            : first;
          const sheetName = first.includes("!")
            ? first.slice(0, first.indexOf("!")).replace(/^'|'$/g, "")
            : sheet.name;
          const start = parseGridReference(firstBody);
          const end = parseGridReference(
            last.includes("!") ? last.slice(last.indexOf("!") + 1) : last,
          );
          if (!start || !end) continue;
          for (
            let row = Math.min(start.row, end.row);
            row <= Math.max(start.row, end.row);
            row += 1
          ) {
            for (
              let col = Math.min(start.col, end.col);
              col <= Math.max(start.col, end.col);
              col += 1
            ) {
              targets.push(`${sheetName.toLowerCase()}!${row}:${col}`);
            }
          }
        }
        dependencies.set(key, targets);
      });
    });
  }
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const walk = (key: string): string[] | null => {
    if (state.get(key) === 2) return null;
    if (state.get(key) === 1) {
      const start = stack.indexOf(key);
      return [...stack.slice(start), key].map(
        (entry) => label.get(entry) || entry,
      );
    }
    if (stack.length > GRID_FORMULA_MAX_DEPTH) {
      return [...stack, key].map((entry) => label.get(entry) || entry);
    }
    state.set(key, 1);
    stack.push(key);
    for (const target of dependencies.get(key) || []) {
      const found = walk(target);
      if (found) return found;
    }
    stack.pop();
    state.set(key, 2);
    return null;
  };
  void workbook;
  for (const key of dependencies.keys()) {
    const found = walk(key);
    if (found) return found;
  }
  return null;
}

/**
 * §3.2 `formula-linked → computed`: fill every `{f}` with a cache value `v`.
 * An evaluation that lands on an Excel error code fails the run instead of
 * being written out — §5.3 forbids `#DIV/0!` in a delivered artifact.
 */
function computeCachedValues(
  project: GridIrProject,
  workbook: Workbook,
): { computed: GridIrProject; issues: GridPipelineIssue[] } {
  const issues: GridPipelineIssue[] = [];
  const computed: GridIrProject = {
    ...project,
    sheets: project.sheets.map((sheet, sheetIndex) => {
      const rows = workbook.rowsBySheet[sheet.name];
      const offset = rowOffset(sheet);
      return {
        ...sheet,
        rows: sheet.rows.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            if (!isFormulaCell(cell)) return cell;
            const result = evaluateGridCellTypedInWorkbook(
              rows,
              rowIndex + offset,
              colIndex,
              sheet.name,
              workbook,
            );
            if (!result.ok) {
              issues.push({
                code: "grid-formula-error-value",
                message: `${cellAddress(sheet, rowIndex, colIndex)}：求值得到 ${result.value}，§5.3 禁止把错误值交付`,
                path: `/sheets/${sheetIndex}/rows/${rowIndex}/${colIndex}`,
              });
              return cell;
            }
            return { f: cell.f.replace(/^=/, ""), v: result.value };
          }),
        ),
      };
    }),
  };
  return { computed, issues };
}

function evaluateGridCellTypedInWorkbook(
  rows: string[][],
  row: number,
  col: number,
  sheetName: string,
  workbook: Workbook,
): { ok: boolean; value: GridFormulaScalar } {
  const value = evaluateGridCell(rows, row, col, {
    namedRanges: workbook.namedRanges,
    workbook: workbook.rowsBySheet,
    sheetName,
  });
  const failed = typeof value === "string" && /^#[A-Z0-9/!?]+$/.test(value);
  if (failed) return { ok: false, value };
  if (value === "TRUE") return { ok: true, value: true };
  if (value === "FALSE") return { ok: true, value: false };
  return { ok: true, value };
}

/** §8.2 content-completeness table. Every row of it is a MUST. */
export function judgeGridCompleteness(
  project: GridIrProject,
): GridCompleteness {
  const failures: GridPipelineIssue[] = [];
  let cellCount = 0;
  let formulaCells = 0;
  let cachedFormulaCells = 0;
  let totalRows = 0;
  let maxDataRows = 0;
  let minColumns = Number.POSITIVE_INFINITY;
  for (const sheet of project.sheets) {
    maxDataRows = Math.max(maxDataRows, sheet.rows.length);
    minColumns = Math.min(minColumns, sheet.columns.length);
    totalRows += (sheet.emphasisRows || []).filter(
      (entry) => entry.kind === "total",
    ).length;
    for (const row of sheet.rows) {
      for (const cell of row) {
        if (cell === null) continue;
        cellCount += 1;
        if (!isFormulaCell(cell)) continue;
        formulaCells += 1;
        if (cell.v !== undefined) cachedFormulaCells += 1;
      }
    }
  }
  if (!Number.isFinite(minColumns)) minColumns = 0;
  const formulaRatioPercent = cellCount
    ? (formulaCells / cellCount) * 100
    : 0;
  const require = (condition: boolean, code: string, message: string) => {
    if (!condition) failures.push({ code, message });
  };
  require(
    project.sheets.length >= GRID_CONSTANTS.C1_minSheets,
    "grid-hollow",
    `sheetCount ${project.sheets.length} < ${GRID_CONSTANTS.C1_minSheets}`,
  );
  require(
    cellCount >= GRID_CONSTANTS.C8_minCellCount,
    "grid-hollow",
    `cellCount ${cellCount} < ${GRID_CONSTANTS.C8_minCellCount}（§8.2 / catalog:2767）`,
  );
  require(
    maxDataRows >= GRID_CONSTANTS.C6_minDataRows,
    "grid-hollow",
    `数据行数 ${maxDataRows} < ${GRID_CONSTANTS.C6_minDataRows}（§4 C6）`,
  );
  require(
    minColumns >= GRID_CONSTANTS.C4_minColumns,
    "grid-hollow",
    `列数 ${minColumns} < ${GRID_CONSTANTS.C4_minColumns}（§4 C4）`,
  );
  require(
    formulaCells >= GRID_CONSTANTS.C9_minFormulaCells,
    "grid-dead-table",
    `公式单元格 ${formulaCells} < ${GRID_CONSTANTS.C9_minFormulaCells}（§6 F2 死表）`,
  );
  require(
    formulaRatioPercent >= GRID_CONSTANTS.C10_minFormulaRatioPercent,
    "grid-dead-table",
    `公式占比 ${formulaRatioPercent.toFixed(2)}% < ${GRID_CONSTANTS.C10_minFormulaRatioPercent}%（§4 C10）`,
  );
  require(
    formulaCells > 0 && cachedFormulaCells === formulaCells,
    "grid-missing-cache",
    `${formulaCells - cachedFormulaCells} 个公式没有缓存值 v（§6 F3；LibreOffice 首屏会渲染 0）`,
  );
  require(
    totalRows >= 1,
    "grid-no-total-row",
    "emphasisRows 中没有 kind = total 的行（§8.2：无合计行不构成台账）",
  );
  require(
    project.attribution.entries.length >= 1,
    "grid-no-attribution",
    "attribution.entries 为空（§7 A8/A9）",
  );
  require(
    project.title.length >= 8,
    "grid-title-too-short",
    `title 长度 ${project.title.length} < 8（catalog:3309）`,
  );
  return {
    ok: failures.length === 0,
    sheetCount: project.sheets.length,
    cellCount,
    maxDataRows,
    minColumns,
    formulaCells,
    formulaRatioPercent,
    cachedFormulaCells,
    totalRows,
    attributionEntries: project.attribution.entries.length,
    titleLength: project.title.length,
    failures,
  };
}

const NUMERIC_COLUMN_TYPES = new Set(["number", "integer", "currency", "percent"]);

/**
 * §5.1 made executable. For every numeric input cell, nudge it and recompute:
 * unless at least one formula's cache value moves, the reader can change a
 * number and watch the total sit still — R3's "死表". Text and date columns are
 * out of scope because "改一个数字" is what the spec is describing.
 */
export function proveGridIsNotDeadTable(
  project: GridIrProject,
): GridDeadTableProof {
  const workbook = buildWorkbook(project);
  const baseline = new Map<string, GridFormulaScalar>();
  const formulaCells: {
    sheet: GridIrSheet;
    row: number;
    col: number;
  }[] = [];
  for (const sheet of project.sheets) {
    const offset = rowOffset(sheet);
    sheet.rows.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (!isFormulaCell(cell)) return;
        formulaCells.push({ sheet, row: rowIndex, col: colIndex });
        baseline.set(
          cellAddress(sheet, rowIndex, colIndex),
          evaluateGridCell(
            workbook.rowsBySheet[sheet.name],
            rowIndex + offset,
            colIndex,
            {
              namedRanges: workbook.namedRanges,
              workbook: workbook.rowsBySheet,
              sheetName: sheet.name,
            },
          ),
        );
      });
    });
  }
  const probes: GridDeadTableProbe[] = [];
  const inertCells: string[] = [];
  for (const sheet of project.sheets) {
    const offset = rowOffset(sheet);
    const rows = workbook.rowsBySheet[sheet.name];
    sheet.rows.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (isFormulaCell(cell) || cell === null) return;
        if (!NUMERIC_COLUMN_TYPES.has(sheet.columns[colIndex]?.type || "")) {
          return;
        }
        const original = rows[rowIndex + offset][colIndex];
        const numeric = Number(String(original).replace(/,/g, ""));
        if (!Number.isFinite(numeric)) return;
        const probeValue = numeric + (numeric === 0 ? 7 : Math.abs(numeric));
        rows[rowIndex + offset][colIndex] = String(probeValue);
        const changed: string[] = [];
        for (const target of formulaCells) {
          const address = cellAddress(target.sheet, target.row, target.col);
          const next = evaluateGridCell(
            workbook.rowsBySheet[target.sheet.name],
            target.row + rowOffset(target.sheet),
            target.col,
            {
              namedRanges: workbook.namedRanges,
              workbook: workbook.rowsBySheet,
              sheetName: target.sheet.name,
            },
          );
          if (next !== baseline.get(address)) changed.push(address);
        }
        rows[rowIndex + offset][colIndex] = original;
        const address = cellAddress(sheet, rowIndex, colIndex);
        probes.push({
          sheet: sheet.name,
          address,
          before: numeric,
          probe: probeValue,
          changedFormulas: changed,
        });
        if (changed.length === 0) inertCells.push(address);
      });
    });
  }
  return {
    ok: probes.length > 0 && inertCells.length === 0,
    probes,
    inertCells,
  };
}

/* ---------------------------- OOXML emission ---------------------------- */

const SPREADSHEET_NS =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIP_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** OOXML column width is in characters; the §2.2 table is in px. */
function columnWidthChars(px: number): number {
  return Math.round(((px - 5) / 7) * 100) / 100;
}

/** OOXML `sz` is in points; §2.3 is in px at 96 dpi. */
function pointSize(px: number): number {
  return Math.round(px * 0.75 * 100) / 100;
}

const NUMBER_FORMATS: readonly { id: number; code: string }[] = [
  { id: 164, code: "&#165;#,##0.00" },
  { id: 165, code: "0.00%" },
  { id: 166, code: "#,##0" },
  { id: 167, code: "#,##0.00" },
  { id: 168, code: "yyyy\\-mm\\-dd" },
];

type CellRole = "header" | "body" | "formula" | "total" | "negative" | "caption";

/**
 * Style table. The order of `fonts` / `fills` / `borders` / `cellXfs` is load
 * bearing in SpreadsheetML — the `xf` records address these by index, and fill
 * indexes 0 and 1 are reserved for `none` and `gray125` by the format, so
 * omitting them shifts every later index and Excel offers to repair the file.
 */
function stylesXml(): string {
  const fonts = [
    `<font><sz val="${pointSize(GRID_FONT_SCALE.cell)}"/><color rgb="FF${GRID_PALETTE.text.slice(1)}"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="${pointSize(GRID_FONT_SCALE.header)}"/><color rgb="FF${GRID_PALETTE.headerText.slice(1)}"/><name val="Calibri"/></font>`,
    `<font><sz val="${pointSize(GRID_FONT_SCALE.cell)}"/><color rgb="FF${GRID_PALETTE.formula.slice(1)}"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="${pointSize(GRID_FONT_SCALE.total)}"/><color rgb="FF${GRID_PALETTE.total.slice(1)}"/><name val="Calibri"/></font>`,
    `<font><sz val="${pointSize(GRID_FONT_SCALE.cell)}"/><color rgb="FF${GRID_PALETTE.negative.slice(1)}"/><name val="Calibri"/></font>`,
    `<font><sz val="${pointSize(GRID_FONT_SCALE.caption)}"/><color rgb="FF${GRID_PALETTE.text.slice(1)}"/><name val="Calibri"/></font>`,
  ];
  const fills = [
    "<fill><patternFill patternType=\"none\"/></fill>",
    "<fill><patternFill patternType=\"gray125\"/></fill>",
    `<fill><patternFill patternType="solid"><fgColor rgb="FF${GRID_PALETTE.headerFill.slice(1)}"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="FF${GRID_PALETTE.zebra.slice(1)}"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="FF${GRID_PALETTE.surface.slice(1)}"/><bgColor indexed="64"/></patternFill></fill>`,
  ];
  const line = `<left style="thin"><color rgb="FF${GRID_PALETTE.border.slice(1)}"/></left><right style="thin"><color rgb="FF${GRID_PALETTE.border.slice(1)}"/></right><top style="thin"><color rgb="FF${GRID_PALETTE.border.slice(1)}"/></top><bottom style="thin"><color rgb="FF${GRID_PALETTE.border.slice(1)}"/></bottom>`;
  const borders = [
    "<border><left/><right/><top/><bottom/><diagonal/></border>",
    `<border>${line}<diagonal/></border>`,
  ];
  const xfs: string[] = [];
  // Index layout consumed by `styleIndex()`: role-major, zebra-minor, then the
  // five number formats. Keeping the arithmetic in one place is what stops a
  // silent one-off from repainting the total row as a negative value.
  const roles: CellRole[] = [
    "header",
    "body",
    "formula",
    "total",
    "negative",
    "caption",
  ];
  const fontFor: Record<CellRole, number> = {
    header: 1,
    body: 0,
    formula: 2,
    total: 3,
    negative: 4,
    caption: 5,
  };
  for (const role of roles) {
    for (const zebra of [false, true]) {
      for (const numFmt of [0, ...NUMBER_FORMATS.map((entry) => entry.id)]) {
        const fill = role === "header" ? 2 : zebra ? 3 : 4;
        const alignment =
          role === "header"
            ? '<alignment horizontal="center" vertical="center" wrapText="1"/>'
            : numFmt === 0
              ? '<alignment horizontal="left" vertical="center"/>'
              : '<alignment horizontal="right" vertical="center"/>';
        xfs.push(
          `<xf numFmtId="${numFmt}" fontId="${fontFor[role]}" fillId="${fill}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${numFmt ? ' applyNumberFormat="1"' : ""}>${alignment}</xf>`,
        );
      }
    }
  }
  return `${XML_HEAD}<styleSheet xmlns="${SPREADSHEET_NS}"><numFmts count="${NUMBER_FORMATS.length}">${NUMBER_FORMATS.map(
    (entry) => `<numFmt numFmtId="${entry.id}" formatCode="${entry.code}"/>`,
  ).join(
    "",
  )}</numFmts><fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="${borders.length}">${borders.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

const ROLE_ORDER: readonly CellRole[] = [
  "header",
  "body",
  "formula",
  "total",
  "negative",
  "caption",
];
const NUM_FMT_SLOTS = NUMBER_FORMATS.length + 1;

function styleIndex(role: CellRole, zebra: boolean, numFmtId: number): number {
  const roleIndex = ROLE_ORDER.indexOf(role);
  const slot =
    numFmtId === 0
      ? 0
      : NUMBER_FORMATS.findIndex((entry) => entry.id === numFmtId) + 1;
  return (
    roleIndex * 2 * NUM_FMT_SLOTS +
    (zebra ? NUM_FMT_SLOTS : 0) +
    Math.max(0, slot)
  );
}

function numberFormatFor(column: GridIrColumn | undefined): number {
  if (!column) return 0;
  if (column.type === "currency") return 164;
  if (column.type === "percent") return 165;
  if (column.type === "integer") return 166;
  if (column.type === "number") return 167;
  if (column.type === "date") return 168;
  return 0;
}

function cellXml(
  reference: string,
  cell: GridIrCell,
  style: number,
): string {
  if (cell === null) return `<c r="${reference}" s="${style}"/>`;
  if (isFormulaCell(cell)) {
    // `<f>` carries no leading `=`. The cache `<v>` is mandatory here; the
    // caller has already refused to reach this point without it.
    const formula = xmlText(cell.f.replace(/^=/, ""));
    if (typeof cell.v === "number") {
      return `<c r="${reference}" s="${style}"><f>${formula}</f><v>${cell.v}</v></c>`;
    }
    if (typeof cell.v === "boolean") {
      return `<c r="${reference}" s="${style}" t="b"><f>${formula}</f><v>${cell.v ? 1 : 0}</v></c>`;
    }
    // A string cache must be tagged `t="str"`; without the tag Excel reads the
    // text as a number and shows a repair prompt.
    return `<c r="${reference}" s="${style}" t="str"><f>${formula}</f><v>${xmlText(cell.v ?? "")}</v></c>`;
  }
  if (typeof cell === "number") {
    return `<c r="${reference}" s="${style}"><v>${cell}</v></c>`;
  }
  if (typeof cell === "boolean") {
    return `<c r="${reference}" s="${style}" t="b"><v>${cell ? 1 : 0}</v></c>`;
  }
  // `inlineStr` keeps the package free of `xl/sharedStrings.xml`, matching the
  // generator's choice so both writers produce the same part list.
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(cell)}</t></is></c>`;
}

function worksheetXml(sheet: GridIrSheet): string {
  const offset = rowOffset(sheet);
  const totalRows = new Set(
    (sheet.emphasisRows || [])
      .filter((entry) => entry.kind === "total" || entry.kind === "subtotal")
      .map((entry) => entry.index),
  );
  const lines: string[] = [];
  if (sheet.headerRow) {
    lines.push(
      `<row r="1" ht="${pointSize(GRID_LAYOUT.headerRowHeightPx)}" customHeight="1">${sheet.columns
        .map((column, col) =>
          cellXml(
            `${gridColumnName(col)}1`,
            column.name,
            styleIndex("header", false, 0),
          ),
        )
        .join("")}</row>`,
    );
  }
  sheet.rows.forEach((row, rowIndex) => {
    const sheetRow = rowIndex + offset + 1;
    // Zebra follows the visual row parity so `grid.zebra` lands on even rows,
    // which is the pairing the 3.41:1 gridline measurement in §2.1 assumes.
    const zebra = sheetRow % 2 === 0;
    const isTotal = totalRows.has(rowIndex);
    lines.push(
      `<row r="${sheetRow}" ht="${pointSize(GRID_LAYOUT.rowHeightPx)}" customHeight="1">${row
        .map((cell, col) => {
          const column = sheet.columns[col];
          const numFmt = numberFormatFor(column);
          const negative =
            typeof cell === "number"
              ? cell < 0
              : isFormulaCell(cell) && typeof cell.v === "number" && cell.v < 0;
          const role: CellRole = isTotal
            ? "total"
            : negative
              ? "negative"
              : isFormulaCell(cell)
                ? "formula"
                : "body";
          return cellXml(
            `${gridColumnName(col)}${sheetRow}`,
            cell,
            styleIndex(role, zebra, numFmt),
          );
        })
        .join("")}</row>`,
    );
  });
  const lastColumn = gridColumnName(Math.max(0, sheet.columns.length - 1));
  const lastRow = sheet.rows.length + offset;
  const freeze = sheet.freezePanes || {};
  const frozenRows = freeze.rows ?? (sheet.headerRow ? GRID_LAYOUT.frozenRows : 0);
  const frozenCols = freeze.cols ?? 0;
  // SC 1.3.1: the frozen pane plus the bold header row is what makes the header
  // programmatically determinable in the xlsx byte form.
  const pane =
    frozenRows || frozenCols
      ? `<pane${frozenCols ? ` xSplit="${frozenCols}"` : ""}${frozenRows ? ` ySplit="${frozenRows}"` : ""} topLeftCell="${gridColumnName(frozenCols)}${frozenRows + 1}" activePane="bottomRight" state="frozen"/>`
      : "";
  const cols = sheet.columns
    .map(
      (column, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${columnWidthChars(column.widthPx ?? GRID_LAYOUT.defaultColumnWidthPx)}" customWidth="1"/>`,
    )
    .join("");
  return `${XML_HEAD}<worksheet xmlns="${SPREADSHEET_NS}" xmlns:r="${RELATIONSHIP_NS}"><sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr><dimension ref="A1:${lastColumn}${Math.max(1, lastRow)}"/><sheetViews><sheetView workbookViewId="0"${sheet.headerRow ? ' tabSelected="0"' : ""}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="${pointSize(GRID_LAYOUT.rowHeightPx)}"/><cols>${cols}</cols><sheetData>${lines.join("")}</sheetData></worksheet>`;
}

function attributionSheet(project: GridIrProject): GridIrSheet {
  const rows: GridIrCell[][] = project.attribution.entries.map((entry) => [
    entry.text,
    entry.licenseCode,
    entry.licenseUrl,
  ]);
  // §8.2 wants at least four data rows on any sheet; pad with the workbook's
  // own provenance rather than blank filler so the sheet stays informative.
  while (rows.length < GRID_CONSTANTS.C6_minDataRows) {
    rows.push([
      rows.length === project.attribution.entries.length
        ? `工程结构：oceanleo.grid.v1 · ${project.sheets.length} 张工作表`
        : `标题：${project.title}`,
      "OceanLeo",
      "https://oceanleo.com/licenses",
    ]);
  }
  return {
    name: "署名",
    headerRow: true,
    freezePanes: { rows: 1, cols: 0 },
    columns: [
      { name: "来源与署名", type: "text", widthPx: 360 },
      { name: "许可代码", type: "text", widthPx: 180 },
      { name: "许可链接", type: "text", widthPx: 360 },
    ],
    rows,
  };
}

function corePropertiesXml(project: GridIrProject): string {
  const licences = project.attribution.entries
    .map((entry) => entry.licenseCode)
    .join("; ");
  const description = project.attribution.entries
    .map((entry) => `${entry.text}（${entry.licenseCode} ${entry.licenseUrl}）`)
    .join(" / ");
  return `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlText(project.title)}</dc:title><dc:creator>OceanLeo</dc:creator><cp:lastModifiedBy>OceanLeo</cp:lastModifiedBy><dc:description>${xmlText(description)}</dc:description><cp:keywords>${xmlText(licences)}</cp:keywords><cp:category>oceanleo.grid.v1</cp:category></cp:coreProperties>`;
}

/**
 * ECMA-376 core properties have no `dc:rights` element, so the licence cannot
 * ride along there. `docProps/custom.xml` is the only part that accepts
 * arbitrary named properties, which is why §7 A9 ("署名随产物") is satisfied
 * here and in the 署名 worksheet rather than in `core.xml` alone.
 */
function customPropertiesXml(project: GridIrProject): string {
  const properties = [
    ["License", project.attribution.entries.map((entry) => entry.licenseCode).join("; ")],
    ["LicenseUrl", project.attribution.entries.map((entry) => entry.licenseUrl).join(" ")],
    ["Attribution", project.attribution.entries.map((entry) => entry.text).join(" / ")],
    ["ProjectSchema", "oceanleo.grid.v1"],
  ];
  return `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${properties
    .map(
      ([name, value], index) =>
        `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${index + 2}" name="${xmlText(name)}"><vt:lpwstr>${xmlText(value)}</vt:lpwstr></property>`,
    )
    .join("")}</Properties>`;
}

function appPropertiesXml(project: GridIrProject, sheetNames: string[]): string {
  return `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>OceanLeo Grid</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>工作表</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheetNames.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${sheetNames
    .map((name) => `<vt:lpstr>${xmlText(name)}</vt:lpstr>`)
    .join(
      "",
    )}</vt:vector></TitlesOfParts><Company>OceanLeo</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion><Manager>${xmlText(project.title)}</Manager></Properties>`;
}

/**
 * Assemble the full part list. Every part that is written also gets its
 * `[Content_Types].xml` Override and its relationship entry — an orphan part
 * (present in the zip, absent from Content_Types or from the rels graph) is
 * exactly what makes Excel show the "found unreadable content" prompt that §9
 * C-8 forbids.
 */
export function buildGridXlsxParts(project: GridIrProject): GridXlsxEntry[] {
  const sheets = [...project.sheets];
  if (sheets.length < GRID_CONSTANTS.C2_maxSheets) {
    sheets.push(attributionSheet(project));
  }
  const sheetNames = sheets.map((sheet) => sheet.name);
  const definedNames = (project.namedRanges || [])
    .map(
      (entry) =>
        `<definedName name="${xmlText(entry.name)}">${xmlText(entry.ref.replace(/^([A-Za-z0-9_]+)!/, "$1!$"))}</definedName>`,
    )
    .join("");
  const sheetParts = sheets.map((sheet, index) => ({
    name: `xl/worksheets/sheet${index + 1}.xml`,
    data: worksheetXml(sheet),
  }));
  const overrides = [
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...sheetParts.map(
      (part) =>
        `<Override PartName="/${part.name}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    ),
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>',
  ].join("");
  const workbookRels = [
    ...sheetParts.map(
      (part, index) =>
        `<Relationship Id="rId${index + 1}" Type="${RELATIONSHIP_NS}/worksheet" Target="${part.name.replace("xl/", "")}"/>`,
    ),
    `<Relationship Id="rId${sheetParts.length + 1}" Type="${RELATIONSHIP_NS}/styles" Target="styles.xml"/>`,
  ].join("");
  return [
    {
      name: "[Content_Types].xml",
      data: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELATIONSHIP_NS}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${RELATIONSHIP_NS}/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId4" Type="${RELATIONSHIP_NS}/custom-properties" Target="docProps/custom.xml"/></Relationships>`,
    },
    { name: "docProps/core.xml", data: corePropertiesXml(project) },
    { name: "docProps/app.xml", data: appPropertiesXml(project, sheetNames) },
    { name: "docProps/custom.xml", data: customPropertiesXml(project) },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`,
    },
    {
      // `fullCalcOnLoad="1"` makes Excel and WPS recalculate on open so the
      // formulas stay authoritative. LibreOffice ignores it and trusts `<v>`,
      // which is why the cache still has to be correct.
      name: "xl/workbook.xml",
      data: `${XML_HEAD}<workbook xmlns="${SPREADSHEET_NS}" xmlns:r="${RELATIONSHIP_NS}"><workbookPr/><sheets>${sheets
        .map(
          (sheet, index) =>
            `<sheet name="${xmlText(sanitizeSheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
        )
        .join("")}</sheets>${definedNames ? `<definedNames>${definedNames}</definedNames>` : ""}<calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`,
    },
    { name: "xl/styles.xml", data: stylesXml() },
    ...sheetParts,
  ];
}

/** Fixed zip timestamp: identical input must produce identical bytes (§6 F7). */
const DETERMINISTIC_MTIME = new Date("2026-01-01T00:00:00Z");

export function zipGridXlsxParts(parts: readonly GridXlsxEntry[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const part of parts) files[part.name] = strToU8(part.data);
  return zipSync(files, { level: 6, mtime: DETERMINISTIC_MTIME });
}

function isArrayBufferBacked(
  bytes: Uint8Array,
): bytes is Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer;
}

/**
 * A `Uint8Array` is only a `BlobPart` when its buffer is an `ArrayBuffer`; a
 * view over a `SharedArrayBuffer` is rejected by the `Blob` constructor at
 * runtime too, so the distinction is decided by an actual `instanceof` test and
 * a copy, never by an assertion that would ship the shared view to the caller.
 */
function blobBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return isArrayBufferBacked(bytes) ? bytes : new Uint8Array(bytes);
}

/**
 * §3.2 in one call. Every transition is recorded, so a caller can prove which
 * path a workbook took and that none of the five illegal transitions ran.
 */
export function runGridEmitPipeline(input: unknown): GridPipelineResult {
  const transitions: GridPipelineTransition[] = [];
  const issues: GridPipelineIssue[] = [];
  let state: GridPipelineState = "empty";
  const move = (to: GridPipelineState, trigger: string) => {
    transitions.push({ from: state, to, trigger });
    state = to;
  };

  const validation = validateGridIrProject(input);
  if (!validation.ok) {
    issues.push(
      ...validation.errors.map((error) => ({
        code: `grid-ir-${error.code}`,
        message: error.message,
        path: error.path,
      })),
    );
    move("invalid", "IR 未通过 §3.1 校验");
    return { state, transitions, issues };
  }
  const project = validation.project;
  move("ir-validated", "IR 通过 §3.1 校验");

  const workbook = buildWorkbook(project);
  const linkIssues = linkFormulas(project, workbook);
  if (linkIssues.length) {
    issues.push(...linkIssues);
    move("invalid", "公式白名单或引用解析失败");
    return { state, transitions, issues, project };
  }
  move("formula-linked", "全部 {f} 的 A1 引用可解析");

  const cycle = findCycle(project, workbook);
  if (cycle) {
    issues.push({
      code: "grid-cyclic-reference",
      message: `引用图存在环：${cycle.join(" → ")}`,
    });
    move("cyclic", "引用图存在环");
    return { state, transitions, issues, project, cycle };
  }

  const { computed, issues: computeIssues } = computeCachedValues(
    project,
    workbook,
  );
  if (computeIssues.length) {
    issues.push(...computeIssues);
    move("invalid", "求值得到错误值");
    return { state, transitions, issues, project };
  }
  move("computed", "拓扑求值成功并算出全部缓存值 v");

  const completeness = judgeGridCompleteness(computed);
  const liveness = proveGridIsNotDeadTable(computed);
  const irBytes = gridIrByteLength(computed);
  if (!completeness.ok) {
    issues.push(...completeness.failures);
    move("invalid", "§8.2 完备判据不成立");
    return {
      state,
      transitions,
      issues,
      project,
      computed,
      irBytes,
      completeness,
      liveness,
    };
  }
  if (!liveness.ok) {
    issues.push({
      code: "grid-dead-table",
      message: liveness.probes.length
        ? `改动 ${liveness.inertCells.join(" / ")} 不会让任何公式缓存值变化（§5.1）`
        : "没有可探测的数值输入单元格，无法证明重算联动（§5.1）",
    });
    move("invalid", "§5.1 不是死表的判据不成立");
    return {
      state,
      transitions,
      issues,
      project,
      computed,
      irBytes,
      completeness,
      liveness,
    };
  }

  const parts = buildGridXlsxParts(computed);
  const missingCache: string[] = [];
  for (const sheet of computed.sheets) {
    sheet.rows.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (isFormulaCell(cell) && cell.v === undefined) {
          missingCache.push(cellAddress(sheet, rowIndex, colIndex));
        }
      });
    });
  }
  if (missingCache.length) {
    issues.push({
      code: "grid-missing-cache",
      message: `${missingCache.join(" / ")} 只有 <f> 没有 <v>（§6 F3）`,
    });
    move("invalid", "缓存值缺失");
    return {
      state,
      transitions,
      issues,
      project,
      computed,
      irBytes,
      completeness,
      liveness,
    };
  }
  const xlsxBytes = zipGridXlsxParts(parts);
  move("emitted", "buildGridXlsxParts 产出 <f> + <v> 齐全的 xlsx");

  if (
    xlsxBytes.length < GRID_XLSX_MIN_BYTES ||
    xlsxBytes.length > GRID_XLSX_MAX_BYTES
  ) {
    issues.push({
      code: "grid-hollow",
      message: `xlsx ${xlsxBytes.length} B 不在 ${GRID_XLSX_MIN_BYTES}–${GRID_XLSX_MAX_BYTES} B（§8.1 / §4 C31/C32）`,
    });
    move("invalid", "字节数低于 §8.1 下限");
    return {
      state,
      transitions,
      issues,
      project,
      computed,
      irBytes,
      parts,
      xlsxBytes,
      completeness,
      liveness,
    };
  }
  if (irBytes < GRID_IR_MIN_BYTES || irBytes > GRID_IR_MAX_BYTES) {
    issues.push({
      code: "grid-hollow",
      message: `oceanleo.grid.v1 ${irBytes} B 不在 ${GRID_IR_MIN_BYTES}–${GRID_IR_MAX_BYTES} B（§8.1 / §4 C30；合同 §2.2 的空壳是 194–199 B）`,
    });
    move("invalid", "IR 字节数低于 §8.1 下限");
    return {
      state,
      transitions,
      issues,
      project,
      computed,
      irBytes,
      parts,
      xlsxBytes,
      completeness,
      liveness,
    };
  }
  move("ready", "两侧字节数都通过 §8.1 下限比对");
  return {
    state,
    transitions,
    issues,
    project,
    computed,
    irBytes,
    parts,
    xlsxBytes,
    completeness,
    liveness,
  };
}

/**
 * Spec-conforming download. Refuses rather than handing the reader a workbook
 * that opens on an all-zero first screen or an empty grid.
 */
export function buildGridCarrierWorkbookBlob(project: GridIrProject): Blob {
  const result = runGridEmitPipeline(project);
  if (result.state !== "ready" || !result.xlsxBytes) {
    throw new Error(
      `工作簿不满足 oceanleo.grid.v1（${result.state}）：${result.issues
        .slice(0, 3)
        .map((issue) => `${issue.code} ${issue.message}`)
        .join("；")}`,
    );
  }
  return new Blob([blobBytes(result.xlsxBytes)], { type: GRID_XLSX_MEDIA_TYPE });
}

/** The IR text that goes to storage as `project_schema` bytes. */
export function serializeGridCarrierProject(project: GridIrProject): string {
  return serializeGridIrProject(project);
}
