"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useEditorState } from "@tiptap/react";
import { normalizeRichDocImageTransform, selectedRichDocImageAttrs } from "./rich-doc-image-transform";
import { useUI } from "../../i18n/ui/useUI";
import {
  findEveryOccurrence,
  replaceEveryOccurrence,
} from "./doc-family-commands";
import type { SelectionAdapter } from "../selection-context";
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
      className="rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:border-[var(--awb-accent,#7c3aed)]/40 hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] hover:shadow-sm disabled:opacity-35"
    >
      {label}
    </button>
  );
}

/**
 * 「区分大小写 / 全字匹配」这类开关。
 *
 * 原先是 `size-3.5` 的原生复选框——**14px，手指点不中**，而它旁边就挤着另一个开关，
 * 点歪了会静默改掉查找口径（W42，2026-09-01 实测，`hit-target-budget` 记的就是这一处）。
 * 把复选框撑到 44 会得到一个 44×44 的方块，那是把缺陷换成另一个缺陷；
 * 所以这里**换排列**：整行变成一枚 `aria-pressed` 的切换按钮，
 * 命中区就是那枚按钮本身（`min-h-11`），标签文字也一起可点。
 * 这与查找框里「Match Case / Whole Word」的通行做法一致，读屏念得出按下/未按下。
 * 皮沿用同一 Section 里的 `ToolButton`，面板不会出现第二套按钮长相。
 */
function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  // 选中态用三元式换整套配色，不用 `aria-pressed:` 变体：那个变体今天在产物
  // (`src/theme/ui.css`) 里一条规则都没有，写了等于按下去没反应。
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`rounded-xl border px-2.5 py-2 text-[11px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] ${
        checked
          ? "border-[var(--awb-accent,#7c3aed)] bg-[var(--surface-hover,rgba(0,0,0,.04))] text-[var(--awb-accent,#7c3aed)]"
          : "border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-[var(--fg-2,#57534e)]"
      }`}
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
  const canEdit = Boolean(editor?.isEditable && !state.collabReadOnly && !state.loading && state.sourceReady !== false && !state.sourceFailed);
  const [imageInput, setImageInput] = useState("");
  const [tableOpen, setTableOpen] = useState(false);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
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
    <fieldset disabled={!canEdit} className="min-w-0 space-y-4 border-0 bg-[var(--card,#fff)] p-4">
      <Section title={tt("插入内容")}>
        {tableOpen && <div className="space-y-2" data-richdoc-table-picker>
          {([["行数", rows, setRows], ["列数", cols, setCols]] as const).map(([label, value, setValue]) => (
            <label key={label} className="flex items-center gap-2 text-xs">
              {tt(label)}<input aria-label={tt(label)} type="number" min={1} max={20} value={value}
                className="min-h-11 w-20 rounded-xl border bg-transparent px-2"
                onChange={(event) => setValue(Math.max(1, Math.min(20, Math.trunc(Number(event.currentTarget.value)) || 1)))} />
            </label>
          ))}
          <ToolButton label={tt("插入表格")} disabled={!editor} onClick={() => {
            editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
            setTableOpen(false);
          }} />
        </div>}
        <div className="grid grid-cols-2 gap-1.5">
          <ToolButton
            label={tt("表格")}
            disabled={!editor}
            onClick={() => setTableOpen((open) => !open)}
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
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--awb-accent,#7c3aed)]"
          />
          <ToolButton
            label={tt("插入")}
            disabled={!imageInput.trim()}
            onClick={insertImage}
          />
        </div>
      </Section>
    </fieldset>
  );
}

/** 独立浮层；快捷键由常驻路由接管，不依赖 Insert 面板。 */
export function RichDocFindReplace({ editor: state, onClose }: {
  editor: RichDocEditorState; onClose?: () => void;
}) {
  const tt = useUI();
  const editor = state.editor;
  const canEdit = Boolean(editor?.isEditable && !state.collabReadOnly && !state.loading && state.sourceReady !== false && !state.sourceFailed);
  const findInputRef = useRef<HTMLInputElement>(null);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(true);
  const [wholeWord, setWholeWord] = useState(false);
  const [replaceReport, setReplaceReport] = useState("");

  useEffect(() => { findInputRef.current?.focus(); }, []);

  const matchCount =
    editor && findText
      ? findEveryOccurrence(editor, findText, { matchCase, wholeWord }).length
      : 0;

  const runReplaceAll = useCallback(() => {
    if (!editor || !canEdit || !findText) return;
    const count = replaceEveryOccurrence(editor, findText, replaceText, {
      matchCase,
      wholeWord,
    });
    setReplaceReport(
      count
        ? tt("已替换 {n} 处，按一次撤销可以全部还原。", { n: count })
        : tt("没有找到「{q}」。", { q: findText }),
    );
  }, [editor, canEdit, findText, replaceText, matchCase, wholeWord, tt]);

  return <div className="space-y-4 p-4">
      <Section title={tt("查找和替换")}>
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
              className="min-h-11 w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--awb-accent,#7c3aed)]"
            />
            <input
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
              placeholder={tt("替换为")}
              aria-label={tt("替换为")}
              className="min-h-11 w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--awb-accent,#7c3aed)]"
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
                disabled={!canEdit || !findText || matchCount === 0}
                onClick={runReplaceAll}
              />
              <ToolButton
                label={tt("关闭")}
                onClick={() => {
                  onClose?.();
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
      </Section>
  </div>;
}

/** canon crop 仍为动作按钮；尺寸在同一个共享浮层 host 中编辑。 */
export function RichDocImageCropControls({ editor: state, selection: adapter }: { editor: RichDocEditorState; selection: SelectionAdapter }) {
  const tt = useUI();
  const editor = state.editor;
  useEditorState({ editor, selector: ({ transactionNumber }) => transactionNumber });
  const image = selectedRichDocImageAttrs(editor);
  const transform = normalizeRichDocImageTransform(image || {});
  const liveId = editor ? `text:${editor.state.selection.from}-${editor.state.selection.to}` : "";
  const canEdit = Boolean(editor?.isEditable && image && adapter.context?.id === liveId && !state.collabReadOnly && !state.loading && state.sourceReady !== false && !state.sourceFailed);
  return <fieldset disabled={!canEdit} className="min-w-0 space-y-3 border-0 p-4">
    {(["cropTop", "cropRight", "cropBottom", "cropLeft"] as const).map((key, index) => <label key={key} className="flex items-center justify-between gap-3 text-xs">
      {tt(["顶端", "右", "底端", "左"][index])}
      <span><input aria-label={tt(["顶端", "右", "底端", "左"][index])} type="number" min={0} max={90} step={1} value={transform[key]}
        className="min-h-11 w-20 rounded-xl border bg-transparent px-2"
        onChange={(event) => { if (canEdit && adapter.context) adapter.dispatch({
          requestId: `richdoc-crop-${crypto.randomUUID()}`, selectionId: adapter.context.id,
          selectionRevision: state.editRevision, controlId: `richdoc.${key}`, value: Number(event.target.value),
        }); }} /> %</span>
    </label>)}
  </fieldset>;
}
