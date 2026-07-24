"use client";

import {
  useCallback,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import type { AdvancedEditorAdapter } from "./advanced-editor-adapter";
import { resolveDroppedWorkbenchMaterial } from "./inline-advanced-shell-helpers";
import type { WorkbenchMaterialAction } from "./workbench-material-provider";
import type { WorkbenchMaterialContextValue } from "./workbench-material-provider";

type Translate = (text: string) => string;

export function useInlineAdvancedWorkbenchDrop({
  adapter,
  activeMaterialAction,
  workbenchMaterials,
  tt,
}: {
  adapter: AdvancedEditorAdapter;
  activeMaterialAction: WorkbenchMaterialAction | undefined;
  workbenchMaterials: WorkbenchMaterialContextValue | null;
  tt: Translate;
}) {
  const [dropMessage, setDropMessage] = useState("");

  const performUpload = useCallback(
    async (files: File[]) => {
      if (!adapter.upload || files.length === 0) return;
      setDropMessage(tt("正在上传并添加到画布…"));
      try {
        await adapter.upload.onFiles(
          adapter.upload.multiple ? files : files.slice(0, 1),
        );
        setDropMessage(tt("文件已添加到画布"));
      } catch (error) {
        setDropMessage(
          error instanceof Error ? error.message : tt("上传失败，请重试"),
        );
      }
      window.setTimeout(() => setDropMessage(""), 1800);
    },
    [adapter.upload, tt],
  );

  const handleDrop = useCallback(
    async (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length && adapter.upload) {
        await performUpload(files);
        return;
      }
      if (!activeMaterialAction || !workbenchMaterials) return;
      const material = resolveDroppedWorkbenchMaterial(
        event.dataTransfer,
        workbenchMaterials,
      );
      if (!material) {
        setDropMessage(tt("无法读取这个素材，请从素材库重新拖入"));
        window.setTimeout(() => setDropMessage(""), 1800);
        return;
      }
      setDropMessage(tt("正在添加素材…"));
      const result = await workbenchMaterials
        .perform(activeMaterialAction, material, {
          source: "drop",
          clientX: event.clientX,
          clientY: event.clientY,
        })
        .finally(workbenchMaterials.endMaterialDrag);
      setDropMessage(
        result.ok ? tt("素材已添加到画布") : result.error || tt("素材添加失败"),
      );
      window.setTimeout(() => setDropMessage(""), 1800);
    },
    [
      activeMaterialAction,
      adapter.upload,
      performUpload,
      tt,
      workbenchMaterials,
    ],
  );

  return { dropMessage, performUpload, handleDrop };
}
