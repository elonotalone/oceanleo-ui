"use client";

import { useUI } from "../../i18n/ui/useUI";
import { Button } from "../../ui/Button";
import {
  actionGroup,
  type AdvancedWorkbenchAction,
} from "../advanced-workbench-chrome";
import { AdvancedEditorIcon, type WorkbenchIconName } from "../AdvancedEditorIcon";
import { preserveEditBarSelection } from "../edit-bar-selection-preserve";

/**
 * 编辑栏「文档段」（规范 v2 §4）：只画 `group === "edit"` 的成品级编辑动作
 * （重新计算 / 手机 / 平板 / 桌面 / 运行全部 …）。save / download 组即使被传进来
 * 也在这里过滤掉——它们分别住第一行的保存菜单与下载菜单，编辑栏永不出现。
 *
 * 作为 `FloatingContextToolbar` 的 `documentSegment` 内容渲染（X2 负责与选中对象
 * 工具、AI 助手同一行内联）；本组件自己也是单行：`flex-nowrap` + `whitespace-nowrap`。
 */
export interface EditBarDrawerButton {
  id: string;
  label: string;
  icon: WorkbenchIconName;
}

/**
 * D3（2026-10-23）：原来藏在「编辑工具」图标里的抽屉，改成编辑栏里带文字的按钮。
 * 宿主只在**没选中任何东西**时传 `drawers`；选中对象后传空，让位给选区控件。
 * 打开着的那一个是选中态，再点一次收起。
 */
export function EditBarDocumentSegment({
  actions,
  onTrigger,
  emptyHint,
  drawers = [],
  activeDrawerId = "",
  onToggleDrawer,
}: {
  actions: readonly AdvancedWorkbenchAction[];
  onTrigger(a: AdvancedWorkbenchAction): void;
  emptyHint?: string;
  drawers?: readonly EditBarDrawerButton[];
  activeDrawerId?: string;
  onToggleDrawer?(drawerId: string): void;
}) {
  const tt = useUI();
  const editActions = actions.filter(
    (action) => actionGroup(action) === "edit",
  );
  const drawerButtons = onToggleDrawer
    ? drawers.map((drawer) => {
        const label = tt(drawer.label);
        const open = drawer.id === activeDrawerId;
        return (
          <Button
            key={`drawer:${drawer.id}`}
            data-edit-bar-drawer={drawer.id}
            aria-pressed={open}
            aria-label={label || drawer.id}
            onPointerDown={preserveEditBarSelection}
            onClick={() => onToggleDrawer(drawer.id)}
            variant="ghost"
            selected={open}
            pill
          >
            <AdvancedEditorIcon name={drawer.icon} className="h-4 w-4" />
            <span>{label}</span>
          </Button>
        );
      })
    : [];
  if (editActions.length === 0 && drawerButtons.length === 0) {
    if (!emptyHint) return null;
    return (
      <div
        data-edit-bar-document-segment
        className="inline-flex shrink-0 items-center whitespace-nowrap"
      >
        <span className="px-2 text-[12px] text-[var(--awb-muted)]">
          {tt(emptyHint)}
        </span>
      </div>
    );
  }
  return (
    <div
      data-edit-bar-document-segment
      className="inline-flex shrink-0 flex-nowrap items-center gap-0.5 whitespace-nowrap"
    >
      {drawerButtons}
      {editActions.map((action) => {
        const label = tt(
          action.busy && action.busyLabel ? action.busyLabel : action.label,
        );
        // 每个按钮必须有可见文字或 aria-label（规范 v2 §4 判据）：文字恒在，
        // aria-label 同步给一份，插件把 label 传成空串时读屏也不至于念不出来。
        return (
          <Button
            key={action.id}
            data-workspace-action-id={action.id}
            disabled={action.disabled || action.busy}
            aria-busy={action.busy || undefined}
            aria-label={label || action.id}
            onPointerDown={preserveEditBarSelection}
            onClick={() => onTrigger(action)}
            variant={action.variant === "danger" ? "danger" : "ghost"}
            selected={action.variant === "primary"}
            pill
          >
            {action.icon ? (
              <AdvancedEditorIcon name={action.icon} className="h-4 w-4" />
            ) : null}
            <span>{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
