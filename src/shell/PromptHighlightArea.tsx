"use client";

// ============================================================================
// @oceanleo/ui — TemplateFillArea（模板「实填 + 占位着色」输入区，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v15（操作员 2026-07-05 下午拍板，推翻 v12.1 的「纯幽灵占位」）：
//
//   点 prompt 卡片 / 导航示例后，模板文案要**实打实填进输入框**——字面文字是真实、
//   可编辑、可选中、可提交的字符；**只有 `[字段]` 这种「需要用户替换的带色占位」**
//   才是「着色 + 选不中的原子块」：
//     · 【实填】——字面文字直接进 value，可编辑、可选、提交时原样带出；
//     · 【占位着色】——`[字段]` 以 accent（蓝）色显示；
//     · 【占位原子】——一个 `[字段]` 是不可分的整体：可整体删除/替换，但选不中它
//       内部的半个字，光标不进入其内部；
//     · 【点即替换】——点占位 / 在占位上打字，即用真实内容替换掉它。
//
// 为什么 v12.1（纯幽灵覆盖层，占位不进 value）被推翻：操作员要求「绝大部分字要实打
// 实填上去」，幽灵方案里连字面文字都不进 value，不满足。为什么 v12（真 textarea +
// 把整段塞进 value + 提交 strip）也不对：占位在 value 里 → 能选中半个、点不消失、
// 要 strip 补救。本版是唯一同时满足「字面实填 + 占位原子着色」的模型。
//
// 技术：单个 contentEditable 的 <div> 作编辑器；占位 chip = 内嵌
//   <span data-ph contenteditable="false">[字段]</span>。`contenteditable=false`
// 是浏览器**原生**的「原子内联对象」语义（= 富文本编辑器插 mention/emoji chip 的标准
// 做法），所以 chip 天然「整体不可分、可整体删、选不中内部」，无需自研选区算法。
// value 读取 = 遍历子节点：文本节点取 textContent，chip 取其 `[字段]` 文本，拼接。
// （该序列化算法已在 scratch/tmpl-fill-smoke/smoke.mjs 全场景验证。）
//
// 回退：无模板（普通输入框）时**不启用** contentEditable——LeoComposer 直接用普通
// <textarea>（全家桶其它输入框零回归）。本组件只在「点了卡片/示例、带模板」时接管。
//
// 兼容：保留导出名 PromptHighlightArea（+ 别名 TemplateFillArea）、Handle 形状、
//   highlightSegments / stripPromptPlaceholders（旧引用/测试）。
// ============================================================================

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

// 方括号占位符：`[任意非中括号、非换行字符]`。
const TOKEN_RE = /\[[^\[\]\n]+\]/g;

type Seg =
  | { kind: "lit"; text: string }
  | { kind: "placeholder"; text: string };

/** 把模板拆成交替的「字面段」「占位段」。 */
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
/** @deprecated 提交由本组件 readValue 天然产出干净 value；保留 no-op 语义为兼容。 */
export function stripPromptPlaceholders(text: string, _template?: string | null): string {
  void _template;
  return text;
}

export interface PromptHighlightAreaHandle {
  focus: () => void;
  /** 暴露底层可编辑元素，供 LeoComposer 挂 data-attr（leo 助手锚点）。 */
  el: () => HTMLElement | null;
}
export type TemplateFillAreaHandle = PromptHighlightAreaHandle;

export interface PromptHighlightAreaProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * 模板（点卡片 / 示例时设入）。设入即把「字面文字 + 占位 chip」渲染进编辑器；
   * 字面文字真实进 value、占位 chip 原子着色。null → 由 LeoComposer 走普通 textarea。
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

// contentEditable 编辑器的排版（与 LeoComposer 普通 textarea 的 px-5 pt-5 pb-2
// text-[15px] leading-relaxed 逐项对应，保证两种模式观感一致）。
const TYPO: CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.625",
  padding: "20px 20px 8px 20px",
  fontFamily: "inherit",
  fontWeight: 400,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "break-word",
};

// 把编辑器 DOM 序列化成 value：文本节点取 textContent；占位 chip 取其 [字段] 文本；
// <br>/块级换行还原成 \n。（算法与 smoke.mjs 一致。）
function readEditorValue(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent || "";
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.dataset && el.dataset.ph !== undefined) {
          // 占位 chip：原样带出它的 [字段] 文本（用户没替换的占位作字面量提交）。
          out += el.textContent || "";
        } else if (el.tagName === "BR") {
          out += "\n";
        } else {
          // 其它元素（浏览器偶尔插的 <div>/<span>）——递归取其文本，块级前补换行。
          if (el.tagName === "DIV" && out && !out.endsWith("\n")) out += "\n";
          walk(el);
        }
      }
    });
  };
  walk(root);
  return out;
}

// 用模板段构造编辑器初始 DOM（字面文字 = 文本节点；占位 = 原子 chip span）。
function buildEditorDom(root: HTMLElement, template: string, accent: string) {
  root.textContent = "";
  const segs = templateSegments(template);
  for (const s of segs) {
    if (s.kind === "placeholder") {
      const chip = document.createElement("span");
      chip.dataset.ph = "1";
      chip.setAttribute("contenteditable", "false");
      chip.textContent = s.text;
      chip.style.color = accent;
      chip.style.fontWeight = "500";
      // chip 视觉：淡 accent 底 + 圆角，像可替换的「填空格」。
      chip.style.background = hexToSoftBg(accent);
      chip.style.borderRadius = "5px";
      chip.style.padding = "0 3px";
      chip.style.margin = "0 1px";
      chip.style.cursor = "text";
      root.appendChild(chip);
    } else {
      // 保留换行：把 \n 拆成文本节点 + <br>。
      const parts = s.text.split("\n");
      parts.forEach((p, i) => {
        if (i > 0) root.appendChild(document.createElement("br"));
        if (p) root.appendChild(document.createTextNode(p));
      });
    }
  }
}

// accent(#rrggbb) → 一个很淡的同色底（rgba 0.1），做 chip 背景。
function hexToSoftBg(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "rgba(79,70,229,0.10)";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},0.12)`;
}

/** 把光标放到编辑器末尾。 */
function caretToEnd(root: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

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
    const edRef = useRef<HTMLDivElement>(null);
    // 记录「已按哪个模板 seed 过」，模板变化时才重建 DOM（避免打字时被 React 重渲染
    // 冲掉光标）。null 模板不该走到这里（LeoComposer 会用普通 textarea）。
    const seededTemplate = useRef<string | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => edRef.current?.focus(),
      el: () => edRef.current,
    }));

    const seed = useCallback(
      (tmpl: string) => {
        const root = edRef.current;
        if (!root) return;
        buildEditorDom(root, tmpl, accentColor);
        seededTemplate.current = tmpl;
        const v = readEditorValue(root);
        if (v !== value) onChange(v);
        requestAnimationFrame(() => {
          root.focus();
          caretToEnd(root);
        });
      },
      // value/onChange 读的是最新闭包；只在 accentColor 变时重建 seed 引用即可。
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [accentColor],
    );

    // 模板变化（点了新卡片/示例）→ 重建编辑器 DOM，字面进 value、占位成 chip。
    useEffect(() => {
      if (template == null) return;
      if (seededTemplate.current === template) return;
      seed(template);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template, seed]);

    // 「点同一张卡再来一次」：调用方（HomeIntro）点卡片时会先把 value 置空。若此时
    // DOM 还残留上一次内容且模板未变（seed 不会重跑），这里把 DOM 清掉并**重新 seed**
    // 当前模板——保证再次点同一张卡也能重灌。用户自己删空（DOM 已空）不进此分支。
    useEffect(() => {
      const root = edRef.current;
      if (!root) return;
      if (value === "" && root.textContent !== "") {
        if (template != null) seed(template);
        else {
          root.textContent = "";
          seededTemplate.current = null;
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, template, seed]);

    useEffect(() => {
      if (autoFocus) edRef.current?.focus();
    }, [autoFocus]);

    const emit = useCallback(() => {
      const root = edRef.current;
      if (!root) return;
      onChange(readEditorValue(root));
    }, [onChange]);

    const showPlaceholder = value.length === 0;

    return (
      <div className={`relative ${className}`}>
        {showPlaceholder && placeholder && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 text-neutral-400"
            style={{ ...TYPO }}
          >
            {placeholder}
          </div>
        )}
        <div
          ref={edRef}
          role="textbox"
          aria-multiline="true"
          contentEditable={!disabled}
          suppressContentEditableWarning
          spellCheck={false}
          onInput={emit}
          onKeyDown={(e) => onKeyDown?.(e as unknown as ReactKeyboardEvent<HTMLElement>)}
          className="relative w-full resize-none overflow-y-auto border-0 bg-transparent text-neutral-800 outline-none"
          style={{ ...TYPO, minHeight: `${rows * 1.625}em`, maxHeight }}
        />
      </div>
    );
  },
);

/** 别名（宗旨 v15 新名字；语义即「模板实填 + 占位着色」）。 */
export const TemplateFillArea = PromptHighlightArea;
