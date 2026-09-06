"use client";

import { useUI } from "../../i18n/ui/useUI";
import { Button } from "../../ui/Button";
import {
  actionGroup,
  type AdvancedWorkbenchAction,
} from "../advanced-workbench-chrome";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";

/**
 * 编辑栏「文档段」（规范 v2 §4）：只画 `group === "edit"` 的成品级编辑动作
 * （重新计算 / 手机 / 平板 / 桌面 / 运行全部 …）。save / download 组即使被传进来
 * 也在这里过滤掉——它们分别住第一行的保存菜单与下载菜单，编辑栏永不出现。
 *
 * 作为 `FloatingContextToolbar` 的 `documentSegment` 内容渲染（X2 负责与选中对象
 * 工具、AI 助手同一行内联）；本组件自己也是单行：`flex-nowrap` + `whitespace-nowrap`。
 */
export function EditBarDocumentSegment({
  actions,
  onTrigger,
  emptyHint,
}: {
  actions: readonly AdvancedWorkbenchAction[];
  onTrigger(a: AdvancedWorkbenchAction): void;
  emptyHint?: string;
}) {
  const tt = useUI();
  const editActions = actions.filter(
    (action) => actionGroup(action) === "edit",
  );
  if (editActions.length === 0) {
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
