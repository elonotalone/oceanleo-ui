"use client";

import { useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import {
  CANVAS_PRESETS,
  type FabricImageEditorState,
  type ShapeKind,
} from "./types";

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
    <details open={open} className="border-b border-stone-100">
      <summary className="cursor-pointer select-none px-3 py-2.5 text-[11px] font-semibold text-stone-700">
        {title}
      </summary>
      <div className="space-y-2 px-3 pb-3">{children}</div>
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
      <span className="mb-1 flex justify-between text-[10px] text-stone-500">
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
        className="w-full accent-stone-700"
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
      className={`rounded-lg border px-2 py-1.5 text-[10px] transition disabled:opacity-40 ${
        active
          ? "border-stone-800 bg-stone-800 text-white"
          : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
      }`}
    >
      {children}
    </button>
  );
}

export function FabricImageControls({
  editor,
  accent = "#4f46e5",
}: {
  editor: FabricImageEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [customWidth, setCustomWidth] = useState(editor.doc.width);
  const [customHeight, setCustomHeight] = useState(editor.doc.height);

  const addUrl = async () => {
    if (!imageUrl.trim()) return;
    await editor.addImageFromUrl(imageUrl);
    setImageUrl("");
  };

  return (
    <div className="h-full overflow-y-auto bg-white">
      <Section title={tt("工具")}>
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
            <label className="flex items-center justify-between text-[10px] text-stone-500">
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
      </Section>

      <Section title={tt("添加对象")}>
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
            className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-[10px] outline-none focus:border-stone-400"
          />
          <ToolButton disabled={!imageUrl.trim()} onClick={() => void addUrl()}>{tt("添加")}</ToolButton>
        </div>
      </Section>

      <Section title={tt("图层")}>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {[...editor.layers].reverse().map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => editor.selectLayer(layer.id)}
              className={`flex w-full items-center gap-1 rounded-lg border px-2 py-1.5 text-left text-[10px] ${
                layer.selected ? "border-stone-700 bg-stone-50" : "border-stone-100"
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
      </Section>

      <Section title={tt("画布")}>
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
          <input type="number" value={customWidth} min={16} max={8192} onChange={(event) => setCustomWidth(Number(event.target.value))} className="min-w-0 rounded border border-stone-200 px-2 py-1 text-[10px]" />
          <span className="text-stone-400">×</span>
          <input type="number" value={customHeight} min={16} max={8192} onChange={(event) => setCustomHeight(Number(event.target.value))} className="min-w-0 rounded border border-stone-200 px-2 py-1 text-[10px]" />
          <ToolButton onClick={() => editor.resizeDoc(customWidth, customHeight)}>{tt("应用")}</ToolButton>
        </div>
        <label className="flex items-center justify-between text-[10px] text-stone-500">
          {tt("画布背景")}
          <input type="color" value={editor.canvasBackground} onChange={(event) => editor.setCanvasBackground(event.target.value)} />
        </label>
      </Section>

      <Section title={tt("AI 局部创作")} open={false}>
        <textarea
          value={editor.aiPrompt}
          onChange={(event) => editor.setAiPrompt(event.target.value)}
          rows={4}
          placeholder={tt("描述希望 AI 如何修改当前画面")}
          className="w-full resize-y rounded-lg border border-stone-200 p-2 text-[10px] outline-none focus:border-stone-400"
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
      </Section>

      <Section title={tt("导出设置")}>
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
      </Section>
    </div>
  );
}
