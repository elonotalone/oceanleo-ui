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

export function buildGridDocumentActions(
  editor: GridDocumentActionSource,
): AdvancedWorkbenchAction[] {
  const actions: AdvancedWorkbenchAction[] = [];
  if (typeof editor.recalculate === "function") {
    // 规范 v2 §6：表格的「重新计算」是编辑类动作，留在编辑栏。
    actions.push({
      id: "grid-recalculate",
      label: "重新计算",
      group: "edit",
      disabled: Boolean(editor.loading) || Boolean(editor.readonly),
      onTrigger: editor.recalculate,
    });
  }
  if (editor.sourceFailed && typeof editor.reload === "function") {
    actions.push({
      id: "grid-reload-source",
      label: "重新载入表格",
      onTrigger: editor.reload,
    });
  }
  return actions;
}
