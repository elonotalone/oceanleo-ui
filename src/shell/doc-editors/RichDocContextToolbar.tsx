"use client";

import { useMemo } from "react";
import { useEditorState } from "@tiptap/react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import type { RichDocEditorState } from "./use-rich-doc-editor";

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
    return {
      version: 1,
      kind: inTable ? "table-cell" : from === to ? "text-caret" : "text-range",
      id: `text:${from}-${to}`,
      label: inTable
        ? tt("表格单元格")
        : from === to
          ? tt("当前段落")
          : tt("选中文字"),
      text: from === to ? "" : editor.state.doc.textBetween(from, to, " "),
      controls: [
        {
          id: "undo",
          kind: "action",
          label: tt("撤销"),
          icon: "undo",
          iconOnly: true,
          group: "history",
          disabled: !editor.can().undo(),
        },
        {
          id: "redo",
          kind: "action",
          label: tt("重做"),
          icon: "redo",
          iconOnly: true,
          group: "history",
          disabled: !editor.can().redo(),
        },
        {
          id: "format",
          kind: "select",
          label: tt("样式"),
          icon: "font",
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
          label: "S",
          value: editor.isActive("strike"),
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
        },
        {
          id: "align",
          kind: "select",
          label: tt("对齐"),
          icon: "align-left",
          group: "paragraph",
          value: align,
          options: [
            { value: "left", label: tt("左") },
            { value: "center", label: tt("中") },
            { value: "right", label: tt("右") },
            { value: "justify", label: tt("两端") },
          ],
          placement: "more",
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
        },
        {
          id: "unlink",
          kind: "action",
          label: tt("移除链接"),
          disabled: !editor.isActive("link"),
          placement: "more",
        },
        ...(inTable
          ? [
              { id: "row-add", kind: "action" as const, label: tt("增加行"), placement: "more" as const },
              { id: "row-delete", kind: "action" as const, label: tt("删除行"), placement: "more" as const },
              { id: "column-add", kind: "action" as const, label: tt("增加列"), placement: "more" as const },
              { id: "column-delete", kind: "action" as const, label: tt("删除列"), placement: "more" as const },
              {
                id: "table-delete",
                kind: "action" as const,
                label: tt("删除表格"),
                danger: true,
                placement: "more" as const,
              },
            ]
          : []),
      ],
    };
  }, [editor, editor?.state, tt]);

  if (!editor || !context) return null;
  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    const chain = editor.chain().focus();
    switch (message.controlId) {
      case "undo":
        chain.undo().run();
        break;
      case "redo":
        chain.redo().run();
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
        chain.toggleHighlight({ color: String(message.value || "#fef08a") }).run();
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
      case "clear":
        state.clearFormat();
        break;
      case "link":
        state.setLinkHref(String(message.value || ""));
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
