"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { notifyHistoryChanged } from "../lib/history-events";
import {
  LeoBoard,
  leoTypedWorkStaysInPanel,
  matchLeoPanelLocalAction,
  type LeoBoardApi,
  type LeoBoardContext,
} from "./leo/LeoBoard";
import { FloatingMenu } from "../ui/menu/FloatingMenu";
import { LeoSessionList, useLeoSessions } from "./leo/LeoSessions";
import { announceLeoSelection, currentLeoSelection, subscribeLeoSelection } from "./leo/leo-selection";
import { LeoPanelComposer } from "./leo/LeoPanelComposer";
import { LeoTranscript, useLeoTranscript } from "./leo/LeoTranscript";
import { leoTurn, type LeoTurnWireContext } from "./leo/leo-api";
import { panelBox, type LeoPanelAnchor, type LeoPanelViewport } from "./leo/leo-position";
import { getHostText, isEditableInput, type HostTarget } from "./leo/host-input";

// ============================================================================
// @oceanleo/ui — leo 助手浮窗（全家桶单一事实源，2026-09-22 重做）
// ----------------------------------------------------------------------------
// 合同 §2.1（leo-and-shell-rebuild 00-CONTRACT.md）：
//   · 入口只有输入框左下角的 ✦ leo 按钮（LeoEntryButton，W5B）与页面划词气泡；
//     任何页面都没有悬浮气泡。
//   · 面板从按钮上方弹出（底边 = 锚点上 8px，右对齐按钮），永不盖住发送键；
//     标题栏可拖（pointer 事件）；「放大」= 94vw × 90vh 居中；Esc / ✕ 关闭。
//   · 面板主体就是对话记录（紧凑态也显示），记录存服务器（合同 I4），跨页面
//     跨设备同一份；leo 建了任务的那句带任务卡片（标题 + 「打开任务」链接）。
//   · 顶部保留「面板上的文字」（leo board）与动词（扩充/精简/总结/解释/翻译/
//     润色），逻辑照宗旨 v12 不变（见 leo/LeoBoard.tsx）。
//   · 底部输入 + 发送；中文输入法候选态按 Enter 不发送（isComposing）。
//
// 本文件只剩壳：挂载一次、监听 open 事件、定位/拖拽/放大/关闭、组合
// LeoBoard（顶部）+ LeoTranscript（主体）+ LeoPanelComposer（底部）。
// 接口实现分别在 leo/leo-api.ts（I4）与 leo/leo-position.ts（定位纯函数）。
// ============================================================================

/** 触发打开 leo 助手浮窗的全局事件名。LeoEntryButton / 划词气泡派发它。 */
export const OPEN_LEO_EVENT = "oceanleo:open-leo";

// ─────────────────────────────────────────────────────────────────────────────
// leo 总开关（宗旨 v12）：/general 页可开关 leo（默认开启），localStorage
// `oceanleo:leo-enabled`，关闭时输入框按钮 / 划词气泡 / 面板全部不出现。
// ─────────────────────────────────────────────────────────────────────────────
export const LEO_ENABLED_KEY = "oceanleo:leo-enabled";
export const LEO_ENABLED_EVENT = "oceanleo:leo-enabled-change";

export function isLeoEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(LEO_ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setLeoEnabled(on: boolean): void {
  try {
    localStorage.setItem(LEO_ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* noop */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LEO_ENABLED_EVENT, { detail: { enabled: on } }));
  }
}

/** 响应式读取 leo 开关（LeoAssistant / LeoEntryButton / GeneralPage 共用）。 */
export function useLeoEnabled(): boolean {
  // SSR/首帧默认 true（与「默认开启」一致），mount 后同步真实值，避免水合闪烁。
  const [on, setOn] = useState(true);
  useEffect(() => {
    const sync = () => setOn(isLeoEnabled());
    sync();
    window.addEventListener(LEO_ENABLED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LEO_ENABLED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return on;
}

/**
 * leo 面板上下文（合同 I5）：打开方告诉 leo「这句话来自哪个页面」。
 * Shell 页带 computerId / shellSessionId，leo 建的任务挂到那台电脑上。
 * computerName 仅用于放大态标题栏展示「这台电脑：<名字>」，不带则不显示。
 */
export type LeoContext = {
  page: "home" | "task" | "shell" | "other";
  taskId?: string;
  computerId?: string;
  shellSessionId?: string;
  computerName?: string;
};

export interface OpenLeoDetail {
  /** 直接把一段文本送进 leo（页面划词等）。不传则读取宿主输入框内容。 */
  text?: string;
  source?: "input" | "selection" | "button";
  /** 是否切换开关（已打开则关闭）。输入框 leo 图标点击时传 true。 */
  toggle?: boolean;
  /** 入口按钮的视口位置：面板从按钮上方弹出，底边在 anchor 上方 8px，右对齐。 */
  anchor?: DOMRect | null;
  /** 页面上下文（合同 I5）；缺省视为 { page: "other" }。 */
  context?: LeoContext;
}

/** 最近一次 openLeoAssistant 带来的页面上下文（模块状态，合同 I5）。 */
let lastLeoContext: LeoContext | null = null;
/** 最近一次 openLeoAssistant 带来的锚点（模块状态）。 */
let lastLeoAnchor: DOMRect | null = null;

/** 任意位置调用即可打开 leo 助手浮窗（按钮、快捷键、划词气泡等）。 */
export function openLeoAssistant(detail?: OpenLeoDetail): void {
  if (detail?.context) lastLeoContext = detail.context;
  if (detail && "anchor" in detail) lastLeoAnchor = detail.anchor ?? null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<OpenLeoDetail>(OPEN_LEO_EVENT, { detail }));
  }
}

/**
 * @deprecated 宗旨 v11（2026-07-02）废弃：「一键补充自动写回输入框」违反
 * 「结果永不自动写回」原则。保留导出仅为编译兼容，请改用 leo 面板的「扩充」流。
 */
export async function runLeoQuickSuggest(opts: {
  siteId: string;
  docType?: string;
  basePrompt: string;
}): Promise<{ ok: boolean; prompt?: string; error?: string }> {
  const base = (opts.basePrompt || "").trim();
  return { ok: true, prompt: base };
}

// 输入框打出来的动词留在面板执行（leo board），其余的话走 leo-turn。
// 从 leo/LeoBoard.tsx 再导出，旧 import 路径不断。
export { leoTypedWorkStaysInPanel, matchLeoPanelLocalAction };

/** Track the editor / textarea / text input the user is (or was last) working in. */
function useHostInput() {
  const ref = useRef<HostTarget | null>(null);

  const resolve = useCallback((): HostTarget | null => {
    // 1. Currently-focused editable input（含 Tiptap 主编辑器）。
    const active = document.activeElement;
    if (isEditableInput(active)) return active;
    // 2. Last one the user focused (if still in the DOM).
    if (ref.current && ref.current.isConnected) return ref.current;
    // 3. Tiptap 主编辑器（本站主输入框）。
    const editor = document.querySelector<HTMLElement>("[data-oc-slot-editor]");
    if (editor && editor.offsetParent !== null) return editor;
    // 4. Explicitly-tagged primary input.
    const tagged = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(
      "textarea[data-ai-assistant-target], input[data-ai-assistant-target]",
    );
    if (tagged) return tagged;
    // 5. First visible textarea on the page.
    const areas = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"));
    for (const a of areas) {
      if (a.closest("[data-ai-assistant-root]")) continue;
      if (a.offsetParent !== null) return a;
    }
    return null;
  }, []);

  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const t = e.target as Element;
      if (isEditableInput(t)) ref.current = t;
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);

  return { resolve };
}

export interface LeoAssistantProps {
  siteId: string;
  docType?: string;
  title?: string;
  /**
   * 页面划词气泡（宗旨 v11）。默认开启：选中页面文本 → 选区旁浮出 leo 气泡 →
   * 点击把选中文本送进 leo 面板。传 false 关闭（如与站内自有划词功能冲突时）。
   */
  enableSelection?: boolean;
}

const POS_KEY = "oceanleo:leo-assistant-pos";
const LEO_TURN_TEXT_MAX = 8000;

interface Pos {
  left: number;
  top: number;
}

/** SSR / 首帧占位视口；面板打开那一帧会用真实视口重算。 */
const FALLBACK_VIEWPORT: LeoPanelViewport = { width: 1280, height: 800 };

function readSavedPos(): Pos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Pos;
    if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) return saved;
  } catch {
    /* noop */
  }
  return null;
}

/** I5 的 LeoContext → I4 线上形状（蛇形；computerName 只用于展示，不上行）。 */
function toWireContext(ctx: LeoContext | null): LeoTurnWireContext {
  if (!ctx) return { page: "other" };
  const wire: LeoTurnWireContext = { page: ctx.page };
  if (ctx.taskId) wire.task_id = ctx.taskId;
  if (ctx.computerId) wire.computer_id = ctx.computerId;
  if (ctx.shellSessionId) wire.shell_session_id = ctx.shellSessionId;
  return wire;
}

let localEntrySeq = 0;

export function LeoAssistant({
  siteId,
  docType = "doc",
  title,
  enableSelection = true,
}: LeoAssistantProps) {
  const tt = useUI();
  const panelTitle = title ?? "leo";
  const enabled = useLeoEnabled();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [context, setContext] = useState<LeoBoardContext | null>(null);
  const { resolve } = useHostInput();
  // 面板带【内容变化的】新上下文打开时 +1，让 LeoBoard 重置瞬态（board / 问答流）。
  // 同一段文本重复打开不 bump——leo board 要留存（宗旨 v12 规则 5）。
  const [ctxEpoch, setCtxEpoch] = useState(0);
  const ctxTextRef = useRef<string>("");
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  // 合同 I5：最近一次打开的页面上下文（每轮 leo-turn 带上）与锚点（定位用）。
  const pageContextRef = useRef<LeoContext | null>(null);
  const [pageContext, setPageContext] = useState<LeoContext | null>(null);
  const [anchor, setAnchor] = useState<LeoPanelAnchor | null>(null);
  const [dragged, setDragged] = useState<Pos | null>(null);
  const [viewport, setViewport] = useState<LeoPanelViewport>(FALLBACK_VIEWPORT);
  const [turnBusy, setTurnBusy] = useState(false);
  const [boardBusy, setBoardBusy] = useState(false);
  const [turnErr, setTurnErr] = useState<string | null>(null);
  const turnLock = useRef(false);
  const boardApiRef = useRef<LeoBoardApi | null>(null);
  const sessions = useLeoSessions(open, siteId);
  const transcript = useLeoTranscript({ open: open && !sessions.loading, sessionId: sessions.selected });
  const [sessionMenu, setSessionMenu] = useState(false);
  const [boardCollapsed, setBoardCollapsed] = useState(false);
  const sessionAnchor = useRef<HTMLButtonElement>(null);
  const sessionDisabled = turnBusy || sessions.busy || sessions.loading;


  // 打开事件：detail.text（划词）优先；否则读宿主输入框。
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenLeoDetail>).detail;
      // 划词触发在停用时直接忽略
      if (detail?.source === "selection" && !isLeoEnabled()) return;
      const nextPageContext = detail?.context ?? lastLeoContext;
      pageContextRef.current = nextPageContext;
      setPageContext(nextPageContext);
      const nextAnchor = (detail?.anchor ?? lastLeoAnchor) as LeoPanelAnchor | null;
      setAnchor(nextAnchor ?? null);
      // 带锚点打开 = 面板跟回按钮上方（判据：底边在锚点输入框之上）；拖拽位让路。
      if (nextAnchor) setDragged(null);
      // toggle 模式（输入框中点击 leo 图标）：已打开则关闭
      if (detail?.toggle && openRef.current) {
        setOpen(false);
        return;
      }
      let next: LeoBoardContext | null = null;
      if (detail?.text && detail.text.trim()) {
        next = {
          text: detail.text.trim(),
          source: detail.source === "input" ? "input" : "selection",
        };
      } else {
        const v = getHostText(resolve());
        if (v) next = { text: v, source: "input" };
      }
      const nextText = next?.text || "";
      if (nextText && nextText !== ctxTextRef.current) {
        ctxTextRef.current = nextText;
        setContext(next);
        setCtxEpoch((n) => n + 1);
      } else if (!ctxTextRef.current && next) {
        ctxTextRef.current = nextText;
        setContext(next);
      }
      setTurnErr(null);
      setOpen(true);
    };
    window.addEventListener(OPEN_LEO_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LEO_EVENT, onOpen);
  }, [resolve]);

  // 面板打开期间跟踪视口（定位纯函数 panelBox 的入参；resize 时重算夹紧）。
  useEffect(() => {
    if (!open) return;
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  // Esc 关闭（P6）。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // ── 拖动（pointer 事件 + setPointerCapture；放大态固定居中不可拖）────────
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (expanded) return;
      if ((e.target as HTMLElement).closest("[data-leo-no-drag]")) return;
      e.preventDefault();
      const box = panelBox({ anchor, viewport, dragged, expanded });
      dragRef.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [expanded, anchor, viewport, dragged],
  );

  const onDragMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setDragged({ left: e.clientX - d.dx, top: e.clientY - d.dy });
  }, []);

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setDragged((p) => {
      if (p) {
        try {
          localStorage.setItem(POS_KEY, JSON.stringify(p));
        } catch {
          /* noop */
        }
      }
      return p;
    });
  }, []);

  // 无锚点打开（快捷键 / 程序化调用）：沿用上次拖拽位。
  useEffect(() => {
    if (open && !anchor && !dragged) setDragged(readSavedPos());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // LeoBoard 内部改上下文（清除 / 读取输入框）时同步 ctxTextRef，
  // 保证下次 OPEN_LEO_EVENT 的「同文本不重置」判断准确。
  const handleContextChange = useCallback((c: LeoBoardContext | null) => {
    ctxTextRef.current = c?.text || "";
    setContext(c);
  }, []);

  // ── 发送（合同 I4）：动词留在面板（leo board），其余原话走 leo-turn。 ─────
  const sendLeoTurn = useCallback(
    async (raw: string) => {
      if (turnLock.current) return;
      turnLock.current = true;
      setTurnBusy(true);
      setTurnErr(null);
      const text = raw.trim().slice(0, LEO_TURN_TEXT_MAX);
      // 发送前把用户句乐观追加；响应到了用服务端 entries 替换（按 id 合并去重）。
      const tempId = transcript.appendOptimistic(text);
      try {
        const res = await leoTurn({
          site_id: siteId,
          session_id: sessions.selected,
          text,
          board_text: boardApiRef.current?.getText() ?? "",
          context: toWireContext(pageContextRef.current),
        });
        if (!res.ok) {
          transcript.dropOptimistic(tempId, res.error);
          if (res.error === "network") setTurnErr(tt("网络错误，请稍后再试。"));
          else if (res.error !== "anonymous") setTurnErr(tt("记录暂时不可用，稍后再试。"));
          return;
        }
        let entries = res.data.entries;
        if (entries.length === 0 && res.data.reply.trim()) {
          // 服务端没回 entries（旧版网关）：用 reply 就地补两条，面板不空转。
          localEntrySeq += 1;
          entries = [
            { id: `leo-local-${localEntrySeq}-user`, role: "user", text },
            {
              id: `leo-local-${localEntrySeq}-leo`,
              role: "leo",
              text: res.data.reply,
              task: res.data.task,
            },
          ];
        }
        if (entries.length === 0) {
          transcript.dropOptimistic(tempId, "unavailable");
          setTurnErr(tt("记录暂时不可用，稍后再试。"));
          return;
        }
        transcript.applyTurn(tempId, entries);
        if (res.data.session) sessions.upsert(res.data.session);
        if (res.data.session_id && sessions.supported) sessions.select(res.data.session_id);
        if (res.data.task?.task_id) notifyHistoryChanged();
      } catch {
        transcript.dropOptimistic(tempId, "network");
        setTurnErr(tt("网络错误，请稍后再试。"));
      } finally {
        turnLock.current = false;
        setTurnBusy(false);
      }
    },
    [siteId, transcript, sessions, tt],
  );

  const send = useCallback(
    (raw: string) => {
      if (turnLock.current || boardApiRef.current?.isBusy()) return;
      const local = matchLeoPanelLocalAction(raw);
      if (local) {
        const boardText = boardApiRef.current?.getText() ?? "";
        if (!boardText.trim()) {
          setTurnErr(tt("先有一段文字，才能在面板里做。"));
          return;
        }
        boardApiRef.current?.runTransform(local.action, tt(local.label), local.instruction);
        return;
      }
      void sendLeoTurn(raw);
    },
    [sendLeoTurn, tt],
  );

  // leo 总开关关闭：划词气泡不渲染；面板仍可通过输入框图标或显式事件唤起。
  const box = panelBox({ anchor, viewport, dragged, expanded });
  const computerName =
    pageContext?.page === "shell" ? pageContext.computerName?.trim() : "";

  return (
    <div data-ai-assistant-root>
      {enabled && enableSelection && <SelectionBubble />}
      {/* 面板隐藏而非卸载——leo board 在关闭/重开之间留存（宗旨 v12 规则 5）。
          z-50：高于 Shell 页对话框（z-40），低于全局 modal（z-80+）。 */}
      <div
        data-leo-panel
        data-leo-shape="rect"
        data-leo-expanded={expanded ? "1" : "0"}
        className={`fixed z-50 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ${
          open ? "flex" : "hidden"
        }`}
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          boxSizing: "border-box",
        }}
      >
        {/* 可拖动标题栏 */}
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="flex shrink-0 cursor-move touch-none items-center justify-between border-b border-slate-100 px-4 py-3"
        >
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800 dark:text-neutral-100">
            <Sparkle />
            {sessions.supported ? <button data-leo-no-drag ref={sessionAnchor} className="min-w-0 truncate text-left" aria-expanded={sessionMenu} onClick={() => setSessionMenu(!sessionMenu)}>{sessions.sessions.find((s) => s.id === sessions.selected)?.title || tt("新对话")} ▾</button> : panelTitle}
            <DragDots />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {sessions.supported && <button data-leo-no-drag type="button" disabled={sessionDisabled} aria-label={tt("新会话")} title={tt("新会话")} onClick={() => { void sessions.create(); }} className="rounded-md px-1.5 disabled:opacity-50">+</button>}
            <button
              data-leo-no-drag
              type="button"
              aria-pressed={expanded}
              aria-label={expanded ? tt("缩小") : tt("放大")}
              title={expanded ? tt("缩小") : tt("放大")}
              onClick={() => setExpanded((value) => !value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-normal text-slate-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d={expanded ? "M3 9h6V3M21 9h-6V3M3 15h6v6M21 15h-6v6M9 9 3 3m12 6 6-6M9 15l-6 6m12-6 6 6" : "M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"} /></svg>
            </button>
            <button
              data-leo-no-drag
              type="button"
              onClick={() => {
                if (enabled) {
                  setLeoEnabled(false);
                  setOpen(false);
                } else {
                  setLeoEnabled(true);
                }
              }}
              aria-label={enabled ? tt("停用") : tt("启用")}
              title={enabled ? tt("停用 leo（选中文本后不再显示气泡）") : tt("启用 leo")}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-normal text-slate-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
            >
              {enabled ? tt("停用") : tt("启用")}
            </button>
            <button
              data-leo-no-drag
              type="button"
              onClick={() => setOpen(false)}
              aria-label={tt("关闭")}
              className="text-slate-400 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-slate-700"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 放大态：Shell 页打开时显示「这台电脑：<名字>」（context 不带则不显示，不再发请求）。 */}
        {expanded && computerName && (
          <p data-leo-computer-line className="border-b border-slate-100 px-4 py-1.5 text-[11px] text-slate-400">
            {tt("这台电脑")}：{computerName}
          </p>
        )}

        <FloatingMenu open={open && sessionMenu && sessions.supported} anchorRef={sessionAnchor} onClose={() => setSessionMenu(false)} width={280}>
          <div className="flex max-h-[50vh] flex-col"><LeoSessionList state={sessions} disabled={sessionDisabled} compact onSelect={() => setSessionMenu(false)} onExpand={() => { setExpanded(true); setSessionMenu(false); }} /></div>
        </FloatingMenu>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {expanded && sessions.supported && <aside data-leo-sessions className="flex w-60 max-w-[35%] shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-700"><LeoSessionList state={sessions} disabled={sessionDisabled} /></aside>}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div data-leo-board-region className="max-h-[40%] shrink-0 overflow-y-auto">
          <button type="button" className="px-4 py-1 text-xs text-neutral-500" aria-expanded={!boardCollapsed} onClick={() => setBoardCollapsed(!boardCollapsed)}>{boardCollapsed ? tt("展开") : tt("收起")}</button>
          <div hidden={boardCollapsed}>
        {/* 顶部：面板上的文字（leo board）+ 动词（宗旨 v12，逻辑不变）。 */}
        <LeoBoard
          key={ctxEpoch}
          siteId={siteId}
          docType={docType}
          context={context}
          onContextChange={handleContextChange}
          resolveHost={resolve}
          apiRef={boardApiRef}
          onBusyChange={setBoardBusy}
        />

          </div>
        </div>
        {/* 主体：对话记录（紧凑态也显示；存服务器，跨页面跨设备同一份）。 */}
        <LeoTranscript state={transcript} />

        {turnErr && (
          <p data-leo-turn-error className="mx-3 mb-1 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-600">
            {turnErr}
          </p>
        )}

        {/* 底部输入 + 发送（Enter 发送、Shift+Enter 换行、IME 候选态不发）。 */}
        <LeoPanelComposer busy={turnBusy || boardBusy || sessions.loading || sessions.busy} visible={open} onSend={send} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 划词气泡：选中页面文本 → 选区旁浮出小气泡 → 点击把文本送进 leo 面板。
// 关键点（宗旨 v11）：
//   · 「选中即缓存、点击才发送」——不做任何被动请求，无监视感。
//   · 选区可能在点击气泡瞬间被浏览器清掉，所以文本在 selectionchange 时就缓存。
//   · 排除 leo 自己的面板（data-ai-assistant-root）与密码等敏感输入。
//   · 也支持 textarea / text input 内部的选区（selectionStart/End）。
//   · 点击走同一个 openLeoAssistant（source:"selection"，带选区矩形作 anchor）。
// ─────────────────────────────────────────────────────────────────────────────
function SelectionBubble() {
  const [bubble, setBubble] = useState<{ x: number; y: number } | null>(null);
  const textRef = useRef("");
  const rectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    let raf = 0;
    const showExternal = (selection: ReturnType<typeof currentLeoSelection>) => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (!selection || !isLeoEnabled()) { setBubble(null); return; }
      textRef.current = selection.text;
      rectRef.current = selection.anchor;
      const rect = selection.anchor;
      setBubble({ x: Math.max(8, Math.min(rect ? rect.left + rect.width / 2 - 26 : 8, window.innerWidth - 70)), y: Math.max(8, (rect?.top ?? 46) - 38) });
    };
    const unsubscribe = subscribeLeoSelection(showExternal);
    showExternal(currentLeoSelection());
    const update = () => {
      raf = 0;
      if (!isLeoEnabled()) {
        setBubble(null);
        return;
      }
      const active = document.activeElement;
      // ① 输入框内部选区（textarea / text input）。
      if (
        active &&
        (active.tagName === "TEXTAREA" ||
          (active.tagName === "INPUT" &&
            ["", "text", "search"].includes((active as HTMLInputElement).type)))
      ) {
        if (active.closest("[data-ai-assistant-root]")) {
          setBubble(null);
          return;
        }
        const el = active as HTMLTextAreaElement | HTMLInputElement;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const text = (el.value || "").substring(start, end).trim();
        if (text.length >= 2) {
          announceLeoSelection(null);
      textRef.current = text;
          const r = el.getBoundingClientRect();
          rectRef.current = r;
          setBubble({ x: Math.min(r.right - 8, window.innerWidth - 60), y: Math.max(8, r.top - 34) });
        } else {
          setBubble(null);
        }
        return;
      }
      // ② 普通页面选区。
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        if (currentLeoSelection()) return;
        setBubble(null);
        return;
      }
      const anchorNode = sel.anchorNode;
      const anchorEl =
        anchorNode && (anchorNode.nodeType === 1 ? (anchorNode as Element) : anchorNode.parentElement);
      if (anchorEl && anchorEl.closest("[data-ai-assistant-root]")) {
        setBubble(null);
        return;
      }
      // 主输入框（Tiptap 编辑器）内部选区：**要弹气泡**（用户划中编辑器里的真实文字要能送 leo，
      // 操作员截图 9249211b）。但要防「Ctrl+A 全选后再删空」残留的非折叠空选区被误判为「有选中」
      // ——所以下面统一用 `text = sel.toString().trim()` 且要求 ≥2 可见字符；空/纯空白选区
      // （删空后的情况）自然 text=""→ 不弹（截图 16a3efea 根因）。故编辑器内选区**不再**特殊
      // 忽略，交给下面的可见文本长度判定即可。
      const text = sel.toString().trim();
      if (text.length < 2) {
        setBubble(null);
        return;
      }
      announceLeoSelection(null);
      textRef.current = text;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        setBubble(null);
        return;
      }
      rectRef.current = rect;
      setBubble({
        x: Math.min(Math.max(8, rect.left + rect.width / 2 - 26), window.innerWidth - 70),
        y: Math.max(8, rect.top - 38),
      });
    };
    const onSelChange = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onHide = () => { announceLeoSelection(null); setBubble(null); };
    document.addEventListener("selectionchange", onSelChange);
    window.addEventListener("scroll", onHide, true);
    window.addEventListener("resize", onHide);
    return () => {
      unsubscribe();
      document.removeEventListener("selectionchange", onSelChange);
      window.removeEventListener("scroll", onHide, true);
      window.removeEventListener("resize", onHide);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (!bubble) return null;
  return (
    <button
      type="button"
      // pointerdown 阶段就发送：click 之前浏览器可能已把选区清掉。
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = textRef.current;
        const rect = rectRef.current;
        setBubble(null);
        if (text) openLeoAssistant({ text, source: "selection", anchor: rect });
      }}
      className="leo-pop-in fixed z-[60] flex items-center gap-1 rounded-full border border-indigo-200/70 bg-white/95 px-2.5 py-1 text-[12px] font-medium text-indigo-600 shadow-lg backdrop-blur-sm transition duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] hover:bg-indigo-50"
      style={{ left: bubble.x, top: bubble.y }}
    >
      <Sparkle />
      leo
    </button>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <defs>
        <linearGradient id="leo-sparkle-g" x1="0" y1="0" x2="24" y2="24">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <path
        d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z"
        fill="url(#leo-sparkle-g)"
      />
      <path
        d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z"
        fill="url(#leo-sparkle-g)"
        opacity="0.65"
      />
    </svg>
  );
}

// 标题栏「可拖动」视觉提示（六点抓手）。
function DragDots() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-slate-300" fill="currentColor" aria-hidden>
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}

// 向后兼容别名：旧站可能仍 `import { AiAssistant }`。
export const AiAssistant = LeoAssistant;
export type AiAssistantProps = LeoAssistantProps;
