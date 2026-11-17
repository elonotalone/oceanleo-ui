/**
 * PPT / 图表 / 图片「只能看」的共用判断（work-chat 第二轮 F08）。纯函数：不碰 DOM、不引 React，node --test 直接读。
 *
 * 只能看 = 浏览者，或别人正占着编辑。编辑内核（use-deck-editor / 画布控制器）本来就拒绝改动，
 * 但工具条、浮条、侧边面板的按钮之前看起来能点，点了没反应。这里把「灰掉并说清楚为什么」收成一处：
 *   viewOnlyContext        —— 选择工具条的 SelectionContext：改动类控件 disabled + unavailableReason（悬停提示「你只能查看」）。
 *   viewOnlyUploadHandler  —— 宿主的上传 / 拖放入口：只读时不把文件交给编辑器。
 */
import type { SelectionContext, SelectionAdapterContext } from "../../selection-context";

/** 悬停提示与 aria 说明的中文原文（`tt()` 的键，词条在 collab-visual-copy.ts）。 */
export const VIEW_ONLY_HINT = "你只能查看";
/** 面板顶部的一句话说明。 */
export const VIEW_ONLY_PANEL_NOTE = "你只能查看，这里的功能暂时不能用。";
/** Human-readable refusal for native editing controls. */
export const VIEW_ONLY_REFUSAL = "你现在只能查看，不能修改这个作品。";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * 把一份选择上下文变成只读版：除 `keepIds`（纯查看类，如切换当前系列）外，每个控件都 disabled，
 * 并带上 unavailableReason（按钮的 title / aria-label 会读它）。`readOnly` 为 false 原样返回同一个对象。
 */
export function viewOnlyContext<T extends SelectionContext | SelectionAdapterContext | null>(
  context: T,
  readOnly: boolean,
  tt: Translate,
  keepIds: readonly string[] = [],
): T {
  if (!readOnly || !context) return context;
  const reason = tt(VIEW_ONLY_HINT);
  const keep = new Set(keepIds);
  const controls = context.controls.map((control) =>
    keep.has(control.id)
      ? control
      : { ...control, disabled: true, unavailableReason: reason },
  );
  return { ...context, controls } as T;
}

/** 上传 / 拖放入口：只读时丢弃文件，不交给编辑器（编辑器内核也会拒绝，这里让入口自己就不动作）。 */
export function viewOnlyUploadHandler(
  readOnly: boolean,
  handler: (files: File[]) => void | Promise<void>,
): (files: File[]) => void | Promise<void> {
  if (!readOnly) return handler;
  return () => undefined;
}
