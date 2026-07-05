"use client";

// ============================================================================
// @oceanleo/ui — TemplateFillArea（模板「实填 + 文本流内填空槽」输入区，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v15（操作员 2026-07-05 多次拍板；本版 = v15e 定版，「嵌套编辑宿主」架构）：
//
//   点 prompt 卡片 / 导航示例后，模板文案**实打实填进输入框**——字面文字是真实、可编辑、
//   可选中、可提交的字符；`[字段]` 是一个**文本流内的着色填空槽**：
//     · 【在框中输入】——光标点进槽里，打字/中文输入法都发生在**槽内部**，字在句子里
//        原地出现、标签消失、后文顺移（豆包「帮我写作」范式）；
//     · 【不可选】——蓝色 [标签] 是 CSS ::before content，拖蓝/双击选不到、不进 value；
//     · 【不可删】——槽本体删不掉：外层删除动作碰到槽一律拦截；槽内删自己填的字照常；
//        删到最后一个字也只清空槽、槽本身还在（标签回显）；
//     · 【清空即回显】——槽里的字删空 → 蓝色 [标签] 自动回来；
//     · 【空槽不进 value】——空槽序列化为 ""（**绝不吐 [字段] 字面**）。
//
// v15e 架构 = 嵌套编辑宿主（为什么推翻 v15d 的「ZWSP + 输入后规整」）：
//   v15d 在单一 contentEditable 里用 ZWSP 撑空槽、每次 input 后 normalize（剔/补 ZWSP、
//   重设 textContent、重摆光标）。实测三个致命 bug（操作员截图 36bba60f/bfaef0b1）：
//     ① 中文 IME 合成期间改 DOM 文本 → 合成被打断，拼音串整段跳到编辑器最前面；
//     ② 光标其实落在槽外，打的字排在荧光区后面，不是「在框中」；
//     ③ 删槽内最后一个字时 Chromium 的删除目标区间会跨过槽边界 → 被「不可删」拦截误杀。
//   根因：在 IME 敏感的 contentEditable 里靠「输入后改文本」维持不变量，方向就错了。
//   v15e 结构性解决，全程**零文本改动**：
//     外层 <div contenteditable=true>            ← 字面文字，可编辑
//       字面文本节点 …
//       <span.oc-ph contenteditable=false>       ← 原子外壳：外层删除/选区跨不进、删不掉
//         <span.oc-ph-inner contenteditable=true>← 内芯编辑宿主：打字/IME 都在这里面
//       </span>
//       字面文本节点 …
//     · 内芯是独立编辑宿主：光标能落进空元素，选区/删除天然被宿主边界圈住——删到最后
//       一个字也不会把宿主删掉（浏览器保证），标签靠 [data-empty] 属性切换回显；
//     · 属性切换不动文本节点 → IME 合成零干扰（①②③ 全部结构性消除）；
//     · 外层 beforeinput 只做一件事：删除区间碰到 .oc-ph → preventDefault（+ 若是紧邻
//       退格/删除则把光标送进槽内，方便继续编辑）。内芯的删除事件 target 是内芯宿主，
//       天然区分，无需猜区间；
//     · MutationObserver 兜底：极端情况（IME 覆盖选区合成等不可取消输入）把槽整掉时，
//       按模板重建并按序回填已填内容（合成期间侦测到则推迟到 compositionend 再修）。
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
   * 模板（点卡片 / 示例时设入）。设入即把「字面文字 + 文本流内填空槽」渲染进编辑器；
   * 字面文字真实进 value、占位为槽内可输入的着色槽。null → 由 LeoComposer 走普通 textarea。
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

// 历史遗留的零宽空格清理（v15e 不再往 DOM 放 ZWSP，但序列化时仍剥一遍，防呆）。
const ZWSP = "\u200b";
const stripZwsp = (s: string) => s.split(ZWSP).join("");

// ── DOM 构建 ───────────────────────────────────────────────────────────────

/** 槽 = 原子外壳（CE=false，删不掉/选不进）+ 内芯编辑宿主（CE=true，打字/IME 在里面）。 */
function makePlaceholderSlot(hint: string): HTMLSpanElement {
  const wrap = document.createElement("span");
  wrap.className = "oc-ph";
  wrap.dataset.ph = "1";
  wrap.dataset.hint = hint;
  wrap.dataset.empty = "1";
  wrap.contentEditable = "false";

  const inner = document.createElement("span");
  inner.className = "oc-ph-inner";
  inner.contentEditable = "true";
  inner.spellcheck = false;

  wrap.appendChild(inner);
  return wrap;
}

/** 用模板段构造编辑器 DOM（字面 = 文本节点 + <br>；占位 = 嵌套槽）。返回槽节点数组。 */
function buildEditorDom(root: HTMLElement, template: string): HTMLSpanElement[] {
  root.textContent = "";
  const slots: HTMLSpanElement[] = [];
  for (const s of templateSegments(template)) {
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

// ── 序列化 / 槽状态 ─────────────────────────────────────────────────────────

// 把编辑器 DOM 序列化成 value：文本节点取 textContent；槽(.oc-ph)取其真实内容（= 内芯
// 文本；标签是 ::before，不在 textContent 里）；空槽 → ""（**不吐 [字段]**）；<br>→\n。
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

/** 只切换 data-empty 属性（决定 ::before 标签显隐）。不碰任何文本节点 → IME 零干扰。 */
function syncSlotEmptiness(slots: HTMLElement[]): void {
  for (const slot of slots) {
    if (!slot.isConnected) continue;
    const empty = stripZwsp(slot.textContent || "") === "";
    const marked = slot.dataset.empty !== undefined;
    if (empty && !marked) slot.dataset.empty = "1";
    else if (!empty && marked) delete slot.dataset.empty;
  }
}

// ── 光标工具 ────────────────────────────────────────────────────────────────

function innerOf(slot: HTMLElement): HTMLElement | null {
  return slot.querySelector<HTMLElement>(".oc-ph-inner");
}

/** 聚焦某槽的内芯并把光标放到 start / end。 */
function focusInner(inner: HTMLElement, at: "start" | "end"): void {
  inner.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(inner);
  range.collapse(at === "start");
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 把光标放到编辑器末尾。 */
function caretToEnd(root: HTMLElement) {
  root.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 光标落到第一个空槽的内芯；没有空槽则落到编辑器末尾。 */
function caretToFirstEmptySlot(root: HTMLElement) {
  const firstEmpty = root.querySelector<HTMLElement>(".oc-ph[data-empty]");
  const inner = firstEmpty ? innerOf(firstEmpty) : null;
  if (inner) focusInner(inner, "end");
  else caretToEnd(root);
}

/** beforeinput 的目标区间（规范 API，退化到当前 selection）。 */
function targetRangesOf(e: InputEvent): Range[] {
  const tr = typeof e.getTargetRanges === "function" ? e.getTargetRanges() : [];
  if (tr && tr.length) {
    return tr.map((sr) => {
      const r = document.createRange();
      r.setStart(sr.startContainer, sr.startOffset);
      r.setEnd(sr.endContainer, sr.endOffset);
      return r;
    });
  }
  const sel = window.getSelection();
  if (sel && sel.rangeCount) return [sel.getRangeAt(0)];
  return [];
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
    // 当前模板的槽节点（按序，= 模板里 [字段] 的顺序），供删除拦截 / 兜底复原用。
    const slotsRef = useRef<HTMLSpanElement[]>([]);
    // IME 合成中标志：合成期间绝不动 DOM（兜底修复推迟到 compositionend）。
    const composingRef = useRef(false);
    const pendingRestoreRef = useRef(false);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useImperativeHandle(ref, () => ({
      focus: () => edRef.current?.focus(),
      el: () => edRef.current,
    }));

    // 读 DOM → 切换标签显隐（纯属性）→ 上抛 value。
    const emit = useCallback(() => {
      const root = edRef.current;
      if (!root) return;
      syncSlotEmptiness(slotsRef.current);
      onChangeRef.current(readEditorValue(root));
    }, []);

    // 兜底修复：某槽被整体删掉（beforeinput 拦不到的不可取消输入）→ 按模板重建 + 回填。
    const restoreSlots = useCallback(() => {
      const root = edRef.current;
      const tmpl = seededTemplate.current;
      if (!root || tmpl == null) return;
      const old = slotsRef.current;
      const saved = old.map((s) => (s.isConnected ? stripZwsp(s.textContent || "") : ""));
      const fresh = buildEditorDom(root, tmpl);
      fresh.forEach((s, i) => {
        if (saved[i]) {
          const inner = innerOf(s);
          if (inner) inner.textContent = saved[i];
        }
      });
      slotsRef.current = fresh;
      syncSlotEmptiness(fresh);
      onChangeRef.current(readEditorValue(root));
    }, []);

    const seed = useCallback((tmpl: string) => {
      const root = edRef.current;
      if (!root) return;
      slotsRef.current = buildEditorDom(root, tmpl);
      syncSlotEmptiness(slotsRef.current);
      seededTemplate.current = tmpl;
      const v = readEditorValue(root);
      onChangeRef.current(v);
      // 光标落到**第一个空槽的内芯**（用户第一件事就是填第一个空）。
      requestAnimationFrame(() => {
        if (edRef.current) caretToFirstEmptySlot(edRef.current);
      });
    }, []);

    // 模板变化（点了新卡片/示例）→ 重建编辑器 DOM。
    useEffect(() => {
      if (template == null) return;
      if (seededTemplate.current === template) return;
      seed(template);
    }, [template, seed]);

    // 「点同一张卡再来一次」：调用方点卡片时会先把 value 置空。若此时编辑器里仍有真实内容
    // 且模板未变（上面的 effect 不会重跑），这里重新 seed 当前模板。
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
    }, [value, template, seed]);

    useEffect(() => {
      if (autoFocus) edRef.current?.focus();
    }, [autoFocus]);

    // ── 事件绑定（原生，一次挂在外层 root 上；内芯事件冒泡上来，靠 e.target 区分）──
    useEffect(() => {
      const root = edRef.current;
      if (!root) return;

      // IME 合成跟踪：合成期间不做任何 DOM 修复；结束后补跑。
      const onCompStart = () => {
        composingRef.current = true;
      };
      const onCompEnd = () => {
        composingRef.current = false;
        if (pendingRestoreRef.current) {
          pendingRestoreRef.current = false;
          restoreSlots();
        } else {
          emit();
        }
      };

      // 点标签区域（::before 命中的是外壳）→ 把光标送进内芯（空槽也能一点即入）。
      const onMouseDown = (ev: MouseEvent) => {
        const t = ev.target as HTMLElement | null;
        if (!t) return;
        if (t.closest(".oc-ph-inner")) return; // 点到内芯文字：浏览器原生落光标
        const wrap = t.closest<HTMLElement>(".oc-ph");
        if (!wrap) return;
        const inner = innerOf(wrap);
        if (!inner) return;
        ev.preventDefault();
        focusInner(inner, "end");
      };

      // 删除守卫（只管外层编辑；内芯的编辑事件 target 是内芯宿主，天然被宿主边界圈住）：
      //   · 内芯里：只拦「换行」（填空是单行语义），删除/输入全放行——删到最后一个字
      //     也只是清空内芯，宿主元素浏览器保证不删；
      //   · 外层里：删除区间碰到任何槽 → preventDefault；若是紧邻槽的收缩退格/删除，把
      //     光标送进槽内芯（方便用户接着改填的内容）。
      const onBeforeInput = (ev: Event) => {
        const e = ev as InputEvent;
        const t = e.inputType || "";
        const targetEl = e.target as HTMLElement | null;
        const inInner = !!targetEl?.closest?.(".oc-ph-inner");
        if (inInner) {
          if (t === "insertParagraph" || t === "insertLineBreak") e.preventDefault();
          return;
        }
        if (!t.startsWith("delete") || t === "deleteCompositionText") return;
        const slots = slotsRef.current;
        if (!slots.length) return;
        for (const r of targetRangesOf(e)) {
          for (const slot of slots) {
            if (!slot.isConnected) continue;
            let hit = false;
            try {
              hit = r.intersectsNode(slot);
            } catch {
              hit = false;
            }
            if (!hit) continue;
            e.preventDefault();
            // 紧邻收缩删除 → 光标进槽（退格=槽尾，Delete=槽头），第二次按键即编辑填内容。
            const sel = window.getSelection();
            if (sel && sel.isCollapsed) {
              const inner = innerOf(slot);
              if (inner && stripZwsp(slot.textContent || "") !== "") {
                focusInner(inner, t === "deleteContentBackward" ? "end" : "start");
              }
            }
            return;
          }
        }
      };

      const onInput = () => {
        emit();
      };

      root.addEventListener("compositionstart", onCompStart);
      root.addEventListener("compositionend", onCompEnd);
      root.addEventListener("mousedown", onMouseDown);
      root.addEventListener("beforeinput", onBeforeInput);
      root.addEventListener("input", onInput);
      return () => {
        root.removeEventListener("compositionstart", onCompStart);
        root.removeEventListener("compositionend", onCompEnd);
        root.removeEventListener("mousedown", onMouseDown);
        root.removeEventListener("beforeinput", onBeforeInput);
        root.removeEventListener("input", onInput);
      };
    }, [emit, restoreSlots]);

    // 兜底：槽被整体删掉（不可取消输入等极端路径）→ 重建回填；合成期间侦测到则推迟。
    useEffect(() => {
      const root = edRef.current;
      if (!root) return;
      const obs = new MutationObserver(() => {
        const slots = slotsRef.current;
        if (!slots.length) return;
        if (!slots.some((s) => !s.isConnected)) return;
        if (composingRef.current) {
          pendingRestoreRef.current = true;
          return;
        }
        obs.disconnect();
        restoreSlots();
        obs.observe(root, { childList: true, subtree: true });
      });
      obs.observe(root, { childList: true, subtree: true });
      return () => obs.disconnect();
    }, [restoreSlots]);

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
          onKeyDown={(e) => onKeyDown?.(e as unknown as ReactKeyboardEvent<HTMLElement>)}
          className="oc-tmpl-editor relative w-full resize-none overflow-y-auto border-0 bg-transparent text-neutral-800 outline-none"
          // accent 作为 CSS 变量下发给 .oc-ph 槽 / ::before 标签配色（见 theme/globals.css）。
          style={{ ...TYPO, minHeight: `${rows * 1.625}em`, maxHeight, ["--oc-ph-accent" as string]: accentColor }}
        />
      </div>
    );
  },
);

/** 别名（宗旨 v15 新名字；语义即「模板实填 + 文本流内填空槽」）。 */
export const TemplateFillArea = PromptHighlightArea;

// 参考规范（嵌套编辑宿主 / beforeinput / 幽灵标签的实现依据）：
//   W3C Input Events L2 — https://www.w3.org/TR/input-events/（editing host / target 定义）
//   MDN beforeinput / getTargetRanges — developer.mozilla.org
//   HTML spec editing host（嵌套 contenteditable 宿主边界）— html.spec.whatwg.org/#editing-host
//   contenteditable placeholder via ::before — stackoverflow.com/questions/20726174
