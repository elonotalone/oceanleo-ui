"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useEditorState } from "@tiptap/react";
import { useUI } from "../../i18n/ui/useUI";
import type { RichDocEditorState } from "./use-rich-doc-editor";

const COLORS = [
  "#1c1917",
  "#78716c",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#4f46e5",
  "#9333ea",
  "#db2777",
];

const HIGHLIGHTS = [
  "#fef08a",
  "#fed7aa",
  "#fecaca",
  "#bbf7d0",
  "#bae6fd",
  "#ddd6fe",
  "#fbcfe8",
];

function ToolButton({
  label,
  active = false,
  disabled = false,
  accent,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  accent: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="min-h-8 rounded-lg border px-2 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-35"
      style={
        active
          ? {
              borderColor: accent,
              color: accent,
              background: `${accent}12`,
            }
          : { borderColor: "#e7e5e4", color: "#57534e" }
      }
    >
      {children}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 border-b border-stone-100 pb-3 last:border-0">
      <p className="text-[11px] font-semibold text-stone-800">{title}</p>
      {children}
    </section>
  );
}

export function RichDocControls({
  editor: state,
  accent = "#4f46e5",
}: {
  editor: RichDocEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const editor = state.editor;
  const [imageInput, setImageInput] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const sourceFileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });

  const format = editor?.isActive("heading", { level: 1 })
    ? "h1"
    : editor?.isActive("heading", { level: 2 })
      ? "h2"
      : editor?.isActive("heading", { level: 3 })
        ? "h3"
        : editor?.isActive("heading", { level: 4 })
          ? "h4"
          : "p";
  const inTable = Boolean(editor?.isActive("table"));

  const onFormat = (value: string) => {
    if (!editor) return;
    if (value === "p") {
      editor.chain().focus().setParagraph().run();
      return;
    }
    const level = Number(value.slice(1)) as 1 | 2 | 3 | 4;
    editor.chain().focus().setHeading({ level }).run();
  };

  const onImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void state.uploadImage(file);
    event.target.value = "";
  };

  const insertImage = () => {
    state.insertImageUrl(imageInput);
    setImageInput("");
  };

  return (
    <div className="space-y-3 overflow-y-auto p-3">
      <Section title={tt("文档来源")}>
        <input
          ref={sourceFileRef}
          type="file"
          accept=".doc,.docx,.md,.markdown,.txt,.html,.htm,text/plain,text/markdown,text/html,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void state.importSource(file);
          }}
          className="hidden"
        />
        <button
          type="button"
          disabled={state.importing}
          onClick={() => sourceFileRef.current?.click()}
          className="w-full rounded-lg border border-stone-200 py-2 text-[11px] text-stone-600 hover:bg-stone-50 disabled:opacity-40"
        >
          {state.importing ? tt("导入中…") : tt("导入 DOC、DOCX、HTML 或 Markdown")}
        </button>
        <p className="text-[10px] leading-relaxed text-stone-400">
          {tt("导入会替换当前编辑区内容，不会覆盖原素材。")}
        </p>
      </Section>

      <Section title={tt("文本样式")}>
        <select
          aria-label={tt("段落样式")}
          value={format}
          disabled={!editor}
          onChange={(event) => onFormat(event.target.value)}
          className="w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-[11px] text-stone-700 outline-none"
        >
          <option value="p">{tt("段落")}</option>
          <option value="h1">{tt("一级标题")}</option>
          <option value="h2">{tt("二级标题")}</option>
          <option value="h3">{tt("三级标题")}</option>
          <option value="h4">{tt("四级标题")}</option>
        </select>
        <div className="grid grid-cols-5 gap-1.5">
          <ToolButton label={tt("加粗")} active={editor?.isActive("bold")} disabled={!editor} accent={accent} onClick={() => editor?.chain().focus().toggleBold().run()}>
            B
          </ToolButton>
          <ToolButton label={tt("斜体")} active={editor?.isActive("italic")} disabled={!editor} accent={accent} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <span className="italic">I</span>
          </ToolButton>
          <ToolButton label={tt("下划线")} active={editor?.isActive("underline")} disabled={!editor} accent={accent} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
            <span className="underline">U</span>
          </ToolButton>
          <ToolButton label={tt("删除线")} active={editor?.isActive("strike")} disabled={!editor} accent={accent} onClick={() => editor?.chain().focus().toggleStrike().run()}>
            <span className="line-through">S</span>
          </ToolButton>
          <ToolButton label={tt("行内代码")} active={editor?.isActive("code")} disabled={!editor} accent={accent} onClick={() => editor?.chain().focus().toggleCode().run()}>
            {"</>"}
          </ToolButton>
        </div>
      </Section>

      <Section title={tt("文字颜色")}>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={tt("设置文字颜色")}
              aria-label={tt("设置文字颜色")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor?.chain().focus().setColor(color).run()}
              className="h-6 w-6 rounded-full border-2 border-white shadow ring-1 ring-stone-200"
              style={{ background: color }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor?.chain().focus().unsetColor().run()}
            className="rounded-md border border-stone-200 px-2 text-[10px] text-stone-500"
          >
            {tt("清除")}
          </button>
        </div>
        <p className="pt-1 text-[10px] text-stone-400">{tt("高亮颜色")}</p>
        <div className="flex flex-wrap gap-1.5">
          {HIGHLIGHTS.map((color) => (
            <button
              key={color}
              type="button"
              title={tt("设置高亮颜色")}
              aria-label={tt("设置高亮颜色")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                editor?.chain().focus().toggleHighlight({ color }).run()
              }
              className="h-6 w-6 rounded-md border border-stone-200"
              style={{ background: color }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor?.chain().focus().unsetHighlight().run()}
            className="rounded-md border border-stone-200 px-2 text-[10px] text-stone-500"
          >
            {tt("清除")}
          </button>
        </div>
      </Section>

      <Section title={tt("段落与结构")}>
        <div className="grid grid-cols-4 gap-1.5">
          {(["left", "center", "right", "justify"] as const).map((align) => (
            <ToolButton
              key={align}
              label={
                align === "left"
                  ? tt("左对齐")
                  : align === "center"
                    ? tt("居中")
                    : align === "right"
                      ? tt("右对齐")
                      : tt("两端对齐")
              }
              active={editor?.isActive({ textAlign: align })}
              disabled={!editor}
              accent={accent}
              onClick={() => editor?.chain().focus().setTextAlign(align).run()}
            >
              {align === "left" ? "≡←" : align === "center" ? "≡" : align === "right" ? "→≡" : "☰"}
            </ToolButton>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <ToolButton label={tt("无序列表")} active={editor?.isActive("bulletList")} disabled={!editor} accent={accent} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            {tt("项目符号")}
          </ToolButton>
          <ToolButton label={tt("有序列表")} active={editor?.isActive("orderedList")} disabled={!editor} accent={accent} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
            {tt("编号")}
          </ToolButton>
          <ToolButton label={tt("引用")} active={editor?.isActive("blockquote")} disabled={!editor} accent={accent} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
            {tt("引用")}
          </ToolButton>
          <ToolButton label={tt("代码块")} active={editor?.isActive("codeBlock")} disabled={!editor} accent={accent} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
            {tt("代码块")}
          </ToolButton>
          <ToolButton label={tt("分割线")} disabled={!editor} accent={accent} onClick={() => editor?.chain().focus().setHorizontalRule().run()}>
            {tt("分割线")}
          </ToolButton>
          <ToolButton label={tt("清除格式")} disabled={!editor} accent={accent} onClick={state.clearFormat}>
            {tt("清除格式")}
          </ToolButton>
        </div>
      </Section>

      <Section title={tt("表格")}>
        <div className="grid grid-cols-3 gap-1.5">
          <ToolButton label={tt("插入三行三列表格")} disabled={!editor} accent={accent} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            {tt("插入 3×3")}
          </ToolButton>
          <ToolButton label={tt("后插一行")} disabled={!inTable} accent={accent} onClick={() => editor?.chain().focus().addRowAfter().run()}>
            {tt("增加行")}
          </ToolButton>
          <ToolButton label={tt("删除当前行")} disabled={!inTable} accent={accent} onClick={() => editor?.chain().focus().deleteRow().run()}>
            {tt("删除行")}
          </ToolButton>
          <ToolButton label={tt("后插一列")} disabled={!inTable} accent={accent} onClick={() => editor?.chain().focus().addColumnAfter().run()}>
            {tt("增加列")}
          </ToolButton>
          <ToolButton label={tt("删除当前列")} disabled={!inTable} accent={accent} onClick={() => editor?.chain().focus().deleteColumn().run()}>
            {tt("删除列")}
          </ToolButton>
          <ToolButton label={tt("切换表头行")} disabled={!inTable} accent={accent} onClick={() => editor?.chain().focus().toggleHeaderRow().run()}>
            {tt("切换表头")}
          </ToolButton>
          <ToolButton label={tt("删除表格")} disabled={!inTable} accent={accent} onClick={() => editor?.chain().focus().deleteTable().run()}>
            {tt("删除表格")}
          </ToolButton>
        </div>
      </Section>

      <Section title={tt("图片")}>
        <input
          ref={imageFileRef}
          type="file"
          accept="image/*"
          onChange={onImageFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => imageFileRef.current?.click()}
          className="w-full rounded-lg border border-stone-200 py-2 text-[11px] text-stone-600 hover:bg-stone-50"
        >
          {tt("上传本地图片")}
        </button>
        <div className="flex gap-1.5">
          <input
            value={imageInput}
            onChange={(event) => setImageInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") insertImage();
            }}
            placeholder={tt("粘贴图片 URL")}
            aria-label={tt("图片 URL")}
            className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] outline-none"
          />
          <button type="button" onClick={insertImage} className="rounded-lg border border-stone-200 px-2 text-[11px] text-stone-600">
            {tt("插入")}
          </button>
        </div>
      </Section>

      <Section title={tt("链接")}>
        <input
          value={linkInput}
          onChange={(event) => setLinkInput(event.target.value)}
          onFocus={() =>
            setLinkInput(String(editor?.getAttributes("link").href || ""))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") state.setLinkHref(linkInput);
          }}
          placeholder={tt("输入链接 URL")}
          aria-label={tt("链接 URL")}
          className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] outline-none"
        />
        <div className="grid grid-cols-2 gap-1.5">
          <ToolButton label={tt("添加链接")} disabled={!editor || !linkInput.trim()} accent={accent} onClick={() => state.setLinkHref(linkInput)}>
            {tt("添加链接")}
          </ToolButton>
          <ToolButton label={tt("移除链接")} disabled={!editor?.isActive("link")} accent={accent} onClick={state.unsetLink}>
            {tt("移除链接")}
          </ToolButton>
        </div>
      </Section>

      <Section title={tt("历史")}>
        <div className="grid grid-cols-2 gap-1.5">
          <ToolButton label={tt("撤销")} disabled={!editor?.can().chain().focus().undo().run()} accent={accent} onClick={() => editor?.chain().focus().undo().run()}>
            {tt("撤销")}
          </ToolButton>
          <ToolButton label={tt("重做")} disabled={!editor?.can().chain().focus().redo().run()} accent={accent} onClick={() => editor?.chain().focus().redo().run()}>
            {tt("重做")}
          </ToolButton>
        </div>
      </Section>
    </div>
  );
}
