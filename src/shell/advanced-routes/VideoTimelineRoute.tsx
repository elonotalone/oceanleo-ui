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
  if (
    !rect ||
    placement.clientY < rect.top ||
    placement.clientY > rect.bottom ||
    !Number.isFinite(pxPerSecond) ||
    pxPerSecond <= 0
  ) {
    return fallback;
  }
  return Math.max(
    0,
    Math.round(((placement.clientX - rect.left) / pxPerSecond) * 1_000),
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
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "video-timeline-materials@2",
      actions: ["insert"],
      accepts: (material) => {
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
        const url =
          material.url || material.previewUrl || material.thumbUrl || "";
        if (!url) throw new Error("这个媒体素材没有可用地址。");
        await editor.addMediaUrl(
          url,
          timelineInsertionMs(placement, editor.playheadMs),
        );
      },
    }),
    [editor.addMediaUrl, editor.playheadMs],
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
      : { ok: false as const };
  }, [editor.saveDraft, item]);
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
          <VideoTimelineContextToolbar state={editor} accent={accent} />
        ),
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          undo: editor.undo,
          redo: editor.redo,
        },
        viewport: {
          value: Math.round((editor.pxPerSecond / 80) * 100),
          min: 10,
          max: 600,
          step: 5,
          setValue: (value) => editor.setPxPerSecond((value / 100) * 80),
          fit: () => editor.setPxPerSecond(80),
        },
        directDownload: {
          id: "video-export",
          label: "直接导出视频",
          icon: "download",
          busyLabel: "渲染中…",
          busy: editor.exporting,
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
        upload: {
          accept: "video/*,audio/*,image/*",
          multiple: true,
          onFiles: addLocalMedia,
        },
        stage: <VideoTimelineStage state={editor} accent={accent} />,
        status: editor.error || editor.notice,
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("video-timeline", item),
            ready: !editor.loadingSource,
            capture: () => structuredClone(editor.doc),
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
