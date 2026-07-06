"use client";

// ============================================================================
// @oceanleo/ui — TemplateFillArea（模板「实填 + [占位] 荧光块」输入区，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v15i 定版（2026-07-06；Tiptap/ProseMirror 高亮 Mark，推翻 v15h atom 节点与 v15a–g 自研）：
//
//   点 prompt 卡片 / 导航示例后，模板文案填进一个 Tiptap 富文本编辑器：
//     · 字面文字 = 普通可编辑文本；
//     · `[字段]` 之间的文字打上 **promptSlot 高亮 Mark**（非原子）→ 荧光块。染色的是**普通可
//        编辑文本**：光标能进、能打字、能全选删、IME 原生、undo 原生（零守卫）。
//     · **未填**（empty）= 浅蓝荧光 + 内容 == hint（占位提示，如「周报或月报」，不显方括号）；
//       **已填** = 深蓝荧光 + 内容 = 用户输入。翻转由 Mark 的幂等 appendTransaction 自动完成
//       （文本 != hint 即转深蓝），不拦截输入。
//     · 点未填荧光块 → 选中整段提示文字（TextSelection 覆盖）→ 用户一打字/一拼音 = 原生替换
//        选区（光标真正在文本里，非画的假竖线）→ 内容变、自动转深蓝荧光。
//
//   为什么 Mark 而非 atom（v15h 被操作员打回）/ 自研 contentEditable（v15a–g 全踩坑）：见
//     promptSlotNode.ts 顶部注释。核心：Mark = 染色普通文本 → 光标/删除/全选/IME/undo 全原生。
//
//   非受控 + 保 undo：Tiptap useEditor 自持状态，仅 onUpdate 上抛序列化值。灌模板用
//     insertContent（进 undo 历史，删荧光块后 Ctrl+Z 可回退，修操作员 2026-07-06 诉求）；
//     **不再用 setContent 命令式重建 doc**（那会清空 undo 栈）。外部 value 变空才 clearContent。
//
// value 契约：未填 slot run 吐 `[hint]` 字面（AI 侧理解占位）；已填吐真实文本；无 mark 照吐。
// 兼容：导出名 PromptHighlightArea（+ 别名 TemplateFillArea）、Handle（focus/el，el() 返回编辑器
//   根 DOM）、templateSegments / highlightSegments / stripPromptPlaceholders。
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
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Placeholder from "@tiptap/extension-placeholder";
import History from "@tiptap/extension-history";
import { PromptSlot, PROMPT_SLOT_NAME } from "./promptSlotNode";

// 方括号占位符：`[任意非中括号、非换行字符]`。
const TOKEN_RE = /\[[^\[\]\n]+\]/g;

type Seg =
  | { kind: "lit"; text: string }
  | { kind: "placeholder"; text: string };

/** 把文本拆成交替的「字面段」「占位段」（占位 = `[..]`，含方括号）。 */
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
/** @deprecated value 天然由 docToPlain 产出；保留 no-op 语义为兼容。 */
export function stripPromptPlaceholders(text: string, _template?: string | null): string {
  void _template;
  return text;
}

/** 挂在编辑器根 DOM 上的读写桥（leo 助手只能拿到 DOM，借此读/写主输入框内容）。 */
export interface OcEditorBridge {
  __ocGetText?: () => string;
  __ocSetText?: (v: string) => void;
}

export interface PromptHighlightAreaHandle {
  focus: () => void;
  /** 暴露编辑器根 DOM（供 LeoComposer 挂 data-attr / leo 助手锚点）。 */
  el: () => HTMLElement | null;
  /** 取当前纯文本值（= 提交值：字面 + 未填占位吐 [hint]）。供 leo 读输入框内容。 */
  getText: () => string;
  /** 命令式写入纯文本（作为普通可编辑文本，进 undo 历史）。供 leo「导入/替换到输入框」。 */
  setText: (v: string) => void;
  /** 取编辑器内当前选中的纯文本（供 leo 划词读编辑器选区）。 */
  getSelectedText: () => string;
}
export type TemplateFillAreaHandle = PromptHighlightAreaHandle;

export interface PromptHighlightAreaProps {
  value: string;
  onChange: (value: string) => void;
  /** 模板（点卡片 / 示例时设入）。设入即把模板解析成「字面文本 + [占位]荧光 mark」灌进编辑器。
   * null → 由 LeoComposer 走它自己的普通 textarea。 */
  template: string | null;
  accentColor?: string;
  placeholder?: string;
  rows?: number;
  maxHeight?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
}
export type TemplateFillAreaProps = PromptHighlightAreaProps;

// ── 模板 → 编辑器内容 / doc → value 转换 ─────────────────────────────────────

type SlotPiece =
  | { kind: "text"; text: string }
  | { kind: "slot"; hint: string };

/** 模板字符串 → 有序片段（字面文本 / 占位）。换行折成空格（模板本是单段引导语）。 */
function templatePieces(template: string): SlotPiece[] {
  const pieces: SlotPiece[] = [];
  for (const s of templateSegments(template)) {
    if (s.kind === "placeholder") {
      pieces.push({ kind: "slot", hint: s.text.slice(1, -1) });
    } else {
      const txt = s.text.replace(/\n/g, " ");
      if (txt) pieces.push({ kind: "text", text: txt });
    }
  }
  return pieces;
}

/** 编辑器 doc → 提交用纯文本：文本节点取字符；带 promptSlot mark 且 empty 的 run 吐 `[hint]`；段落间换行。 */
function docToPlain(editor: Editor): string {
  let out = "";
  editor.state.doc.forEach((block, _off, index) => {
    if (index > 0) out += "\n";
    let pendingEmptyHint: string | null = null;
    block.forEach((child) => {
      if (!child.isText) {
        if (pendingEmptyHint != null) {
          out += `[${pendingEmptyHint}]`;
          pendingEmptyHint = null;
        }
        return;
      }
      const slot = child.marks.find((mk) => mk.type.name === PROMPT_SLOT_NAME);
      if (slot && slot.attrs.empty) {
        // 未填占位：整段 run 折成 `[hint]`（相邻同 hint 的 text 节点合并只吐一次）。
        const hint = (slot.attrs.hint as string) || "";
        if (pendingEmptyHint != null && pendingEmptyHint !== hint) out += `[${pendingEmptyHint}]`;
        pendingEmptyHint = hint;
      } else {
        if (pendingEmptyHint != null) {
          out += `[${pendingEmptyHint}]`;
          pendingEmptyHint = null;
        }
        out += child.text || "";
      }
    });
    if (pendingEmptyHint != null) out += `[${pendingEmptyHint}]`;
  });
  return out;
}

// 编辑器排版（与 LeoComposer 普通 textarea 的 px-5 pt-5 pb-2 text-[15px] leading-relaxed 对齐）。
const TYPO: CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.625",
  fontFamily: "inherit",
  fontWeight: 400,
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
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onKeyDownRef = useRef(onKeyDown);
    onKeyDownRef.current = onKeyDown;
    const seededTemplate = useRef<string | null>(null);
    const applyingRef = useRef(false);

    const editor = useEditor({
      immediatelyRender: false,
      editable: !disabled,
      extensions: [
        Document,
        Paragraph,
        Text,
        History, // undo/redo（此前漏装 = Ctrl+Z 完全无效的真正根因，2026-07-06 修）
        PromptSlot,
        Placeholder.configure({
          placeholder: placeholder || "",
          showOnlyWhenEditable: true,
        }),
      ],
      editorProps: {
        attributes: {
          class: "oc-slot-editor",
          role: "textbox",
          "aria-multiline": "true",
          spellcheck: "false",
        },
        // 点未填荧光块 → 选中整段提示文字（TextSelection 覆盖该 run）。一打字/一拼音 = 原生替换。
        handleClickOn: (view, _pos, _node, _nodePos, event) => {
          const target = (event.target as HTMLElement).closest?.("span.oc-slot[data-empty='1']");
          if (!target) return false;
          // 找到点中的 empty slot run 的 from/to，选中它。
          const found = findSlotRunAtDom(view, target as HTMLElement);
          if (found) {
            const tr = view.state.tr.setSelection(
              TextSelection.create(view.state.doc, found.from, found.to),
            );
            view.dispatch(tr);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        if (applyingRef.current) return;
        onChangeRef.current(docToPlain(editor));
      },
    });

    useImperativeHandle(ref, () => ({
      focus: () => editor?.commands.focus(),
      el: () => (editor ? (editor.view.dom as HTMLElement) : null),
      getText: () => (editor ? docToPlain(editor) : ""),
      setText: (v: string) => {
        if (!editor) return;
        // 作为普通可编辑文本整体替换（可 undo）；换行拆多段落。灌完把已 seed 的模板记录清掉，
        // 使之后模板 effect 不冲突（leo 导入=用户内容，不再是模板态）。
        const paras = (v || "").split("\n");
        editor
          .chain()
          .selectAll()
          .insertContent({
            type: "doc",
            content: paras.map((line) => ({
              type: "paragraph",
              content: line ? [{ type: "text", text: line }] : undefined,
            })),
          })
          .focus("end")
          .run();
        seededTemplate.current = null;
        onChangeRef.current(docToPlain(editor));
      },
      getSelectedText: () => {
        if (!editor) return "";
        const { from, to, empty } = editor.state.selection;
        if (empty) return "";
        // promptSlot 是 mark（染色的普通文本），textBetween 直接返回可见文字。
        return editor.state.doc.textBetween(from, to, "\n");
      },
    }));

    useEffect(() => {
      if (!editor) return;
      const dom = editor.view.dom as HTMLElement;
      dom.style.setProperty("--oc-ph-accent", accentColor);
      dom.style.maxHeight = `${maxHeight}px`;
      dom.setAttribute("data-oc-slot-editor", ""); // 供 leo 识别「这是主输入框」（非 textarea）
      // 把读/写桥接函数挂到 DOM 上：leo 助手只拿得到 DOM 元素（拿不到 React handle），
      // 通过这两个属性读输入框内容 / 写回（作为普通文本，走编辑器事务）。
      const bridged = dom as HTMLElement & OcEditorBridge;
      bridged.__ocGetText = () => docToPlain(editor);
      bridged.__ocSetText = (v: string) => {
        const paras = (v || "").split("\n");
        editor
          .chain()
          .selectAll()
          .insertContent({
            type: "doc",
            content: paras.map((line) => ({
              type: "paragraph",
              content: line ? [{ type: "text", text: line }] : undefined,
            })),
          })
          .focus("end")
          .run();
        seededTemplate.current = null;
        onChangeRef.current(docToPlain(editor));
      };
      // min-height 交给 CSS（.oc-slot-editor）统一预留 2 行，避免挂载前后跳变/闪矮框。
    }, [editor, accentColor, maxHeight]);

    // 灌模板：全选 → 用模板内容替换整个文档（一个自然的可 undo 事务，弃 setContent 以保 undo 栈）。
    // **不自动选中任何荧光块**（操作员要求：点卡片后不能默认勾选第一个块）。灌完把光标收拢到末尾
    // 并聚焦（普通折叠光标、正常颜色），你想改哪个荧光块自己去点。
    const seed = useCallback(
      (tmpl: string) => {
        if (!editor) return;
        applyingRef.current = true;
        const content = templatePieces(tmpl).map((p) =>
          p.kind === "slot"
            ? {
                type: "text" as const,
                text: p.hint,
                marks: [{ type: PROMPT_SLOT_NAME, attrs: { hint: p.hint, empty: true } }],
              }
            : { type: "text" as const, text: p.text },
        );
        editor
          .chain()
          .selectAll()
          .insertContent(
            { type: "paragraph", content: content.length ? content : undefined },
            { updateSelection: true },
          )
          .setTextSelection(editor.state.doc.content.size) // 折叠光标到末尾，不选中任何块
          .run();
        seededTemplate.current = tmpl;
        applyingRef.current = false;
        onChangeRef.current(docToPlain(editor));
      },
      [editor],
    );

    // 灌模板：**只在 template 值真正变化时灌一次**。灌完之后编辑器完全自持——用户的删除/
    // 输入/undo 全不再触发回灌（修操作员 2026-07-06 两个致命 bug：删第一个字整段复活、Ctrl+Z
    // 回不去。根因正是旧版「监听 value 变空就重灌模板」的 effect 在和用户编辑打架，现已删除）。
    // template 变 null（调用方想「重来/切回空」）→ 复位 seededTemplate，使下次同模板也能重新灌。
    useEffect(() => {
      if (!editor) return;
      if (template == null) {
        seededTemplate.current = null;
        return;
      }
      if (seededTemplate.current === template) return;
      seed(template);
    }, [editor, template, seed]);

    // 外部 value 被改（无模板的纯文本场景，调用方程序化改 value）→ 同步进编辑器。**只在无模板时**
    // 生效（有模板时一切以编辑器自持为准，绝不按纯文本覆盖，否则毁 slot mark + 破坏 undo）。
    useEffect(() => {
      if (!editor || applyingRef.current) return;
      if (template != null) return;
      const current = docToPlain(editor);
      if (value !== current) {
        applyingRef.current = true;
        editor.commands.setContent(
          value
            ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] }
            : { type: "doc", content: [{ type: "paragraph" }] },
          { emitUpdate: false },
        );
        applyingRef.current = false;
      }
    }, [editor, value, template]);

    useEffect(() => {
      if (editor && autoFocus) editor.commands.focus();
    }, [editor, autoFocus]);

    const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
      onKeyDownRef.current?.(e as unknown as ReactKeyboardEvent<HTMLElement>);
    };

    return (
      <div
        className={`oc-slot-wrap relative ${className}`}
        style={{ ...TYPO }}
        onKeyDown={handleKeyDown}
      >
        <EditorContent editor={editor} />
      </div>
    );
  },
);

// ── helpers：定位 slot mark run 的文档区间 ─────────────────────────────────────

/** 根据点中的 DOM span，反查它对应的 slot mark run 在文档里的 from/to。 */
function findSlotRunAtDom(
  view: { posAtDOM: (dom: Node, offset: number) => number; state: Editor["state"] },
  dom: HTMLElement,
): { from: number; to: number } | null {
  let pos: number;
  try {
    pos = view.posAtDOM(dom, 0);
  } catch {
    return null;
  }
  const $pos = view.state.doc.resolve(Math.min(pos + 1, view.state.doc.content.size));
  const node = $pos.parent;
  // 在该文本块里找覆盖 pos 的 empty slot run。
  let result: { from: number; to: number } | null = null;
  node.forEach((child, offset) => {
    if (result || !child.isText) return;
    const m = child.marks.find((mk) => mk.type.name === PROMPT_SLOT_NAME && mk.attrs.empty);
    if (!m) return;
    const start = $pos.start() + offset;
    const end = start + child.nodeSize;
    if (pos >= start - 1 && pos <= end) result = { from: start, to: end };
  });
  return result;
}

/** 别名（宗旨 v15 新名字；语义即「模板实填 + [占位] 荧光块」）。 */
export const TemplateFillArea = PromptHighlightArea;

// 参考实现（变量高亮 = Mark 染普通可编辑文本，业界通行）：
//   Tiptap Mark API（addAttributes/inclusive/renderHTML）+ appendTransaction 改 mark 属性
//   ProseMirror：removeMark+addMark 改 mark attrs（discuss.prosemirror #776）；TextSelection 选 run
//   Notion / 飞书 / 豆包「变量填空」交互：占位=可被选中替换的提示文本，填后仍高亮
