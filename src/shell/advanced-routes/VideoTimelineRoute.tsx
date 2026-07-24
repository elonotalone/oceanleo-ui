"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { advancedSavedItem } from "../advanced-session";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import {
  VideoTimelineControls,
  VideoTimelineContextToolbar,
  VideoTimelineStage,
  useVideoTimeline,
} from "../video-editor";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
  type WorkbenchMaterialPlacement,
} from "../workbench-material-provider";
import { timelineMsAtClientPoint } from "../video-editor/timeline-viewport";

function timelineInsertionMs(
  placement: WorkbenchMaterialPlacement | undefined,
  fallback: number,
): number {
  if (
    placement?.source !== "drop" ||
    typeof placement.clientX !== "number" ||
    typeof placement.clientY !== "number" ||
    typeof document === "undefined"
  ) {
    return fallback;
  }
  const timeline = document.querySelector<HTMLElement>(
    "[data-video-timeline-content]",
  );
  const rect = timeline?.getBoundingClientRect();
  const pxPerSecond = Number(timeline?.dataset.pxPerSecond);
  return timelineMsAtClientPoint(
    {
      clientX: placement.clientX,
      clientY: placement.clientY,
    },
    rect
      ? {
          left: rect.left,
          top: rect.top,
          bottom: rect.bottom,
          pxPerSecond,
        }
      : null,
    fallback,
  );
}

export function VideoTimelineRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useVideoTimeline(item, siteId);
  const sourceStopped = !editor.loadingSource && !editor.sourceReady;
  const sourcePending = editor.loadingSource && !editor.sourceReady;
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "video-timeline-materials@2",
      actions: ["insert"],
      accepts: (material) => {
        if (editor.loadingSource) return false;
        const url =
          material.url || material.previewUrl || material.thumbUrl || "";
        const mime = String(material.meta.mime || "").toLowerCase();
        return (
          ["video", "audio", "image"].includes(material.kind) ||
          /^(?:video|audio|image)\//.test(mime) ||
          /\.(?:mp4|webm|mov|m4v|mp3|wav|m4a|ogg|png|jpe?g|webp|gif)(?:$|[?#])/i.test(
            url,
          )
        );
      },
      mutate: async (_action, material, placement) => {
        if (editor.loadingSource) {
          throw new Error("时间线源仍在载入，请完成后再导入媒体。");
        }
        const url =
          material.url || material.previewUrl || material.thumbUrl || "";
        if (!url) throw new Error("这个媒体素材没有可用地址。");
        await editor.addMediaUrl(
          url,
          timelineInsertionMs(placement, editor.playheadMs),
        );
      },
    }),
    [editor.addMediaUrl, editor.loadingSource, editor.playheadMs],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.saveDraft();
    return saved?.url
      ? {
          ok: true as const,
          item: advancedSavedItem(item, {
            url: saved.url,
            versionId: saved.versionId,
            meta: {
              editor_project_url: saved.projectUrl,
              editor_project_schema: saved.projectSchema,
            },
          }),
        }
      : {
          ok: false as const,
          error:
            editor.error ||
            (!editor.sourceReady
              ? "时间线源未成功载入，未保存空回退工程。"
              : "时间线草稿保存失败"),
        };
  }, [editor.error, editor.saveDraft, editor.sourceReady, item]);
  const addLocalMedia = useCallback(
    async (files: File[]) => {
      for (const file of files) await editor.addMediaFile(file);
    },
    [editor.addMediaFile],
  );
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "video-timeline",
        label: editorToolLabel(editorRouteFor(item)),
        toolbox: {
          label: "媒体与轨道",
          icon: "timeline",
          content: <VideoTimelineControls state={editor} accent={accent} />,
        },
        contextToolbar: (
          editor.sourceReady ? (
            <VideoTimelineContextToolbar state={editor} accent={accent} />
          ) : null
        ),
        history: {
          canUndo: editor.sourceReady && editor.canUndo,
          canRedo: editor.sourceReady && editor.canRedo,
          undo: () => {
            if (editor.sourceReady) editor.undo();
          },
          redo: () => {
            if (editor.sourceReady) editor.redo();
          },
        },
        directDownload: {
          id: "video-export",
          label: "直接导出视频",
          icon: "download",
          busyLabel: "渲染中…",
          busy: editor.exporting,
          disabled:
            editor.exporting || editor.loadingSource || !editor.sourceReady,
          onTrigger: editor.exportVideo,
        },
        actions: editor.exporting
          ? [
              {
                id: "video-cancel-export",
                label: "取消渲染",
                variant: "danger",
                onTrigger: editor.cancelExport,
              },
            ]
          : [],
        upload: editor.loadingSource
          ? undefined
          : {
              accept: "video/*,audio/*,image/*",
              multiple: true,
              onFiles: addLocalMedia,
            },
        stage: sourcePending ? (
          <div
            role="status"
            className="flex h-full items-center justify-center bg-stone-50 p-8 text-center text-sm text-stone-600"
          >
            正在验证时间线工程与媒体源…
          </div>
        ) : sourceStopped ? (
          <div
            role="alert"
            className="flex h-full items-center justify-center bg-stone-50 p-8 text-center text-sm text-rose-700"
          >
            {editor.error ||
              "时间线源未成功载入，空回退工程已停止编辑与导出。可导入经过验证的媒体或恢复本地草稿。"}
          </div>
        ) : (
          <VideoTimelineStage state={editor} accent={accent} />
        ),
        status:
          editor.error ||
          editor.notice ||
          (sourcePending ? "正在验证时间线工程与媒体源…" : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("video-timeline", item),
            ready: !editor.loadingSource,
            capture: () =>
              editor.sourceReady ? structuredClone(editor.doc) : null,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
