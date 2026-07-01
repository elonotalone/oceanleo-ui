"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";

// ============================================================================
// @oceanleo/ui — leo 助手浮窗（全家桶单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v10（操作员 2026-06-28）：docs/architecture/
// oceanleo-pro-site-console-agent-coplane.md
//   推翻 v9（理解 A）的「操作台搬进浮窗当第二页」。专业子站的操作台回到左栏第一公民
//   （操作台 | agent 同栏双形态），**不再进浮窗**。本浮窗回到只有「leo 建议」一页的
//   纯助手形态——主站首页 + 各站输入框仍用它给可点击补充项。
//
//   ┌─ [可拖动标题栏] leo 助手 ───────────────────── ✕ ┐
//   │  ── leo 建议 ──                                     │
//   │   leo 给可点击补充项，点一下追加到当前 AI 输入框      │
//   └───────────────────────────────────────────────────┘
//
// 「leo 建议」：驱动宿主页面真实的 AI 输入框——
//   1. 用户在某个「与 AI 生成有关」的输入框里写需求；
//   2. 点输入框旁的「leo 建议」按钮（派发 OPEN_LEO_EVENT）打开本浮窗；
//   3. leo 捕捉该输入框现有内容作为 basePrompt，向网关要可点击补充项；
//   4. 点某选项 → 追加进输入框；选项随输入框内容刷新。
//
// 浮窗可四处拖动：抓住标题栏拖动，位置写进 localStorage（按浏览器记忆）。
//
// 公开 + 操作员买单（无登录 / 无 API-key 墙）：走 /v1/assistant/suggest。
// ============================================================================

const GATEWAY_BASE =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY)) ||
  "https://api.oceanleo.com";

/** 触发打开 leo 助手浮窗的全局事件名。LeoComposer 的「leo 建议」按钮派发它。 */
export const OPEN_LEO_EVENT = "oceanleo:open-leo";

/** 任意位置调用即可打开 leo 助手浮窗（按钮、快捷键等）。 */
export function openLeoAssistant(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_LEO_EVENT));
  }
}

/**
 * leo 建议「快速版」（宗旨 v9，2026-06-27）：一键自动补充，**不弹浮窗、不需用户选方向**。
 * 直接调 /v1/assistant/suggest（base_prompt = 当前文本），返回补全后的 updatedPrompt。
 * 主站首页 / 各站输入框的「⚡ 一键补充」按钮用它：拿到结果直接写回输入框即可。
 *
 * 入参 basePrompt 为空时，让 leo 基于站点定位起个头（user_input 给一句通用引导）。
 */
export async function runLeoQuickSuggest(opts: {
  siteId: string;
  docType?: string;
  basePrompt: string;
}): Promise<{ ok: boolean; prompt?: string; error?: string }> {
  const base = (opts.basePrompt || "").trim();
  const res = await suggest({
    site_id: opts.siteId,
    doc_type: opts.docType || "doc",
    base_prompt: base,
    user_input: base ? "请帮我把这段需求补充得更完整、可直接执行。" : "请帮我起一个清晰、可直接执行的需求草稿。",
  });
  if (!res.ok || !res.data) return { ok: false, error: res.error || "请求失败，请稍后再试。" };
  const updated = (res.data.updatedPrompt || "").trim();
  return { ok: true, prompt: updated || base };
}

type HostInput = HTMLTextAreaElement | HTMLInputElement;

interface SuggestResult {
  updatedPrompt: string;
  question: string;
  options: string[];
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

/** Track the textarea / text input the user is (or was last) working in. */
function useHostInput() {
  const ref = useRef<HostInput | null>(null);
  const [hasTarget, setHasTarget] = useState(false);

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
      if (isEditableInput(t)) {
        ref.current = t;
        setHasTarget(true);
      }
    };
    document.addEventListener("focusin", onFocus);
    // Seed once on mount (a tagged primary input counts as a target).
    if (resolve()) setHasTarget(true);
    return () => document.removeEventListener("focusin", onFocus);
  }, [resolve]);

  return { resolve, hasTarget };
}

export interface LeoAssistantProps {
  siteId: string;
  docType?: string;
  title?: string;
  /**
   * 右下角常驻浮窗触发按钮。**默认隐藏**（操作员 2026-06-17 定稿）：全 OceanLeo
   * 系列默认不再常驻显示 leo 浮窗，只能由「leo 建议」按钮 / openLeoAssistant()
   * 打开。极个别站若想恢复常驻浮窗，显式传 hideFloatingButton={false}。
   */
  hideFloatingButton?: boolean;
}

// 浮窗尺寸（拖动边界计算用）。
const PANEL_W = 380;
const PANEL_H = 520;
const POS_KEY = "oceanleo:leo-assistant-pos";

interface Pos {
  left: number;
  top: number;
}

/** 默认位置：右下角（与历史一致的 bottom-5 right-5 观感）。 */
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

export function LeoAssistant({
  siteId,
  docType = "doc",
  title,
  hideFloatingButton = true,
}: LeoAssistantProps) {
  const tt = useUI();
  const panelTitle = title ?? tt("leo 助手");
  const [open, setOpen] = useState(false);

  // 让任意「leo 建议」按钮（或快捷键）通过派发 OPEN_LEO_EVENT 打开本浮窗。
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_LEO_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LEO_EVENT, onOpen);
  }, []);

  // ── 拖动 ────────────────────────────────────────────────────────────────
  const [pos, setPos] = useState<Pos | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // 打开浮窗时确定初始位置：优先 localStorage 记忆，否则右下角。
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

  // 视口变化时把浮窗夹回可视范围。
  useEffect(() => {
    if (!open) return;
    const onResize = () => setPos((p) => (p ? clampPos(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (!pos) return;
      // 标题栏上的按钮（关闭/切换页）不触发拖动。
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

  const onDragEnd = useCallback(
    (e: React.PointerEvent) => {
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
    },
    [],
  );

  return (
    <div data-ai-assistant-root>
      {!open && !hideFloatingButton && (
        <button
          onClick={() => setOpen(true)}
          aria-label={title}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition hover:bg-slate-800"
        >
          <Sparkle />
          {title}
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
            // pos 未就绪（SSR / 首帧）时回退右下角，避免闪到左上。
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

          <Panel siteId={siteId} docType={docType} />
        </div>
      )}
    </div>
  );
}

function Panel({ siteId, docType }: { siteId: string; docType: string }) {
  const tt = useUI();
  const { resolve, hasTarget } = useHostInput();
  const [input, setInput] = useState("");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [prevOptions, setPrevOptions] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const askRef = useRef<((u: string) => void) | null>(null);
  const autoAskedRef = useRef(false);

  const ask = async (userInput: string) => {
    const target = resolve();
    const basePrompt = target?.value ?? "";
    if (!userInput.trim() && !basePrompt.trim()) {
      setErr(tt("请先在页面输入框里写一句需求，或在下面告诉 leo 你想做什么。"));
      return;
    }
    setLoading(true);
    setErr(null);
    const res = await suggest({
      site_id: siteId,
      doc_type: docType,
      base_prompt: basePrompt,
      user_input: userInput,
      previous_options: prevOptions,
      skipped_questions: skipped,
    });
    setLoading(false);
    if (!res.ok || !res.data) {
      setErr(res.error || tt("请求失败，请稍后再试。"));
      return;
    }
    const d = res.data;
    // Write the enriched prompt back into the host page's own AI input box.
    if (d.updatedPrompt && target) setHostValue(target, d.updatedPrompt);
    setQuestion(d.question || "");
    setOptions(d.options || []);
    setPrevOptions((p) => [...p, ...(d.options || [])]);
  };

  const send = () => {
    if (loading) return;
    void ask(input);
    setInput("");
  };

  const applyOption = (opt: string) => {
    const target = resolve();
    if (target) {
      const cur = target.value;
      setHostValue(target, cur ? `${cur}\n- ${opt}` : `- ${opt}`);
    }
    setOptions((o) => o.filter((x) => x !== opt));
    // 输入框内容已更新 → 立即基于新内容刷新选项。
    void ask("");
  };

  // 浮窗一打开就基于「当前输入框已有内容」自动给建议——用户在输入框里写了需求、
  // 点「leo 建议」后，无需再手动输入即可立即看到补充项（操作员 2026-06-17 定稿）。
  askRef.current = ask;
  useEffect(() => {
    if (autoAskedRef.current) return;
    autoAskedRef.current = true;
    const basePrompt = resolve()?.value?.trim();
    if (basePrompt) askRef.current?.("");
    // 只在面板挂载（= 浮窗打开）那一刻跑一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Suggestions stream. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {err && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-600">{err}</p>
        )}
        {!question && options.length === 0 && !loading && !err && (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs leading-relaxed text-slate-500">
            {tt("输入一句需求，leo 会基于当前输入框内容持续给出可点击补充项。")}
          </p>
        )}
        {loading && (
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <Spinner />
            {tt("leo 正在思考…")}
          </p>
        )}
        {question && (
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
        {options.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-400">{tt("点击采纳，自动追加到当前输入框并继续补充")}</p>
            {options.map((opt, i) => (
              <button
                key={i}
                onClick={() => applyOption(opt)}
                className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-relaxed text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                + {opt}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ask box. */}
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
            placeholder={tt("告诉 leo 你还想补充什么")}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none transition focus:border-slate-400"
          />
          <button
            type="submit"
            disabled={loading || (!input.trim() && !hasTarget)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? "…" : tt("发送")}
          </button>
        </form>
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
      <path
        d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z"
        fill="currentColor"
      />
      <path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z" fill="currentColor" opacity="0.6" />
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

// 向后兼容别名：旧站可能仍 `import { AiAssistant }`。默认标题已是「leo 助手」。
export const AiAssistant = LeoAssistant;
export type AiAssistantProps = LeoAssistantProps;
