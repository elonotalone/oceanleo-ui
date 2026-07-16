"use client";

import { useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { AdvancedFontPicker } from "../AdvancedFontPicker";
import {
  CANVAS_PRESETS,
  type FabricImageEditorState,
  type ShapeKind,
} from "./types";

export type FabricImageControlSection =
  | "tools"
  | "objects"
  | "layers"
  | "canvas"
  | "ai"
  | "export";

function Section({
  title,
  children,
  open = true,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="border-b border-[var(--border,#e7e5e4)]">
      <summary className="cursor-pointer select-none px-4 py-3 text-[11px] font-semibold text-[var(--fg,#292524)]">
        {title}
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-[10px] text-[var(--muted,#78716c)]">
        <span>{label}</span>
        <span>{Math.round(value * 100) / 100}{suffix}</span>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--accent,#7c3aed)]"
      />
    </label>
  );
}

function ToolButton({
  active,
  children,
  onClick,
  disabled,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border px-2.5 py-2 text-[10px] font-medium transition hover:-translate-y-0.5 disabled:opacity-40 ${
        active
          ? "border-[var(--accent,#7c3aed)] bg-[var(--accent,#7c3aed)] text-white shadow-sm"
          : "border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] hover:shadow-sm"
      }`}
    >
      {children}
    </button>
  );
}

export function FabricImageControls({
  editor,
  accent = "#4f46e5",
  sections = ["tools", "objects", "layers", "canvas", "ai", "export"],
}: {
  editor: FabricImageEditorState;
  accent?: string;
  sections?: FabricImageControlSection[];
}) {
  const tt = useUI();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [customWidth, setCustomWidth] = useState(editor.doc.width);
  const [customHeight, setCustomHeight] = useState(editor.doc.height);
  const has = (section: FabricImageControlSection) =>
    sections.includes(section);

  const addUrl = async () => {
    if (!imageUrl.trim()) return;
    await editor.addImageFromUrl(imageUrl);
    setImageUrl("");
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--card,#fff)]">
      {has("tools") && <Section title={tt("工具")}>
        <div className="grid grid-cols-3 gap-1.5">
          <ToolButton active={editor.activeTool === "select"} onClick={() => editor.setActiveTool("select")}>
            {tt("选择")}
          </ToolButton>
          <ToolButton active={editor.activeTool === "draw"} onClick={() => editor.setActiveTool("draw")}>
            {tt("画笔")}
          </ToolButton>
          <ToolButton active={editor.activeTool === "erase"} onClick={() => editor.setActiveTool("erase")}>
            {tt("橡皮")}
          </ToolButton>
        </div>
        {(editor.activeTool === "draw" || editor.activeTool === "erase") && (
          <>
            <label className="flex items-center justify-between text-[10px] text-[var(--muted,#78716c)]">
              {tt("笔刷颜色")}
              <input
                type="color"
                value={editor.brush.color}
                disabled={editor.activeTool === "erase"}
                onChange={(event) => editor.setBrush({ color: event.target.value })}
                className="h-7 w-12 rounded border-0 bg-transparent"
              />
            </label>
            <Range label={tt("笔刷大小")} value={editor.brush.width} min={1} max={120} onChange={(width) => editor.setBrush({ width })} suffix="px" />
          </>
        )}
      </Section>}

      {has("objects") && <Section title={tt("添加对象")}>
        <div className="grid grid-cols-3 gap-1.5">
          <ToolButton onClick={editor.addText}>{tt("文字")}</ToolButton>
          {(["rect", "circle", "ellipse", "line", "arrow"] as ShapeKind[]).map((shape) => (
            <ToolButton key={shape} onClick={() => editor.addShape(shape)}>
              {tt({ rect: "矩形", circle: "圆形", ellipse: "椭圆", line: "线条", arrow: "箭头" }[shape])}
            </ToolButton>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void editor.addImageFromFile(file);
            event.currentTarget.value = "";
          }}
        />
        <ToolButton onClick={() => fileRef.current?.click()}>{tt("添加本地图片图层")}</ToolButton>
        <div className="flex gap-1">
          <input
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addUrl();
            }}
            placeholder={tt("粘贴图片 URL")}
            className="min-w-0 flex-1 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[10px] text-[var(--fg,#292524)] outline-none focus:border-[var(--accent,#7c3aed)]"
          />
          <ToolButton disabled={!imageUrl.trim()} onClick={() => void addUrl()}>{tt("添加")}</ToolButton>
        </div>
      </Section>}

      {has("layers") && <Section title={tt("图层")}>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {[...editor.layers].reverse().map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => editor.selectLayer(layer.id)}
              className={`flex w-full items-center gap-1 rounded-lg border px-2 py-1.5 text-left text-[10px] ${
                layer.selected
                  ? "border-[var(--accent,#7c3aed)] bg-[var(--surface-hover,rgba(0,0,0,.04))]"
                  : "border-[var(--border,#e7e5e4)]"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{layer.kind}</span>
              <span onClick={(event) => { event.stopPropagation(); editor.toggleLayerVisible(layer.id); }}>{layer.visible ? "◉" : "○"}</span>
              <span onClick={(event) => { event.stopPropagation(); editor.toggleLayerLock(layer.id); }}>{layer.locked ? "🔒" : "◇"}</span>
              {!layer.isBackground && (
                <>
                  <span onClick={(event) => { event.stopPropagation(); editor.moveLayer(layer.id, "up"); }}>↑</span>
                  <span onClick={(event) => { event.stopPropagation(); editor.moveLayer(layer.id, "down"); }}>↓</span>
                </>
              )}
            </button>
          ))}
        </div>
      </Section>}

      {has("canvas") && <Section title={tt("画布")}>
        <div className="grid grid-cols-2 gap-1">
          {CANVAS_PRESETS.map((preset) => (
            <ToolButton
              key={preset.id}
              active={editor.doc.width === preset.width && editor.doc.height === preset.height}
              onClick={() => {
                editor.resizeDoc(preset.width, preset.height);
                setCustomWidth(preset.width);
                setCustomHeight(preset.height);
              }}
            >
              {tt(preset.label)}
            </ToolButton>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1">
          <input type="number" value={customWidth} min={16} max={8192} onChange={(event) => setCustomWidth(Number(event.target.value))} className="min-w-0 rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 py-1.5 text-[10px] text-[var(--fg,#292524)]" />
          <span className="text-[var(--muted,#78716c)]">×</span>
          <input type="number" value={customHeight} min={16} max={8192} onChange={(event) => setCustomHeight(Number(event.target.value))} className="min-w-0 rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 py-1.5 text-[10px] text-[var(--fg,#292524)]" />
          <ToolButton onClick={() => editor.resizeDoc(customWidth, customHeight)}>{tt("应用")}</ToolButton>
        </div>
        <label className="flex items-center justify-between text-[10px] text-[var(--muted,#78716c)]">
          {tt("画布背景")}
          <input type="color" value={editor.canvasBackground} onChange={(event) => editor.setCanvasBackground(event.target.value)} />
        </label>
      </Section>}

      {has("ai") && <Section title={tt("AI 局部创作")} open>
        <textarea
          value={editor.aiPrompt}
          onChange={(event) => editor.setAiPrompt(event.target.value)}
          rows={4}
          placeholder={tt("描述希望 AI 如何修改当前画面")}
          className="w-full resize-y rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-2.5 text-[10px] text-[var(--fg,#292524)] outline-none focus:border-[var(--accent,#7c3aed)]"
        />
        <button
          type="button"
          disabled={!editor.aiPrompt.trim() || editor.aiBusy}
          onClick={() => void editor.runAiEdit()}
          className="w-full rounded-lg px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-40"
          style={{ background: accent }}
        >
          {editor.aiBusy ? tt("AI 处理中…") : tt("应用 AI 修改")}
        </button>
      </Section>}

      {has("export") && <Section title={tt("导出设置")}>
        <div className="grid grid-cols-3 gap-1">
          {(["png", "jpeg", "webp"] as const).map((format) => (
            <ToolButton key={format} active={editor.exportFormat === format} onClick={() => editor.setExportFormat(format)}>
              {format.toUpperCase()}
            </ToolButton>
          ))}
        </div>
        {editor.exportFormat !== "png" && (
          <Range label={tt("输出质量")} value={editor.exportQuality} min={10} max={100} onChange={editor.setExportQuality} suffix="%" />
        )}
        <Range label={tt("输出倍率")} value={editor.exportScale} min={0.5} max={4} step={0.25} onChange={editor.setExportScale} suffix="×" />
      </Section>}
    </div>
  );
}

export function FabricImageFilterPanel({
  editor,
}: {
  editor: FabricImageEditorState;
}) {
  const tt = useUI();
  const settings = editor.filterInfo?.settings;
  if (!settings) {
    return (
      <div className="grid h-full place-items-center bg-[var(--card,#fff)] px-6 text-center text-[11px] leading-5 text-[var(--muted,#78716c)]">
        {tt("请先选择一张图片，再调整滤镜。")}
      </div>
    );
  }
  const ranges: {
    key: "brightness" | "contrast" | "saturation" | "blur" | "pixelate";
    label: string;
    min: number;
    max: number;
  }[] = [
    { key: "brightness", label: "亮度", min: -100, max: 100 },
    { key: "contrast", label: "对比度", min: -100, max: 100 },
    { key: "saturation", label: "饱和度", min: -100, max: 100 },
    { key: "blur", label: "模糊", min: 0, max: 100 },
    { key: "pixelate", label: "像素化", min: 0, max: 100 },
  ];
  const toggles: {
    key: "grayscale" | "sepia" | "invert";
    label: string;
  }[] = [
    { key: "grayscale", label: "黑白" },
    { key: "sepia", label: "复古" },
    { key: "invert", label: "反相" },
  ];
  return (
    <div className="min-h-full bg-[var(--card,#fff)] p-4">
      <div className="mb-4">
        <p className="text-[12px] font-semibold text-[var(--fg,#292524)]">
          {tt("图片调整")}
        </p>
        <p className="mt-1 text-[10px] leading-4 text-[var(--muted,#78716c)]">
          {tt("精细调整当前图片，所有改动都可撤销。")}
        </p>
      </div>
      <div className="space-y-4">
        {ranges.map((range) => (
          <Range
            key={range.key}
            label={tt(range.label)}
            value={settings[range.key]}
            min={range.min}
            max={range.max}
            onChange={(value) => editor.setFilter(range.key, value)}
          />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {toggles.map((toggle) => (
          <ToolButton
            key={toggle.key}
            active={settings[toggle.key]}
            onClick={() =>
              editor.setFilter(toggle.key, !settings[toggle.key])
            }
          >
            {tt(toggle.label)}
          </ToolButton>
        ))}
      </div>
      <button
        type="button"
        onClick={editor.resetFilters}
        className="mt-5 w-full rounded-xl border border-[var(--border,#e7e5e4)] px-3 py-2.5 text-[10px] font-medium text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
      >
        {tt("重置调整")}
      </button>
    </div>
  );
}

export function FabricImageFontPanel({
  editor,
}: {
  editor: FabricImageEditorState;
}) {
  const selected = editor.selected?.text;
  return (
    <AdvancedFontPicker
      selectedFamily={selected?.fontFamily}
      disabled={!selected}
      onSelect={(fontFamily) => editor.setSelectedText({ fontFamily })}
    />
  );
}
