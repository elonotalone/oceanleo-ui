"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";

// ============================================================================
// @oceanleo/ui — leo 助手浮窗（全家桶单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v11（操作员 2026-07-02）：docs/architecture/
// oceanleo-leo-copilot-and-dark-theme.md
//   推翻 v9「一键补充自动写回输入框」与 2026-06-17「浮窗打开即自动请求建议」。
//   leo 从「prompt 补全器」升级为「页面内容处理助手」：
//
//   ┌─ [可拖动标题栏] leo ───────────────────────────── ✕ ┐
//   │  [上下文卡] 来自输入框 / 来自页面划词 的一段文本      │
//   │  对于这些内容，我可以帮你：                            │
//   │  [扩充] [精简] [总结] [解释] [翻译] [润色]             │
//   │  （结果区：处理结果 + 复制 / 替换到输入框 / 继续处理）  │
//   │  [告诉 leo 你想怎么处理这段内容……          ] [发送]   │
//   └────────────────────────────────────────────────────┘
//
// 三条非协商原则（当日 bug 的根因修复）：
//   1. 打开浮窗【不自动】发任何请求——用户点了动词才动。
//   2. 结果【永不自动写回】宿主输入框——只展示在 leo 面板里，可一键复制；
//      仅当上下文来自输入框时，额外给一个「替换到输入框」的手动按钮。
//   3. 内容来源显式化——上下文卡永远告诉用户「leo 现在看到的是哪段文字」。
//
// 内容来源两个：
//   a. 输入框：点输入框旁的「leo」按钮（LeoComposer 派发 OPEN_LEO_EVENT）。
//   b. 页面划词：选中页面任意文本 → 选区旁浮出 leo 小气泡 → 点气泡送入面板
//      （SelectionBubble，选中即缓存、点击才发送，不做被动监视）。
//
// 「扩充」走 /v1/assistant/suggest 的可点选项流（选项点击后合并进工作文本并自动
// 刷新）；精简/总结/解释/翻译/润色/自由指令走 /v1/assistant/transform。
// 公开 + 操作员买单（无登录 / 无 API-key 墙），posture 与 /v1/recommend 相同。
// ============================================================================

const GATEWAY_BASE =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY)) ||
  "https://api.oceanleo.com";

/** 触发打开 leo 助手浮窗的全局事件名。LeoComposer 的「leo」按钮派发它。 */
export const OPEN_LEO_EVENT = "oceanleo:open-leo";

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

interface SuggestResult {
  updatedPrompt: string;
  question: string;
  options: string[];
  insufficient?: boolean;
}

async function suggest(input: {
  site_id: string;
  doc_type?: string;
  base_prompt?: string;
  user_input?: string;
  previous_options?: string[];
  skipped_questions?: string[];
}): Promise<{ ok: boolean; data?: SuggestResult; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/v1/assistant/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.detail || `HTTP ${res.status}` };
    return { ok: true, data: data as SuggestResult };
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

function isEditableInput(el: Element | null): el is HostInput {
  if (!el) return false;
  if (el.closest("[data-ai-assistant-root]")) return false; // ignore our own UI
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    const t = (el as HTMLInputElement).type;
    return t === "" || t === "text" || t === "search";
  }
  return false;
}

// React tracks an internal value on controlled inputs; setting `.value`
// directly bypasses it and the onChange never fires. Use the prototype's native
// setter, then dispatch a bubbling input event so React's delegated listener
// picks the change up.
function setHostValue(el: HostInput, value: string) {
  const proto =
    el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
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

/** Track the textarea / text input the user is (or was last) working in. */
function useHostInput() {
  const ref = useRef<HostInput | null>(null);

  const resolve = useCallback((): HostInput | null => {
    // 1. Currently-focused editable input.
    const active = document.activeElement;
    if (isEditableInput(active)) return active;
    // 2. Last one the user focused (if still in the DOM).
    if (ref.current && ref.current.isConnected) return ref.current;
    // 3. Explicitly-tagged primary input.
    const tagged = document.querySelector<HostInput>(
      "textarea[data-ai-assistant-target], input[data-ai-assistant-target]",
    );
    if (tagged) return tagged;
    // 4. First visible textarea on the page.
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
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<LeoContext | null>(null);
  const { resolve } = useHostInput();
  // 面板每次带新上下文打开时 +1，让 Panel 重置瞬态（选项流等）。
  const [ctxEpoch, setCtxEpoch] = useState(0);

  // 打开事件：detail.text（划词）优先；否则读宿主输入框。
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenLeoDetail>).detail;
      let next: LeoContext | null = null;
      if (detail?.text && detail.text.trim()) {
        next = { text: detail.text.trim(), source: detail.source || "selection" };
      } else {
        const v = resolve()?.value?.trim();
        if (v) next = { text: v, source: "input" };
      }
      setContext(next);
      setCtxEpoch((n) => n + 1);
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
      {open && (
        <div
          className="fixed z-50 flex max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          style={{
            left: pos ? pos.left : undefined,
            top: pos ? pos.top : undefined,
            width: PANEL_W,
            height: PANEL_H,
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
            onContextChange={setContext}
            resolveHost={resolve}
          />
        </div>
      )}
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
// 面板主体：上下文卡 + 动词按键 + 扩充选项流 / 结果区 + 自由指令输入。
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
  resolveHost: () => HostInput | null;
}) {
  const tt = useUI();
  const [busy, setBusy] = useState<string | null>(null); // 正在跑的动词 label
  const [err, setErr] = useState<string | null>(null);
  const [leoSays, setLeoSays] = useState<string | null>(null); // leo 的追问/提示
  const [results, setResults] = useState<LeoResult[]>([]);
  const [input, setInput] = useState("");
  const idRef = useRef(0);

  // 扩充选项流状态。
  const [expandText, setExpandText] = useState<string | null>(null); // 工作文本
  const [options, setOptions] = useState<string[]>([]);
  const [prevOptions, setPrevOptions] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollTop = () => {
    requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const pushResult = (label: string, text: string) => {
    idRef.current += 1;
    setResults((rs) => [{ id: idRef.current, label, text }, ...rs].slice(0, 8));
    scrollTop();
  };

  // ── 扩充（suggest 可点选项流） ────────────────────────────────────────────
  const runExpand = async (baseText: string, userInput: string, prev: string[]) => {
    setBusy(tt("扩充"));
    setErr(null);
    setLeoSays(null);
    const res = await suggest({
      site_id: siteId,
      doc_type: docType,
      base_prompt: baseText,
      user_input: userInput,
      previous_options: prev,
      skipped_questions: skipped,
    });
    setBusy(null);
    if (!res.ok || !res.data) {
      setErr(res.error || tt("请求失败，请稍后再试。"));
      return;
    }
    const d = res.data;
    if (d.insufficient) {
      setLeoSays(d.question || tt("我还看不出你想做什么——用一句话告诉我你的目标？"));
      setExpandText(null);
      setOptions([]);
      return;
    }
    setExpandText((d.updatedPrompt || baseText).trim());
    setQuestion(d.question || "");
    setOptions(d.options || []);
    setPrevOptions((p) => [...p, ...(d.options || [])]);
  };

  const applyOption = (opt: string) => {
    if (busy) return;
    const cur = expandText || context?.text || "";
    const next = cur ? `${cur}\n- ${opt}` : `- ${opt}`;
    setExpandText(next);
    setOptions((o) => o.filter((x) => x !== opt));
    // 点击选择后自动继续工作：基于合并后的文本刷新选项。
    void runExpand(next, "", prevOptions);
  };

  // ── 精简/总结/解释/翻译/润色/自由指令（transform） ────────────────────────
  const runTransform = async (action: string, label: string, instruction?: string) => {
    const text = context?.text || "";
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
    pushResult(label, res.result);
  };

  const onVerb = (v: { id: VerbId; label: string }) => {
    if (busy || !context?.text) return;
    if (v.id === "expand") {
      setResults([]);
      void runExpand(context.text, "", []);
      setPrevOptions([]);
      setSkipped([]);
    } else {
      setExpandText(null);
      setOptions([]);
      void runTransform(v.id, tt(v.label));
    }
  };

  const send = () => {
    const q = input.trim();
    if (!q || busy || !context?.text) return;
    setInput("");
    setExpandText(null);
    setOptions([]);
    void runTransform("custom", q.length > 12 ? `${q.slice(0, 12)}…` : q, q);
  };

  const readHostInput = () => {
    const v = resolveHost()?.value?.trim();
    if (v) onContextChange({ text: v, source: "input" });
  };

  const hasContext = Boolean(context?.text);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={bodyRef} className="v-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {/* 上下文卡：leo 当前看到的内容（显式化，可清除）。 */}
        {hasContext ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400">
                {context!.source === "input" ? tt("来自输入框") : tt("来自页面划词")}
              </span>
              <button
                onClick={() => {
                  onContextChange(null);
                  setExpandText(null);
                  setOptions([]);
                  setLeoSays(null);
                  setErr(null);
                }}
                className="text-[11px] text-slate-400 transition hover:text-slate-700"
              >
                {tt("清除")}
              </button>
            </div>
            <p className="max-h-28 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
              {context!.text}
            </p>
          </div>
        ) : (
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

        {/* 动词按键 */}
        {hasContext && (
          <div>
            <p className="mb-1.5 text-[11px] text-slate-400">{tt("对于这些内容，我可以帮你：")}</p>
            <div className="flex flex-wrap gap-1.5">
              {VERBS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onVerb(v)}
                  disabled={Boolean(busy)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tt(v.label)}
                </button>
              ))}
            </div>
          </div>
        )}

        {err && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-600">{err}</p>
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

        {/* 扩充工作区：工作文本 + 可点选项 */}
        {expandText != null && (
          <div className="space-y-2">
            <ResultCard
              label={tt("扩充")}
              text={expandText}
              source={context?.source}
              onReplaceHost={
                context?.source === "input"
                  ? () => {
                      const target = resolveHost();
                      if (target) setHostValue(target, expandText);
                    }
                  : undefined
              }
              onContinue={() => {
                onContextChange({ text: expandText, source: context?.source || "selection" });
                setExpandText(null);
                setOptions([]);
              }}
            />
            {question && !busy && (
              <div className="space-y-1.5">
                <div className="inline-block max-w-[92%] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-800">
                  {question}
                </div>
                <button
                  onClick={() => {
                    setSkipped((s) => [...s, question]);
                    setQuestion("");
                  }}
                  className="ml-1 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 transition hover:bg-slate-50"
                >
                  {tt("跳过")}
                </button>
              </div>
            )}
            {options.length > 0 && !busy && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-400">{tt("点一个方向，leo 会自动扩充进上面的文本")}</p>
                {options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => applyOption(opt)}
                    className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-relaxed text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50/60"
                  >
                    + {opt}
                  </button>
                ))}
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

      {/* 自由指令输入 */}
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
            placeholder={tt("告诉 leo 你想怎么处理这段内容")}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none transition focus:border-slate-400"
          />
          <button
            type="submit"
            disabled={Boolean(busy) || !input.trim() || !hasContext}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? "…" : tt("发送")}
          </button>
        </form>
      </div>
    </div>
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
