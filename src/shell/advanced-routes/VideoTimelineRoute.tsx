"use client";

import { ensureAdvancedDraftExport } from "../advanced-draft-gates";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { advancedSavedItem } from "../advanced-session";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import { usePluginCommandSurface } from "../plugin-command";
import { pluginTargetForLibraryItem } from "../active-agent-file";
import { guardPluginSurface } from "../collab/adapters/visual-readonly";
import { createVideoCommandSurface } from "../video-editor/video-command-surface";
import { downloadConvertedFromUrl } from "../media-editors/visual-convert-client";
import { normalizeVisualUploads } from "../media-editors/visual-import-normalize";
import {
  visualDownloadFormats,
  visualUploadAccept,
} from "../media-editors/visual-formats";
import {
  VideoTimelineControls,
  VideoTimelineContextToolbar,
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
  const editor = useVideoTimeline(item, siteId);
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
    local: editor.sourceReady && !storedReadOnly ? editor.doc : null,
    applyRemote,
    applyLocal,
    canRestoreEntity,
    loadRevision,
  });
  const collabReadOnly = collab.readOnly || storedReadOnly;
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
  const [convertingWebm, setConvertingWebm] = useState(false);
  const busy = editor.exporting || convertingWebm;
  /**
   * mp4 = 既有的渲染路径，产物同时进我的库。
   * webm = 同一份渲染结果再转一道容器，转完直接下载到本机（后端不留副本）。
   */
  const deliver = useCallback(
    async (format: string) => {
      if (!await ensureAdvancedDraftExport(item.key || item.id)) return;
      setDeliverNotice("");
      const rendered = editor.exportedUrl || (await editor.exportVideo());
      if (format === "mp4") {
        if (!rendered) throw new Error(editor.error || "渲染没有成功。");
        return;
      }
      if (!rendered) throw new Error(editor.error || "渲染没有成功，无法转格式。");
      setConvertingWebm(true);
      setDeliverNotice("正在转成 WebM…");
      try {
        await downloadConvertedFromUrl({
          url: rendered,
          title: item.title || "video",
          target: format,
          kind: "media",
        });
        setDeliverNotice("");
      } catch (caught) {
        const message =
          caught instanceof Error && caught.message.trim()
            ? caught.message.trim()
            : `转成 ${format.toUpperCase()} 失败。`;
        setDeliverNotice(message);
        throw new Error(message);
      } finally {
        setConvertingWebm(false);
      }
    },
    [editor.error, editor.exportVideo, editor.exportedUrl, item.title],
  );
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
        const url =
          material.url || material.previewUrl || material.thumbUrl || "";
        if (!url) throw new Error("这个媒体素材没有可用地址。");
        await editor.addMediaUrl(
          url,
          timelineInsertionMs(placement, editor.playheadMs),
        );
      },
    }),
    [collabReadOnly, editor.addMediaUrl, editor.loadingSource, editor.playheadMs],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
  usePluginCommandSurface(
    useMemo(
      () =>
        guardPluginSurface(
          {
            ...createVideoCommandSurface({ editor: view, deliver }),
            target: () => pluginTargetForLibraryItem(item, "video-timeline", view.editRevision),
          },
          collabReadOnly,
        ),
      [collabReadOnly, deliver, item, view],
    ),
  );
  const saveBeforeNewConversation = useCallback(async () => {
    if (storedReadOnly) return { ok: true as const, item };
    // 协同房间里只有存档人落库；其余端的改动已在房间里，保存交给存档人。
    if (!collab.saveGate || collabReadOnly) return { ok: true as const, item };
    const saved = await editor.saveDraft();
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
  }, [collab.markSaved, collab.saveGate, collabReadOnly, editor.error, editor.saveDraft, editor.sourceReady, item, storedReadOnly]);
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
        contextToolbar: (
          editor.sourceReady ? (
            <VideoTimelineContextToolbar state={view} accent={accent} readOnly={collabReadOnly} />
          ) : null
        ),
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
        directDownload: {
          id: "video-download-mp4",
          label: visualDownloadFormats("video-timeline")[0].label,
          icon: "download",
          busyLabel: "渲染中…",
          busy: editor.exporting,
          disabled:
            busy || editor.loadingSource || !editor.sourceReady,
          onTrigger: async () => {
            if (!await ensureAdvancedDraftExport(item.key || item.id)) return;
            await editor.exportVideo();
          },
        },
        actions: [
          ...visualDownloadFormats("video-timeline")
            .slice(1)
            .map((entry) => ({
              id: entry.id,
              label: entry.label,
              icon: "download" as const,
              group: "download" as const,
              busy,
              busyLabel: editor.exporting ? "渲染中…" : "转换中…",
              disabled:
                busy || editor.loadingSource || !editor.sourceReady,
              onTrigger: () => deliver(entry.format).catch(() => undefined),
            })),
          ...(storedReadOnly && onConvertStored
            ? [
                {
                  id: "video-convert-stored",
                  label: "转换为可编辑时间线",
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
          recovery: {
            draftSchema: "oceanleo.video-timeline.edit.v1",
            key: advancedRecoveryKey("video-timeline", item),
            ready: !editor.loadingSource && editor.sourceReady,
            capture: () =>
              editor.sourceReady ? structuredClone(editor.doc) : null,
            restore: (payload: unknown) => editor.restoreRecovery(payload),
          },
        },
      }}
      onClose={onClose}
    />
  );
}
