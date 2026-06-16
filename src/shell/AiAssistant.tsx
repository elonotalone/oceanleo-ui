"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Floating OceanLeo "助手建议" — a pure content-supplement helper that drives the
// HOST PAGE's real input box.
//
// Faithful clone of generator.oceanleo.com/generate/ppt's 助手建议: the user
// writes their task/requirement in the site's own input box ("Prompt"); this
// widget reads that box as the base prompt, asks the gateway for clickable
// enrichment options, and writes adopted options straight back into that same
// box. The popup itself contains ONLY the suggestion stream + an ask field —
// there is NO separate "你的内容" textarea (that lives in the host page).
//
// Binding is automatic and zero-touch: we track the textarea / text input the
// user most recently focused (preferring one marked [data-ai-assistant-target]),
// so the widget always augments whatever box the user is actually working in.
//
// Public + operator-funded (no login / API-key wall) via /v1/assistant/suggest.

const GATEWAY_BASE =
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY ||
  "https://api.oceanleo.com";

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

export function AiAssistant({
  siteId,
  docType = "doc",
  title = "助手建议",
}: {
  siteId: string;
  docType?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div data-ai-assistant-root>
      {!open && (
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

  const ask = async (userInput: string) => {
    const target = resolve();
    const basePrompt = target?.value ?? "";
    if (!userInput.trim() && !basePrompt.trim()) {
      setErr("请先在页面输入框里写一句需求，或在下面告诉助手你想做什么。");
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
    // Write the enriched prompt back into the host page's own input box.
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
    void ask("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Suggestions stream. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {err && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-600">{err}</p>
        )}
        {!question && options.length === 0 && !loading && !err && (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs leading-relaxed text-slate-500">
            输入一句需求，助手会基于当前 Prompt 持续给出可点击补充项。
          </p>
        )}
        {loading && (
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <Spinner />
            助手正在思考…
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
            placeholder="告诉助手你还想补充什么"
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
