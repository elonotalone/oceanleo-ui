"use client";

// ============================================================================
// @oceanleo/ui — useVideoTimeline：多轨时间线剪辑器的全部状态与动作
// ----------------------------------------------------------------------------
// 模式照抄 AdvancedImageEditor 的 useImageWorkbench/Controls/Canvas 三件套：
// 宿主壳调一次本 hook，把返回值同时喂给 VideoTimelineControls（左栏工具）和
// VideoTimelineStage（右区预览+时间线）。结构性修改全部走 timeline-model 的
// 纯函数；拖拽类连续修改用 gesture API（开始时记快照，结束时入 undo 栈）。
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { uploadFile } from "../../lib/database";
import {
  importMediaAsset,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import { useUI } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import { guessFileKind, guessMediaKind, probeMediaDuration } from "./media-probe";
import { uploadCoverPng, uploadDraft } from "./persistence";
import { TimelinePreviewEngine } from "./preview-engine";
import { renderTimeline, type RenderJobStatus } from "./render-client";
import {
  DEFAULT_IMAGE_CLIP_MS,
  DEFAULT_TEXT_CLIP_MS,
  addClipToTrack,
  addTrackTo,
  changeClipSpeed,
  createEmptyDoc,
  docDurationMs,
  duplicateClipIn,
  findClip,
  isTimelineDoc,
  makeId,
  moveClipTo,
  patchClipIn,
  removeClipFrom,
  removeTrackFrom,
  splitClipAt,
  trimClipTo,
  type ClipLocation,
} from "./timeline-model";
import type { TimelineClip, TimelineDoc, TrackKind } from "./types";

const PLACEHOLDER_DURATION_MS = 5000;
const MIN_PX_PER_SECOND = 8;
const MAX_PX_PER_SECOND = 480;

export interface VideoTimelineState {
  doc: TimelineDoc;
  durationMs: number;
  playheadMs: number;
  playing: boolean;
  pxPerSecond: number;
  snapEnabled: boolean;
  selectedClipId: string;
  selected: ClipLocation | null;
  canUndo: boolean;
  canRedo: boolean;
  loadingSource: boolean;
  previewReady: boolean;
  addingMedia: boolean;
  savingDraft: boolean;
  draftSavedUrl: string;
  capturingCover: boolean;
  coverUrl: string;
  exporting: boolean;
  exportStatus: RenderJobStatus | "";
  exportedUrl: string;
  error: string;
  notice: string;
  dirty: boolean;
  canvasRef: (canvas: HTMLCanvasElement | null) => void;
  previewCanvasRef: MutableRefObject<HTMLCanvasElement | null>;

  // transport
  togglePlay: () => void;
  seek: (ms: number) => void;
  stepFrame: (direction: 1 | -1) => void;

  // view
  setPxPerSecond: (value: number) => void;
  zoomBy: (factor: number) => void;
  setSnapEnabled: (value: boolean) => void;

  // selection
  selectClip: (clipId: string) => void;

  // history
  undo: () => void;
  redo: () => void;
  beginGesture: () => void;
  endGesture: () => void;

  // structural edits
  addTrack: (kind: TrackKind) => void;
  removeTrack: (trackId: string) => void;
  moveClip: (clipId: string, targetTrackId: string, desiredStartMs: number) => void;
  trimClip: (clipId: string, edge: "start" | "end", desiredMs: number) => void;
  splitAtPlayhead: () => void;
  deleteSelectedClip: () => void;
  duplicateSelectedClip: () => void;
  patchClip: (clipId: string, patch: Partial<TimelineClip>) => void;
  /** 拖滑杆等连续修改用：不入 undo 栈，配合 beginGesture/endGesture。 */
  patchClipTransient: (clipId: string, patch: Partial<TimelineClip>) => void;
  setClipSpeed: (clipId: string, speed: number) => void;
  setCanvasFormat: (width: number, height: number, fps: number) => void;

  // asset intake
  addMediaFile: (file: File) => Promise<void>;
  addMediaUrl: (url: string) => Promise<void>;
  addTextClip: () => void;

  // persistence
  captureCover: () => Promise<void>;
  saveDraft: () => Promise<void>;
  exportVideo: () => Promise<void>;
  cancelExport: () => void;
}

function trackKindForMedia(kind: "video" | "audio" | "image"): TrackKind {
  return kind;
}

function buildInitialDoc(item: LibraryItem): {
  doc: TimelineDoc;
  seededClipId: string;
  seededKind: "video" | "audio" | null;
} {
  const meta = item.meta ?? {};
  const draft = meta.timeline_doc;
  if (isTimelineDoc(draft)) {
    return { doc: draft, seededClipId: "", seededKind: null };
  }
  const doc = createEmptyDoc();
  const url = item.url || item.previewUrl || "";
  if (!url) return { doc, seededClipId: "", seededKind: null };
  const media: "video" | "audio" =
    item.kind === "audio" ? "audio" : "video";
  const track = doc.tracks.find((entry) => entry.kind === media);
  if (!track) return { doc, seededClipId: "", seededKind: null };
  const clip: TimelineClip = {
    id: makeId("clip"),
    start_ms: 0,
    duration_ms: PLACEHOLDER_DURATION_MS,
    source_url: url,
    in_ms: 0,
    speed: 1,
    volume: 1,
  };
  track.clips.push(clip);
  return { doc, seededClipId: clip.id, seededKind: media };
}

export function useVideoTimeline(
  item: LibraryItem,
  siteId = "",
  onSaved?: (url: string) => void,
): VideoTimelineState {
  const tt = useUI();
  const seedRef = useRef<ReturnType<typeof buildInitialDoc> | null>(null);
  if (!seedRef.current) seedRef.current = buildInitialDoc(item);

  const [doc, setDocState] = useState<TimelineDoc>(seedRef.current.doc);
  const docRef = useRef(doc);
  docRef.current = doc;

  const undoStack = useRef<TimelineDoc[]>([]);
  const redoStack = useRef<TimelineDoc[]>([]);
  const gestureBase = useRef<TimelineDoc | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pxPerSecond, setPxPerSecondState] = useState(60);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [selectedClipId, setSelectedClipId] = useState(
    seedRef.current.seededClipId,
  );
  const [loadingSource, setLoadingSource] = useState(
    Boolean(seedRef.current.seededClipId),
  );
  const [previewReady, setPreviewReady] = useState(false);
  const [addingMedia, setAddingMedia] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedUrl, setDraftSavedUrl] = useState("");
  const [capturingCover, setCapturingCover] = useState(false);
  const [coverUrl, setCoverUrl] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<RenderJobStatus | "">("");
  const [exportedUrl, setExportedUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);

  const engineRef = useRef<TimelinePreviewEngine | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const revisionRef = useRef(0);
  const savingDraftRef = useRef(false);

  // ------------------------------------------------------------- engine

  useEffect(() => {
    const engine = new TimelinePreviewEngine(docRef.current);
    engineRef.current = engine;
    engine.attachCanvas(previewCanvasRef.current);
    engine.onTick = (ms) => setPlayheadMs(ms);
    engine.onEnded = () => setPlaying(false);
    engine.onFrameReady = setPreviewReady;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(
    () => () => {
      exportAbortRef.current?.abort();
      exportAbortRef.current = null;
    },
    [],
  );

  useEffect(() => {
    engineRef.current?.setDoc(doc);
  }, [doc]);

  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    previewCanvasRef.current = canvas;
    engineRef.current?.attachCanvas(canvas);
  }, []);

  // ---------------------------------------------------------- source seed

  useEffect(() => {
    const seed = seedRef.current;
    const itemSourceUrl = item.url || item.previewUrl || "";
    if (!seed?.seededClipId || !seed.seededKind || !itemSourceUrl) return;
    const seededClipId = seed.seededClipId;
    const seededKind = seed.seededKind;
    let cancelled = false;
    void (async () => {
      try {
        let sourceUrl = itemSourceUrl;
        if (!isFirstPartyMediaUrl(sourceUrl)) {
          sourceUrl = await importMediaUrl(sourceUrl, {
            kind: seededKind,
            siteId: siteId || "video",
            title: item.title,
          });
          if (cancelled) return;
          setDocState((current) =>
            patchClipIn(current, seededClipId, { source_url: sourceUrl }),
          );
        }
        const duration = await probeMediaDuration(sourceUrl, seededKind);
        if (cancelled) return;
        if (!duration) return;
        setDocState((current) => {
          const located = findClip(current, seededClipId);
          if (!located || located.clip.duration_ms !== PLACEHOLDER_DURATION_MS) {
            return current;
          }
          return patchClipIn(current, seededClipId, { duration_ms: duration });
        });
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : tt("素材导入失败"));
        }
      } finally {
        if (!cancelled) setLoadingSource(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // seedRef 一次性，仅在挂载时探测。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------- history

  const applyEdit = useCallback(
    (updater: (current: TimelineDoc) => TimelineDoc) => {
      const current = docRef.current;
      const next = updater(current);
      if (next === current) return;
      undoStack.current.push(current);
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];
      setDocState(next);
      revisionRef.current += 1;
      setDirty(true);
      setDraftSavedUrl("");
      setHistoryVersion((value) => value + 1);
    },
    [],
  );

  const applyTransient = useCallback(
    (updater: (current: TimelineDoc) => TimelineDoc) => {
      const next = updater(docRef.current);
      if (next !== docRef.current) setDocState(next);
    },
    [],
  );

  const beginGesture = useCallback(() => {
    if (!gestureBase.current) gestureBase.current = docRef.current;
  }, []);

  const endGesture = useCallback(() => {
    const base = gestureBase.current;
    gestureBase.current = null;
    if (!base || base === docRef.current) return;
    undoStack.current.push(base);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    revisionRef.current += 1;
    setDirty(true);
    setDraftSavedUrl("");
    setHistoryVersion((value) => value + 1);
  }, []);

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(docRef.current);
    setDocState(previous);
    revisionRef.current += 1;
    setDirty(true);
    setDraftSavedUrl("");
    setHistoryVersion((value) => value + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(docRef.current);
    setDocState(next);
    revisionRef.current += 1;
    setDirty(true);
    setDraftSavedUrl("");
    setHistoryVersion((value) => value + 1);
  }, []);

  // ----------------------------------------------------------- transport

  const seek = useCallback((ms: number) => {
    const engine = engineRef.current;
    const clamped = Math.max(0, Math.min(ms, docDurationMs(docRef.current)));
    engine?.setTime(clamped);
    setPlayheadMs(clamped);
  }, []);

  const togglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPlaying()) {
      engine.pause();
      setPlaying(false);
    } else {
      engine.play();
      setPlaying(engine.isPlaying());
    }
  }, []);

  const stepFrame = useCallback(
    (direction: 1 | -1) => {
      engineRef.current?.pause();
      setPlaying(false);
      const frameMs = 1000 / (docRef.current.fps || 30);
      seek((engineRef.current?.getTimeMs() ?? 0) + frameMs * direction);
    },
    [seek],
  );

  // ---------------------------------------------------------------- view

  const setPxPerSecond = useCallback((value: number) => {
    setPxPerSecondState(
      Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, Math.round(value))),
    );
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      setPxPerSecondState((current) =>
        Math.min(
          MAX_PX_PER_SECOND,
          Math.max(MIN_PX_PER_SECOND, Math.round(current * factor)),
        ),
      );
    },
    [],
  );

  // ------------------------------------------------------- structural ops

  const addTrack = useCallback(
    (kind: TrackKind) => applyEdit((current) => addTrackTo(current, kind)),
    [applyEdit],
  );

  const removeTrack = useCallback(
    (trackId: string) => {
      const current = docRef.current;
      const firstVideo = current.tracks.find((track) => track.kind === "video");
      if (firstVideo?.id === trackId) {
        setError(tt("基底视频轨不能删除"));
        return;
      }
      applyEdit((doc0) => removeTrackFrom(doc0, trackId));
    },
    [applyEdit, tt],
  );

  const moveClip = useCallback(
    (clipId: string, targetTrackId: string, desiredStartMs: number) =>
      applyTransient((current) =>
        moveClipTo(current, clipId, targetTrackId, desiredStartMs),
      ),
    [applyTransient],
  );

  const trimClip = useCallback(
    (clipId: string, edge: "start" | "end", desiredMs: number) =>
      applyTransient((current) => trimClipTo(current, clipId, edge, desiredMs)),
    [applyTransient],
  );

  const splitAtPlayhead = useCallback(() => {
    const time = engineRef.current?.getTimeMs() ?? playheadMs;
    const current = docRef.current;
    const selected = selectedClipId ? findClip(current, selectedClipId) : null;
    const targetId =
      selected &&
      selected.clip.start_ms < time &&
      time < selected.clip.start_ms + selected.clip.duration_ms
        ? selectedClipId
        : current.tracks
            .flatMap((track) => track.clips)
            .find((clip) => clip.start_ms < time && time < clip.start_ms + clip.duration_ms)
            ?.id;
    if (!targetId) {
      setNotice(tt("播放头下没有可分割的片段"));
      return;
    }
    applyEdit((doc0) => splitClipAt(doc0, targetId, time));
  }, [applyEdit, playheadMs, selectedClipId, tt]);

  const deleteSelectedClip = useCallback(() => {
    if (!selectedClipId) return;
    applyEdit((current) => removeClipFrom(current, selectedClipId));
    setSelectedClipId("");
  }, [applyEdit, selectedClipId]);

  const duplicateSelectedClip = useCallback(() => {
    if (!selectedClipId) return;
    let newId = "";
    applyEdit((current) => {
      const result = duplicateClipIn(current, selectedClipId);
      newId = result.newClipId;
      return result.doc;
    });
    if (newId) setSelectedClipId(newId);
  }, [applyEdit, selectedClipId]);

  const patchClip = useCallback(
    (clipId: string, patch: Partial<TimelineClip>) =>
      applyEdit((current) => patchClipIn(current, clipId, patch)),
    [applyEdit],
  );

  const patchClipTransient = useCallback(
    (clipId: string, patch: Partial<TimelineClip>) =>
      applyTransient((current) => patchClipIn(current, clipId, patch)),
    [applyTransient],
  );

  const setClipSpeed = useCallback(
    (clipId: string, speed: number) =>
      applyEdit((current) => changeClipSpeed(current, clipId, speed)),
    [applyEdit],
  );

  const setCanvasFormat = useCallback(
    (width: number, height: number, fps: number) =>
      applyEdit((current) => ({ ...current, width, height, fps })),
    [applyEdit],
  );

  // --------------------------------------------------------- asset intake

  const appendSourceClip = useCallback(
    async (url: string, media: "video" | "audio" | "image", title: string) => {
      const kind = trackKindForMedia(media);
      let duration = DEFAULT_IMAGE_CLIP_MS;
      if (media !== "image") {
        duration =
          (await probeMediaDuration(url, media)) ?? PLACEHOLDER_DURATION_MS;
      }
      applyEdit((current) => {
        let next = current;
        let track = next.tracks.find((entry) => entry.kind === kind);
        if (!track) {
          next = addTrackTo(next, kind);
          track = next.tracks[next.tracks.length - 1];
        }
        const appendAt = Math.max(
          0,
          ...track.clips.map((clip) => clip.start_ms + clip.duration_ms),
        );
        const clip: TimelineClip = {
          id: makeId("clip"),
          start_ms: appendAt,
          duration_ms: duration,
          source_url: url,
          ...(media === "image"
            ? { x: 0.5, y: 0.5, scale: 0.35, opacity: 1 }
            : { in_ms: 0, speed: 1, volume: 1 }),
        };
        setSelectedClipId(clip.id);
        return addClipToTrack(next, track.id, clip);
      });
      setNotice(tt("已添加「{title}」", { title }));
    },
    [applyEdit, tt],
  );

  const addMediaFile = useCallback(
    async (file: File) => {
      setError("");
      const media = guessFileKind(file);
      if (!media) {
        setError(tt("不支持的文件类型（仅视频/音频/图片）"));
        return;
      }
      setAddingMedia(true);
      try {
        const uploaded = await uploadFile(file, {
          siteId: siteId || "oceanleo",
          title: file.name,
        });
        const url = uploaded.data?.file?.url || "";
        if (!uploaded.ok || !url) {
          setError(uploaded.error || tt("上传失败"));
          return;
        }
        await appendSourceClip(url, media, file.name);
      } finally {
        setAddingMedia(false);
      }
    },
    [appendSourceClip, siteId, tt],
  );

  const addMediaUrl = useCallback(
    async (url: string) => {
      setError("");
      const trimmed = url.trim();
      if (!/^https?:\/\//i.test(trimmed)) {
        setError(tt("请输入 http(s) 链接"));
        return;
      }
      const guessed = guessMediaKind(trimmed);
      setAddingMedia(true);
      try {
        const title = trimmed.split("/").pop() || tt("链接素材");
        const imported = await importMediaAsset(trimmed, {
          kind: guessed || "file",
          siteId: siteId || "video",
          title,
        });
        const inferred =
          imported.contentType.startsWith("video/")
            ? "video"
            : imported.contentType.startsWith("audio/")
              ? "audio"
              : imported.contentType.startsWith("image/")
                ? "image"
                : null;
        const media = guessed || inferred;
        if (!media) {
          throw new Error(
            tt("无法识别 URL 素材类型，请使用视频、音频或图片直链"),
          );
        }
        await appendSourceClip(
          imported.url,
          media,
          title,
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : tt("素材导入失败"));
      } finally {
        setAddingMedia(false);
      }
    },
    [appendSourceClip, siteId, tt],
  );

  const addTextClip = useCallback(() => {
    const time = engineRef.current?.getTimeMs() ?? playheadMs;
    applyEdit((current) => {
      let next = current;
      let track = next.tracks.find((entry) => entry.kind === "text");
      if (!track) {
        next = addTrackTo(next, "text");
        track = next.tracks[next.tracks.length - 1];
      }
      const clip: TimelineClip = {
        id: makeId("clip"),
        start_ms: Math.round(time),
        duration_ms: DEFAULT_TEXT_CLIP_MS,
        text: tt("新文字"),
        style: {
          font_size: 64,
          color: "#ffffff",
          x: 0.5,
          y: 0.85,
          align: "center",
          bold: false,
        },
      };
      setSelectedClipId(clip.id);
      return addClipToTrack(next, track.id, clip);
    });
  }, [applyEdit, playheadMs, tt]);

  // ---------------------------------------------------------- persistence

  const captureCover = useCallback(async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !previewReady) {
      setError(tt("当前帧尚未解码完成，请稍后再试"));
      return;
    }
    setCapturingCover(true);
    setError("");
    try {
      const title = `${item.title || tt("视频")}-${tt("封面")}`;
      const result = await uploadCoverPng(canvas, title, siteId || "oceanleo", tt);
      if (!result.url) {
        setError(result.error || tt("封面上传失败"));
        return;
      }
      setCoverUrl(result.url);
      setNotice(tt("封面帧已设置"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tt("封面导出失败"));
    } finally {
      setCapturingCover(false);
    }
  }, [item.title, previewReady, siteId, tt]);

  const saveDraft = useCallback(async () => {
    if (savingDraftRef.current) return;
    const savingRevision = revisionRef.current;
    const snapshot = structuredClone(docRef.current);
    savingDraftRef.current = true;
    setSavingDraft(true);
    setError("");
    try {
      const title = `${item.title || tt("视频")}-${tt("时间线草稿")}`;
      const result = await uploadDraft(
        snapshot,
        item,
        title,
        siteId || "oceanleo",
        tt,
      );
      if (!result.url) {
        setError(result.error || tt("草稿上传失败"));
        return;
      }
      setDraftSavedUrl(result.url);
      if (revisionRef.current === savingRevision) {
        setDirty(false);
        setNotice(tt("草稿已保存到我的库"));
      } else {
        setNotice(tt("已保存一个草稿版本；之后的修改仍未保存"));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tt("草稿保存失败"));
    } finally {
      savingDraftRef.current = false;
      setSavingDraft(false);
    }
  }, [item, siteId, tt]);

  const exportVideo = useCallback(async () => {
    if (exporting) return;
    let docToRender = docRef.current;
    if (docDurationMs(docToRender) <= 0) {
      setError(tt("时间线是空的，没有可导出的内容"));
      return;
    }
    setExporting(true);
    setExportStatus("queued");
    setExportedUrl("");
    setError("");
    const abortController = new AbortController();
    exportAbortRef.current = abortController;
    try {
      const imported = new Map<string, string>();
      const nextDoc = structuredClone(docToRender);
      let changed = false;
      for (const track of nextDoc.tracks) {
        if (track.kind === "text") continue;
        for (const clip of track.clips) {
          const source = clip.source_url || "";
          if (!source || isFirstPartyMediaUrl(source)) continue;
          let durable = imported.get(source);
          if (!durable) {
            durable = await importMediaUrl(source, {
              kind: track.kind,
              siteId: siteId || "video",
              title: item.title,
            });
            imported.set(source, durable);
          }
          clip.source_url = durable;
          changed = true;
        }
      }
      if (changed) {
        docToRender = nextDoc;
        // Importing remote sources can take seconds. Merge only the normalized
        // URLs into the latest editor state so edits made during that wait are
        // never replaced by the older render snapshot.
        const latest = structuredClone(docRef.current);
        let latestChanged = false;
        for (const track of latest.tracks) {
          if (track.kind === "text") continue;
          for (const clip of track.clips) {
            const durable = imported.get(clip.source_url || "");
            if (!durable) continue;
            clip.source_url = durable;
            latestChanged = true;
          }
        }
        if (latestChanged) {
          docRef.current = latest;
          setDocState(latest);
          revisionRef.current += 1;
          setDirty(true);
          setDraftSavedUrl("");
        }
      }
      const url = await renderTimeline(
        {
          timeline: docToRender,
          title: `${item.title || tt("视频")}-${tt("剪辑成品")}`,
          site_id: siteId || "oceanleo",
          parent_id: item.id,
          ...(coverUrl ? { cover_url: coverUrl } : {}),
        },
        (state) => setExportStatus(state.status),
        2000,
        abortController.signal,
      );
      setExportedUrl(url);
      setNotice(tt("导出完成，已保存到我的库"));
      onSaved?.(url);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setExportStatus("canceled");
        setNotice(tt("导出已取消"));
        return;
      }
      setExportStatus("error");
      setError(caught instanceof Error ? caught.message : tt("导出失败"));
    } finally {
      if (exportAbortRef.current === abortController) {
        exportAbortRef.current = null;
      }
      setExporting(false);
    }
  }, [coverUrl, exporting, item.title, onSaved, siteId, tt]);

  const cancelExport = useCallback(() => {
    if (!exportAbortRef.current) return;
    exportAbortRef.current.abort();
    setExportStatus("canceled");
    setNotice(tt("正在取消导出…"));
  }, [tt]);

  // -------------------------------------------------------------- derived

  const durationMs = useMemo(() => docDurationMs(doc), [doc]);
  const selected = useMemo(
    () => (selectedClipId ? findClip(doc, selectedClipId) : null),
    [doc, selectedClipId],
  );
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  void historyVersion;

  return {
    doc,
    durationMs,
    playheadMs,
    playing,
    pxPerSecond,
    snapEnabled,
    selectedClipId,
    selected,
    canUndo,
    canRedo,
    loadingSource,
    previewReady,
    addingMedia,
    savingDraft,
    draftSavedUrl,
    capturingCover,
    coverUrl,
    exporting,
    exportStatus,
    exportedUrl,
    error,
    notice,
    dirty,
    canvasRef,
    previewCanvasRef,
    togglePlay,
    seek,
    stepFrame,
    setPxPerSecond,
    zoomBy,
    setSnapEnabled,
    selectClip: setSelectedClipId,
    undo,
    redo,
    beginGesture,
    endGesture,
    addTrack,
    removeTrack,
    moveClip,
    trimClip,
    splitAtPlayhead,
    deleteSelectedClip,
    duplicateSelectedClip,
    patchClip,
    patchClipTransient,
    setClipSpeed,
    setCanvasFormat,
    addMediaFile,
    addMediaUrl,
    addTextClip,
    captureCover,
    saveDraft,
    exportVideo,
    cancelExport,
  };
}
