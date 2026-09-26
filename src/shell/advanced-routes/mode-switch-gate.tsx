"use client";

/**
 * ModeSwitchGate —— 「编辑 ⇄ 专业编辑」切换的过渡门（plugin-ui-overhaul U4）。
 *
 * 用户之前看到的：点第二行「专业编辑」，页签立刻高亮，舞台却停在普通模式，
 * 几秒后画面突变；切回来同样。原因是 7 个双核路由各写一遍
 * `if (pro) return <Next/>; return <Legacy/>;`——旧面被卸掉的那一刻新面还在加载，
 * 中间是一段空白（或干脆停在旧面直到新 chunk 到齐）。
 *
 * 本组件把这段过渡变成三步、且 7 个路由共用一份：
 *
 *   1. 模式一变，**当前面保持挂着**，舞台顶层立刻出现一层半透明的
 *      `data-mode-switch-pending` 覆盖层（一句「正在切换到专业编辑…」）。
 *   2. 新面同时在覆盖层之下挂载，`visibility:hidden`——**不是** `display:none`：
 *      iframe / canvas 需要真实尺寸来初始化，`display:none` 下它们量到 0×0。
 *   3. 新面调一次 ready 信号（`useModeSwitchReady`），门在同一次提交里
 *      卸旧面、显新面、去覆盖层。进专业面时信号在 60 秒期限内没来就退回并提示（`MODE_SWITCH_FALLBACK_MS`），
 *      不能永远停在覆盖层上。
 *
 * 覆盖层只遮舞台，不遮第一行、第二行：门在挂载后从当前面里找舞台节点
 * （`[data-plugin-chrome-stage]` 或 `[data-advanced-viewport-row]`）并 portal 进去；
 * 门本身已经在舞台内（PdfRoute 的 `stage:` 位置）时找不到子舞台，就地 `absolute inset-0`。
 *
 * 明确不做（任务书边界）：不把两个模式搬进同一个内核实例——deck / richdoc /
 * audio / threed 的专业面是 iframe 应用，那是另一波的事。本门只保证
 * 「切换立刻有反馈、不留白、dispose 时序正确」。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { useUI } from "../../i18n/ui/useUI";
import { usePluginMode } from "../plugin-chrome/plugin-mode";
import type { PluginThemeId } from "../plugin-theme";
import {
  ENTER_PRO_NOT_READY,
  type BeforeEnterPro,
  type EditorHandoff,
} from "./editor-handoff";

export type ModeSwitchFace = "normal" | "pro";

/** 进专业面的整次尝试最多 60 秒，包括交接和等待 ready。 */
export const MODE_SWITCH_FALLBACK_MS = 60_000;

/** 门从当前面里找舞台节点用的选择器（顺序即优先级）。 */
export const MODE_SWITCH_STAGE_SELECTOR =
  "[data-plugin-chrome-stage], [data-advanced-viewport-row]";

const noop = () => {};

/**
 * 新面用来报「首帧可见内容已渲染」的信号。门给待命面注入真信号、给当前面注入
 * noop；门外调用拿到的也是 noop，所以 stage 单独挂（flag=next 直出）时调它没有副作用。
 */
const ModeSwitchReadyContext = createContext<() => void>(noop);
const ModeSwitchFailureContext = createContext<(message?: string) => void>(noop);

const ModeSwitchHandoffContext = createContext<EditorHandoff | null>(null);

/** 专业面读进门时带过来的那份稿。没传 `beforeEnterPro` 的路由拿到 `null`。 */
export function useModeSwitchHandoff(): EditorHandoff | null {
  return useContext(ModeSwitchHandoffContext);
}

/**
 * 在新面里接 ready 信号的唯一入口。
 *
 * - `useModeSwitchReady(ready)`：`ready` 变真的那一次 effect 里发信号——原生 stage 传
 *   「首次成功 paint」的布尔，hosted iframe 传协议 `ready` 消息到达的布尔。这是
 *   任务书要求的「每个 stage 只加一处调用」的形状：一行 hook，不改别的。
 * - `useModeSwitchReady()`：只拿信号函数，自己决定何时调。
 */
export function useModeSwitchReady(ready?: boolean): () => void {
  const signal = useContext(ModeSwitchReadyContext);
  useEffect(() => {
    if (ready === true) signal();
  }, [ready, signal]);
  return signal;
}

/** Report an explicit pro-editor failure so the gate can return immediately. */
export function useModeSwitchFailure(): (message?: string) => void {
  return useContext(ModeSwitchFailureContext);
}

export interface ModeSwitchGateProps {
  /** 目标模式。`true` = 专业编辑。 */
  pro: boolean;
  renderNormal: () => ReactNode;
  renderPro: () => ReactNode;
  /**
   * 进专业面之前要等的事。有这份函数时：成功才把 `handoff` 交给专业面；
   * 失败留在快速面，出不挡操作的提示和重试。没传的路由保持今天的行为。
   * 运行期也认 `Promise<unknown>`（W18–W20 未接完时的旧形状）。
   */
  beforeEnterPro?: BeforeEnterPro | (() => Promise<unknown>);
  /** Deck must capture the normal document even when the saved page starts on pro. */
  captureOnMount?: boolean;
  /** 进专业面失败时（调用方用来把 L0 模式拨回「编辑」）。 */
  onEnterProFailed?: () => void;
  /** 点提示上的「重试」时（调用方再把 L0 拨去「专业编辑」）。 */
  onRetryEnterPro?: () => void;
  /** 兜底毫秒数；默认 `MODE_SWITCH_FALLBACK_MS`。测试用。 */
  fallbackMs?: number;
}

export function ModeSwitchGate({
  pro,
  renderNormal,
  renderPro,
  beforeEnterPro,
  captureOnMount = false,
  onEnterProFailed,
  onRetryEnterPro,
  fallbackMs = MODE_SWITCH_FALLBACK_MS,
}: ModeSwitchGateProps) {
  const target: ModeSwitchFace = pro ? "pro" : "normal";
  const [shown, setShown] = useState<ModeSwitchFace>(() =>
    target === "pro" && beforeEnterPro && captureOnMount ? "normal" : target,
  );
  // `beforeEnterPro` 在飞时为 false：覆盖层在、专业面还不挂。
  const [gateOpen, setGateOpen] = useState(false);
  const [proHandoff, setProHandoff] = useState<EditorHandoff | null>(null);
  const [enterError, setEnterError] = useState<string | null>(null);
  const [enterBlocked, setEnterBlocked] = useState(false);
  const [enterAttempt, setEnterAttempt] = useState(0);
  const enterBlockedRef = useRef(false);
  const pending: ModeSwitchFace | null =
    !enterBlocked && target !== shown ? target : null;

  // 子组件的 passive effect 先于父组件跑；待命面挂上去的那一帧就可能发信号。
  // 用 layout effect 更新目标（layout 阶段整体先于 passive 阶段），信号回调本身保持稳定。
  const targetRef = useRef(target);
  const callbacksRef = useRef({ onEnterProFailed, onRetryEnterPro });
  useLayoutEffect(() => {
    callbacksRef.current = { onEnterProFailed, onRetryEnterPro };
  });
  useLayoutEffect(() => {
    targetRef.current = target;
    // A failed attempt remains blocked until the user returns to normal or retries.
    if (target === "normal") {
      setGateOpen(false);
      enterBlockedRef.current = false;
      setEnterBlocked(false);
    }
  }, [target]);
  const commitPending = useCallback(() => {
    if (enterBlockedRef.current) return;
    setShown(targetRef.current);
    setGateOpen(false);
  }, []);

  const failEnterPro = useCallback(
    (error?: string) => {
      enterBlockedRef.current = true;
      setEnterBlocked(true);
      setEnterError(error || ENTER_PRO_NOT_READY);
      setGateOpen(false);
      callbacksRef.current.onEnterProFailed?.();
    },
    [],
  );

  useEffect(() => {
    if (!pending) return;
    let alive = true;
    const attempt = new AbortController();
    if (pending === "pro" && beforeEnterPro) {
      setGateOpen(false);
      setProHandoff(null);
      enterBlockedRef.current = false;
      setEnterBlocked(false);
      Promise.resolve()
        .then(() => beforeEnterPro(attempt.signal))
        .then((result) => {
          if (!alive) return;
          const record =
            result && typeof result === "object"
              ? (result as Record<string, unknown>)
              : null;
          if (record && record.ok === false) {
            alive = false;
            failEnterPro(
              typeof record.error === "string"
                ? record.error
                : ENTER_PRO_NOT_READY,
            );
            return;
          }
          if (record && record.ok === true && record.handoff) {
            setProHandoff(record.handoff as EditorHandoff);
          }
          setEnterError(null);
          setGateOpen(true);
        })
        .catch(() => {
          if (!alive) return;
          alive = false;
          failEnterPro(ENTER_PRO_NOT_READY);
        });
    }
    const timer = window.setTimeout(() => {
      if (!alive) return;
      alive = false;
      if (pending === "pro") {
        failEnterPro(ENTER_PRO_NOT_READY);
        return;
      }
      commitPending();
    }, fallbackMs);
    return () => {
      alive = false;
      attempt.abort();
      window.clearTimeout(timer);
    };
    // beforeEnterPro 有意不进依赖：它只在切换那一刻取一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, fallbackMs, commitPending, enterAttempt, failEnterPro]);

  const retryEnterPro = useCallback(() => {
    enterBlockedRef.current = false;
    setEnterBlocked(false);
    setEnterError(null);
    setEnterAttempt((value) => value + 1);
    callbacksRef.current.onRetryEnterPro?.();
  }, []);

  const normalRef = useRef<HTMLDivElement | null>(null);
  const proRef = useRef<HTMLDivElement | null>(null);
  const shownRef = shown === "pro" ? proRef : normalRef;

  // 覆盖层的落点：当前面里的舞台节点。找不到（门自己就在舞台里）就地渲染。
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!pending) {
      setOverlayHost(null);
      return;
    }
    const scope = shownRef.current;
    setOverlayHost(
      scope?.querySelector<HTMLElement>(MODE_SWITCH_STAGE_SELECTOR) ?? null,
    );
  }, [pending, shownRef]);

  const mountPro =
    shown === "pro" || (pending === "pro" && (!beforeEnterPro || gateOpen) && !enterBlocked);
  const mountNormal = shown === "normal" || pending === "normal";

  const overlay = pending ? <ModeSwitchPendingOverlay target={pending} /> : null;

  return (
    <div
      data-mode-switch-gate
      data-mode-switch-shown={shown}
      data-mode-switch-target={target}
      className="relative h-full min-h-0 w-full min-w-0"
    >
      {mountNormal && (
        <ModeSwitchFaceSlot
          key="normal"
          face="normal"
          state={shown === "normal" ? "shown" : "pending"}
          slotRef={normalRef}
          signal={pending === "normal" ? commitPending : noop}
          fail={noop}
        >
          {renderNormal()}
        </ModeSwitchFaceSlot>
      )}
      {mountPro && (
        <ModeSwitchFaceSlot
          key="pro"
          face="pro"
          state={shown === "pro" ? "shown" : "pending"}
          slotRef={proRef}
          signal={pending === "pro" ? commitPending : noop}
          fail={pending === "pro" ? failEnterPro : noop}
        >
          <ModeSwitchHandoffContext.Provider value={proHandoff}>
            {renderPro()}
          </ModeSwitchHandoffContext.Provider>
        </ModeSwitchFaceSlot>
      )}
      {overlay &&
        (overlayHost ? createPortal(overlay, overlayHost) : overlay)}
      {enterError ? (
        <ModeSwitchHandoffError
          message={enterError}
          onRetry={retryEnterPro}
        />
      ) : null}
    </div>
  );
}

export interface PluginModeSwitchGateProps
  extends Omit<ModeSwitchGateProps, "pro"> {
  /** 读哪个插件的 L0 模式（`usePluginMode(pluginId).pro`）。 */
  pluginId: PluginThemeId;
}

/**
 * 按插件 L0 模式开关驱动的门：6 个双核路由（Audio / Chart / Deck / Model3D / RichDoc /
 * VideoTimeline）以前各写一个旧式 gate 函数读 `usePluginMode(id).pro` 再在两棵树间
 * remount，现在都换成这一个。PdfRoute 的模式住在路由自己的 state 里，直接用 `ModeSwitchGate`。
 */
export function PluginModeSwitchGate({
  pluginId,
  onEnterProFailed,
  onRetryEnterPro,
  ...rest
}: PluginModeSwitchGateProps) {
  const { pro, setMode } = usePluginMode(pluginId);
  return (
    <ModeSwitchGate
      pro={pro}
      onEnterProFailed={() => {
        onEnterProFailed?.();
        setMode("normal");
      }}
      onRetryEnterPro={() => {
        onRetryEnterPro?.();
        setMode("pro");
      }}
      {...rest}
    />
  );
}

function ModeSwitchFaceSlot({
  face,
  state,
  slotRef,
  signal,
  fail,
  children,
}: {
  face: ModeSwitchFace;
  state: "shown" | "pending";
  slotRef: RefObject<HTMLDivElement | null>;
  signal: () => void;
  fail: (message?: string) => void;
  children: ReactNode;
}) {
  const pendingSlot = state === "pending";
  return (
    <ModeSwitchReadyContext.Provider value={signal}>
      <ModeSwitchFailureContext.Provider value={fail}>
      <div
        ref={slotRef}
        data-mode-switch-face={face}
        data-mode-switch-face-state={state}
        // 待命面：铺满门的整个盒子（与它成为当前面之后的尺寸完全一致，iframe /
        // canvas 在这一步就能按真实尺寸初始化），`visibility:hidden` 不画、不收键鼠、
        // 不进无障碍树。**不**用 `display:none`（尺寸会塌成 0）、**不**加 `aria-hidden`
        // （visibility 已经把它移出无障碍树）。
        className={
          pendingSlot
            ? "absolute inset-0 h-full min-h-0 w-full min-w-0"
            : "relative h-full min-h-0 w-full min-w-0"
        }
        style={pendingSlot ? { visibility: "hidden" } : undefined}
      >
        {children}
      </div>
      </ModeSwitchFailureContext.Provider>
    </ModeSwitchReadyContext.Provider>
  );
}

/**
 * 舞台内的加载覆盖层。`absolute inset-0` 只相对它所在的舞台节点；
 * 第一行、第二行在舞台之外，不会被遮。
 */
function ModeSwitchHandoffError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const tt = useUI();
  return (
    <div
      role="status"
      aria-live="polite"
      data-mode-switch-handoff-error=""
      className="pointer-events-none absolute bottom-3 left-1/2 z-[2147483025] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--awb-border,var(--pchrome-line,#e7e5e4))] bg-[var(--awb-chrome-bg,var(--pchrome-surface,#fff))] px-3 py-1.5 text-[12px] text-[var(--awb-text,var(--pchrome-ink,#292524))] shadow-sm"
    >
      <span>{tt(message)}</span>
      <button
        type="button"
        className="pointer-events-auto rounded-full border border-[var(--awb-border,#e7e5e4)] px-2 py-0.5 text-[11px]"
        onClick={onRetry}
      >
        {tt("重试")}
      </button>
    </div>
  );
}

function ModeSwitchPendingOverlay({ target }: { target: ModeSwitchFace }) {
  const tt = useUI();
  const label =
    target === "pro" ? tt("正在切换到专业编辑…") : tt("正在切换到编辑…");
  return (
    <div
      role="status"
      aria-live="polite"
      data-mode-switch-pending={target}
      className="absolute inset-0 grid place-items-center bg-[color-mix(in_srgb,var(--awb-stage-bg,var(--pchrome-stage,#f5f5f4))_55%,transparent)] backdrop-blur-[1px]"
      // 比舞台右下角缩放控件（2_147_483_010）再高一档：切换期间这些控件也属于旧面。
      style={{ zIndex: 2_147_483_020 }}
    >
      <div className="flex items-center gap-2 rounded-full border border-[var(--awb-border,var(--pchrome-line,#e7e5e4))] bg-[var(--awb-chrome-bg,var(--pchrome-surface,#fff))] px-3 py-1.5 text-[12px] text-[var(--awb-text,var(--pchrome-ink,#292524))] shadow-sm">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--awb-border,#e7e5e4)] border-t-[var(--awb-accent,#7c3aed)]"
        />
        <span>{label}</span>
      </div>
    </div>
  );
}
