"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import type { PdfWorkbenchState } from "./use-pdf-workbench";

export function PdfContextToolbar({
  editor,
  accent = "#4f46e5",
}: {
  editor: PdfWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const busy = editor.loading || editor.processing || editor.saving;
  const context = useMemo<SelectionContext>(
    () => ({
      version: 1,
      kind: "pdf-page",
      id: `page:${editor.pageNumber}`,
      label: tt("第 {page} 页", { page: editor.pageNumber }),
      controls: [
        { id: "rotate-left", kind: "action", label: "↶ 90°", disabled: busy },
        { id: "rotate-right", kind: "action", label: "↷ 90°", disabled: busy },
        {
          id: "move-before",
          kind: "action",
          label: tt("前移一页"),
          disabled: busy || editor.pageNumber <= 1,
        },
        {
          id: "move-after",
          kind: "action",
          label: tt("后移一页"),
          disabled: busy || editor.pageNumber >= editor.pageCount,
        },
        {
          id: "extract",
          kind: "action",
          label: tt("提取本页"),
          disabled: busy,
          placement: "more",
        },
        {
          id: "annotation-select-tool",
          kind: "action",
          label:
            editor.annotationTool === "select"
              ? tt("选择批注 ✓")
              : tt("选择批注"),
          disabled: busy,
        },
        {
          id: "annotation-add",
          kind: "action",
          label:
            editor.annotationTool === "text"
              ? tt("点画布放置文字 ✓")
              : tt("放置文字批注"),
          disabled: busy || !editor.annotationText.trim(),
        },
        {
          id: "annotation-highlight-tool",
          kind: "action",
          label:
            editor.annotationTool === "highlight"
              ? tt("拖画高亮 ✓")
              : tt("拖画高亮"),
          disabled: busy,
        },
        ...(editor.annotations.length
          ? [
              {
                id: "annotation-select",
                kind: "select" as const,
                label: tt("已有批注"),
                value: editor.selectedAnnotationId,
                options: [
                  { value: "", label: tt("未选择") },
                  ...editor.annotations.map((annotation, index) => ({
                    value: annotation.id,
                    label:
                      annotation.contents ||
                      tt(
                        annotation.kind === "highlight"
                          ? "高亮 {number}"
                          : "文字批注 {number}",
                        { number: index + 1 },
                      ),
                  })),
                ],
                slot: "inspector" as const,
                inspectorGroup: "pdf-existing-annotations",
                inspectorLabel: tt("已有批注"),
                inspectorIcon: "note" as const,
              },
            ]
          : []),
        {
          id: "annotation-text",
          kind: "text",
          label: tt("批注内容"),
          value: editor.annotationText,
          disabled: busy,
          slot: "inspector",
          inspectorGroup: "pdf-annotation",
          inspectorLabel: editor.selectedAnnotation
            ? tt("编辑所选批注")
            : tt("新批注内容"),
          inspectorIcon: "note",
        },
        ...(editor.selectedAnnotation
          ? [
              {
                id: "annotation-update",
                kind: "action" as const,
                label: tt("保存批注修改"),
                disabled:
                  busy ||
                  (editor.selectedAnnotation.kind === "text" &&
                    !editor.annotationText.trim()),
                slot: "inspector" as const,
                inspectorGroup: "pdf-annotation",
                inspectorLabel: tt("编辑所选批注"),
                inspectorIcon: "note" as const,
              },
              {
                id: "annotation-delete",
                kind: "action" as const,
                label: tt("删除所选批注"),
                danger: true,
                disabled: busy,
                slot: "inspector" as const,
                inspectorGroup: "pdf-annotation",
                inspectorLabel: tt("编辑所选批注"),
                inspectorIcon: "note" as const,
              },
            ]
          : []),
        {
          id: "delete",
          kind: "action",
          label: tt("删除本页"),
          danger: true,
          disabled: busy || editor.pageCount <= 1,
          placement: "more",
        },
      ],
    }),
    [
      busy,
      editor.annotationTool,
      editor.annotations,
      editor.annotationText,
      editor.pageCount,
      editor.pageNumber,
      editor.selectedAnnotation,
      editor.selectedAnnotationId,
      tt,
    ],
  );
  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    switch (message.controlId) {
      case "rotate-left":
        void editor.rotateCurrentPage(-1);
        break;
      case "rotate-right":
        void editor.rotateCurrentPage(1);
        break;
      case "move-before":
        void editor.moveCurrentPage(-1);
        break;
      case "move-after":
        void editor.moveCurrentPage(1);
        break;
      case "extract":
        void editor.extractPages();
        break;
      case "annotation-text":
        editor.setAnnotationText(String(message.value || ""));
        break;
      case "annotation-add":
        editor.setAnnotationTool("text");
        break;
      case "annotation-highlight-tool":
        editor.setAnnotationTool("highlight");
        break;
      case "annotation-select-tool":
        editor.setAnnotationTool("select");
        break;
      case "annotation-select":
        editor.selectAnnotation(String(message.value || ""));
        break;
      case "annotation-update":
        void editor.updateSelectedAnnotation(editor.annotationText);
        break;
      case "annotation-delete":
        void editor.deleteSelectedAnnotation();
        break;
      case "delete":
        void editor.deleteCurrentPage();
        break;
    }
  };
  return (
    <SelectionToolbar
      context={context}
      onCommand={command}
      accent={accent}
    />
  );
}
