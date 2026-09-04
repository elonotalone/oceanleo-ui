"use client";

/**
 * Video next-core leaf. Flag=`next` only; pulled by VideoTimelineRoute via
 * dynamic(..., { ssr: false }). Must not be imported from the shell barrel.
 *
 * Source of truth: OpenVideo project JSON (vendor data.ts shape).
 * Preview uses TimelinePreviewEngine on a bridged TimelineDoc so playback
 * works without @openvideo/engine-pixi (requested, not installed).
 * Export uses the existing renderTimeline gateway — not Remotion.
 * The video site keeps mediabunny in components/editor/export-engine.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { advancedSavedItem } from "../advanced-session";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import { usePluginCommandSurface } from "../plugin-command";
import { SelectionToolbar } from "../SelectionToolbar";
import {
  DEFAULT_EDITOR_MODE,
  type EditorMode,
} from "../hosted-editor/index";
import type { SelectionCommand } from "../selection-context";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { saveProjectWorkingHead } from "../doc-editors/doc-io";
import { TimelinePreviewEngine } from "./preview-engine";
import { renderTimeline } from "./render-client";
import { visualDownloadFormats } from "../media-editors/visual-formats";
import {
  VIDEO_LEGACY_READONLY_NOTICE,
  nextVideoConversionState,
  openVideoToTimelineDoc,
  planVideoLegacyConversion,
  type VideoConversionState,
} from "./designcombo/legacy-conversion";
import {
  addOpenVideoCaption,
  cropOpenVideoClip,
  runVideoDesigncomboCommand,
  setOpenVideoCaptionStyle,
  setOpenVideoKeyframes,
} from "./designcombo/facade-commands";
import {
  VIDEO_AGENT_CHIPS,
  buildVideoReviewProposal,
  videoToolsManifestChips,
} from "./designcombo/l4-chips";
import {
  LEGACY_TIMELINE_SCHEMA,
  OPENVIDEO_PROJECT_SCHEMA,
  cloneOpenVideoProject,
  emptyOpenVideoProject,
  isOpenVideoProject,
  makeOpenVideoId,
  msToUs,
  normalizeOpenVideoProject,
  type OpenVideoProject,
} from "./designcombo/schema";
import {
  VIDEO_DESIGNCOMBO_CHROME_ATTRS,
  VIDEO_DESIGNCOMBO_INSTANCE_ID,
  VIDEO_DESIGNCOMBO_MODE_ATTR,
  VIDEO_DESIGNCOMBO_STAGE_ATTR,
  applyVideoDesigncomboChromeDom,
  applyVideoDesigncomboMode,
  videoDesigncomboSelectionContext,
} from "./designcombo/stage-plan";
import { DesigncomboTimelineHost } from "./designcombo/timeline-host";
import { DesigncomboInspectorHost } from "./designcombo/inspector-host";
import { isTimelineDoc } from "./timeline-model";

function parseEnvelope(text: string): unknown {
  const parsed = JSON.parse(text) as { data?: unknown; schema?: string };
  if (parsed && typeof parsed === "object" && "data" in parsed) {
    return parsed.data;
  }
  return parsed;
}

export function VideoDesigncomboStage({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<TimelinePreviewEngine | null>(null);
  const projectRef = useRef<OpenVideoProject>(emptyOpenVideoProject());
  const undoRef = useRef<OpenVideoProject[]>([]);
  const redoRef = useRef<OpenVideoProject[]>([]);
  const [mode, setMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  const [project, setProject] = useState<OpenVideoProject>(() =>
    emptyOpenVideoProject(),
  );
  const [conversion, setConversion] = useState<VideoConversionState>("converted");
  const [conversionNotice, setConversionNotice] = useState("");
  const [selectedClipId, setSelectedClipId] = useState("");
  const [playheadUs, setPlayheadUs] = useState(0);
  const [editRevision, setEditRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const [legacyDoc, setLegacyDoc] = useState<unknown>(null);
  const chipsManifest = useMemo(() => videoToolsManifestChips(), []);
  const readonly =
    conversion === "readonly" ||
    conversion === "converting" ||
    conversion === "failed";

  const commit = useCallback(
    (next: OpenVideoProject) => {
      undoRef.current.push(cloneOpenVideoProject(projectRef.current));
      redoRef.current = [];
      const normalized = normalizeOpenVideoProject(next);
      projectRef.current = normalized;
      setProject(normalized);
      setEditRevision((value) => value + 1);
      setDirty(true);
      engineRef.current?.setDoc(openVideoToTimelineDoc(normalized));
    },
    [],
  );

  const applyChrome = useCallback((next: EditorMode) => {
    const applied = applyVideoDesigncomboMode(VIDEO_DESIGNCOMBO_INSTANCE_ID, next);
    if (rootRef.current) applyVideoDesigncomboChromeDom(rootRef.current, applied.chrome);
    return applied;
  }, []);

  useEffect(() => {
    applyChrome(mode);
  }, [applyChrome, mode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const schema = String(item.meta.editor_project_schema || "");
        const projectUrl = String(item.meta.editor_project_url || "").trim();
        if (schema === OPENVIDEO_PROJECT_SCHEMA && projectUrl) {
          const blob = await fetchMediaBlob(projectUrl, { maxBytes: 20 * 1024 * 1024 });
          const data = parseEnvelope(await blob.text());
          if (cancelled) return;
          if (!isOpenVideoProject(data)) {
            throw new Error("新时间线工程打不开：JSON 不是 OpenVideo 的 tracks/clips 形状。");
          }
          const next = normalizeOpenVideoProject(data);
          projectRef.current = next;
          setProject(next);
          setConversion("converted");
          setConversionNotice("");
          setLegacyDoc(null);
          return;
        }
        const timelineDoc = isTimelineDoc(item.meta.timeline_doc)
          ? item.meta.timeline_doc
          : null;
        if (schema === LEGACY_TIMELINE_SCHEMA || timelineDoc) {
          let doc: unknown = timelineDoc;
          if (!doc && (projectUrl || item.url)) {
            const blob = await fetchMediaBlob(projectUrl || item.url, {
              maxBytes: 20 * 1024 * 1024,
            });
            doc = parseEnvelope(await blob.text());
          }
          if (cancelled) return;
          const planned = planVideoLegacyConversion({
            doc,
            schema: schema || LEGACY_TIMELINE_SCHEMA,
            title: item.title,
          });
          setLegacyDoc(doc);
          if (planned.ok) {
            projectRef.current = planned.data;
            setProject(planned.data);
            setConversion("readonly");
            setConversionNotice(
              planned.dropped.length
                ? `${VIDEO_LEGACY_READONLY_NOTICE} ${planned.summary}`
                : VIDEO_LEGACY_READONLY_NOTICE,
            );
          } else {
            projectRef.current = emptyOpenVideoProject();
            setProject(projectRef.current);
            setConversion("readonly");
            setConversionNotice(`${VIDEO_LEGACY_READONLY_NOTICE} ${planned.reason}`);
          }
          return;
        }
        const mediaUrl = item.url || item.previewUrl || "";
        const seeded = emptyOpenVideoProject();
        if (mediaUrl) {
          const id = makeOpenVideoId("clip");
          const track = seeded.tracks.find((entry) => entry.type === "video");
          seeded.clips[id] = {
            id,
            type: "Video",
            name: item.title || "video",
            src: mediaUrl,
            timing: {
              display: { from: 0, to: 5_000_000 },
              duration: 5_000_000,
              playbackRate: 1,
            },
            transform: {
              x: 0,
              y: 0,
              width: seeded.settings.width,
              height: seeded.settings.height,
              angle: 0,
              opacity: 1,
              zIndex: 10,
              flip: { x: false, y: false },
            },
            volume: 1,
            audio: true,
          };
          if (track) track.clipIds.push(id);
          setSelectedClipId(id);
        }
        projectRef.current = seeded;
        setProject(seeded);
        setConversion("converted");
        setConversionNotice("");
        setLegacyDoc(null);
      } catch (caught) {
        if (cancelled) return;
        projectRef.current = emptyOpenVideoProject();
        setProject(projectRef.current);
        setConversion("converted");
        setConversionNotice(
          caught instanceof Error ? caught.message : "时间线载入失败。",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    item.id,
    item.meta.editor_project_schema,
    item.meta.editor_project_url,
    item.meta.timeline_doc,
    item.previewUrl,
    item.title,
    item.url,
  ]);

  useEffect(() => {
    const engine = new TimelinePreviewEngine(openVideoToTimelineDoc(projectRef.current));
    engineRef.current = engine;
    engine.attachCanvas(canvasRef.current);
    engine.onTick = (ms) => setPlayheadUs(msToUs(ms));
    return () => {
      engine.attachCanvas(null);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setDoc(openVideoToTimelineDoc(project));
  }, [project]);

  const convertLegacy = useCallback(() => {
    if (conversion !== "readonly" && conversion !== "failed") return;
    setConversion(nextVideoConversionState(conversion, { type: conversion === "failed" ? "retry" : "request" }));
    const planned = planVideoLegacyConversion({
      doc: legacyDoc,
      schema: LEGACY_TIMELINE_SCHEMA,
      title: item.title,
    });
    if (!planned.ok) {
      setConversion("failed");
      setConversionNotice(planned.reason);
      return;
    }
    projectRef.current = planned.data;
    setProject(planned.data);
    setConversion("converted");
    setConversionNotice(planned.summary);
    setDirty(true);
    setEditRevision((value) => value + 1);
  }, [conversion, item.title, legacyDoc]);

  const selected = selectedClipId ? project.clips[selectedClipId] || null : null;

  const runControl = useCallback(
    (command: SelectionCommand) => {
      if (readonly) {
        setStatus(VIDEO_LEGACY_READONLY_NOTICE);
        return;
      }
      const atUs = playheadUs;
      let result = runVideoDesigncomboCommand(command.controlId, projectRef.current, {
        clipId: selectedClipId,
        atUs,
        value: command.value,
      });
      if (!result.ok && command.controlId === "crop-frame" && selectedClipId) {
        result = cropOpenVideoClip(projectRef.current, selectedClipId, {
          x: 0.1,
          y: 0.1,
          width: 0.8,
          height: 0.8,
        });
      }
      if (!result.ok && command.controlId === "keyframes" && selectedClipId) {
        result = setOpenVideoKeyframes(projectRef.current, selectedClipId, {
          "0%": { x: 0, opacity: 1 },
          "100%": { x: 0, opacity: 1 },
        });
      }
      if (!result.ok && command.controlId === "add-caption") {
        result = addOpenVideoCaption(projectRef.current, {
          text: "字幕",
          fromMs: Math.round(playheadUs / 1000),
        });
      }
      if (result.ok) {
        commit(result.project);
        setStatus("");
      } else {
        setStatus(result.reason);
      }
    },
    [commit, playheadUs, readonly, selectedClipId],
  );

  const selectionContext = useMemo(
    () =>
      videoDesigncomboSelectionContext({
        revision: editRevision,
        clip: selected,
        project,
      }),
    [editRevision, project, selected],
  );

  const exportVideo = useCallback(async () => {
    if (readonly) {
      setStatus(VIDEO_LEGACY_READONLY_NOTICE);
      return "";
    }
    const doc = openVideoToTimelineDoc(projectRef.current);
    setExporting(true);
    try {
      const url = await renderTimeline(
        {
          timeline: doc,
          title: `${item.title || "视频"}-剪辑成品`,
          site_id: siteId || "oceanleo",
          parent_id: item.id,
        },
        () => undefined,
      );
      setStatus("导出完成，已保存到我的库");
      return url;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "导出失败";
      setStatus(message);
      return "";
    } finally {
      setExporting(false);
    }
  }, [item.id, item.title, readonly, siteId]);

  const saveDraft = useCallback(async () => {
    if (readonly) {
      setStatus(VIDEO_LEGACY_READONLY_NOTICE);
      return null;
    }
    const snapshot = cloneOpenVideoProject(projectRef.current);
    const title = `${item.title || "视频"}-编辑版`;
    const saved = await saveProjectWorkingHead({
      item,
      siteId,
      fallbackSite: "oceanleo",
      title,
      idempotencyKey: `video-openvideo:${editRevision}:${String(item.id).slice(-80)}`,
      workingHeadUrl: item.url || "",
      mediaType: "video",
      kind: "video",
      meta: {
        editor_capability: "video-timeline",
        editor: "video-designcombo",
      },
      project: {
        schema: OPENVIDEO_PROJECT_SCHEMA,
        data: snapshot,
      },
      editorManifest: {
        id: "video-timeline",
        format: OPENVIDEO_PROJECT_SCHEMA,
      },
      artifactRevision: {
        artifactType: "video",
        editor: "video-timeline",
        provenance: { timelineSchema: OPENVIDEO_PROJECT_SCHEMA },
      },
    });
    if (!saved.ok) {
      setStatus(saved.error || "时间线草稿保存失败");
      return null;
    }
    setDirty(false);
    setStatus("已保存");
    return saved;
  }, [editRevision, item, readonly, siteId]);

  usePluginCommandSurface(
    useMemo(
      () => ({
        editorId: "video-timeline",
        describe: () =>
          VIDEO_AGENT_CHIPS.map((chip) => ({
            id: chip.id,
            label: chip.label,
            summary: chip.prompt.slice(0, 80),
            mutates: true,
          })),
        state: () => ({
          mode,
          conversion,
          revision: editRevision,
          chips: chipsManifest.chips.map((chip) => chip.id),
        }),
        run: (id, params) => {
          const after = String(params?.text || params?.value || id || "改动");
          const proposal = buildVideoReviewProposal({
            proposalId: `video-review-${editRevision}-${id}`.slice(0, 128),
            commandId: id,
            summaryBefore: selected?.text || selectedClipId || "(时间线)",
            summaryAfter: after,
            objects: [
              {
                id: selectedClipId || "timeline",
                op: selectedClipId ? "update" : "add",
                label: id,
                before: selected?.text || "",
                after,
              },
            ],
            revision: editRevision,
          });
          return {
            ok: Boolean(proposal),
            message: proposal
              ? "改动已送审阅，接受前不会写入时间线。"
              : "审阅提案没有通过契约校验，时间线未改。",
            revision: editRevision,
          };
        },
      }),
      [
        chipsManifest.chips,
        conversion,
        editRevision,
        mode,
        selected?.text,
        selectedClipId,
      ],
    ),
  );

  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await saveDraft();
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
          error: status || "时间线草稿保存失败",
        };
  }, [item, saveDraft, status]);

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
          content: (
            <div
              {...{ [VIDEO_DESIGNCOMBO_CHROME_ATTRS.mediaPanel]: "true" }}
              className="p-3 text-[12px] text-[var(--fg-2,#57534e)]"
            >
              OpenVideo 素材栏（专业模式展开完整列）。普通模式用顶栏导入。
            </div>
          ),
        },
        contextToolbar: readonly ? null : (
          <SelectionToolbar
            context={selectionContext}
            onCommand={runControl}
            accent={accent}
          />
        ),
        history: {
          canUndo: !readonly && undoRef.current.length > 0,
          canRedo: !readonly && redoRef.current.length > 0,
          undo: () => {
            const previous = undoRef.current.pop();
            if (!previous) return;
            redoRef.current.push(cloneOpenVideoProject(projectRef.current));
            projectRef.current = previous;
            setProject(previous);
            setEditRevision((value) => value + 1);
          },
          redo: () => {
            const following = redoRef.current.pop();
            if (!following) return;
            undoRef.current.push(cloneOpenVideoProject(projectRef.current));
            projectRef.current = following;
            setProject(following);
            setEditRevision((value) => value + 1);
          },
        },
        mode: {
          current: mode,
          setMode,
        },
        directDownload: {
          id: "video-download-mp4",
          label: visualDownloadFormats("video-timeline")[0].label,
          icon: "download",
          busyLabel: "渲染中…",
          busy: exporting,
          disabled: exporting || loading || readonly,
          onTrigger: async () => {
            await exportVideo();
          },
        },
        actions: [
          ...(readonly
            ? [
                {
                  id: "video-convert-legacy",
                  label: "转换为新时间线",
                  disabled: conversion === "converting",
                  onTrigger: convertLegacy,
                },
              ]
            : []),
        ],
        stage: (
          <div
            ref={rootRef}
            className="flex h-full min-h-0 flex-col"
            {...{ [VIDEO_DESIGNCOMBO_STAGE_ATTR]: "true" }}
            {...{ [VIDEO_DESIGNCOMBO_MODE_ATTR]: mode }}
          >
            <div
              {...{ [VIDEO_DESIGNCOMBO_CHROME_ATTRS.header]: "true" }}
              className="border-b px-3 py-1 text-[11px] text-[var(--muted,#78716c)]"
            >
              OpenVideo 专业界面
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-1 items-center justify-center bg-black">
                  <canvas
                    ref={(node) => {
                      canvasRef.current = node;
                      engineRef.current?.attachCanvas(node);
                    }}
                    className="max-h-full max-w-full"
                    data-video-designcombo-preview="true"
                  />
                </div>
                <div className="h-40 shrink-0">
                  <DesigncomboTimelineHost
                    project={project}
                    selectedClipId={selectedClipId}
                    playheadUs={playheadUs}
                    onSelect={setSelectedClipId}
                    onSeekUs={(us) => {
                      setPlayheadUs(us);
                      engineRef.current?.setTime(us / 1000);
                    }}
                  />
                </div>
              </div>
              <div className="w-64 shrink-0 border-l">
                <DesigncomboInspectorHost
                  project={project}
                  clip={selected}
                  onCrop={(crop) => {
                    if (readonly || !selectedClipId) return;
                    const result = cropOpenVideoClip(projectRef.current, selectedClipId, crop);
                    if (result.ok) commit(result.project);
                    else setStatus(result.reason);
                  }}
                  onCaptionStyle={(color) => {
                    if (readonly || !selectedClipId) return;
                    const result = setOpenVideoCaptionStyle(
                      projectRef.current,
                      selectedClipId,
                      { color },
                    );
                    if (result.ok) commit(result.project);
                  }}
                  onKeyframes={() => {
                    if (readonly || !selectedClipId) return;
                    const result = setOpenVideoKeyframes(projectRef.current, selectedClipId, {
                      "0%": { x: -40 },
                      "100%": { x: 0 },
                    });
                    if (result.ok) commit(result.project);
                    else setStatus(result.reason);
                  }}
                />
              </div>
            </div>
          </div>
        ),
        status:
          conversionNotice ||
          status ||
          (loading ? "正在载入时间线" : ""),
        persistence: {
          dirty,
          editRevision,
          autoSave: !readonly,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("video-timeline", item),
            ready: !loading,
            capture: () => (readonly ? null : cloneOpenVideoProject(projectRef.current)),
            restore: (payload) => {
              if (!isOpenVideoProject(payload)) return false;
              projectRef.current = normalizeOpenVideoProject(payload);
              setProject(projectRef.current);
              setDirty(true);
              return true;
            },
          },
        },
      }}
      onClose={onClose}
    />
  );
}
