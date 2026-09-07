/**
 * 表格编辑栏的**文档段**动作（规范 v2 `plugin-chrome-pages-spec.md` §6 grid 行：
 * 编辑栏要有「重新计算」）。
 *
 * 纯函数、零 React：`tests/grid-document-actions.test.mjs` 直接调用它断言
 * 「有 recalculate 能力就一定有重新计算」。旧核删掉后它从 `GridRoute.tsx` 搬到
 * 这里，Univer 舞台是唯一消费方。
 *
 * 失败时只给**一个**「重新载入表格」：旧核为两条失败路径各配一个按钮
 * （「重新载入表格」「刷新 source/full 后重试」），Univer 侧两条路径都汇成
 * `officeSource.retry`，第二个按钮就是重复（派活合同第 5 条）。
 */
import type { AdvancedWorkbenchAction } from "../../advanced-workbench-chrome";
import type { UITranslate } from "../../../i18n/ui/useUI";

/** 没递 `tt` 时原文照出、占位照填（纯函数测试、中文站）；舞台永远递 `useUI()` 的那一个。 */
const passthrough: UITranslate = (zh, vars) =>
  vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;

export type GridDocumentActionSource = {
  /** 有这个能力就必须给出「重新计算」。Univer 侧接 `getFormula().executeCalculation()`。 */
  recalculate?: () => void;
  loading?: boolean;
  /** 只读打开的旧档：重新计算仍在，但不可点。 */
  readonly?: boolean;
  /** 源文件拿不到（签名 403 / rendition 解析失败）。 */
  sourceFailed?: boolean;
  reload?: () => void;
};

/**
 * 源文件取不到时状态栏上那句话。`head` 说现状、带真实原因；`tail` 只承诺界面
 * 真做得到的出路——「重新载入表格」就是上面那个按钮
 * （`tests/rendition-callback-identity.test.mjs` 逐句核对承诺与按钮）。
 */
export function gridSourceFailureMessage(
  reason: string,
  tt: UITranslate = passthrough,
): string {
  const detail = String(reason || "").trim();
  const head = detail
    ? tt("没能读到这份表格的源文件（{detail}）。", { detail })
    : tt("没能读到这份表格的源文件。");
  const tail = tt("点「重新载入表格」再试一次，或者关掉这份文档重新打开。");
  return `${head}${tail}`;
}

export function buildGridDocumentActions(
  editor: GridDocumentActionSource,
  tt: UITranslate = passthrough,
): AdvancedWorkbenchAction[] {
  const actions: AdvancedWorkbenchAction[] = [];
  if (typeof editor.recalculate === "function") {
    // 规范 v2 §6：表格的「重新计算」是编辑类动作，留在编辑栏。
    actions.push({
      id: "grid-recalculate",
      label: tt("重新计算"),
      group: "edit",
      disabled: Boolean(editor.loading) || Boolean(editor.readonly),
      onTrigger: editor.recalculate,
    });
  }
  if (editor.sourceFailed && typeof editor.reload === "function") {
    actions.push({
      id: "grid-reload-source",
      label: tt("重新载入表格"),
      onTrigger: editor.reload,
    });
  }
  return actions;
}
