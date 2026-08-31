"use client";

// edit bar 上的按钮。会展开左侧面板的那种必须带 chevron 和 active 态——
// 把面板改成「点开才有」以后，如果没有可见的展开提示，功能等于被藏了。
//
// 命中区（W04，2026-08-31）：本文件此前是 `h-9`(36px)，自己拼了一整串类名，
// 包括展开态的三条配色。现在走 `ui/Button`：高度 44、焦点环内建不可关，
// 展开态改用原语的 `selected`——它**整套替换**变体配色，不是叠在上面，
// 因为同类 Tailwind 工具类谁赢由样式表顺序决定，而 `tailwind-merge` 被红线 6 挡着。
// 唯一有意舍掉的是「未展开时 hover 出一圈边框」：原语各变体的边框色是固定的，
// 换来的是展开/收起之间不再有 1px 的几何跳动。

import type { ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { Button } from "../../ui/Button";
import { AdvancedEditorIcon, type WorkbenchIconName } from "../AdvancedEditorIcon";
import { usePluginChromePanelHost } from "./PluginChromeFrame";

export function PluginChromeEditBarButton({
  label,
  icon,
  panelId,
  onTrigger,
  disabled,
  active,
  children,
}: {
  label: string;
  icon?: WorkbenchIconName;
  /** 给了就是「展开左侧面板」型按钮，自动带 chevron。 */
  panelId?: string;
  onTrigger?: () => void;
  disabled?: boolean;
  active?: boolean;
  children?: ReactNode;
}) {
  const tt = useUI();
  const panels = usePluginChromePanelHost();
  const expanded = panelId ? panels.isOpen(panelId) : Boolean(active);

  return (
    <Button
      variant="ghost"
      selected={expanded}
      data-plugin-chrome-edit-button={panelId || label}
      aria-expanded={panelId ? expanded : undefined}
      aria-pressed={panelId ? undefined : active}
      disabled={disabled}
      title={tt(label)}
      onClick={() => {
        if (panelId) panels.togglePanel(panelId);
        onTrigger?.();
      }}
    >
      {icon && <AdvancedEditorIcon name={icon} className="h-4 w-4" />}
      <span>{tt(label)}</span>
      {children}
      {panelId && (
        <AdvancedEditorIcon
          name="chevron"
          className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      )}
    </Button>
  );
}

/** edit bar 内的分组分隔线，保证各插件的分组视觉一致。 */
export function PluginChromeEditBarDivider() {
  return (
    <span
      aria-hidden="true"
      className="mx-1 h-6 w-px shrink-0 bg-[var(--pchrome-line)]"
    />
  );
}
