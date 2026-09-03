/**
 * 普通模式与专业模式下，Univer 自己的那套 UI 露出多少（五层规范 L0/L3）。
 *
 * 这些键名不是我编的，是 `IUniverSheetsCorePresetConfig` 上真实存在的配置位
 * （`@univerjs/preset-sheets-core` 的 `.d.ts`：`header` / `toolbar` / `footer` /
 * `formulaBar` / `contextMenu` / `menu` / `ribbonType` / `statusBarStatistic`）。
 * 官方 Read Only Demo 就是把它们关掉；本波是**反向使用**同一组开关：
 * 普通模式关掉，专业模式打开。
 *
 * 为什么单独成一个纯函数而不是写在组件里：判据「ribbon/公式栏/页脚默认隐藏」
 * 只有在能被断言的地方才守得住。写在 `createUniver({...})` 的参数字面量里，
 * 测试只能扫源码文本，扫不出「关了」和「有个叫 toolbar 的键」的区别。
 */
import { DEFAULT_EDITOR_MODE, type EditorMode } from "../../hosted-editor";

/** 传给 `UniverSheetsCorePreset` 的那几个 UI 开关。 */
export interface GridUniverChrome {
  /** 顶部整条（ribbon 所在的容器）。 */
  header: boolean;
  /** ribbon 本体。 */
  toolbar: boolean;
  /** 底部页脚（工作表标签 + 状态栏）。 */
  footer: boolean;
  /** 公式栏。 */
  formulaBar: boolean;
  /** 右键菜单。 */
  contextMenu: boolean;
  /** 状态栏里的统计（求和/计数）。 */
  statusBarStatistic: boolean;
}

/**
 * 表格的默认模式。**普通**（R3）——不是「记住上次」，也不是各编辑器自己定。
 * 值取自契约 v2，不在这里再写一遍字面量。
 */
export const GRID_UNIVER_DEFAULT_MODE: EditorMode = DEFAULT_EDITOR_MODE;

/**
 * 普通模式为什么保留 `contextMenu` 与页脚以外的一切都关：
 *
 * - ribbon（`header` + `toolbar`）与公式栏是「内核的完整 UI」，规范说它们进 L3；
 * - **右键菜单不是 ribbon**。它是选中对象后的直接动作，属于 L1 的语义，
 *   关掉它等于把「复制/粘贴/插入行」从普通模式里删掉，而不是藏进专业模式
 *   （§2.1 第 4 条：深功能不删只藏，但这几条根本不是深功能）。
 * - 页脚里有工作表标签，多表工作簿关掉它就换不了表 —— 那是能力丢失，不是收纳。
 *   所以普通模式**保留页脚**，专业模式额外打开状态栏统计。
 */
export function gridUniverChrome(mode: EditorMode): GridUniverChrome {
  const pro = mode === "pro";
  return {
    header: pro,
    toolbar: pro,
    footer: true,
    formulaBar: pro,
    contextMenu: true,
    statusBarStatistic: pro,
  };
}

/**
 * 切模式时，哪些东西**不许**跟着变。
 *
 * 规范 §7 判据 1 要求「同一文档实例、状态不丢」。Univer 的 UI 开关是可以在运行期
 * 通过 `FUniver` 的 UI 面重设的，但最省心也最容易被写错的做法是重建实例——
 * 那会丢掉撤销历史、选区和滚动位置。这张表是给 `use-grid-editor-univer.ts` 与
 * 验收用的清单：切模式时这几样必须逐字相等。
 */
export const GRID_UNIVER_MODE_INVARIANTS = [
  "workbookId",
  "activeSheetId",
  "selection",
  "editRevision",
  "undoDepth",
] as const;

export type GridUniverModeInvariant =
  (typeof GRID_UNIVER_MODE_INVARIANTS)[number];

/** 切模式前后的状态指纹；两次调用逐字相等 = 状态没丢。 */
export interface GridUniverModeFingerprint {
  workbookId: string;
  activeSheetId: string;
  selection: string;
  editRevision: number;
  undoDepth: number;
}

/**
 * 比对两次指纹。返回**变了的那几项**，空数组 = 状态没丢。
 *
 * 返回差异项而不是布尔值，是因为「状态丢了」这句话对修 bug 的人没有用：
 * 丢的是选区还是撤销栈，处理方式完全不同。
 */
export function gridUniverModeDrift(
  before: GridUniverModeFingerprint,
  after: GridUniverModeFingerprint,
): GridUniverModeInvariant[] {
  return GRID_UNIVER_MODE_INVARIANTS.filter(
    (key) => before[key] !== after[key],
  );
}
