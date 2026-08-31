/**
 * 「重新计算」这个动作的引擎侧半边。
 *
 * 它单独成文件（而不是长在 `use-grid-editor.ts` 里）有两个理由：
 *
 * 1. **铸戳要读宿主时钟，求值器永远不许读。** `grid-formula.ts` 上钉着一条钝判据
 *    （`grid-formula-determinism.test.mjs`「求值器源码里不出现 Date.now / Math.random」
 *    与 `grid-carrier-contract.test.mjs` C-4 封闭子集），它连注释里的字面量都算数。
 *    整条链上**只有这里**允许读钟，读到的那一刻立刻被写成文档里的一个值，
 *    之后的每一次求值都只认那个值。
 * 2. `use-grid-editor.ts` 是 React hook，node 里加载不进来（i18n 的 `.tsx` 树跟着来），
 *    判据只能退化成源码文本断言。纯 TS 放这儿，测试可以**真的算一遍**。
 */

// `import type` 而不是 `import`：`useUI.ts` 拖着 next-intl 与 `.tsx` 词典树，
// 真导进来这个文件就在 node 里加载不动了，上面第 2 条理由（判据能真算一遍）当场作废。
// 类型在编译/strip-types 时被整句擦掉，运行时一个字节都不引入。
import type { UITranslate } from "../../i18n/ui/useUI";
import {
  buildGridDependencyGraph,
  evaluateGridCellInWorkbook,
  recalcGridWorkbook,
  type GridFormulaValue,
  type GridRecalcStamp,
} from "./grid-formula";
import { gridWorkbookContext, type GridSheet } from "./grid-model";

/** 铸戳时可注入的宿主能力。测试拿它把时钟钉死，产品代码一个都不传。 */
export interface GridRecalcClock {
  now?: () => number;
  random?: () => number;
}

/**
 * 一枚新的重算戳：`at` 是这次「重新计算」发生的那一刻，`seed` 给 `RAND` 家族。
 *
 * `at` 必须是以 `Z` 结尾的 UTC ISO8601、`seed` 必须是 uint32，否则
 * `normalizeGridRecalcStamp` 会把它当作**没有戳**（fail-closed），
 * 用户点了按钮却什么都没发生。`toISOString()` 与 `>>> 0` 就是为这两条服务的。
 */
export function mintGridRecalcStamp(
  clock: GridRecalcClock = {},
): GridRecalcStamp {
  const at = new Date(clock.now ? clock.now() : Date.now()).toISOString();
  const draw = clock.random ? clock.random() : Math.random();
  return { at, seed: Math.floor(draw * 0x1_0000_0000) >>> 0 };
}

export interface GridRecalcOutcome {
  readonly stamp: GridRecalcStamp;
  /**
   * 这次重算真正动到的格子：volatile 格自己 + 它们的下游，
   * key 是 `表名!行:列`（`recalcGridWorkbook` 的口径），value 是新算出来的值。
   */
  readonly patch: ReadonlyMap<string, GridFormulaValue>;
  /** 工作簿里一共有多少条公式。用来如实报「重算了 N 个，全表 M 条」。 */
  readonly formulaCells: number;
  /** 其中随戳变化的有几条。为 0 就是「这份表没有会随时间变的公式」。 */
  readonly volatileCells: number;
}

/**
 * P4 的消费方：盖上新戳，把**受这枚戳影响的那一小块**重算出来。
 *
 * ⚠️ `planGridRecalc(graph, changed)` 排的是 `changed` 的**下游**，不含 `changed` 自身
 * （`grid-formula.ts` 里 `queue = [...changed]` 之后只 push `dependentsOf`）。
 * 重新盖戳的语义是「每一个 volatile 格自己也变了」，所以两半都要算——
 * 只调 `recalcGridWorkbook(ctx, graph, graph.volatileCells)` 会漏掉 `=TODAY()` 那一格本身，
 * 而那正是用户点这个按钮想看到变化的地方。
 */
export function recalcGridSheets(
  sheets: readonly GridSheet[],
  stamp: GridRecalcStamp,
): GridRecalcOutcome {
  const workbook = gridWorkbookContext(sheets, { recalc: stamp });
  const graph = buildGridDependencyGraph(
    workbook,
    sheets.map((sheet) => sheet.name),
  );
  const patch = new Map<string, GridFormulaValue>(
    recalcGridWorkbook(workbook, graph, graph.volatileCells),
  );
  for (const ref of graph.volatileCells) {
    patch.set(
      `${ref.sheet}!${ref.row}:${ref.col}`,
      evaluateGridCellInWorkbook(workbook, ref.sheet, ref.row, ref.col),
    );
  }
  return {
    stamp,
    patch,
    formulaCells: graph.formulaCells.length,
    volatileCells: graph.volatileCells.length,
  };
}

/**
 * 不传 `translate` 时的兜底：只把插值位填上，不查词典。
 *
 * 判据（`grid-recalc-action.test.mjs`）就是这么调的——它要的是「算得对不对」，
 * 不是「译得对不对」。但**兜底也必须填插值位**：否则那句回执会把
 * `{cells}` 四个字原样印在屏幕上，比没有译文更难看。
 */
const interpolateOnly: UITranslate = (value, vars) =>
  value.replace(/\{(\w+)\}/g, (whole, name: string) =>
    vars && name in vars ? String(vars[name]) : whole,
  );

/**
 * 说清楚刚才发生了什么。空计划**不是失败**，也不该假装成功：
 * 一份没有 `TODAY()`/`NOW()`/`RAND()` 的表格重算多少次结果都一样，
 * 告诉用户这件事比默默弹一句「已重新计算」诚实。
 *
 * ⚠️ `translate` 的类型是 `UITranslate`（带 `vars`），两个理由都硬：
 *   1. 那句回执带 `{cells}`／`{formulas}` 两个插值位。**它原来是五个中文片段拼的**
 *      （`translate("已按新的计算时刻重算 ") + n + translate(" 个格子（全表共 ")`…），
 *      片段各自翻译在任何语序不同的语言里都拼不出通顺句子，所以合成了一整句。
 *   2. `i18n-tt-key-coverage` 那道闸认翻译函数的办法是**看形参类型里有没有
 *      `UITranslate`**（见该判据的 `translatorNames`）。原来这里写
 *      `(value: string) => string`，于是这三句中文**对那道闸完全不可见**——
 *      缺 16 语译文缺了很久，一条判据都看不见（`W32` 报过）。改成 `UITranslate`
 *      之后它们进了扫描面：以后少一个语种当场红。译文在
 *      `src/i18n/ui/messages/workbench-office-copy.ts`。
 */
export function gridRecalcSummary(
  outcome: GridRecalcOutcome,
  translate: UITranslate = interpolateOnly,
): string {
  if (outcome.patch.size === 0) {
    return outcome.formulaCells === 0
      ? translate("这张工作簿里还没有公式，没有需要重算的格子。")
      : translate(
          "这些公式的结果不随时间变（没有 TODAY / NOW / RAND 一类），重算后与原来相同。",
        );
  }
  return translate("已按新的计算时刻重算 {cells} 个格子（全表共 {formulas} 条公式）。", {
    cells: outcome.patch.size,
    formulas: outcome.formulaCells,
  });
}
