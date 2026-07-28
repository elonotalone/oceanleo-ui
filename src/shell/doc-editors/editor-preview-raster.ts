"use client";

// ============================================================================
// @oceanleo/ui — 办公三件套的封面位图渲染
// ----------------------------------------------------------------------------
// 后端 `_require_displayable_primary` 的白名单只有 image/video/audio/pdf/gltf，
// docx / xlsx / pptx 在结构上永远交不出可展示主产物。chart 与 composite_image 之
// 所以一直是对的，就是因为它们在保存时**自己渲染了一张 PNG**。
//
// 这里给 deck / grid / document 补上同一件事：从编辑器已有的结构化模型直接画到
// 2D canvas，不引入任何新依赖、不做 DOM 截图、不走浏览器自动化。
//
// 失败一律返回 null（SSR、无 canvas、超时都算失败）。是否因此拒绝提交由
// `artifact-save-contract.ts` 的逐类型契约决定，本模块不做策略判断。
// ============================================================================

import type { DeckDocument, DeckElement, DeckSlide } from "./deck-schema";
import type { GridSheet } from "./grid-model";

export const EDITOR_PREVIEW_MEDIA_TYPE = "image/png";
export const EDITOR_PREVIEW_RENDERER = "oceanleo.editor-preview-raster.v1";

const PREVIEW_WIDTH = 1280;
const MAX_PREVIEW_BYTES = 8_000_000;

interface RasterTarget {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

function createRaster(width: number, height: number): RasterTarget | null {
  if (typeof document === "undefined" || !document.createElement) return null;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement("canvas");
  } catch {
    return null;
  }
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext?.("2d");
  if (!context) return null;
  return { canvas, context };
}

async function toPng(target: RasterTarget): Promise<Blob | null> {
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      if (typeof target.canvas.toBlob !== "function") {
        resolve(null);
        return;
      }
      target.canvas.toBlob(
        (value) => resolve(value),
        EDITOR_PREVIEW_MEDIA_TYPE,
      );
    } catch {
      resolve(null);
    }
  });
  if (!blob || blob.size <= 0 || blob.size > MAX_PREVIEW_BYTES) return null;
  return blob;
}

function fillBackground(
  target: RasterTarget,
  color: string,
): void {
  target.context.fillStyle = color;
  target.context.fillRect(0, 0, target.canvas.width, target.canvas.height);
}

/** 逐字符按宽度断行；canvas 没有自动换行。 */
function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const character of String(text || "").replace(/\s+/g, " ")) {
    const candidate = current + character;
    if (context.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = character;
      if (lines.length >= maxLines) return lines;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

const PREVIEW_FONT_STACK =
  '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

function previewFont(sizePx: number, bold = false): string {
  return `${bold ? "600 " : ""}${Math.max(8, Math.round(sizePx))}px ${PREVIEW_FONT_STACK}`;
}

// ---------------------------------------------------------------------------
// deck —— 首页幻灯片
// ---------------------------------------------------------------------------

function deckElementText(element: DeckElement): string {
  if (element.type === "table" && Array.isArray(element.rows)) {
    return element.rows.map((row) => row.join("  ")).join("\n");
  }
  return String(element.text || element.label || element.alt || "");
}

function drawDeckSlide(
  target: RasterTarget,
  slide: DeckSlide,
  background: string,
  textColor: string,
): void {
  const { context, canvas } = target;
  fillBackground(target, background || "#ffffff");
  const elements = [...(slide.elements || [])].sort(
    (left, right) => left.order - right.order,
  );
  if (elements.length > 0) {
    for (const element of elements.slice(0, 60)) {
      const x = (Number(element.x) / 100) * canvas.width;
      const y = (Number(element.y) / 100) * canvas.height;
      const width = Math.max(4, (Number(element.width) / 100) * canvas.width);
      const height = Math.max(4, (Number(element.height) / 100) * canvas.height);
      if (element.type === "shape" || element.fill) {
        context.fillStyle = element.fill || "#e2e8f0";
        context.fillRect(x, y, width, height);
      }
      if (element.type === "image") {
        // 远端图片要跨源取字节，会把保存变成网络依赖；用占位块表达版式即可。
        context.fillStyle = "#cbd5f5";
        context.fillRect(x, y, width, height);
      }
      const text = deckElementText(element);
      if (!text) continue;
      context.fillStyle = element.color || textColor;
      const fontSize =
        Number(element.fontSize) > 0
          ? (Number(element.fontSize) / 100) * canvas.height
          : canvas.height * 0.045;
      context.font = previewFont(fontSize, Boolean(element.bold));
      context.textBaseline = "top";
      const lineHeight = fontSize * 1.35;
      const lines = wrapText(
        context,
        text,
        width,
        Math.max(1, Math.floor(height / lineHeight)),
      );
      lines.forEach((line, index) => {
        context.fillText(line, x, y + index * lineHeight, width);
      });
    }
    return;
  }
  // 旧版 title/bullets 版式（没有 elements 的导入结果）。
  context.fillStyle = textColor;
  context.textBaseline = "top";
  const margin = canvas.width * 0.08;
  let cursor = canvas.height * 0.16;
  context.font = previewFont(canvas.height * 0.09, true);
  for (const line of wrapText(
    context,
    slide.title || "",
    canvas.width - margin * 2,
    2,
  )) {
    context.fillText(line, margin, cursor);
    cursor += canvas.height * 0.11;
  }
  context.font = previewFont(canvas.height * 0.05);
  const bullets = [
    ...(slide.body ? [slide.body] : []),
    ...(slide.bullets || []),
  ].slice(0, 6);
  for (const bullet of bullets) {
    for (const line of wrapText(
      context,
      `• ${bullet}`,
      canvas.width - margin * 2,
      2,
    )) {
      context.fillText(line, margin, cursor);
      cursor += canvas.height * 0.07;
    }
  }
}

export async function renderDeckPreviewPng(
  deck: DeckDocument,
): Promise<Blob | null> {
  const slide = deck?.slides?.[0];
  if (!slide) return null;
  const height = Math.round(
    PREVIEW_WIDTH * (deck.aspect === "4:3" ? 3 / 4 : 9 / 16),
  );
  const target = createRaster(PREVIEW_WIDTH, height);
  if (!target) return null;
  const master = deck.masters?.find((entry) => entry.id === slide.masterId);
  drawDeckSlide(
    target,
    slide,
    slide.background || master?.background || "#ffffff",
    master?.textColor || "#0f172a",
  );
  return toPng(target);
}

// ---------------------------------------------------------------------------
// grid —— 首个工作表左上角
// ---------------------------------------------------------------------------

const GRID_PREVIEW_ROWS = 24;
const GRID_PREVIEW_COLS = 10;

export async function renderGridPreviewPng(
  sheets: GridSheet[],
  options: { headerRow?: boolean } = {},
): Promise<Blob | null> {
  const sheet = sheets?.[0];
  if (!sheet) return null;
  const rowCount = Math.min(GRID_PREVIEW_ROWS, Math.max(1, sheet.rows.length));
  const colCount = Math.min(
    GRID_PREVIEW_COLS,
    Math.max(1, sheet.rows[0]?.length || 1),
  );
  const cellWidth = PREVIEW_WIDTH / colCount;
  const cellHeight = 44;
  const target = createRaster(PREVIEW_WIDTH, cellHeight * (rowCount + 1));
  if (!target) return null;
  const { context, canvas } = target;
  fillBackground(target, "#ffffff");
  context.textBaseline = "middle";

  context.fillStyle = "#f1f5f9";
  context.fillRect(0, 0, canvas.width, cellHeight);
  context.fillStyle = "#475569";
  context.font = previewFont(18, true);
  context.fillText(sheet.name || "Sheet1", 12, cellHeight / 2, canvas.width - 24);

  for (let row = 0; row < rowCount; row += 1) {
    const top = cellHeight * (row + 1);
    const isHeader = options.headerRow !== false && row === 0;
    if (isHeader) {
      context.fillStyle = "#e2e8f0";
      context.fillRect(0, top, canvas.width, cellHeight);
    }
    for (let col = 0; col < colCount; col += 1) {
      const left = cellWidth * col;
      context.strokeStyle = "#e5e7eb";
      context.lineWidth = 1;
      context.strokeRect(left, top, cellWidth, cellHeight);
      const value = String(sheet.rows[row]?.[col] ?? "");
      if (!value) continue;
      const format = sheet.formats?.[`${row}:${col}`];
      context.fillStyle = format?.color || "#0f172a";
      context.font = previewFont(17, Boolean(format?.bold) || isHeader);
      const [line] = wrapText(context, value, cellWidth - 16, 1);
      if (line) {
        context.fillText(line, left + 8, top + cellHeight / 2, cellWidth - 16);
      }
    }
  }
  return toPng(target);
}

// ---------------------------------------------------------------------------
// audio —— 波形图
// ---------------------------------------------------------------------------

/** 只取用得到的那两个字段，避免在 SSR 图里硬依赖 DOM 的 AudioBuffer 类型。 */
export interface WaveformSource {
  length: number;
  getChannelData(channel: number): Float32Array;
}

const WAVEFORM_HEIGHT = 320;

/**
 * 音频没有天然的封面。矩阵 §3.2 第 11 行要求 `preview` 或 `full` 至少有一项，而
 * 音频编辑器是「源 URL + 操作日志」模型，保存那一刻没有成品字节——每次保存都重新
 * 编码一遍 WAV 既慢又可能是几十 MB。波形图是这一类唯一便宜且真实反映内容的封面。
 */
export async function renderAudioWaveformPng(
  buffer: WaveformSource | null | undefined,
): Promise<Blob | null> {
  if (!buffer || !(buffer.length > 0)) return null;
  const target = createRaster(PREVIEW_WIDTH, WAVEFORM_HEIGHT);
  if (!target) return null;
  let samples: Float32Array;
  try {
    samples = buffer.getChannelData(0);
  } catch {
    return null;
  }
  if (!samples || samples.length === 0) return null;
  const { context, canvas } = target;
  fillBackground(target, "#0f172a");
  const middle = canvas.height / 2;
  const bucket = Math.max(1, Math.floor(samples.length / canvas.width));
  context.strokeStyle = "#38bdf8";
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x < canvas.width; x += 1) {
    let low = 1;
    let high = -1;
    const start = x * bucket;
    for (let offset = 0; offset < bucket && start + offset < samples.length; offset += 1) {
      const value = samples[start + offset]!;
      if (value < low) low = value;
      if (value > high) high = value;
    }
    if (low > high) continue;
    context.moveTo(x + 0.5, middle - high * middle * 0.92);
    context.lineTo(x + 0.5, middle - low * middle * 0.92);
  }
  context.stroke();
  context.strokeStyle = "#1e293b";
  context.beginPath();
  context.moveTo(0, middle);
  context.lineTo(canvas.width, middle);
  context.stroke();
  return toPng(target);
}

// ---------------------------------------------------------------------------
// document —— 首屏正文
// ---------------------------------------------------------------------------

interface RichDocLine {
  text: string;
  heading: boolean;
}

/** 从 tiptap JSON 抽出可见文本行，不引入编辑器实例。 */
export function richDocPreviewLines(
  json: unknown,
  limit = 28,
): RichDocLine[] {
  const lines: RichDocLine[] = [];
  const visit = (node: unknown): void => {
    if (lines.length >= limit || !node || typeof node !== "object") return;
    const record = node as {
      type?: unknown;
      text?: unknown;
      content?: unknown;
    };
    const type = String(record.type || "");
    if (type === "paragraph" || type === "heading") {
      const text = collectText(record.content).trim();
      if (text) lines.push({ text, heading: type === "heading" });
      return;
    }
    if (Array.isArray(record.content)) {
      for (const child of record.content) visit(child);
    }
  };
  const collectText = (content: unknown): string => {
    if (!Array.isArray(content)) return "";
    return content
      .map((child) => {
        const record = child as { text?: unknown; content?: unknown };
        if (typeof record?.text === "string") return record.text;
        return collectText(record?.content);
      })
      .join("");
  };
  visit(json);
  return lines;
}

export async function renderRichDocPreviewPng(
  json: unknown,
  title: string,
): Promise<Blob | null> {
  const lines = richDocPreviewLines(json);
  const height = Math.round(PREVIEW_WIDTH * (297 / 210));
  const target = createRaster(PREVIEW_WIDTH, height);
  if (!target) return null;
  const { context, canvas } = target;
  fillBackground(target, "#ffffff");
  context.textBaseline = "top";
  const margin = canvas.width * 0.1;
  const maxWidth = canvas.width - margin * 2;
  let cursor = margin;

  const heading = String(title || "").trim();
  if (heading) {
    context.fillStyle = "#0f172a";
    context.font = previewFont(44, true);
    for (const line of wrapText(context, heading, maxWidth, 2)) {
      context.fillText(line, margin, cursor);
      cursor += 58;
    }
    cursor += 16;
  }
  for (const line of lines) {
    if (cursor > canvas.height - margin) break;
    context.fillStyle = line.heading ? "#0f172a" : "#334155";
    context.font = previewFont(line.heading ? 32 : 24, line.heading);
    const wrapped = wrapText(context, line.text, maxWidth, 4);
    for (const part of wrapped) {
      if (cursor > canvas.height - margin) break;
      context.fillText(part, margin, cursor);
      cursor += line.heading ? 44 : 36;
    }
    cursor += line.heading ? 14 : 8;
  }
  return toPng(target);
}
