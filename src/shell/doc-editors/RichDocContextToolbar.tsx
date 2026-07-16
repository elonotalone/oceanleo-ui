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
          id: "format",
          kind: "select",
          label: tt("样式"),
          icon: "type",
          value: format,
          options: [
            { value: "p", label: tt("段落") },
            { value: "h1", label: tt("一级标题") },
            { value: "h2", label: tt("二级标题") },
            { value: "h3", label: tt("三级标题") },
            { value: "h4", label: tt("四级标题") },
          ],
          group: "text",
        },
        {
          id: "bold",
          kind: "toggle",
          label: tt("加粗"),
          icon: "bold",
          iconOnly: true,
          value: editor.isActive("bold"),
          group: "style",
        },
        {
          id: "italic",
          kind: "toggle",
          label: tt("斜体"),
          icon: "italic",
          iconOnly: true,
          value: editor.isActive("italic"),
          group: "style",
        },
        {
          id: "underline",
          kind: "toggle",
          label: tt("下划线"),
          icon: "underline",
          iconOnly: true,
          value: editor.isActive("underline"),
          group: "style",
        },
        {
          id: "strike",
          kind: "toggle",
          label: tt("删除线"),
          icon: "strike",
          iconOnly: true,
          value: editor.isActive("strike"),
          group: "style",
        },
        {
          id: "color",
          kind: "color",
          label: tt("文字色"),
          icon: "text-color",
          value: String(textStyle.color || "#1c1917"),
          group: "color",
        },
        {
          id: "highlight",
          kind: "color",
          label: tt("高亮"),
          icon: "highlight",
          value: String(highlight.color || "#fef08a"),
          group: "color",
        },
        {
          id: "align",
          kind: "select",
          label: tt("对齐"),
          icon: "align-left",
          value: align,
          options: [
            { value: "left", label: tt("左") },
            { value: "center", label: tt("中") },
            { value: "right", label: tt("右") },
            { value: "justify", label: tt("两端") },
          ],
          group: "align",
        },
        {
          id: "bullet-list",
          kind: "toggle",
          label: tt("项目符号"),
          icon: "bullet-list",
          iconOnly: true,
          value: editor.isActive("bulletList"),
          group: "list",
        },
        {
          id: "ordered-list",
          kind: "toggle",
          label: tt("编号"),
          icon: "ordered-list",
          iconOnly: true,
          value: editor.isActive("orderedList"),
          group: "list",
        },
        {
          id: "blockquote",
          kind: "toggle",
          label: tt("引用"),
          icon: "quote",
          iconOnly: true,
          value: editor.isActive("blockquote"),
          group: "list",
        },
        {
          id: "link",
          kind: "text",
          label: tt("链接"),
          icon: "link",
          value: String(link.href || ""),
          group: "link",
        },
        {
          id: "unlink",
          kind: "action",
          label: tt("移除链接"),
          icon: "unlink",
          disabled: !editor.isActive("link"),
          group: "link",
          placement: "more",
        },
        {
          id: "clear",
          kind: "action",
          label: tt("清除格式"),
          icon: "clear-format",
          placement: "more",
        },
        ...(inTable
          ? [
              { id: "row-add", kind: "action" as const, label: tt("增加行"), icon: "plus", group: "table" as const, placement: "more" as const },
              { id: "row-delete", kind: "action" as const, label: tt("删除行"), icon: "delete", group: "table" as const, placement: "more" as const },
              { id: "column-add", kind: "action" as const, label: tt("增加列"), icon: "plus", group: "table" as const, placement: "more" as const },
              { id: "column-delete", kind: "action" as const, label: tt("删除列"), icon: "delete", group: "table" as const, placement: "more" as const },
              {
                id: "table-delete",
                kind: "action" as const,
                label: tt("删除表格"),
                icon: "delete",
                danger: true,
                group: "table" as const,
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
