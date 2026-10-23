/**
 * 统一文字栏（`text-bar.ts`）新增控件的执行器，一个 id 一行，并进
 * `GRID_UNIVER_COMMANDS`（`facade-commands.ts` 末尾展开）。
 *
 * 只 `import type`：`facade-commands.ts` 要在模块求值时展开这张表，这里若再取它的
 * 值就成了循环依赖，先加载哪一边都可能撞上 TDZ。
 */
import type {
  GridFacadePort,
  GridUniverCommand,
  GridUniverCommandArgs,
} from "./facade-commands";
import {
  GRID_BORDER_OPTIONS,
  GRID_FONT_SIZE_MAX,
  GRID_FONT_SIZE_MIN,
  type GridBorderOption,
} from "./text-bar";

/** 文字栏要用到的 FRange 方法（Univer 0.25.1 facade 实读）。 */
export interface GridFacadeTextRange {
  setFontFamily(fontFamily: string | null): unknown;
  setFontSize(size: number | null): unknown;
  setFontStyle(fontStyle: "italic" | "normal" | null): unknown;
  setVerticalAlignment(alignment: "top" | "middle" | "bottom"): unknown;
  setWrap(isWrapEnabled: boolean): unknown;
  /** type 是 Univer `BorderType` 的字符串值；style 是 `BorderStyleTypes`（1 = THIN）。 */
  setBorder(type: string, style: number, color?: string): unknown;
  clearFormat(): unknown;
}

/**
 * 下划线 / 删除线各自独立开关。Facade 的 `setFontLine("none")` 会把两条一起清掉，
 * 关一条就要再补另一条，一次点击变成两条撤销记录——所以直接发 Univer 的
 * `sheet.command.set-style`（facade 内部也是它），一次点击一条记录。
 */
export const GRID_SET_STYLE_COMMAND = "sheet.command.set-style";

export interface GridStyleCommandPort {
  /** `univerAPI.syncExecuteCommand` 包出来的；拿不到时文字线命令报失败而不是假成功。 */
  execute?: (id: string, params: Record<string, unknown>) => unknown;
  unitId?: string;
}

const BORDER_THIN = 1;

function str(args: GridUniverCommandArgs, key: string, fallback = ""): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function fontLine(type: "ul" | "st") {
  return (port: GridFacadePort & GridStyleCommandPort, args: GridUniverCommandArgs) => {
    if (!port.execute || !port.unitId) return null;
    return port.execute(GRID_SET_STYLE_COMMAND, {
      unitId: port.unitId,
      subUnitId: port.sheet.getSheetId(),
      range: { ...port.selection },
      style: { type, value: { s: args.on === false ? 0 : 1 } },
    });
  };
}

export const GRID_TEXT_COMMANDS: readonly GridUniverCommand[] = [
  {
    id: "font-family",
    label: "字体",
    layer: "L1",
    run: (port, args) => {
      const value = str(args, "value").trim();
      return value ? port.range.setFontFamily(value) : null;
    },
  },
  {
    id: "font-size",
    label: "字号",
    layer: "L1",
    run: (port, args) => {
      const value = args.value;
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      const size = Math.round(
        Math.min(GRID_FONT_SIZE_MAX, Math.max(GRID_FONT_SIZE_MIN, value)),
      );
      return port.range.setFontSize(size);
    },
  },
  {
    id: "italic",
    label: "斜体",
    layer: "L1",
    run: (port, args) =>
      port.range.setFontStyle(args.on === false ? "normal" : "italic"),
  },
  { id: "underline", label: "下划线", layer: "L1", run: fontLine("ul") },
  { id: "strike", label: "删除线", layer: "L1", run: fontLine("st") },
  {
    id: "grid-valign",
    label: "垂直对齐",
    layer: "L1",
    run: (port, args) => {
      const value = str(args, "value");
      if (value !== "top" && value !== "middle" && value !== "bottom") return null;
      return port.range.setVerticalAlignment(value);
    },
  },
  {
    id: "grid-wrap",
    label: "自动换行",
    layer: "L1",
    run: (port, args) => port.range.setWrap(args.on !== false),
  },
  {
    id: "grid-border",
    label: "边框",
    layer: "L1",
    run: (port, args) => {
      const value = str(args, "value") as GridBorderOption;
      if (!GRID_BORDER_OPTIONS.includes(value)) return null;
      return port.range.setBorder(
        value,
        value === "none" ? 0 : BORDER_THIN,
        value === "none" ? undefined : "#000000",
      );
    },
  },
  {
    id: "clear-format",
    label: "清除格式",
    layer: "L1",
    run: (port) => port.range.clearFormat(),
  },
];
