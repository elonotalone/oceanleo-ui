"use client";
import { useLibraryEditReadOnly } from "../plugin-command/use-library-edit";

import { useExportDownloads } from "../doc-editors/use-export-downloads";

import { useUI } from "../../i18n/ui/useUI";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMediaBlob } from "../../lib/media-proxy";
import {
  OPENVIDEO_PROJECT_SCHEMA,
  OPENVIDEO_READONLY_NOTICE,
  openVideoToTimeline,
  parseOpenVideoStoredProject,
} from "../video-editor/openvideo-reader";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import { advancedRootItemId, advancedSavedItem } from "../advanced-session";
import { withEditorHistoryCommand } from "../workbench-material-command";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import { useEditorContext } from "../plugin-command";
import { pluginTargetForLibraryItem } from "../active-agent-file";
import { createVideoContext } from "../video-editor/video-command-surface";
import {
  fetchDeliverableBlob,
} from "../media-editors/visual-convert-client";
import { timelineTitleStem, timelineDocForStorage } from "../video-editor/video-timeline-source";
import { normalizeVisualUploads } from "../media-editors/visual-import-normalize";
import {
  visualUploadAccept,
} from "../media-editors/visual-formats";
import { useVideoTimelineSelectionAdapter } from "../video-editor/use-video-timeline-selection-adapter";
import {
  VideoTimelineControls,
  VideoTimelineStage,
  useVideoTimeline,
  type VideoTimelineState,
} from "../video-editor";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
  type WorkbenchMaterialPlacement,
} from "../workbench-material-provider";
import { timelineMsAtClientPoint } from "../video-editor/timeline-viewport";
import type { TimelineDoc } from "../video-editor/types";
import { fetchRevisionJson, useEntityCollab } from "../collab/adapters/use-entity-collab";
import {
  VIDEO_ROOT,
  videoFromEntities,
  videoFromRevisionJson,
  videoToEntities,
  videoTrackKey,
} from "../collab/adapters/video";

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

/**
 * 视频时间线只有一种编辑面：我们自己的时间线（VideoTimelineStage）。
 * 旧版「专业时间线」存的工程（oceanleo.video.openvideo.v1）只做读取：
 * 先只读打开，用户点「转换为可编辑时间线」之后才能改，保存另存为新版本。
 */
export function VideoTimelineRoute(props: AdvancedContentWorkbenchProps) {
  if (
    String(props.item.meta?.editor_project_schema || "") ===
    OPENVIDEO_PROJECT_SCHEMA
  ) {
    return <OpenVideoStoredRoute {...props} />;
  }
  return <VideoTimelineBody {...props} />;
}

type OpenVideoLoad =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; doc: TimelineDoc; dropped: string[] };

function OpenVideoStoredRoute(props: AdvancedContentWorkbenchProps) {
  const { item } = props;
  const [load, setLoad] = useState<OpenVideoLoad>({ status: "loading" });
  const [converted, setConverted] = useState(false);
  const [nonce, setNonce] = useState(0);
  const projectUrl = String(item.meta?.editor_project_url || item.url || "").trim();
  useEffect(() => {
    setConverted(false);
    if (!projectUrl) {
      setLoad({
        status: "error",
        message: "旧版时间线工程缺少工程源；已阻止用空时间线替代。",
      });
      return;
    }
    const controller = new AbortController();
    setLoad({ status: "loading" });
    void fetchMediaBlob(projectUrl, {
      maxBytes: 20 * 1024 * 1024,
      signal: controller.signal,
    })
      .then((blob) => blob.text())
      .then((text) => {
        if (controller.signal.aborted) return;
        const result = openVideoToTimeline(parseOpenVideoStoredProject(text));
        setLoad({ status: "ready", doc: result.doc, dropped: result.dropped });
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setLoad({
          status: "error",
          message:
            caught instanceof Error && caught.message
              ? caught.message
              : "旧版时间线工程读取失败",
        });
      });
    return () => controller.abort();
  }, [item.id, projectUrl, nonce]);
  // 已读出的时间线当作草稿交给编辑器；不改库里的原文件。
  const derived = useMemo(() => {
    if (load.status !== "ready") return null;
    const meta = { ...(item.meta ?? {}), timeline_doc: load.doc };
    delete (meta as Record<string, unknown>).editor_project_schema;
    delete (meta as Record<string, unknown>).editor_project_url;
    return { ...item, meta };
  }, [item, load]);
  if (load.status === "loading" || !derived) {
    if (load.status === "error") {
      return (
        <EditorSourceFailurePanel
          message={load.message}
          onReload={() => setNonce((value) => value + 1)}
          variant="surface"
        />
      );
    }
    return (
      <div
        role="status"
        className="flex h-full items-center justify-center p-8 text-center text-sm text-[var(--awb-muted,#57534e)]"
      >
        正在读取旧版时间线工程…
      </div>
    );
  }
  const droppedNote =
    load.status === "ready" && load.dropped.length
      ? `转换后不保留：${load.dropped.join("、")}。`
      : "";
  return (
    <VideoTimelineBody
      {...props}
      item={derived}
      storedReadOnly={!converted}
      storedNotice={`${OPENVIDEO_READONLY_NOTICE}${droppedNote}`}
      onConvertStored={() => setConverted(true)}
    />
  );
}

function VideoTimelineBody({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
  storedReadOnly = false,
  storedNotice = "",
  onConvertStored,
}: AdvancedContentWorkbenchProps & {
  /** 旧版工程只读打开：转换前不能改、不进协同房间、不保存。 */
  storedReadOnly?: boolean;
  storedNotice?: string;
  onConvertStored?: () => void;
}) {
  const aiReadOnly = useLibraryEditReadOnly(item);
  const editor = useVideoTimeline(item, siteId);
  const tt = useUI();
  const editorRef = useRef(editor);
  editorRef.current = editor;
  // ---- 多人同改（W14 / F07）：片段为粒度。远端改动经 applyRemoteDoc 套进来：保住选中、播放头和我自己的撤销栈，
  // 不标「未保存」、不触发自动保存、不弹「已恢复草稿」；撤销只撤我自己的改动（见 use-entity-collab 的 history）。
  const applyRemote = useCallback((next: TimelineDoc) => {
    editorRef.current.applyRemoteDoc(next);
  }, []);
  const applyLocal = useCallback((next: TimelineDoc) => {
    editorRef.current.applyLocalDoc(next);
  }, []);
  const canRestoreEntity = useCallback(
    (id: string, entity: Record<string, unknown>, doc: { entities: Record<string, unknown> }) =>
      !id.startsWith("c:") || Boolean(doc.entities[videoTrackKey(String(entity.trackId))]),
    [],
  );
  const loadRevision = useCallback(
    async (revisionId: string) => {
      const json = await fetchRevisionJson(String(item.artifactId || ""), revisionId, (found) =>
        String(found.meta.editor_project_url || found.url || ""),
      );
      return json ? videoFromRevisionJson(json) : null;
    },
    [item.artifactId],
  );
  const collab = useEntityCollab<TimelineDoc>({
    item,
    editorKind: "video",
    rootName: VIDEO_ROOT,
    toEntities: videoToEntities,
    fromEntities: (input, prev) => videoFromEntities(input, prev),
    local: editor.sourceReady && !storedReadOnly ? timelineDocForStorage(editor.doc) : null,
    applyRemote,
    applyLocal,
    canRestoreEntity,
    loadRevision,
  });
  const collabReadOnly = collab.readOnly || storedReadOnly || aiReadOnly;
  // 房间里撤销 / 重做只撤我自己的改动：舞台、工具栏、快捷键、指令面都拿这份覆盖了历史入口的编辑器视图。
  const view: VideoTimelineState = collab.history.active
    ? {
        ...editor,
        undo: collab.history.undo,
        redo: collab.history.redo,
        canUndo: collab.history.canUndo,
        canRedo: collab.history.canRedo,
      }
    : editor;
  const sourceStopped = !editor.loadingSource && !editor.sourceReady;
  const sourcePending = editor.loadingSource && !editor.sourceReady;
  const [deliverNotice, setDeliverNotice] = useState("");
  const busy = editor.exporting;
  const exportDownloads = useExportDownloads({ editor: "video-timeline", item, disabled: busy || !editor.sourceReady || editor.loadingSource,
    generate: async () => {
      const url = await editor.exportVideo();
      if (!url) throw new Error(editor.error || tt("渲染没有成功。"));
      return { blob: await fetchDeliverableBlob(url), filename: "video.mp4" };
    },
  });
  const deliver = useCallback(async (format: string) => {
    const action = exportDownloads.find(action => action.id === `video-timeline-export-${format}`);
    if (!action) throw new Error(tt("导出失败，请重试"));
    await action.onTrigger();
  }, [exportDownloads, tt]);
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "video-timeline-materials@2",
      actions: ["insert"],
      accepts: (material) => {
        if (editor.loadingSource || collabReadOnly) return false;
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
        // 视频、音频用原件（不是封面图）；图片用全图。
        const url = material.url || (material.kind === "image" ? material.previewUrl || "" : "");
        if (!url) throw new Error("这个媒体素材没有可用地址。");
        const mime = String(material.meta.mime || material.meta.source_media_type || "").toLowerCase();
        const media =
          material.kind === "video" || mime.startsWith("video/")
            ? "video"
            : material.kind === "audio" || mime.startsWith("audio/")
              ? "audio"
              : material.kind === "image" || mime.startsWith("image/")
                ? "image"
                : null;
        if (!media) {
          // 类型认不出：退回按链接导入（服务端验真实类型）。
          await editor.addMediaUrl(url, timelineInsertionMs(placement, editor.playheadMs));
          return;
        }
        await editor.insertLibraryMedia(
          { url, media, title: material.title || "" },
          timelineInsertionMs(placement, editor.playheadMs),
        );
      },
    }),
    [
      collabReadOnly,
      editor.addMediaUrl,
      editor.insertLibraryMedia,
      editor.loadingSource,
      editor.playheadMs,
    ],
  );
  // 素材库点一下 = 插入（D2）：登记 command/history 契约，插入进本编辑器的撤销历史。
  const materialDocumentId = advancedRootItemId(item);
  const materialBaseRevision = String(item.revisionId || item.meta.revision_id || "");
  useWorkbenchMaterialAdapter(
    useMemo(
      () =>
        withEditorHistoryCommand(materialAdapter, {
          documentId: materialDocumentId,
          targetRevisionId: materialBaseRevision,
        }),
      [materialAdapter, materialBaseRevision, materialDocumentId],
    ),
  );
  useEditorContext({ ...createVideoContext({ editor: view }), target: () => pluginTargetForLibraryItem(item, "video-timeline", view.editRevision) });
  const saveBeforeNewConversation = useCallback(async (publish = editor.saveDraft) => {
    if (storedReadOnly) return { ok: true as const, item };
    // 协同房间里只有存档人落库；其余端的改动已在房间里，保存交给存档人。
    if (!collab.saveGate || collabReadOnly) return { ok: true as const, item };
    const saved = await publish();
    if (saved?.url && saved.versionId) collab.markSaved(String(saved.versionId));
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
  }, [collab, collabReadOnly, editor.error, editor.saveDraft, editor.sourceReady, item, storedReadOnly]);
  const addLocalMedia = useCallback(
    async (files: File[]) => {
      setDeliverNotice("");
      // 手机录的 mov、下载来的 mkv 先转成 mp4 再进时间线。
      const batch = await normalizeVisualUploads(files, "video-timeline");
      for (const file of batch.files) await editor.addMediaFile(file);
      setDeliverNotice(batch.notes.join(" "));
    },
    [editor.addMediaFile],
  );
  const selection = useVideoTimelineSelectionAdapter({ state: view, readOnly: collabReadOnly, enabled: editor.sourceReady });
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        collab: collab.collab,
        id: "video-timeline",
        label: editorToolLabel(editorRouteFor(item)),
        toolbox: {
          label: "媒体与轨道",
          icon: "timeline",
          content: <VideoTimelineControls state={view} accent={accent} readOnly={collabReadOnly} />,
        },
        selection,
        history: {
          canUndo: editor.sourceReady && view.canUndo && !collabReadOnly,
          canRedo: editor.sourceReady && view.canRedo && !collabReadOnly,
          undo: () => {
            if (editor.sourceReady && !collabReadOnly) view.undo();
          },
          redo: () => {
            if (editor.sourceReady && !collabReadOnly) view.redo();
          },
        },
        notices: storedReadOnly
          ? [{ id: "video-stored-readonly", text: storedNotice, severity: "info" as const }]
          : [],
        pages: {},
        directDownload: exportDownloads[0],
        actions: [
          ...exportDownloads.slice(1),
          ...(storedReadOnly && onConvertStored
            ? [
                {
                  id: "video-convert-stored",
                  label: tt("转换为可编辑时间线"),
                  onTrigger: onConvertStored,
                },
              ]
            : []),
          ...(editor.exporting
            ? [
                {
                  id: "video-cancel-export",
                  label: "取消渲染",
                  variant: "danger" as const,
                  onTrigger: editor.cancelExport,
                },
              ]
            : []),
        ],
        upload: editor.loadingSource || collabReadOnly
          ? undefined
          : {
              accept: visualUploadAccept("video-timeline"),
              multiple: true,
              onFiles: addLocalMedia,
            },
        stage: sourcePending ? (
          <div
            role="status"
            className="flex h-full items-center justify-center bg-[var(--awb-stage-bg,#fafaf9)] p-8 text-center text-sm text-[var(--awb-muted,#57534e)]"
          >
            正在验证时间线工程与媒体源…
          </div>
        ) : sourceStopped ? (
          <EditorSourceFailurePanel
            message={
              editor.error ||
              "时间线源未成功载入，空回退工程已停止编辑与导出。可导入经过验证的媒体或恢复本地草稿。"
            }
            onReload={editor.reload}
            variant="surface"
          />
        ) : (
          <VideoTimelineStage state={view} accent={accent} readOnly={collabReadOnly} />
        ),
        status:
          editor.error ||
          deliverNotice ||
          collab.history.notice ||
          editor.notice ||
          (sourcePending ? "正在验证时间线工程与媒体源…" : ""),
        persistence: {
          dirty:
            collab.saveGate && !collabReadOnly && editor.sourceReady
              ? editor.dirty
              : false,
          editRevision: editor.editRevision,
          autoSave: collab.saveGate && !collabReadOnly && editor.sourceReady,
          flush: saveBeforeNewConversation,
          ...{ preparePublish: () => {
            const publish = editor.prepareSave();
            return () => saveBeforeNewConversation(publish);
          } },
          recovery: {
            draftSchema: "oceanleo.video-timeline.edit.v1",
            key: `video-timeline:${item.artifactId || item.meta.artifact_id || item.id}`,
            ready: !editor.loadingSource && editor.sourceReady,
            capture: () =>
              editor.sourceReady ? structuredClone(timelineDocForStorage(editor.doc)) : null,
            restore: (payload: unknown) => editor.restoreRecovery(payload),
          },
        },
      }}
      onClose={onClose}
    />
  );
}
