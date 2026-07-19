"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
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
  const context = useMemo<SelectionContext>(() => {
    const selected = editor.selectedAnnotation;
    const selectedIndex = selected
      ? editor.annotations.findIndex((annotation) => annotation.id === selected.id)
      : -1;
    const controls: SelectionControl[] = selected
      ? [
          {
            id: "annotation-text",
            kind: "text",
            label: tt("批注内容"),
            value: editor.annotationText,
            disabled: busy,
            slot: "inspector",
            inspectorGroup: "pdf-annotation",
            inspectorLabel: tt("编辑所选批注"),
            inspectorIcon: "note",
          },
          {
            id: "annotation-update",
            kind: "action",
            label: tt("保存批注修改"),
            icon: "save",
            iconOnly: true,
            disabled:
              busy ||
              (selected.kind === "text" && !editor.annotationText.trim()),
            slot: "inspector",
            inspectorGroup: "pdf-annotation",
            inspectorLabel: tt("编辑所选批注"),
            inspectorIcon: "note",
          },
          {
            id: "annotation-delete",
            kind: "action",
            label: tt("删除所选批注"),
            icon: "delete",
            iconOnly: true,
            danger: true,
            disabled: busy,
            slot: "inspector",
            inspectorGroup: "pdf-annotation",
            inspectorLabel: tt("编辑所选批注"),
            inspectorIcon: "note",
          },
        ]
      : [
          {
            id: "rotate-left",
            kind: "action",
            label: tt("逆时针旋转 90°"),
            icon: "rotate",
            iconOnly: true,
            disabled: busy,
            placement: "more",
          },
          {
            id: "rotate-right",
            kind: "action",
            label: tt("顺时针旋转 90°"),
            icon: "rotate",
            iconOnly: true,
            disabled: busy,
            placement: "more",
          },
          {
            id: "move-before",
            kind: "action",
            label: tt("前移一页"),
            icon: "send-backward",
            iconOnly: true,
            disabled: busy || editor.pageNumber <= 1,
            placement: "more",
          },
          {
            id: "move-after",
            kind: "action",
            label: tt("后移一页"),
            icon: "bring-forward",
            iconOnly: true,
            disabled: busy || editor.pageNumber >= editor.pageCount,
            placement: "more",
          },
          {
            id: "extract",
            kind: "action",
            label: tt("提取本页"),
            icon: "download",
            iconOnly: true,
            disabled: busy,
            placement: "more",
          },
          ...(editor.annotations.length
            ? [
                {
                  id: "annotation-select",
                  kind: "select" as const,
                  label: tt("已有批注"),
                  icon: "note" as const,
                  iconOnly: true,
                  value: "",
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
            id: "delete",
            kind: "action",
            label: tt("删除本页"),
            icon: "delete",
            iconOnly: true,
            danger: true,
            disabled: busy || editor.pageCount <= 1,
            placement: "more",
          },
        ];
    return {
      version: 1,
      kind: selected ? "pdf-annotation" : "pdf-page",
      id: selected
        ? `annotation:${editor.pageNumber}:${Math.max(0, selectedIndex)}`
        : `page:${editor.pageNumber}`,
      label: selected
        ? selected.contents || tt("PDF 批注")
        : tt("第 {page} 页", { page: editor.pageNumber }),
      controls,
    };
  },
    [
      busy,
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
