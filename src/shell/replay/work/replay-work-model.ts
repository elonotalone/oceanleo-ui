// 工作回放的播放模型：播放时钟、按时刻抽帧、章节跳转、章节展开细节（work-chat 契约 §7.2 / §7.3）。
// 纯函数，不碰 DOM、不碰网络，播放器只负责「到点调一次」。
import type { ImEditorKind } from "../../../lib/im/types";
import type {
  ReplayFrames,
  TrailFrames,
  WorkReplay,
  WorkReplayChapter,
  WorkReplayEvent,
} from "./replay-work-api";

export const REPLAY_SPEEDS = [1, 2, 4] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** 时钟每次最多前进这么多（切标签页回来不会一下跳很远）。 */
export const MAX_TICK_MS = 250;
/** 展开一个章节看细节时，每一步最少/最多停留多久。 */
export const DETAIL_MIN_STEP_MS = 60;
export const DETAIL_MAX_STEP_MS = 800;
export const DETAIL_MAX_TOTAL_MS = 90_000;

export interface ReplayClock {
  t: number;
  playing: boolean;
  speed: ReplaySpeed;
  ended: boolean;
}

export function createClock(speed: ReplaySpeed = 1): ReplayClock {
  return { t: 0, playing: false, speed, ended: false };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 时钟前进 dtMs（真实时间）× 倍速；到末尾就停并标 ended。 */
export function tickClock(clock: ReplayClock, dtMs: number, totalMs: number): ReplayClock {
  if (!clock.playing || clock.ended) return clock;
  const step = clamp(dtMs, 0, MAX_TICK_MS) * clock.speed;
  const t = Math.min(clock.t + step, totalMs);
  if (t >= totalMs) return { ...clock, t: totalMs, playing: false, ended: true };
  return { ...clock, t };
}

export function seekClock(clock: ReplayClock, t: number, totalMs: number): ReplayClock {
  const next = clamp(t, 0, Math.max(totalMs, 0));
  return { ...clock, t: next, ended: false };
}

export function togglePlay(clock: ReplayClock, totalMs: number): ReplayClock {
  if (clock.ended || (totalMs > 0 && clock.t >= totalMs)) {
    return { ...clock, t: 0, ended: false, playing: true };
  }
  return { ...clock, playing: !clock.playing };
}

export function setSpeed(clock: ReplayClock, speed: ReplaySpeed): ReplayClock {
  return { ...clock, speed };
}

export function nextSpeed(speed: ReplaySpeed): ReplaySpeed {
  const index = REPLAY_SPEEDS.indexOf(speed);
  return REPLAY_SPEEDS[(index + 1) % REPLAY_SPEEDS.length] ?? 1;
}

// ---- 抽帧 ------------------------------------------------------------------

/** 最后一个 `t_ms <= t` 的事件下标；没有返回 -1。`events` 须按 t_ms 升序（后端保证）。 */
export function eventIndexAt(events: readonly WorkReplayEvent[], t: number): number {
  let low = 0;
  let high = events.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (events[mid]!.t_ms <= t) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

export interface SourceFrameState {
  source: string;
  editorKind: ImEditorKind | null;
  /** 协同来源：播放到这一刻，已经应用到哪个 seq（没有编辑为 null）。 */
  seqTo: number | null;
  /** 这一刻之前最近的一次已保存版本。 */
  revisionId: string | null;
  /** 上一帧（用于「改之前」）：协同来源为上一个编辑的 seq，版本来源为上一个版本。 */
  prevSeqTo: number | null;
  prevRevisionId: string | null;
  authorId: string | null;
  changed: boolean;
}

export interface FrameSample {
  /** 此刻画面应该聚焦的来源（最近发生编辑/保存的来源）。 */
  focus: string | null;
  focusEditorKind: ImEditorKind | null;
  states: Record<string, SourceFrameState>;
  /** 此刻所处章节（含被跳过的空白段取前一章）。 */
  chapter: WorkReplayChapter | null;
  event: WorkReplayEvent | null;
}

export function visibleChapters(data: Pick<WorkReplay, "chapters">): WorkReplayChapter[] {
  return data.chapters.filter((chapter) => !chapter.hidden);
}

/** t 所在的章节：落在 [start, end) 里的；落在章节之间（日期标记、gap）取下一章（开始之前）或上一章。 */
export function chapterAt(data: Pick<WorkReplay, "chapters">, t: number): WorkReplayChapter | null {
  const chapters = visibleChapters(data);
  if (chapters.length === 0) return null;
  for (const chapter of chapters) {
    if (t >= chapter.start_ms && t < chapter.end_ms) return chapter;
  }
  let previous: WorkReplayChapter | null = null;
  for (const chapter of chapters) {
    if (chapter.start_ms > t) return previous ?? chapter;
    previous = chapter;
  }
  return previous;
}

export function sampleFrames(
  data: Pick<WorkReplay, "events" | "chapters" | "sources">,
  t: number,
): FrameSample {
  const states: Record<string, SourceFrameState> = {};
  const kindBySource = new Map(data.sources.map((source) => [source.key, source.editor_kind] as const));
  for (const source of data.sources) {
    if (source.key.startsWith("task:")) continue;
    states[source.key] = {
      source: source.key,
      editorKind: source.editor_kind,
      seqTo: null,
      revisionId: null,
      prevSeqTo: null,
      prevRevisionId: null,
      authorId: null,
      changed: false,
    };
  }
  const index = eventIndexAt(data.events, t);
  let focus: string | null = null;
  let lastEvent: WorkReplayEvent | null = null;
  for (let i = 0; i <= index; i += 1) {
    const event = data.events[i]!;
    if (event.kind !== "edit" && event.kind !== "save") continue;
    const state = states[event.source];
    if (!state) continue;
    if (event.kind === "edit") {
      state.prevSeqTo = state.seqTo;
      state.seqTo = event.seq_to ?? event.seq_from ?? state.seqTo;
    } else {
      state.prevRevisionId = state.revisionId;
      state.revisionId = event.revision_id ?? state.revisionId;
    }
    state.authorId = event.author_id ?? state.authorId;
    state.changed = true;
    focus = event.source;
    lastEvent = event;
  }
  if (!focus) {
    focus = Object.keys(states)[0] ?? null;
  }
  return {
    focus,
    focusEditorKind: focus ? (kindBySource.get(focus) ?? null) : null,
    states,
    chapter: chapterAt(data, t),
    event: index >= 0 ? (lastEvent ?? data.events[index]!) : null,
  };
}

// ---- AI 气泡流 --------------------------------------------------------------

export interface ReplayBubble {
  id: string;
  role: "user" | "assistant";
  text: string;
  authorId: string | null;
  /** AI 输出正在「打字」时的已显示字数比例（0–1）；其余为 1。 */
  progress: number;
}

/** 到 t 为止出现过的人输入与 AI 输出；最后一条 AI 输出若还在播放窗口内，按进度露出前一部分。 */
export function bubblesAt(data: Pick<WorkReplay, "events">, t: number, limit = 60): ReplayBubble[] {
  const index = eventIndexAt(data.events, t);
  const bubbles: ReplayBubble[] = [];
  for (let i = 0; i <= index; i += 1) {
    const event = data.events[i]!;
    if (event.kind !== "ai_input" && event.kind !== "ai_output") continue;
    if (!event.text) continue;
    const inWindow = event.kind === "ai_output" && event.dur_ms > 0 && t < event.t_ms + event.dur_ms;
    bubbles.push({
      id: event.id,
      role: event.kind === "ai_input" ? "user" : "assistant",
      text: event.text,
      authorId: event.author_id,
      progress: inWindow ? clamp((t - event.t_ms) / event.dur_ms, 0, 1) : 1,
    });
  }
  return bubbles.slice(-limit);
}

export function revealText(text: string, progress: number): string {
  if (progress >= 1) return text;
  const count = Math.max(0, Math.floor(Array.from(text).length * progress));
  return Array.from(text).slice(0, count).join("");
}

// ---- 章节与时间轴 ------------------------------------------------------------

/** 点章节 = 跳到它的开头。隐藏的章节、不存在的章节返回 null。 */
export function chapterStartMs(data: Pick<WorkReplay, "chapters">, chapterId: string): number | null {
  const chapter = data.chapters.find((item) => item.id === chapterId);
  if (!chapter || chapter.hidden) return null;
  return chapter.start_ms;
}

export interface TimelineMarks {
  chapters: Array<{ id: string; left: number; width: number; hidden: boolean }>;
  days: Array<{ left: number; date: string }>;
  gaps: Array<{ left: number; text: string | null }>;
}

/** 时间轴上各标记的位置（占总时长的 0–1）。 */
export function timelineMarks(data: Pick<WorkReplay, "chapters" | "events" | "playback_ms">): TimelineMarks {
  const total = Math.max(data.playback_ms, 1);
  return {
    chapters: data.chapters.map((chapter) => ({
      id: chapter.id,
      left: clamp(chapter.start_ms / total, 0, 1),
      width: clamp((chapter.end_ms - chapter.start_ms) / total, 0, 1),
      hidden: chapter.hidden,
    })),
    days: data.events
      .filter((event) => event.kind === "day")
      .map((event) => ({ left: clamp(event.t_ms / total, 0, 1), date: event.text ?? "" })),
    gaps: data.events
      .filter((event) => event.kind === "gap")
      .map((event) => ({ left: clamp(event.t_ms / total, 0, 1), text: event.text })),
  };
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function durationParts(ms: number): DurationParts {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return { days, hours, minutes, seconds: totalSeconds % 60 };
}

/** 后端 gap 文案「跳过 2 小时 13 分」→ 数字，界面按语言重新拼。 */
export function parseGapText(text: string | null | undefined): DurationParts | null {
  if (!text) return null;
  const read = (unit: string): number => {
    const match = new RegExp(`(\\d+)\\s*${unit}`).exec(text);
    return match ? Number(match[1]) : 0;
  };
  const parts = { days: read("天"), hours: read("小时"), minutes: read("分"), seconds: read("秒") };
  if (parts.days + parts.hours + parts.minutes + parts.seconds === 0) return null;
  return parts;
}

const WEEKDAY_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;
export type ChapterWeekday = (typeof WEEKDAY_ZH)[number];

/** 后端章节标题「周一 上午 · 周报」拆成部件，界面按语言重新拼。 */
export function parseChapterTitle(
  title: string,
): { weekday: ChapterWeekday; half: "上午" | "下午"; name: string } | null {
  const match = /^(周[一二三四五六日]) (上午|下午) · (.*)$/.exec(title);
  if (!match) return null;
  return {
    weekday: match[1] as ChapterWeekday,
    half: match[2] as "上午" | "下午",
    name: match[3] ?? "",
  };
}

/** 一天 → 当天活跃时长的文字用 durationParts 拼；这里给「今天里活跃了多久」的总分钟数。 */
export function activeMinutes(ms: number): number {
  return Math.max(0, Math.round(ms / 60_000));
}

// ---- 展开章节看细节 ------------------------------------------------------------

export interface DetailStep {
  seq: number;
  t_ms: number;
  dur_ms: number;
  authorId: string | null;
}

/**
 * 点开一个章节后，用 `/frames` 里该章的全部更新逐步播：
 * 真实间隔压到 [60, 800] 毫秒一步，总长不超过 90 秒（太长就等比压缩）。
 */
export function buildDetailSteps(
  frames: TrailFrames,
  range: { fromSeq: number | null; toSeq: number | null },
): DetailStep[] {
  const updates = frames.updates.filter(
    (update) =>
      (range.fromSeq === null || update.seq >= range.fromSeq) &&
      (range.toSeq === null || update.seq <= range.toSeq),
  );
  const steps: DetailStep[] = [];
  let cursor = 0;
  for (let i = 0; i < updates.length; i += 1) {
    const update = updates[i]!;
    const next = updates[i + 1];
    const real = next ? Math.max(next.t_ms - update.t_ms, 0) : DETAIL_MIN_STEP_MS;
    const dur = clamp(real, DETAIL_MIN_STEP_MS, DETAIL_MAX_STEP_MS);
    steps.push({ seq: update.seq, t_ms: cursor, dur_ms: dur, authorId: update.author_id });
    cursor += dur;
  }
  if (cursor > DETAIL_MAX_TOTAL_MS) {
    const scale = DETAIL_MAX_TOTAL_MS / cursor;
    return steps.map((step) => ({ ...step, t_ms: step.t_ms * scale, dur_ms: step.dur_ms * scale }));
  }
  return steps;
}

export function detailStepIndexAt(steps: readonly DetailStep[], t: number): number {
  let found = -1;
  for (let i = 0; i < steps.length; i += 1) {
    if (steps[i]!.t_ms <= t) found = i;
    else break;
  }
  return found;
}

/** 一个章节在主线里对应的 seq 区间（来自该章内的协同编辑事件）。 */
export function chapterSeqRange(
  data: Pick<WorkReplay, "events">,
  chapter: WorkReplayChapter,
  source: string,
): { fromSeq: number | null; toSeq: number | null } {
  let fromSeq: number | null = null;
  let toSeq: number | null = null;
  for (const event of data.events) {
    if (event.source !== source || event.kind !== "edit") continue;
    if (event.t_ms < chapter.start_ms || event.t_ms > chapter.end_ms) continue;
    const lo = event.seq_from;
    const hi = event.seq_to ?? event.seq_from;
    if (lo !== null) fromSeq = fromSeq === null ? lo : Math.min(fromSeq, lo);
    if (hi !== null) toSeq = toSeq === null ? hi : Math.max(toSeq, hi);
  }
  return { fromSeq, toSeq };
}

export function isTrailFrames(frames: ReplayFrames | null | undefined): frames is TrailFrames {
  return !!frames && frames.kind === "trail";
}

/** 「从这一步接手」要还原到的 seq：当前焦点来源在此刻的 seqTo。 */
export function forkSeqAt(sample: FrameSample): { source: string; seq: number } | null {
  if (!sample.focus) return null;
  const state = sample.states[sample.focus];
  if (!state || state.seqTo === null) return null;
  return { source: sample.focus, seq: state.seqTo };
}

// ---- 通用「改之前 / 改之后」画法的文字摘要 --------------------------------------

/**
 * 把任意快照压成一小段纯文本（只当文本节点渲染，不当 HTML）。
 * 字符串原样截断；对象/数组给 JSON 缩略；null/undefined 给空串。
 */
export function summarizeSnapshot(value: unknown, limit = 600): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value, null, 1) ?? "";
    } catch {
      text = String(value);
    }
  }
  const chars = Array.from(text);
  return chars.length > limit ? `${chars.slice(0, limit).join("")}…` : text;
}

/** 两段摘要是否有差别（决定通用画法要不要标「有改动」）。 */
export function snapshotChanged(prev: unknown, next: unknown): boolean {
  return summarizeSnapshot(prev, 4000) !== summarizeSnapshot(next, 4000);
}

// ---- 剪辑：按章节选范围 --------------------------------------------------------

/**
 * 剪辑以章节为单位：从 `fromId` 章的第一个编辑到 `toId` 章的最后一个编辑。
 * 返回真实时刻（只有 owner 能拿到 `at`，所以只有 owner 能剪）；选不出来返回 null。
 */
export function trimRangeForChapters(
  data: Pick<WorkReplay, "chapters" | "events">,
  fromId: string,
  toId: string,
): { trim_from: string; trim_to: string } | null {
  const first = data.chapters.find((chapter) => chapter.id === fromId);
  const last = data.chapters.find((chapter) => chapter.id === toId);
  if (!first || !last || first.hidden || last.hidden || last.start_ms < first.start_ms) return null;
  let from: string | null = null;
  let to: string | null = null;
  for (const event of data.events) {
    if (!event.at) continue;
    if (event.t_ms >= first.start_ms && event.t_ms <= first.end_ms) {
      if (from === null || event.at < from) from = event.at;
    }
    if (event.t_ms >= last.start_ms && event.t_ms <= last.end_ms) {
      if (to === null || event.at > to) to = event.at;
    }
  }
  if (!from || !to || to < from) return null;
  return { trim_from: from, trim_to: to };
}

/** 切换一个章节的隐藏状态，返回新的隐藏章节 id 列表。 */
export function toggleHiddenChapter(hidden: readonly string[], chapterId: string): string[] {
  return hidden.includes(chapterId) ? hidden.filter((id) => id !== chapterId) : [...hidden, chapterId];
}
