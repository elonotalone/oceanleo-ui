"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { RichDocEditorState } from "./use-rich-doc-editor";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5 border-b border-[var(--border,#e7e5e4)] pb-4 last:border-0">
      <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">{title}</p>
      {children}
    </section>
  );
}

function ToolButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-9 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition hover:-translate-y-0.5 hover:border-[var(--accent,#7c3aed)]/40 hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] hover:shadow-sm disabled:opacity-35"
    >
      {label}
    </button>
  );
}

export function RichDocControls({
  editor: state,
}: {
  editor: RichDocEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const editor = state.editor;
  const [imageInput, setImageInput] = useState("");
  const sourceFileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);

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
    <div className="min-h-full space-y-4 overflow-y-auto bg-[var(--card,#fff)] p-4">
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
        <ToolButton
          label={state.importing ? tt("导入中…") : tt("导入文档")}
          disabled={state.importing}
          onClick={() => sourceFileRef.current?.click()}
        />
        <p className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
          {tt("选中文字后，排版与颜色会直接出现在内容上方。")}
        </p>
      </Section>

      <Section title={tt("插入内容")}>
        <div className="grid grid-cols-2 gap-1.5">
          <ToolButton
            label={tt("3×3 表格")}
            disabled={!editor}
            onClick={() =>
              editor
                ?.chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          />
          <ToolButton
            label={tt("分割线")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          />
          <ToolButton
            label={tt("代码块")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          />
          <ToolButton
            label={tt("引用块")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          />
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
        <ToolButton
          label={tt("上传本地图片")}
          onClick={() => imageFileRef.current?.click()}
        />
        <div className="flex gap-1.5">
          <input
            value={imageInput}
            onChange={(event) => setImageInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") insertImage();
            }}
            placeholder={tt("粘贴图片 URL")}
            aria-label={tt("图片 URL")}
            className="min-w-0 flex-1 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--accent,#7c3aed)]"
          />
          <ToolButton
            label={tt("插入")}
            disabled={!imageInput.trim()}
            onClick={insertImage}
          />
        </div>
      </Section>
    </div>
  );
}
