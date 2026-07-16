"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { CHROME, PanelSection, ToolButton } from "../editor-chrome";
import type { RichDocEditorState } from "./use-rich-doc-editor";

// 富文本「插入 / 内容」overlay 侧栏内容：文档来源 / 插入块 / 图片。撤销重做与
// 逐字符排版（粗斜体/对齐/颜色）已上移到统一顶栏 + 选中浮动 bar，这里只放需要
// 面板承载的来源导入与插入型操作。全部走 CHROME/var 令牌，跟随深/浅主题。

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
    <div className="space-y-1">
      <PanelSection title={tt("文档来源")}>
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
          icon="download"
          disabled={state.importing}
          onClick={() => sourceFileRef.current?.click()}
        />
        <p className={`px-1 text-[10px] leading-relaxed ${CHROME.muted}`}>
          {tt("选中文字后，排版与颜色会直接出现在内容上方。")}
        </p>
      </PanelSection>

      <PanelSection title={tt("插入内容")}>
        <div className="grid grid-cols-2 gap-1.5">
          <ToolButton
            label={tt("3×3 表格")}
            icon="add-table"
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
            icon="adjust"
            disabled={!editor}
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          />
          <ToolButton
            label={tt("代码块")}
            icon="type"
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          />
          <ToolButton
            label={tt("引用块")}
            icon="quote"
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          />
        </div>
      </PanelSection>

      <PanelSection title={tt("图片")}>
        <input
          ref={imageFileRef}
          type="file"
          accept="image/*"
          onChange={onImageFile}
          className="hidden"
        />
        <ToolButton
          label={tt("上传本地图片")}
          icon="add-image"
          onClick={() => imageFileRef.current?.click()}
        />
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={imageInput}
            onChange={(event) => setImageInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") insertImage();
            }}
            placeholder={tt("粘贴图片 URL")}
            aria-label={tt("图片 URL")}
            className={`min-w-0 flex-1 rounded-lg border ${CHROME.border} ${CHROME.subtle} px-2 py-1.5 text-[11px] ${CHROME.fg} outline-none placeholder:text-[var(--faint,#a8a29e)]`}
          />
          <ToolButton
            label={tt("插入")}
            icon="plus"
            iconOnly
            disabled={!imageInput.trim()}
            onClick={insertImage}
          />
        </div>
      </PanelSection>
    </div>
  );
}
