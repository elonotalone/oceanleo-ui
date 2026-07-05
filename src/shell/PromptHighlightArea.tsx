"use client";

// ============================================================================
// @oceanleo/ui — TemplateFillArea（模板「实填 + 占位着色」输入区，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v15（操作员 2026-07-05 下午拍板，推翻 v12.1 的「纯幽灵占位」）：
//
//   点 prompt 卡片 / 导航示例后，模板文案要**实打实填进输入框**——字面文字是真实、
//   可编辑、可选中、可提交的字符；`[字段]` 则是一个**真·幽灵占位（填空槽）**：
//     · 【实填】——字面文字直接进 value，可编辑、可选、提交时原样带出；
//     · 【幽灵占位】（操作员 2026-07-05 晚二次更正，定版）——`[字段]` 渲染成一个空的
//       占位槽 <span.oc-ph data-hint="[字段]">，提示文字用 CSS `::before(content)` 显示：
//         - **不可选**（user-select:none）：拖选整行 / 双击都选不到它；
//         - **不可删**：提示是 CSS content、不是真实文本，Backspace 删不掉；
//         - **不进 value**：空槽序列化为 ""（**不吐 [字段] 字面**）；
//         - **填入即替换**：用户往槽里打字 → 提示自动消失、显示真实内容、进 value。
//       （槽内放一个零宽空格 ZWSP 只为让光标能落进空槽；序列化时被剥掉。）
//
// 演进史（3 次推翻）：
//   v12.1 纯幽灵覆盖层（整段都不进 value）→ 操作员：字面文字要实打实填，不满足。
//   v12 真 textarea + 整段塞进 value + 提交 strip → 占位能选半个、点不消失，靠 strip 补救。
//   v15a chip=<span contenteditable=false>[字段]</span>（原子块）→ 操作员：占位应「整段
//        不可选」，我只加了 user-select:none，但它仍**可删**、且 `[字段]` 字面**进了 value**。
//   v15b（本版，定版）：占位 = 空的「填空槽」，提示走 CSS ::before —— 不可选、不可删、
//        不进 value、填入即替换。字面文字仍是真实可编辑文本。
//
// 技术：单个 contentEditable 的 <div> 作编辑器。字面段 = 真实文本节点（可编辑，进 value）；
//   占位段 = <span.oc-ph data-hint="[字段]"> 空槽，提示由 CSS `.oc-ph[data-empty]::before
//   { content: attr(data-hint) }` 显示（见 theme/globals.css）。CSS ::before 内容天然
//   「选不中、删不掉、不属于 DOM 文本」，正好满足幽灵语义，无需自研选区/删除拦截。
//   槽里放一个 ZWSP 让光标可落入空槽；输入时 JS 只切 data-empty 属性（显隐提示）不改文本
//   （不打断光标）。value 读取 = 遍历子节点：文本节点 / 槽都取 textContent 并剥掉 ZWSP，
//   空槽→""（不吐 [字段]）。序列化算法已在 scratch/ghost-serialize-smoke.mjs 全场景验证。
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

// 零宽空格：塞进空占位槽里，让光标能落进去（浏览器对完全空的 inline 元素不给光标位）。
// 序列化 / 判空 / 显示提示时都把它当作「不存在」。
const ZWSP = "\u200b";
const stripZwsp = (s: string) => s.split(ZWSP).join("");

// 把编辑器 DOM 序列化成 value：文本节点取 textContent；占位槽(.oc-ph)取其**真实输入**
// （去掉 ZWSP；没填的槽 = 空串，**不吐 [字段] 字面**）；<br>/块级换行还原成 \n。
// （算法与 scratch/ghost-serialize-smoke.mjs 一致。）
function readEditorValue(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += stripZwsp(child.textContent || "");
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.dataset && el.dataset.ph !== undefined) {
          // 占位槽：只带出用户真实输入（去 ZWSP）。空槽 → ""（幽灵提示不进 value）。
          out += stripZwsp(el.textContent || "");
        } else if (el.tagName === "BR") {
          out += "\n";
        } else {
          if (el.tagName === "DIV" && out && !out.endsWith("\n")) out += "\n";
          walk(el);
        }
      }
    });
  };
  walk(root);
  return out;
}

// 造一个占位槽 <span.oc-ph data-hint="[字段]">（内含一个 ZWSP 让光标可入）。空槽通过
// CSS `.oc-ph[data-empty]::before{content:attr(data-hint)}` 显示**幽灵提示**——提示是
// CSS content：不可选、不可删、不进 value；用户往槽里打字即显示真实内容、提示自动消失。
function makePlaceholderSlot(hint: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "oc-ph";
  span.dataset.ph = "1";
  span.dataset.hint = hint;
  span.dataset.empty = "1";
  span.appendChild(document.createTextNode(ZWSP));
  return span;
}

// 每次输入后：只**切换 data-empty 属性**（不改 textContent，避免打断光标）。空槽
// （去 ZWSP 后为空）→ data-empty=1（CSS ::before 显示幽灵提示）；填了内容 → 去掉
// data-empty（提示隐藏）。提示走 `.oc-ph[data-empty]::before`，即使槽里只剩空也能显示，
// 所以不必在输入时回填 ZWSP。ZWSP 只在初始 build 时放（保证空槽一开始有光标位）。
function syncSlotEmptiness(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".oc-ph").forEach((slot) => {
    if (stripZwsp(slot.textContent || "") === "") slot.dataset.empty = "1";
    else delete slot.dataset.empty;
  });
}

// 用模板段构造编辑器初始 DOM（字面文字 = 真实文本节点；占位 = 幽灵槽 .oc-ph）。
// accent 现由 CSS 变量控制（见下方 accentVar），这里不再内联颜色。
function buildEditorDom(root: HTMLElement, template: string) {
  root.textContent = "";
  const segs = templateSegments(template);
  for (const s of segs) {
    if (s.kind === "placeholder") {
      root.appendChild(makePlaceholderSlot(s.text));
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

/** 把光标落到第一个空占位槽内（ZWSP 之后）；没有空槽则落到编辑器末尾。 */
function caretToFirstEmptySlot(root: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const firstEmpty = root.querySelector<HTMLElement>('.oc-ph[data-empty]');
  if (firstEmpty) {
    const node = firstEmpty.firstChild ?? firstEmpty;
    const range = document.createRange();
    // 落在 ZWSP 之后（offset=1）；若槽内无文本节点则落到槽内起点。
    if (node.nodeType === Node.TEXT_NODE) {
      range.setStart(node, (node.textContent || "").length);
    } else {
      range.selectNodeContents(firstEmpty);
      range.collapse(false);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }
  caretToEnd(root);
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
        buildEditorDom(root, tmpl);
        syncSlotEmptiness(root);
        seededTemplate.current = tmpl;
        const v = readEditorValue(root);
        if (v !== value) onChange(v);
        // 光标落到**第一个空占位槽**（用户第一件事就是填第一个空），没有空槽则落末尾。
        requestAnimationFrame(() => {
          root.focus();
          caretToFirstEmptySlot(root);
        });
      },
      // value/onChange 读的是最新闭包；无依赖需重建（accent 走 CSS 变量，不进 seed）。
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    // 模板变化（点了新卡片/示例）→ 重建编辑器 DOM，字面进 value、占位成 chip。
    useEffect(() => {
      if (template == null) return;
      if (seededTemplate.current === template) return;
      seed(template);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template, seed]);

    // 「点同一张卡再来一次」：调用方（HomeIntro）点卡片时会先把 value 置空。若此时
    // 编辑器里仍有**真实内容**（去 ZWSP 后非空）且模板未变（seed 不会重跑），这里重新
    // seed 当前模板——保证再次点同一张卡也能重灌。
    // 注意用 readEditorValue（已剥 ZWSP）判空，不用 root.textContent——否则空占位槽里的
    // ZWSP 会被当成"有内容"，对纯占位模板造成 seed 无限循环。
    useEffect(() => {
      const root = edRef.current;
      if (!root) return;
      if (value === "" && readEditorValue(root) !== "") {
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
      // 只切 data-empty 属性（不改 textContent），据此显隐幽灵提示；不打断光标。
      syncSlotEmptiness(root);
      onChange(readEditorValue(root));
    }, [onChange]);

    // 通用占位提示（"描述你想要的…"）只在**普通模式**（无模板）且空时显示。模板一旦
    // 灌入，模板文本 + 幽灵占位本身就是引导，不再叠加通用提示（否则会与占位重叠）。
    const showPlaceholder = value.length === 0 && template == null;

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
          className="oc-tmpl-editor relative w-full resize-none overflow-y-auto border-0 bg-transparent text-neutral-800 outline-none"
          // accent 作为 CSS 变量下发给 .oc-ph 幽灵提示配色（见 theme/globals.css）。
          style={{ ...TYPO, minHeight: `${rows * 1.625}em`, maxHeight, ["--oc-ph-accent" as string]: accentColor }}
        />
      </div>
    );
  },
);

/** 别名（宗旨 v15 新名字；语义即「模板实填 + 占位着色」）。 */
export const TemplateFillArea = PromptHighlightArea;
