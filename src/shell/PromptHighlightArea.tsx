"use client";

// ============================================================================
// @oceanleo/ui — PromptHighlightArea（占位符高亮输入区，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v12（操作员 2026-07-04，对照豆包「帮我写作」）：点 prompt 卡片把预设文案填进
// 输入框后，文案里的占位符 `[职业]` 以站点 accent 色显示（未填=提示色），用户把某个
// 占位符替换成真实内容后那段内容高亮（accent 半透明底），一眼看清「哪里要填、填了哪些」。
//
// 技术选型：成熟的「透明 textarea + 镜像高亮层」模式（highlighted-textarea，
// react-highlight-within-textarea 同源）。真 textarea 承载文本/光标/选区/IME/提交；
// 只是文字透明、caret 可见；底下镜像 div（同字体/行高/padding/换行/尺寸）按段着色。
// textarea 滚动时镜像层同步 scrollTop/scrollLeft，像素级对齐。
//
// 分段算法（已用最小脚本验证，见 docs/architecture/
// oceanleo-prompt-cards-only-and-placeholder-highlight.md §2）：
//   以 template 的「字面段」为锚点在当前文本里顺序定位，两个锚点之间 = 字段当前值；
//   值===原 token → placeholder(accent 文字)；值非空且!=token → filled(accent 底)；
//   锚点找不到（大改模板）→ 优雅降级：只给残留 [token] 上色。绝不吞字/报错。
//
// 本组件是纯展示 + 受控 value 的输入区，被 LeoComposer 在 highlightTemplate 非空时
// 替换掉原生 textarea 使用。不传 highlightTemplate 时 LeoComposer 用回原生 textarea，
// 全家桶其它输入框零回归。
// ============================================================================

import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

// 方括号占位符：`[任意非]非换行字符]`。与算法脚本一致。
const TOKEN_RE = /\[[^\]\n]+\]/g;

type Seg =
  | { kind: "lit"; text: string }
  | { kind: "placeholder"; text: string }
  | { kind: "filled"; text: string };

/** 把 template 拆成交替的 literal / field(token)，首尾都是 literal（可为空串）。 */
function templateParts(template: string): { literals: string[]; tokens: string[] } {
  const literals: string[] = [];
  const tokens: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(template))) {
    literals.push(template.slice(last, m.index));
    tokens.push(m[0]);
    last = m.index + m[0].length;
  }
  literals.push(template.slice(last));
  return { literals, tokens };
}

/** 只给残留 [token] 上色的降级分段（无模板 / 模板锚点定位失败时用）。 */
function tokenOnlySegments(text: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) {
    if (m.index > last) out.push({ kind: "lit", text: text.slice(last, m.index) });
    out.push({ kind: "placeholder", text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "lit", text: text.slice(last) });
  return out;
}

/** 用模板锚点定位当前文本里的字段值，产出着色分段（失败则降级）。 */
export function highlightSegments(text: string, template: string | null | undefined): Seg[] {
  // 注意：TOKEN_RE 带 g 标志，.test() 会推进 lastIndex —— 先重置再用，避免状态串扰。
  TOKEN_RE.lastIndex = 0;
  if (!template || !TOKEN_RE.test(template)) return tokenOnlySegments(text);
  const { literals, tokens } = templateParts(template);
  const out: Seg[] = [];
  let cursor = 0;
  for (let i = 0; i < literals.length; i++) {
    const lit = literals[i];
    let at: number;
    if (lit === "") {
      at = cursor;
    } else {
      at = text.indexOf(lit, cursor);
      if (at < 0) return tokenOnlySegments(text); // 锚点丢失 → 降级
    }
    if (i > 0) {
      const value = text.slice(cursor, at);
      const token = tokens[i - 1];
      if (value === token) out.push({ kind: "placeholder", text: value });
      else if (value.trim() === "") out.push({ kind: "lit", text: value });
      else out.push({ kind: "filled", text: value });
    }
    if (lit) out.push({ kind: "lit", text: lit });
    cursor = at + lit.length;
  }
  if (cursor < text.length) out.push({ kind: "lit", text: text.slice(cursor) });
  return out;
}

export interface PromptHighlightAreaHandle {
  focus: () => void;
  /** 暴露底层 textarea，供 LeoComposer 挂 data-attr（leo 助手锚点）。 */
  el: () => HTMLTextAreaElement | null;
}

export interface PromptHighlightAreaProps {
  value: string;
  onChange: (value: string) => void;
  template: string | null;
  accentColor?: string;
  placeholder?: string;
  rows?: number;
  maxHeight?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** 透传给 textarea 的 keydown（LeoComposer 的回车提交逻辑）。 */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

// textarea 与镜像 div 必须共享的排版样式（保证像素级对齐）。与 LeoComposer 里原生
// textarea 的 className（px-5 pb-2 pt-5 text-[15px] leading-relaxed）逐项对应。
const SHARED_TYPO: CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.625", // leading-relaxed
  padding: "20px 20px 8px 20px", // pt-5 px-5 pb-2
  fontFamily: "inherit",
  fontWeight: 400,
  letterSpacing: "normal",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "break-word",
};

export const PromptHighlightArea = forwardRef<PromptHighlightAreaHandle, PromptHighlightAreaProps>(
  function PromptHighlightArea(
    {
      value,
      onChange,
      template,
      accentColor = "#4f46e5",
      placeholder,
      rows = 2,
      maxHeight = 280,
      disabled = false,
      autoFocus = false,
      className = "",
      onKeyDown,
    },
    ref,
  ) {
    const taRef = useRef<HTMLTextAreaElement>(null);
    const mirrorRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => taRef.current?.focus(),
      el: () => taRef.current,
    }));

    const autogrow = useCallback(() => {
      const el = taRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
      // 镜像层高度跟随（它是绝对定位铺满，容器高度由 textarea 撑开）。
      if (mirrorRef.current) mirrorRef.current.scrollTop = el.scrollTop;
    }, [maxHeight]);

    useLayoutEffect(() => {
      autogrow();
    }, [value, autogrow]);

    useEffect(() => {
      if (autoFocus) taRef.current?.focus();
    }, [autoFocus]);

    const syncScroll = useCallback(() => {
      const el = taRef.current;
      const mi = mirrorRef.current;
      if (el && mi) {
        mi.scrollTop = el.scrollTop;
        mi.scrollLeft = el.scrollLeft;
      }
    }, []);

    const segs = highlightSegments(value, template);

    return (
      <div className={`relative ${className}`}>
        {/* 镜像高亮层：与 textarea 完全重叠，仅做上色展示，不接收指针事件。 */}
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden text-neutral-800"
          style={{ ...SHARED_TYPO, maxHeight }}
        >
          {segs.map((s, i) => {
            if (s.kind === "placeholder") {
              return (
                <span key={i} style={{ color: accentColor, fontWeight: 500 }}>
                  {s.text}
                </span>
              );
            }
            if (s.kind === "filled") {
              return (
                <span
                  key={i}
                  style={{
                    color: accentColor,
                    background: hexToRgba(accentColor, 0.13),
                    borderRadius: "4px",
                    padding: "0 2px",
                    fontWeight: 500,
                  }}
                >
                  {s.text}
                </span>
              );
            }
            return <span key={i}>{s.text}</span>;
          })}
          {/* 末尾补一个零宽字符，保证最后一行也有高度、镜像与 textarea 尾行对齐。 */}
          {"\u200b"}
        </div>

        <textarea
          ref={taRef}
          value={value}
          disabled={disabled}
          rows={rows}
          placeholder={placeholder}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          onInput={autogrow}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          spellCheck={false}
          className="relative w-full resize-none border-0 bg-transparent text-transparent caret-neutral-800 outline-none placeholder:text-neutral-400"
          style={{ ...SHARED_TYPO, maxHeight }}
        />
      </div>
    );
  },
);

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return `rgba(79,70,229,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
