"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
import type {
  ExportFormat,
  FabricImageEditorState,
  ShapeKind,
  TextPreset,
} from "./types";

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
    <section className="border-b border-[var(--divider,#e7e5e4)] p-4 last:border-b-0">
      <h3 className="text-[13px] font-semibold text-[var(--fg,#292524)]">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted,#78716c)]">
          {description}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Choice({
  label,
  preview,
  onClick,
}: {
  label: string;
  preview: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-2 text-[10px] font-medium text-[var(--fg-2,#57534e)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong,#d6d3d1)] hover:bg-[var(--surface-hover,rgba(0,0,0,.035))] hover:shadow-sm"
    >
      <span className="grid h-12 w-16 place-items-center text-[var(--fg,#292524)]">
        {preview}
      </span>
      <span>{label}</span>
    </button>
  );
}

function ShapePreview({ kind }: { kind: ShapeKind }) {
  const common = {
    stroke: "currentColor",
    strokeWidth: 2,
  };
  return (
    <svg viewBox="0 0 64 48" className="h-11 w-14" aria-hidden="true">
      {kind === "rect" && <rect x="9" y="10" width="46" height="28" rx="1" fill="currentColor" {...common} />}
      {kind === "rounded-rect" && <rect x="9" y="10" width="46" height="28" rx="7" fill="currentColor" {...common} />}
      {kind === "circle" && <circle cx="32" cy="24" r="17" fill="currentColor" {...common} />}
      {kind === "ellipse" && <ellipse cx="32" cy="24" rx="23" ry="14" fill="currentColor" {...common} />}
      {kind === "triangle" && <path d="M32 6 56 41H8Z" fill="currentColor" {...common} />}
      {kind === "diamond" && <path d="M32 5 57 24 32 43 7 24Z" fill="currentColor" {...common} />}
      {kind === "hexagon" && <path d="M17 7h30l13 17-13 17H17L4 24Z" fill="currentColor" {...common} />}
      {kind === "star" && <path d="m32 4 6.2 13.1 14.4 1.8-10.5 10 2.7 14.2L32 36.2 19.2 43l2.7-14.2-10.5-10 14.4-1.8Z" fill="currentColor" {...common} />}
      {kind === "heart" && <path d="M32 42S7 29 7 14c0-10 14-13 25-1 11-12 25-9 25 1 0 15-25 28-25 28Z" fill="currentColor" {...common} />}
      {kind === "line" && <path d="M6 24h52" fill="none" {...common} />}
      {kind === "dashed-line" && <path d="M6 24h52" fill="none" strokeDasharray="7 5" {...common} />}
      {kind === "curve" && <path d="M5 34C20 2 44 46 59 13" fill="none" {...common} />}
      {kind === "arrow" && <path d="M5 24h48m-10-10 10 10-10 10" fill="none" {...common} />}
      {kind === "elbow-arrow" && <path d="M7 9v15h44m-10-10 10 10-10 10" fill="none" {...common} />}
      {kind === "double-arrow" && <path d="m15 14-10 10 10 10M5 24h54m-10-10 10 10-10 10" fill="none" {...common} />}
    </svg>
  );
}

export function FabricImageBrushPanel({
  editor,
}: {
  editor: FabricImageEditorState;
}) {
  const tt = useUI();
  return (
    <div className="min-h-full bg-[var(--card,#fff)]">
      <Panel
        title={tt("画笔")}
        description={tt("选择绘制或擦除，随后直接在画布上拖动。")}
      >
        <div className="grid grid-cols-2 gap-2">
          {(["draw", "erase"] as const).map((tool) => {
            const active = editor.activeTool === tool;
            return (
              <button
                key={tool}
                type="button"
                onClick={() => editor.setActiveTool(tool)}
                className="rounded-xl border px-3 py-2.5 text-[11px] font-semibold transition"
                style={
                  active
                    ? {
                        borderColor: "var(--accent,#6d5dfc)",
                        background:
                          "color-mix(in srgb, var(--accent,#6d5dfc) 9%, var(--card,#fff))",
                        color: "var(--accent,#6d5dfc)",
                      }
                    : { borderColor: "var(--border,#e7e5e4)" }
                }
              >
                {tool === "draw" ? tt("绘制") : tt("擦除")}
              </button>
            );
          })}
        </div>
        <label className="mt-4 flex items-center justify-between text-[11px] text-[var(--fg-2,#57534e)]">
          {tt("笔触颜色")}
          <input
            type="color"
            value={editor.brush.color}
            disabled={editor.activeTool === "erase"}
            onChange={(event) => editor.setBrush({ color: event.target.value })}
            className="h-9 w-12 rounded-lg border border-[var(--border,#e7e5e4)] bg-transparent p-1 disabled:opacity-40"
          />
        </label>
        <label className="mt-4 block text-[11px] text-[var(--fg-2,#57534e)]">
          <span className="mb-2 flex justify-between">
            {tt("笔触大小")}
            <span>{Math.round(editor.brush.width)} px</span>
          </span>
          <input
            type="range"
            min={1}
            max={120}
            value={editor.brush.width}
            onChange={(event) =>
              editor.setBrush({ width: Number(event.target.value) })
            }
            className="w-full"
          />
        </label>
      </Panel>
    </div>
  );
}

const SHAPES: Array<{ kind: ShapeKind; label: string }> = [
  { kind: "rect", label: "矩形" },
  { kind: "rounded-rect", label: "圆角矩形" },
  { kind: "circle", label: "圆形" },
  { kind: "ellipse", label: "椭圆" },
  { kind: "triangle", label: "三角形" },
  { kind: "diamond", label: "菱形" },
  { kind: "hexagon", label: "六边形" },
  { kind: "star", label: "星形" },
  { kind: "heart", label: "心形" },
];

export function FabricImageShapePanel({
  editor,
}: {
  editor: FabricImageEditorState;
}) {
  const tt = useUI();
  return (
    <div className="min-h-full bg-[var(--card,#fff)]">
      <Panel title={tt("形状")} description={tt("选择后插入；颜色、描边和透明度可继续调整。")}>
        <div className="grid grid-cols-3 gap-2">
          {SHAPES.map(({ kind, label }) => (
            <Choice
              key={kind}
              label={tt(label)}
              preview={<ShapePreview kind={kind} />}
              onClick={() => editor.addShape(kind)}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

const LINES: Array<{ kind: ShapeKind; label: string }> = [
  { kind: "line", label: "直线" },
  { kind: "dashed-line", label: "虚线" },
  { kind: "curve", label: "曲线" },
  { kind: "arrow", label: "单向箭头" },
  { kind: "elbow-arrow", label: "折线箭头" },
  { kind: "double-arrow", label: "双向箭头" },
];

export function FabricImageLinePanel({
  editor,
}: {
  editor: FabricImageEditorState;
}) {
  const tt = useUI();
  return (
    <div className="min-h-full bg-[var(--card,#fff)]">
      <Panel title={tt("线条")} description={tt("先选择线条类型，再在画布中调整长度、角度和样式。")}>
        <div className="grid grid-cols-2 gap-2">
          {LINES.map(({ kind, label }) => (
            <Choice
              key={kind}
              label={tt(label)}
              preview={<ShapePreview kind={kind} />}
              onClick={() => editor.addShape(kind)}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

const NOTE_COLORS = ["#ffe36e", "#ffd6df", "#d9f7be", "#cfe8ff", "#e7dcff", "#fff2c7"];

export function FabricImageNotePanel({
  editor,
}: {
  editor: FabricImageEditorState;
}) {
  const tt = useUI();
  return (
    <div className="min-h-full bg-[var(--card,#fff)]">
      <Panel title={tt("便签")} description={tt("选择颜色后插入；双击便签文字即可编辑。")}>
        <div className="grid grid-cols-3 gap-2">
          {NOTE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => editor.addStickyNote(color)}
              className="aspect-square rounded-xl border border-black/10 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              style={{ background: color }}
              aria-label={tt("插入便签")}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

const TEXT_PRESETS: Array<{
  preset: TextPreset;
  label: string;
  sampleClass: string;
}> = [
  { preset: "heading", label: "添加标题", sampleClass: "text-[22px] font-bold" },
  { preset: "subheading", label: "添加副标题", sampleClass: "text-[17px] font-medium" },
  { preset: "body", label: "添加正文", sampleClass: "text-[13px]" },
];

export function FabricImageTextPanel({
  editor,
}: {
  editor: FabricImageEditorState;
}) {
  const tt = useUI();
  return (
    <div className="min-h-full bg-[var(--card,#fff)]">
      <Panel title={tt("文字")} description={tt("选择文字层级，插入后可在画布中直接改字。")}>
        <div className="space-y-2">
          {TEXT_PRESETS.map(({ preset, label, sampleClass }) => (
            <button
              key={preset}
              type="button"
              onClick={() => editor.addText(preset)}
              className={`w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-4 py-3 text-left text-[var(--fg,#292524)] transition hover:bg-[var(--surface-hover,rgba(0,0,0,.035))] ${sampleClass}`}
            >
              {tt(label)}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

type Point = { x: number; y: number };

function signaturePoint(event: ReactPointerEvent<SVGSVGElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 1000,
    y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * 300,
  };
}

function strokePath(stroke: Point[]): string {
  return stroke
    .map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

export function FabricImageSignaturePanel({
  editor,
}: {
  editor: FabricImageEditorState;
}) {
  const tt = useUI();
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [typedName, setTypedName] = useState("");
  const [color, setColor] = useState("#18212f");
  const drawingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const addDrawn = () => {
    if (!strokes.length) return;
    const paths = strokes
      .map(
        (stroke) =>
          `<path d="${strokePath(stroke)}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join("");
    void editor.addSignatureFromSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">${paths}</svg>`,
    );
    setStrokes([]);
  };
  return (
    <div className="min-h-full bg-[var(--card,#fff)]">
      <Panel title={tt("手写签名")} description={tt("在签名板书写，满意后插入为可缩放图层。")}>
        <svg
          viewBox="0 0 1000 300"
          preserveAspectRatio="none"
          className="h-36 w-full touch-none rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drawingRef.current = true;
            setStrokes((current) => [...current, [signaturePoint(event)]]);
          }}
          onPointerMove={(event) => {
            if (!drawingRef.current) return;
            const point = signaturePoint(event);
            setStrokes((current) => {
              const next = current.map((stroke) => [...stroke]);
              next[next.length - 1]?.push(point);
              return next;
            });
          }}
          onPointerUp={(event) => {
            drawingRef.current = false;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
          onPointerCancel={() => {
            drawingRef.current = false;
          }}
          aria-label={tt("签名板")}
        >
          <line x1="50" y1="245" x2="950" y2="245" stroke="#d6d3d1" strokeWidth="3" />
          {strokes.map((stroke, index) => (
            <path
              key={index}
              d={strokePath(stroke)}
              fill="none"
              stroke={color}
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
        <div className="mt-2 flex gap-2">
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-9 w-11 rounded-lg border border-[var(--border,#e7e5e4)] bg-transparent p-1"
            aria-label={tt("签名颜色")}
          />
          <button
            type="button"
            onClick={() => setStrokes([])}
            className="rounded-lg border border-[var(--border,#e7e5e4)] px-3 text-[11px]"
          >
            {tt("重写")}
          </button>
          <button
            type="button"
            disabled={!strokes.length}
            onClick={addDrawn}
            className="ml-auto rounded-lg bg-[var(--accent,#6d5dfc)] px-3 text-[11px] font-semibold text-white disabled:opacity-35"
          >
            {tt("插入签名")}
          </button>
        </div>
      </Panel>
      <Panel title={tt("键入或上传")}>
        <input
          value={typedName}
          onChange={(event) => setTypedName(event.target.value)}
          placeholder={tt("输入姓名")}
          className="w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2.5 text-[20px] outline-none"
          style={{ fontFamily: "Segoe Script, Brush Script MT, cursive" }}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!typedName.trim()}
            onClick={() => {
              editor.addSignature(typedName.trim(), color);
              setTypedName("");
            }}
            className="rounded-xl bg-[var(--accent,#6d5dfc)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-35"
          >
            {tt("插入文字签名")}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-[var(--border,#e7e5e4)] px-3 py-2 text-[11px] font-semibold"
          >
            {tt("上传签名图片")}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void editor.addImageFromFile(file);
            event.currentTarget.value = "";
          }}
        />
      </Panel>
    </div>
  );
}

export function FabricImageTablePanel({
  editor,
}: {
  editor: FabricImageEditorState;
}) {
  const tt = useUI();
  const [hovered, setHovered] = useState({ rows: 3, columns: 3 });
  return (
    <div className="min-h-full bg-[var(--card,#fff)]">
      <Panel
        title={tt("插入表格")}
        description={tt("拖过网格选择初始行列；插入后可在属性栏继续增减。")}
      >
        <p className="mb-2 text-center text-[12px] font-semibold text-[var(--fg,#292524)]">
          {hovered.rows} × {hovered.columns}
        </p>
        <div className="mx-auto grid w-fit grid-cols-8 gap-1">
          {Array.from({ length: 64 }, (_, index) => {
            const row = Math.floor(index / 8) + 1;
            const column = (index % 8) + 1;
            const active = row <= hovered.rows && column <= hovered.columns;
            return (
              <button
                key={`${row}-${column}`}
                type="button"
                onMouseEnter={() => setHovered({ rows: row, columns: column })}
                onFocus={() => setHovered({ rows: row, columns: column })}
                onClick={() => editor.addTable(row, column)}
                className="h-7 w-7 rounded-[4px] border transition"
                style={{
                  borderColor: active
                    ? "var(--accent,#6d5dfc)"
                    : "var(--border,#d6d3d1)",
                  background: active
                    ? "color-mix(in srgb, var(--accent,#6d5dfc) 16%, var(--card,#fff))"
                    : "var(--card,#fff)",
                }}
                aria-label={`${row} × ${column}`}
              />
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

const EXPORT_FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPG" },
  { value: "webp", label: "WebP" },
];

export function FabricImageExportPanel({
  editor,
}: {
  editor: FabricImageEditorState;
}) {
  const tt = useUI();
  return (
    <div className="min-h-full bg-[var(--card,#fff)]">
      <Panel
        title={tt("导出图片")}
        description={tt("选择交付格式与清晰度；导出不会改变可编辑工程。")}
      >
        <p className="mb-2 text-[11px] font-medium text-[var(--fg-2,#57534e)]">
          {tt("文件格式")}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {EXPORT_FORMATS.map(({ value, label }) => {
            const active = editor.exportFormat === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => editor.setExportFormat(value)}
                className="rounded-xl border px-2 py-2.5 text-[11px] font-semibold transition"
                style={
                  active
                    ? {
                        borderColor: "var(--accent,#6d5dfc)",
                        background:
                          "color-mix(in srgb, var(--accent,#6d5dfc) 9%, var(--card,#fff))",
                        color: "var(--accent,#6d5dfc)",
                      }
                    : { borderColor: "var(--border,#e7e5e4)" }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        {editor.exportFormat !== "png" && (
          <label className="mt-4 block text-[11px] text-[var(--fg-2,#57534e)]">
            <span className="mb-2 flex justify-between">
              {tt("图片质量")}
              <span>{editor.exportQuality}%</span>
            </span>
            <input
              type="range"
              min={20}
              max={100}
              value={editor.exportQuality}
              onChange={(event) =>
                editor.setExportQuality(Number(event.target.value))
              }
              className="w-full"
            />
          </label>
        )}
        <p className="mb-2 mt-4 text-[11px] font-medium text-[var(--fg-2,#57534e)]">
          {tt("导出尺寸")}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {[1, 1.5, 2, 3].map((scale) => (
            <button
              key={scale}
              type="button"
              onClick={() => editor.setExportScale(scale)}
              className="rounded-xl border px-1 py-2 text-[11px] transition"
              style={
                editor.exportScale === scale
                  ? {
                      borderColor: "var(--accent,#6d5dfc)",
                      color: "var(--accent,#6d5dfc)",
                    }
                  : { borderColor: "var(--border,#e7e5e4)" }
              }
            >
              {scale}×
            </button>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-[var(--muted,#78716c)]">
          {Math.round(editor.doc.width * editor.exportScale)} ×{" "}
          {Math.round(editor.doc.height * editor.exportScale)} px
        </p>
        <button
          type="button"
          onClick={editor.download}
          disabled={editor.loading || editor.saving}
          className="mt-4 w-full rounded-xl bg-[var(--accent,#6d5dfc)] px-3 py-2.5 text-[11px] font-semibold text-white disabled:opacity-40"
        >
          {tt("下载图片")}
        </button>
      </Panel>
    </div>
  );
}

