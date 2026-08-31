"use client";

// ============================================================================
// 放映态：一台没有 DOM 的状态机，外加把它接到两个窗口上的那个 hook
// ----------------------------------------------------------------------------
// 上半截全是纯函数，`now` 一律由调用方传进来。这不是为了好看：排练计时的判据
// 「第 3 页停了 12.5 秒」只有在时间可控时才是判据，靠 `sleep` 去等真实时钟的测试
// 既慢又会闪。下半截的 hook 才碰 `setInterval` / `window` / 通道。
//
// 计时与停留时长的口径（只有这一条要记住）：
// **停留时长跟着计时器走，不跟着墙上时钟走。** 暂停期间不计入任何一页。
// 实现上不存「这一页是几点进来的」，存的是「进来的那一刻计时器读数是多少」，
// 于是暂停/继续天然正确，不需要在暂停时挨页去补账。
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DeckSlide } from "./deck-schema";
import {
  createTabLink,
  type TabLink,
  type TabLinkFactory,
} from "./DeckPresenterWindow";
import type { DeckPresentationSource } from "./use-deck-editor";

export type PresenterRole = "stage" | "presenter";
export type PresenterBlackout = "none" | "black" | "white";

/**
 * 放映界面当下长成什么样。
 *
 * `split-fallback` 不是「另一种界面」，是**被拒之后的同一件事**——
 * 所以它必须自己说出为什么（`DeckPresenterView` 里那条 `role="status"`）。
 */
export type PresenterSurface = "stage-only" | "dual-window" | "split-fallback";

/** 降级的三种来源。`none` 表示没降级。 */
export type PresenterFallbackReason =
  | "none"
  | "blocked"
  | "unsupported"
  | "no-channel"
  | "peer-closed";

export interface PresenterTimerAnchor {
  running: boolean;
  /** 本次运行之前已经累计的运行时长。 */
  accumulatedMs: number;
  /** 本次运行的起点（`Date.now()` 口径）；没在跑时为 `null`。 */
  startedAt: number | null;
}

export interface PresenterDwell {
  totalMs: number;
  visits: number;
}

export interface DeckPresenterMachineState {
  index: number;
  blackout: PresenterBlackout;
  /** 数字跳页缓冲，形如 `"12"`。空串表示没在输。 */
  jumpBuffer: string;
  timer: PresenterTimerAnchor;
  /** slide id → 停留读数。用 id 不用下标，主窗还活着、随时可能改文档。 */
  dwell: Record<string, PresenterDwell>;
  /** 进入当前页时的计时器读数。 */
  slideEnteredElapsedMs: number;
  revision: number;
  /** 这一版状态是本地产生的还是对面同步过来的。只有本地的才往外发。 */
  origin: "init" | "local" | "remote";
  exited: boolean;
}

export type PresenterCommand =
  | { kind: "next" }
  | { kind: "previous" }
  | { kind: "first" }
  | { kind: "last" }
  | { kind: "goto"; index: number }
  | { kind: "escape" }
  | { kind: "blackout"; mode: "black" | "white" }
  | { kind: "digit"; value: string }
  | { kind: "commit-jump" }
  | { kind: "erase-jump" }
  | { kind: "timer-toggle" }
  | { kind: "timer-reset" };

export interface PresenterContext {
  slideIds: readonly string[];
  now: number;
}

export interface DeckPresenterSyncMessage {
  kind: "sync";
  index: number;
  blackout: PresenterBlackout;
  timer: PresenterTimerAnchor;
  dwell: Record<string, PresenterDwell>;
  slideEnteredElapsedMs: number;
  revision: number;
}

/** 新开的窗口进来先喊一声，让还在放的那一头把当前状态补发过去。 */
export interface DeckPresenterHelloMessage {
  kind: "hello";
}

/** 主窗要走了。收到这条的演讲者窗给提示，而不是变成白板。 */
export interface DeckPresenterFarewellMessage {
  kind: "farewell";
}

/**
 * 讲者在自己那块屏上画的笔迹。
 *
 * 带 `slideId` 而不是下标：讲者画完就翻页时，这条消息可能比翻页那条晚到，
 * 按下标收下就会把上一页的笔迹画到新一页上。收方拿自己当前那一页的 id 去比对，
 * 对不上就丢掉，于是「翻页即清」在两块屏上都成立，不需要额外发一条清除消息。
 *
 * **笔迹永远不进 `DeckSlide`。** 它是讲这一场时的手势，不是文稿的一部分；
 * 放映途中改用户的文稿是这份活的禁区。
 */
export interface DeckPresenterInkMessage {
  kind: "ink";
  slideId: string;
  strokes: readonly string[];
}

export type DeckPresenterMessage =
  | DeckPresenterSyncMessage
  | DeckPresenterHelloMessage
  | DeckPresenterFarewellMessage
  | DeckPresenterInkMessage;

// ── 纯函数层 ─────────────────────────────────────────────────────────────────

export function createPresenterState(
  startIndex: number,
  options: { running?: boolean; now?: number } = {},
): DeckPresenterMachineState {
  const running = options.running ?? false;
  return {
    index: Math.max(0, Math.floor(startIndex) || 0),
    blackout: "none",
    jumpBuffer: "",
    timer: {
      running,
      accumulatedMs: 0,
      startedAt: running ? (options.now ?? 0) : null,
    },
    dwell: {},
    slideEnteredElapsedMs: 0,
    revision: 0,
    origin: "init",
    exited: false,
  };
}

export function presenterElapsedMs(
  timer: PresenterTimerAnchor,
  now: number,
): number {
  const live =
    timer.running && timer.startedAt !== null
      ? Math.max(0, now - timer.startedAt)
      : 0;
  return timer.accumulatedMs + live;
}

/**
 * 一次按键 → 一条指令。
 *
 * `Escape` 故意不在这里分叉成「取消跳页」还是「退出放映」：那取决于缓冲区里有没有
 * 东西，而这个函数看不到状态。分叉留给 `applyPresenterCommand`，
 * 于是「输了一半的页码按 Esc 不该把整场放映关掉」这条能被单独测。
 */
export function deckPresenterKeyCommand(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): PresenterCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key;
  if (key === "ArrowRight" || key === "PageDown") return { kind: "next" };
  // `" "` 是现代浏览器的写法，`"Spacebar"` 是老 Edge/IE 的；两条都收下，成本是一行。
  if (key === " " || key === "Spacebar") return { kind: "next" };
  if (key === "ArrowLeft" || key === "PageUp") return { kind: "previous" };
  if (key === "Home") return { kind: "first" };
  if (key === "End") return { kind: "last" };
  if (key === "Escape") return { kind: "escape" };
  if (key === "b" || key === "B") return { kind: "blackout", mode: "black" };
  if (key === "w" || key === "W") return { kind: "blackout", mode: "white" };
  if (key === "Enter") return { kind: "commit-jump" };
  if (key === "Backspace") return { kind: "erase-jump" };
  if (key.length === 1 && key >= "0" && key <= "9") {
    return { kind: "digit", value: key };
  }
  return null;
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index));
}

/**
 * 翻页，并把离开那一页的停留时长记进账。
 *
 * 同一页原地「翻」到自己不记账也不算一次访问——否则每来一条同步消息都会多一笔。
 */
function moveTo(
  state: DeckPresenterMachineState,
  target: number,
  ctx: PresenterContext,
): DeckPresenterMachineState {
  const next = clampIndex(target, ctx.slideIds.length);
  if (next === state.index) {
    return { ...state, jumpBuffer: "", revision: state.revision + 1 };
  }
  const elapsed = presenterElapsedMs(state.timer, ctx.now);
  const leavingId = ctx.slideIds[state.index];
  const dwell = { ...state.dwell };
  if (leavingId !== undefined) {
    const previous = dwell[leavingId] ?? { totalMs: 0, visits: 0 };
    dwell[leavingId] = {
      totalMs: previous.totalMs + Math.max(0, elapsed - state.slideEnteredElapsedMs),
      visits: previous.visits + 1,
    };
  }
  return {
    ...state,
    index: next,
    // 「可打断」：新的意图一到，黑/白屏就让位，不需要先按一次 B 退出来。
    blackout: "none",
    jumpBuffer: "",
    dwell,
    slideEnteredElapsedMs: elapsed,
    revision: state.revision + 1,
  };
}

export function applyPresenterCommand(
  state: DeckPresenterMachineState,
  command: PresenterCommand,
  ctx: PresenterContext,
): DeckPresenterMachineState {
  const count = ctx.slideIds.length;
  const local = (next: DeckPresenterMachineState) => ({
    ...next,
    origin: "local" as const,
  });

  switch (command.kind) {
    case "next":
      return local(moveTo(state, state.index + 1, ctx));
    case "previous":
      return local(moveTo(state, state.index - 1, ctx));
    case "first":
      return local(moveTo(state, 0, ctx));
    case "last":
      return local(moveTo(state, count - 1, ctx));
    case "goto":
      return local(moveTo(state, command.index, ctx));
    case "digit":
      // 页码是给人看的，从 1 起。四位以上没有意义，也挡住了长按数字键刷爆缓冲。
      return local({
        ...state,
        jumpBuffer: (state.jumpBuffer + command.value).slice(0, 4),
        revision: state.revision + 1,
      });
    case "erase-jump":
      if (!state.jumpBuffer) return state;
      return local({
        ...state,
        jumpBuffer: state.jumpBuffer.slice(0, -1),
        revision: state.revision + 1,
      });
    case "commit-jump": {
      if (!state.jumpBuffer) return state;
      const page = Number.parseInt(state.jumpBuffer, 10);
      if (!Number.isFinite(page) || page <= 0) {
        return local({ ...state, jumpBuffer: "", revision: state.revision + 1 });
      }
      return local(moveTo(state, page - 1, ctx));
    }
    case "escape":
      // 输了一半的页码，Esc 先收回那件事，不关放映。
      if (state.jumpBuffer) {
        return local({ ...state, jumpBuffer: "", revision: state.revision + 1 });
      }
      return local({ ...state, exited: true, revision: state.revision + 1 });
    case "blackout":
      return local({
        ...state,
        blackout: state.blackout === command.mode ? "none" : command.mode,
        revision: state.revision + 1,
      });
    case "timer-toggle": {
      const elapsed = presenterElapsedMs(state.timer, ctx.now);
      return local({
        ...state,
        timer: state.timer.running
          ? { running: false, accumulatedMs: elapsed, startedAt: null }
          : { running: true, accumulatedMs: elapsed, startedAt: ctx.now },
        revision: state.revision + 1,
      });
    }
    case "timer-reset":
      return local({
        ...state,
        timer: {
          running: state.timer.running,
          accumulatedMs: 0,
          startedAt: state.timer.running ? ctx.now : null,
        },
        dwell: {},
        slideEnteredElapsedMs: 0,
        revision: state.revision + 1,
      });
    default:
      return state;
  }
}

/** 对面发来的一版状态。整份接受，并且**不再往回发**（`origin: "remote"`）。 */
export function applyRemoteSync(
  state: DeckPresenterMachineState,
  message: DeckPresenterSyncMessage,
  ctx: PresenterContext,
): DeckPresenterMachineState {
  return {
    ...state,
    index: clampIndex(message.index, ctx.slideIds.length),
    blackout: message.blackout,
    timer: message.timer,
    dwell: message.dwell,
    slideEnteredElapsedMs: message.slideEnteredElapsedMs,
    jumpBuffer: "",
    revision: state.revision + 1,
    origin: "remote",
  };
}

export function presenterSyncMessage(
  state: DeckPresenterMachineState,
): DeckPresenterSyncMessage {
  return {
    kind: "sync",
    index: state.index,
    blackout: state.blackout,
    timer: state.timer,
    dwell: state.dwell,
    slideEnteredElapsedMs: state.slideEnteredElapsedMs,
    revision: state.revision,
  };
}

// ── 排练报表 ─────────────────────────────────────────────────────────────────

export interface DeckRehearsalRow {
  index: number;
  id: string;
  title: string;
  totalMs: number;
  visits: number;
  /** 占全场的百分比，四舍五入到整数。全场为 0 时给 0。 */
  sharePercent: number;
}

/**
 * 每页用时。**当前页也算**——把还站在上面的那一页记成 0 秒，报表就是错的，
 * 而「讲完最后一页看一眼」正是这张表最常见的用法。
 */
export function deckRehearsalReport(
  state: DeckPresenterMachineState,
  slides: readonly Pick<DeckSlide, "id" | "title">[],
  now: number,
): DeckRehearsalRow[] {
  const elapsed = presenterElapsedMs(state.timer, now);
  const currentId = slides[state.index]?.id;
  const rows = slides.map((slide, index) => {
    const recorded = state.dwell[slide.id] ?? { totalMs: 0, visits: 0 };
    const live =
      slide.id === currentId
        ? Math.max(0, elapsed - state.slideEnteredElapsedMs)
        : 0;
    const totalMs = recorded.totalMs + live;
    return {
      index,
      id: slide.id,
      title: slide.title.trim() || `第 ${index + 1} 页`,
      totalMs,
      visits: recorded.visits + (slide.id === currentId ? 1 : 0),
      sharePercent: 0,
    };
  });
  const total = rows.reduce((sum, row) => sum + row.totalMs, 0);
  if (total <= 0) return rows;
  return rows.map((row) => ({
    ...row,
    sharePercent: Math.round((row.totalMs / total) * 100),
  }));
}

export function formatPresenterClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * 报表 → 能塞进 `DeckSlide.notes` 的一行字。
 *
 * 只给「这一页排练用了多久」，不替讲者判断长短：什么算讲太久，取决于这一页在讲什么。
 */
export function deckRehearsalNoteLine(row: DeckRehearsalRow): string {
  return `［排练］本页用时 ${formatPresenterClock(row.totalMs)}（占全场 ${row.sharePercent}%，第 ${row.visits} 次访问）`;
}

// ── hook ─────────────────────────────────────────────────────────────────────

export interface UseDeckPresenterOptions {
  source: DeckPresentationSource;
  role: PresenterRole;
  /** 两个窗口必须给同一个名字，否则各说各话。 */
  channelName: string;
  onExit?: () => void;
  /** 注入口：jsdom 没有 `BroadcastChannel`。`null` 表示明确不要通道（测降级用）。 */
  linkFactory?: TabLinkFactory | null;
  /** 注入口：让排练计时的判据可控。 */
  now?: () => number;
  /** 放映一开始就走表。演讲者视图默认走，纯放映默认不走。 */
  autoStartTimer?: boolean;
  tickMs?: number;
}

export interface DeckPresenterController {
  state: DeckPresenterMachineState;
  slides: readonly DeckSlide[];
  current: DeckSlide | undefined;
  next: DeckSlide | undefined;
  count: number;
  elapsedMs: number;
  slideElapsedMs: number;
  /** 通道通了吗。没通就没有双向同步，界面要说出来。 */
  linked: boolean;
  /** 对面走了。演讲者窗据此给提示而不是白屏。 */
  peerGone: boolean;
  /** 当前这一页的笔迹（SVG path）。翻页后自然为空，不必手动清。 */
  ink: readonly string[];
  /** 覆盖当前页的笔迹并广播给对面。传空数组就是「擦掉」。 */
  pushInk: (strokes: readonly string[]) => void;
  run: (command: PresenterCommand) => void;
  handleKey: (event: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    preventDefault?: () => void;
  }) => boolean;
  rehearsal: () => DeckRehearsalRow[];
  announceFarewell: () => void;
}

/** 同一个空数组常量，免得「这一页没笔迹」每渲染一次都换一个新引用。 */
const EMPTY_INK: readonly string[] = [];

export function useDeckPresenter({
  source,
  role,
  channelName,
  onExit,
  linkFactory,
  now,
  autoStartTimer = role === "presenter",
  tickMs = 250,
}: UseDeckPresenterOptions): DeckPresenterController {
  // `now` 从 ref 里读，于是 `clock` 一次建成永不变。调用方几乎一定会传一个内联箭头
  // 函数，把它放进依赖里会让下面那条建通道的 effect 每渲染一次就拆建一次——
  // 通道拆建的代价不是性能，是**拆掉的那一瞬间对面发来的消息全部丢掉**。
  const nowRef = useRef(now);
  nowRef.current = now;
  const clock = useCallback(
    () => (nowRef.current ? nowRef.current() : Date.now()),
    [],
  );
  const slides = source.deck.slides;
  const slideIds = useMemo(() => slides.map((slide) => slide.id), [slides]);
  const slideIdsRef = useRef(slideIds);
  slideIdsRef.current = slideIds;

  const [state, setState] = useState(() =>
    createPresenterState(source.startIndex, {
      running: autoStartTimer,
      now: clock(),
    }),
  );
  const [peerGone, setPeerGone] = useState(false);
  // 通道通没通是**渲染要用的**，不能只放在 ref 里：ref 是 effect 里才填上的，
  // 首帧读到的永远是 false，界面会当场宣布「已降级」然后再也不改口
  // （没有任何东西会触发第二次渲染）。P4 要求降级必须说出为什么，
  // 那么「没降级」也必须说得准。
  const [linked, setLinked] = useState(false);
  const [ink, setInk] = useState<{ slideId: string; strokes: readonly string[] }>(
    { slideId: "", strokes: [] },
  );
  const [, forceTick] = useState(0);
  const linkRef = useRef<TabLink<DeckPresenterMessage> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  const run = useCallback(
    (command: PresenterCommand) => {
      setState((current) =>
        applyPresenterCommand(current, command, {
          slideIds: slideIdsRef.current,
          now: clock(),
        }),
      );
    },
    [clock],
  );

  const handleKey = useCallback(
    (event: {
      key: string;
      ctrlKey?: boolean;
      metaKey?: boolean;
      altKey?: boolean;
      preventDefault?: () => void;
    }) => {
      const command = deckPresenterKeyCommand(event);
      if (!command) return false;
      event.preventDefault?.();
      run(command);
      return true;
    },
    [run],
  );

  useEffect(() => {
    const link = createTabLink<DeckPresenterMessage>({
      name: channelName,
      factory: linkFactory,
      onMessage: (message) => {
        if (message.kind === "sync") {
          setState((current) =>
            applyRemoteSync(current, message, {
              slideIds: slideIdsRef.current,
              now: clock(),
            }),
          );
          setPeerGone(false);
          return;
        }
        if (message.kind === "hello") {
          // 新窗口进来了：把当前状态补给它，并且把「对面走了」收回去。
          setPeerGone(false);
          link.post(presenterSyncMessage(stateRef.current));
          return;
        }
        if (message.kind === "ink") {
          setInk({ slideId: message.slideId, strokes: message.strokes });
          return;
        }
        if (message.kind === "farewell") setPeerGone(true);
      },
    });
    linkRef.current = link;
    setLinked(link.supported);
    if (link.supported && role === "presenter") link.post({ kind: "hello" });
    return () => {
      // 告别必须在 `close()` 之前发，而且必须发在这里而不是调用方的 effect 清理里：
      // hook 在组件顶上调用，它的清理**先于**组件自己的清理跑，
      // 等调用方那一层收到通知时通道已经关了，那条告别永远发不出去。
      if (link.supported && role === "stage") link.post({ kind: "farewell" });
      link.close();
      linkRef.current = null;
      setLinked(false);
    };
  }, [channelName, linkFactory, role]);

  // 本地产生的每一版都发出去；对面同步过来的那一版不再回发，否则两窗互相触发。
  useEffect(() => {
    if (state.origin !== "local") return;
    linkRef.current?.post(presenterSyncMessage(state));
  }, [state]);

  useEffect(() => {
    if (!state.exited) return;
    exitRef.current?.();
  }, [state.exited]);

  useEffect(() => {
    if (!state.timer.running) return;
    if (typeof setInterval !== "function") return;
    const handle = setInterval(() => forceTick((value) => value + 1), tickMs);
    return () => clearInterval(handle);
  }, [state.timer.running, tickMs]);

  const announceFarewell = useCallback(() => {
    linkRef.current?.post({ kind: "farewell" });
  }, []);

  const at = clock();
  const elapsedMs = presenterElapsedMs(state.timer, at);
  const current = slides[state.index];
  const currentId = current?.id ?? "";

  const pushInk = useCallback(
    (strokes: readonly string[]) => {
      const slideId = slideIdsRef.current[stateRef.current.index] ?? "";
      setInk({ slideId, strokes });
      linkRef.current?.post({ kind: "ink", slideId, strokes });
    },
    [],
  );

  return {
    state,
    slides,
    current,
    next: slides[state.index + 1],
    count: slides.length,
    elapsedMs,
    slideElapsedMs: Math.max(0, elapsedMs - state.slideEnteredElapsedMs),
    linked,
    peerGone,
    // 笔迹**按当前页 id 过滤后**才交出去。清除不是一个动作，是「这一页没有笔迹」
    // 这个事实的自然结果——于是翻页、跳页、对面翻页三条路径都不用各记一次清除。
    ink: ink.slideId === currentId && currentId ? ink.strokes : EMPTY_INK,
    pushInk,
    run,
    handleKey,
    rehearsal: () => deckRehearsalReport(stateRef.current, slides, clock()),
    announceFarewell,
  };
}
