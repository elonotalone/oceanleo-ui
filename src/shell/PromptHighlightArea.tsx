"use client";

// ============================================================================
// @oceanleo/ui — TemplateFillArea（模板「实填 + 文本流内填空槽」输入区，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v15（操作员 2026-07-05 多次拍板；本版 = v15f 定版，「单一编辑宿主」架构）：
//
//   点 prompt 卡片 / 导航示例后，模板文案**实打实填进输入框**——字面文字是真实、可编辑、
//   可选中、可提交的字符；`[字段]` 是一个**文本流内的着色填空槽**：
//     · 【在框中输入】——光标点进槽里，打字/中文输入法都发生在**槽内部**，字在句子里
//        原地出现、标签消失、后文顺移（豆包「帮我写作」范式）；
//     · 【不可选】——蓝色 [标签] 是 CSS ::before content，拖蓝/双击选不到、不进 value；
//     · 【不可删】——槽本体删不掉：删除动作要把整壳带走 / 删 ZWSP 一律拦截；槽内删自己
//        填的字照常（含最后一个字）；删到空也只清空、槽本身还在（标签回显）；
//     · 【清空即回显】——槽里的字删空 → 蓝色 [标签] 自动回来；
//     · 【空槽不进 value】——空槽序列化为 ""（**绝不吐 [字段] 字面**）。
//
// v15f 架构 = 单一 editing host（为什么推翻 v15e 的「嵌套编辑宿主」）：
//   v15e 用「外壳 CE=false 套内芯 CE=true」，让每个槽成为独立 editing host。实测 v0.92.1
//   后 IME 跳页首 + 末字删不掉仍在。查实（W3C editing #528、AWS Cloudscape prompt-input
//   生产源码、CKEditor #15682 + Chromium #1522876、contenteditable scenarios）：
//     ① 多 editing host 触发 Chromium「中文 IME 快速输入 compositionstart 落 host A、
//        compositionend 落 host B」→ 拼音跳到别处（= IME 跳页首）；
//     ② 嵌套时 getTargetRanges() 会指向**外层**宿主 → 删除守卫误判 → 末字删不掉。
//   业界一致做法（Slate/Lexical/ProseMirror/Cloudscape）= **单一 editing host**：
//     外层 <div contenteditable=true>        ← **唯一** editing host（字面 + 槽都在这里）
//       字面文本节点 …
//       <span.oc-ph data-empty>              ← 占位槽：**不设** contenteditable（继承 =true）
//           "\u200b"                          ← 空槽放一个 ZWSP 当 caret 落点；标签是 ::before
//       </span>
//       字面文本节点 …
//     · 只有一个 host → 无跨 host IME 跳页、getTargetRanges 恒指向本 host、删除天然在内；
//     · 标签 = .oc-ph[data-empty]::before（伪元素，不可选/不进 value）；打字/删除**零文本
//        改动**（ZWSP 常驻不删不补），只由 syncSlotEmptiness 切 data-empty → 标签显隐，
//        属性变化不打断 IME 合成（这是与 v15d「输入后 normalize 改文本」的根本区别）；
//     · beforeinput 删除守卫：仅当区间「完全落在槽真实文本里、越过 offset0 的 ZWSP」才放行
//        （删自己填的字，含末字）；其余碰到槽（删 ZWSP / 空槽退格 / 从外把整壳带走）→
//        preventDefault。单 host 下 getTargetRanges 可靠，无需猜跨界；
//     · MutationObserver 仅兜极端「不可取消输入把整槽删掉」，合成期间推迟到 compositionend。
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

// 零宽空格：空槽里放一个当 caret 落点（Cloudscape「caret spot」同款）。运行期常驻不动，
// 只在序列化时剥掉 → 不进 value、视觉无感。
const ZWSP = "\u200b";
const stripZwsp = (s: string) => s.split(ZWSP).join("");

// ── DOM 构建 ───────────────────────────────────────────────────────────────

/** 槽 = 单一编辑宿主（外层 div）内的一段**普通可编辑区间**——**不设 contenteditable**
 * （继承外层 =true），**绝不嵌套第二个 editing host**（那会触发 Chromium 的多-host IME
 * 跳位 + getTargetRanges 错乱，见文档 §8 v15f）。
 *   · 空槽：唯一子节点是一个 ZWSP 文本节点（给 caret 落点）；幽灵标签 [字段] 靠
 *     `.oc-ph[data-empty]::before` 画（伪元素：不可选、不进 value）。
 *   · 打字：真实字符追加进本 span（与 ZWSP 同域）；`syncSlotEmptiness` 据「去 ZWSP 后非空」
 *     切掉 data-empty → 标签消失。全程零文本改动（ZWSP 不删不补）。 */
function makePlaceholderSlot(hint: string): HTMLSpanElement {
  const wrap = document.createElement("span");
  wrap.className = "oc-ph";
  wrap.dataset.ph = "1";
  wrap.dataset.hint = hint; // 标签文字（::before 用）
  wrap.dataset.empty = "1";
  wrap.appendChild(document.createTextNode(ZWSP));
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

/** 只切换 data-empty 属性（决定 ::before 标签显隐）。据「去 ZWSP 后是否为空」判定。
 * 不碰任何文本节点（ZWSP 常驻）→ IME 零干扰。 */
function syncSlotEmptiness(slots: HTMLElement[]): void {
  for (const slot of slots) {
    if (!slot.isConnected) continue;
    const empty = stripZwsp(slot.textContent || "") === "";
    const marked = slot.dataset.empty !== undefined;
    if (empty && !marked) slot.dataset.empty = "1";
    else if (!empty && marked) delete slot.dataset.empty;
  }
}

/** 确保槽里至少有那个 ZWSP caret 落点（极端删除后兜底补回；正常路径不会触发）。 */
function ensureCaretSpot(slot: HTMLElement): void {
  if (!slot.isConnected) return;
  if ((slot.textContent || "") === "") slot.appendChild(document.createTextNode(ZWSP));
}

// ── 光标工具 ────────────────────────────────────────────────────────────────

/** 把光标放进槽内（同一个 editing host，不 focus 别的元素）。空槽=ZWSP 之后（at=end）
 * 或之前（at=start）；有内容槽=内容尾/头。 */
function caretIntoSlot(root: HTMLElement, slot: HTMLElement, at: "start" | "end"): void {
  root.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(slot);
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

/** 光标落到第一个空槽（ZWSP 之后）；没有空槽则落到编辑器末尾。 */
function caretToFirstEmptySlot(root: HTMLElement) {
  const firstEmpty = root.querySelector<HTMLElement>(".oc-ph[data-empty]");
  if (firstEmpty) caretIntoSlot(root, firstEmpty, "end");
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

/** 判断一个删除目标区间是否「只删本槽的真实文本」（→ 应放行）：
 *   两端都落在**本槽内部**，且不触及那个 ZWSP caret 落点（槽首文本节点 offset 0）。
 * 槽结构恒为「单一文本节点 = ZWSP(offset0) + 真实字符(1..n)」（运行期不改结构），故：
 *   - 起容器 = 槽首文本节点且 startOffset ≥ 1 → 删的是真实字符（含最后一个），放行；
 *   - 起容器不是槽内文本 / startOffset = 0（要删 ZWSP）/ 终点越出槽 → 不放行（拦）。 */
function deletionHitsOnlyRealText(r: Range, slot: HTMLElement): boolean {
  const first = slot.firstChild; // ZWSP-bearing 文本节点
  if (!first || first.nodeType !== Node.TEXT_NODE) return false;
  const within = (n: Node | null) => !!n && (n === first || (slot.contains(n) && n.nodeType === Node.TEXT_NODE));
  if (!within(r.startContainer) || !within(r.endContainer)) return false;
  // 起点必须越过 offset 0 的 ZWSP（否则会把 caret 落点删掉 → 拦）。
  if (r.startContainer === first && r.startOffset < 1) return false;
  return true;
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
        if (saved[i]) s.appendChild(document.createTextNode(saved[i])); // ZWSP 在前 + 回填文本
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
      // 光标落到**第一个空槽**（ZWSP 之后；用户第一件事就是填第一个空）。
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

    // ── 事件绑定（原生，一次挂在**唯一** editing host = 外层 root 上）──────────────
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

      // 点槽（::before 标签 / ZWSP 区域）→ 光标 collapse 进槽（同一个 host，不 focus 别的
      // 元素）。空槽也能一点即入；点到槽里已填的真实文字则交给浏览器原生落点。
      const onMouseDown = (ev: MouseEvent) => {
        const t = ev.target as HTMLElement | null;
        if (!t) return;
        const slot = t.closest<HTMLElement>(".oc-ph");
        if (!slot) return;
        // 只有空槽（点在 ::before 标签上，命中的是槽元素本身）才需要手动入槽；有内容槽
        // 点在文本上，浏览器已能精确落点，放行。
        if (stripZwsp(slot.textContent || "") !== "" && t !== slot) return;
        ev.preventDefault();
        caretIntoSlot(root, slot, "end");
      };

      // 删除守卫（单一 host → getTargetRanges 恒可靠）：
      //   · 只拦换行（填空是单行语义）；
      //   · 删除时逐槽看目标区间——**仅当区间完全落在某槽的真实文本里（越过 ZWSP）**才放行
      //     （删自己填的字）；其余但凡碰到槽（要删 ZWSP / 空槽退格 / 从槽外把整壳带走）
      //     一律 preventDefault → 槽删不掉、标签回显、末字可删（区间在槽内即放行）。
      const onBeforeInput = (ev: Event) => {
        const e = ev as InputEvent;
        const t = e.inputType || "";
        if (t === "insertParagraph" || t === "insertLineBreak") {
          e.preventDefault();
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
            // 区间是否 = 「只删本槽真实文本里的字符」：两端都在本槽内，且不触及 offset 0
            // 那个 ZWSP（槽的单一文本节点里 ZWSP 在 offset 0，真实字符在 1..n）。
            if (deletionHitsOnlyRealText(r, slot)) return; // 放行：删自己填的字（含末字）
            e.preventDefault(); // 拦：删不掉槽本身 / 不删 ZWSP / 不跨壳
            // 紧邻收缩删除且槽里有真实内容 → 光标送进槽（退格=尾、Delete=头），第二下就改内容。
            const sel = window.getSelection();
            if (sel && sel.isCollapsed && stripZwsp(slot.textContent || "") !== "") {
              caretIntoSlot(root, slot, t === "deleteContentBackward" ? "end" : "start");
            }
            return;
          }
        }
      };

      const onInput = () => {
        // 极端兜底：某槽被删空（ZWSP 都没了）→ 补回 caret spot，保住标签回显与落点。
        for (const s of slotsRef.current) ensureCaretSpot(s);
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

// 参考规范/生产实现（单一编辑宿主 + ZWSP caret spot + ::before 幽灵标签的依据）：
//   W3C editing #528 — 空占位 + ::before + 单 caret 位（github.com/w3c/editing/issues/528）
//   AWS Cloudscape prompt-input token-renderer — 单 host + CE=false 原子 + ZWSP caret spot
//     （github.com/cloudscape-design/components，生产级实现）
//   W3C Input Events L2 — beforeinput / getTargetRanges（www.w3.org/TR/input-events/）
//   多 host IME 跳位实锤 — CKEditor #15682 + Chromium #1522876
//   嵌套 host 的 getTargetRanges 陷阱 — contenteditable scenarios（realerror.com）
