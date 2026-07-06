"use client";

// ============================================================================
// @oceanleo/ui — TemplateFillArea（模板「实填 + [占位] 原子块」输入区，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v15h 定版（2026-07-06；用 Tiptap/ProseMirror 原子节点，彻底替代自研 contentEditable
// / textarea 镜像 的 v15a–g）：
//
//   点 prompt 卡片 / 导航示例后，模板文案填进一个 Tiptap 富文本编辑器：
//     · 字面文字 = 普通可编辑文本（可全选删、可反悔、可随意改）；
//     · `[字段]` = **原子占位节点 promptSlot**（inline+atom）：浅蓝色、**不可分割**——
//        光标跳过、不能进内部、删就整块删（绝不删出 `[主题` 半截，修 5ef085cf）；
//     · 点占位 → NodeSelection 整块选中（视觉：左侧一条蓝 caret，「像可直接输入」，只为
//        美观，符合操作员「光标只为美观」）；
//     · 一打字 → NodeSelection 下 insertText **原生整块替换**为普通文本（方括号连节点一起
//        消失，变正常蓝色可编辑字，修 de0a2106「输入即去括号」）。
//
//   为什么用 Tiptap 而非继续自研（操作员要求「用成熟库、别在小问题反复」）：
//     「插入变量作为不可分割整体」= 业界 mention/token/atom 节点标准问题。Lexical/Tiptap/
//     ProseMirror 均以 `inline:true+atom:true` 原生提供「整体删/光标跳过/不可进内部/复制带
//     数据」。中文 IME + 原子节点的历史坑（Tiptap #6982 等）这些库已在**库层**打了补丁，
//     用库 = 白嫖它们几年的踩坑。自研 contentEditable（v15a–f）必然重复这些坑。Tiptap =
//     ProseMirror 之上的成熟封装、React 官方绑定、MIT、生态最大、文档最好。
//
//   非受控（业界铁律）：富文本编辑器**不能当受控 React 组件**（value+onChange 每次 re-render
//     会毁光标/选区/IME）。这里用 Tiptap useEditor 自持状态，仅在 onUpdate 时把序列化值上抛
//     onChange；外部 value 变空（点卡片重来）时才命令式重建 doc。
//
// value 契约：编辑器序列化 = 字面文本 + 未替换占位吐 `[hint]` 字面（AI 侧理解占位）；已替换
//   的占位就是普通文本。提交无需再清洗。
//
// 回退：无模板（普通输入框）时 LeoComposer 用它自己的原生 textarea（不渲染本组件）。
// 兼容：保留导出名 PromptHighlightArea（+ 别名 TemplateFillArea）、Handle（focus/el，el()
//   返回编辑器根 DOM）、templateSegments / highlightSegments / stripPromptPlaceholders。
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
import type { Editor, JSONContent } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Placeholder from "@tiptap/extension-placeholder";
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
/** @deprecated value 天然由 getPlainValue 产出；保留 no-op 语义为兼容。 */
export function stripPromptPlaceholders(text: string, _template?: string | null): string {
  void _template;
  return text;
}

export interface PromptHighlightAreaHandle {
  focus: () => void;
  /** 暴露编辑器根 DOM（供 LeoComposer 挂 data-attr / leo 助手锚点）。 */
  el: () => HTMLElement | null;
}
export type TemplateFillAreaHandle = PromptHighlightAreaHandle;

export interface PromptHighlightAreaProps {
  value: string;
  onChange: (value: string) => void;
  /** 模板（点卡片 / 示例时设入）。设入即把模板解析成「字面文本 + [占位]原子节点」灌进编辑器。
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

// ── 模板 ⇄ ProseMirror doc / value 转换 ─────────────────────────────────────

/** 模板字符串 → 单段落 doc 的 inline 内容（字面 = text 节点；[占位] = promptSlot 原子节点）。
 * 多行按 hardBreak 处理不了（我们没引 hardBreak 扩展），故换行折成空格——模板本就是单段引导语。 */
function templateToDoc(template: string): JSONContent {
  const inline: JSONContent[] = [];
  for (const s of templateSegments(template)) {
    if (s.kind === "placeholder") {
      const hint = s.text.slice(1, -1); // 去掉外层方括号
      inline.push({ type: PROMPT_SLOT_NAME, attrs: { hint } });
    } else {
      const txt = s.text.replace(/\n/g, " ");
      if (txt) inline.push({ type: "text", text: txt });
    }
  }
  return { type: "doc", content: [{ type: "paragraph", content: inline }] };
}

/** 编辑器 doc → 提交用纯文本：文本节点取字符；未替换的 promptSlot 吐 `[hint]` 字面；段落间换行。 */
function docToPlain(editor: Editor): string {
  let out = "";
  editor.state.doc.forEach((block, _off, index) => {
    if (index > 0) out += "\n";
    block.forEach((child) => {
      if (child.type.name === PROMPT_SLOT_NAME) out += `[${child.attrs.hint as string}]`;
      else if (child.isText) out += child.text || "";
    });
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
    // 记录已按哪个模板灌过，避免重复重建。
    const seededTemplate = useRef<string | null>(null);
    // 防止「命令式改 doc → onUpdate → onChange → 外部 value 变 → effect 再改 doc」的回环。
    const applyingRef = useRef(false);

    const editor = useEditor({
      immediatelyRender: false, // Next SSR 安全
      editable: !disabled,
      extensions: [
        Document,
        Paragraph,
        Text,
        PromptSlot,
        Placeholder.configure({
          placeholder: placeholder || "",
          // 仅在完全空时显示通用占位（模板一旦灌入就不显示）。
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
        // 点原子占位 → 变 NodeSelection 整块选中（Tiptap/PM 默认已如此；这里显式确保）。
        // 一打字时 NodeSelection 下 insertText 原生整块替换（无需自定义 handleTextInput）。
      },
      onUpdate: ({ editor }) => {
        if (applyingRef.current) return;
        onChangeRef.current(docToPlain(editor));
      },
    });

    useImperativeHandle(ref, () => ({
      focus: () => editor?.commands.focus(),
      el: () => (editor ? (editor.view.dom as HTMLElement) : null),
    }));

    // 把编辑器根 DOM 的 accent 变量 + 最大高度设上（供 CSS 用）。
    useEffect(() => {
      if (!editor) return;
      const dom = editor.view.dom as HTMLElement;
      dom.style.setProperty("--oc-ph-accent", accentColor);
      dom.style.maxHeight = `${maxHeight}px`;
      dom.style.minHeight = `${rows * 1.625}em`;
    }, [editor, accentColor, maxHeight, rows]);

    // 灌模板：把光标定位到第一个占位（NodeSelection），用户第一件事就是替换它。
    const seed = useCallback(
      (tmpl: string) => {
        if (!editor) return;
        applyingRef.current = true;
        editor.commands.setContent(templateToDoc(tmpl), { emitUpdate: false });
        seededTemplate.current = tmpl;
        applyingRef.current = false;
        // 上抛初始 value（含未替换占位字面）。
        onChangeRef.current(docToPlain(editor));
        // 选中第一个占位原子节点（→ 一打字即整块替换）。
        requestAnimationFrame(() => {
          if (!editor) return;
          let firstSlotPos = -1;
          editor.state.doc.descendants((node, pos) => {
            if (firstSlotPos === -1 && node.type.name === PROMPT_SLOT_NAME) firstSlotPos = pos;
            return firstSlotPos === -1;
          });
          if (firstSlotPos >= 0) {
            editor.chain().setNodeSelection(firstSlotPos).focus().run();
          } else {
            editor.commands.focus("end");
          }
        });
      },
      [editor],
    );

    // 模板变化（点了新卡片/示例）→ 重建 doc。
    useEffect(() => {
      if (!editor || template == null) return;
      if (seededTemplate.current === template) return;
      seed(template);
    }, [editor, template, seed]);

    // 「点同一张卡再来一次」：调用方点卡片时先把 value 置空；若模板未变，这里重灌。
    useEffect(() => {
      if (!editor) return;
      if (template != null && value === "" && seededTemplate.current === template) {
        seededTemplate.current = null;
        seed(template);
      }
    }, [editor, value, template, seed]);

    // 外部 value 被改（非本编辑器产出，且不在灌模板过程中）→ 同步进编辑器。仅当确实不一致时，
    // 避免打字回环。普通字符编辑不会走这里（onChange 上抛的值与 docToPlain 一致）。
    useEffect(() => {
      if (!editor || applyingRef.current) return;
      if (template != null) return; // 有模板时以 seed 为准，不按纯文本覆盖（否则会毁占位节点）
      const current = docToPlain(editor);
      if (value !== current) {
        applyingRef.current = true;
        editor.commands.setContent(
          { type: "doc", content: value ? [{ type: "paragraph", content: [{ type: "text", text: value }] }] : [{ type: "paragraph" }] },
          { emitUpdate: false },
        );
        applyingRef.current = false;
      }
    }, [editor, value, template]);

    useEffect(() => {
      if (editor && autoFocus) editor.commands.focus();
    }, [editor, autoFocus]);

    // 回车提交透传（LeoComposer 的 handleKeyDown）。IME 合成中不触发（Tiptap/PM 自己会处理，
    // 这里再判一层 isComposing 保险）。
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

/** 别名（宗旨 v15 新名字；语义即「模板实填 + [占位] 原子块」）。 */
export const TemplateFillArea = PromptHighlightArea;

// 参考实现（原子内联节点 = 业界 mention/variable/token 标准做法）：
//   Tiptap Mention / 自定义 atom 节点（ueberdosis/tiptap 文档 + issue #6982 中文 IME 修复）
//   ProseMirror NodeSelection + atom（prosemirror.net/docs：atom / handleTextInput / NodeSelection）
//   Lexical token 节点（facebook/lexical #5026 IME workaround）— 同类问题的另一实现参考
