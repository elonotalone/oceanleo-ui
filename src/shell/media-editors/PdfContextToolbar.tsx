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
          id: "delete",
          kind: "action",
          label: tt("删除本页"),
          danger: true,
          disabled: busy || editor.pageCount <= 1,
          placement: "more",
        },
      ],
    }),
    [busy, editor.pageCount, editor.pageNumber, tt],
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
