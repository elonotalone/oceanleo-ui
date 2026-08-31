"use client";

import {
  useCallback,
  useEffect,
  useMemo,
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
import {
  IMAGE_AI_PANEL_CAPABILITIES,
  IMAGE_AI_RESULT_PLACEMENT,
  IMAGE_DIRECT_COMMAND_REGISTRY,
  IMAGE_MAX_DIMENSION,
  classifyImageAiFailure,
  createImageRecipeDocument,
  imageCommandAvailability,
  imageUpscalePreflight,
  startImageAiCommand,
  startImageDirectCommand,
  type ImageAiCommand,
  type ImageAiFailure,
  type ImageAiPanelCapability,
  type ImageAiProvider,
  type ImageCapabilityId,
  type ImageDirectExecutor,
  type ImageProgressMetadata,
  type ImageSemanticCommandId,
  type ImageSourceReference,
} from "./image-capability-engine";

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
      className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-2 text-[10px] font-medium text-[var(--fg-2,#57534e)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:border-[var(--border-strong,#d6d3d1)] hover:bg-[var(--surface-hover,rgba(0,0,0,.035))] hover:shadow-sm"
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
  const eraseBlocked = editor.layers.some((layer) => layer.locked);
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
                disabled={tool === "erase" && eraseBlocked}
                onClick={() => editor.setActiveTool(tool)}
                className="rounded-xl border px-3 py-2.5 text-[11px] font-semibold transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] disabled:cursor-not-allowed disabled:opacity-40"
                title={
                  tool === "erase" && eraseBlocked
                    ? tt("请先解锁图层，再使用橡皮擦")
                    : undefined
                }
                style={
                  active
                    ? {
                        borderColor: "var(--awb-accent,#6d5dfc)",
                        background:
                          "color-mix(in srgb, var(--awb-accent,#6d5dfc) 9%, var(--card,#fff))",
                        color: "var(--awb-accent,#6d5dfc)",
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
              className="aspect-square rounded-xl border border-[var(--awb-border)] shadow-sm transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:shadow-md"
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
              className={`w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-4 py-3 text-left text-[var(--fg,#292524)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-[var(--surface-hover,rgba(0,0,0,.035))] ${sampleClass}`}
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
            className="ml-auto rounded-lg bg-[var(--awb-accent,#6d5dfc)] px-3 text-[11px] font-semibold text-[var(--awb-on-accent,#fff)] disabled:opacity-35"
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
            className="rounded-xl bg-[var(--awb-accent,#6d5dfc)] px-3 py-2 text-[11px] font-semibold text-[var(--awb-on-accent,#fff)] disabled:opacity-35"
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
                className="h-7 w-7 rounded-[4px] border transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]"
                style={{
                  borderColor: active
                    ? "var(--awb-accent,#6d5dfc)"
                    : "var(--border,#d6d3d1)",
                  background: active
                    ? "color-mix(in srgb, var(--awb-accent,#6d5dfc) 16%, var(--card,#fff))"
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
                className="rounded-xl border px-2 py-2.5 text-[11px] font-semibold transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]"
                style={
                  active
                    ? {
                        borderColor: "var(--awb-accent,#6d5dfc)",
                        background:
                          "color-mix(in srgb, var(--awb-accent,#6d5dfc) 9%, var(--card,#fff))",
                        color: "var(--awb-accent,#6d5dfc)",
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
              className="rounded-xl border px-1 py-2 text-[11px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]"
              style={
                editor.exportScale === scale
                  ? {
                      borderColor: "var(--awb-accent,#6d5dfc)",
                      color: "var(--awb-accent,#6d5dfc)",
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
          className="mt-4 w-full rounded-xl bg-[var(--awb-accent,#6d5dfc)] px-3 py-2.5 text-[11px] font-semibold text-[var(--awb-on-accent,#fff)] disabled:opacity-40"
        >
          {tt("下载图片")}
        </button>
      </Panel>
    </div>
  );
}

// ===========================================================================
// AI 面板（抠图 / 放大高清 / 人像精修 / 重新打光 / 扩展画面 / 全景延展）
// ---------------------------------------------------------------------------
// 三条铁律，测试逐条锁住：
//  1. 结果一律落成**新图层**（`IMAGE_AI_RESULT_PLACEMENT`），永不覆盖画布。
//     旧的 `runAiEdit()` 走 `replaceWithBackground()`，本面板不走它。
//  2. 能力不可用时**显示灰态 + 理由**，不藏按钮——藏起来用户根本不知道有这功能。
//  3. 超分先在本地算尺寸、越过 8192 当场拦下，不发请求去等服务端退回。
// ===========================================================================

/** 宿主（`ImageRoute`）注入的执行方。面板自己不认识网关。 */
export interface ImageAiPanelHost {
  /** 语义能力的执行方，通常是 `createOceanLeoImageAiProvider()`。 */
  provider: ImageAiProvider | null;
  /** 抠图这类直连能力的执行方。 */
  directExecutor: ImageDirectExecutor | null;
  /** 把当前画布冻成网关取得到的地址 + 不可变源引用。 */
  freezeCanvas: () => Promise<{
    url: string;
    source: Readonly<ImageSourceReference>;
  }>;
}

type RelightDirection = "front" | "back" | "left" | "right" | "top" | "ambient";

const RELIGHT_DIRECTIONS: Array<{ value: RelightDirection; label: string }> = [
  { value: "front", label: "正面光" },
  { value: "left", label: "左侧光" },
  { value: "right", label: "右侧光" },
  { value: "top", label: "顶光" },
  { value: "back", label: "逆光" },
  { value: "ambient", label: "环境光" },
];

const OUTPAINT_MARGINS: Array<{ value: number; label: string }> = [
  { value: 0.25, label: "四周各扩 25%" },
  { value: 0.5, label: "四周各扩 50%" },
];

/** 抠完之后最常见的下一步就是换底色，这六个覆盖证件照与 PPT 配图。 */
const CUTOUT_BACKGROUNDS: Array<{ color: string; label: string }> = [
  { color: "#ffffff", label: "白底" },
  { color: "#f5f5f4", label: "浅灰" },
  { color: "#438edb", label: "证件蓝" },
  { color: "#d64545", label: "证件红" },
  { color: "#18212f", label: "深色" },
  { color: "#16a34a", label: "绿幕" },
];

const PHASE_LABELS: Record<ImageProgressMetadata["phase"], string> = {
  validating: "正在校对画布",
  uploading: "正在上传底图",
  queued: "排队中",
  processing: "正在处理",
  finalizing: "正在收尾",
  complete: "已完成",
  canceling: "正在取消",
};

interface ImageAiPreview {
  capability: ImageAiPanelCapability;
  beforeUrl: string;
  afterUrl: string;
  alpha: boolean;
}

interface ImageAiRunOptions {
  prompt: string;
  scale: 2 | 4;
  direction: RelightDirection;
  margin: number;
}

function semanticImageCommand(
  id: ImageSemanticCommandId,
  options: ImageAiRunOptions,
  doc: { width: number; height: number },
): ImageAiCommand {
  const prompt = options.prompt.trim();
  const withPrompt = prompt ? { prompt } : {};
  switch (id) {
    case "upscale":
      return { id: "upscale", params: { scale: options.scale } };
    case "portrait-quality":
      return { id: "portrait-quality", params: { ...withPrompt } };
    case "panorama":
      return { id: "panorama", params: { ...withPrompt } };
    case "relight":
      return {
        id: "relight",
        params: { direction: options.direction, ...withPrompt },
      };
    case "outpaint": {
      const horizontal = Math.max(1, Math.round(doc.width * options.margin));
      const vertical = Math.max(1, Math.round(doc.height * options.margin));
      return {
        id: "outpaint",
        params: {
          top: vertical,
          bottom: vertical,
          left: horizontal,
          right: horizontal,
          ...withPrompt,
        },
      };
    }
    default:
      throw new Error(`AI 面板没有接出 ${id}`);
  }
}

/**
 * 扩展画面同样会把图撑大，和超分一样要在本地先拦。
 * 返回空串表示放行。
 */
function outpaintPreflightReason(
  doc: { width: number; height: number },
  margin: number,
): string {
  const width = Math.round(doc.width * (1 + margin * 2));
  const height = Math.round(doc.height * (1 + margin * 2));
  if (Math.max(width, height) <= IMAGE_MAX_DIMENSION) return "";
  return (
    `扩展后是 ${width}×${height}，超过 ${IMAGE_MAX_DIMENSION}px 上限。` +
    `请改用更小的扩展幅度。`
  );
}

interface ImageAiCapabilityView {
  capability: ImageAiPanelCapability;
  enabled: boolean;
  disabledReason: string;
}

function useImageAiPanel(
  editor: FabricImageEditorState,
  host: ImageAiPanelHost,
) {
  const [busyId, setBusyId] = useState<ImageCapabilityId | "">("");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<ImageProgressMetadata["phase"]>("validating");
  const [failure, setFailure] = useState<Readonly<ImageAiFailure> | null>(null);
  const [preview, setPreview] = useState<ImageAiPreview | null>(null);
  const [applied, setApplied] = useState(false);
  const busyRef = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const sendToBottomRef = useRef(false);

  // 换背景图：新图层加进来时是最上层且被选中，下一拍把它压到底。
  const selectedId = editor.selected?.id || "";
  useEffect(() => {
    if (!sendToBottomRef.current || !selectedId) return;
    sendToBottomRef.current = false;
    editor.moveLayer(selectedId, "bottom");
  }, [editor.moveLayer, selectedId]);

  const capabilities = useMemo<readonly ImageAiCapabilityView[]>(
    () =>
      IMAGE_AI_PANEL_CAPABILITIES.map((capability) => {
        if (capability.kind === "direct") {
          const endpoint =
            IMAGE_DIRECT_COMMAND_REGISTRY.find(
              (entry) => entry.id === capability.id,
            )?.endpoint || capability.id;
          return {
            capability,
            enabled: Boolean(host.directExecutor),
            disabledReason: host.directExecutor
              ? ""
              : `这台环境没有接通图片 AI 网关，${endpoint} 用不了。`,
          };
        }
        const availability = imageCommandAvailability(
          capability.id as ImageSemanticCommandId,
          host.provider,
        );
        return {
          capability,
          enabled: availability.enabled,
          disabledReason: availability.enabled ? "" : availability.reason || "",
        };
      }),
    [host.directExecutor, host.provider],
  );

  const cancel = useCallback(() => {
    cancelRef.current?.();
  }, []);

  const run = useCallback(
    async (view: ImageAiCapabilityView, options: ImageAiRunOptions) => {
      if (busyRef.current) return;
      const { capability } = view;
      setFailure(null);
      setPreview(null);
      setApplied(false);
      setProgress(0);
      setPhase("validating");
      if (!view.enabled) {
        setFailure({
          kind: "unavailable",
          title: "这条能力现在用不了",
          detail: view.disabledReason || "没有可用的执行方。",
          retryable: false,
        });
        return;
      }
      // 本地预检：越界的请求根本不发出去（任务书 P3）。
      if (capability.id === "upscale") {
        const preflight = imageUpscalePreflight(
          editor.doc.width,
          editor.doc.height,
          options.scale,
        );
        if (!preflight.ok) {
          setFailure({
            kind: "too-large",
            title: "图太大",
            detail: preflight.reason || "放大后超过尺寸上限。",
            retryable: false,
          });
          return;
        }
      }
      if (capability.id === "outpaint") {
        const reason = outpaintPreflightReason(editor.doc, options.margin);
        if (reason) {
          setFailure({
            kind: "too-large",
            title: "图太大",
            detail: reason,
            retryable: false,
          });
          return;
        }
      }
      busyRef.current = true;
      setBusyId(capability.id);
      try {
        const frozen = await host.freezeCanvas();
        const onProgress = (value: Readonly<ImageProgressMetadata>) => {
          setPhase(value.phase);
          setProgress(value.progress);
        };
        let afterUrl = "";
        if (capability.kind === "direct") {
          const handle = startImageDirectCommand(
            host.directExecutor,
            "remove-bg",
            { sourceUrl: frozen.url },
            { onProgress },
          );
          cancelRef.current = handle.cancel;
          const result = await handle.result;
          if (result.status === "canceled") return;
          if (result.status !== "succeeded") {
            setFailure(
              result.failure || {
                kind: "unavailable",
                title: "这条能力现在用不了",
                detail: result.disabledReason || "没有可用的执行方。",
                retryable: false,
              },
            );
            return;
          }
          afterUrl = result.outputs[0]?.url || "";
        } else {
          const command = semanticImageCommand(
            capability.id as ImageSemanticCommandId,
            options,
            editor.doc,
          );
          const recipe = createImageRecipeDocument(frozen.source);
          const handle = startImageAiCommand(
            host.provider,
            command,
            { source: frozen.source, parentLineage: recipe.lineage },
            {
              onState: (snapshot) => {
                setPhase(snapshot.progress.phase);
                setProgress(snapshot.progress.progress);
              },
            },
          );
          cancelRef.current = handle.cancel;
          const receipt = await handle.result;
          if (receipt.status === "canceled") return;
          if (receipt.status === "unsupported") {
            setFailure({
              kind: "unavailable",
              title: "这条能力现在用不了",
              detail: receipt.disabledReason || "没有可用的执行方。",
              retryable: false,
            });
            return;
          }
          if (receipt.status === "failed") {
            setFailure(
              classifyImageAiFailure(
                Object.assign(new Error(receipt.error?.message || "处理失败"), {
                  code: receipt.error?.code,
                  retryable: receipt.error?.retryable,
                }),
              ),
            );
            return;
          }
          afterUrl = receipt.outputs[0]?.url || "";
        }
        if (!afterUrl) {
          setFailure({
            kind: "unknown",
            title: "处理失败",
            detail: "服务端没有返回结果图。",
            retryable: true,
          });
          return;
        }
        setPreview({
          capability,
          beforeUrl: frozen.url,
          afterUrl,
          alpha: capability.id === "remove-bg",
        });
      } catch (caught) {
        setFailure(classifyImageAiFailure(caught));
      } finally {
        busyRef.current = false;
        cancelRef.current = null;
        setBusyId("");
      }
    },
    [editor.doc, host],
  );

  /**
   * 唯一的落地方式。`IMAGE_AI_RESULT_PLACEMENT` 只有 `new-layer` 一个合法值，
   * 这里显式对它设防，改成覆盖背景会当场抛。
   */
  const applyAsNewLayer = useCallback(async () => {
    if (!preview) return;
    if (IMAGE_AI_RESULT_PLACEMENT !== "new-layer") {
      throw new Error("AI 结果只能加成新图层，不许覆盖用户画布");
    }
    await editor.addImageFromUrl(preview.afterUrl);
    setApplied(true);
  }, [editor.addImageFromUrl, preview]);

  const discard = useCallback(() => {
    setPreview(null);
    setApplied(false);
  }, []);

  const swapBackgroundColor = useCallback(
    (color: string) => {
      editor.setCanvasBackground(color);
    },
    [editor.setCanvasBackground],
  );

  const swapBackgroundImage = useCallback(
    async (file: File) => {
      sendToBottomRef.current = true;
      await editor.addImageFromFile(file);
    },
    [editor.addImageFromFile],
  );

  return {
    capabilities,
    busyId,
    progress,
    phase,
    failure,
    preview,
    applied,
    run,
    cancel,
    applyAsNewLayer,
    discard,
    swapBackgroundColor,
    swapBackgroundImage,
  };
}

const CHECKERBOARD =
  "repeating-conic-gradient(#d6d3d1 0% 25%, #ffffff 0% 50%) 50% / 16px 16px";

function BeforeAfter({ preview, tt }: { preview: ImageAiPreview; tt: (value: string) => string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        { label: "处理前", url: preview.beforeUrl, alpha: false },
        { label: "处理后", url: preview.afterUrl, alpha: preview.alpha },
      ].map((side) => (
        <figure key={side.label} className="m-0">
          <div
            className="grid aspect-square place-items-center overflow-hidden rounded-xl border border-[var(--border,#e7e5e4)]"
            style={side.alpha ? { background: CHECKERBOARD } : undefined}
          >
            {/* 网关返回的是跨域 CDN 地址，next/image 的 loader 吃不下，这里直接用 img。 */}
            <img
              src={side.url}
              alt={tt(side.label)}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <figcaption className="mt-1 text-center text-[10px] text-[var(--muted,#78716c)]">
            {tt(side.label)}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function FabricImageAiPanel({
  editor,
  host,
}: {
  editor: FabricImageEditorState;
  host: ImageAiPanelHost;
}) {
  const tt = useUI();
  const panel = useImageAiPanel(editor, host);
  const [prompt, setPrompt] = useState("");
  const [scale, setScale] = useState<2 | 4>(2);
  const [direction, setDirection] = useState<RelightDirection>("front");
  const [margin, setMargin] = useState(0.25);
  const backgroundFileRef = useRef<HTMLInputElement | null>(null);
  const options: ImageAiRunOptions = { prompt, scale, direction, margin };
  const upscale = imageUpscalePreflight(
    editor.doc.width,
    editor.doc.height,
    scale,
  );
  const busy = Boolean(panel.busyId);

  return (
    <div className="min-h-full bg-[var(--card,#fff)]">
      {panel.preview && (
        <Panel
          title={tt(`${panel.preview.capability.label}结果`)}
          description={tt("确认之后会加成新的一层，原来的画面一个像素都不动。")}
        >
          <BeforeAfter preview={panel.preview} tt={tt} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void panel.applyAsNewLayer()}
              className="rounded-xl bg-[var(--awb-accent,#6d5dfc)] px-3 py-2.5 text-[11px] font-semibold text-[var(--awb-on-accent,#fff)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]"
              style={{
                transitionDuration: "var(--leo-dur-2)",
                transitionTimingFunction: "var(--leo-ease-standard)",
              }}
            >
              {tt("应用为新图层")}
            </button>
            <button
              type="button"
              onClick={panel.discard}
              className="rounded-xl border border-[var(--border,#e7e5e4)] px-3 py-2.5 text-[11px] font-semibold transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]"
              style={{
                transitionDuration: "var(--leo-dur-2)",
                transitionTimingFunction: "var(--leo-ease-standard)",
              }}
            >
              {tt("放弃")}
            </button>
          </div>
          {panel.applied && panel.preview.alpha && (
            <div className="mt-4">
              <p className="text-[11px] font-medium text-[var(--fg-2,#57534e)]">
                {tt("接着换个背景")}
              </p>
              <div className="mt-2 grid grid-cols-6 gap-1.5">
                {CUTOUT_BACKGROUNDS.map((entry) => (
                  <button
                    key={entry.color}
                    type="button"
                    title={tt(entry.label)}
                    aria-label={tt(entry.label)}
                    onClick={() => panel.swapBackgroundColor(entry.color)}
                    className="aspect-square rounded-lg border border-[var(--border,#e7e5e4)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5"
                    style={{
                      background: entry.color,
                      transitionDuration: "var(--leo-dur-2)",
                      transitionTimingFunction: "var(--leo-ease-standard)",
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => backgroundFileRef.current?.click()}
                className="mt-2 w-full rounded-xl border border-[var(--border,#e7e5e4)] px-3 py-2 text-[11px] font-semibold"
              >
                {tt("换成背景图片")}
              </button>
              <input
                ref={backgroundFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void panel.swapBackgroundImage(file);
                  event.currentTarget.value = "";
                }}
              />
            </div>
          )}
        </Panel>
      )}

      {panel.failure && (
        <Panel title={tt(panel.failure.title)}>
          <p
            role="alert"
            className="text-[11px] leading-relaxed text-[var(--danger,#b91c1c)]"
          >
            {panel.failure.detail}
          </p>
        </Panel>
      )}

      {busy && (
        <Panel title={tt(PHASE_LABELS[panel.phase])}>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-hover,rgba(0,0,0,.06))]">
            <div
              className="h-full rounded-full bg-[var(--awb-accent,#6d5dfc)] transition-[width] duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)]"
              style={{
                width: `${Math.round(panel.progress * 100)}%`,
                transitionDuration: "var(--leo-dur-3)",
                transitionTimingFunction: "var(--leo-ease-decelerate)",
              }}
            />
          </div>
          <button
            type="button"
            onClick={panel.cancel}
            className="mt-3 w-full rounded-xl border border-[var(--border,#e7e5e4)] px-3 py-2 text-[11px] font-semibold"
          >
            {tt("取消")}
          </button>
        </Panel>
      )}

      {panel.capabilities.map((view) => {
        const { capability } = view;
        const running = panel.busyId === capability.id;
        const blocked = capability.id === "upscale" && !upscale.ok;
        return (
          <Panel
            key={capability.id}
            title={tt(capability.label)}
            description={tt(capability.summary)}
          >
            {capability.id === "upscale" && (
              <>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  {([2, 4] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setScale(value)}
                      className="rounded-xl border px-3 py-2 text-[11px] font-semibold transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]"
                      style={{
                        transitionDuration: "var(--leo-dur-2)",
                        transitionTimingFunction: "var(--leo-ease-standard)",
                        ...(scale === value
                          ? {
                              borderColor: "var(--awb-accent,#6d5dfc)",
                              color: "var(--awb-accent,#6d5dfc)",
                            }
                          : { borderColor: "var(--border,#e7e5e4)" }),
                      }}
                    >
                      {value}×
                    </button>
                  ))}
                </div>
                <p className="mb-2 text-[10px] text-[var(--muted,#78716c)]">
                  {editor.doc.width}×{editor.doc.height} → {upscale.width}×
                  {upscale.height} px
                </p>
                {!upscale.ok && (
                  <p className="mb-2 text-[10px] leading-relaxed text-[var(--danger,#b91c1c)]">
                    {upscale.reason}
                  </p>
                )}
              </>
            )}

            {capability.id === "relight" && (
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                {RELIGHT_DIRECTIONS.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => setDirection(entry.value)}
                    className="rounded-lg border px-2 py-1.5 text-[10px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]"
                    style={{
                      transitionDuration: "var(--leo-dur-2)",
                      transitionTimingFunction: "var(--leo-ease-standard)",
                      ...(direction === entry.value
                        ? {
                            borderColor: "var(--awb-accent,#6d5dfc)",
                            color: "var(--awb-accent,#6d5dfc)",
                          }
                        : { borderColor: "var(--border,#e7e5e4)" }),
                    }}
                  >
                    {tt(entry.label)}
                  </button>
                ))}
              </div>
            )}

            {capability.id === "outpaint" && (
              <div className="mb-2 grid grid-cols-2 gap-2">
                {OUTPAINT_MARGINS.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => setMargin(entry.value)}
                    className="rounded-lg border px-2 py-1.5 text-[10px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]"
                    style={{
                      transitionDuration: "var(--leo-dur-2)",
                      transitionTimingFunction: "var(--leo-ease-standard)",
                      ...(margin === entry.value
                        ? {
                            borderColor: "var(--awb-accent,#6d5dfc)",
                            color: "var(--awb-accent,#6d5dfc)",
                          }
                        : { borderColor: "var(--border,#e7e5e4)" }),
                    }}
                  >
                    {tt(entry.label)}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={!view.enabled || busy || blocked}
              onClick={() => void panel.run(view, options)}
              className="w-full rounded-xl px-3 py-2.5 text-[11px] font-semibold transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] disabled:cursor-not-allowed disabled:opacity-45"
              style={{
                transitionDuration: "var(--leo-dur-2)",
                transitionTimingFunction: "var(--leo-ease-standard)",
                background: capability.featured
                  ? "var(--awb-accent,#6d5dfc)"
                  : "transparent",
                color: capability.featured
                  ? "var(--awb-on-accent,#fff)"
                  : "var(--fg,#292524)",
                border: capability.featured
                  ? "1px solid transparent"
                  : "1px solid var(--border,#e7e5e4)",
              }}
            >
              {running ? tt("处理中…") : tt(`开始${capability.label}`)}
            </button>

            {/* P4：能力不可达时显示理由，不藏按钮。 */}
            {!view.enabled && view.disabledReason && (
              <p className="mt-2 text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
                {view.disabledReason}
              </p>
            )}
          </Panel>
        );
      })}

      <Panel
        title={tt("补充说明（选填）")}
        description={tt("想让 AI 特别注意什么，就写在这里；留空也能跑。")}
      >
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder={tt("例如：保留衣服上的纹理")}
          className="w-full resize-none rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2 text-[11px] outline-none"
        />
      </Panel>
    </div>
  );
}

