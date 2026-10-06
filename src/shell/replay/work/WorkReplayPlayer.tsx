"use client";

// 工作回放播放器（全屏播放层与公开分享页共用）：顶部标题与「谁看过」；中间是当前来源的画面；
// 右侧是 AI 输入/输出气泡流；底部是时间轴。不执行任何用户内容：画面只用 React 画快照（work-chat 契约 §8.2 / §10）。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { Markdown, TypewriterMarkdown } from "../../Markdown";
import type { ImEditorKind } from "../../../lib/im/types";
import type { ReplayFrameRenderer } from "./frame-types";
import { safeOpenPath } from "./fork-artifact";
import { FallbackFrame } from "./frames/fallback";
import { loadFrameRenderer } from "./frames";
import {
  getPublicWorkReplay,
  getPublicWorkReplayFrames,
  getWorkReplay,
  getWorkReplayFrames,
  patchWorkReplay,
  type PatchWorkReplayInput,
  type PublicFetchOptions,
  type ReplayFrames,
  type WorkReplay,
} from "./replay-work-api";
import {
  bubblesAt,
  buildDetailSteps,
  chapterSeqRange,
  chapterStartMs,
  createClock,
  detailStepIndexAt,
  forkSeqAt,
  isTrailFrames,
  revealText,
  sampleFrames,
  seekClock,
  setSpeed,
  tickClock,
  togglePlay,
  type DetailStep,
  type FrameSample,
  type ReplayClock,
} from "./replay-work-model";
import { ReplayShareDialog } from "./ReplayShareDialog";
import { ReplayTrimEditor } from "./ReplayTrimEditor";
import { ReplayViewsPanel } from "./ReplayViewsPanel";
import { createTrailReconstructor, loadYjs, snapshotAt, type TrailReconstructor, type YjsLike, type YjsLoader } from "./trail-reconstruct";
import { WorkReplayTimeline, localizeChapterTitle, localizeEventText, localizeGap } from "./WorkReplayTimeline";

export interface ForkInput {
  editorKind: ImEditorKind;
  title: string;
  json: unknown;
}

export type ForkResult = { ok: true; openPath?: string | null } | { ok: false; error: string };

export interface WorkReplayPlayerProps {
  /** 登录态：回放 id。 */
  replayId?: string;
  /** 公开链接：分享码（`w_` 前缀）。匿名请求，不带身份。 */
  publicCode?: string;
  /** 直接给数据（测试、预取）。 */
  data?: WorkReplay;
  onClose?: () => void;
  /** 「从这一步接手」把还原出的作品 JSON 存成查看者自己的新作品。没给就如实告诉用户暂时做不到。 */
  createArtifact?: (input: ForkInput) => Promise<ForkResult>;
  /** 哪些编辑器族能接手；没给 = 都显示（只要有 `createArtifact`）。不能接手的族不显示按钮。 */
  canForkKind?: (kind: ImEditorKind) => boolean;
  loadYjsImpl?: YjsLoader;
  publicFetch?: PublicFetchOptions;
  autoPlay?: boolean;
}

type LoadState = { phase: "loading" } | { phase: "ready" } | { phase: "error"; status?: number };
type FramesEntry = ReplayFrames | "loading" | "error";

const STAGE_WIDTH = 720;
const STAGE_HEIGHT = 440;
const CLOCK_RENDER_MS = 60;

interface Detail {
  chapterId: string;
  source: string;
  steps: DetailStep[];
  t: number;
  playing: boolean;
}

export function WorkReplayPlayer(props: WorkReplayPlayerProps) {
  const { replayId, publicCode, onClose, createArtifact, canForkKind, publicFetch, autoPlay = true } = props;
  const loadYjsFn = props.loadYjsImpl ?? loadYjs;
  const tt = useUI();
  const isPublic = Boolean(publicCode);
  const [load, setLoad] = useState<LoadState>(props.data ? { phase: "ready" } : { phase: "loading" });
  const [data, setData] = useState<WorkReplay | null>(props.data ?? null);
  const [clock, setClock] = useState<ReplayClock>(() => ({ ...createClock(), playing: autoPlay }));
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const [frames, setFrames] = useState<Record<string, FramesEntry>>({});
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const [renderers, setRenderers] = useState<Record<string, ReplayFrameRenderer | null>>({});
  const [yjs, setYjs] = useState<YjsLike | null>(null);
  const [panel, setPanel] = useState<"views" | "share" | "trim" | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [forkState, setForkState] = useState<
    { phase: "idle" } | { phase: "busy" } | { phase: "error"; message: string } | { phase: "done"; openPath: string | null }
  >({
    phase: "idle",
  });
  const reconstructors = useRef(new Map<string, TrailReconstructor>());

  // ---- 取数 ----
  const fetchData = useCallback(async () => {
    if (props.data) return;
    const result = publicCode
      ? await getPublicWorkReplay(publicCode, publicFetch)
      : replayId
        ? await getWorkReplay(replayId)
        : null;
    if (!result) {
      setLoad({ phase: "error" });
      return;
    }
    if (result.ok && result.data) {
      setData(result.data);
      setLoad({ phase: "ready" });
    } else {
      setLoad({ phase: "error", status: result.status });
    }
  }, [props.data, publicCode, replayId, publicFetch]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    let active = true;
    void loadYjsFn().then((mod) => {
      if (active) setYjs(mod);
    });
    return () => {
      active = false;
    };
  }, [loadYjsFn]);

  useEffect(
    () => () => {
      for (const reconstructor of reconstructors.current.values()) reconstructor.dispose();
      reconstructors.current.clear();
    },
    [],
  );

  // ---- 时钟 ----
  const total = data?.playback_ms ?? 0;
  useEffect(() => {
    if (!data) return undefined;
    let raf = 0;
    // 第一帧只记起点（rAF 的时间原点与 performance.now() 不一定相同，不能混用）。
    let last: number | null = null;
    let sinceRender = 0;
    const loop = (now: number) => {
      const dt = last === null ? 0 : Math.max(now - last, 0);
      last = now;
      sinceRender += dt;
      const current = clockRef.current;
      if (current.playing) {
        const next = tickClock(current, dt, data.playback_ms);
        clockRef.current = next;
        if (sinceRender >= CLOCK_RENDER_MS || next.ended) {
          sinceRender = 0;
          setClock(next);
        }
      }
      setDetail((state) => {
        if (!state || !state.playing) return state;
        const end = state.steps.length ? state.steps[state.steps.length - 1]!.t_ms + state.steps[state.steps.length - 1]!.dur_ms : 0;
        const t = Math.min(state.t + Math.min(dt, 250) * clockRef.current.speed, end);
        return { ...state, t, playing: t < end };
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [data]);

  const sample: FrameSample | null = useMemo(
    () => (data ? sampleFrames(data, clock.t) : null),
    [data, clock.t],
  );
  const focus = detail ? detail.source : (sample?.focus ?? null);
  const focusKind: ImEditorKind | null = detail
    ? (data?.sources.find((source) => source.key === detail.source)?.editor_kind ?? null)
    : (sample?.focusEditorKind ?? null);

  // ---- 画法与帧 ----
  useEffect(() => {
    if (!focusKind || focusKind in renderers) return;
    let active = true;
    void loadFrameRenderer(focusKind).then((renderer) => {
      if (active) setRenderers((current) => ({ ...current, [focusKind]: renderer }));
    });
    return () => {
      active = false;
    };
  }, [focusKind, renderers]);

  const inflight = useRef(new Map<string, Promise<FramesEntry>>());
  const loadFrames = useCallback(
    async (source: string): Promise<FramesEntry> => {
      const existing = framesRef.current[source];
      if (existing && existing !== "loading") return existing;
      const pending = inflight.current.get(source);
      if (pending) return pending;
      if (!data) return "error";
      const promise = (async (): Promise<FramesEntry> => {
        setFrames((current) => ({ ...current, [source]: "loading" }));
        const result = publicCode
          ? await getPublicWorkReplayFrames(publicCode, source, {}, publicFetch)
          : await getWorkReplayFrames(data.replay.id, source);
        const entry: FramesEntry = result.ok && result.data ? result.data : "error";
        framesRef.current = { ...framesRef.current, [source]: entry };
        setFrames((current) => ({ ...current, [source]: entry }));
        inflight.current.delete(source);
        return entry;
      })();
      inflight.current.set(source, promise);
      return promise;
    },
    [data, publicCode, publicFetch],
  );

  useEffect(() => {
    if (focus && focus.startsWith("artifact:")) void loadFrames(focus);
  }, [focus, loadFrames]);

  const reconstructorFor = useCallback(
    (source: string): TrailReconstructor | null => {
      const entry = framesRef.current[source];
      if (!yjs || !entry || typeof entry === "string" || !isTrailFrames(entry)) return null;
      let reconstructor = reconstructors.current.get(source);
      if (!reconstructor) {
        reconstructor = createTrailReconstructor(yjs, entry);
        reconstructors.current.set(source, reconstructor);
      }
      return reconstructor;
    },
    [yjs],
  );

  const renderer = focusKind ? (renderers[focusKind] ?? null) : null;
  const focusFrames = focus ? frames[focus] : undefined;
  const detailSeq = detail ? (detail.steps[detailStepIndexAt(detail.steps, detail.t)]?.seq ?? null) : null;

  const stage = useMemo(() => {
    if (!sample || !focus || !data) return null;
    const state = sample.states[focus];
    const captionText = localizeEventText(tt, sample.event);
    if (!renderer || !focusFrames || typeof focusFrames === "string") {
      return { kind: "fallback" as const, snapshot: null, prev: null, caption: captionText };
    }
    if (isTrailFrames(focusFrames)) {
      const reconstructor = reconstructorFor(focus);
      const seq = detailSeq ?? state?.seqTo ?? null;
      if (!reconstructor || !renderer.fromY || seq === null) {
        return { kind: "fallback" as const, snapshot: null, prev: null, caption: captionText };
      }
      // 先算「改之前」（序号更小，增量），再算「改之后」，一趟走完。
      const prevSeq = detail ? Math.max(seq - 1, focusFrames.base_seq) : (state?.prevSeqTo ?? focusFrames.base_seq);
      const prev = snapshotAt(reconstructor, prevSeq, renderer.fromY);
      const snapshot = snapshotAt(reconstructor, seq, renderer.fromY);
      if (snapshot === null) return { kind: "fallback" as const, snapshot: null, prev: null, caption: captionText };
      return { kind: "renderer" as const, snapshot, prev, caption: renderer.describeChange?.(prev, snapshot, tt) ?? captionText };
    }
    const byId = new Map(focusFrames.items.map((item) => [item.revision_id, item.json] as const));
    const current = state?.revisionId ? byId.get(state.revisionId) : undefined;
    const before = state?.prevRevisionId ? byId.get(state.prevRevisionId) : undefined;
    if (renderer.fromRevision && current !== undefined && current !== null) {
      const snapshot = renderer.fromRevision(current);
      const prev = before !== undefined && before !== null ? renderer.fromRevision(before) : null;
      return { kind: "renderer" as const, snapshot, prev, caption: renderer.describeChange?.(prev, snapshot, tt) ?? captionText };
    }
    return { kind: "fallback" as const, snapshot: current ?? null, prev: before ?? null, caption: captionText };
  }, [sample, focus, data, renderer, focusFrames, reconstructorFor, detailSeq, detail, tt]);

  const focusTitle = data?.sources.find((source) => source.key === focus)?.title ?? "";
  const authorColor = useMemo(() => {
    if (!data || !focus || !sample) return undefined;
    const author = sample.states[focus]?.authorId;
    return data.people.find((person) => person.user_id === author)?.color;
  }, [data, focus, sample]);

  // ---- 操作 ----
  const seek = useCallback(
    (t: number) => {
      if (!data) return;
      setDetail(null);
      const next = seekClock(clockRef.current, t, data.playback_ms);
      clockRef.current = next;
      setClock(next);
    },
    [data],
  );
  const toggle = useCallback(() => {
    if (!data) return;
    setDetail(null);
    const next = togglePlay(clockRef.current, data.playback_ms);
    clockRef.current = next;
    setClock(next);
  }, [data]);
  const changeSpeed = useCallback((speed: ReplayClock["speed"]) => {
    const next = setSpeed(clockRef.current, speed);
    clockRef.current = next;
    setClock(next);
  }, []);

  const jumpChapter = useCallback(
    (chapterId: string) => {
      if (!data) return;
      const start = chapterStartMs(data, chapterId);
      if (start !== null) seek(start);
    },
    [data, seek],
  );

  const expandChapter = useCallback(
    async (chapterId: string) => {
      if (!data) return;
      const chapter = data.chapters.find((item) => item.id === chapterId);
      const source = chapter?.sources.find((key) => key.startsWith("artifact:"));
      if (!chapter || !source) return;
      seek(chapter.start_ms);
      clockRef.current = { ...clockRef.current, playing: false };
      setClock(clockRef.current);
      const entry = await loadFrames(source);
      if (typeof entry === "string" || !isTrailFrames(entry)) {
        setForkState({ phase: "error", message: tt("这一章没有逐步的记录，只能看改之前和改之后。") });
        return;
      }
      setForkState({ phase: "idle" });
      const steps = buildDetailSteps(entry, chapterSeqRange(data, chapter, source));
      setDetail({ chapterId, source, steps, t: 0, playing: steps.length > 0 });
    },
    [data, loadFrames, seek, tt],
  );

  const applyPatch = useCallback(
    async (patch: PatchWorkReplayInput): Promise<WorkReplay | null> => {
      if (!data) return null;
      const result = await patchWorkReplay(data.replay.id, patch);
      if (result.ok && result.data) {
        setData(result.data);
        return result.data;
      }
      return null;
    },
    [data],
  );

  const fork = useCallback(async () => {
    if (!data || !sample) return;
    const target = forkSeqAt(sample);
    const focusSource = target?.source ?? null;
    const kind = focusSource ? (data.sources.find((source) => source.key === focusSource)?.editor_kind ?? null) : null;
    const frameEntry = focusSource ? framesRef.current[focusSource] : undefined;
    const reconstructor = focusSource ? reconstructorFor(focusSource) : null;
    const forkRenderer = kind ? (renderers[kind] ?? (await loadFrameRenderer(kind))) : null;
    if (!target || !kind || !frameEntry || typeof frameEntry === "string" || !isTrailFrames(frameEntry) || !reconstructor || !forkRenderer?.fromY || !forkRenderer.toArtifactJson) {
      setForkState({ phase: "error", message: tt("这一步还不能接手：这个作品没有逐步记录，或这个编辑器还不支持。") });
      return;
    }
    if (!createArtifact) {
      setForkState({ phase: "error", message: tt("暂时还不能把这一步保存成新作品。") });
      return;
    }
    setForkState({ phase: "busy" });
    try {
      const snapshot = snapshotAt(reconstructor, detailSeq ?? target.seq, forkRenderer.fromY);
      const json = snapshot === null ? null : forkRenderer.toArtifactJson(snapshot);
      if (json === null || json === undefined) {
        setForkState({ phase: "error", message: tt("这一步还原不出来，换一步再试。") });
        return;
      }
      const result = await createArtifact({ editorKind: kind, title: tt("{title}（接手）", { title: data.replay.title || tt("工作回放") }), json });
      if (result.ok) {
        setForkState({ phase: "done", openPath: safeOpenPath(result.openPath) });
      } else {
        setForkState({ phase: "error", message: result.error });
      }
    } catch {
      setForkState({ phase: "error", message: tt("接手没有成功，请再试一次。") });
    }
  }, [data, sample, reconstructorFor, renderers, createArtifact, detailSeq, tt]);

  // ---- 渲染 ----
  if (load.phase === "loading") {
    return (
      <div data-work-replay-loading className="flex h-full min-h-[50vh] items-center justify-center text-[13px] text-stone-400">
        {tt("正在加载回放…")}
      </div>
    );
  }
  if (load.phase === "error" || !data || !sample) {
    return (
      <div data-work-replay-error className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 text-[13px] text-stone-500">
        <p>
          {load.phase === "error" && (load.status === 403 || load.status === 404 || load.status === 410)
            ? tt("这段回放不存在，或者你没有权限查看。")
            : tt("回放暂时加载不出来，稍后再试。")}
        </p>
        {onClose ? (
          <button type="button" onClick={onClose} className="rounded-lg border border-stone-300 px-3 py-1.5 hover:bg-stone-50">
            {tt("关闭")}
          </button>
        ) : null}
      </div>
    );
  }

  const bubbles = bubblesAt(data, clock.t);
  const currentEvent = sample.event;
  const showGap = currentEvent?.kind === "gap" && clock.t < currentEvent.t_ms + currentEvent.dur_ms;
  // 接手要三样都在：服务端说这个人能接手、不是公开页、调用方给了存作品的函数；
  // 再加一条：当前画面这一族真的存得成（存不成的族不显示按钮，免得点了才失败）。
  const canFork =
    data.viewer.can_fork &&
    !isPublic &&
    Boolean(createArtifact) &&
    (!canForkKind || (focusKind !== null && canForkKind(focusKind)));
  const hasUndone = data.replay.show_undone;

  return (
    <div data-work-replay-player data-replay-via={data.viewer.via} className="relative flex h-full min-h-0 w-full flex-col bg-white text-neutral-900">
      <header className="flex items-center gap-3 border-b border-stone-200 px-4 py-2.5">
        <h2 data-replay-title className="min-w-0 flex-1 truncate text-[15px] font-medium">
          {data.replay.title || tt("工作回放")}
        </h2>
        <ul className="hidden items-center gap-1 sm:flex" aria-label={tt("参与的人")}>
          {data.people.slice(0, 6).map((person) => (
            <li
              key={person.user_id}
              title={person.display_name}
              data-replay-person={person.user_id}
              data-consent={person.consent}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-white"
              style={{ backgroundColor: person.color, opacity: person.consent === "pending" || person.consent === "declined" ? 0.4 : 1 }}
            >
              {Array.from(person.display_name)[0] ?? "?"}
            </li>
          ))}
        </ul>
        {data.viewer.is_owner ? (
          <>
            <button type="button" data-replay-views-open onClick={() => setPanel(panel === "views" ? null : "views")} className="rounded-lg px-2.5 py-1 text-[12px] text-stone-600 hover:bg-stone-100">
              {tt("谁看过")}
            </button>
            <button type="button" data-replay-trim-open onClick={() => setPanel(panel === "trim" ? null : "trim")} className="rounded-lg px-2.5 py-1 text-[12px] text-stone-600 hover:bg-stone-100">
              {tt("剪辑")}
            </button>
            <button type="button" data-replay-share-open onClick={() => setPanel("share")} className="rounded-lg bg-neutral-900 px-3 py-1 text-[12px] text-white hover:bg-neutral-700">
              {tt("分享")}
            </button>
          </>
        ) : null}
        {data.viewer.via === "admin" ? (
          <span data-replay-admin-note className="rounded bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
            {tt("Team 管理员查看（对方会看到）")}
          </span>
        ) : null}
        {onClose ? (
          <button type="button" data-replay-close onClick={onClose} aria-label={tt("关闭")} className="rounded-lg px-2 py-1 text-[16px] text-stone-500 hover:bg-stone-100">
            ×
          </button>
        ) : null}
      </header>

      {panel === "views" && data.viewer.is_owner ? <ReplayViewsPanel replayId={data.replay.id} onClose={() => setPanel(null)} /> : null}
      {panel === "trim" && data.viewer.is_owner ? (
        <aside className="absolute right-4 top-14 z-10 w-96 rounded-xl border border-stone-200 bg-white p-3 shadow-lg" data-replay-trim-panel>
          <ReplayTrimEditor
            data={data}
            onApply={async (patch) => {
              const next = await applyPatch(patch);
              if (next) setPanel(null);
              return Boolean(next);
            }}
            onClose={() => setPanel(null)}
          />
        </aside>
      ) : null}
      {panel === "share" && data.viewer.is_owner ? (
        <ReplayShareDialog data={data} onClose={() => setPanel(null)} onPatch={applyPatch} onRefresh={() => void fetchData()} />
      ) : null}

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-stone-50 p-4">
          <div data-replay-stage className="relative flex w-full max-w-3xl flex-1 items-center justify-center" style={{ maxHeight: STAGE_HEIGHT }}>
            {stage && stage.kind === "renderer" && renderer ? (
              <renderer.Frame snapshot={stage.snapshot} prev={stage.prev} width={STAGE_WIDTH} height={STAGE_HEIGHT} authorColor={authorColor} />
            ) : (
              <FallbackFrame
                snapshot={stage?.snapshot ?? null}
                prev={stage?.prev ?? null}
                width={STAGE_WIDTH}
                height={STAGE_HEIGHT}
                authorColor={authorColor}
                title={focusTitle}
                caption={stage?.caption ?? null}
              />
            )}
            {showGap ? (
              <div data-replay-gap-banner className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/85 text-[14px] text-stone-600">
                {localizeGap(tt, currentEvent?.text)}
              </div>
            ) : null}
          </div>
          {stage?.caption ? (
            <p data-replay-caption className="max-w-3xl truncate text-[12px] text-stone-500">
              {stage.caption}
            </p>
          ) : null}
          <div className="flex items-center gap-3 text-[12px] text-stone-500">
            {sample.chapter ? (
              <span data-replay-chapter-title className="truncate">
                {localizeChapterTitle(tt, sample.chapter.title, sample.chapter.title_parts)}
              </span>
            ) : null}
            {sample.chapter && !detail ? (
              <button
                type="button"
                data-replay-expand={sample.chapter.id}
                onClick={() => void expandChapter(sample.chapter!.id)}
                className="rounded-md border border-stone-300 px-2 py-0.5 hover:bg-white"
              >
                {tt("展开细节")}
              </button>
            ) : null}
            {detail ? (
              <button type="button" data-replay-collapse onClick={() => setDetail(null)} className="rounded-md border border-stone-300 px-2 py-0.5 hover:bg-white">
                {tt("回到主线")}
              </button>
            ) : null}
            {data.viewer.is_owner ? (
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  data-replay-toggle-undone
                  checked={hasUndone}
                  onChange={(event) => void applyPatch({ show_undone: event.target.checked })}
                />
                {tt("显示被撤销的尝试")}
              </label>
            ) : null}
            {canFork ? (
              <button
                type="button"
                data-replay-fork
                disabled={forkState.phase === "busy"}
                onClick={() => void fork()}
                className="rounded-md bg-neutral-900 px-2.5 py-0.5 text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                {tt("从这一步接手")}
              </button>
            ) : null}
          </div>
          {forkState.phase === "error" ? (
            <p data-replay-fork-error className="text-[12px] text-rose-600">
              {forkState.message}
            </p>
          ) : null}
          {forkState.phase === "done" ? (
            <p data-replay-fork-done className="flex items-center gap-2 text-[12px] text-emerald-700">
              <span>{tt("已存到你的库")}</span>
              {forkState.openPath ? (
                <a data-replay-fork-open href={forkState.openPath} className="rounded-md border border-emerald-300 px-2 py-0.5 hover:bg-white">
                  {tt("打开")}
                </a>
              ) : null}
            </p>
          ) : null}
        </main>

        <aside data-replay-bubbles className="hidden w-80 shrink-0 flex-col gap-3 overflow-auto border-l border-stone-200 bg-white p-3 md:flex" aria-label={tt("AI 对话")}>
          {bubbles.length === 0 ? <p className="text-[12px] text-stone-400">{tt("这一段还没有 AI 对话。")}</p> : null}
          {bubbles.map((bubble) =>
            bubble.role === "user" ? (
              <div key={bubble.id} data-replay-bubble="user" className="ml-auto max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-neutral-900 px-3 py-2 text-[13px] text-white">
                {bubble.text}
              </div>
            ) : (
              <div key={bubble.id} data-replay-bubble="assistant" className="max-w-full rounded-2xl rounded-bl-md bg-stone-100 px-3 py-2 text-[13px]">
                {bubble.progress < 1 ? (
                  <TypewriterMarkdown content={revealText(bubble.text, bubble.progress)} active className="text-[13px] leading-relaxed" />
                ) : (
                  <Markdown className="text-[13px] leading-relaxed">{bubble.text}</Markdown>
                )}
              </div>
            ),
          )}
        </aside>
      </div>

      <WorkReplayTimeline
        data={data}
        clock={clock}
        activeChapterId={sample.chapter?.id ?? null}
        onSeek={seek}
        onToggle={toggle}
        onSpeed={changeSpeed}
        onChapter={jumpChapter}
      />
    </div>
  );
}

