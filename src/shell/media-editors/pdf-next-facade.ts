/**
 * 新核档下，那几个「新核做不到」的动作在**每一个入口**上都被拦住（W06 判据 5）。
 *
 * ## 为什么包在 editor 上，而不是包在指令面上
 *
 * 同一个动作今天有三个入口：L1 浮条的按钮、`plugin-command` 的指令面、agent。
 * 三者最后都调 `PdfWorkbenchState` 上的同一个方法。拦在**这一层**，三个入口一次
 * 全覆盖；只拦指令面的话，L1 上那个按钮仍然是死键——点下去什么都不发生，
 * 而这正是规范 §7 判据 2 要防的「换核后按钮还在、功能没了」。
 *
 * ## 为什么必须拦
 *
 * EmbedPDF 2.15.0 有两件事真的做不到（`pdf-next-commands.ts` 逐条记了实测证据）：
 *
 * - **把页面旋转写进文件**：只有视图旋转（`plugin-rotate` 的 `setRotation`）。
 *   `rg -i "setPageRotation|pageRotation|rotatePage"` 在 `@embedpdf/models` 的
 *   `pdf.d.ts` 上零命中（同一文件 `saveAsCopy` 3 命中，证明正则有效）。
 *   旧核的 pdf-lib 是真写进 `/Rotate` 的，所以这是换核后**缩小了的承诺**。
 * - **在既有文档里插入一页空白页**：只有 `createDocument(id)`「新建一份空文档」。
 *
 * ## 为什么既回调又抛
 *
 * 两个入口需要的东西不一样，而两者都不能将就：
 *
 * - `plugin-command` 与 agent 那条路要一个**失败的返回值**。注册表的 `guardedRun`
 *   会把抛出的异常转成 `{ok:false, message}`（`registry.ts:319-327`），所以抛是
 *   这条路上唯一能让「没做成」被如实报出去的方式——不抛的话，上游 handler 会接着
 *   返回它写死的那句「已插入一页空白页」，那是一句假话。
 * - L1 浮条那条路是 `void editor.rotateCurrentPage(-1)`（`PdfContextToolbar.tsx:188`），
 *   它不看返回值。所以拒绝的原因必须**另走一条**送到宿主状态栏——那就是
 *   `onUnsupported` 回调。
 */

import type { PdfWorkbenchState } from "./pdf-workbench-state";
import {
  pdfNextCommandAvailability,
  pdfNextCommandFor,
} from "./pdf-next-commands";
import type { EditorCoreChoice } from "../editor-core-flags";

/** 被拦下的那几个动作，与 `pdf-next-commands.ts` 的 id 一一对应。 */
export const PDF_NEXT_BLOCKED_COMMANDS = [
  "pdf.rotate-page",
  "pdf.add-blank-page",
] as const;

/** 拒绝时给用户的那句话。取自命令表的 `note`，这里不另写一份。 */
export function pdfNextBlockReason(commandId: string): string {
  const gate = pdfNextCommandAvailability(commandId);
  if (gate.reason) return gate.reason;
  const spec = pdfNextCommandFor(commandId);
  return spec
    ? `${spec.label}在新引擎上暂时做不到。`
    : `${commandId} 在新引擎上暂时做不到。`;
}

/**
 * 新核档下把做不到的动作换成「说明原因并失败」；`legacy` 档**原样返回同一个对象**。
 *
 * 原样返回而不是浅拷贝是刻意的：旧核那条路一个字节都不该因为换核工作而改变
 * （§10 第 3 条），而「同一个对象」是这句话最强的形式——连引用相等都成立，
 * 于是任何依赖 `editor` 身份做记忆化的地方都不会因为多这一层而多渲染一次。
 */
export function pdfNextEditorFacade<T extends PdfWorkbenchState>(
  editor: T,
  core: EditorCoreChoice,
  onUnsupported: (reason: string) => void,
): T {
  if (core !== "next") return editor;
  const refuse = async (commandId: string): Promise<never> => {
    const reason = pdfNextBlockReason(commandId);
    onUnsupported(reason);
    throw new Error(reason);
  };
  // 断言回 T：只换了两个方法的实现，其余字段（含 office 表单那 20 多个）原样铺开。
  // 不写泛型的话，返回类型会收成 `PdfWorkbenchState`，L1 浮条要的 `PdfOfficeWorkbenchState` 对不上。
  return {
    ...editor,
    rotateCurrentPage: () => refuse("pdf.rotate-page"),
    addBlankPage: () => refuse("pdf.add-blank-page"),
  } as T;
}
