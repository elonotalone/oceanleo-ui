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
import { useUI, type UITranslate } from "../../i18n/ui/useUI";
import { type LibraryItem } from "../library-data";
import {
  guessFileKind,
  guessMediaKind,
  probeMediaSource,
  translateMediaProbeFailure,
} from "./media-probe";
import {
  timelinePreviewRenditionPng,
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
  cutTimelineRange,
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
  VIDEO_TIMELINE_PLACEHOLDER_DURATION_MS,
  isExpiringArtifactGrantUrl,
  planVideoTimelineSeed,
  timelineTitleStem,
  videoTimelineProjectSource,
} from "./video-timeline-source";
import { refreshArtifactRendition } from "../artifact-client";
import {
  healGrantUrl,
  healTimelineGrants,
  replaceClipSources,
  expiringGrantSources,
  type GrantHealDeps,
} from "./grant-heal";
import {
  assertBlobSource,
  parseVideoProjectEnvelope,
} from "../media-editors/source-integrity.mjs";
import {
  recordUserMutation,
  userEditItemKey,
  userMutationGeneration,
} from "../user-edit-session";

const PLACEHOLDER_DURATION_MS = VIDEO_TIMELINE_PLACEHOLDER_DURATION_MS;

export type VideoTimelineUserEditOrigin =
  | "person-commit"
  | "hydrate"
  | "load";

/**
 * Video-timeline person-write choke. History commit / gesture / undo / redo
 * record; load, hydrate, source-byte recovery, and remote apply do not.
 */
export function applyVideoTimelineUserEditSession(
  item: { key?: string; id?: string } | null | undefined,
  origin: VideoTimelineUserEditOrigin | string,
): number {
  const key = userEditItemKey(item);
  if (origin !== "person-commit") return userMutationGeneration(key);
  return recordUserMutation(key);
}

/** Same helper `applyEdit` calls after a real document inequality. */
export function applyVideoTimelineHistoryWriteIfChanged(
  item: { key?: string; id?: string } | null | undefined,
  before: TimelineDoc,
  after: TimelineDoc,
  origin: VideoTimelineUserEditOrigin | string = "person-commit",
): number {
  if (before === after) return userMutationGeneration(userEditItemKey(item));
  return applyVideoTimelineUserEditSession(item, origin);
}

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
  sourceReady: boolean;
  reload: () => void;
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
  /** 按明确 id 删片段；给 agent 用，不依赖「当前选中」。 */
  deleteClip: (clipId: string) => boolean;
  /** 剪掉一段时间，后面的内容左移补上；所有轨道一起剪。 */
  cutRange: (startMs: number, endMs: number) => boolean;
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
  /**
   * 素材库点一下 / 拖进来（D2）：类型与标题已知，走编辑器自己的撤销历史；
   * 失败抛错（素材面板如实显示），不吞。
   */
  insertLibraryMedia: (
    material: { url: string; media: "video" | "audio" | "image"; title: string },
    startAtMs?: number,
  ) => Promise<void>;
  addTextClip: () => void;

  // persistence
  captureCover: () => Promise<void>;
  saveDraft: () => Promise<PersistResult | null>;
  /** 渲染成 mp4 并存进我的库；返回产物地址，失败或取消是空串。 */
  exportVideo: () => Promise<string>;
  cancelExport: () => void;
  restoreRecovery: (payload: unknown) => boolean;
  /**
   * 多人同改：把对方的改动套进来。只替换文档，保留选中（片段还在时）、播放头和缩放；
   * 不动撤销 / 重做栈，不标「未保存」、不加编辑修订号（所以不触发自动保存）、不弹提示。
   * 与 `restoreRecovery`（恢复本地草稿）分开。
   */
  applyRemoteDoc: (payload: unknown) => boolean;
  /**
   * 多人同改：撤销 / 重做算出来的文档，当作本端改动应用（标未保存、走自动保存），
   * 但不进编辑器自己的撤销栈（协同时撤销栈由 use-entity-collab 管，只记我自己的改动）。
   */
  applyLocalDoc: (payload: unknown) => boolean;
}

function trackKindForMedia(kind: "video" | "audio" | "image"): TrackKind {
  return kind;
}

/** grant 地址自愈要用的两个网关动作（重签 / 拷进持久存储）。 */
function timelineGrantDeps(siteId: string, title: string): GrantHealDeps {
  return {
    refresh: async ({ artifactId, revisionId, purpose }) => {
      // 按 grant 原来签的那一份重签（上传的视频只有 source）；读不出再试 full。
      const purposes: Array<"source" | "full" | "preview"> =
        purpose === "source" || purpose === "preview"
          ? [purpose, "full"]
          : ["full", "source"];
      for (const candidate of purposes) {
        const refreshed = await refreshArtifactRendition(
          { artifactId, revisionId },
          candidate,
        );
        const url = refreshed.ok ? String(refreshed.data?.url || "").trim() : "";
        if (url) return url;
      }
      return "";
    },
    importUrl: (url, kind) =>
      importMediaUrl(url, {
        kind: kind === "text" ? undefined : kind,
        siteId,
        title,
        registerAsset: false,
      }),
  };
}

async function durableTimelineSources(
  doc: TimelineDoc,
  siteId: string,
  title: string,
): Promise<TimelineDoc> {
  // 几分钟就过期的签名地址先换掉，否则下面的预检和重开都会 410。
  doc = replaceClipSources(
    doc,
    await healTimelineGrants(doc, timelineGrantDeps(siteId, title)),
  );
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

async function assertTimelineMediaSources(
  doc: TimelineDoc,
  tt: UITranslate,
): Promise<void> {
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
      const probe = await probeMediaSource(url, kind);
      if (probe.ok) return;
      throw new Error(
        translateMediaProbeFailure(tt, probe.reason, kind, "clip", clipId),
      );
    }),
  );
}

function buildInitialDoc(item: LibraryItem): {
  doc: TimelineDoc;
  seededClipId: string;
  seededKind: "video" | "audio" | null;
  sourceReady: boolean;
  sourceError: string;
  projectExpected: boolean;
} {
  return planVideoTimelineSeed(item);
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
  /** 过期签名地址自愈：已换好的（旧 → 新）与正在换的。 */
  const healedGrantsRef = useRef(new Map<string, string>());
  const healingGrantsRef = useRef(new Set<string>());
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
    Boolean(seedRef.current.seededClipId) ||
      (seedRef.current.projectExpected && !seedRef.current.sourceError),
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
  const [error, setError] = useState(seedRef.current.sourceError);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [sourceReady, setSourceReady] = useState(
    seedRef.current.sourceReady,
  );
  const [reloadNonce, setReloadNonce] = useState(0);

  const engineRef = useRef<TimelinePreviewEngine | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const revisionRef = useRef(0);
  const savingDraftRef = useRef(false);
  const sourceReadyRef = useRef(seedRef.current.sourceReady);
  const workingHeadUrlRef = useRef(item.url || item.previewUrl || "");
  const sourceProbeKeysRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const itemRef = useRef(item);
  itemRef.current = item;

  // `tt` 是 provider 所有的函数。今天 I18nProvider 已 useMemo，所以它身份稳定；但只要
  // 有一个站不记忆化 messages，把它放进 effect 依赖就会重新点燃 W13 修掉的那条加载死
  // 循环（effect 里 setState → 重渲染 → tt 换身份 → effect 再跑）。
  // 这个文件里改用 W13 在 `doc-editors/use-grid-editor.ts:410-419` 定下的写法：
  // ref 存最新的 `tt`，effect 只依赖一个身份恒定的包装。
  // 代价说清楚：错误文案会停在报错当时那个语言，不随语言切换重译。这一处刻意选它，
  // 因为 `error` 里混着解码器/网络给的原文，且渲染方 `VideoTimelineStage` 是直接原样
  // 显示的（不在本 owner 的独占面里，不能改成渲染时再翻）。
  const translateRef = useRef(tt);
  useEffect(() => {
    translateRef.current = tt;
  }, [tt]);
  const translate = useCallback<UITranslate>(
    (zh, vars) => translateRef.current(zh, vars),
    [],
  );

  const markSourceReady = useCallback((value: boolean) => {
    sourceReadyRef.current = value;
    setSourceReady(value);
  }, []);
  const requireSourceReady = useCallback(() => {
    if (sourceReadyRef.current) return true;
    setError(
      tt("时间线源尚未成功载入；请先恢复有效工程，已阻止修改空回退内容"),
    );
    return false;
  }, [tt]);

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
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        exportAbortRef.current?.abort();
        exportAbortRef.current = null;
      };
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
        const kind = track.kind;
        void probeMediaSource(sourceUrl, kind)
          .then((probe) => {
            if (!mountedRef.current) return;
            if (!probe.ok) {
              setError(
                translateMediaProbeFailure(
                  translate,
                  probe.reason,
                  kind,
                  "timeline",
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
          })
          .catch((caught) => {
            if (!mountedRef.current) return;
            setError(
              caught instanceof Error
                ? caught.message
                : translate("时间线媒体源探测失败"),
            );
          });
      }
    }
  }, [doc, translate]);

  useEffect(() => {
    workingHeadUrlRef.current = String(
      item.meta.editor_working_head_url || item.url || item.previewUrl || "",
    );
    const project = videoTimelineProjectSource(item);
    const projectUrl = project?.url || "";
    const expectsProject = Boolean(project);
    if (!expectsProject || isTimelineDoc(item.meta.timeline_doc)) {
      return;
    }
    if (!projectUrl) {
      markSourceReady(false);
      setLoadingSource(false);
      setError(
        translate("当前时间线 revision 缺少工程源；已阻止用空时间线替代"),
      );
      return;
    }
    const controller = new AbortController();
    markSourceReady(false);
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
        await assertTimelineMediaSources(normalized, translate);
        if (controller.signal.aborted) return;
        docRef.current = normalized;
        setDocState(normalized);
        setSelectedClipId("");
        setPlayheadMs(0);
        setDirty(false);
        revisionRef.current = 0;
        markSourceReady(true);
        applyVideoTimelineUserEditSession(itemRef.current, "load");
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          markSourceReady(false);
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
    item.meta.source_format,
    item.meta.source_url,
    item.meta.timeline_doc,
    item.title,
    item.url,
    markSourceReady,
    reloadNonce,
    siteId,
    translate,
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
    healingGrantsRef.current.add(itemSourceUrl);
    markSourceReady(false);
    void (async () => {
      try {
        let sourceUrl = itemSourceUrl;
        if (isExpiringArtifactGrantUrl(sourceUrl)) {
          // 签名地址几分钟就 410：先按 revision 重签一份新鲜的，再尽量拷进持久存储，
          // 工程里存持久地址；拷贝失败就先用新鲜地址（下次打开再自愈）。
          const artifactId = String(item.artifactId || "").trim();
          const revisionId = String(item.revisionId || item.artifact?.revisionId || "").trim();
          const healed = await healGrantUrl(
            sourceUrl,
            seededKind,
            timelineGrantDeps(siteId || "video", item.title),
            artifactId && revisionId ? { artifactId, revisionId } : null,
          );
          if (cancelled) return;
          if (healed.url) {
            healedGrantsRef.current.set(sourceUrl, healed.url);
            // 退回的新鲜地址本身也是 grant：记成「已处理」，别再循环重签。
            healingGrantsRef.current.add(healed.url);
            sourceUrl = healed.url;
            setDocState((current) => {
              const next = patchClipIn(current, seededClipId, { source_url: sourceUrl });
              docRef.current = next;
              return next;
            });
          }
        } else if (!isFirstPartyMediaUrl(sourceUrl)) {
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
        if (!probe.ok) {
          setDocState((current) => {
            const next = removeClipFrom(current, seededClipId);
            docRef.current = next;
            return next;
          });
          setSelectedClipId("");
          throw new Error(
            translateMediaProbeFailure(tt, probe.reason, seededKind, "initial"),
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
        markSourceReady(true);
      } catch (caught) {
        if (!cancelled) {
          markSourceReady(false);
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

  // 协同房间、远端改动、撤销栈带回来的过期签名地址：就地换成新地址
  // （不进撤销栈、不标未保存；下一次保存会带上新地址）。
  useEffect(() => {
    const known = new Map<string, string>();
    const pending: Array<[string, TrackKind]> = [];
    for (const [url, kind] of expiringGrantSources(doc)) {
      const healed = healedGrantsRef.current.get(url);
      if (healed) known.set(url, healed);
      else if (!healingGrantsRef.current.has(url)) pending.push([url, kind]);
    }
    const apply = (replacements: ReadonlyMap<string, string>) => {
      if (!replacements.size) return;
      setDocState((current) => {
        const next = replaceClipSources(current, replacements);
        docRef.current = next;
        return next;
      });
    };
    apply(known);
    if (!pending.length) return;
    for (const [url] of pending) healingGrantsRef.current.add(url);
    const deps = timelineGrantDeps(siteId || "video", item.title);
    void (async () => {
      const replacements = new Map<string, string>();
      for (const [url, kind] of pending) {
        // 每条地址每次打开只试一次；换不了就留给预检如实报错。
        const healed = await healGrantUrl(url, kind, deps);
        if (!healed.url) continue;
        healingGrantsRef.current.add(healed.url);
        healedGrantsRef.current.set(url, healed.url);
        replacements.set(url, healed.url);
      }
      apply(replacements);
    })();
  }, [doc, item.title, siteId]);

  // ------------------------------------------------------------- history

  const applyEdit = useCallback(
    (
      updater: (current: TimelineDoc) => TimelineDoc,
      verifiedSourceRecovery = false,
    ) => {
      if (!sourceReadyRef.current && !verifiedSourceRecovery) {
        requireSourceReady();
        return false;
      }
      const current = docRef.current;
      const next = updater(current);
      if (next === current) return false;
      if (verifiedSourceRecovery && !sourceReadyRef.current) {
        undoStack.current = [];
      } else {
        undoStack.current.push(current);
        if (undoStack.current.length > 100) undoStack.current.shift();
      }
      redoStack.current = [];
      docRef.current = next;
      setDocState(next);
      revisionRef.current += 1;
      setDirty(true);
      setDraftSavedUrl("");
      setHistoryVersion((value) => value + 1);
      applyVideoTimelineHistoryWriteIfChanged(
        itemRef.current,
        current,
        next,
        verifiedSourceRecovery ? "hydrate" : "person-commit",
      );
      return true;
    },
    [requireSourceReady],
  );

  const applyTransient = useCallback(
    (updater: (current: TimelineDoc) => TimelineDoc) => {
      if (!requireSourceReady()) return;
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
    [requireSourceReady],
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
    if (committed.dirty) {
      applyVideoTimelineUserEditSession(itemRef.current, "person-commit");
    }
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
    applyVideoTimelineUserEditSession(itemRef.current, "person-commit");
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
    applyVideoTimelineUserEditSession(itemRef.current, "person-commit");
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

  const deleteClip = useCallback(
    (clipId: string) => {
      if (!findClip(docRef.current, clipId)) return false;
      const removed = applyEdit((current) => removeClipFrom(current, clipId));
      if (removed && selectedClipId === clipId) setSelectedClipId("");
      return removed;
    },
    [applyEdit, selectedClipId],
  );

  const cutRange = useCallback(
    (startMs: number, endMs: number) =>
      applyEdit((current) => cutTimelineRange(current, startMs, endMs)),
    [applyEdit],
  );

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
        if (!probe.ok) {
          throw new Error(
            translateMediaProbeFailure(tt, probe.reason, media, "append"),
          );
        }
        duration = probe.durationMs;
        sourceDurationMs = probe.durationMs;
      }
      const appended = applyEdit(
        (current) => {
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
            ...(title.trim() ? { label: title.trim().slice(0, 120) } : {}),
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
        },
        true,
      );
      if (!appended) return;
      markSourceReady(true);
      setNotice(tt("已添加「{title}」", { title }));
    },
    [applyEdit, markSourceReady, tt],
  );

  const insertLibraryMedia = useCallback(
    async (
      material: { url: string; media: "video" | "audio" | "image"; title: string },
      startAtMs?: number,
    ) => {
      if (loadingSource) throw new Error(tt("时间线源仍在载入，请完成后再导入媒体"));
      let url = material.url.trim();
      if (!url) throw new Error(tt("素材导入失败"));
      setAddingMedia(true);
      try {
        const deps = timelineGrantDeps(siteId || "video", material.title);
        if (isExpiringArtifactGrantUrl(url)) {
          // 库里的签名地址几分钟就过期：先换成持久地址（换不了就用新鲜地址，重开时再自愈）。
          const healed = await healGrantUrl(url, material.media, deps);
          if (healed.url) {
            healingGrantsRef.current.add(healed.url);
            healedGrantsRef.current.set(url, healed.url);
            url = healed.url;
          }
        } else if (!isFirstPartyMediaUrl(url)) {
          url = await deps.importUrl(url, material.media);
        }
        await appendSourceClip(url, material.media, material.title, startAtMs);
      } finally {
        setAddingMedia(false);
      }
    },
    [appendSourceClip, loadingSource, siteId, tt],
  );

  const addMediaFile = useCallback(
    async (file: File) => {
      setError("");
      if (loadingSource) {
        setError(tt("时间线源仍在载入，请完成后再导入媒体"));
        return;
      }
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
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : tt("素材导入失败"));
      } finally {
        setAddingMedia(false);
      }
    },
    [appendSourceClip, loadingSource, siteId, tt],
  );

  const addMediaUrl = useCallback(
    async (url: string, startAtMs?: number) => {
      setError("");
      if (loadingSource) {
        setError(tt("时间线源仍在载入，请完成后再导入媒体"));
        return;
      }
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
    [appendSourceClip, loadingSource, siteId, tt],
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
    if (!sourceReadyRef.current) {
      setError(tt("时间线源尚未成功载入，不能从空回退内容截取封面"));
      return;
    }
    // 封面是 poster-frame（§3.3 的 thumbnail 派生源），按源分辨率抓，
    // 不用被 PREVIEW_MAX_WIDTH 限过的取景画布。
    const canvas = engineRef.current?.captureRenditionCanvas("preview") ?? null;
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
    if (!sourceReadyRef.current) {
      setError(tt("时间线源尚未成功载入；已阻止保存空回退工程"));
      return null;
    }
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
      await assertTimelineMediaSources(snapshot, tt);
      const title = `${timelineTitleStem(item.title) || tt("视频")}-${tt("时间线草稿")}`;
      const result = await uploadDraft(
        snapshot,
        item,
        title,
        siteId || "oceanleo",
        `video-timeline:${item.id}:${savingRevision}`,
        workingHeadUrlRef.current,
        tt,
        // §3.3：preview rendition 必须与源同分辨率，所以从引擎另取一块
        // 与 doc 等大的离屏帧，而不是复用被限到 1280 宽的取景画布。
        () =>
          previewReady
            ? timelinePreviewRenditionPng(engineRef.current, snapshot)
            : Promise.resolve(null),
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
  }, [item, previewReady, siteId, tt]);

  // 返回渲染出来的 mp4 地址（失败/取消是空串）：要转成别的容器格式的调用方，
  // 拿不到这个地址就只能去猜 state 什么时候更新，那是必错的一步。
  const exportVideo = useCallback(async (): Promise<string> => {
    if (exporting) return "";
    if (!sourceReadyRef.current) {
      setError(tt("时间线源尚未成功载入；已阻止导出空回退工程"));
      return "";
    }
    let docToRender = normalizeTimelineDoc(docRef.current);
    if (docDurationMs(docToRender) <= 0) {
      setError(tt("时间线是空的，没有可导出的内容"));
      return "";
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
          applyVideoTimelineUserEditSession(itemRef.current, "hydrate");
        }
      }
      const url = await renderTimeline(
        {
          timeline: docToRender,
          title: `${timelineTitleStem(item.title) || tt("视频")}-${tt("剪辑成品")}`,
          site_id: siteId || "oceanleo",
          parent_id: item.id,
          ...(coverUrl ? { cover_url: coverUrl } : {}),
        },
        (state) => {
          if (mountedRef.current) setExportStatus(state.status);
        },
        2000,
        abortController.signal,
      );
      if (!mountedRef.current) return url;
      setExportedUrl(url);
      setNotice(tt("导出完成，已保存到我的库"));
      onSaved?.(url);
      return url;
    } catch (caught) {
      if (!mountedRef.current) return "";
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setExportStatus("canceled");
        setNotice(tt("导出已取消"));
        return "";
      }
      setExportStatus("error");
      setError(caught instanceof Error ? caught.message : tt("导出失败"));
      return "";
    } finally {
      if (exportAbortRef.current === abortController) {
        exportAbortRef.current = null;
      }
      if (mountedRef.current) setExporting(false);
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
      markSourceReady(true);
      setDraftSavedUrl("");
      setError("");
      setNotice(tt("已恢复上次未同步的本地草稿"));
      applyVideoTimelineUserEditSession(itemRef.current, "hydrate");
      return true;
    },
    [markSourceReady, tt],
  );

  const applyRemoteDoc = useCallback((payload: unknown): boolean => {
    if (!isTimelineDoc(payload)) return false;
    const next = normalizeTimelineDoc(structuredClone(payload));
    docRef.current = next;
    setDocState(next);
    // 我正拖着某个片段时对方的改动到了：拖动的「当前画面」换成合并后的文档，起点（取消时回到的地方）不变。
    if (gestureState.current) {
      gestureState.current = { ...gestureState.current, document: next };
    }
    setSelectedClipId((current) => (current && findClip(next, current) ? current : ""));
    applyVideoTimelineUserEditSession(itemRef.current, "hydrate");
    return true;
  }, []);

  const applyLocalDoc = useCallback((payload: unknown): boolean => {
    if (!isTimelineDoc(payload)) return false;
    const next = normalizeTimelineDoc(structuredClone(payload));
    docRef.current = next;
    setDocState(next);
    setSelectedClipId((current) => (current && findClip(next, current) ? current : ""));
    revisionRef.current += 1;
    setDirty(true);
    setDraftSavedUrl("");
    setHistoryVersion((value) => value + 1);
    applyVideoTimelineUserEditSession(itemRef.current, "person-commit");
    return true;
  }, []);

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
    sourceReady,
    reload: () => setReloadNonce((value) => value + 1),
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
    deleteClip,
    cutRange,
    duplicateSelectedClip,
    patchClip,
    patchClipTransient,
    setClipTiming,
    setClipSpeed,
    setCanvasFormat,
    addMediaFile,
    addMediaUrl,
    insertLibraryMedia,
    addTextClip,
    captureCover,
    saveDraft,
    exportVideo,
    cancelExport,
    restoreRecovery,
    applyRemoteDoc,
    applyLocalDoc,
  };
}
