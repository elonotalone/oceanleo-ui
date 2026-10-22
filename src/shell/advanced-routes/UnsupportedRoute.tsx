"use client";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { editorCapabilityFor, editorToolLabel } from "../workbench-routes";

const FALLBACK_REASON = "这份内容目前只能查看和下载，不能在线编辑。";

/**
 * 没有本地编辑器能打开的存量内容（例如已下线的图表编辑器留下的图表、矢量图）。
 * 只读：宿主在舞台里用只读查看器显示内容，这里把原因用一句人话说出来。
 * 绝不嵌第三方页面，也绝不改写原件。
 */
export function UnsupportedRoute({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const reason =
    editorCapabilityFor(item).unavailableReason.trim() || FALLBACK_REASON;
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "none",
        label: editorToolLabel({ type: "none" }),
        stage: null,
        available: false,
        notices: [{ id: "read-only-reason", text: reason, severity: "info" }],
      }}
      onClose={onClose}
    />
  );
}
