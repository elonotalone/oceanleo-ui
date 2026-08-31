"use client";

import { useMemo } from "react";
import { useEditorState } from "@tiptap/react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import {
  RICHDOC_CN_PARAGRAPH_PRESET,
  RICHDOC_DEFAULT_PARAGRAPH_PRESET,
  RICHDOC_IMAGE_WRAPS,
  RICHDOC_LINE_HEIGHT_MULTIPLES,
  RICHDOC_NUMBERING_PRESETS,
  applyRichDocParagraphAttrs,
  parseRichDocLineHeight,
} from "./rich-doc-model";
import type { RichDocEditorState } from "./use-rich-doc-editor";

/** 「增加/减少缩进」一档走 24 磅（≈2 个中文字符），和 Word 的默认档一致。 */
const INDENT_STEP_PT = 24;

/** 数字控件回来的值可能是字符串；0 与空一律当「没设」，落成 `null` 才会清掉属性。 */
function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function RichDocContextToolbar({
  editor: state,
  accent = "#4f46e5",
}: {
  editor: RichDocEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const editor = state.editor;
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });
  const context = useMemo<SelectionContext | null>(() => {
    if (!editor) return null;
    const { from, to } = editor.state.selection;
    const format = editor.isActive("heading", { level: 1 })
      ? "h1"
      : editor.isActive("heading", { level: 2 })
        ? "h2"
        : editor.isActive("heading", { level: 3 })
          ? "h3"
          : editor.isActive("heading", { level: 4 })
            ? "h4"
            : "p";
    const textStyle = editor.getAttributes("textStyle");
    const highlight = editor.getAttributes("highlight");
    const link = editor.getAttributes("link");
    const align = ["center", "right", "justify"].find((value) =>
      editor.isActive({ textAlign: value }),
    ) || "left";
    const inTable = editor.isActive("table");
    // 排版属性同时挂在 paragraph 与 heading 上，读的时候要认光标实际落在哪种节点，
    // 否则在标题里调行距会一直显示「默认」。
    const blockAttrs = editor.isActive("heading")
      ? editor.getAttributes("heading")
      : editor.getAttributes("paragraph");
    const lineHeight = parseRichDocLineHeight(blockAttrs.lineHeight);
    const inOrderedList = editor.isActive("orderedList");
    const cellAttrs = inTable
      ? {
          ...editor.getAttributes("tableCell"),
          ...editor.getAttributes("tableHeader"),
        }
      : {};
    const selectedNode = (
      editor.state.selection as typeof editor.state.selection & {
        node?: { type?: { name?: string } };
      }
    ).node;
    const selectionKind = selectedNode
      ? selectedNode.type?.name === "image"
        ? "embedded-object"
        : "block"
      : inTable
        ? "table-cell"
        : from === to
          ? "text-caret"
          : "text-range";
    return {
      version: 1,
      kind: selectionKind,
      id: `text:${from}-${to}`,
      label: selectedNode
        ? selectedNode.type?.name === "image"
          ? tt("嵌入图片（单选）")
          : tt("文档块（单选）")
        : inTable
        ? tt("表格单元格")
        : from === to
          ? tt("当前段落")
          : tt("选中文字"),
      text: from === to ? "" : editor.state.doc.textBetween(from, to, " "),
      revision: state.editRevision,
      controls: selectedNode
        ? [
            ...(selectedNode.type?.name === "image"
              ? [
                  {
                    // 只有「嵌入行内」与「上下型」两种，不做四周环绕：
                    // 理由写在 rich-doc-model.ts 的 RichDocImageWrap 注释里。
                    id: "image-wrap",
                    kind: "select" as const,
                    label: tt("环绕方式"),
                    icon: "image" as const,
                    group: "layout",
                    value: String(
                      (
                        selectedNode as unknown as {
                          attrs?: Record<string, unknown>;
                        }
                      ).attrs?.wrap || "top-bottom",
                    ),
                    options: RICHDOC_IMAGE_WRAPS.map((wrap) => ({
                      value: wrap.value,
                      label: tt(wrap.label),
                    })),
                  },
                ]
              : []),
            {
              id: "delete-selection",
              kind: "action" as const,
              label: tt("删除所选对象"),
              icon: "delete" as const,
              danger: true,
              placement: "more" as const,
            },
          ]
        : [
        {
          id: "format",
          kind: "select",
          label: tt("样式"),
          icon: "font",
          iconOnly: true,
          group: "type",
          value: format,
          options: [
            { value: "p", label: tt("段落") },
            { value: "h1", label: tt("一级标题") },
            { value: "h2", label: tt("二级标题") },
            { value: "h3", label: tt("三级标题") },
            { value: "h4", label: tt("四级标题") },
          ],
        },
        {
          // `FontSize` 扩展一直是注册着的，缺的只是这个入口（任务书 P1）。
          id: "font-size",
          kind: "select",
          label: tt("字号"),
          icon: "font",
          semantic: "font-size",
          group: "type",
          value: String(textStyle.fontSize || ""),
          options: [
            { value: "", label: tt("默认") },
            ...[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map(
              (size) => ({ value: `${size}px`, label: `${size}` }),
            ),
          ],
        },
        { id: "bold", kind: "toggle", label: tt("粗体"), icon: "bold", iconOnly: true, group: "style", value: editor.isActive("bold") },
        { id: "italic", kind: "toggle", label: tt("斜体"), icon: "italic", iconOnly: true, group: "style", value: editor.isActive("italic") },
        {
          id: "underline",
          kind: "toggle",
          label: tt("下划线"),
          icon: "underline",
          iconOnly: true,
          group: "style",
          value: editor.isActive("underline"),
        },
        {
          id: "strike",
          kind: "toggle",
          label: tt("删除线"),
          value: editor.isActive("strike"),
          placement: "more",
        },
        {
          id: "color",
          kind: "color",
          label: tt("文字色"),
          icon: "font",
          iconOnly: true,
          group: "style",
          value: String(textStyle.color || "#1c1917"),
        },
        {
          id: "highlight",
          kind: "color",
          label: tt("高亮"),
          value: String(highlight.color || "#fef08a"),
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-colors",
          inspectorLabel: tt("颜色与高亮"),
          inspectorIcon: "background",
        },
        {
          id: "align",
          kind: "select",
          label: tt("对齐"),
          icon: "align-left",
          iconOnly: true,
          group: "paragraph",
          value: align,
          options: [
            { value: "left", label: tt("左") },
            { value: "center", label: tt("中") },
            { value: "right", label: tt("右") },
            { value: "justify", label: tt("两端") },
          ],
        },
        {
          id: "bullet-list",
          kind: "toggle",
          label: tt("项目符号"),
          value: editor.isActive("bulletList"),
          placement: "more",
        },
        {
          id: "ordered-list",
          kind: "toggle",
          label: tt("编号"),
          value: editor.isActive("orderedList"),
          placement: "more",
        },
        {
          id: "blockquote",
          kind: "toggle",
          label: tt("引用"),
          value: editor.isActive("blockquote"),
          placement: "more",
        },
        {
          id: "code-block",
          kind: "toggle",
          label: tt("代码块"),
          value: editor.isActive("codeBlock"),
          placement: "more",
        },
        {
          id: "clear",
          kind: "action",
          label: tt("清除格式"),
          placement: "more",
        },
        {
          id: "link",
          kind: "text",
          label: tt("链接"),
          value: String(link.href || ""),
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-link",
          inspectorLabel: tt("链接"),
          inspectorIcon: "link",
        },
        {
          id: "unlink",
          kind: "action",
          label: tt("移除链接"),
          disabled: !editor.isActive("link"),
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-link",
          inspectorLabel: tt("链接"),
          inspectorIcon: "link",
        },
        // --- 行距 / 缩进 / 段间距（P2）---------------------------------------
        // 全部走 applyRichDocParagraphAttrs()，一次打到 paragraph 与 heading。
        {
          id: "line-height",
          kind: "select",
          label: tt("行距"),
          icon: "spacing",
          semantic: "spacing",
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-typography",
          inspectorLabel: tt("行距与缩进"),
          inspectorIcon: "spacing",
          value: lineHeight?.mode === "multiple" ? String(lineHeight.value) : "",
          options: [
            { value: "", label: tt("默认") },
            ...RICHDOC_LINE_HEIGHT_MULTIPLES.map((multiple) => ({
              value: multiple,
              label: tt("{n} 倍", { n: multiple }),
            })),
          ],
        },
        {
          // 固定行距与倍数行距是互斥的两种模式，给两个控件比塞进一个 select
          // 清楚：设了固定值就盖掉倍数，设回 0 就交还给倍数。
          id: "line-height-exact",
          kind: "number",
          label: tt("固定行距"),
          suffix: tt("磅"),
          semantic: "spacing",
          min: 0,
          max: 200,
          step: 0.5,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-typography",
          inspectorLabel: tt("行距与缩进"),
          inspectorIcon: "spacing",
          value: lineHeight?.mode === "exact" ? lineHeight.value : 0,
        },
        {
          id: "first-line-chars",
          kind: "number",
          label: tt("首行缩进"),
          suffix: tt("字符"),
          min: 0,
          max: 20,
          step: 0.5,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-typography",
          inspectorLabel: tt("行距与缩进"),
          inspectorIcon: "spacing",
          value: Number(blockAttrs.firstLineChars) || 0,
        },
        {
          id: "hanging-chars",
          kind: "number",
          label: tt("悬挂缩进"),
          suffix: tt("字符"),
          min: 0,
          max: 20,
          step: 0.5,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-typography",
          inspectorLabel: tt("行距与缩进"),
          inspectorIcon: "spacing",
          value: Number(blockAttrs.hangingChars) || 0,
        },
        {
          id: "indent-decrease",
          kind: "action",
          label: tt("减少缩进"),
          icon: "align-left",
          disabled: !(Number(blockAttrs.indentLeft) > 0),
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-typography",
          inspectorLabel: tt("行距与缩进"),
          inspectorIcon: "spacing",
        },
        {
          id: "indent-increase",
          kind: "action",
          label: tt("增加缩进"),
          icon: "align-left",
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-typography",
          inspectorLabel: tt("行距与缩进"),
          inspectorIcon: "spacing",
        },
        {
          id: "indent-right",
          kind: "number",
          label: tt("右缩进"),
          suffix: tt("磅"),
          min: 0,
          max: 720,
          step: 6,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-typography",
          inspectorLabel: tt("行距与缩进"),
          inspectorIcon: "spacing",
          value: Number(blockAttrs.indentRight) || 0,
        },
        {
          id: "space-before",
          kind: "number",
          label: tt("段前"),
          suffix: tt("磅"),
          semantic: "spacing",
          min: 0,
          max: 720,
          step: 3,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-typography",
          inspectorLabel: tt("行距与缩进"),
          inspectorIcon: "spacing",
          value: Number(blockAttrs.spaceBefore) || 0,
        },
        {
          id: "space-after",
          kind: "number",
          label: tt("段后"),
          suffix: tt("磅"),
          semantic: "spacing",
          min: 0,
          max: 720,
          step: 3,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-typography",
          inspectorLabel: tt("行距与缩进"),
          inspectorIcon: "spacing",
          value: Number(blockAttrs.spaceAfter) || 0,
        },
        {
          // 中文公文的硬约定：首行缩进 2 字符 + 1.5 倍行距。一键给全，
          // 比让用户自己凑两个数字实在。
          id: "cn-typography",
          kind: "action",
          label: tt("中文排版"),
          icon: "case",
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-typography",
          inspectorLabel: tt("行距与缩进"),
          inspectorIcon: "spacing",
        },
        {
          id: "typography-reset",
          kind: "action",
          label: tt("恢复默认排版"),
          placement: "more",
          slot: "inspector",
          inspectorGroup: "richdoc-typography",
          inspectorLabel: tt("行距与缩进"),
          inspectorIcon: "spacing",
        },
        // --- 多级编号（P3）---------------------------------------------------
        ...(inOrderedList
          ? [
              {
                id: "numbering",
                kind: "select" as const,
                label: tt("编号格式"),
                icon: "text" as const,
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "richdoc-numbering",
                inspectorLabel: tt("多级编号"),
                inspectorIcon: "text" as const,
                value: String(
                  editor.getAttributes("orderedList").numbering || "decimal",
                ),
                options: RICHDOC_NUMBERING_PRESETS.map((preset) => ({
                  value: preset.value,
                  label: tt(preset.label),
                })),
              },
            ]
          : []),
        ...(inTable
          ? [
              {
                id: "row-add",
                kind: "action" as const,
                label: tt("增加行"),
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "richdoc-table",
                inspectorLabel: tt("表格结构"),
                inspectorIcon: "table" as const,
              },
              {
                id: "row-delete",
                kind: "action" as const,
                label: tt("删除行"),
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "richdoc-table",
                inspectorLabel: tt("表格结构"),
                inspectorIcon: "table" as const,
              },
              {
                id: "column-add",
                kind: "action" as const,
                label: tt("增加列"),
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "richdoc-table",
                inspectorLabel: tt("表格结构"),
                inspectorIcon: "table" as const,
              },
              {
                id: "column-delete",
                kind: "action" as const,
                label: tt("删除列"),
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "richdoc-table",
                inspectorLabel: tt("表格结构"),
                inspectorIcon: "table" as const,
              },
              {
                id: "cell-merge",
                kind: "action" as const,
                label: tt("合并单元格"),
                icon: "table" as const,
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "richdoc-table",
                inspectorLabel: tt("表格结构"),
                inspectorIcon: "table" as const,
              },
              {
                id: "cell-split",
                kind: "action" as const,
                label: tt("拆分单元格"),
                icon: "table" as const,
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "richdoc-table",
                inspectorLabel: tt("表格结构"),
                inspectorIcon: "table" as const,
              },
              {
                // Word 的「标题行重复」= 首行是表头行。跨页时 Word 会自己重画，
                // 我们只要把 tableHeader 这个事实带进 docx（w:tblHeader）。
                id: "header-row",
                kind: "toggle" as const,
                label: tt("表头行重复"),
                icon: "table" as const,
                value: editor.isActive("tableHeader"),
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "richdoc-table",
                inspectorLabel: tt("表格结构"),
                inspectorIcon: "table" as const,
              },
              {
                id: "cell-background",
                kind: "color" as const,
                label: tt("单元格底色"),
                icon: "background" as const,
                value: String(cellAttrs.backgroundColor || "#ffffff"),
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "richdoc-cell",
                inspectorLabel: tt("单元格"),
                inspectorIcon: "border" as const,
              },
              {
                id: "cell-valign",
                kind: "select" as const,
                label: tt("垂直对齐"),
                icon: "position" as const,
                value: String(cellAttrs.verticalAlign || "top"),
                options: [
                  { value: "top", label: tt("顶端") },
                  { value: "center", label: tt("居中") },
                  { value: "bottom", label: tt("底端") },
                ],
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "richdoc-cell",
                inspectorLabel: tt("单元格"),
                inspectorIcon: "border" as const,
              },
              {
                // W14 打开 TableKit.resizable 之前，这是设列宽的唯一入口；
                // 打开之后拖拽与这里写的是同一个 colwidth attr，不冲突。
                id: "cell-width",
                kind: "number" as const,
                label: tt("列宽"),
                suffix: "px",
                min: 0,
                max: 1200,
                step: 10,
                value: Array.isArray(cellAttrs.colwidth)
                  ? Number(cellAttrs.colwidth[0]) || 0
                  : 0,
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "richdoc-cell",
                inspectorLabel: tt("单元格"),
                inspectorIcon: "border" as const,
              },
              {
                id: "table-delete",
                kind: "action" as const,
                label: tt("删除表格"),
                danger: true,
                placement: "more" as const,
                slot: "inspector" as const,
                inspectorGroup: "richdoc-table",
                inspectorLabel: tt("表格结构"),
                inspectorIcon: "table" as const,
              },
            ]
          : []),
          ],
    };
  }, [editor, editor?.state, state.editRevision, tt]);

  if (!editor || !context) return null;
  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    if (
      message.selectionRevision !== undefined &&
      message.selectionRevision !== state.editRevision
    ) {
      return;
    }
    if (message.transactionId && message.phase !== "commit") return;
    const chain = editor.chain().focus();
    switch (message.controlId) {
      case "delete-selection":
        chain.deleteSelection().run();
        break;
      case "format": {
        const value = String(message.value || "p");
        if (value === "p") chain.setParagraph().run();
        else chain.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 }).run();
        break;
      }
      case "bold":
        chain.toggleBold().run();
        break;
      case "italic":
        chain.toggleItalic().run();
        break;
      case "underline":
        chain.toggleUnderline().run();
        break;
      case "strike":
        chain.toggleStrike().run();
        break;
      case "color":
        chain.setColor(String(message.value || "#1c1917")).run();
        break;
      case "highlight":
        chain.setHighlight({ color: String(message.value || "#fef08a") }).run();
        break;
      case "align":
        chain.setTextAlign(String(message.value || "left")).run();
        break;
      case "bullet-list":
        chain.toggleBulletList().run();
        break;
      case "ordered-list":
        chain.toggleOrderedList().run();
        break;
      case "blockquote":
        chain.toggleBlockquote().run();
        break;
      case "code-block":
        chain.toggleCodeBlock().run();
        break;
      case "clear":
        state.clearFormat();
        break;
      case "link":
        if (String(message.value || "").trim()) {
          state.setLinkHref(String(message.value).trim());
        } else {
          state.unsetLink();
        }
        break;
      case "unlink":
        state.unsetLink();
        break;
      case "row-add":
        chain.addRowAfter().run();
        break;
      case "row-delete":
        chain.deleteRow().run();
        break;
      case "column-add":
        chain.addColumnAfter().run();
        break;
      case "column-delete":
        chain.deleteColumn().run();
        break;
      case "table-delete":
        chain.deleteTable().run();
        break;
      case "font-size": {
        const value = String(message.value || "");
        if (value) chain.setFontSize(value).run();
        else chain.unsetFontSize().run();
        break;
      }
      case "line-height":
        // 选倍数就把固定值一起清掉，否则两种模式会同时挂着，导出以固定值为准，
        // 用户看到的却是刚选的倍数。
        applyRichDocParagraphAttrs(chain, {
          lineHeight: String(message.value || "") || null,
        });
        break;
      case "line-height-exact": {
        const pt = numberOrNull(message.value);
        applyRichDocParagraphAttrs(chain, {
          lineHeight: pt === null ? null : `${pt}pt`,
        });
        break;
      }
      case "first-line-chars":
        // 首行缩进与悬挂缩进在 OOXML 里就是互斥的，这里同步清掉另一边，
        // 免得导出时静默丢掉其中一个（richDocDocxParagraphProperties 只认一个）。
        applyRichDocParagraphAttrs(chain, {
          firstLineChars: numberOrNull(message.value),
          hangingChars: null,
        });
        break;
      case "hanging-chars":
        applyRichDocParagraphAttrs(chain, {
          hangingChars: numberOrNull(message.value),
          firstLineChars: null,
        });
        break;
      case "indent-increase":
      case "indent-decrease": {
        const current =
          Number(
            (editor.isActive("heading")
              ? editor.getAttributes("heading")
              : editor.getAttributes("paragraph")
            ).indentLeft,
          ) || 0;
        const next =
          message.controlId === "indent-increase"
            ? Math.min(720, current + INDENT_STEP_PT)
            : Math.max(0, current - INDENT_STEP_PT);
        applyRichDocParagraphAttrs(chain, { indentLeft: next || null });
        break;
      }
      case "indent-right":
        applyRichDocParagraphAttrs(chain, {
          indentRight: numberOrNull(message.value),
        });
        break;
      case "space-before":
        applyRichDocParagraphAttrs(chain, {
          spaceBefore: numberOrNull(message.value),
        });
        break;
      case "space-after":
        applyRichDocParagraphAttrs(chain, {
          spaceAfter: numberOrNull(message.value),
        });
        break;
      case "cn-typography":
        applyRichDocParagraphAttrs(chain, RICHDOC_CN_PARAGRAPH_PRESET);
        break;
      case "typography-reset":
        applyRichDocParagraphAttrs(chain, RICHDOC_DEFAULT_PARAGRAPH_PRESET);
        break;
      case "numbering":
        chain
          .updateAttributes("orderedList", {
            numbering: String(message.value || "decimal"),
          })
          .run();
        break;
      case "cell-merge":
        chain.mergeCells().run();
        break;
      case "cell-split":
        chain.splitCell().run();
        break;
      case "header-row":
        chain.toggleHeaderRow().run();
        break;
      case "cell-background":
        chain
          .setCellAttribute(
            "backgroundColor",
            String(message.value || "") || null,
          )
          .run();
        break;
      case "cell-valign":
        chain
          .setCellAttribute("verticalAlign", String(message.value || "top"))
          .run();
        break;
      case "cell-width": {
        const px = numberOrNull(message.value);
        chain.setCellAttribute("colwidth", px === null ? null : [px]).run();
        break;
      }
      case "image-wrap":
        chain
          .updateAttributes("image", {
            wrap: String(message.value || "top-bottom"),
          })
          .run();
        break;
    }
  };
  return (
    <SelectionToolbar
      context={context}
      onCommand={command}
      accent={accent}
    />
  );
}
