"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { ADVANCED_EDITOR_FONTS } from "../AdvancedFontPicker";
import { selectionAdapterContext } from "../selection-adapter";
import type {
  SelectionAdapter,
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import { deckCellElement, type DeckCellSelection } from "./deck-table-format";
import { deckSlideSelectionContext } from "./deck-slide-selection-context";
import { applyDeckToolbarCommand } from "./deck-toolbar-command";
import { deckObjectGeometryControls } from "./deck-object-geometry-controls";
import { deckToolbarControlAllowed } from "./DeckMutationPolicy";
import {
  deckElementBar,
  deckElementSelectionControls,
} from "./deck-edit-bar-controls";
import type { DeckEditorState } from "./use-deck-editor";
import { viewOnlyContext } from "../collab/adapters/visual-readonly";

export { deckObjectGeometryControls };

/**
 * 演示的选区工具条。选中对象时出统一编辑栏（`deck-edit-bar-controls.ts`），
 * 没选中对象时出页面级控件（版式、背景、过渡……）。选中后再次单击 / Enter / F2 编辑文字，
 * 栏上不再有单独的「编辑文字」键（10-23 D9：不许借用 T / A 图标）。
 */
export function useDeckSelectionAdapter({
  editor,
  readOnly: readOnlyProp,
}: {
  editor: DeckEditorState;
  readOnly?: boolean; // 只能查看：整条灰掉、悬停「你只能查看」；缺省取 editor.readOnly
}): SelectionAdapter {
  const tt = useUI();
  const element = editor.selectedElement;
  const slide = editor.activeSlide;
  const [cell, setCell] = useState<DeckCellSelection | null>(null);
  const elementId = element?.id;
  const slideId = slide.id;
  const activeCell = cell?.elementId === elementId && cell?.slideId === slideId && element?.type === "table" ? cell : null;
  const formattedElement = useMemo(() => element && activeCell ? deckCellElement(element, activeCell.row, activeCell.column) : element, [element, activeCell]);
  useEffect(() => {
    const select = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-deck-cell]") : null;
      const owner = target?.closest<HTMLElement>("[data-deck-element]");
      if (!target || !owner || !elementId || owner.dataset.deckElement !== elementId) return;
      const [row, column] = (target.dataset.deckCell || "").split(":").map(Number);
      if (Number.isInteger(row) && Number.isInteger(column)) setCell(current => current?.elementId === elementId && current.slideId === slideId && current.row === row && current.column === column ? current : { elementId, slideId, row, column });
    };
    document.addEventListener("pointerdown", select);
    document.addEventListener("focusin", select);
    return () => { document.removeEventListener("pointerdown", select); document.removeEventListener("focusin", select); };
  }, [elementId, slideId]);
  const inheritedFont = editor.activeMaster?.fontFamily || "";
  const context = useMemo<SelectionContext | null>(() => {
    if (!element) return deckSlideSelectionContext(editor, tt);
    return {
      version: 1,
      kind: `slide-${element.type}`,
      id: activeCell ? `${slide.id}:${element.id}:cell:${activeCell.row}:${activeCell.column}` : element.id,
      bar: deckElementBar(element),
      label:
        element.label ||
        element.alt ||
        tt(
          element.type === "text"
            ? "文字"
            : element.type === "image"
              ? "图片"
              : element.type === "shape"
                ? "形状"
                : "对象",
        ),
      controls: deckElementSelectionControls(
        formattedElement!,
        tt,
        inheritedFont,
        ADVANCED_EDITOR_FONTS,
      ),
    };
  }, [editor.activeIndex, editor.deck.slides.length, element, formattedElement, activeCell, inheritedFont, slide, tt]);
  const viewContext = useMemo(
    () => viewOnlyContext(context, readOnlyProp ?? editor.readOnly, tt),
    [context, readOnlyProp, editor.readOnly, tt],
  );

  const latest = useRef({ editor, context, element, activeCell, formattedElement, readOnly: readOnlyProp ?? editor.readOnly });
  latest.current = { editor, context, element, activeCell, formattedElement, readOnly: readOnlyProp ?? editor.readOnly };
  const command = (message: SelectionCommand) => {
    const { editor, context, element, activeCell, formattedElement, readOnly } = latest.current;
    if (readOnly || editor.loading || editor.sourceFailed) return;
    if (!context || message.selectionId !== context.id) return;
    if (element && !deckToolbarControlAllowed(element, message.controlId)) {
      return;
    }
    const textIds = ["font-family", "font-size", "bold", "italic", "underline", "strike", "text-color", "highlight", "align", "list", "line-height", "link", "letter-spacing", "case", "vertical-text", "indent-increase", "indent-decrease", "clear-format"];
    if (element && activeCell && textIds.includes(message.controlId)) {
      const cellEditor = { ...editor,
        patchElement: (_id: string, patch: Partial<typeof element>) => editor.patchElement(element.id, cellPatch(patch)),
        patchElementTransient: (_id: string, patch: Partial<typeof element>) => editor.patchElementTransient(element.id, cellPatch(patch)),
      };
      const cellPatch = (patch: Partial<typeof element>): Partial<typeof element> => {
        if (patch.rows) {
          const rows = element.rows?.map(row => [...row]);
          if (rows?.[activeCell.row]) rows[activeCell.row][activeCell.column] = patch.rows[activeCell.row]?.[activeCell.column] || "";
          return { rows };
        }
        if (message.controlId === "clear-format") patch = { ...patch, fontFamily: editor.activeMaster.fontFamily || "", fontSize: 18, color: editor.activeMaster.textColor || "", link: "", strike: false, highlight: "" };
        return { cellStyles: { ...element.cellStyles, [`${activeCell.row}:${activeCell.column}`]: { ...element.cellStyles?.[`${activeCell.row}:${activeCell.column}`], ...patch } } };
      };
      applyDeckToolbarCommand(cellEditor, formattedElement, message);
    } else applyDeckToolbarCommand(editor, element, message);
  };
  return { context: editor.loading ? null : selectionAdapterContext(viewContext), dispatch: command };
}
