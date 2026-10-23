"use client";

import type { ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { deckShapeClipPath } from "./DeckElementContent";
import { DECK_THEMES, type DeckLayout } from "./deck-schema";
import type { DeckEditorState } from "./use-deck-editor";

const inputClass =
  "w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2.5 text-[12px] text-[var(--fg,#292524)] outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus:border-[var(--awb-accent,#7c3aed)] focus:ring-2 focus:ring-[var(--awb-accent,#7c3aed)]/10";
const buttonClass =
  "rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:border-[var(--awb-accent,#7c3aed)]/40 hover:shadow-sm disabled:opacity-35";
/** deck-extension.md §4 L1–L16, plus the two legacy editor grammars. */
const DECK_LAYOUTS: readonly { id: DeckLayout; label: string }[] = [
  { id: "title", label: "封面" },
  { id: "section", label: "章节页" },
  { id: "bullets", label: "要点列表" },
  { id: "two-column", label: "双栏" },
  { id: "data-table", label: "数据表" },
  { id: "image-full", label: "满幅图" },
  { id: "image-left", label: "左图右文" },
  { id: "image-right", label: "左文右图" },
  { id: "image-grid", label: "图片宫格" },
  { id: "chart-focus", label: "图表主视觉" },
  { id: "chart-with-notes", label: "图表加要点" },
  { id: "kpi-row", label: "指标卡" },
  { id: "comparison", label: "左右对比" },
  { id: "timeline", label: "时间轴" },
  { id: "quote", label: "引文" },
  { id: "mixed-triptych", label: "图文数三联" },
  { id: "title-body", label: "标题与正文" },
];

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-[var(--divider,#e7e5e4)] p-3.5 last:border-b-0">
      <div className="mb-3">
        <h3 className="text-[12px] font-semibold text-[var(--fg,#292524)]">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function DeckDesignPanel({
  editor,
  accent = "#4f46e5",
}: {
  editor: DeckEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const slide = editor.activeSlide;
  return (
    <div className="bg-[var(--card,#fff)]">
      <Panel
        title={tt("演示文稿")}
        description={tt("设置页面比例、主题和整套演示的视觉基调。")}
      >
        <div className="space-y-3">
          <label className="block text-[10px] font-medium text-[var(--muted,#78716c)]">
            {tt("标题")}
            <input
              value={editor.deck.title}
              onFocus={editor.beginGesture}
              onChange={(event) => {
                editor.beginGesture();
                editor.setTitleTransient(event.target.value);
              }}
              onBlur={editor.endGesture}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  editor.cancelGesture();
                  event.currentTarget.blur();
                } else if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              className={`${inputClass} mt-1`}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["16:9", "4:3"] as const).map((aspect) => (
              <button
                key={aspect}
                type="button"
                onClick={() => editor.setAspect(aspect)}
                className="rounded-xl border px-2 py-2 text-[11px] font-semibold transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]"
                style={
                  editor.deck.aspect === aspect
                    ? { borderColor: accent, color: accent, background: `${accent}0d` }
                    : { borderColor: "var(--border,#e7e5e4)", color: "var(--muted,#78716c)" }
                }
              >
                {aspect}
              </button>
            ))}
          </div>
          <div>
            <p className="mb-2 text-[10px] font-medium text-[var(--muted,#78716c)]">
              {tt("页面布局")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DECK_LAYOUTS.map((layout) => (
                <button
                  key={layout.id}
                  type="button"
                  onClick={() => editor.applySlideLayout(layout.id)}
                  className="rounded-xl border px-2.5 py-2 text-left text-[10px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:shadow-sm"
                  style={
                    slide.layout === layout.id
                      ? {
                          borderColor: accent,
                          color: accent,
                          background: `${accent}0d`,
                        }
                      : {
                          borderColor: "var(--border,#e7e5e4)",
                          color: "var(--fg-2,#57534e)",
                        }
                  }
                >
                  <span className="mb-1.5 block aspect-video rounded-md border border-current/20 bg-[var(--surface,#f5f5f4)]">
                    <span
                      className={`mx-auto mt-1.5 block h-1 rounded-full bg-current/55 ${
                        layout.id.includes("image") ? "w-2/5" : "w-3/5"
                      }`}
                    />
                    <span className="mx-auto mt-1 block h-5 w-4/5 rounded-sm border border-current/15" />
                  </span>
                  {tt(layout.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DECK_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => editor.setTheme(theme.id)}
                className="group flex min-h-16 items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[11px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:shadow-sm"
                style={
                  editor.deck.theme === theme.id
                    ? {
                        borderColor: theme.accent,
                        color: theme.text,
                        background: theme.background,
                      }
                    : { borderColor: "var(--border,#e7e5e4)", color: "var(--muted,#78716c)" }
                }
              >
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ background: theme.accent }}
                />
                {tt(theme.label)}
              </button>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title={tt("当前页面")} description={tt("页面级设置不占用对象属性栏。")}>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={editor.addSlide} className={buttonClass}>
            {tt("新增幻灯片")}
          </button>
          <button
            type="button"
            onClick={editor.duplicateSlide}
            className={buttonClass}
          >
            {tt("复制幻灯片")}
          </button>
          <button
            type="button"
            disabled={editor.activeIndex === 0}
            onClick={() => editor.moveSlide(-1)}
            className={buttonClass}
          >
            {tt("向前移动")}
          </button>
          <button
            type="button"
            disabled={editor.activeIndex === editor.deck.slides.length - 1}
            onClick={() => editor.moveSlide(1)}
            className={buttonClass}
          >
            {tt("向后移动")}
          </button>
          <button
            type="button"
            onClick={editor.deleteSlide}
            disabled={editor.deck.slides.length <= 1}
            className={`${buttonClass} text-[var(--awb-danger)]`}
          >
            {tt("删除当前页")}
          </button>
        </div>
        <label className="mt-3 block text-[10px] font-medium text-[var(--muted,#78716c)]">
          {tt("页面背景")}
          <input
            type="color"
            value={slide.background || "#ffffff"}
            onFocus={editor.beginGesture}
            onPointerDown={editor.beginGesture}
            onChange={(event) => {
              editor.beginGesture();
              editor.patchSlideTransient({ background: event.target.value });
            }}
            onPointerUp={editor.endGesture}
            onPointerCancel={editor.cancelGesture}
            onKeyDown={editor.beginGesture}
            onKeyUp={editor.endGesture}
            onBlur={editor.endGesture}
            className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-[var(--border,#e7e5e4)] bg-transparent p-1"
          />
        </label>
      </Panel>
    </div>
  );
}

export function DeckElementsPanel({
  editor,
}: {
  editor: DeckEditorState;
}) {
  const tt = useUI();
  const shapes = [
    ["rectangle", "矩形"],
    ["rounded", "圆角矩形"],
    ["circle", "圆形"],
    ["triangle", "三角形"],
    ["diamond", "菱形"],
    ["star", "星形"],
    ["arrow", "箭头"],
    ["hexagon", "六边形"],
  ] as const;
  return (
    <div className="bg-[var(--card,#fff)]">
      <Panel title={tt("形状")} description={tt("点击后直接添加到当前页面中央。")}>
        <div className="grid grid-cols-2 gap-2">
          {shapes.map(([shape, label]) => (
            <button
              key={shape}
              type="button"
              onClick={() => editor.addShapeElement(shape)}
              className={`${buttonClass} flex min-h-20 flex-col items-center justify-center gap-2`}
            >
              <span
                className="block h-9 w-12 bg-[var(--awb-accent,#7c3aed)]"
                style={{
                  borderRadius:
                    shape === "circle"
                      ? "999px"
                      : shape === "rounded"
                        ? "12px"
                        : "3px",
                  clipPath: deckShapeClipPath(shape),
                }}
              />
              {tt(label)}
            </button>
          ))}
        </div>
      </Panel>
      <Panel title={tt("表格")}>
        <div className="grid grid-cols-2 gap-2">
          {[
            [2, 2],
            [3, 3],
            [4, 4],
            [5, 3],
          ].map(([rows, columns]) => (
            <button
              key={`${rows}x${columns}`}
              type="button"
              onClick={() => editor.addTableElement(rows, columns)}
              className={buttonClass}
            >
              {rows} × {columns}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function DeckTextPanel({ editor }: { editor: DeckEditorState }) {
  const tt = useUI();
  const presets = [
    { label: "添加标题", size: 52, bold: true, height: 16 },
    { label: "添加副标题", size: 32, bold: false, height: 12 },
    { label: "添加正文", size: 20, bold: false, height: 18 },
    { label: "添加说明文字", size: 14, bold: false, height: 10 },
  ];
  return (
    <div className="bg-[var(--card,#fff)]">
      <Panel
        title={tt("文字")}
        description={tt("添加后双击画布文字即可原地输入。")}
      >
        <div className="space-y-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() =>
                editor.addTextElement({
                  text: tt(preset.label),
                  fontSize: preset.size,
                  bold: preset.bold,
                  height: preset.height,
                })
              }
              className="w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-3 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-[var(--awb-accent,#7c3aed)]/40 hover:shadow-sm"
              style={{
                fontSize: `${Math.min(24, Math.max(12, preset.size / 2.5))}px`,
                fontWeight: preset.bold ? 700 : 400,
              }}
            >
              {tt(preset.label)}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/** Backward-compatible aggregate used by routes that have not split drawers. */
export function DeckControls(props: {
  editor: DeckEditorState;
  accent?: string;
}) {
  return <DeckDesignPanel {...props} />;
}
