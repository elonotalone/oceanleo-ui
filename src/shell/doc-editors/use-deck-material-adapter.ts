"use client";

import { useMemo } from "react";
import { advancedRootItemId } from "../advanced-session";
import type { LibraryItem } from "../library-data";
import { withEditorHistoryCommand } from "../workbench-material-command";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";
import { deckAcceptsMaterial, deckMaterialImageUrl } from "./deck-material";
import type { DeckEditorState } from "./use-deck-editor";

/**
 * 演示的素材 adapter：图片点一下插入当前页；选中图片时可替换。
 * 插入 / 替换走编辑器自己的撤销历史（W02 command 契约，`signals/W02-to-editors.md`）；
 * 载入中或文件还没有版本时不登记契约，面板如实说「还不能插入」。
 */
export function useDeckMaterialAdapter(editor: DeckEditorState, item: LibraryItem): void {
  const { insertImageElement } = editor;
  const base = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "deck-elements@2",
      actions: ["insert", "replace"],
      accepts: deckAcceptsMaterial,
      mutate: (action, material, placement) => {
        const url = deckMaterialImageUrl(material);
        if (!url) throw new Error("这个图片素材没有可用地址。");
        insertImageElement(url, material.title, action === "replace", placement);
      },
    }),
    [insertImageElement],
  );
  const selectedImage =
    editor.selectedElement?.type === "image" ? editor.selectedElement : null;
  const slideId = editor.activeSlide.id;
  const adapter = useMemo(
    () =>
      withEditorHistoryCommand(base, {
        documentId: item.artifactId ? advancedRootItemId(item) : "",
        targetRevisionId: editor.loading
          ? ""
          : String(item.revisionId || item.meta.revision_id || ""),
        replaceTarget: () =>
          selectedImage
            ? {
                targetId: selectedImage.id,
                slotId: slideId,
                geometry: {
                  x: selectedImage.x,
                  y: selectedImage.y,
                  width: selectedImage.width,
                  height: selectedImage.height,
                },
              }
            : null,
      }),
    [base, editor.loading, item, selectedImage, slideId],
  );
  useWorkbenchMaterialAdapter(adapter);
}
