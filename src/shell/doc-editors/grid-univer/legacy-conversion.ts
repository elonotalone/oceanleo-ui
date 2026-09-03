/**
 * 存量表格在新核下的处置：**只读打开 + 一键转换**（合同 R7 / 判据 5）。
 *
 * 「不写迁移器」不等于「打不开」。它等于三件事，缺一件用户就会丢东西：
 *
 * 1. 旧文档在新核里**先是只读的**——在用户按下那一下之前，磁盘上的东西不许变；
 * 2. 转换是**用户的一个显式动作**，不是打开时的副作用；
 * 3. 转换**失败要给出原因**，而且是能照着做的原因，不是「转换失败」四个字。
 *
 * 这里只有纯函数与一台状态机，React 那边只负责把状态画出来。这样「打开旧文档
 * 会不会被静默改写」这个判据才有地方断言 —— 组件里的 `useEffect` 是断言不到的。
 */
import {
  gridSheetsToUniverSnapshot,
  type GridUniverConversionReport,
} from "./snapshot";
import type { GridSheet } from "../grid-model";
import type { IWorkbookData } from "@univerjs/presets";

/** 旧核工程档的 schema；`use-grid-editor.ts` 的 `GRID_PROJECT_SCHEMA` 就是它。 */
export const GRID_LEGACY_PROJECT_SCHEMA = "oceanleo.grid.v1";

/** 转换后写回的新 schema。两个值不同，是为了让「转过没转过」一眼可查。 */
export const GRID_UNIVER_PROJECT_SCHEMA = "oceanleo.grid.univer.v1";

/** 打开旧文档时告诉用户当前是什么状态。写成常量是为了让测试能钉住这句话在。 */
export const GRID_LEGACY_READONLY_NOTICE =
  "这份表格是用旧引擎存的，现在是只读打开的。点「转换为新表格」之后才会改动它。";

/** 新核目前接得住的规模。超了不转换，因为转出来也是卡死的。 */
export const GRID_UNIVER_MAX_ROWS = 10_000;
export const GRID_UNIVER_MAX_COLS = 256;

export type GridConversionState =
  | "readonly"
  | "converting"
  | "converted"
  | "failed";

export type GridConversionEvent =
  | { type: "request" }
  | { type: "resolve" }
  | { type: "reject" }
  | { type: "retry" };

/**
 * 只有 `request` 能离开 `readonly`。
 *
 * 这台状态机的全部意义就是这一条：**没有任何一条边可以从「打开」直接走到「已改写」**。
 * 把它写成表而不是几个 `if`，是为了让「谁能改写用户的文档」这个问题有一个能被读完的答案。
 */
export function nextGridConversionState(
  state: GridConversionState,
  event: GridConversionEvent,
): GridConversionState {
  switch (state) {
    case "readonly":
      return event.type === "request" ? "converting" : "readonly";
    case "converting":
      if (event.type === "resolve") return "converted";
      if (event.type === "reject") return "failed";
      return "converting";
    case "failed":
      return event.type === "retry" ? "converting" : "failed";
    case "converted":
      // 转换是一次性的。已经在新核里的文档不该再"转换"一次——那只会
      // 把它自己当成旧文档再嚼一遍，白白多出一份漂移。
      return "converted";
    default:
      return state;
  }
}

export type GridLegacyConversion =
  | {
      ok: true;
      data: Partial<IWorkbookData>;
      report: GridUniverConversionReport;
      summary: string;
    }
  | { ok: false; reason: string };

export interface GridLegacyConversionInput {
  sheets: readonly GridSheet[];
  /** 工程档里记的 schema；未知 schema 也允许试，但会在报数里点名。 */
  schema?: string;
  title?: string;
}

function oversizeReason(sheets: readonly GridSheet[]): string | null {
  for (const sheet of sheets) {
    const rows = sheet.rows?.length || 0;
    if (rows > GRID_UNIVER_MAX_ROWS) {
      return `工作表「${sheet.name}」有 ${rows} 行，超过新表格能接住的 ${GRID_UNIVER_MAX_ROWS} 行。请先在旧编辑器里拆表或删掉空行。`;
    }
    const cols = Math.max(0, ...(sheet.rows || []).map((row) => row.length));
    if (cols > GRID_UNIVER_MAX_COLS) {
      return `工作表「${sheet.name}」有 ${cols} 列，超过新表格能接住的 ${GRID_UNIVER_MAX_COLS} 列。请先在旧编辑器里拆表。`;
    }
  }
  return null;
}

/**
 * 试着把一份存量工作簿转成 Univer 快照。**纯函数：调用它不改变任何东西**，
 * 它只是把「转出来会长什么样、有什么带不过去」算给调用方看。
 */
export function planGridLegacyConversion(
  input: GridLegacyConversionInput,
): GridLegacyConversion {
  const sheets = input.sheets || [];
  if (sheets.length === 0) {
    return {
      ok: false,
      reason: "这份文档里一张工作表都没有，没有可以转换的内容。",
    };
  }
  const oversize = oversizeReason(sheets);
  if (oversize) return { ok: false, reason: oversize };

  const { data, report } = gridSheetsToUniverSnapshot(sheets, {
    name: input.title,
  });
  if (input.schema && input.schema !== GRID_LEGACY_PROJECT_SCHEMA) {
    report.dropped.push(
      `这份文档记的格式是「${input.schema}」，不是旧表格的「${GRID_LEGACY_PROJECT_SCHEMA}」；已按旧表格的形状读，如果有内容对不上请核对原文件。`,
    );
  }
  return { ok: true, data, report, summary: describeGridConversion(report) };
}

/** 把报数说成一句人话。带不过去的东西**排在后面但一定出现**。 */
export function describeGridConversion(
  report: GridUniverConversionReport,
): string {
  const head = `已转换 ${report.sheets} 张工作表、${report.cells} 个单元格（含 ${report.formulas} 条公式、${report.merges} 处合并）。`;
  if (report.dropped.length === 0) return head;
  return `${head}以下内容没有带过去：${report.dropped.join("；")}。`;
}
