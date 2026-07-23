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
  fetchMediaBlob,
  importMediaAsset,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import { useUI } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import { guessFileKind, guessMediaKind, probeMediaSource } from "./media-probe";
import {
  uploadCoverPng,
  uploadDraft,
  type PersistResult,
} from "./persistence";
import { TimelinePreviewEngine } from "./preview-engine";
import { renderTimeline, type RenderJobStatus } from "./render-client";
import {
  DEFAULT_IMAGE_CLIP_MS,
  DEFAULT_TEXT_CLIP_MS,
  MIN_CLIP_MS,
  addClipToTrack,
  addTrackTo,
  availableTimelineDurationMs,
  changeClipSpeed,
  createEmptyDoc,
  docDurationMs,
  duplicateClipIn,
  findClip,
  isTimelineDoc,
  makeId,
  moveClipTo,
  normalizeTimelineDoc,
  patchClipIn,
  removeClipFrom,
  removeTrackFrom,
  splitClipAt,
  timelineDocIssue,
  trimClipTo,
  type ClipLocation,
} from "./timeline-model";
import {
  beginTimelineGesture,
  cancelTimelineGesture,
  commitTimelineGesture,
  createTimelineGestureHistory,
  updateTimelineGesture,
  type TimelineGestureHistory,
} from "./timeline-gesture-history";
import { clampTimelinePxPerSecond } from "./timeline-viewport";
import type { TimelineClip, TimelineDoc, TrackKind } from "./types";
import {
  assertBlobSource,
  parseVideoProjectEnvelope,
} from "../media-editors/source-integrity.mjs";

const PLACEHOLDER_DURATION_MS = 5000;

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
  editRevision: number;
  canvasRef: (canvas: HTMLCanvasElement | null) => void;
  previewCanvasRef: MutableRefObject<HTMLCanvasElement | null>;

  // transport
  togglePlay: () => void;
  seek: (ms: number) => void;
  stepFrame: (direction: 1 | -1) => void;

  // view
  setPxPerSecond: (value: number) => void;
  setSnapEnabled: (value: boolean) => void;

  // selection
  selectClip: (clipId: string) => void;

  // history
  undo: () => void;
  redo: () => void;
  beginGesture: () => void;
  endGesture: () => void;
  cancelGesture: () => void;

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
  setClipTiming: (
    clipId: string,
    patch: { startMs?: number; durationMs?: number; sourceInMs?: number },
  ) => void;
  setClipSpeed: (clipId: string, speed: number) => void;
  setCanvasFormat: (width: number, height: number, fps: number) => void;

  // asset intake
  addMediaFile: (file: File) => Promise<void>;
  addMediaUrl: (url: string, startAtMs?: number) => Promise<void>;
  addTextClip: () => void;

  // persistence
  captureCover: () => Promise<void>;
  saveDraft: () => Promise<PersistResult | null>;
  exportVideo: () => Promise<void>;
  cancelExport: () => void;
  restoreRecovery: (payload: unknown) => boolean;
}

function trackKindForMedia(kind: "video" | "audio" | "image"): TrackKind {
  return kind;
}

async function durableTimelineSources(
  doc: TimelineDoc,
  siteId: string,
  title: string,
): Promise<TimelineDoc> {
  const replacements = new Map<string, string>();
  for (const track of doc.tracks) {
    if (track.kind === "text") continue;
    for (const clip of track.clips) {
      const source = clip.source_url || "";
      if (!source || isFirstPartyMediaUrl(source) || replacements.has(source)) {
        continue;
      }
      replacements.set(
        source,
        await importMediaUrl(source, {
          kind: track.kind,
          siteId,
          title,
          registerAsset: true,
        }),
      );
    }
  }
  if (!replacements.size) return doc;
  const next = structuredClone(doc);
  for (const track of next.tracks) {
    if (track.kind === "text") continue;
    for (const clip of track.clips) {
      clip.source_url = replacements.get(clip.source_url || "") || clip.source_url;
    }
  }
  return next;
}

async function assertTimelineMediaSources(doc: TimelineDoc): Promise<void> {
  const sources = new Map<
    string,
    { kind: "video" | "audio"; url: string; clipId: string }
  >();
  for (const track of doc.tracks) {
    if (track.kind !== "video" && track.kind !== "audio") continue;
    for (const clip of track.clips) {
      const url = clip.source_url || "";
      sources.set(`${track.kind}:${url}`, {
        kind: track.kind,
        url,
        clipId: clip.id,
      });
    }
  }
  if (sources.size > 64) {
    throw new Error("视频工程包含超过 64 个独立音视频源，无法安全预检");
  }
  await Promise.all(
    [...sources.values()].map(async ({ kind, url, clipId }) => {
      if (await probeMediaSource(url, kind)) return;
      throw new Error(
        kind === "video"
          ? `片段 ${clipId} 的源无法解码或没有真实视频轨`
          : `片段 ${clipId} 的源无法解码为音频`,
      );
    }),
  );
}

function buildInitialDoc(item: LibraryItem): {
  doc: TimelineDoc;
  seededClipId: string;
  seededKind: "video" | "audio" | null;
} {
  const meta = item.meta ?? {};
  const draft = meta.timeline_doc;
  if (isTimelineDoc(draft)) {
    return {
      doc: normalizeTimelineDoc(draft),
      seededClipId: "",
      seededKind: null,
    };
  }
  const doc = createEmptyDoc();
  if (meta.editor_project_schema === "oceanleo.timeline.v1") {
    return { doc, seededClipId: "", seededKind: null };
  }
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
  const gestureState = useRef<TimelineGestureHistory<TimelineDoc> | null>(null);
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
  const workingHeadUrlRef = useRef(item.url || item.previewUrl || "");
  const sourceProbeKeysRef = useRef(new Set<string>());

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

  useEffect(() => {
    for (const track of doc.tracks) {
      if (track.kind !== "video" && track.kind !== "audio") continue;
      for (const clip of track.clips) {
        const sourceUrl = clip.source_url || "";
        if (
          !sourceUrl ||
          Number.isFinite(clip.source_duration_ms)
        ) {
          continue;
        }
        const key = `${track.kind}:${sourceUrl}`;
        if (sourceProbeKeysRef.current.has(key)) continue;
        sourceProbeKeysRef.current.add(key);
        void probeMediaSource(sourceUrl, track.kind).then((probe) => {
          if (!probe) {
            setError(
              tt(
                track.kind === "video"
                  ? "时间线中的视频源无法解码或没有真实视频轨"
                  : "时间线中的音频源无法解码",
              ),
            );
            return;
          }
          setDocState((current) => {
            let changed = false;
            const next: TimelineDoc = {
              ...current,
              tracks: current.tracks.map((candidateTrack) => {
                if (candidateTrack.kind !== track.kind) return candidateTrack;
                return {
                  ...candidateTrack,
                  clips: candidateTrack.clips.map((candidateClip) => {
                    if (
                      candidateClip.source_url !== sourceUrl ||
                      Number.isFinite(candidateClip.source_duration_ms)
                    ) {
                      return candidateClip;
                    }
                    changed = true;
                    const withProbe: TimelineClip = {
                      ...candidateClip,
                      source_duration_ms: probe.durationMs,
                    };
                    return {
                      ...withProbe,
                      duration_ms: Math.min(
                        withProbe.duration_ms,
                        availableTimelineDurationMs(withProbe),
                      ),
                    };
                  }),
                };
              }),
            };
            if (!changed) return current;
            docRef.current = next;
            return next;
          });
        });
      }
    }
  }, [doc, tt]);

  useEffect(() => {
    workingHeadUrlRef.current = String(
      item.meta.editor_working_head_url || item.url || item.previewUrl || "",
    );
    const projectUrl = String(
      item.meta.editor_project_url ||
        (item.meta.editor_project_schema === "oceanleo.timeline.v1"
          ? item.url
          : "") ||
        "",
    ).trim();
    if (
      !projectUrl ||
      item.meta.editor_project_schema !== "oceanleo.timeline.v1" ||
      isTimelineDoc(item.meta.timeline_doc)
    ) {
      return;
    }
    const controller = new AbortController();
    setLoadingSource(true);
    setError("");
    void fetchMediaBlob(projectUrl, {
      maxBytes: 20 * 1024 * 1024,
      signal: controller.signal,
    })
      .then(async (blob) => {
        await assertBlobSource(blob, "video-project");
        return blob.text();
      })
      .then(async (text) => {
        if (controller.signal.aborted) return;
        const candidate = parseVideoProjectEnvelope(text);
        const issue = timelineDocIssue(candidate);
        if (issue || !isTimelineDoc(candidate)) {
          throw new Error(`时间线工程格式无效：${issue || "结构未知"}`);
        }
        const normalized = await durableTimelineSources(
          normalizeTimelineDoc(candidate),
          siteId || "video",
          item.title,
        );
        if (controller.signal.aborted) return;
        await assertTimelineMediaSources(normalized);
        if (controller.signal.aborted) return;
        docRef.current = normalized;
        setDocState(normalized);
        setSelectedClipId("");
        setPlayheadMs(0);
        setDirty(false);
        revisionRef.current = 0;
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error ? caught.message : "时间线工程读取失败",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSource(false);
      });
    return () => controller.abort();
  }, [
    item.id,
    item.meta.editor_project_schema,
    item.meta.editor_project_url,
    item.meta.timeline_doc,
    item.title,
    item.url,
    siteId,
  ]);

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
        const probe = await probeMediaSource(sourceUrl, seededKind);
        if (cancelled) return;
        if (!probe) {
          setDocState((current) => {
            const next = removeClipFrom(current, seededClipId);
            docRef.current = next;
            return next;
          });
          setSelectedClipId("");
          throw new Error(
            tt(
              seededKind === "video"
                ? "初始视频源无法解码或没有真实视频轨"
                : "初始音频源无法解码",
            ),
          );
        }
        setDocState((current) => {
          const located = findClip(current, seededClipId);
          if (!located) return current;
          return patchClipIn(current, seededClipId, {
            source_duration_ms: probe.durationMs,
            ...(located.clip.duration_ms === PLACEHOLDER_DURATION_MS
              ? { duration_ms: probe.durationMs }
              : {}),
          });
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
      docRef.current = next;
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
      const activeGesture = gestureState.current;
      const nextGesture = activeGesture
        ? updateTimelineGesture(activeGesture, updater)
        : null;
      if (nextGesture) gestureState.current = nextGesture;
      const next = nextGesture?.document || updater(docRef.current);
      if (next !== docRef.current) {
        docRef.current = next;
        setDocState(next);
      }
    },
    [],
  );

  const beginGesture = useCallback(() => {
    if (gestureState.current) return;
    gestureState.current = beginTimelineGesture(
      createTimelineGestureHistory(docRef.current, {
        undo: undoStack.current,
        redo: redoStack.current,
        revision: revisionRef.current,
        dirty,
      }),
    );
  }, [dirty]);

  const endGesture = useCallback(() => {
    const activeGesture = gestureState.current;
    if (!activeGesture) return;
    const committed = commitTimelineGesture(activeGesture);
    gestureState.current = null;
    docRef.current = committed.document;
    undoStack.current = committed.undo;
    redoStack.current = committed.redo;
    if (committed.revision === revisionRef.current) return;
    revisionRef.current = committed.revision;
    setDirty(committed.dirty);
    setDraftSavedUrl("");
    setHistoryVersion((value) => value + 1);
  }, []);

  const cancelGesture = useCallback(() => {
    const activeGesture = gestureState.current;
    if (!activeGesture) return;
    const cancelled = cancelTimelineGesture(activeGesture);
    gestureState.current = null;
    if (cancelled.document !== docRef.current) {
      docRef.current = cancelled.document;
      setDocState(cancelled.document);
    }
  }, []);

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(docRef.current);
    docRef.current = previous;
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
    docRef.current = next;
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
    setPxPerSecondState(clampTimelinePxPerSecond(value));
  }, []);

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

  const setClipTiming = useCallback(
    (
      clipId: string,
      patch: { startMs?: number; durationMs?: number; sourceInMs?: number },
    ) =>
      applyEdit((current) => {
        let next = current;
        let located = findClip(next, clipId);
        if (!located) return current;
        if (typeof patch.startMs === "number") {
          next = moveClipTo(
            next,
            clipId,
            located.track.id,
            Math.max(0, patch.startMs),
          );
          located = findClip(next, clipId);
          if (!located) return next;
        }
        if (typeof patch.durationMs === "number") {
          next = trimClipTo(
            next,
            clipId,
            "end",
            located.clip.start_ms + Math.max(100, patch.durationMs),
          );
        }
        if (typeof patch.sourceInMs === "number") {
          const sourceDuration = located.clip.source_duration_ms;
          const speed = located.clip.speed ?? 1;
          const maximumSourceIn = Number.isFinite(sourceDuration)
            ? Math.max(0, Number(sourceDuration) - MIN_CLIP_MS * speed)
            : Infinity;
          const sourceInMs = Math.min(
            maximumSourceIn,
            Math.max(0, Math.round(patch.sourceInMs)),
          );
          next = patchClipIn(next, clipId, {
            in_ms: sourceInMs,
          });
          located = findClip(next, clipId);
          if (located) {
            const maximumDuration = availableTimelineDurationMs(
              located.clip,
              sourceInMs,
            );
            if (located.clip.duration_ms > maximumDuration) {
              next = patchClipIn(next, clipId, {
                duration_ms: maximumDuration,
              });
            }
          }
        }
        return next;
      }),
    [applyEdit],
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
    async (
      url: string,
      media: "video" | "audio" | "image",
      title: string,
      startAtMs?: number,
    ) => {
      const kind = trackKindForMedia(media);
      let duration = DEFAULT_IMAGE_CLIP_MS;
      let sourceDurationMs: number | undefined;
      if (media !== "image") {
        const probe = await probeMediaSource(url, media);
        if (!probe) {
          throw new Error(
            tt(
              media === "video"
                ? "视频源无法解码或没有真实视频轨，未加入时间线"
                : "音频源无法解码，未加入时间线",
            ),
          );
        }
        duration = probe.durationMs;
        sourceDurationMs = probe.durationMs;
      }
      applyEdit((current) => {
        let next = current;
        let track = next.tracks.find((entry) => entry.kind === kind);
        if (!track) {
          next = addTrackTo(next, kind);
          track = next.tracks[next.tracks.length - 1];
        }
        const appendAt = Number.isFinite(startAtMs)
          ? Math.max(0, Math.round(startAtMs as number))
          : Math.max(
              0,
              ...track.clips.map(
                (clip) => clip.start_ms + clip.duration_ms,
              ),
            );
        const clip: TimelineClip = {
          id: makeId("clip"),
          start_ms: appendAt,
          duration_ms: duration,
          source_url: url,
          ...(media === "image"
            ? { x: 0.5, y: 0.5, scale: 0.35, opacity: 1 }
            : {
                in_ms: 0,
                speed: 1,
                volume: 1,
                ...(sourceDurationMs
                  ? { source_duration_ms: sourceDurationMs }
                  : {}),
              }),
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
        await assertBlobSource(file, media);
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
    async (url: string, startAtMs?: number) => {
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
        const importedContentType = imported.contentType.toLowerCase();
        const inferred =
          importedContentType.startsWith("video/")
            ? "video"
            : importedContentType.startsWith("audio/")
              ? "audio"
              : importedContentType.startsWith("image/")
                ? "image"
                : null;
        if (guessed && inferred && guessed !== inferred) {
          throw new Error(
            tt("URL 扩展名与服务器验证的真实素材类型不一致，已拒绝加入时间线"),
          );
        }
        const media = inferred || guessed;
        if (!media) {
          throw new Error(
            tt("无法识别 URL 素材类型，请使用视频、音频或图片直链"),
          );
        }
        await appendSourceClip(
          imported.url,
          media,
          title,
          startAtMs,
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
      const result = await uploadCoverPng(
        canvas,
        title,
        siteId || "oceanleo",
        `video-cover:${item.id}:${revisionRef.current}`,
        tt,
      );
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
  }, [item.id, item.title, previewReady, siteId, tt]);

  const saveDraft = useCallback(async (): Promise<PersistResult | null> => {
    if (savingDraftRef.current) return null;
    const savingRevision = revisionRef.current;
    let snapshot = structuredClone(docRef.current);
    savingDraftRef.current = true;
    setSavingDraft(true);
    setError("");
    try {
      snapshot = await durableTimelineSources(
        normalizeTimelineDoc(snapshot),
        siteId || "video",
        item.title,
      );
      await assertTimelineMediaSources(snapshot);
      const title = `${item.title || tt("视频")}-${tt("时间线草稿")}`;
      const result = await uploadDraft(
        snapshot,
        item,
        title,
        siteId || "oceanleo",
        `video-timeline:${item.id}:${savingRevision}`,
        workingHeadUrlRef.current,
        tt,
      );
      if (!result.url) {
        setError(result.error || tt("草稿上传失败"));
        return null;
      }
      workingHeadUrlRef.current = result.url;
      setDraftSavedUrl(result.url);
      if (revisionRef.current === savingRevision) {
        docRef.current = snapshot;
        setDocState(snapshot);
        setDirty(false);
      }
      setNotice("");
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tt("草稿保存失败"));
      return null;
    } finally {
      savingDraftRef.current = false;
      setSavingDraft(false);
    }
  }, [item, siteId, tt]);

  const exportVideo = useCallback(async () => {
    if (exporting) return;
    let docToRender = normalizeTimelineDoc(docRef.current);
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

  const restoreRecovery = useCallback(
    (payload: unknown): boolean => {
      if (!isTimelineDoc(payload)) return false;
      const next = normalizeTimelineDoc(structuredClone(payload));
      docRef.current = next;
      setDocState(next);
      undoStack.current = [];
      redoStack.current = [];
      setSelectedClipId("");
      setPlayheadMs(0);
      revisionRef.current += 1;
      setDirty(true);
      setDraftSavedUrl("");
      setNotice(tt("已恢复上次未同步的本地草稿"));
      return true;
    },
    [tt],
  );

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
    editRevision: revisionRef.current,
    canvasRef,
    previewCanvasRef,
    togglePlay,
    seek,
    stepFrame,
    setPxPerSecond,
    setSnapEnabled,
    selectClip: setSelectedClipId,
    undo,
    redo,
    beginGesture,
    endGesture,
    cancelGesture,
    addTrack,
    removeTrack,
    moveClip,
    trimClip,
    splitAtPlayhead,
    deleteSelectedClip,
    duplicateSelectedClip,
    patchClip,
    patchClipTransient,
    setClipTiming,
    setClipSpeed,
    setCanvasFormat,
    addMediaFile,
    addMediaUrl,
    addTextClip,
    captureCover,
    saveDraft,
    exportVideo,
    cancelExport,
    restoreRecovery,
  };
}
