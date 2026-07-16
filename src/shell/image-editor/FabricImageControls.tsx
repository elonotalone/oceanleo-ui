"use client";

import { useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { CHROME, PanelSection, ToolButton } from "../editor-chrome";
import {
  CANVAS_PRESETS,
  type FabricImageEditorState,
  type ShapeKind,
} from "./types";

// 图片编辑器 overlay 侧栏内容（Canva 骨架 v2，2026-07-16）。
// ---------------------------------------------------------------------------
// 撤销/重做、加文字/形状/图片、下载/保存已上移到统一顶栏（AdvancedTopBar），
// 选中对象的样式（字体/颜色/滤镜/裁剪…）在对象上方浮动 bar。这里只承载需要
// 面板铺开的复杂选择项：工具/画笔 · 图层 · 调整（滤镜）· 画布背景 · AI 局部创作
// · 导出设置。全部走语义 CSS 变量令牌（CHROME / var(--token)），天然跟随深浅主题。

// 面板内的方块选择按钮（激活态用站点 accent），复用 CHROME hover/token。
function ChipButton({
  active,
  children,
  onClick,
  disabled,
  accent,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  accent: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-2 py-1.5 text-[11px] transition disabled:opacity-40 ${CHROME.hover}`}
      style={
        active
          ? { borderColor: accent, color: accent, background: `${accent}12` }
          : { borderColor: "var(--border,#e7e5e4)", color: "var(--fg-2,#57534e)" }
      }
    >
      {children}
    </button>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  accent,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  accent: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className={`mb-1 flex justify-between text-[10px] ${CHROME.muted}`}>
        <span>{label}</span>
        <span className="tabular-nums text-[var(--fg,#1c1917)]">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
        style={{ accentColor: accent }}
      />
    </label>
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
  const filters = editor.filterInfo?.settings;

  const addUrl = async () => {
    if (!imageUrl.trim()) return;
    await editor.addImageFromUrl(imageUrl);
    setImageUrl("");
  };

  return (
    <div className="space-y-1">
      <PanelSection title={tt("工具")}>
        <div className="grid grid-cols-3 gap-1.5">
          <ChipButton accent={accent} active={editor.activeTool === "select"} onClick={() => editor.setActiveTool("select")}>
            {tt("选择")}
          </ChipButton>
          <ChipButton accent={accent} active={editor.activeTool === "draw"} onClick={() => editor.setActiveTool("draw")}>
            {tt("画笔")}
          </ChipButton>
          <ChipButton accent={accent} active={editor.activeTool === "erase"} onClick={() => editor.setActiveTool("erase")}>
            {tt("橡皮")}
          </ChipButton>
        </div>
        {(editor.activeTool === "draw" || editor.activeTool === "erase") && (
          <>
            <label className={`flex items-center justify-between text-[10px] ${CHROME.muted}`}>
              {tt("笔刷颜色")}
              <input
                type="color"
                value={editor.brush.color}
                disabled={editor.activeTool === "erase"}
                onChange={(event) => editor.setBrush({ color: event.target.value })}
                className="h-7 w-12 rounded border-0 bg-transparent"
              />
            </label>
            <Range accent={accent} label={tt("笔刷大小")} value={editor.brush.width} min={1} max={120} onChange={(width) => editor.setBrush({ width })} suffix="px" />
          </>
        )}
      </PanelSection>

      <PanelSection title={tt("添加对象")}>
        <div className="grid grid-cols-3 gap-1.5">
          <ChipButton accent={accent} onClick={editor.addText}>{tt("文字")}</ChipButton>
          {(["rect", "circle", "ellipse", "line", "arrow"] as ShapeKind[]).map((shape) => (
            <ChipButton accent={accent} key={shape} onClick={() => editor.addShape(shape)}>
              {tt({ rect: "矩形", circle: "圆形", ellipse: "椭圆", line: "线条", arrow: "箭头" }[shape])}
            </ChipButton>
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
        <ChipButton accent={accent} onClick={() => fileRef.current?.click()}>{tt("添加本地图片图层")}</ChipButton>
        <div className="flex gap-1">
          <input
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addUrl();
            }}
            placeholder={tt("粘贴图片 URL")}
            className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[10px] outline-none ${CHROME.border} ${CHROME.subtle} text-[var(--fg,#1c1917)] placeholder:text-[var(--faint,#a8a29e)] focus:border-[var(--border-strong,#a8a29e)]`}
          />
          <ChipButton accent={accent} disabled={!imageUrl.trim()} onClick={() => void addUrl()}>{tt("添加")}</ChipButton>
        </div>
      </PanelSection>

      <PanelSection title={tt("图层")}>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {[...editor.layers].reverse().map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => editor.selectLayer(layer.id)}
              className={`flex w-full items-center gap-1 rounded-lg border px-2 py-1.5 text-left text-[10px] transition ${CHROME.hover}`}
              style={
                layer.selected
                  ? { borderColor: accent, color: accent, background: `${accent}12` }
                  : { borderColor: "var(--border,#e7e5e4)", color: "var(--fg-2,#57534e)" }
              }
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
          {editor.layers.length === 0 && (
            <p className={`px-1 text-[11px] leading-relaxed ${CHROME.muted}`}>
              {tt("用顶栏“加文字/形状/图片”创建图层，或从素材库拖入图片。")}
            </p>
          )}
        </div>
      </PanelSection>

      <PanelSection title={tt("调整")} defaultOpen={Boolean(filters)}>
        {filters ? (
          <>
            <Range accent={accent} label={tt("亮度")} value={filters.brightness} min={-100} max={100} onChange={(value) => editor.setFilter("brightness", value)} />
            <Range accent={accent} label={tt("对比度")} value={filters.contrast} min={-100} max={100} onChange={(value) => editor.setFilter("contrast", value)} />
            <Range accent={accent} label={tt("饱和度")} value={filters.saturation} min={-100} max={100} onChange={(value) => editor.setFilter("saturation", value)} />
            <Range accent={accent} label={tt("模糊")} value={filters.blur} min={0} max={100} onChange={(value) => editor.setFilter("blur", value)} />
            <Range accent={accent} label={tt("像素化")} value={filters.pixelate} min={0} max={100} onChange={(value) => editor.setFilter("pixelate", value)} />
            <div className="grid grid-cols-3 gap-1.5">
              <ChipButton accent={accent} active={filters.grayscale} onClick={() => editor.setFilter("grayscale", !filters.grayscale)}>{tt("黑白")}</ChipButton>
              <ChipButton accent={accent} active={filters.sepia} onClick={() => editor.setFilter("sepia", !filters.sepia)}>{tt("怀旧")}</ChipButton>
              <ChipButton accent={accent} active={filters.invert} onClick={() => editor.setFilter("invert", !filters.invert)}>{tt("反相")}</ChipButton>
            </div>
            <button
              type="button"
              onClick={editor.resetFilters}
              className={`w-full rounded-lg border px-2 py-1.5 text-[10px] transition ${CHROME.border} ${CHROME.fg2} ${CHROME.hover}`}
            >
              {tt("重置滤镜")}
            </button>
          </>
        ) : (
          <p className={`px-1 text-[11px] leading-relaxed ${CHROME.muted}`}>
            {tt("选中一张图片图层后可在这里调整亮度、对比度与滤镜。")}
          </p>
        )}
      </PanelSection>

      <PanelSection title={tt("画布背景")}>
        <div className="grid grid-cols-2 gap-1">
          {CANVAS_PRESETS.map((preset) => (
            <ChipButton
              accent={accent}
              key={preset.id}
              active={editor.doc.width === preset.width && editor.doc.height === preset.height}
              onClick={() => {
                editor.resizeDoc(preset.width, preset.height);
                setCustomWidth(preset.width);
                setCustomHeight(preset.height);
              }}
            >
              {tt(preset.label)}
            </ChipButton>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1">
          <input type="number" value={customWidth} min={16} max={8192} onChange={(event) => setCustomWidth(Number(event.target.value))} className={`min-w-0 rounded border px-2 py-1 text-[10px] ${CHROME.border} ${CHROME.subtle} text-[var(--fg,#1c1917)]`} />
          <span className={CHROME.muted}>×</span>
          <input type="number" value={customHeight} min={16} max={8192} onChange={(event) => setCustomHeight(Number(event.target.value))} className={`min-w-0 rounded border px-2 py-1 text-[10px] ${CHROME.border} ${CHROME.subtle} text-[var(--fg,#1c1917)]`} />
          <ChipButton accent={accent} onClick={() => editor.resizeDoc(customWidth, customHeight)}>{tt("应用")}</ChipButton>
        </div>
        <label className={`flex items-center justify-between text-[10px] ${CHROME.muted}`}>
          {tt("画布背景")}
          <input type="color" value={editor.canvasBackground} onChange={(event) => editor.setCanvasBackground(event.target.value)} />
        </label>
      </PanelSection>

      <PanelSection title={tt("AI 局部创作")} defaultOpen={false}>
        <textarea
          value={editor.aiPrompt}
          onChange={(event) => editor.setAiPrompt(event.target.value)}
          rows={4}
          placeholder={tt("描述希望 AI 如何修改当前画面")}
          className={`w-full resize-y rounded-lg border p-2 text-[10px] outline-none ${CHROME.border} ${CHROME.subtle} text-[var(--fg,#1c1917)] placeholder:text-[var(--faint,#a8a29e)] focus:border-[var(--border-strong,#a8a29e)]`}
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
      </PanelSection>

      <PanelSection title={tt("导出设置")} defaultOpen={false}>
        <div className="grid grid-cols-3 gap-1">
          {(["png", "jpeg", "webp"] as const).map((format) => (
            <ChipButton accent={accent} key={format} active={editor.exportFormat === format} onClick={() => editor.setExportFormat(format)}>
              {format.toUpperCase()}
            </ChipButton>
          ))}
        </div>
        {editor.exportFormat !== "png" && (
          <Range accent={accent} label={tt("输出质量")} value={editor.exportQuality} min={10} max={100} onChange={editor.setExportQuality} suffix="%" />
        )}
        <Range accent={accent} label={tt("输出倍率")} value={editor.exportScale} min={0.5} max={4} step={0.25} onChange={editor.setExportScale} suffix="×" />
        <div className="grid grid-cols-2 gap-1.5">
          <ToolButton label={tt("下载")} icon="download" accent={accent} disabled={editor.loading} onClick={editor.download} />
          <ToolButton label={editor.saving ? tt("保存中…") : tt("保存")} icon="save" accent={accent} disabled={editor.loading || editor.saving} onClick={() => void editor.save()} />
        </div>
      </PanelSection>
    </div>
  );
}
