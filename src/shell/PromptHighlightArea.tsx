"use client";

// ============================================================================
// @oceanleo/ui — PromptHighlightArea（幽灵占位输入区，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v12.1（操作员 2026-07-04 修订，纠正 v12 的实现错误）：
//
//   点 prompt 卡片后，卡片文案作为「幽灵占位」显示在输入框里——`[职业]` 这类占位
//   段以站点 accent（蓝）色显示、其余字面段以浅灰提示色显示。它**纯粹是视觉提示**：
//     · 【选不中】——它在一层 pointer-events:none 的覆盖层里，鼠标拖选/双击都选不到；
//     · 【不属于内容】——它**永远不进 textarea.value**（value 保持为空）；
//     · 【点即输入】——用户点输入框任意位置 / 一开始打字，幽灵立即整体消失，从头
//       输入，不用先删掉 `[职业]`。
//   （= 浏览器原生 placeholder 的行为，只是原生 placeholder 不支持局部上色，所以
//    我们用一个自绘的镜像覆盖层来实现「多段着色的 placeholder」。）
//
// 为什么 v12（镜像高亮层 + 把整段模板塞进 value + 提交时 strip）是错的：
//   那个方案把 `[职业]` 当成**真实字符写进了 textarea.value**，所以它能被选中、
//   不能「点即消失」、还要靠 stripPromptPlaceholders 在提交时补救。根因是「占位在
//   value 里」。本版本回到正确模型：**占位不是 value 的一部分**，value 为空时才显示
//   幽灵覆盖层，用户一输入就让位——彻底不需要 strip、不可选、点即输入。
//
// 技术：真 <textarea> 承载 value/光标/IME/提交（就是普通空 textarea）；上面盖一层
// aria-hidden + pointer-events-none 的镜像 <div>，仅在 value==="" 且有 ghostTemplate
// 时渲染分段着色的占位文本。textarea 有值就隐藏覆盖层，露出用户真实输入。
//
// 兼容：导出 stripPromptPlaceholders / highlightSegments 保留（旧调用方/测试引用），
// 但新链路不再依赖它们做提交清洗（幽灵不进 value，提交天然干净）。
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

// 方括号占位符：`[任意非]非换行字符]`。
const TOKEN_RE = /\[[^\]\n]+\]/g;

type Seg =
  | { kind: "lit"; text: string }
  | { kind: "placeholder"; text: string };

/** 把幽灵模板拆成交替的「字面段」「占位段」，用于覆盖层分段着色。 */
function ghostSegments(template: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(template))) {
    if (m.index > last) out.push({ kind: "lit", text: template.slice(last, m.index) });
    out.push({ kind: "placeholder", text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push({ kind: "lit", text: template.slice(last) });
  return out;
}

// ── 兼容旧导出（v12 时期的 API；新链路不再使用，仅保留避免破坏别处 import/测试）──
export function highlightSegments(text: string, _template?: string | null): Seg[] {
  void _template;
  return ghostSegments(text);
}
/** @deprecated 幽灵占位不再进 value，提交天然不含占位；保留 no-op 语义为兼容。 */
export function stripPromptPlaceholders(text: string, _template?: string | null): string {
  void _template;
  return text;
}

export interface PromptHighlightAreaHandle {
  focus: () => void;
  /** 暴露底层 textarea，供 LeoComposer 挂 data-attr（leo 助手锚点）。 */
  el: () => HTMLTextAreaElement | null;
}

export interface PromptHighlightAreaProps {
  value: string;
  onChange: (value: string) => void;
  /** 幽灵占位模板（点卡片时设入）。value 为空时作为不可选的提示覆盖层显示。 */
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

// textarea 与镜像覆盖层必须共享的排版样式（保证像素级对齐）。与 LeoComposer 里原生
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

    useImperativeHandle(ref, () => ({
      focus: () => taRef.current?.focus(),
      el: () => taRef.current,
    }));

    const autogrow = useCallback(() => {
      const el = taRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
    }, [maxHeight]);

    useLayoutEffect(() => {
      autogrow();
    }, [value, autogrow]);

    useEffect(() => {
      if (autoFocus) taRef.current?.focus();
    }, [autoFocus]);

    // 幽灵覆盖层：仅在「有模板 且 用户还没输入任何字符」时显示。用户一输入就隐藏，
    // 露出真实文本；此时占位彻底不存在（不在 value 里）——选不中、点即输入。
    const showGhost = Boolean(template) && value.length === 0;
    const segs = showGhost ? ghostSegments(template as string) : [];

    return (
      <div className={`relative ${className}`}>
        {/* 幽灵提示覆盖层：pointer-events-none → 选不中、点击穿透到下面的 textarea。
            仅展示，绝不进入 value。value 非空即隐藏。 */}
        {showGhost && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ ...SHARED_TYPO, maxHeight, userSelect: "none" }}
          >
            {segs.map((s, i) =>
              s.kind === "placeholder" ? (
                <span key={i} style={{ color: accentColor, fontWeight: 500 }}>
                  {s.text}
                </span>
              ) : (
                <span key={i} style={{ color: "#a3a3a3" }}>
                  {s.text}
                </span>
              ),
            )}
          </div>
        )}

        <textarea
          ref={taRef}
          value={value}
          disabled={disabled}
          rows={rows}
          // 无幽灵模板时用原生 placeholder（普通空输入框体验）。
          placeholder={showGhost ? undefined : placeholder}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          onInput={autogrow}
          onKeyDown={onKeyDown}
          spellCheck={false}
          className="relative w-full resize-none border-0 bg-transparent text-neutral-800 outline-none placeholder:text-neutral-400"
          style={{ ...SHARED_TYPO, maxHeight }}
        />
      </div>
    );
  },
);
