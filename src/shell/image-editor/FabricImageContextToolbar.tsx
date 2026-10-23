"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type { SelectionCommand, SelectionContext } from "../selection-context";
import { dispatchFabricImageCommand } from "./fabric-image-commands";
import {
  buildFabricImageToolbarControls,
  fabricImageSelectionBar,
} from "./fabric-image-toolbar-controls";
import { ADVANCED_EDITOR_FONTS } from "../AdvancedFontPicker";
import type { FabricImageEditorState } from "./types";

export {
  buildFabricImageToolbarControls,
  primaryImageToolbarControlIds,
} from "./fabric-image-toolbar-controls";
import { viewOnlyContext } from "../collab/adapters/visual-readonly";

const FONT_OPTIONS = ADVANCED_EDITOR_FONTS.map((font) => ({
  value: font.family,
  label: font.label,
}));

export function FabricImageContextToolbar({
  editor,
  accent = "#4f46e5",
  readOnly: readOnlyProp,
}: {
  editor: FabricImageEditorState & { collab?: { readOnly: boolean } };
  accent?: string;
  /** 只能查看（浏览者，或别人正占着编辑）：改动类控件全灰、悬停提示「你只能查看」。缺省取编辑器自己的只读状态。 */
  readOnly?: boolean;
}) {
  const tt = useUI();
  const readOnly = readOnlyProp ?? Boolean(editor.collab?.readOnly);
  const selected = editor.selected;
  const filters = editor.filterInfo?.settings;
  const context = useMemo<SelectionContext | null>(() => {
    if (!selected) return null;
    const controls = buildFabricImageToolbarControls({
      selected,
      cropping: editor.cropping,
      cropRatio: editor.cropRatio,
      loading: editor.loading,
      sourceReady: editor.sourceReady,
      saving: editor.saving,
      transformInfo: editor.transformInfo,
      filters,
      layers: editor.layers,
      fonts: FONT_OPTIONS,
      tt,
    });
    return {
      version: 1,
      kind: selected.kind,
      bar: fabricImageSelectionBar(selected, editor.cropping),
      id: selected.id,
      label: tt("已选 {kind}", { kind: selected.kind }),
      controls,
    };
  }, [
    editor.cropRatio,
    editor.cropping,
    editor.layers,
    editor.loading,
    editor.saving,
    editor.sourceReady,
    editor.transformInfo,
    filters,
    selected,
    tt,
  ]);

  // 这条浮条里没有纯查看类控件（缩放、导出在宿主栏）：只读时整条灰掉
  const viewContext = useMemo(
    () => viewOnlyContext(context, readOnly, tt),
    [context, readOnly, tt],
  );

  const command = (message: SelectionCommand) => {
    if (readOnly) return;
    if (!context) return;
    if (message.selectionId !== context.id) return;
    if (message.transactionId && message.phase === "start") {
      editor.beginGesture();
      return;
    }
    if (message.transactionId && message.phase === "cancel") {
      editor.cancelGesture();
      return;
    }
    dispatchFabricImageCommand(editor, message);
    if (message.transactionId && message.phase === "commit") {
      editor.endGesture();
    }
  };

  return (
    <SelectionToolbar
      context={viewContext}
      onCommand={command}
      accent={accent}
    />
  );
}
