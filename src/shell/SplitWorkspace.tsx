"use client";

// ============================================================================
// @oceanleo/ui — 可拖动两栏工作区 SplitWorkspace（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-19 定稿：OceanLeo 站的「一分为二」工作界面统一长这样：
//   左栏 = AI 推导 / 操控（agent 是聊天流；工作台是固定模板操控）
//   右栏 = 格式化、可编辑结果（地图/画布/小说/PPT/表格/文档/图片…）
//
//   ┌──────────────┊──────────────────────────────┐
//   │ 左（默认 1/3）  ┊ 右（默认 2/3）                 │
//   │  [大屏]        ┊  [大屏]                       │
//   └──────────────┊──────────────────────────────┘
//                  ↑ 中间竖线，左右拖动改比例（localStorage 记忆）
//
// - 默认左 1/3、右 2/3；拖动竖线改比例，按 storageKey 记进 localStorage。
// - 左右各有「大屏」按钮：点击 → 该栏独占全宽（再点恢复）。
// - 移动端（< md）：上下堆叠，竖线/拖动隐藏；大屏按钮改为「只看这栏」切换。
// - 框架无关：左右内容都由消费端传入。
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconLibrary } from "./icons";
import { useUI } from "../i18n/ui/useUI";
import { WORKSPACE_ACTION_EVENT } from "./workspace-actions";

// ----------------------------------------------------------------------------
// 左栏标题（PaneHeader）插槽。doctrine v3（2026-06-21 操作员）：功能区的
// 「操作台 / agent」切换不再是栏体内部的一个 pill 按钮（那会和「操作台」标题
// 文字重复），而是**直接替换左栏标题**——「操作台」标题本身就是可切换的
// 「操作台 | agent」开关。FunctionAgentChat 作为左栏 body 的后代，通过此 context
// 把自己的开关装进左栏标题位置。
// ----------------------------------------------------------------------------
interface LeftPaneSlot {
  /** 用一个节点替换左栏标题（「操作台」文字）。传 null 恢复默认。 */
  setLeftLabel: (node: ReactNode | null) => void;
}
const LeftPaneCtx = createContext<LeftPaneSlot | null>(null);
/** 供 FunctionAgentChat 等左栏 body 后代使用：把「操作台|agent」开关装到左栏标题。 */
export function useLeftPaneSlot(): LeftPaneSlot | null {
  return useContext(LeftPaneCtx);
}

// ----------------------------------------------------------------------------
// 右栏标题（PaneHeader）插槽。宗旨 v11（2026-06-28 操作员）：消除右栏「框中框」。
// 原来右栏 = 外层 <section>（圆角边框 + PaneHeader「结果」标题）再套 ResultCanvas
// （又一层圆角边框 + 标签条）= 两层嵌套。现让 ResultCanvas 把自己的标签条**挂到右栏
// PaneHeader 标题位**（同左栏「操作台|agent」开关的做法），自身不再画边框 → 内容直接
// 贴右栏框、无中间嵌套层。
// ----------------------------------------------------------------------------
interface RightPaneSlot {
  /** 用一个节点替换右栏标题（「结果」文字）。传 null 恢复默认。 */
  setRightLabel: (node: ReactNode | null) => void;
}
const RightPaneCtx = createContext<RightPaneSlot | null>(null);
/** 供 ResultCanvas 等右栏 body 后代使用：把标签条装到右栏标题位（去框中框）。 */
export function useRightPaneSlot(): RightPaneSlot | null {
  return useContext(RightPaneCtx);
}

export interface SplitWorkspaceProps {
  /** 左栏内容（AI 推导 / 模板操控）。 */
  left: ReactNode;
  /** 右栏内容（格式化结果）。不传 / null → 单栏（只显示左栏，无竖线）。 */
  right?: ReactNode;
  /** 左栏初始占比（0–1），默认 1/3。 */
  defaultRatio?: number;
  /** 比例记忆 key（按站 + 形态区分），如 "ui_agent_split"。不传则不持久化。 */
  storageKey?: string;
  /** 左栏标题（大屏按钮旁的小标签）。 */
  leftLabel?: ReactNode;
  /** 右栏标题。 */
  rightLabel?: ReactNode;
  /** 强调色（拖动条 hover / 大屏激活态），默认 indigo。 */
  accent?: string;
  /** 顶部 header 高度（px），用于算可视高度，默认 56。 */
  headerHeight?: number;
  /**
   * 操作员 2026-07-12（修「主站任务页从历史重开后输入框上移、上面内容不见」）：
   * 给了 `true` → 本组件高度取 `100%`（**相对已受限的父容器**）而非
   * `calc(100dvh - headerHeight)`（相对整个视口）。当宿主已经用 flex/grid 把可用高度
   * 约束好（如主站 tasks 页 `<header h-[49px]> + <main flex-1>`），继续用 `100dvh` 记账
   * 会让工作区比父容器高出/错位一截 → 对话流被顶上去、输入框上移、首屏内容被挤出可视区。
   * 此时传 `fillParent` 让工作区严格填满父容器即可。默认 false（保持旧的 100dvh 行为）。 */
  fillParent?: boolean;
  className?: string;
  /**
   * 操作员 2026-07-01：单栏（右版面关闭）时左栏内容的最大宽度并居中，避免操作台
   * 表单把整页铺满 —— 横向范围与 agent 对话框（max-w-2xl/3xl）基本一致。默认
   * "48rem"（≈max-w-3xl）。传 null 关闭限宽（铺满，旧行为）。仅影响单栏模式；双栏
   * （库打开 / agent 结果分屏）不限宽，两栏各自占比。 */
  soloMaxWidth?: string | null;
  /**
   * 操作员 2026-07-01（v2 纠正）：「库」= 右版面的显隐开关，**不内建任何库内容**。
   * OceanLeo 系列右边永远只有【一个】版面：平时收起（不显示），点「库」按钮或点对话/
   * 操作台里的素材 → 展开右版面，显示 `right`（该站【自己的】结果/库内容，如子站的
   * ResultCanvas「本月概览/交易记录/我的数据库」、主站的 FileLibrary）。绝不是把主站那
   * 套库硬塞给子站。
   *
   * 给了 library：
   *   - 关（默认）：右版面不渲染 → 单栏（左栏占满）。左栏标题右侧出现「库」按钮（黑/accent）。
   *   - 开：右版面渲染 `right`，其顶栏 = ✕(左，关闭右版面) / 「库」标题(居中) / 大屏(右)。
   *     左栏那枚「库」按钮此时【隐藏】（避免出现两个「库」）。
   * 不传 library：右版面按 `right` 是否为 null 决定单/双栏（旧行为，无「库」按钮）。 */
  library?: SplitLibraryConfig;
}

export interface SplitLibraryConfig {
  /** 「库」按钮文案，默认「库」。 */
  label?: string;
  /**
   * 「库」按钮样式（关态）。主站传黑胶囊白字，子站可传自己的显眼样式（默认 accent 胶囊）。
   * 传了它就整体覆盖按钮的 className（含开/关态由消费端自理则不建议——一般只需关态样式）。 */
  buttonClassName?: string;
  /** 受控：右版面是否打开。传了它就用受控模式（消费端持有 open 状态，如点素材要打开库）。 */
  open?: boolean;
  /** 受控：切换回调。 */
  onOpenChange?: (open: boolean) => void;
  /** 右版面顶部居中标题，默认「库」。 */
  paneTitle?: ReactNode;
}

type Maxed = "none" | "left" | "right";

const MIN_RATIO = 0.18;
const MAX_RATIO = 0.82;

export function SplitWorkspace({
  left,
  right,
  defaultRatio = 1 / 3,
  storageKey,
  leftLabel,
  rightLabel,
  accent = "#4f46e5",
  headerHeight = 56,
  fillParent = false,
  className = "",
  soloMaxWidth = "48rem",
  library,
}: SplitWorkspaceProps) {
  // 高度：fillParent → 填满已受限的父容器（100%）；否则相对视口 100dvh 减 header（旧行为）。
  const rootHeight = fillParent ? "100%" : `calc(100dvh - ${headerHeight}px)`;
  const tt = useUI();
  // 「库」= 右版面显隐开关（不内建内容）。**默认开**（宗旨 v12.1，操作员 2026-07-04）：
  // 一打开功能页就同时显示「操作台 + 库」，库首屏是「使用指南（navigator）」——让用户
  // 一眼看到这个 app 怎么用、有哪些示例，而不必自己点「库」才看得见。用户仍可点右版面
  // 顶栏 ✕ 收起成单栏。支持受控（消费端持有 open）与非受控（本组件自管）。
  const [internalOpen, setInternalOpen] = useState(true);
  const libraryControlled = library?.open !== undefined;
  const libraryOpen = library != null && (libraryControlled ? Boolean(library.open) : internalOpen);
  const setLibraryOpen = useCallback(
    (v: boolean) => {
      if (!v) setMaxed("none");
      if (!libraryControlled) setInternalOpen(v);
      library?.onOpenChange?.(v);
    },
    [libraryControlled, library],
  );
  // 有 library 时：右版面显隐由 libraryOpen 决定（关→单栏，开→显示 right）。
  // 无 library 时：沿用旧逻辑（right 是否为 null 决定单/双栏）。
  const hasRight = library != null ? libraryOpen : right != null;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(defaultRatio);
  const [maxed, setMaxed] = useState<Maxed>("none");
  const [dragging, setDragging] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // 左栏标题覆盖（FunctionAgentChat 通过 context 装入「操作台|agent」开关）。
  const [leftLabelOverride, setLeftLabelOverride] = useState<ReactNode | null>(null);
  const slot = useMemo<LeftPaneSlot>(
    () => ({ setLeftLabel: (node) => setLeftLabelOverride(node) }),
    [],
  );
  const baseLeftLabel = leftLabelOverride ?? leftLabel;
  // 「库」开关按钮（放左栏标题右侧）。默认关态；库【打开后此按钮隐藏】——避免出现两个
  // 「库」（右版面顶栏已有居中「库」标题 + ✕ 关闭）。样式：主站黑胶囊白字，子站默认 accent
  // 胶囊；消费端可用 library.buttonClassName 覆盖关态样式。
  const libraryLabel = library?.label ?? tt("库");
  const libraryToggle =
    library && !libraryOpen ? (
      <button
        type="button"
        onClick={() => setLibraryOpen(true)}
        title={tt("打开库")}
        className={
          library.buttonClassName ??
          "inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-white transition active:scale-95"
        }
        style={library.buttonClassName ? undefined : { background: accent }}
      >
        <IconLibrary className="h-3.5 w-3.5" />
        {libraryLabel}
      </button>
    ) : null;
  // 左栏标题 = 原标题（纯字符串包成小灰标题）+ 右侧「库」开关。
  const effectiveLeftLabel: ReactNode =
    library && (baseLeftLabel != null || libraryToggle) ? (
      <div className="flex w-full items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {typeof baseLeftLabel === "string" || typeof baseLeftLabel === "number" ? (
            <span className="truncate text-[12px] font-medium text-stone-500">{baseLeftLabel}</span>
          ) : (
            baseLeftLabel
          )}
        </div>
        {libraryToggle}
      </div>
    ) : (
      baseLeftLabel
    );
  // 右栏标题覆盖（ResultCanvas 通过 context 装入标签条 → 去框中框）。
  const [rightLabelOverride, setRightLabelOverride] = useState<ReactNode | null>(null);
  const rightSlot = useMemo<RightPaneSlot>(
    () => ({ setRightLabel: (node) => setRightLabelOverride(node) }),
    [],
  );
  const effectiveRightLabel = rightLabelOverride ?? rightLabel;

  // restore remembered ratio
  useEffect(() => {
    setHydrated(true);
    if (!storageKey) return;
    const raw = localStorage.getItem(storageKey);
    const v = raw ? Number(raw) : NaN;
    if (Number.isFinite(v) && v >= MIN_RATIO && v <= MAX_RATIO) setRatio(v);
  }, [storageKey]);

  // Agent result cards and trusted workspace actions may target content while
  // the library pane is closed. Open the existing pane in place so the card
  // navigates to its real library location instead of becoming a plain link.
  useEffect(() => {
    if (!library) return;
    const openForWorkspaceAction = () => setLibraryOpen(true);
    window.addEventListener(WORKSPACE_ACTION_EVENT, openForWorkspaceAction);
    return () =>
      window.removeEventListener(
        WORKSPACE_ACTION_EVENT,
        openForWorkspaceAction,
      );
  }, [library, setLibraryOpen]);

  const persist = useCallback(
    (v: number) => {
      if (storageKey) localStorage.setItem(storageKey, String(v));
    },
    [storageKey],
  );

  // divider drag
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!hasRight) return;
      e.preventDefault();
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [hasRight],
  );

  useEffect(() => {
    if (!dragging) return;
    function move(e: PointerEvent) {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      let r = (e.clientX - rect.left) / rect.width;
      r = Math.max(MIN_RATIO, Math.min(MAX_RATIO, r));
      setRatio(r);
    }
    function up() {
      setDragging(false);
      setRatio((r) => {
        persist(r);
        return r;
      });
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, persist]);

  const toggleMax = (which: "left" | "right") =>
    setMaxed((m) => (m === which ? "none" : which));

  // computed flex-basis per pane (desktop)
  const leftBasis = !hasRight
    ? "100%"
    : maxed === "left"
      ? "100%"
      : maxed === "right"
        ? "0%"
        : `${ratio * 100}%`;
  const rightBasis = !hasRight
    ? "0%"
    : maxed === "right"
      ? "100%"
      : maxed === "left"
        ? "0%"
        : `${(1 - ratio) * 100}%`;

  function MaxButton({ which }: { which: "left" | "right" }) {
    const on = maxed === which;
    return (
      <button
        type="button"
        onClick={() => toggleMax(which)}
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
          on ? "text-white" : "text-stone-500 hover:bg-stone-100"
        }`}
        style={on ? { background: accent } : undefined}
        title={on ? tt("恢复双栏") : tt("这一栏切大屏")}
      >
        {on ? <IconCompress /> : <IconExpand />}
        {on ? tt("恢复") : tt("大屏")}
      </button>
    );
  }

  // The pane body fills remaining height as a flex column and forces its single
  // child to fill + manage its own overflow. This lets BOTH usage shapes work
  // inside the same skeleton: (a) self-scrolling content (AgentChat's stream,
  // ResultCanvas which has its own tab header + scroll body) and (b) plain long
  // content (wrap it in an overflow-y-auto child yourself, e.g. Studio's ops).
  const bodyClass =
    "flex min-h-0 flex-1 flex-col [&>*]:min-h-0 [&>*]:flex-1";

  // Single-pane mode (no right content): just render left full-width.
  // doctrine v4（2026-06-22）：紧凑内边距——四周（尤其上下）几乎不留白，两栏几乎
  // 占满可视高度。原 px-4 py-4 → p-1.5。
  // A configured library keeps one stable DOM tree while closed. The previous
  // single-pane/dual-pane branch swap unmounted the complete app whenever the
  // user reopened the library, producing a full-page flash and resetting
  // editor/browser state.
  if (!hasRight && !library) {
    return (
      <LeftPaneCtx.Provider value={slot}>
        <div
          className={`p-1.5 ${className}`}
          style={{ height: rootHeight }}
        >
          {/* 单栏：外框卡片【铺满】整个可用宽度（边框不再被压窄——操作员 2026-07-01
              「我不想让边框显得太窄」）。限宽 soloMaxWidth 只作用在【内容】上、居中，
              让内容横向范围与 agent 对话框一致，同时外框仍是一块饱满的卡片。
              soloMaxWidth=null → 内容也铺满（旧行为）。 */}
          <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white/70">
            {(effectiveLeftLabel != null) && (
              <PaneHeader label={effectiveLeftLabel} />
            )}
            <div className={bodyClass}>
              {soloMaxWidth ? (
                <div className="mx-auto w-full" style={{ maxWidth: soloMaxWidth }}>
                  {left}
                </div>
              ) : (
                left
              )}
            </div>
          </div>
        </div>
      </LeftPaneCtx.Provider>
    );
  }

  return (
    <LeftPaneCtx.Provider value={slot}>
    <RightPaneCtx.Provider value={rightSlot}>
    <div
      ref={wrapRef}
      className={`gap-0 p-1.5 ${className} md:flex`}
      style={{ height: rootHeight }}
    >
      {/* 左栏 */}
      <section
        className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white/70 ${
          maxed === "right" ? "hidden md:flex" : "flex"
        } ${maxed === "left" ? "" : ""}`}
        style={
          hydrated || !hasRight
            ? { flexBasis: leftBasis, flexGrow: 0, flexShrink: 0 }
            : { flexBasis: `${defaultRatio * 100}%`, flexGrow: 0, flexShrink: 0 }
        }
      >
        {/* 操作员 2026-07-01：左栏不再放「大屏」按钮——它和左栏标题里的「库」等
            功能按键并排会显得重复/多余，且操作台/agent 语境下真正需要放大的只有右栏
            （库/预览/结果）。左栏标题位保留给「库」等功能开关；放大统一用右栏「大屏」。 */}
        {effectiveLeftLabel != null && <PaneHeader label={effectiveLeftLabel} />}
        <div className={bodyClass}>{left}</div>
      </section>

      {/* 竖线（拖动条）—— 仅桌面、未大屏时可见 */}
      {hasRight && maxed === "none" && (
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onPointerDown}
          className="group relative hidden w-3 shrink-0 cursor-col-resize items-center justify-center md:flex"
          title={tt("拖动调整左右比例")}
        >
          <div
            className="h-16 w-1 rounded-full bg-stone-300 transition-colors group-hover:bg-stone-400"
            style={dragging ? { background: accent } : undefined}
          />
        </div>
      )}

      {/* 右栏 */}
      <section
        className={`mt-1.5 min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white/70 md:mt-0 ${
          !hasRight || maxed === "left" ? "hidden" : "flex"
        }`}
        style={
          hydrated || !hasRight
            ? { flexBasis: rightBasis, flexGrow: 1, flexShrink: 1 }
            : { flexBasis: `${(1 - defaultRatio) * 100}%`, flexGrow: 1, flexShrink: 1 }
        }
      >
        {library ? (
          /* 库模式右版面顶栏（宗旨 v16，操作员 2026-07-06）：一行搞定 =
               ✕(左，关闭右版面) / 标签条(中，取代原居中「库」标题) / 大屏(右)。
             固定标签条（模板 / 预览 / 素材库 / 我的库 / 云端浏览器）由 ResultCanvas 经
             useRightPaneSlot 注入进 rightLabelOverride —— 它直接坐到原「库」标题的位置，
             不再单占第二行。右栏内容不是 ResultCanvas（无注入）时回退显示「库」标题。 */
          <div className="flex min-h-[2.5rem] shrink-0 items-center gap-2 border-b border-stone-100 px-3 py-1.5">
            <button
              type="button"
              onClick={() => setLibraryOpen(false)}
              aria-label={tt("关闭")}
              className="shrink-0 rounded p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            >
              ✕
            </button>
            <div className="min-w-0 flex-1">
              {rightLabelOverride != null ? (
                rightLabelOverride
              ) : (
                <span className="truncate text-[12px] font-medium text-stone-500">
                  {library.paneTitle ?? libraryLabel}
                </span>
              )}
            </div>
            <div className="shrink-0">
              <MaxButton which="right" />
            </div>
          </div>
        ) : (
          <PaneHeader label={effectiveRightLabel}>
            <MaxButton which="right" />
          </PaneHeader>
        )}
        <div className={bodyClass}>{right}</div>
      </section>
    </div>
    </RightPaneCtx.Provider>
    </LeftPaneCtx.Provider>
  );
}

function PaneHeader({ label, children }: { label?: ReactNode; children?: ReactNode }) {
  if (!label && !children) return null;
  // label 可以是纯文字（默认「操作台 / 结果」），也可以是一个交互节点（如功能区
  // 的「操作台 | agent」开关）。纯字符串时套灰色小标题样式；节点时原样渲染。
  const isPlain = typeof label === "string" || typeof label === "number";
  return (
    <div className="flex min-h-[2.5rem] shrink-0 items-center justify-between gap-2 border-b border-stone-100 px-3 py-1.5">
      {isPlain ? (
        <span className="truncate text-[12px] font-medium text-stone-500">{label}</span>
      ) : (
        <div className="min-w-0 flex-1">{label}</div>
      )}
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </div>
  );
}

function IconExpand() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 14v6h6M20 10V4h-6M14 4h6v6M10 20H4v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCompress() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 9H4M9 9V4M15 9h5M15 9V4M9 15H4M9 15v5M15 15h5M15 15v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
