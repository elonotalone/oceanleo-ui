"use client";

// ============================================================================
// @oceanleo/ui — agent 回放页 / 分享页（同一个组件，`playback` 一个开关分两用）
// ----------------------------------------------------------------------------
// 顶上是任务标题；正文按时间顺序**一条条播出来**，工具步骤是可展开的行卡片
// （标题左半是动作、右半是对象，展开后是入参与结果预览，结果像表格就画成真表格）；
// 底部一条状态栏：播放中给「正在播放」+ 结果；播完给「播放完毕」+ 重播。
//
// 两条路由（仲裁 A-1，2026-08-20）：
//   - `/replay/<share_id>`：整段任务，逐步播放 —— `playback` 默认 true。
//   - `/share/<share_id>`：用户勾选后分享出去的那几条消息，静态铺开 ——
//     `playback={false}`。收到链接的人要看的是那几条消息本身，不是一段动画，
//     所以这一档**不出**播放条、不出「重播」、不逐条动画。
//   两条路由共用这一个组件（不复制一份），差别只在这个开关。
//
// 安全（任务书不可协商项）：
//   - 这页渲染的全是**用户文字**，一律走 React 文本节点。没有 `dangerouslySetInnerHTML`，
//     没有 markdown/HTML 渲染器，没有 iframe——回放里不嵌生成站点/游戏预览，
//     所以也就不存在「iframe 必须指向 *.oceanleo.app」那一条要守。
//     日后真要嵌预览，`src` 必须是 `*.oceanleo.app`，且 `sandbox` 不得同时带
//     `allow-scripts` 与 `allow-same-origin`。
//   - 页面本身留在 `oceanleo.com`（合同 R7）。
//
// 顺序 / 节奏 / 跳过 / 重播四件事全在 ./replay-model 的纯函数与 reducer 里，
// 这里只负责「到点 dispatch 一次」和把结果画出来。
// ============================================================================

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { REPLAY_SAMPLE } from "./replay-sample";
import {
  buildReplaySteps,
  createReplayState,
  nextReplayDelayMs,
  replayReducer,
  replayResultStepId,
  type ReplayPreview,
  type ReplayStep,
} from "./replay-model";
import { fetchSharedReplay, type SharedReplay } from "./share-client";

export interface AgentReplayPageProps {
  /** 分享 id；给了就去 `GET /v1/share/<id>` 取数。 */
  shareId?: string;
  /** 直接把数据喂进来（测试、SSR 预取、以及后端未上线时的样例）。 */
  replay?: SharedReplay;
  /**
   * 播放这件事整体在不在。`false` = 静态铺开：没有播放条、没有「重播」、
   * 没有逐条动画，一进来全部消息就在那儿（`/share/<share_id>` 用这一档）。
   */
  playback?: boolean;
  /** 关掉自动播放，一进来就是铺完的完成态（打印、截图、无障碍偏好用）。 */
  autoPlay?: boolean;
  gatewayBase?: string;
  fetchImpl?: typeof fetch;
}

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; replay: SharedReplay }
  | { phase: "error"; message: string };

function initialLoadState(props: AgentReplayPageProps): LoadState {
  if (props.replay) return { phase: "ready", replay: props.replay };
  if (props.shareId) return { phase: "loading" };
  // 既没有 id 也没有数据 = 本地开发：用写死样例，别给一张白页。
  return { phase: "ready", replay: REPLAY_SAMPLE };
}

export function AgentReplayPage(props: AgentReplayPageProps) {
  const {
    shareId,
    replay,
    playback = true,
    autoPlay = true,
    gatewayBase,
    fetchImpl,
  } = props;
  // 静态档连「自动播放」都无从谈起：一个开关关掉，下面所有定时器就都不挂。
  const animate = playback && autoPlay;
  const tt = useUI();
  const [load, setLoad] = useState<LoadState>(() => initialLoadState(props));

  useEffect(() => {
    if (replay) {
      setLoad({ phase: "ready", replay });
      return;
    }
    if (!shareId) {
      setLoad({ phase: "ready", replay: REPLAY_SAMPLE });
      return;
    }
    let active = true;
    setLoad({ phase: "loading" });
    void fetchSharedReplay(shareId, { gatewayBase, fetchImpl }).then((result) => {
      if (!active) return;
      setLoad(
        result.ok && result.data
          ? { phase: "ready", replay: result.data }
          : { phase: "error", message: result.error || "share unavailable" },
      );
    });
    return () => {
      active = false;
    };
  }, [shareId, replay, gatewayBase, fetchImpl]);

  // 刻意**不**把 `tt` 喂进 `buildReplaySteps`：动作名回来的就是中文原文，也就是
  // 词典 key，翻译推迟到画每一行时做。若把 `tt` 变成这里的依赖，只要哪天 `useUI()`
  // 不再返回稳定引用，这份 memo 每渲染一次就换一个数组，下面那个 `load` effect 会
  // 跟着复位播放进度——页面表现成「永远播不完第一条」。
  const steps = useMemo(
    () => (load.phase === "ready" ? buildReplaySteps(load.replay.messages) : []),
    [load],
  );

  const [state, dispatch] = useReducer(replayReducer, steps.length, createReplayState);

  // 数据换了就从头播；不播的那两档（`playback=false` / `autoPlay=false`）直接铺完。
  useEffect(() => {
    dispatch({ type: "load", total: steps.length });
    if (!animate) dispatch({ type: "skip" });
  }, [steps, animate]);

  useEffect(() => {
    if (!animate) return;
    const delay = nextReplayDelayMs(state, steps);
    if (delay === null) return;
    const timer = setTimeout(() => dispatch({ type: "reveal" }), delay);
    return () => clearTimeout(timer);
  }, [state, steps, animate]);

  const resultId = useMemo(() => replayResultStepId(steps), [steps]);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [jumpPending, setJumpPending] = useState(false);

  useEffect(() => {
    if (!jumpPending || state.status !== "completed") return;
    setJumpPending(false);
    const node = resultRef.current;
    // `scrollIntoView` 在 jsdom 与部分内嵌 WebView 里根本不存在；跳不动是小事，
    // 因为它把整页炸成空白才是大事。
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "center" });
    }
  }, [jumpPending, state.status]);

  const skip = useCallback(() => dispatch({ type: "skip" }), []);
  const restart = useCallback(() => dispatch({ type: "restart" }), []);
  const jumpToResult = useCallback(() => {
    setJumpPending(true);
    dispatch({ type: "skip" });
  }, []);

  if (load.phase === "loading") {
    return (
      <div
        data-replay-root="loading"
        className="grid min-h-[60vh] place-items-center text-[13px] text-stone-400"
      >
        {playback ? tt("正在打开回放…") : tt("正在打开分享…")}
      </div>
    );
  }
  if (load.phase === "error") {
    return (
      <div
        data-replay-root="error"
        className="grid min-h-[60vh] place-items-center px-6 text-center text-[13px] text-stone-500"
      >
        {playback
          ? tt("这个回放打不开了，可能已被分享者关闭。")
          : tt("这个分享打不开了，可能已被分享者关闭。")}
      </div>
    );
  }

  // 静态档不看 reducer：全部消息在**首帧**就在那儿，不经过「先空一下再补齐」
  // 那一帧（分享链接是给陌生人开的，不该先给人看一眼空白）。
  const visible = playback ? steps.slice(0, state.revealed) : steps;
  const playing = playback && state.status === "playing";

  return (
    <div
      data-replay-root="ready"
      data-replay-mode={playback ? "playback" : "static"}
      data-replay-status={playback ? state.status : "static"}
      className="flex min-h-screen flex-col bg-white"
    >
      <header className="shrink-0 border-b border-stone-100 px-5 py-4 sm:px-8">
        <h1
          data-replay-title
          className="text-[17px] font-semibold leading-snug text-neutral-900"
        >
          {load.replay.title || tt("agent 回放")}
        </h1>
        <p className="mt-1 text-[12px] text-stone-400">
          {playback
            ? tt("共 {n} 步", { n: steps.length })
            : tt("分享了 {n} 条消息", { n: steps.length })}
        </p>
      </header>

      {/* 播放中点正文任意处 = 跳过，与底部按钮同一个动作。 */}
      <main
        data-replay-body
        onClick={playing ? skip : undefined}
        className="mx-auto w-full max-w-3xl flex-1 space-y-2 px-5 py-6 sm:px-8"
      >
        {visible.map((step) => (
          <div
            key={step.id}
            ref={step.id === resultId ? resultRef : undefined}
            data-replay-row={step.kind}
            data-replay-step-id={step.id}
          >
            <ReplayRow step={step} />
          </div>
        ))}
        {playing && (
          <p data-replay-cursor className="px-1 py-2 text-[13px] text-stone-300">
            {tt("…")}
          </p>
        )}
      </main>

      {/* 静态档没有播放条：没有在播的东西，也就没有「播放完毕」和「重播」。 */}
      {playback && (
        <footer
          data-replay-statusbar
          className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-3 border-t border-stone-100 bg-white/95 px-5 py-3 backdrop-blur sm:px-8"
        >
          <span className="flex min-w-0 items-center gap-2 text-[13px] text-stone-500">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                playing ? "animate-pulse bg-sky-500" : "bg-stone-300"
              }`}
            />
            <span className="truncate">
              {playing
                ? `OceanLeo Agent ${tt("正在播放")}`
                : `OceanLeo Agent ${tt("播放完毕")}`}
            </span>
          </span>
          {playing ? (
            <span className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                data-replay-control="skip"
                onClick={skip}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-stone-500 transition hover:bg-stone-100"
              >
                {tt("跳过")}
              </button>
              <button
                type="button"
                data-replay-control="result"
                onClick={jumpToResult}
                className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-neutral-700"
              >
                {tt("结果")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              data-replay-control="replay"
              onClick={restart}
              className="shrink-0 rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-neutral-700"
            >
              {tt("重播")}
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

/** 卡片行（工具步骤、或任何带预览的消息）；其余走摊开的正文行。 */
function isCardRow(step: ReplayStep): boolean {
  return (
    step.kind === "step" ||
    step.args.kind !== "none" ||
    step.result.kind !== "none"
  );
}

function ReplayRow({ step }: { step: ReplayStep }) {
  return isCardRow(step) ? <ReplayStepCard step={step} /> : <ReplayTextRow step={step} />;
}

function ReplayTextRow({ step }: { step: ReplayStep }) {
  if (step.role === "user") {
    return (
      <div className="flex justify-end">
        <p
          data-replay-text="user"
          className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5 text-[15px] leading-relaxed text-neutral-900"
        >
          {step.content}
        </p>
      </div>
    );
  }
  if (step.kind === "error") {
    return (
      <p
        data-replay-text="error"
        className="whitespace-pre-wrap rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-600"
      >
        {step.content}
      </p>
    );
  }
  if (step.kind === "plan" || step.kind === "analysis") {
    return (
      <p
        data-replay-text={step.kind}
        className="whitespace-pre-wrap border-l-2 border-stone-200 py-0.5 pl-3 text-[14px] leading-relaxed text-stone-500"
      >
        {step.content}
      </p>
    );
  }
  return (
    <p
      data-replay-text="answer"
      className="whitespace-pre-wrap px-1 py-1 text-[15px] leading-relaxed text-neutral-900"
    >
      {step.content}
    </p>
  );
}

function ReplayStepCard({ step }: { step: ReplayStep }) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const hasDetail = step.args.kind !== "none" || step.result.kind !== "none";

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <button
        type="button"
        data-replay-card-toggle
        aria-expanded={open}
        onClick={(event) => {
          // 展开是行内动作，不该顺带触发正文那层的「跳过」。
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-stone-50"
      >
        <span
          data-replay-action
          className="shrink-0 text-[13px] font-medium text-neutral-900"
        >
          {tt(step.action)}
        </span>
        {step.target && (
          <>
            <span aria-hidden className="shrink-0 text-stone-300">
              |
            </span>
            <span
              data-replay-target
              className="min-w-0 flex-1 truncate text-[13px] text-stone-500"
            >
              {step.target}
            </span>
          </>
        )}
        <span
          aria-hidden
          className={`ml-auto shrink-0 text-[11px] text-stone-400 transition ${
            open ? "rotate-90" : ""
          }`}
        >
          ›
        </span>
      </button>
      {open && (
        <div data-replay-card-detail className="space-y-3 border-t border-stone-100 px-3 py-3">
          <PreviewBlock label={tt("入参")} preview={step.args} />
          <PreviewBlock label={tt("结果")} preview={step.result} />
          {!hasDetail && step.content && (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-stone-600">
              {step.content}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewBlock({ label, preview }: { label: string; preview: ReplayPreview }) {
  const tt = useUI();
  return (
    <section data-replay-preview={preview.kind}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">
        {label}
      </p>
      {preview.kind === "none" && (
        <p data-replay-empty className="text-[12px] italic text-stone-400">
          {tt("无预览")}
        </p>
      )}
      {preview.kind === "text" && (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-stone-50 px-2.5 py-2 font-mono text-[12px] leading-relaxed text-stone-700">
          {preview.text}
        </pre>
      )}
      {preview.kind === "table" && <PreviewTable preview={preview} />}
      {preview.kind !== "none" && preview.truncated && (
        <p data-replay-truncated className="mt-1 text-[11px] text-stone-400">
          {tt("预览已截断，完整内容见原对话")}
        </p>
      )}
    </section>
  );
}

function PreviewTable({
  preview,
}: {
  preview: Extract<ReplayPreview, { kind: "table" }>;
}) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-stone-200">
      <table data-replay-table className="w-full border-collapse text-[12px]">
        {preview.header && (
          <thead className="bg-stone-50">
            <tr>
              {preview.header.map((cell, index) => (
                <th
                  key={index}
                  scope="col"
                  className="whitespace-nowrap border-b border-stone-200 px-2.5 py-1.5 text-left font-medium text-stone-600"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {preview.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-white even:bg-stone-50/60">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="whitespace-nowrap border-b border-stone-100 px-2.5 py-1.5 text-stone-700"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
