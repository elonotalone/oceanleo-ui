/**
 * Univer 舞台的可测纯函数层。`GridUniverStage.tsx` 是唯一碰 `createUniver`
 * 运行时的叶子；本文件一个 Univer 运行时 import 都没有，测试才能直接加载。
 *
 * 专业模式走契约 v2 的 `buildSetModeMessage` 校验闭集 mode，再落到
 * `gridUniverChrome` —— Native 件**不发** postMessage（`W01-interface.md` §4）。
 */
import {
  buildSetModeMessage,
  type EditorMode,
} from "../../hosted-editor/index";
import {
  GRID_UNIVER_DEFAULT_MODE,
  gridUniverChrome,
  type GridUniverChrome,
} from "./chrome";
import {
  GRID_UNIVER_COMMANDS,
  type GridFacadeApi,
  type GridFacadePort,
  type GridFacadeWorkbook,
  type GridFacadeWorksheet,
  type GridUniverCommandArgs,
  type GridUniverSelection,
} from "./facade-commands";
import { UNIVER_SHEETS_OSS_PRESETS } from "./presets";
import type { SelectionContext, SelectionControl } from "../../selection-context-types";

/** 契约 v2 `set-mode` 的 instanceId；Native 件只用来通过 builder 校验，不发消息。 */
export const GRID_UNIVER_INSTANCE_ID = "oceanleo-grid-univer";

/** 舞台根节点上的模式标记，给测试与 CSS 闸用。 */
export const GRID_UNIVER_STAGE_ATTR = "data-grid-univer-stage";
export const GRID_UNIVER_MODE_ATTR = "data-grid-univer-mode";

/**
 * Univer 自己的 DOM 钩子（实读 0.25.1 打包产物里的 `data-u-comp`）。
 * 切模式不许 dispose 重建，create 时要把零件都造出来，运行期靠显示/隐藏。
 */
export const GRID_UNIVER_CHROME_SELECTORS = {
  header: '[data-u-comp="headerbar"]',
  toolbar: '[data-u-comp="ribbon-toolbar"]',
  formulaBar: '[data-u-comp="formula-bar"]',
} as const;

export const GRID_UNIVER_CHROME_ATTRS = {
  header: "data-grid-univer-header",
  toolbar: "data-grid-univer-toolbar",
  footer: "data-grid-univer-footer",
  formulaBar: "data-grid-univer-formula-bar",
  contextMenu: "data-grid-univer-context-menu",
  statusBarStatistic: "data-grid-univer-status-bar",
} as const;

/**
 * `createUniver` 允许的 OSS 说明符。接线闸扫舞台源码时拿这张表逐条对，
 * 漏一个 preset 或掺进水印包都会当场红。
 */
export const GRID_UNIVER_STAGE_OSS_SPECIFIERS = [
  "@univerjs/presets",
  ...UNIVER_SHEETS_OSS_PRESETS,
] as const;

/** 11 个 OSS preset 的 CSS 入口。 */
export const GRID_UNIVER_STAGE_CSS_SPECIFIERS = UNIVER_SHEETS_OSS_PRESETS.map(
  (pkg) => `${pkg}/lib/index.css`,
);

export interface GridUniverCorePresetConfig {
  container?: string | HTMLElement;
  header: boolean;
  toolbar: boolean;
  formulaBar: boolean;
  /** Univer 的 footer 不是布尔：`false` 整条关掉，对象才留得住换表标签。 */
  footer:
    | false
    | {
        sheetBar?: boolean;
        statisticBar?: boolean;
        menus?: boolean;
        zoomSlider?: boolean;
      };
  contextMenu: boolean;
  statusBarStatistic: boolean;
}

/**
 * 传给 `UniverSheetsCorePreset` 的配置。
 *
 * 切模式不能 dispose，所以 **create 时零件必须在**（全开），可见性由
 * `applyGridUniverChromeDom` / `setUIVisible` 按当前 mode 收。把 mode 的
 * 语义开关写进 create 配置，普通档会把 ribbon 节点根本不造出来，专业档
 * 再打不开，只能重建实例 —— 那正好丢掉选区和撤销栈。
 */
export function gridUniverCorePresetConfig(
  _mode: EditorMode,
  container?: string | HTMLElement,
): GridUniverCorePresetConfig {
  return {
    container,
    header: true,
    toolbar: true,
    formulaBar: true,
    footer: {
      sheetBar: true,
      statisticBar: true,
      menus: true,
      zoomSlider: true,
    },
    contextMenu: true,
    statusBarStatistic: true,
  };
}

export interface GridUniverModeApplication {
  instanceId: string;
  message: ReturnType<typeof buildSetModeMessage>;
  chrome: GridUniverChrome;
  mode: EditorMode;
}

/**
 * L0 开关 → 校验过的 mode + 该露出的 chrome。
 *
 * `buildSetModeMessage` 会拒掉闭集以外的取值；Native 路由不得把返回值
 * `postMessage` 出去，只读 `message.mode`。
 */
export function applyGridUniverMode(
  instanceId: string,
  mode: EditorMode,
): GridUniverModeApplication {
  const message = buildSetModeMessage(instanceId, mode);
  const next = message.type === "set-mode" ? message.mode : mode;
  return {
    instanceId,
    message,
    mode: next,
    chrome: gridUniverChrome(next),
  };
}

export interface GridUniverChromeRoot {
  setAttribute(name: string, value: string): void;
  querySelectorAll?(
    selector: string,
  ): ArrayLike<{ style: { display: string } }>;
}

function hideMatches(
  root: GridUniverChromeRoot,
  selector: string,
  hidden: boolean,
): void {
  const nodes = root.querySelectorAll?.(selector);
  if (!nodes) return;
  for (let i = 0; i < nodes.length; i += 1) {
    nodes[i].style.display = hidden ? "none" : "";
  }
}

/**
 * 运行期改 chrome：**只改 data 属性 + `display:none`**，不写时长、不重建实例。
 */
export function applyGridUniverChromeDom(
  root: GridUniverChromeRoot,
  chrome: GridUniverChrome,
): GridUniverChrome {
  root.setAttribute(
    GRID_UNIVER_CHROME_ATTRS.header,
    chrome.header ? "on" : "off",
  );
  root.setAttribute(
    GRID_UNIVER_CHROME_ATTRS.toolbar,
    chrome.toolbar ? "on" : "off",
  );
  root.setAttribute(
    GRID_UNIVER_CHROME_ATTRS.footer,
    chrome.footer ? "on" : "off",
  );
  root.setAttribute(
    GRID_UNIVER_CHROME_ATTRS.formulaBar,
    chrome.formulaBar ? "on" : "off",
  );
  root.setAttribute(
    GRID_UNIVER_CHROME_ATTRS.contextMenu,
    chrome.contextMenu ? "on" : "off",
  );
  root.setAttribute(
    GRID_UNIVER_CHROME_ATTRS.statusBarStatistic,
    chrome.statusBarStatistic ? "on" : "off",
  );
  hideMatches(root, GRID_UNIVER_CHROME_SELECTORS.header, !chrome.header);
  hideMatches(root, GRID_UNIVER_CHROME_SELECTORS.toolbar, !chrome.toolbar);
  hideMatches(
    root,
    GRID_UNIVER_CHROME_SELECTORS.formulaBar,
    !chrome.formulaBar,
  );
  return chrome;
}

/** `FUniver.setUIVisible` 用的内置零件名（`BuiltInUIPart` 实读）。 */
export const GRID_UNIVER_UI_PARTS = {
  header: "header",
  toolbar: "toolbar",
  footer: "footer",
} as const;

export function gridUniverUiVisibility(
  chrome: GridUniverChrome,
): { part: string; visible: boolean }[] {
  return [
    { part: GRID_UNIVER_UI_PARTS.header, visible: chrome.header },
    { part: GRID_UNIVER_UI_PARTS.toolbar, visible: chrome.toolbar },
    { part: GRID_UNIVER_UI_PARTS.footer, visible: chrome.footer },
  ];
}

export interface GridUniverLiveApi {
  newDataValidation?: GridFacadeApi["newDataValidation"];
  getActiveWorkbook?: () =>
    | (GridFacadeWorkbook & {
        getActiveSheet: () =>
          | (GridFacadeWorksheet & {
              getSelection?: () => {
                getActiveRange?: () => GridUniverFacadeRangeLike | null;
              } | null;
            })
          | null;
      })
    | null;
  setUIVisible?: (part: string, visible: boolean) => unknown;
  undo?: () => unknown;
  redo?: () => unknown;
  createWorkbook?: (data: unknown) => unknown;
  disposeUnit?: (unitId: string) => unknown;
  /** `FUniver.getFormula()`：编辑栏「重新计算」走它的 `executeCalculation()`（强制全量）。 */
  getFormula?: () => { executeCalculation?: () => unknown } | null | undefined;
}

export interface GridUniverFacadeRangeLike {
  getRow(): number;
  getColumn(): number;
  getWidth(): number;
  getHeight(): number;
}

export const GRID_UNIVER_EMPTY_SELECTION: GridUniverSelection = {
  startRow: 0,
  endRow: 0,
  startColumn: 0,
  endColumn: 0,
};

export function gridUniverSelectionFromFacadeRange(
  range: GridUniverFacadeRangeLike | null | undefined,
): GridUniverSelection {
  if (!range) return { ...GRID_UNIVER_EMPTY_SELECTION };
  const row = range.getRow();
  const col = range.getColumn();
  const height = Math.max(1, range.getHeight());
  const width = Math.max(1, range.getWidth());
  return {
    startRow: row,
    endRow: row + height - 1,
    startColumn: col,
    endColumn: col + width - 1,
  };
}

function isFacadeRangeLike(value: unknown): value is GridUniverFacadeRangeLike {
  if (!value || typeof value !== "object") return false;
  const range = value as Partial<GridUniverFacadeRangeLike>;
  return (
    typeof range.getRow === "function" &&
    typeof range.getColumn === "function" &&
    typeof range.getWidth === "function" &&
    typeof range.getHeight === "function"
  );
}

/**
 * 从活的 `univerAPI` 包出命令表要的端口。拿不到工作簿就返回 `null`，
 * 调用方不得拿假端口去跑会改文档的命令。
 */
export function univerFacadePortFromLive(
  api: GridUniverLiveApi | null | undefined,
  selectionHint: GridUniverSelection = GRID_UNIVER_EMPTY_SELECTION,
): GridFacadePort | null {
  if (!api?.getActiveWorkbook) return null;
  const workbook = api.getActiveWorkbook();
  if (!workbook) return null;
  const sheet = workbook.getActiveSheet();
  if (!sheet) return null;
  const liveSheet = sheet as GridFacadeWorksheet & {
    getSelection?: () => {
      getActiveRange?: () => GridUniverFacadeRangeLike | null;
    } | null;
  };
  const picked = liveSheet.getSelection?.()?.getActiveRange?.();
  const selection = isFacadeRangeLike(picked)
    ? gridUniverSelectionFromFacadeRange(picked)
    : selectionHint;
  const rows = Math.max(1, selection.endRow - selection.startRow + 1);
  const cols = Math.max(1, selection.endColumn - selection.startColumn + 1);
  const range = sheet.getRange(
    selection.startRow,
    selection.startColumn,
    rows,
    cols,
  );
  if (!api.newDataValidation) return null;
  return {
    api: { newDataValidation: () => api.newDataValidation!() },
    workbook,
    sheet,
    range,
    selection,
  };
}

export function applyGridUniverChromeToApi(
  api: Pick<GridUniverLiveApi, "setUIVisible"> | null | undefined,
  chrome: GridUniverChrome,
): void {
  if (!api?.setUIVisible) return;
  for (const { part, visible } of gridUniverUiVisibility(chrome)) {
    api.setUIVisible(part, visible);
  }
}

export function gridUniverCommandArgsFromValue(
  value: string | number | boolean | null | undefined,
): GridUniverCommandArgs {
  if (typeof value === "boolean") return { value, on: value };
  if (typeof value === "number" && Number.isFinite(value)) return { value };
  if (typeof value === "string") return { value };
  return {};
}

const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  type: [
    { value: "auto", label: "自动" },
    { value: "text", label: "文本" },
    { value: "number", label: "数字" },
    { value: "currency", label: "人民币" },
    { value: "percent", label: "百分比" },
    { value: "date", label: "日期" },
  ],
  align: [
    { value: "left", label: "左" },
    { value: "center", label: "中" },
    { value: "right", label: "右" },
  ],
};

function controlForCommand(
  id: string,
  label: string,
  layer: string,
): SelectionControl {
  if (id === "bold") {
    return {
      id,
      kind: "toggle",
      label,
      icon: "bold",
      iconOnly: true,
      group: "format",
      value: false,
    };
  }
  if (id === "align" || id === "type") {
    return {
      id,
      kind: "select",
      label,
      icon: id === "align" ? "align-left" : "table",
      iconOnly: true,
      group: "format",
      value: id === "align" ? "left" : "auto",
      options: SELECT_OPTIONS[id],
    };
  }
  if (id === "color" || id === "background") {
    return {
      id,
      kind: "color",
      label,
      icon: id === "color" ? "color" : "background",
      iconOnly: true,
      group: "format",
      value: id === "color" ? "#292524" : "#ffffff",
    };
  }
  if (id === "decimals") {
    return {
      id,
      kind: "number",
      label,
      value: 2,
      min: 0,
      max: 8,
      placement: "more",
      slot: "inspector",
      inspectorGroup: "grid-number-format",
    };
  }
  return {
    id,
    kind: "action",
    label,
    iconOnly: true,
    group: layer === "L2" ? "structure" : "format",
    slot: layer === "L2" ? "inspector" : undefined,
    inspectorGroup: layer === "L2" ? "grid-structure" : undefined,
    placement: layer === "L2" ? "more" : undefined,
  };
}

/** L1/L2 里真正进 Facade 的控件（draft/shell 不进浮条的执行器位）。 */
export function gridUniverFacadeControlIds(): string[] {
  return GRID_UNIVER_COMMANDS.filter(
    (command) =>
      (command.layer === "L1" || command.layer === "L2") && command.run,
  ).map((command) => command.id);
}

/**
 * 新核 L1/L2 的选区上下文。控件 id 与 `GRID_UNIVER_COMMANDS` 逐字对齐，
 * 不拿假的 `GridEditorState` 去喂 838 行的旧 `GridContextToolbar`。
 */
export function gridUniverSelectionContext(input: {
  selection?: GridUniverSelection;
  revision?: number;
  sheetId?: string;
  kind?: string;
} = {}): SelectionContext {
  const selection = input.selection || GRID_UNIVER_EMPTY_SELECTION;
  const address = `${selection.startRow}:${selection.startColumn}`;
  const controls = GRID_UNIVER_COMMANDS.filter(
    (command) =>
      (command.layer === "L1" || command.layer === "L2") && command.run,
  ).map((command) =>
    controlForCommand(command.id, command.label, command.layer),
  );
  return {
    version: 1,
    kind: input.kind || "grid-cell",
    id: `cell:${input.sheetId || "sheet"}:${address}`,
    label: address,
    revision: input.revision ?? 0,
    controls,
  };
}

export { GRID_UNIVER_DEFAULT_MODE };
