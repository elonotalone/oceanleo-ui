"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { ChartContextToolbar } from "../chart-editor/ChartContextToolbar";
import { ChartControls } from "../chart-editor/ChartControls";
import { ChartStage } from "../chart-editor/ChartStage";
import {
  chartEditorManifest,
  useChartWorkbench,
  type ChartSaveResult,
} from "../chart-editor/use-chart-workbench";
import { libraryContentDescriptor, type LibraryItem } from "../library-data";
import { editorToolLabel } from "../workbench-routes";

export function ChartRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useChartWorkbench(item, siteId);
  const buildSavedItem = useCallback(
    (saved: ChartSaveResult): LibraryItem => {
      const next = advancedSavedItem(item, {
        url: saved.url,
        previewUrl: item.previewUrl || item.thumbUrl || saved.url,
        thumbUrl: item.thumbUrl || item.previewUrl,
        meta: {
          editor: chartEditorManifest(),
          content_type: "chart",
          representation: "echarts-option",
          subtype: String(item.meta.subtype || item.meta.category || ""),
        },
      });
      const {
        chart_document: _chartDocument,
        chart_option: _chartOption,
        ...sessionMeta
      } = next.meta;
      return {
        ...next,
        meta: sessionMeta,
        content: saved.json,
        descriptor: libraryContentDescriptor({
          kind: next.kind,
          meta: sessionMeta,
        }),
      };
    },
    [item],
  );
  const savedItem = useMemo(
    () => (editor.saved ? buildSavedItem(editor.saved) : null),
    [buildSavedItem, editor.saved],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.save();
    return saved
      ? { ok: true as const, item: buildSavedItem(saved) }
      : { ok: false as const, error: editor.error || "图表保存失败" };
  }, [buildSavedItem, editor]);

  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({
        type: "grid",
        adapter: "chart-editor@1",
      })}
      editorDrawerLabel="数据与系列"
      editorDrawerIcon="timeline"
      editorToolbox={<ChartControls editor={editor} />}
      editorContextualToolbar={
        <ChartContextToolbar editor={editor} accent={accent} />
      }
      editorStage={<ChartStage editor={editor} />}
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading ? "正在载入结构化图表…" : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.saved?.url || ""}
      onClose={onClose}
    />
  );
}
