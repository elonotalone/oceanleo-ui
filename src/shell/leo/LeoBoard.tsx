"use client";

// ============================================================================
// @oceanleo/ui — leo board：面板顶部的「面板上的文字」+ 动词 + 结果区（合同 §2.1）
// ----------------------------------------------------------------------------
// 从旧 LeoAssistant.tsx 的 Panel 搬出，逻辑不变（宗旨 v12，操作员 2026-07-02 /
// 2026-07-06 拍板）：
//   0. 一有上下文，board 初始内容 = 用户原文【原样】，零 LLM 改写常驻显示。
//   1. 动词（扩充/精简/总结/解释/翻译/润色）= 一下就地在当前 board 内容上执行，
//      结果直接替换回 board（可回退/前进，快照历史栈封顶 60）。
//   2. 可选问答区：「让 leo 提问」出方向问题 + 选项；点选项/自由文本 → 后端保守
//      合并进 board。「扩充」不走问答（2026-07-06 纠正）。
//   3. 打开浮窗不自动发任何请求；结果永不自动写回宿主输入框（只手动「导入到输入框」）。
//
// 输入框里打出来的动词（「翻译一下这段」等）由壳（LeoAssistant）经
// matchLeoPanelLocalAction 判定后调 apiRef.runTransform，在这里就地执行；
// 其余的话壳走 /v1/assistant/leo-turn（合同 I4），不进本文件。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { currentDomainProfile } from "../../contracts/domain-family";
import { useUI } from "../../i18n/ui/useUI";
import {
  copyText,
  getHostText,
  setHostValue,
  type HostTarget,
} from "./host-input";

// env 仍然优先；没给时按**当前家族**取网关（contracts/domain-family.ts）。
// `.com` 与本地开发解析出来的仍是 https://api.oceanleo.com（逐字不变），
// `.cn` 站解析成 https://api.oceanleo.cn —— 境内页面不会把请求发到境外网关。
const GATEWAY_BASE =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY)) ||
  currentDomainProfile().gatewayOrigin;

/** 面板工作文本（leo board）的来源上下文——与 I5 的 LeoContext（页面上下文）是两回事。 */
export interface LeoBoardContext {
  text: string;
  source: "input" | "selection";
}

/** 壳通过 ref 拿到的 board 能力：读当前文本、就地执行动词、查 busy。 */
export interface LeoBoardApi {
  getText(): string;
  runTransform(action: string, label: string, instruction?: string): void;
  isBusy(): boolean;
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
      credentials: "include",
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
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.detail || `HTTP ${res.status}` };
    return { ok: true, result: String(data?.result || "") };
  } catch {
    return { ok: false, error: "网络错误，请稍后再试。" };
  }
}

type VerbId = "expand" | "condense" | "summarize" | "explain" | "translate" | "polish";

const VERBS: { id: VerbId; label: string }[] = [
  { id: "expand", label: "扩充" },
  { id: "condense", label: "精简" },
  { id: "summarize", label: "总结" },
  { id: "explain", label: "解释" },
  { id: "translate", label: "翻译" },
  { id: "polish", label: "润色" },
];

/**
 * 改写动词（翻译、精简、总结、解释、改写、扩充、润色）且板上有文字：走 transform。
 * 其余的话壳去 POST /v1/assistant/leo-turn。leo 只回答；要交出一份还能回来看的
 * 工作时，响应里带任务链接。卡片不执行，也不渲染任务过程。
 */
const PANEL_LOCAL_ACTIONS: { verb: string; action: string; label: string }[] = [
  { verb: "翻译", action: "translate", label: "翻译" },
  { verb: "精简", action: "condense", label: "精简" },
  { verb: "总结", action: "summarize", label: "总结" },
  { verb: "解释", action: "explain", label: "解释" },
  { verb: "改写", action: "custom", label: "改写" },
  { verb: "扩充", action: "expand", label: "扩充" },
  { verb: "润色", action: "polish", label: "润色" },
];

const PANEL_LOCAL_PREFIX =
  /^(?:请你|请|帮我|帮忙|麻烦你|麻烦|给我|把这段文字|把这段内容|把上面这段|把上面的文字|把上面的内容|把上面的|把上面|把这段|将这段文字|将这段内容|将这段)\s*/;

const PANEL_LOCAL_TAIL_PART =
  /^(?:一下|一遍|这段文字|这段内容|这段|上文|上面的文字|上面的内容|上面|成\s*[一-龥A-Za-z]{0,16}|为\s*[一-龥A-Za-z]{0,16}|得\s*[一-龥A-Za-z]{0,16})/;

function isPanelLocalTail(rest: string): boolean {
  let left = rest.trim();
  if (!left) return true;
  for (let i = 0; i < 4 && left; i += 1) {
    const match = left.match(PANEL_LOCAL_TAIL_PART);
    if (!match) return false;
    left = left.slice(match[0].length).trim();
  }
  return left.length === 0;
}

export function matchLeoPanelLocalAction(raw: string): {
  action: string;
  label: string;
  instruction?: string;
} | null {
  let text = raw.trim().replace(/[。！!？?…\s]+$/g, "").trim();
  if (!text) return null;
  for (let i = 0; i < 4 && PANEL_LOCAL_PREFIX.test(text); i += 1) {
    text = text.replace(PANEL_LOCAL_PREFIX, "").trim();
  }
  if (!text) return null;
  for (const item of PANEL_LOCAL_ACTIONS) {
    if (text !== item.verb && !text.startsWith(item.verb)) continue;
    const rest = text.slice(item.verb.length).trim();
    if (!isPanelLocalTail(rest)) continue;
    return {
      action: item.action,
      label: item.label,
      ...(item.action === "custom" || rest ? { instruction: raw.trim() } : {}),
    };
  }
  return null;
}

export function leoTypedWorkStaysInPanel(raw: string): boolean {
  return matchLeoPanelLocalAction(raw) != null;
}

// board 历史栈上限（回退/前进）。
const BOARD_HISTORY_MAX = 60;

export function LeoBoard({
  siteId,
  docType,
  context,
  onContextChange,
  resolveHost,
  apiRef,
  onBusyChange,
}: {
  siteId: string;
  docType: string;
  context: LeoBoardContext | null;
  onContextChange: (c: LeoBoardContext | null) => void;
  resolveHost: () => HostTarget | null;
  apiRef?: React.MutableRefObject<LeoBoardApi | null>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const tt = useUI();
  const [busy, setBusy] = useState<string | null>(null); // 正在跑的 transform 动词 label
  const [err, setErr] = useState<string | null>(null);
  const [leoSays, setLeoSays] = useState<string | null>(null); // leo 的追问/提示

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
  // （出题=LLM 调用，仍只在点「扩充」时发，守住 v11 规则1「打开不自动请求」）。壳按
  // ctxEpoch 重挂本组件，故这里每次新上下文只跑一次。
  useEffect(() => {
    const text = context?.text || "";
    if (text && board == null) {
      setBoard(text);
      setHistory([text]);
      setHistIdx(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.text]);

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

  // ── 动词 transform（扩充/精简/总结/解释/翻译/润色）+ 自由指令：一律在**当前 leo board
  //    内容**上一键执行，结果**直接写回 board**（替换原内容、进 undo 历史）。
  //    「扩充」= 一下把这段 prompt 扩充成更完整/更好的 prompt（后端 expand 指令保证输出仍是
  //    prompt 而非成稿/答案）——不问问题、不给回答（操作员 2026-07-06 截图纠正）。
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

  // 所有动词（扩充/精简/总结/解释/翻译/润色）= 一键 transform：就地在**当前 leo board
  // 内容**上执行，结果直接替换回 board（可回退）。操作员 2026-07-06：点「扩充」就是**一下
  // 自动把这段 prompt 扩充成更好的 prompt**——不问问题、不给回答/成稿（后端 expand 指令
  // 已改为「扩充 prompt 本身」而非「写成成稿」）。
  const onVerb = (v: { id: VerbId; label: string }) => {
    if (busy || boardBusy || !(board ?? context?.text)) return;
    void runTransform(v.id, tt(v.label));
  };

  // ── 壳的接口：读当前 board 文本（leo-turn 的 board_text）、就地执行输入框打出来的动词。
  const busyNow = Boolean(busy) || Boolean(boardBusy);
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      getText: () => board ?? context?.text ?? "",
      runTransform: (action, label, instruction) => {
        void runTransform(action, label, instruction);
      },
      isBusy: () => busyNow,
    };
  });
  useEffect(() => {
    onBusyChange?.(busyNow);
  }, [busyNow, onBusyChange]);

  const readHostInput = () => {
    const v = getHostText(resolveHost());
    if (v) onContextChange({ text: v, source: "input" });
  };

  const hasContext = Boolean(context?.text);

  return (
    <div
      data-leo-board
      className="v-scroll max-h-[45%] shrink-0 space-y-3 overflow-y-auto border-b border-slate-100 px-4 py-3"
    >
      {/* 无上下文时的空态引导；有上下文时**不再**单列只读「来自输入框/来自页面划词」卡——
          内容统一进下方常驻可编辑的「leo board」（操作员 2026-07-06）。 */}
      {!hasContext && (
        <div className="space-y-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center">
          <p className="text-xs leading-relaxed text-slate-500">
            {tt("先选中页面上的文字，或在输入框写点内容，再来找 leo。")}
          </p>
          <button
            type="button"
            onClick={readHostInput}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-slate-400"
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
                  type="button"
                  onClick={undo}
                  disabled={!canUndo || Boolean(boardBusy)}
                  aria-label={tt("回退")}
                  title={tt("回退")}
                  className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <UndoGlyph />
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo || Boolean(boardBusy)}
                  aria-label={tt("前进")}
                  title={tt("前进")}
                  className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <RedoGlyph />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onContextChange(null);
                    clearBoard();
                    setLeoSays(null);
                    setErr(null);
                  }}
                  disabled={Boolean(boardBusy)}
                  className="ml-0.5 rounded-md px-1.5 text-[11px] text-slate-400 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
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
                  type="button"
                  onClick={() => onVerb(v)}
                  disabled={Boolean(busy) || Boolean(boardBusy)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                    type="button"
                    onClick={() => void fetchQuestion(board)}
                    className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                  >
                    {tt("换一个问题")}
                  </button>
                </div>
              )}
              {/* 初始阶段（还没提出任何问题）：CTA 文案是「让 leo 提问」；
                  一旦提出了问题，上方问题卡旁才显示「换一个问题」（操作员 2026-07-06）。 */}
              {!question && (
                <button
                  type="button"
                  onClick={() => void fetchQuestion(board)}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
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
                        type="button"
                        onClick={() => void applyAnswer(opt)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
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
      className="w-full resize-none rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs leading-relaxed text-slate-800 outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus:border-indigo-200 focus:bg-white disabled:opacity-60"
    />
  );
}

/** 「复制」小按钮。 */
function CopyButton({ text }: { text: string }) {
  const tt = useUI();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }
      }}
      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-slate-400"
    >
      {copied ? tt("已复制") : tt("复制")}
    </button>
  );
}

/** 「导入到输入框」小按钮（任意来源常驻，手动把 leo board 内容写进主输入框）。 */
function ImportToInputButton({ onImport }: { onImport: () => void }) {
  const tt = useUI();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        onImport();
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-indigo-300 hover:bg-indigo-500/20"
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
