"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { ADVANCED_HEADER_ACTION_CLASS } from "../advanced-workbench-chrome";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { GridContextToolbar } from "../doc-editors/GridContextToolbar";
import { GridControls } from "../doc-editors/GridControls";
import { GridStage } from "../doc-editors/GridStage";
import { useGridEditor } from "../doc-editors/use-grid-editor";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

export function GridRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useGridEditor(item, siteId);
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "grid-materials@2",
      actions: ["replace"],
      accepts: (material) => {
        const url = material.url || material.previewUrl || "";
        const format = String(material.meta.format || "").toLowerCase();
        return (
          material.kind === "sheet" ||
          ["csv", "tsv", "xlsx", "xls"].includes(format) ||
          /\.(?:csv|tsv|xlsx?|xlsm)(?:$|[?#])/i.test(url)
        );
      },
      mutate: async (_action, material) => {
        const url = material.url || material.previewUrl || "";
        if (!url) throw new Error("这个表格素材没有可用地址。");
        const blob = await fetchMediaBlob(url, { maxBytes: 64 * 1024 * 1024 });
        const extension =
          String(material.meta.format || "").toLowerCase() ||
          url.split(/[?#]/)[0].split(".").pop() ||
          "xlsx";
        await editor.importSource(
          new File([blob], `${material.title || "table"}.${extension}`, {
            type: blob.type || "application/octet-stream",
          }),
        );
      },
    }),
    [editor.importSource],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
  const savedItem = useMemo(
    () =>
      editor.savedUrl
        ? advancedSavedItem(item, { url: editor.savedUrl })
        : null,
    [editor.savedUrl, item],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const url = await editor.save();
    return url
      ? { ok: true as const, item: advancedSavedItem(item, { url }) }
      : { ok: false as const };
  }, [editor.save, item]);
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "grid" })}
      editorDrawerLabel="数据与工作表"
      editorDrawerIcon="pages"
      editorToolbox={<GridControls editor={editor} accent={accent} />}
      editorContextualToolbar={
        <GridContextToolbar editor={editor} accent={accent} />
      }
      editorHistory={{
        canUndo: editor.canUndo,
        canRedo: editor.canRedo,
        undo: editor.undo,
        redo: editor.redo,
      }}
      editorHeaderActions={
        <>
          <button
            type="button"
            onClick={editor.exportCsv}
            className={ADVANCED_HEADER_ACTION_CLASS}
          >
            CSV
          </button>
          <button
            type="button"
            disabled={editor.exporting}
            onClick={() => void editor.exportXlsx()}
            className={ADVANCED_HEADER_ACTION_CLASS}
          >
            XLSX
          </button>
        </>
      }
      editorStage={<GridStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        (editor.dirty
          ? "有未保存的修改"
          : editor.savedUrl
          ? "已保存到我的库"
          : editor.loading
            ? "正在载入表格"
            : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
