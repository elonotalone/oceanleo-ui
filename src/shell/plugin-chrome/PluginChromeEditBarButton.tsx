"use client";

// edit bar 上的按钮。会展开左侧面板的那种必须带 chevron 和 active 态——
// 把面板改成「点开才有」以后，如果没有可见的展开提示，功能等于被藏了。
//
// 高度钉在 EDIT_BAR_CONTROL_SIZE_PX。ui/Button 没有 28 这一档：size="sm"
// 声明「比 44 小」，真实几何用 style 盖过 h-9，避免同类工具类谁赢靠样式表顺序。

import type { ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { Button } from "../../ui/Button";
import { AdvancedEditorIcon, type WorkbenchIconName } from "../AdvancedEditorIcon";
import {
  EDIT_BAR_CONTROL_SIZE_PX,
  EDIT_BAR_DIVIDER_CLASS,
  EDIT_BAR_TOUCH_EXTEND_CLASS,
} from "../edit-bar-surface";
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
      size="sm"
      selected={expanded}
      data-plugin-chrome-edit-button={panelId || label}
      aria-expanded={panelId ? expanded : undefined}
      aria-pressed={panelId ? undefined : active}
      disabled={disabled}
      title={tt(label)}
      className={EDIT_BAR_TOUCH_EXTEND_CLASS}
      style={{
        height: EDIT_BAR_CONTROL_SIZE_PX,
        minHeight: EDIT_BAR_CONTROL_SIZE_PX,
        paddingBlock: 0,
        paddingInline: 8,
        fontSize: 12,
      }}
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
          className={`h-3 w-3 transition-transform duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] ${expanded ? "rotate-180" : ""}`}
        />
      )}
    </Button>
  );
}

/** edit bar 内的分组分隔线，保证各插件的分组视觉一致。 */
export function PluginChromeEditBarDivider() {
  return <span aria-hidden="true" className={EDIT_BAR_DIVIDER_CLASS} />;
}
