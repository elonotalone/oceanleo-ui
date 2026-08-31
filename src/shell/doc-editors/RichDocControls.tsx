"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
import { AdvancedFontPicker } from "../AdvancedFontPicker";
import {
  findEveryOccurrence,
  isRichDocFindShortcut,
  replaceEveryOccurrence,
} from "./doc-family-commands";
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
      className="min-h-9 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:border-[var(--awb-accent,#7c3aed)]/40 hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] hover:shadow-sm disabled:opacity-35"
    >
      {label}
    </button>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--fg-2,#57534e)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 accent-[var(--awb-accent,#7c3aed)]"
      />
      {label}
    </label>
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
  const findInputRef = useRef<HTMLInputElement>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(true);
  const [wholeWord, setWholeWord] = useState(false);
  const [replaceReport, setReplaceReport] = useState("");

  // Ctrl/Cmd+F 打开面板。用捕获阶段接管浏览器自带的查找框——页面内的查找
  // 才能替换，浏览器的那个只能看。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isRichDocFindShortcut(event)) return;
      event.preventDefault();
      setFindOpen(true);
      window.setTimeout(() => findInputRef.current?.focus(), 0);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const matchCount =
    findOpen && editor && findText
      ? findEveryOccurrence(editor, findText, { matchCase, wholeWord }).length
      : 0;

  const runReplaceAll = useCallback(() => {
    if (!editor || !findText) return;
    const count = replaceEveryOccurrence(editor, findText, replaceText, {
      matchCase,
      wholeWord,
    });
    setReplaceReport(
      count
        ? tt("已替换 {n} 处，按一次撤销可以全部还原。", { n: count })
        : tt("没有找到「{q}」。", { q: findText }),
    );
  }, [editor, findText, replaceText, matchCase, wholeWord, tt]);

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

      <Section title={tt("查找和替换")}>
        {findOpen ? (
          <div className="space-y-2">
            <input
              ref={findInputRef}
              value={findText}
              onChange={(event) => {
                setFindText(event.target.value);
                setReplaceReport("");
              }}
              placeholder={tt("查找内容")}
              aria-label={tt("查找内容")}
              className="w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--awb-accent,#7c3aed)]"
            />
            <input
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
              placeholder={tt("替换为")}
              aria-label={tt("替换为")}
              className="w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--awb-accent,#7c3aed)]"
            />
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <CheckRow
                label={tt("区分大小写")}
                checked={matchCase}
                onChange={setMatchCase}
              />
              <CheckRow
                label={tt("全字匹配")}
                checked={wholeWord}
                onChange={setWholeWord}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <ToolButton
                label={tt("全部替换")}
                disabled={!editor || !findText || matchCount === 0}
                onClick={runReplaceAll}
              />
              <ToolButton
                label={tt("关闭")}
                onClick={() => {
                  setFindOpen(false);
                  setReplaceReport("");
                }}
              />
            </div>
            <p
              aria-live="polite"
              className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]"
            >
              {replaceReport ||
                (findText
                  ? tt("找到 {n} 处。", { n: matchCount })
                  : tt("全部替换是一步操作，撤销一次就全部还原。"))}
            </p>
          </div>
        ) : (
          <ToolButton
            label={tt("查找和替换（Ctrl/Cmd+F）")}
            onClick={() => {
              setFindOpen(true);
              window.setTimeout(() => findInputRef.current?.focus(), 0);
            }}
          />
        )}
      </Section>

      <Section title={tt("字体")}>
        <div className="-mx-1 overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)]">
          <AdvancedFontPicker
            selectedFamily={String(
              editor?.getAttributes("textStyle").fontFamily || "",
            )}
            disabled={!editor}
            onSelect={(family) =>
              editor?.chain().focus().setFontFamily(family).run()
            }
          />
        </div>
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
            className="min-w-0 flex-1 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--awb-accent,#7c3aed)]"
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
