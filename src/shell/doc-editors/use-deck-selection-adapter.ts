"use client";

import { useMemo, useRef } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { ADVANCED_EDITOR_FONTS } from "../AdvancedFontPicker";
import { selectionAdapterContext } from "../selection-adapter";
import type {
  SelectionAdapter,
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
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
 * 没选中对象时出页面级控件（版式、背景、过渡……）。编辑文字靠双击 / Enter / F2，
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
  const inheritedFont = editor.activeMaster?.fontFamily || "";
  const context = useMemo<SelectionContext | null>(() => {
    if (!element) return deckSlideSelectionContext(editor, tt);
    return {
      version: 1,
      kind: `slide-${element.type}`,
      id: element.id,
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
        element,
        tt,
        inheritedFont,
        ADVANCED_EDITOR_FONTS,
      ),
    };
  }, [editor.activeIndex, editor.deck.slides.length, element, inheritedFont, slide, tt]);
  const viewContext = useMemo(
    () => viewOnlyContext(context, readOnlyProp ?? editor.readOnly, tt),
    [context, readOnlyProp, editor.readOnly, tt],
  );

  const latest = useRef({ editor, context, element, readOnly: readOnlyProp ?? editor.readOnly });
  latest.current = { editor, context, element, readOnly: readOnlyProp ?? editor.readOnly };
  const command = (message: SelectionCommand) => {
    const { editor, context, element, readOnly } = latest.current;
    if (readOnly || editor.loading || editor.sourceFailed) return;
    if (!context || message.selectionId !== context.id) return;
    if (element && !deckToolbarControlAllowed(element, message.controlId)) {
      return;
    }
    applyDeckToolbarCommand(editor, element, message);
  };
  return { context: editor.loading ? null : selectionAdapterContext(viewContext), dispatch: command };
}
