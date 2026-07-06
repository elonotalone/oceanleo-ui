"use client";

// ============================================================================
// @oceanleo/ui — TemplateFillArea（模板「实填 + [占位] 蓝色高亮」输入区，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v15（操作员 2026-07-05→07-06 多次拍板；本版 = v15g 定版，「透明 textarea +
// 镜像高亮层」架构，彻底推翻此前 contentEditable 系列 v15a–f）：
//
//   点 prompt 卡片 / 导航示例后，模板文案**实打实、整段可编辑地**填进输入框——它就是
//   一段**普通文本**（原生 textarea 的 value）：可全选删除、可逐字删、可反悔、可随意改；
//   光标可落在任意字符间（包括 `[主题]` 的方括号内部）。`[字段]` 只是这段文本里**着了
//   蓝色的普通字符**（淡蓝底 + 蓝字，提示此处待替换），**它连同方括号都是真实文本**，
//   可选中、可删除、进 value——没有任何「原子块 / 伪元素 / 不可删守卫」。
//
//   为什么推翻此前所有 contentEditable 方案（v15a chip / v15d ZWSP / v15e 嵌套宿主 /
//   v15f 单宿主+::before）：操作员核心诉求其实是「**填进来的就是普通可编辑文本**」——
//     · 光标要能进方括号里面（截图 bd08ee9e 豆包：`[主│要工作回顾]`）；
//     · 要能全选删除 / 反悔（点了卡片不该锁死）；
//     · 荧光区本身也要能删。
//   而 contentEditable + 伪元素标签**天生做不到**（伪元素不占文本位置 → 光标永远在标签
//   旁边而非里面；为「不可删」加的守卫又挡了全选删/反悔）。这三条恰恰要求「标签是真实
//   文本、纯视觉高亮」。业界高亮输入框（CodeMirror 早期、highlight-within-textarea、各类
//   @提及底层）的标准做法就是本方案：
//
//     <div 相对定位>
//       <div.oc-hl-mirror aria-hidden pointer-events:none>   ← 镜像层：只读渲染，套 [..] 高亮
//         我的职业是 <span.oc-ph>[输入职业]</span> ，帮我写 …
//       </div>
//       <textarea.oc-hl-input>                                ← 真输入：原生 textarea 叠在上层
//     </div>
//
//   · **输入完全是原生 textarea** → IME 合成、全选、删除、光标、反悔全是浏览器原生行为，
//     零自研、零 bug（此前 IME 跳页首 / 末字删不掉 / 光标在框外全部消失，因为根本回归了
//     textarea）；
//   · textarea 文字 color:transparent（只留 caret-color 显示光标）、背景透明；镜像层在其
//     正下方用**逐像素对齐**的同款排版渲染文本 + 高亮，颜色从下面透上来；
//   · 镜像层 **aria-hidden + pointer-events:none**，永不接收输入、永不改 textarea DOM →
//     无任何 IME / 删除交互面；
//   · value 天然 = textarea.value = 模板原文（含 `[]`），提交无需清洗（AI 侧本就理解 `[占位]`）。
//
// 回退：无模板（普通输入框）时 LeoComposer 直接用它自己的原生 textarea（不渲染本组件）。
//   本组件只在「点了卡片/示例、带模板」时接管，且**它本身也只是一个 textarea**，观感/
//   行为与普通模式逐项一致。
//
// 兼容：保留导出名 PromptHighlightArea（+ 别名 TemplateFillArea）、Handle 形状（focus/el，
//   el() 返回 textarea）、highlightSegments / stripPromptPlaceholders（旧引用/测试）。
// ============================================================================

import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent as ReactUIEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

// 方括号占位符：`[任意非中括号、非换行字符]`。
const TOKEN_RE = /\[[^\[\]\n]+\]/g;

type Seg =
  | { kind: "lit"; text: string }
  | { kind: "placeholder"; text: string };

/** 把文本拆成交替的「字面段」「占位段」（占位 = `[..]`，含方括号，是真实文本的一部分）。 */
export function templateSegments(template: string): Seg[] {
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

// ── 兼容旧导出（新链路不再使用，仅保留避免破坏别处 import / 测试）──────────────
export function highlightSegments(text: string, _template?: string | null): Seg[] {
  void _template;
  return templateSegments(text);
}
/** @deprecated value 天然 = 模板原文（含 [占位]），无需清洗；保留 no-op 语义为兼容。 */
export function stripPromptPlaceholders(text: string, _template?: string | null): string {
  void _template;
  return text;
}

export interface PromptHighlightAreaHandle {
  focus: () => void;
  /** 暴露底层输入元素（= textarea），供 LeoComposer 挂 data-attr（leo 助手锚点）。 */
  el: () => HTMLElement | null;
}
export type TemplateFillAreaHandle = PromptHighlightAreaHandle;

export interface PromptHighlightAreaProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * 模板（点卡片 / 示例时设入）。设入即把模板原文**整段写进 value**（普通可编辑文本，
   * `[字段]` 是其中着蓝色的真实字符）。null → 由 LeoComposer 走它自己的普通 textarea。
   */
  template: string | null;
  accentColor?: string;
  placeholder?: string;
  rows?: number;
  maxHeight?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** 透传 keydown（LeoComposer 的回车提交逻辑）。 */
  onKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
}
export type TemplateFillAreaProps = PromptHighlightAreaProps;

// 输入区排版（与 LeoComposer 普通 textarea 的 px-5 pt-5 pb-2 text-[15px] leading-relaxed
// 逐项对应）。**镜像层与 textarea 必须逐项一致**，否则高亮对不齐。
const TYPO: CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.625",
  padding: "20px 20px 8px 20px",
  fontFamily: "inherit",
  fontWeight: 400,
  letterSpacing: "normal",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "break-word",
  margin: 0,
  border: 0,
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
    // 记录「已按哪个模板灌过」，模板变化时才重灌 value（避免打字时反复覆盖用户输入）。
    const seededTemplate = useRef<string | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useImperativeHandle(ref, () => ({
      focus: () => taRef.current?.focus(),
      el: () => taRef.current,
    }));

    // 自增高：textarea 高度跟内容走；镜像层高度跟随（两者叠在一起，同高才不错位）。
    const autogrow = useCallback(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.style.height = "auto";
      const h = Math.min(ta.scrollHeight, maxHeight);
      ta.style.height = h + "px";
    }, [maxHeight]);

    // 模板变化（点了新卡片/示例）→ 把模板原文整段灌进 value。
    useEffect(() => {
      if (template == null) return;
      if (seededTemplate.current === template) return;
      seededTemplate.current = template;
      onChangeRef.current(template);
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.focus();
        // 光标落到第一个 [占位] 的**括号内部**（`[│主题]`，即 '[' 之后），用户第一件事就是改它。
        const idx = template.search(TOKEN_RE);
        const pos = idx >= 0 ? idx + 1 : template.length;
        try {
          ta.setSelectionRange(pos, pos);
        } catch {
          /* noop */
        }
        autogrow();
      });
    }, [template, autogrow]);

    // 「点同一张卡再来一次」：调用方点卡片时会先把 value 置空；若模板未变（上面 effect 不
    // 重跑），这里在 value 变空时重灌当前模板。
    useEffect(() => {
      if (template != null && value === "" && seededTemplate.current === template) {
        // 强制重灌：先清 seed 标记再触发。
        seededTemplate.current = null;
        onChangeRef.current(template);
        seededTemplate.current = template;
        requestAnimationFrame(() => taRef.current?.focus());
      }
    }, [value, template]);

    useEffect(() => {
      if (autoFocus) taRef.current?.focus();
    }, [autoFocus]);

    // value 变（打字/灌模板/外部改）→ 重排高亮层高度。用 layout effect 保证与绘制同步、无闪。
    useLayoutEffect(() => {
      autogrow();
    }, [value, autogrow]);

    const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    };

    // 内容超过 maxHeight 时 textarea 会滚动；镜像层跟着滚，保持高亮对齐。
    const handleScroll = (e: ReactUIEvent<HTMLTextAreaElement>) => {
      const m = mirrorRef.current;
      if (m) m.scrollTop = e.currentTarget.scrollTop;
    };

    // 镜像层内容：按 [..] 分段，占位段套 .oc-ph 高亮，其余原样。末尾补一个换行占位，避免
    // textarea 末尾空行时高亮层比 textarea 矮一行（浏览器 textarea 会给末尾换行留一行）。
    const segs = templateSegments(value);
    const showGhost = value.length === 0 && Boolean(placeholder);

    return (
      <div className={`relative ${className}`} style={{ minHeight: `${rows * 1.625}em` }}>
        {/* 镜像高亮层：只读、不吃事件，渲染文本 + [占位] 蓝色高亮。文字颜色正常，textarea
            文字透明叠其上、只显光标 → 用户看到的是这里透出的彩色文本 + 原生光标。 */}
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className="oc-tmpl-mirror pointer-events-none absolute inset-0 overflow-hidden text-neutral-800"
          style={{ ...TYPO, ["--oc-ph-accent" as string]: accentColor }}
        >
          {showGhost ? (
            <span className="text-neutral-400">{placeholder}</span>
          ) : (
            <>
              {segs.map((s, i) =>
                s.kind === "placeholder" ? (
                  <span key={i} className="oc-ph">
                    {s.text}
                  </span>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
              {/* 末尾换行补白：textarea 末字符是 \n 时会多显示一行，这里对齐。 */}
              {value.endsWith("\n") ? "\u200b" : null}
            </>
          )}
        </div>

        {/* 真输入：原生 textarea，文字透明（只留光标），背景透明，叠在镜像层上。所有编辑
            （IME / 全选 / 删除 / 反悔 / 光标进括号）都是它的原生行为。 */}
        <textarea
          ref={taRef}
          value={value}
          onChange={handleInput}
          onScroll={handleScroll}
          onKeyDown={(e) => onKeyDown?.(e as unknown as ReactKeyboardEvent<HTMLElement>)}
          disabled={disabled}
          spellCheck={false}
          rows={rows}
          className="oc-tmpl-input relative w-full resize-none border-0 bg-transparent outline-none"
          style={{
            ...TYPO,
            color: "transparent",
            caretColor: accentColor,
            WebkitTextFillColor: "transparent",
            maxHeight,
            overflowY: "auto",
            // 让 textarea 与镜像层等宽等排版；高度由 autogrow 设。
            minHeight: `${rows * 1.625}em`,
          }}
        />
      </div>
    );
  },
);

/** 别名（宗旨 v15 新名字；语义即「模板实填 + [占位] 蓝色高亮」）。 */
export const TemplateFillArea = PromptHighlightArea;

// 参考实现（透明 textarea + 镜像高亮层是高亮输入框的标准做法）：
//   highlight-within-textarea（bonsaiden/… 及同类库）— 镜像 div 叠 textarea 逐像素对齐
//   CodeMirror 早期 / 各类 @提及输入底层 — 同款「背后高亮层 + 前置透明可编辑」
//   textarea 文字透明只留 caret-color — 标准「高亮不吃输入」技巧
