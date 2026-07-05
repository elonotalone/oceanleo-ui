"use client";

// ============================================================================
// @oceanleo/ui — TemplateFillArea（模板「实填 + 文本流内原地替换占位」输入区，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v15（操作员 2026-07-05 多次拍板，本版 = v15d 定版，对齐豆包「帮我写作」范式）：
//
//   点 prompt 卡片 / 导航示例后，模板文案要**实打实填进输入框**——字面文字是真实、可编辑、
//   可选中、可提交的字符；`[字段]` 则是一个**文本流内的着色填空标记**：
//     · 【实填字面】——卡片里的普通文字直接进 value，可编辑、可选、原样提交；
//     · 【占位=文本流内着色标记】——`[字段]` 渲染成一个行内空 <span.oc-ph>，其蓝色标签用
//        CSS `::before(content: attr(data-hint))` 显示（标签是 CSS content：天生不可选、
//        不进 DOM 文本、不进 value）；
//     · 【在框中输入 = 原地替换】——光标落进这个空槽后**直接在文本流里打字**，字符原地
//        替换掉 [字段] 标签，成为**加粗蓝**的真实内容，并把后文自然顺移（span 是 inline，
//        内容撑开它）。这**不是**往一个行内 <input> 小框里打字（那是「在框外输入」，v15c 被
//        操作员否掉）；
//     · 【不可选】——标签是 ::before content，拖蓝/双击都选不到；
//     · 【不可删】——空槽本体删不掉：beforeinput 拦掉「跨越槽 / 覆盖槽 / 删空槽」的删除；
//        槽内删自己填的字照常放行（那是正常填空编辑）。极端漏网情况由 MutationObserver 兜底
//        重建并按序回填；
//     · 【清空即回显】——把槽里填的字删空 → 槽回到「只含一个 ZWSP」→ ::before 标签自动回来；
//     · 【不进 value 的是标签、进 value 的是输入】——空槽序列化为 ""（**不吐 [字段]**）。
//
// 为什么是「文本流内 ZWSP 空槽 + ::before 标签」而不是「行内 <input> 框」（推翻 v15c）：
//   v15c 把占位做成行内 <input>，打字是在一个独立小框里 → 操作员截图指出这是「在框外输入」，
//   要的是「在框中输入」= 字直接进句子、原地替换标签、后文顺移（豆包范式）。所以回到
//   contentEditable 文本流方案，但补齐 v15b 缺的「不可删」（beforeinput 拦截 + 兜底）。
//   标签用 ::before 天然满足不可选/不进 value；ZWSP 让空 inline 槽能落光标；input 后规整把
//   真实内容里的 ZWSP 剔掉（保光标）、空槽补回 ZWSP。规范依据见文件末尾链接。
//
// 回退：无模板（普通输入框）时**不启用** contentEditable——LeoComposer 直接用普通
//   <textarea>（全家桶其它输入框零回归）。本组件只在「点了卡片/示例、带模板」时接管。
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
   * 模板（点卡片 / 示例时设入）。设入即把「字面文字 + 文本流内占位标记」渲染进编辑器；
   * 字面文字真实进 value、占位为可原地替换的着色槽。null → 由 LeoComposer 走普通 textarea。
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
// 序列化 / 判空 / 显示标签时都把它当作「不存在」；有真实内容时规整掉它。
const ZWSP = "\u200b";
const stripZwsp = (s: string) => s.split(ZWSP).join("");

// 把编辑器 DOM 序列化成 value：文本节点 & 占位槽都取 textContent 并剥掉 ZWSP；空槽 → ""
// （**不吐 [字段] 字面**，标签是 ::before 不在 textContent 里）；<br>/块级换行还原成 \n。
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

// 造占位槽 <span.oc-ph data-hint="[字段]">（内含一个 ZWSP 让空槽能落光标）。空槽通过 CSS
// `.oc-ph[data-empty]::before{content:attr(data-hint)}` 显示蓝色标签；用户往里打字即原地替换。
function makePlaceholderSlot(hint: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "oc-ph";
  span.dataset.ph = "1";
  span.dataset.hint = hint;
  span.dataset.empty = "1";
  span.appendChild(document.createTextNode(ZWSP));
  return span;
}

// 用模板段构造编辑器初始 DOM（字面文字 = 真实文本节点；占位 = 文本流内着色槽 .oc-ph）。
// 返回槽节点数组（供删除拦截 / 兜底复原）。accent 由 CSS 变量控制（见下方 style）。
function buildEditorDom(root: HTMLElement, template: string): HTMLSpanElement[] {
  root.textContent = "";
  const slots: HTMLSpanElement[] = [];
  const segs = templateSegments(template);
  for (const s of segs) {
    if (s.kind === "placeholder") {
      const slot = makePlaceholderSlot(s.text);
      slots.push(slot);
      root.appendChild(slot);
    } else {
      const parts = s.text.split("\n");
      parts.forEach((p, i) => {
        if (i > 0) root.appendChild(document.createElement("br"));
        if (p) root.appendChild(document.createTextNode(p));
      });
    }
  }
  return slots;
}

// 每次 input 后规整每个槽（保光标）：
//   · 槽有真实内容（去 ZWSP 非空）→ 把 ZWSP 剔掉、去 data-empty（标签隐藏、显示真实内容）；
//   · 槽为空 → 保证恰有一个 ZWSP、加 data-empty（::before 标签回显、光标可落）。
// 保光标：改某槽文本前记录光标相对「该槽去 ZWSP 文本」的偏移，改完把光标恢复到相同偏移。
function normalizeSlots(root: HTMLElement): void {
  const sel = window.getSelection();
  root.querySelectorAll<HTMLElement>(".oc-ph").forEach((slot) => {
    const raw = slot.textContent || "";
    const real = stripZwsp(raw);

    // 光标是否在本槽内？记录其相对「去 ZWSP 文本」的字符偏移。
    let caretOffset = -1;
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0);
      if (r.collapsed && slot.contains(r.startContainer)) {
        // 计算 startContainer 起点在槽内的绝对偏移，再换算成去 ZWSP 偏移。
        const node = r.startContainer;
        if (node.nodeType === Node.TEXT_NODE && node.parentNode === slot) {
          const before = (node.textContent || "").slice(0, r.startOffset);
          caretOffset = stripZwsp(before).length;
        } else {
          caretOffset = real.length; // 兜底：落末尾
        }
      }
    }

    if (real === "") {
      if (raw !== ZWSP) slot.textContent = ZWSP;
      slot.dataset.empty = "1";
      if (caretOffset >= 0) placeCaretInSlot(slot, /*afterZwsp*/ true);
    } else {
      if (raw !== real) {
        slot.textContent = real; // 去掉混入的 ZWSP
        if (caretOffset >= 0) placeCaretInSlot(slot, false, Math.min(caretOffset, real.length));
      }
      delete slot.dataset.empty;
    }
  });
}

// 把光标放进某个槽：afterZwsp=true → 落在 ZWSP 之后（空槽情形）；否则落在给定字符偏移。
function placeCaretInSlot(slot: HTMLElement, afterZwsp: boolean, offset = 0): void {
  const sel = window.getSelection();
  if (!sel) return;
  const node = slot.firstChild;
  const range = document.createRange();
  if (node && node.nodeType === Node.TEXT_NODE) {
    const len = (node.textContent || "").length;
    range.setStart(node, afterZwsp ? Math.min(1, len) : Math.min(offset, len));
  } else {
    range.selectNodeContents(slot);
    range.collapse(false);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
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
  const firstEmpty = root.querySelector<HTMLElement>(".oc-ph[data-empty]");
  if (firstEmpty) {
    placeCaretInSlot(firstEmpty, true);
    return;
  }
  caretToEnd(root);
}

/** 删除类 inputType。 */
function isDeleteInput(inputType: string): boolean {
  return inputType.startsWith("delete");
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
    // 记录「已按哪个模板 seed 过」，模板变化时才重建 DOM（避免打字时被 React 重渲染冲掉光标）。
    const seededTemplate = useRef<string | null>(null);
    // 当前模板的占位槽节点（按序），供删除拦截 / 兜底复原用。
    const slotsRef = useRef<HTMLSpanElement[]>([]);

    useImperativeHandle(ref, () => ({
      focus: () => edRef.current?.focus(),
      el: () => edRef.current,
    }));

    const seed = useCallback(
      (tmpl: string) => {
        const root = edRef.current;
        if (!root) return;
        slotsRef.current = buildEditorDom(root, tmpl);
        normalizeSlots(root);
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

    // 模板变化（点了新卡片/示例）→ 重建编辑器 DOM，字面进 value、占位成着色槽。
    useEffect(() => {
      if (template == null) return;
      if (seededTemplate.current === template) return;
      seed(template);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template, seed]);

    // 「点同一张卡再来一次」：调用方点卡片时会先把 value 置空。若此时编辑器里仍有**真实内容**
    // （去 ZWSP 后非空）且模板未变（seed 不会重跑），这里重新 seed 当前模板。
    // 用 readEditorValue（已剥 ZWSP）判空，不用 root.textContent——否则空槽里的 ZWSP 会被当成
    // "有内容"，对纯占位模板造成 seed 无限循环。
    useEffect(() => {
      const root = edRef.current;
      if (!root) return;
      if (value === "" && readEditorValue(root) !== "") {
        if (template != null) seed(template);
        else {
          root.textContent = "";
          slotsRef.current = [];
          seededTemplate.current = null;
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, template, seed]);

    useEffect(() => {
      if (autoFocus) edRef.current?.focus();
    }, [autoFocus]);

    // ── 不可删：拦截「会删到占位槽本体」的 beforeinput；槽内删自己填的字 / 纯字面删除放行。 ──
    useEffect(() => {
      const root = edRef.current;
      if (!root) return;
      const onBeforeInput = (ev: Event) => {
        const e = ev as InputEvent;
        if (!isDeleteInput(e.inputType)) return;
        const slots = slotsRef.current;
        if (slots.length === 0) return;
        // 优先用 getTargetRanges（规范给出的将被删除区间）；退化到当前 selection。
        let ranges: Range[] = [];
        const tr = typeof e.getTargetRanges === "function" ? e.getTargetRanges() : [];
        if (tr && tr.length) {
          ranges = tr.map((sr) => {
            const r = document.createRange();
            r.setStart(sr.startContainer, sr.startOffset);
            r.setEnd(sr.endContainer, sr.endOffset);
            return r;
          });
        } else {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) ranges = [sel.getRangeAt(0)];
        }
        for (const r of ranges) {
          for (const slot of slots) {
            if (!slot.isConnected) continue;
            let hit = false;
            try {
              hit = r.intersectsNode(slot);
            } catch {
              hit = false;
            }
            if (!hit) continue;
            // 删除区间完全在某槽内部、且该槽已填真实内容 → 是正常「删自己填的字」，放行。
            const inside = slot.contains(r.startContainer) && slot.contains(r.endContainer);
            const real = stripZwsp(slot.textContent || "");
            if (inside && real !== "") break; // 放行本次删除
            // 否则（跨越槽 / 选区覆盖槽 / 想把空槽本体删掉）→ 拦截，槽删不得。
            e.preventDefault();
            return;
          }
        }
      };
      root.addEventListener("beforeinput", onBeforeInput);
      return () => root.removeEventListener("beforeinput", onBeforeInput);
    }, []);

    // 读 DOM → 规整（保光标）→ 上抛 value。
    const emit = useCallback(() => {
      const root = edRef.current;
      if (!root) return;
      normalizeSlots(root);
      onChange(readEditorValue(root));
    }, [onChange]);

    // ── 兜底：万一某槽仍被删掉（IME/自动填充等 beforeinput 不触发/不可取消），MutationObserver
    //    侦测到追踪槽脱离 DOM → 按模板重建并按序回填各槽已输入值。 ──
    useEffect(() => {
      const root = edRef.current;
      if (!root) return;
      const obs = new MutationObserver(() => {
        const slots = slotsRef.current;
        if (slots.length === 0) return;
        if (!slots.some((s) => !s.isConnected)) return;
        const tmpl = seededTemplate.current;
        if (tmpl == null) return;
        const saved = slots.map((s) => stripZwsp(s.textContent || ""));
        obs.disconnect();
        const fresh = buildEditorDom(root, tmpl);
        fresh.forEach((s, i) => {
          if (saved[i]) {
            s.textContent = saved[i];
            delete s.dataset.empty;
          }
        });
        slotsRef.current = fresh;
        normalizeSlots(root);
        onChange(readEditorValue(root));
        obs.observe(root, { childList: true, subtree: true });
      });
      obs.observe(root, { childList: true, subtree: true });
      return () => obs.disconnect();
    }, [onChange]);

    // 通用占位提示（"描述你想要的…"）只在**普通模式**（无模板）且空时显示。模板一旦灌入，
    // 模板文本 + 着色槽本身就是引导，不再叠加通用提示。
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
          // accent 作为 CSS 变量下发给 .oc-ph 着色槽 / ::before 标签配色（见 theme/globals.css）。
          style={{ ...TYPO, minHeight: `${rows * 1.625}em`, maxHeight, ["--oc-ph-accent" as string]: accentColor }}
        />
      </div>
    );
  },
);

/** 别名（宗旨 v15 新名字；语义即「模板实填 + 文本流内原地替换占位」）。 */
export const TemplateFillArea = PromptHighlightArea;

// 参考规范（不可删 / 空 inline 落光标 / 幽灵标签的实现依据）：
//   W3C Input Events Level 2 — https://www.w3.org/TR/input-events/
//   MDN beforeinput — https://developer.mozilla.org/en-US/docs/Web/API/Element/beforeinput_event
//   MDN getTargetRanges — https://developer.mozilla.org/en-US/docs/Web/API/InputEvent/getTargetRanges
//   contenteditable placeholder via ::before — https://stackoverflow.com/questions/20726174
