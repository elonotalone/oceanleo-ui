"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { ADVANCED_HEADER_PRIMARY_ACTION_CLASS } from "../advanced-workbench-chrome";
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
  const savedItem = useMemo(
    () =>
      editor.draftSavedUrl
        ? advancedSavedItem(item, { url: editor.draftSavedUrl })
        : null,
    [editor.draftSavedUrl, item],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const url = await editor.saveDraft();
    return url
      ? { ok: true as const, item: advancedSavedItem(item, { url }) }
      : { ok: false as const };
  }, [editor.saveDraft, item]);
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel(editorRouteFor(item))}
      editorDrawerLabel="媒体与轨道"
      editorDrawerIcon="timeline"
      editorToolbox={
        <VideoTimelineControls state={editor} accent={accent} />
      }
      editorContextualToolbar={
        <VideoTimelineContextToolbar state={editor} accent={accent} />
      }
      editorHistory={{
        canUndo: editor.canUndo,
        canRedo: editor.canRedo,
        undo: editor.undo,
        redo: editor.redo,
      }}
      editorViewport={{
        value: Math.round((editor.pxPerSecond / 80) * 100),
        min: 10,
        max: 600,
        step: 5,
        setValue: (value) => editor.setPxPerSecond((value / 100) * 80),
        fit: () => editor.setPxPerSecond(80),
      }}
      editorHeaderActions={
        <button
          type="button"
          onClick={() =>
            editor.exporting
              ? editor.cancelExport()
              : void editor.exportVideo()
          }
          className={ADVANCED_HEADER_PRIMARY_ACTION_CLASS}
          style={{
            background: editor.exporting ? "#b42318" : accent,
          }}
        >
          {editor.exporting ? "取消渲染" : "导出视频"}
        </button>
      }
      editorStage={<VideoTimelineStage state={editor} accent={accent} />}
      editorStatus={editor.error || editor.notice}
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={`${editor.draftSavedUrl}|${editor.exportedUrl}`}
      onClose={onClose}
    />
  );
}
