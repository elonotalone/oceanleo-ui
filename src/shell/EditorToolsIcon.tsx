import { forwardRef } from "react";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import type { AdvancedToolsLauncher } from "./advanced-layout-context";
import type { SelectionControlIcon } from "./selection-context";

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

export const EditorToolsTrigger = forwardRef<
  HTMLButtonElement,
  {
    selectionKind: string;
    launcher: AdvancedToolsLauncher | null;
    accent: string;
  }
>(function EditorToolsTrigger(
  { selectionKind, launcher, accent },
  ref,
) {
  const available = Boolean(launcher?.available);
  const label = launcher?.label || "编辑工具";
  const accessibleLabel = available
    ? label
    : `${label}：${launcher?.unavailableReason || "当前编辑器没有可用工具"}`;
  return (
    <button
      ref={ref}
      type="button"
      data-editor-tools-trigger
      aria-disabled={!available}
      onClick={() => {
        if (available) launcher?.toggle();
      }}
      aria-label={accessibleLabel}
      aria-haspopup={available ? "dialog" : undefined}
      aria-expanded={available ? launcher?.expanded || false : undefined}
      aria-controls={available ? launcher?.controlsId : undefined}
      title={accessibleLabel}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent,#7c3aed)]/40 ${
        available
          ? "hover:brightness-95"
          : "cursor-not-allowed opacity-40"
      }`}
      style={{
        color: accent,
        background: `color-mix(in srgb, ${accent} 9%, var(--card,#fff))`,
      }}
    >
      <EditorToolsIcon
        selectionKind={selectionKind}
        className="h-[18px] w-[18px]"
      />
    </button>
  );
});
