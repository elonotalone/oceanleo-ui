import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import type { SelectionControlIcon } from "./selection-context";

/**
 * 2026-10-23 D3：编辑栏最左的「编辑工具」触发器（EditorToolsTrigger）已删除，
 * 它藏的抽屉改成编辑栏空态里带文字的按钮（W02）。这里只剩选区种类 → 上下文图标，
 * 给收起后的小圆用（`FloatingContextToolbar` 的 `collapsedIcon`）。
 */

export function editorToolsIconForSelection(
  selectionKind: string,
): SelectionControlIcon {
  const value = selectionKind.toLowerCase();
  if (value.includes("canvas") || value.includes("background")) {
    return "templates";
  }
  if (value.includes("text")) return "text";
  if (value.includes("image") || value.includes("photo")) return "image";
  if (value.includes("table") || value.includes("grid")) return "table";
  if (
    value.includes("shape") ||
    value.includes("rect") ||
    value.includes("circle") ||
    value.includes("ellipse")
  ) {
    return "shape";
  }
  if (value.includes("line") || value.includes("arrow")) return "line";
  if (value.includes("path") || value.includes("draw")) return "draw";
  if (value.includes("note")) return "note";
  if (value.includes("signature")) return "signature";
  if (value.includes("slide") || value.includes("page")) return "pages";
  return "select";
}

export function EditorToolsIcon({
  selectionKind = "selection",
  className = "h-5 w-5",
}: {
  /** Optional for compatibility with the former pencil icon component. */
  selectionKind?: string;
  className?: string;
}) {
  return (
    <AdvancedEditorIcon
      name={editorToolsIconForSelection(selectionKind)}
      className={className}
    />
  );
}
