"use client";

import { useCallback } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
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
        versionId: saved.versionId,
        previewUrl: item.previewUrl || item.thumbUrl || saved.url,
        thumbUrl: item.thumbUrl || item.previewUrl,
        meta: {
          editor: chartEditorManifest(),
          content_type: "chart",
          representation: "echarts-option",
          subtype: String(item.meta.subtype || item.meta.category || ""),
          editor_project_url: saved.projectUrl,
          editor_project_schema: saved.projectSchema,
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
  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.save();
    return saved
      ? { ok: true as const, item: buildSavedItem(saved) }
      : { ok: false as const, error: editor.error || "图表保存失败" };
  }, [buildSavedItem, editor]);

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "chart-editor@1",
        label: editorToolLabel({
          type: "grid",
          adapter: "chart-editor@1",
        }),
        toolbox: {
          label: "数据与系列",
          icon: "timeline",
          content: <ChartControls editor={editor} />,
        },
        contextToolbar: (
          <ChartContextToolbar editor={editor} accent={accent} />
        ),
        stage: <ChartStage editor={editor} />,
        status:
          editor.error ||
          editor.notice ||
          (editor.loading ? "正在载入结构化图表…" : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("chart-editor@1", item),
            ready: !editor.loading,
            capture: () => structuredClone(editor.document),
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
