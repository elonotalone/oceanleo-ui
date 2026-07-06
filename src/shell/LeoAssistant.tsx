"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";

// ============================================================================
// @oceanleo/ui — leo 助手浮窗（全家桶单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v12（操作员 2026-07-02，leo board）：docs/architecture/oceanleo-leo-board.md
// 在 v11（oceanleo-leo-copilot-and-dark-theme.md）基础上重做「扩充」：
//
//   ┌─ [可拖动标题栏] leo ───────────────────────────── ✕ ┐
//   │  （无内容时：空态引导 + [读取输入框内容]）             │
//   │  对于这些内容，我可以帮你：                            │
//   │  [扩充] [精简] [总结] [解释] [翻译] [润色]             │
//   │  ┌ leo board ──────────── [↩ 回退] [↪ 前进] [清除] ┐ │
//   │  │ <可直接编辑的工作文本，一有上下文即常驻显示>    │   │
//   │  │ [复制] [导入到输入框]                          │   │
//   │  └───────────────────────────────────────────────┘   │
//   │  （还没提问时：[让 leo 提问]）                         │
//   │  「请问这份内容的目标读者是谁？」  [换一个问题]        │
//   │  [教师] [职场人士] [学生] …（选项可以很多，用词简洁）  │
//   │  （transform 结果卡：复制 / 替换到输入框 / 以此继续）  │
//   │  [补充内容，leo 会合并进 leo board…       ] [发送]   │
//   │  · 不再单列「来自输入框/来自页面划词」只读卡——内容    │
//   │    统一进上面这块常驻可编辑的 leo board（2026-07-06）。│
//   └────────────────────────────────────────────────────┘
//
// leo board 五条规则（操作员 2026-07-02 拍板）：
//   1. 点「扩充」时 board 初始内容 = 用户原文【原样】，零 LLM 改写——leo 绝不
//      靠猜替用户扩写（"我要做一个PPT" 不许被编成 300 字完整需求）。
//   2. board 常驻显示、可直接编辑、可回退/前进（快照历史栈）。
//   3. 每次只问【一个方向】的问题（完全从当前 board 内容推导，允许重复），
//      选项用词简洁、可以很多；提问前 CTA=「让 leo 提问」，提问后旁边=「换一个问题」。
//   4. 点选项 → 回答连同问题发给后端【保守合并】进 board（只写用户给的事实）；
//      用户在底部输入框发自由文本 → 同样合并进 board。
//   5. 面板关闭再打开，board 留存（面板隐藏而非卸载）。
//
// v11 三条非协商原则继续有效：
//   1. 打开浮窗【不自动】发任何请求——用户点了动词才动。
//   2. 结果【永不自动写回】宿主输入框——只手动「替换到输入框」。
//   3. 内容来源显式化——上下文卡永远告诉用户「leo 现在看到的是哪段文字」。
//
// 内容来源两个：
//   a. 输入框：点输入框旁的「leo」按钮（LeoComposer 派发 OPEN_LEO_EVENT）。
//   b. 页面划词：选中页面任意文本 → 选区旁浮出 leo 小气泡 → 点气泡送入面板
//      （SelectionBubble，选中即缓存、点击才发送，不做被动监视）。
//
// 「扩充」走 /v1/assistant/board（合并 + 出题）；精简/总结/解释/翻译/润色/
// 自由指令走 /v1/assistant/transform。公开 + 操作员买单，posture 同 /v1/recommend。
//
// leo 总开关（宗旨 v12）：/general 页可开关 leo（默认开启），localStorage
// `oceanleo:leo-enabled`，关闭时输入框按钮 / 划词气泡 / 面板全部不出现。
// ============================================================================

const GATEWAY_BASE =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY)) ||
  "https://api.oceanleo.com";

/** 触发打开 leo 助手浮窗的全局事件名。LeoComposer 的「leo」按钮派发它。 */
export const OPEN_LEO_EVENT = "oceanleo:open-leo";

// ─────────────────────────────────────────────────────────────────────────────
// leo 总开关（宗旨 v12）：/general 页可开关，默认开启。localStorage 持久化，
// 同页内用自定义事件同步（storage 事件只跨标签页触发）。
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

/** 响应式读取 leo 开关（LeoAssistant / LeoComposer / GeneralPage 共用）。 */
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

export interface OpenLeoDetail {
  /** 直接把一段文本送进 leo（页面划词等）。不传则读取宿主输入框内容。 */
  text?: string;
  source?: "input" | "selection";
}

/** 任意位置调用即可打开 leo 助手浮窗（按钮、快捷键、划词气泡等）。 */
export function openLeoAssistant(detail?: OpenLeoDetail): void {
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

type HostInput = HTMLTextAreaElement | HTMLInputElement;

// 主输入框现在是 Tiptap 编辑器（contentEditable div，带 data-oc-slot-editor + 读写桥），
// 不再是 textarea/input。leo 要能同时处理「编辑器 div」和旧式「textarea/input」。
interface OcEditorBridge {
  __ocGetText?: () => string;
  __ocSetText?: (v: string) => void;
}
type HostTarget = HostInput | HTMLElement;

/** 是否是我们的 Tiptap 主编辑器（带桥）。 */
function isSlotEditor(el: Element | null): el is HTMLElement & OcEditorBridge {
  return !!el && el instanceof HTMLElement && el.hasAttribute("data-oc-slot-editor");
}

/** 读宿主输入内容：编辑器走桥的 __ocGetText，textarea/input 走 .value。 */
function getHostText(el: HostTarget | null): string {
  if (!el) return "";
  if (isSlotEditor(el)) return (el.__ocGetText?.() || "").trim();
  return ((el as HostInput).value || "").trim();
}

interface BoardResult {
  board: string;
  question: string;
  options: string[];
  insufficient?: boolean;
  fallback?: boolean;
}

/** /v1/assistant/board（宗旨 v12）：保守合并回答 + 基于 board 出下一题。 */
async function boardCall(input: {
  site_id: string;
  doc_type?: string;
  board_text: string;
  question?: string;
  user_answer?: string;
}): Promise<{ ok: boolean; data?: BoardResult; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/v1/assistant/board`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.detail || `HTTP ${res.status}` };
    return { ok: true, data: data as BoardResult };
  } catch {
    return { ok: false, error: "网络错误，请稍后再试。" };
  }
}

async function transform(input: {
  site_id: string;
  action: string;
  text: string;
  instruction?: string;
  target_lang?: string;
}): Promise<{ ok: boolean; result?: string; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/v1/assistant/transform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.detail || `HTTP ${res.status}` };
    return { ok: true, result: String(data?.result || "") };
  } catch {
    return { ok: false, error: "网络错误，请稍后再试。" };
  }
}

function isEditableInput(el: Element | null): el is HostTarget {
  if (!el) return false;
  if (el.closest("[data-ai-assistant-root]")) return false; // ignore our own UI
  if (isSlotEditor(el)) return true; // Tiptap 主编辑器
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    const t = (el as HTMLInputElement).type;
    return t === "" || t === "text" || t === "search";
  }
  return false;
}

// 写回宿主输入。编辑器走桥的 __ocSetText（作为普通文本、进 undo）；textarea/input 用原生
// setter 绕过 React 内部 value 追踪 + 派发 input 事件让受控组件 onChange 收到变化。
function setHostValue(el: HostTarget, value: string) {
  if (isSlotEditor(el)) {
    el.__ocSetText?.(value);
    return;
  }
  const input = el as HostInput;
  const proto =
    input.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

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
    const tagged = document.querySelector<HostInput>(
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
   * 右下角常驻浮窗触发按钮。**默认隐藏**（操作员 2026-07-02 重申：不要常驻悬浮球，
   * 入口只有两个——输入框旁的「leo」按钮 + 页面划词气泡）。
   */
  hideFloatingButton?: boolean;
  /**
   * 页面划词气泡（宗旨 v11）。默认开启：选中页面文本 → 选区旁浮出 leo 气泡 →
   * 点击把选中文本送进 leo 面板。传 false 关闭（如与站内自有划词功能冲突时）。
   */
  enableSelection?: boolean;
}

// 浮窗尺寸（拖动边界计算用）。
const PANEL_W = 384;
const PANEL_H = 560;
const POS_KEY = "oceanleo:leo-assistant-pos";

interface Pos {
  left: number;
  top: number;
}

/** 默认位置：右下角。 */
function defaultPos(): Pos {
  if (typeof window === "undefined") return { left: 0, top: 0 };
  const margin = 20;
  return {
    left: Math.max(margin, window.innerWidth - PANEL_W - margin),
    top: Math.max(margin, window.innerHeight - PANEL_H - margin),
  };
}

function clampPos(p: Pos): Pos {
  if (typeof window === "undefined") return p;
  const maxLeft = Math.max(0, window.innerWidth - PANEL_W);
  const maxTop = Math.max(0, window.innerHeight - PANEL_H);
  return {
    left: Math.min(Math.max(0, p.left), maxLeft),
    top: Math.min(Math.max(0, p.top), maxTop),
  };
}

interface LeoContext {
  text: string;
  source: "input" | "selection";
}

export function LeoAssistant({
  siteId,
  docType = "doc",
  title,
  hideFloatingButton = true,
  enableSelection = true,
}: LeoAssistantProps) {
  const tt = useUI();
  const panelTitle = title ?? "leo";
  const enabled = useLeoEnabled();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<LeoContext | null>(null);
  const { resolve } = useHostInput();
  // 面板带【内容变化的】新上下文打开时 +1，让 Panel 重置瞬态（board / 问答流）。
  // 同一段文本重复打开不 bump——leo board 要留存（宗旨 v12 规则 5）。
  const [ctxEpoch, setCtxEpoch] = useState(0);
  const ctxTextRef = useRef<string>("");

  // 打开事件：detail.text（划词）优先；否则读宿主输入框。
  useEffect(() => {
    const onOpen = (e: Event) => {
      if (!isLeoEnabled()) return;
      const detail = (e as CustomEvent<OpenLeoDetail>).detail;
      let next: LeoContext | null = null;
      if (detail?.text && detail.text.trim()) {
        next = { text: detail.text.trim(), source: detail.source || "selection" };
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
      setOpen(true);
    };
    window.addEventListener(OPEN_LEO_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LEO_EVENT, onOpen);
  }, [resolve]);

  // ── 拖动 ────────────────────────────────────────────────────────────────
  const [pos, setPos] = useState<Pos | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    let initial = defaultPos();
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Pos;
        if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) initial = saved;
      }
    } catch {
      /* noop */
    }
    setPos(clampPos(initial));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setPos((p) => (p ? clampPos(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (!pos) return;
      if ((e.target as HTMLElement).closest("[data-leo-no-drag]")) return;
      e.preventDefault();
      dragRef.current = { dx: e.clientX - pos.left, dy: e.clientY - pos.top };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [pos],
  );

  const onDragMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPos(clampPos({ left: e.clientX - d.dx, top: e.clientY - d.dy }));
  }, []);

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setPos((p) => {
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

  // Panel 内部改上下文（清除 / 读取输入框 / 以此继续）时同步 ctxTextRef，
  // 保证下次 OPEN_LEO_EVENT 的「同文本不重置」判断准确。
  const handleContextChange = useCallback((c: LeoContext | null) => {
    ctxTextRef.current = c?.text || "";
    setContext(c);
  }, []);

  // leo 总开关关闭：入口（按钮/气泡）与面板全部不渲染。
  if (!enabled) return null;

  return (
    <div data-ai-assistant-root>
      {enableSelection && <SelectionBubble />}
      {!open && !hideFloatingButton && (
        <button
          onClick={() => openLeoAssistant()}
          aria-label={panelTitle}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition hover:bg-slate-800"
        >
          <Sparkle />
          {panelTitle}
        </button>
      )}
      {/* 面板隐藏而非卸载——leo board 在关闭/重开之间留存（宗旨 v12 规则 5）。 */}
      <div
        className={`fixed z-50 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${
          open ? "flex" : "hidden"
        }`}
        style={{
          left: pos ? pos.left : undefined,
          top: pos ? pos.top : undefined,
          width: PANEL_W,
          height: PANEL_H,
          maxWidth: "92vw",
          maxHeight: "90vh",
          right: pos ? undefined : 20,
          bottom: pos ? undefined : 20,
        }}
      >
        {/* 可拖动标题栏 */}
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="flex cursor-move touch-none items-center justify-between border-b border-slate-100 px-4 py-3"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Sparkle />
            {panelTitle}
            <DragDots />
          </div>
          <button
            data-leo-no-drag
            onClick={() => setOpen(false)}
            aria-label={tt("关闭")}
            className="text-slate-400 transition hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <Panel
          key={ctxEpoch}
          siteId={siteId}
          docType={docType}
          context={context}
          onContextChange={handleContextChange}
          resolveHost={resolve}
        />
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
// ─────────────────────────────────────────────────────────────────────────────
function SelectionBubble() {
  const [bubble, setBubble] = useState<{ x: number; y: number } | null>(null);
  const textRef = useRef("");

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
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
        const el = active as HostInput;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const text = (el.value || "").substring(start, end).trim();
        if (text.length >= 2) {
          textRef.current = text;
          const r = el.getBoundingClientRect();
          setBubble({ x: Math.min(r.right - 8, window.innerWidth - 60), y: Math.max(8, r.top - 34) });
        } else {
          setBubble(null);
        }
        return;
      }
      // ② 普通页面选区。
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setBubble(null);
        return;
      }
      const anchor = sel.anchorNode;
      const anchorEl =
        anchor && (anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement);
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
      textRef.current = text;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        setBubble(null);
        return;
      }
      setBubble({
        x: Math.min(Math.max(8, rect.left + rect.width / 2 - 26), window.innerWidth - 70),
        y: Math.max(8, rect.top - 38),
      });
    };
    const onSelChange = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onHide = () => setBubble(null);
    document.addEventListener("selectionchange", onSelChange);
    window.addEventListener("scroll", onHide, true);
    window.addEventListener("resize", onHide);
    return () => {
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
        setBubble(null);
        if (text) openLeoAssistant({ text, source: "selection" });
      }}
      className="leo-pop-in fixed z-[60] flex items-center gap-1 rounded-full border border-indigo-200/70 bg-white/95 px-2.5 py-1 text-[12px] font-medium text-indigo-600 shadow-lg backdrop-blur-sm transition hover:bg-indigo-50"
      style={{ left: bubble.x, top: bubble.y }}
    >
      <Sparkle />
      leo
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 面板主体：上下文卡 + 动词按键 + leo board（问答打磨）/ 结果区 + 输入框。
// ─────────────────────────────────────────────────────────────────────────────

type VerbId = "expand" | "condense" | "summarize" | "explain" | "translate" | "polish";

const VERBS: { id: VerbId; label: string }[] = [
  { id: "expand", label: "扩充" },
  { id: "condense", label: "精简" },
  { id: "summarize", label: "总结" },
  { id: "explain", label: "解释" },
  { id: "translate", label: "翻译" },
  { id: "polish", label: "润色" },
];

interface LeoResult {
  id: number;
  label: string;
  text: string;
}

// board 历史栈上限（回退/前进）。
const BOARD_HISTORY_MAX = 60;

function Panel({
  siteId,
  docType,
  context,
  onContextChange,
  resolveHost,
}: {
  siteId: string;
  docType: string;
  context: LeoContext | null;
  onContextChange: (c: LeoContext | null) => void;
  resolveHost: () => HostTarget | null;
}) {
  const tt = useUI();
  const [busy, setBusy] = useState<string | null>(null); // 正在跑的 transform 动词 label
  const [err, setErr] = useState<string | null>(null);
  const [leoSays, setLeoSays] = useState<string | null>(null); // leo 的追问/提示
  const [results, setResults] = useState<LeoResult[]>([]);
  const [input, setInput] = useState("");
  const idRef = useRef(0);

  // ── leo board 状态（宗旨 v12） ──────────────────────────────────────────
  const [board, setBoard] = useState<string | null>(null); // null = board 未激活
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  // boardBusy："question"=出题中，"merge"=合并回答中。
  const [boardBusy, setBoardBusy] = useState<"question" | "merge" | null>(null);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // leo board 常驻可编辑（操作员 2026-07-06）：一有上下文就把 board 初始化为**原文原样**
  // （零 LLM 改写，符合 v12 规则1），用户可直接编辑/一键导入输入框——**不**自动出题/请求
  // （出题=LLM 调用，仍只在点「扩充」时发，守住 v11 规则1「打开不自动请求」）。Panel 按
  // ctxEpoch 重挂，故这里每次新上下文只跑一次。
  useEffect(() => {
    const text = context?.text || "";
    if (text && board == null) {
      setBoard(text);
      setHistory([text]);
      setHistIdx(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.text]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollTop = () => {
    requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const pushResult = (label: string, text: string) => {
    idRef.current += 1;
    setResults((rs) => [{ id: idRef.current, label, text }, ...rs].slice(0, 8));
    scrollTop();
  };

  /** 把新 board 内容提交进历史栈（截断前进分支，封顶 BOARD_HISTORY_MAX）。 */
  const commitBoard = useCallback(
    (next: string) => {
      setBoard(next);
      setHistory((h) => {
        const cut = h.slice(0, histIdx + 1);
        if (cut[cut.length - 1] === next) return cut;
        const merged = [...cut, next].slice(-BOARD_HISTORY_MAX);
        setHistIdx(merged.length - 1);
        return merged;
      });
    },
    [histIdx],
  );

  /** 出题：基于当前 board 内容取下一个问题（board 不动）。 */
  const fetchQuestion = useCallback(
    async (text: string) => {
      setBoardBusy("question");
      setErr(null);
      const res = await boardCall({ site_id: siteId, doc_type: docType, board_text: text });
      setBoardBusy(null);
      if (!res.ok || !res.data) {
        setErr(res.error || tt("请求失败，请稍后再试。"));
        return;
      }
      if (res.data.insufficient) {
        setLeoSays(res.data.question || tt("我还看不出你想做什么——用一句话告诉我你的目标？"));
        setQuestion("");
        setOptions([]);
        return;
      }
      setQuestion(res.data.question || "");
      setOptions(res.data.options || []);
    },
    [siteId, docType, tt],
  );

  /** 「扩充」：在当前 board 内容（用户可能已手改）上取第一题。board 现在一有上下文就已
   * 常驻（见上方 seed effect），故这里**不**重置 board/历史，只发出题请求。 */
  const startBoard = useCallback(() => {
    const text = board ?? context?.text ?? "";
    if (!text) return;
    setLeoSays(null);
    if (board == null) {
      setBoard(text);
      setHistory([text]);
      setHistIdx(0);
    }
    setQuestion("");
    setOptions([]);
    void fetchQuestion(text);
  }, [board, context, fetchQuestion]);

  /** 合并回答：点选项 / 输入框自由文本 → 后端保守合并进 board + 出下一题。 */
  const applyAnswer = useCallback(
    async (answer: string) => {
      const cur = board ?? "";
      if (!answer.trim() || boardBusy) return;
      setBoardBusy("merge");
      setErr(null);
      setLeoSays(null);
      const res = await boardCall({
        site_id: siteId,
        doc_type: docType,
        board_text: cur,
        question,
        user_answer: answer.trim(),
      });
      setBoardBusy(null);
      if (!res.ok || !res.data) {
        setErr(res.error || tt("请求失败，请稍后再试。"));
        return;
      }
      commitBoard(res.data.board || cur);
      setQuestion(res.data.question || "");
      setOptions(res.data.options || []);
    },
    [board, boardBusy, siteId, docType, question, commitBoard, tt],
  );

  /** 用户直接在 board 里编辑：立即生效，防抖入历史栈。 */
  const onBoardEdit = (next: string) => {
    setBoard(next);
    if (editTimer.current) clearTimeout(editTimer.current);
    editTimer.current = setTimeout(() => {
      setHistory((h) => {
        const cut = h.slice(0, histIdx + 1);
        if (cut[cut.length - 1] === next) return cut;
        const merged = [...cut, next].slice(-BOARD_HISTORY_MAX);
        setHistIdx(merged.length - 1);
        return merged;
      });
    }, 800);
  };
  useEffect(() => () => {
    if (editTimer.current) clearTimeout(editTimer.current);
  }, []);

  const canUndo = histIdx > 0;
  const canRedo = histIdx >= 0 && histIdx < history.length - 1;
  const undo = () => {
    if (!canUndo) return;
    const i = histIdx - 1;
    setHistIdx(i);
    setBoard(history[i]);
  };
  const redo = () => {
    if (!canRedo) return;
    const i = histIdx + 1;
    setHistIdx(i);
    setBoard(history[i]);
  };

  const clearBoard = () => {
    setBoard(null);
    setHistory([]);
    setHistIdx(-1);
    setQuestion("");
    setOptions([]);
  };

  // ── 动词 transform：精简/总结/解释/翻译/润色 + 自由指令在**当前 leo board 内容**上
  //    执行，结果**直接写回 board**（替换原内容、进 undo 历史）。
  //    「扩充」不走这里——它走 leo board 问答流（onVerb 里分流到 startBoard），
  //    因为扩充的产品意图是【一问一答打磨 prompt】，而非直接生成成稿（宗旨 v12）。
  const runTransform = async (action: string, label: string, instruction?: string) => {
    const text = (board ?? context?.text ?? "").trim();
    if (!text) return;
    setBusy(label);
    setErr(null);
    setLeoSays(null);
    const res = await transform({
      site_id: siteId,
      action,
      text,
      instruction,
    });
    setBusy(null);
    if (!res.ok || !res.result) {
      setErr(res.error || tt("请求失败，请稍后再试。"));
      return;
    }
    commitBoard(res.result); // 替换 board 内容（可回退）
  };

  const onVerb = (v: { id: VerbId; label: string }) => {
    if (busy || boardBusy || !(board ?? context?.text)) return;
    // 「扩充」= leo board 问答流（宗旨 v12）：leo 只【提问打磨这段 prompt】，绝不
    //   直接凭空给成稿/答案（操作员 2026-07-06 截图：点扩充直接蹦出一整篇回答=错）。
    // 精简/总结/解释/翻译/润色 = transform：就地改写 board 内容。
    if (v.id === "expand") {
      startBoard();
      return;
    }
    void runTransform(v.id, tt(v.label));
  };

  const send = () => {
    const q = input.trim();
    if (!q || busy || boardBusy) return;
    setInput("");
    // board 激活时：输入框内容合并进 board（宗旨 v12 规则 4，保守合并 + 出下一题）；
    // 未激活时：自由指令 transform，结果写回 board。
    if (board != null) {
      void applyAnswer(q);
    } else {
      if (!context?.text) return;
      void runTransform("custom", q.length > 12 ? `${q.slice(0, 12)}…` : q, q);
    }
  };

  const readHostInput = () => {
    const v = getHostText(resolveHost());
    if (v) onContextChange({ text: v, source: "input" });
  };

  const hasContext = Boolean(context?.text);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={bodyRef} className="v-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {/* 无上下文时的空态引导；有上下文时**不再**单列只读「来自输入框/来自页面划词」卡——
            内容统一进下方常驻可编辑的「leo board」（操作员 2026-07-06）。 */}
        {!hasContext && (
          <div className="space-y-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center">
            <p className="text-xs leading-relaxed text-slate-500">
              {tt("先选中页面上的文字，或在输入框写点内容，再来找 leo。")}
            </p>
            <button
              onClick={readHostInput}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 transition hover:border-slate-400"
            >
              {tt("读取输入框内容")}
            </button>
          </div>
        )}

        {err && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-600">{tt(err)}</p>
        )}
        {leoSays && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-800">
            {leoSays}
          </div>
        )}
        {busy && (
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <Spinner />
            {tt("leo 正在{action}…", { action: busy })}
          </p>
        )}

        {/* leo board：常驻可编辑工作文本 + 回退/前进 + 单方向问答（宗旨 v12） */}
        {board != null && (
          <div className="space-y-2">
            <div className="v-fade-up rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-medium text-indigo-500">
                  <Sparkle />
                  leo board
                </span>
                <span className="flex items-center gap-0.5">
                  <button
                    onClick={undo}
                    disabled={!canUndo || Boolean(boardBusy)}
                    aria-label={tt("回退")}
                    title={tt("回退")}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <UndoGlyph />
                  </button>
                  <button
                    onClick={redo}
                    disabled={!canRedo || Boolean(boardBusy)}
                    aria-label={tt("前进")}
                    title={tt("前进")}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <RedoGlyph />
                  </button>
                  <button
                    onClick={() => {
                      onContextChange(null);
                      clearBoard();
                      setLeoSays(null);
                      setErr(null);
                    }}
                    disabled={Boolean(boardBusy)}
                    className="ml-0.5 rounded-md px-1.5 text-[11px] text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {tt("清除")}
                  </button>
                </span>
              </div>
              <BoardEditor value={board} onChange={onBoardEdit} disabled={boardBusy === "merge"} />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <CopyButton text={board} />
                {/* 一键把 leo board 内容导入主输入框（任意来源，操作员 2026-07-06）。 */}
                <ImportToInputButton
                  onImport={() => {
                    const target = resolveHost();
                    if (target) setHostValue(target, board);
                  }}
                />
              </div>
            </div>

            {/* 动词按键（在 leo board 下方，操作员 2026-07-06）：点击即在当前 board 内容上
                执行，结果直接替换回 board。 */}
            <div>
              <p className="mb-1.5 text-[11px] text-slate-400">{tt("对于这些内容，我可以帮你：")}</p>
              <div className="flex flex-wrap gap-1.5">
                {VERBS.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => onVerb(v)}
                    disabled={Boolean(busy) || Boolean(boardBusy)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {tt(v.label)}
                  </button>
                ))}
              </div>
            </div>

            {/* 问答区：每次只问一个方向；选项可以很多；随时「换一个问题」。 */}
            {boardBusy ? (
              <p className="flex items-center gap-2 text-xs text-slate-400">
                <Spinner />
                {boardBusy === "merge"
                  ? tt("leo 正在把你的回答合并进 leo board…")
                  : tt("leo 正在想下一个问题…")}
              </p>
            ) : (
              <div className="space-y-1.5">
                {question && (
                  <div className="flex items-start justify-between gap-2">
                    <div className="inline-block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-800">
                      {question}
                    </div>
                    <button
                      onClick={() => void fetchQuestion(board)}
                      className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                    >
                      {tt("换一个问题")}
                    </button>
                  </div>
                )}
                {/* 初始阶段（还没提出任何问题）：CTA 文案是「让 leo 提问」；
                    一旦提出了问题，上方问题卡旁才显示「换一个问题」（操作员 2026-07-06）。 */}
                {!question && (
                  <button
                    onClick={() => void fetchQuestion(board)}
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                  >
                    {tt("让 leo 提问")}
                  </button>
                )}
                {question && options.length > 0 && (
                  <>
                    <p className="text-[11px] text-slate-400">
                      {tt("点一个选项，或在下方输入，leo 会把它合并进 leo board")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {options.map((opt, i) => (
                        <button
                          key={`${opt}-${i}`}
                          onClick={() => void applyAnswer(opt)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 变换结果（最新在上） */}
        {results.map((r) => (
          <ResultCard
            key={r.id}
            label={r.label}
            text={r.text}
            source={context?.source}
            onReplaceHost={
              context?.source === "input"
                ? () => {
                    const target = resolveHost();
                    if (target) setHostValue(target, r.text);
                  }
                : undefined
            }
            onContinue={() => {
              onContextChange({ text: r.text, source: context?.source || "selection" });
              setResults([]);
            }}
          />
        ))}
      </div>

      {/* 底部输入：board 激活时 = 补充内容合并进 board；否则 = 自由指令 transform */}
      <div className="border-t border-slate-100 px-3 py-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              board != null
                ? tt("补充内容，leo 会合并进 leo board")
                : tt("告诉 leo 你想怎么处理这段内容")
            }
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none transition focus:border-slate-400"
          />
          <button
            type="submit"
            disabled={
              Boolean(busy) || Boolean(boardBusy) || !input.trim() || (board == null && !hasContext)
            }
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy || boardBusy ? "…" : tt("发送")}
          </button>
        </form>
      </div>
    </div>
  );
}

/** leo board 的可编辑文本区：自动增高（封顶后内部滚动）。 */
function BoardEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      spellCheck={false}
      className="w-full resize-none rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs leading-relaxed text-slate-800 outline-none transition focus:border-indigo-200 focus:bg-white disabled:opacity-60"
    />
  );
}

/** 「复制」小按钮（board 与结果卡共用样式）。 */
function CopyButton({ text }: { text: string }) {
  const tt = useUI();
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }
      }}
      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-slate-400"
    >
      {copied ? tt("已复制") : tt("复制")}
    </button>
  );
}

/** 「替换到输入框」小按钮（仅上下文来自输入框时出现，手动写回）。 */
function ReplaceHostButton({ onReplace }: { onReplace: () => void }) {
  const tt = useUI();
  const [replaced, setReplaced] = useState(false);
  return (
    <button
      onClick={() => {
        onReplace();
        setReplaced(true);
        setTimeout(() => setReplaced(false), 1600);
      }}
      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-slate-400"
    >
      {replaced ? tt("已替换") : tt("替换到输入框")}
    </button>
  );
}

/** 「导入到输入框」小按钮（任意来源常驻，手动把 leo board 内容写进主输入框）。 */
function ImportToInputButton({ onImport }: { onImport: () => void }) {
  const tt = useUI();
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        onImport();
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-500/20"
    >
      <ImportGlyph />
      {done ? tt("已导入") : tt("导入到输入框")}
    </button>
  );
}

function ImportGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 结果卡：结果只展示在 leo 面板里——复制 / （输入框来源时）替换到输入框 / 继续处理。 */
function ResultCard({
  label,
  text,
  onReplaceHost,
  onContinue,
}: {
  label: string;
  text: string;
  source?: "input" | "selection";
  onReplaceHost?: () => void;
  onContinue?: () => void;
}) {
  const tt = useUI();
  const [copied, setCopied] = useState(false);
  const [replaced, setReplaced] = useState(false);

  return (
    <div className="v-fade-up rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px] font-medium text-indigo-500">
          <Sparkle />
          {label}
        </span>
      </div>
      <p className="max-h-52 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
        {text}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          onClick={async () => {
            if (await copyText(text)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }
          }}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-slate-400"
        >
          {copied ? tt("已复制") : tt("复制")}
        </button>
        {onReplaceHost && (
          <button
            onClick={() => {
              onReplaceHost();
              setReplaced(true);
              setTimeout(() => setReplaced(false), 1600);
            }}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-slate-400"
          >
            {replaced ? tt("已替换") : tt("替换到输入框")}
          </button>
        )}
        {onContinue && (
          <button
            onClick={onContinue}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-slate-400"
          >
            {tt("以此继续")}
          </button>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
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

// leo board 回退 / 前进箭头。
function UndoGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 14L4 9l5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9h9a7 7 0 017 7v1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RedoGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 14l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 9h-9a7 7 0 00-7 7v1" strokeLinecap="round" strokeLinejoin="round" />
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
