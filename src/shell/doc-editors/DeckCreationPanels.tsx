"use client";

import { useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { DeckInkStyle } from "./deck-ink";
import type { DeckCreationTool } from "./deck-quick-tools";
import type {
  DeckLineDash,
  DeckLineMarker,
} from "./deck-schema";
import type { DeckEditorState } from "./use-deck-editor";

const COLORS = [
  "#111827",
  "#ef4444",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#0ea5e9",
  "#6366f1",
  "#d946ef",
] as const;

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[var(--divider,#e7e5e4)] p-4 last:border-b-0">
      <h3 className="text-[12px] font-semibold text-[var(--fg,#292524)]">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
          {description}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ColorRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className="h-7 w-7 rounded-full border-2 shadow-sm transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:scale-110"
          style={{
            background: color,
            borderColor: value === color ? "white" : "transparent",
            boxShadow:
              value === color
                ? `0 0 0 2px ${color}`
                : "0 1px 3px rgba(15,23,42,.18)",
          }}
          aria-label={color}
        />
      ))}
      <label
        className="grid h-7 w-7 cursor-pointer place-items-center rounded-full border border-[var(--border,#d6d3d1)] bg-[var(--card,#fff)] text-[11px]"
        title="自定义颜色"
      >
        +
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="sr-only"
        />
      </label>
    </div>
  );
}

export function DeckDrawPanel({
  style,
  onStyleChange,
  onToolChange,
}: {
  style: DeckInkStyle;
  onStyleChange: (style: DeckInkStyle) => void;
  onToolChange: (tool: DeckCreationTool) => void;
}) {
  const tt = useUI();
  const pens = [
    { label: "钢笔", width: 2.5, opacity: 1, highlighter: false },
    { label: "马克笔", width: 7, opacity: 1, highlighter: false },
    { label: "荧光笔", width: 18, opacity: 0.32, highlighter: true },
    { label: "细线笔", width: 1.2, opacity: 1, highlighter: false },
  ] as const;
  return (
    <div className="bg-[var(--card,#fff)]">
      <Panel
        title={tt("画笔")}
        description={tt("选择笔触后，直接在整张幻灯片上按住并拖动。")}
      >
        <div className="grid grid-cols-2 gap-2">
          {pens.map((pen) => {
            const active =
              style.width === pen.width &&
              style.opacity === pen.opacity &&
              Boolean(style.highlighter) === pen.highlighter;
            return (
              <button
                key={pen.label}
                type="button"
                onClick={() => {
                  onStyleChange({ ...style, ...pen });
                  onToolChange("draw");
                }}
                className={`rounded-xl border px-3 py-3 text-left text-[11px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
 active
 ? "border-[var(--awb-accent,#7c3aed)] bg-[var(--awb-accent,#7c3aed)]/8"
 : "border-[var(--border,#e7e5e4)] hover:bg-[var(--awb-hover)]"
 }`}
              >
                <span
                  className="mb-2 block w-full rounded-full"
                  style={{
                    height: `${Math.max(2, Math.min(12, pen.width))}px`,
                    background: style.color,
                    opacity: pen.opacity,
                  }}
                />
                {tt(pen.label)}
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel title={tt("笔触颜色")}>
        <ColorRow
          value={style.color}
          onChange={(color) => {
            onStyleChange({ ...style, color });
            onToolChange("draw");
          }}
        />
      </Panel>
      <Panel title={tt("粗细")}>
        <label className="flex items-center gap-3 text-[11px] text-[var(--muted,#78716c)]">
          <input
            type="range"
            min={1}
            max={24}
            step={0.5}
            value={style.width}
            onChange={(event) =>
              onStyleChange({
                ...style,
                width: Number(event.target.value),
              })
            }
            className="min-w-0 flex-1"
          />
          <span className="w-10 text-right tabular-nums">{style.width}px</span>
        </label>
      </Panel>
    </div>
  );
}

export function DeckLinePanel({ editor }: { editor: DeckEditorState }) {
  const tt = useUI();
  const [color, setColor] = useState("#111827");
  const lines: {
    label: string;
    dash: DeckLineDash;
    start: DeckLineMarker;
    end: DeckLineMarker;
    width: number;
  }[] = [
    { label: "实线", dash: "solid", start: "none", end: "none", width: 3 },
    { label: "虚线", dash: "dash", start: "none", end: "none", width: 3 },
    { label: "点线", dash: "dot", start: "none", end: "none", width: 3 },
    { label: "箭头", dash: "solid", start: "none", end: "arrow", width: 3 },
    { label: "双向箭头", dash: "solid", start: "arrow", end: "arrow", width: 3 },
    { label: "圆点箭头", dash: "solid", start: "circle", end: "arrow", width: 4 },
  ];
  return (
    <div className="bg-[var(--card,#fff)]">
      <Panel
        title={tt("线条")}
        description={tt("选择线型后插入；可继续移动、旋转和调整长度。")}
      >
        <div className="space-y-2">
          {lines.map((line) => (
            <button
              key={line.label}
              type="button"
              onClick={() =>
                editor.addShapeElement("line", undefined, {
                  fill: "transparent",
                  borderColor: color,
                  borderWidth: line.width,
                  lineDash: line.dash,
                  lineStart: line.start,
                  lineEnd: line.end,
                })
              }
              className="flex w-full items-center gap-3 rounded-xl border border-[var(--border,#e7e5e4)] px-3 py-3 text-[11px] text-[var(--fg-2,#57534e)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-[var(--awb-accent,#7c3aed)]/50 hover:bg-[var(--awb-hover)]"
            >
              <svg viewBox="0 0 120 20" className="h-5 min-w-0 flex-1" aria-hidden>
                <defs>
                  <marker id={`arrow-${line.label}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M1 1 9 5 1 9Z" fill={color} />
                  </marker>
                </defs>
                <line
                  x1="8"
                  y1="10"
                  x2="112"
                  y2="10"
                  stroke={color}
                  strokeWidth={line.width}
                  strokeLinecap="round"
                  strokeDasharray={
                    line.dash === "dash"
                      ? "12 8"
                      : line.dash === "dot"
                        ? "1 7"
                        : undefined
                  }
                  markerStart={line.start === "arrow" ? `url(#arrow-${line.label})` : undefined}
                  markerEnd={line.end === "arrow" ? `url(#arrow-${line.label})` : undefined}
                />
              </svg>
              <span className="w-16 text-left">{tt(line.label)}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title={tt("线条颜色")}>
        <ColorRow value={color} onChange={setColor} />
      </Panel>
    </div>
  );
}

export function DeckNotesPanel({ editor }: { editor: DeckEditorState }) {
  const tt = useUI();
  const notes = [
    ["#fde68a", "#3f3420"],
    ["#f9a8d4", "#4a1630"],
    ["#93c5fd", "#14345d"],
    ["#86efac", "#16472b"],
    ["#c4b5fd", "#32215d"],
    ["#fed7aa", "#542b12"],
  ] as const;
  return (
    <div className="bg-[var(--card,#fff)]">
      <Panel
        title={tt("便签")}
        description={tt("选择颜色后插入，双击便签即可原地编辑文字。")}
      >
        <div className="grid grid-cols-2 gap-3">
          {notes.map(([fill, color], index) => (
            <button
              key={fill}
              type="button"
              onClick={() =>
                editor.addShapeElement("rounded", undefined, {
                  width: 28,
                  height: 26,
                  fill,
                  color,
                  text: tt("输入便签内容"),
                  fontSize: 20,
                  bold: true,
                  align: "center",
                  lineHeight: 1.2,
                  borderRadius: 18,
                  shadow: true,
                  label: tt("便签 {number}", { number: index + 1 }),
                })
              }
              className="aspect-square rounded-sm p-3 text-left text-[10px] font-semibold shadow-md transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-1 hover:shadow-lg"
              style={{ background: fill, color }}
            >
              {tt("便签")}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
