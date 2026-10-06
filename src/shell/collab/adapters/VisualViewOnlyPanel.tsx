"use client";

/**
 * 侧边面板的「只能看」外壳（work-chat 第二轮 F08）：PPT / 图表 / 图片的创建、素材、图层、字体、AI 等面板
 * 里全是会改作品的按钮。只读时整块包进 `<fieldset disabled>`——浏览器自己把里面所有按钮、输入框、下拉
 * 一起灰掉（原生行为，不用一个个传 disabled），悬停提示「你只能查看」，顶部再放一句说明。
 * 拖放、粘贴在捕获阶段拦掉，不让它们到达面板里的处理函数。
 *
 * `readOnly` 为 false 时原样返回子节点（不多包一层，布局与现在完全一致）。
 */
import type { ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { VIEW_ONLY_HINT, VIEW_ONLY_PANEL_NOTE } from "./visual-readonly";

export function VisualViewOnlyPanel({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children: ReactNode;
}) {
  const tt = useUI();
  if (!readOnly) return <>{children}</>;
  return (
    <fieldset
      disabled
      aria-disabled="true"
      title={tt(VIEW_ONLY_HINT)}
      data-view-only="true"
      className="m-0 min-w-0 border-0 p-0 opacity-70"
      onDropCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPasteCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <p
        role="note"
        className="mb-2 px-1 text-[12px] leading-relaxed text-[var(--muted,#78716c)]"
      >
        {tt(VIEW_ONLY_PANEL_NOTE)}
      </p>
      {children}
    </fieldset>
  );
}
