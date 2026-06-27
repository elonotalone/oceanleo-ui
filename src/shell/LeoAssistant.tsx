"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// @oceanleo/ui — leo 助手（原「助手建议」，全家桶单一事实源）
// ----------------------------------------------------------------------------
// leo 助手是一个「内容补充」助手：它驱动 *宿主页面真实的 AI 输入框*。
//
// 产品逻辑（操作员 2026-06-17 定稿）：
//   1. 用户在某个「与 AI 生成有关」的输入框里写需求；
//   2. 用户点输入框旁的「leo 建议」按钮（或浮窗按钮）打开 leo 助手；
//   3. leo 捕捉该输入框现有内容作为 basePrompt，向网关要可点击的补充选项；
//   4. 用户点某个选项 → leo 把它整理进那个 AI 输入框；
//      用户在 leo 助手里输入并「发送」→ leo 也直接整理那个 AI 输入框；
//   5. 每当输入框内容因上面任一操作而更新，leo 给的选项随之刷新。
//
// 即：leo 助手能「读」与「改」用户在 AI 输入框里的内容。
//
// 绑定是零配置自动的：跟踪用户最近聚焦的 textarea / text input
// （优先 [data-ai-assistant-target] 标记的那个），所以它总是增益用户正在用的框。
//
// 「leo 建议」按钮触发方式：派发 `oceanleo:open-leo` 自定义事件即可打开本浮窗，
// 这样组合输入框（LeoComposer）里的按钮与本组件解耦——任何地方都能开 leo。
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

export function LeoAssistant({
  siteId,
  docType = "doc",
  title = "leo 助手",
  hideFloatingButton = true,
}: LeoAssistantProps) {
  const [open, setOpen] = useState(false);

  // 让任意「leo 建议」按钮（或快捷键）通过派发 OPEN_LEO_EVENT 打开本浮窗。
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_LEO_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LEO_EVENT, onOpen);
  }, []);

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
        <div className="fixed bottom-5 right-5 z-50 flex h-[520px] w-[380px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Sparkle />
              {title}
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="关闭"
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
      setErr("请先在页面输入框里写一句需求，或在下面告诉 leo 你想做什么。");
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
      setErr(res.error || "请求失败，请稍后再试。");
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
            输入一句需求，leo 会基于当前输入框内容持续给出可点击补充项。
          </p>
        )}
        {loading && (
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <Spinner />
            leo 正在思考…
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
              跳过
            </button>
          </div>
        )}
        {options.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-400">点击采纳，自动追加到当前输入框并继续补充</p>
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
            placeholder="告诉 leo 你还想补充什么"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none transition focus:border-slate-400"
          />
          <button
            type="submit"
            disabled={loading || (!input.trim() && !hasTarget)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? "…" : "发送"}
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

// 向后兼容别名：旧站可能仍 `import { AiAssistant }`。默认标题已是「leo 助手」。
export const AiAssistant = LeoAssistant;
export type AiAssistantProps = LeoAssistantProps;
