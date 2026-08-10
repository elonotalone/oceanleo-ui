/**
 * Static HTML twin for `oceanleo.deck.v1`.
 *
 * The carrier IR and `deck-layout-grid.ts` remain the only content and geometry
 * sources. This module only projects those boxes into percentages, just as the
 * OOXML writer projects them into `a:xfrm` / `p:xfrm` coordinates.
 */

import type {
  DeckIrChart,
  DeckIrDocument,
  DeckIrImage,
  DeckIrSlide,
} from "./deck-ir";
import {
  DECK_CONSTANTS,
  DECK_FONT_SIZES,
  DECK_GRID,
  DECK_SERIES_COLORS,
  DECK_THEME_PALETTE,
  deckImageGridCells,
  deckKpiCards,
  deckLayoutDefinition,
  deckTimelineNodes,
  type DeckBox,
  type DeckFontRole,
  type DeckThemeSlot,
} from "./deck-layout-grid";

export type DeckHtmlAspect = "16:9" | "4:3";

export interface DeckHtmlAsset {
  id: string;
  /** Required: every image is embedded into the single HTML file. */
  bytes: Uint8Array;
  width?: number;
  height?: number;
}

export interface DeckHtmlBuildOptions {
  assets?: readonly DeckHtmlAsset[];
  /** Uses the same W1 registry id as the OOXML writer. Unknown ids fall back. */
  packId?: string;
  /** The carrier currently supplies this beside the IR, not as a second IR. */
  aspect?: DeckHtmlAspect;
}

export interface DeckHtmlBuild {
  html: string;
  aspect: DeckHtmlAspect;
  pageWidth: number;
  pageHeight: number;
  packId: string | null;
  packApplied: boolean;
  notes: readonly string[];
}

interface DeckPackLike {
  id?: string;
  palette?: Partial<Record<DeckThemeSlot, string>>;
  fonts?: {
    major?: string;
    minor?: string;
    eastAsian?: string;
    fontScale?: number;
    scale?: number;
  };
  surface?: {
    color?: string;
    pageColor?: string;
    background?: string;
    backgroundColor?: string;
    fullBleedImage?: "cover" | "none";
  };
  scrim?: {
    color?: string;
    alpha?: number;
    opacity?: number;
    bands?: readonly number[];
    bandAlphas?: readonly number[];
    opacities?: readonly number[];
    verticalBands?: readonly number[];
  };
}

interface ResolvedDeckStyle {
  palette: Record<DeckThemeSlot, string>;
  fontMajor: string;
  fontMinor: string;
  fontEastAsian: string;
  fontScale: number;
  pageColor: string;
  fullBleedImage: "cover" | "none";
  scrimColor: string;
  scrimBands: readonly number[] | null;
  scrimAlpha: number | null;
  packApplied: boolean;
}

interface AssetReference {
  id: string;
  dataUri: string;
  width?: number;
  height?: number;
}

const DEFAULT_MAJOR_FONT = "Aptos";
const DEFAULT_EAST_ASIAN_FONT = "Microsoft YaHei";
const DEFAULT_SCRIM_ALPHA = 60;
const DEFAULT_GRID_COLUMNS = 3;
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function hex6(value: unknown, fallback: string): string {
  const candidate = typeof value === "string" ? value.trim().replace(/^#/, "") : "";
  return /^[0-9A-Fa-f]{6}$/.test(candidate) ? candidate.toUpperCase() : fallback;
}

function finiteScale(value: unknown, fallback = 1): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.5 && value <= 2
    ? value
    : fallback;
}

function alphaPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = value <= 1 ? value * 100 : value;
  return percent >= 0 && percent <= 100 ? percent : null;
}

async function packFor(packId: string | undefined): Promise<DeckPackLike | null> {
  if (!packId) return null;
  try {
    // W1 owns this module. Keeping the specifier non-literal lets this exporter
    // retain its IR fallback while W1's registry is absent or being refreshed.
    const modulePath: string = "./deck-packs";
    const registry = (await import(modulePath)) as {
      packById?: (id: string) => DeckPackLike | null | undefined;
    };
    return registry.packById?.(packId) || null;
  } catch {
    return null;
  }
}

async function resolveStyle(
  project: DeckIrDocument,
  packId: string | undefined,
): Promise<ResolvedDeckStyle> {
  const pack = await packFor(packId);
  const palette: Record<DeckThemeSlot, string> = {
    ...DECK_THEME_PALETTE,
    accent1: hex6(project.theme.accent, DECK_THEME_PALETTE.accent1),
    accent2: hex6(project.theme.accent2, DECK_THEME_PALETTE.accent2),
    accent3: hex6(project.theme.accent3, DECK_THEME_PALETTE.accent3),
    accent4: hex6(project.theme.accent4, DECK_THEME_PALETTE.accent4),
    accent5: hex6(project.theme.accent5, DECK_THEME_PALETTE.accent5),
    accent6: hex6(project.theme.accent6, DECK_THEME_PALETTE.accent6),
  };
  if (pack?.palette) {
    for (const slot of Object.keys(palette) as DeckThemeSlot[]) {
      palette[slot] = hex6(pack.palette[slot], palette[slot]);
    }
  }

  const fontMajor = pack?.fonts?.major || project.theme.fontMajor || DEFAULT_MAJOR_FONT;
  const fontMinor = pack?.fonts?.minor || project.theme.fontMinor || fontMajor;
  const fontEastAsian =
    pack?.fonts?.eastAsian || project.theme.fontEastAsian || DEFAULT_EAST_ASIAN_FONT;
  const fontScale = finiteScale(
    pack?.fonts?.fontScale ?? pack?.fonts?.scale,
    finiteScale(project.theme.fontScale),
  );
  const surface = pack?.surface;
  const pageColor = hex6(
    surface?.pageColor ?? surface?.backgroundColor ?? surface?.color ?? surface?.background,
    palette.lt1,
  );
  const scrim = pack?.scrim;
  const rawBands =
    scrim?.verticalBands ?? scrim?.bands ?? scrim?.bandAlphas ?? scrim?.opacities;
  const bands = Array.isArray(rawBands)
    ? rawBands.map(alphaPercent).filter((value): value is number => value !== null)
    : [];

  return {
    palette,
    fontMajor,
    fontMinor,
    fontEastAsian,
    fontScale,
    pageColor,
    fullBleedImage: surface?.fullBleedImage === "cover" ? "cover" : "none",
    scrimColor: hex6(scrim?.color, palette.dk1),
    scrimBands: bands.length ? bands : null,
    scrimAlpha: alphaPercent(scrim?.alpha ?? scrim?.opacity),
    packApplied: pack !== null,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;
    encoded +=
      BASE64_ALPHABET[first >> 2] +
      BASE64_ALPHABET[((first & 0x03) << 4) | (second >> 4)] +
      (hasSecond
        ? BASE64_ALPHABET[((second & 0x0f) << 2) | (third >> 6)]
        : "=") +
      (hasThird ? BASE64_ALPHABET[third & 0x3f] : "=");
  }
  return encoded;
}

function resolveAssets(
  project: DeckIrDocument,
  supplied: readonly DeckHtmlAsset[] | undefined,
): Map<string, AssetReference> {
  const byId = new Map((supplied || []).map((asset) => [asset.id, asset]));
  const references = new Map<string, AssetReference>();
  const missing: string[] = [];
  (project.assets || []).forEach((declared) => {
    const asset = byId.get(declared.id);
    if (!(asset?.bytes instanceof Uint8Array) || asset.bytes.byteLength === 0) {
      missing.push(declared.id);
      return;
    }
    references.set(declared.id, {
      id: declared.id,
      dataUri: `data:${declared.mediaType};base64,${bytesToBase64(asset.bytes)}`,
      width: asset?.width ?? declared.width,
      height: asset?.height ?? declared.height,
    });
  });
  if (missing.length > 0) {
    throw new Error(
      `网页版缺少图片字节，不能生成自包含文件：${missing.join(", ")}。`,
    );
  }
  return references;
}

function pct(value: number, total: number): string {
  return `${Number(((value / total) * 100).toFixed(6))}%`;
}

function boxStyle(box: DeckBox, extra = ""): string {
  return (
    `left:${pct(box.x, DECK_GRID.pageWidth)};` +
    `top:${pct(box.y, DECK_GRID.pageHeight)};` +
    `width:${pct(box.cx, DECK_GRID.pageWidth)};` +
    `height:${pct(box.cy, DECK_GRID.pageHeight)};` +
    extra
  );
}

function fontFamily(style: ResolvedDeckStyle): string {
  const families = [style.fontMajor, style.fontEastAsian]
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .map((value) => JSON.stringify(value));
  return `${families.join(",")},sans-serif`;
}

function fontPixels(role: DeckFontRole, style: ResolvedDeckStyle): number {
  // 1 pt = 12,700 EMU and this canvas uses 10,000 EMU per CSS pixel.
  return Number((((DECK_FONT_SIZES[role] / 100) * 1.27) * style.fontScale).toFixed(3));
}

function textRun(text: string): string {
  return `<span data-deck-text>${escapeHtml(text)}</span>`;
}

function textBox(
  box: DeckBox,
  text: string,
  role: DeckFontRole,
  color: string,
  style: ResolvedDeckStyle,
  options: {
    align?: "left" | "center" | "right";
    anchor?: "top" | "center" | "bottom";
    bold?: boolean;
    className?: string;
    fill?: string;
    fillAlpha?: number;
  } = {},
): string {
  const anchor = options.anchor || "top";
  const justify = anchor === "center" ? "center" : anchor === "bottom" ? "flex-end" : "flex-start";
  const fill = options.fill
    ? `background:${rgba(options.fill, options.fillAlpha ?? 100)};`
    : "";
  return (
    `<div class="deck-object deck-text ${escapeHtml(options.className || "")}" ` +
    `style="${boxStyle(box)}` +
    `font-family:${escapeHtml(fontFamily(style))};font-size:${fontPixels(role, style)}px;` +
    `color:#${hex6(color, style.palette.dk1)};text-align:${options.align || "left"};` +
    `justify-content:${justify};font-weight:${options.bold ? 700 : 400};${fill}">` +
    textRun(text) +
    `</div>`
  );
}

function bulletBox(
  box: DeckBox,
  items: readonly string[],
  role: DeckFontRole,
  color: string,
  style: ResolvedDeckStyle,
  pitch: number,
): string {
  const rows = items
    .map(
      (item) =>
        `<div class="deck-bullet" style="height:${Number((pitch / 10_000).toFixed(3))}px">` +
        textRun(item) +
        `</div>`,
    )
    .join("");
  return (
    `<div class="deck-object deck-text deck-bullets" style="${boxStyle(box)}` +
    `font-family:${escapeHtml(fontFamily(style))};font-size:${fontPixels(role, style)}px;` +
    `color:#${hex6(color, style.palette.dk1)}">${rows}</div>`
  );
}

function rgba(color: string, alpha: number): string {
  const value = hex6(color, "000000");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${Number((alpha / 100).toFixed(4))})`;
}

function shape(
  box: DeckBox,
  color: string,
  options: { alpha?: number; circle?: boolean; className?: string } = {},
): string {
  const fill = options.alpha === undefined ? `#${hex6(color, "000000")}` : rgba(color, options.alpha);
  return (
    `<div class="deck-object deck-shape ${escapeHtml(options.className || "")}" ` +
    `style="${boxStyle(box)}background:${fill};${options.circle ? "border-radius:50%;" : ""}"></div>`
  );
}

function imageElement(
  box: DeckBox,
  image: DeckIrImage,
  assets: Map<string, AssetReference>,
): string {
  const asset = assets.get(image.assetId);
  if (!asset) {
    throw new Error(
      `网页版图片没有对应的资源声明，不能生成自包含文件：${image.assetId}。`,
    );
  }
  return (
    `<img class="deck-object deck-image" data-asset-id="${escapeHtml(asset.id)}" ` +
    `src="${asset.dataUri}" ` +
    `alt="${escapeHtml(image.alt)}" style="${boxStyle(box)}` +
    `object-fit:${image.fit === "contain" ? "contain" : "cover"};" />`
  );
}

function seriesColor(chart: DeckIrChart, index: number): string {
  return hex6(chart.series[index]?.color, DECK_SERIES_COLORS[index % DECK_SERIES_COLORS.length]);
}

function chartSvg(chart: DeckIrChart, palette: Record<DeckThemeSlot, string>): string {
  const values = chart.series.flatMap((series) => series.values).filter(Number.isFinite);
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const seriesCount = Math.max(1, chart.series.length);
  const pointCount = Math.max(1, ...chart.series.map((series) => series.values.length));
  const marks: string[] = [];

  if (chart.chartType === "bar") {
    const groupWidth = 840 / pointCount;
    const barWidth = Math.max(4, (groupWidth * 0.72) / seriesCount);
    chart.series.forEach((series, seriesIndex) => {
      series.values.forEach((value, pointIndex) => {
        const height = (Math.abs(value) / max) * 350;
        const x = 80 + pointIndex * groupWidth + groupWidth * 0.14 + seriesIndex * barWidth;
        marks.push(
          `<rect x="${x.toFixed(3)}" y="${(420 - height).toFixed(3)}" ` +
            `width="${barWidth.toFixed(3)}" height="${height.toFixed(3)}" ` +
            `fill="#${seriesColor(chart, seriesIndex)}" />`,
        );
      });
    });
  } else if (chart.chartType === "pie") {
    const totals = chart.series.map((series) => series.values.reduce((sum, value) => sum + Math.abs(value), 0));
    const total = Math.max(1, totals.reduce((sum, value) => sum + value, 0));
    let offset = 0;
    totals.forEach((value, index) => {
      const share = (value / total) * 100;
      marks.push(
        `<circle cx="500" cy="250" r="170" pathLength="100" fill="none" ` +
          `stroke="#${seriesColor(chart, index)}" stroke-width="340" ` +
          `stroke-dasharray="${share.toFixed(4)} ${(100 - share).toFixed(4)}" ` +
          `stroke-dashoffset="${(-offset).toFixed(4)}" transform="rotate(-90 500 250)" />`,
      );
      offset += share;
    });
  } else {
    chart.series.forEach((series, seriesIndex) => {
      const color = seriesColor(chart, seriesIndex);
      const points = series.values.map((value, index) => {
        const x = 80 + (index / Math.max(1, pointCount - 1)) * 840;
        const y = 420 - (Math.abs(value) / max) * 350;
        return { x, y };
      });
      const joined = points.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" ");
      if (chart.chartType === "area") {
        marks.push(
          `<polygon points="80,420 ${joined} 920,420" fill="#${color}" ` +
            `stroke="#${color}" stroke-width="8" />`,
        );
      } else {
        marks.push(`<polyline points="${joined}" fill="none" stroke="#${color}" stroke-width="8" />`);
      }
      points.forEach((point) => {
        marks.push(
          `<circle cx="${point.x.toFixed(3)}" cy="${point.y.toFixed(3)}" r="10" fill="#${color}" />`,
        );
      });
    });
  }

  return (
    `<svg class="deck-chart-svg" viewBox="0 0 1000 500" role="img" ` +
    `aria-label="${escapeHtml(chart.axisLabel || "chart")}">` +
    `<rect x="0" y="0" width="1000" height="500" fill="#${palette.lt1}" />` +
    marks.join("") +
    `</svg>`
  );
}

function chartBox(
  box: DeckBox,
  chart: DeckIrChart,
  style: ResolvedDeckStyle,
): string {
  const axis = chart.axisLabel
    ? `<div class="deck-chart-axis" style="font-family:${escapeHtml(fontFamily(style))};` +
      `font-size:${fontPixels("caption", style)}px;color:#${style.palette.dk1}">` +
      textRun(chart.axisLabel) +
      `</div>`
    : "";
  return (
    `<div class="deck-object deck-chart" style="${boxStyle(box)}background:#${style.palette.lt1};">` +
    chartSvg(chart, style.palette) + axis + `</div>`
  );
}

function creditsText(project: DeckIrDocument): string {
  const parts = project.attribution.entries.map(
    (entry) => `${entry.text} (${entry.licenseCode})`,
  );
  let text = parts.join("; ");
  if (text.length <= DECK_CONSTANTS.C48) return text;
  text = "";
  for (const part of parts) {
    const candidate = text ? `${text}; ${part}` : part;
    if (candidate.length > DECK_CONSTANTS.C48) break;
    text = candidate;
  }
  return text;
}

function scrimFor(slide: DeckIrSlide, box: DeckBox, style: ResolvedDeckStyle): string {
  if (style.scrimBands?.length) {
    const width = box.cx / style.scrimBands.length;
    return style.scrimBands
      .map((alpha, index) =>
        shape(
          { x: box.x + index * width, y: box.y, cx: width, cy: box.cy },
          style.scrimColor,
          { alpha, className: "deck-scrim" },
        ),
      )
      .join("");
  }
  const explicit = alphaPercent(slide.scrimAlpha);
  if (explicit !== null) return shape(box, style.scrimColor, { alpha: explicit, className: "deck-scrim" });
  return shape(box, style.scrimColor, {
    alpha: style.scrimAlpha ?? DEFAULT_SCRIM_ALPHA,
    className: "deck-scrim",
  });
}

function gridColumnsFor(slide: DeckIrSlide): number {
  return typeof slide.gridColumns === "number" &&
    Number.isInteger(slide.gridColumns) &&
    slide.gridColumns >= 1 &&
    slide.gridColumns <= 6
    ? slide.gridColumns
    : DEFAULT_GRID_COLUMNS;
}

function renderSlideBody(
  slide: DeckIrSlide,
  slideNumber: number,
  slideCount: number,
  project: DeckIrDocument,
  style: ResolvedDeckStyle,
  assets: Map<string, AssetReference>,
): string {
  const boxes = deckLayoutDefinition(slide.layout).boxes;
  const palette = style.palette;
  const out: string[] = [];
  const heading = (
    box: DeckBox,
    role: DeckFontRole,
    value: string,
    align: "left" | "center" | "right" = "left",
  ) => out.push(textBox(box, value, role, palette.dk1, style, { align, bold: true }));

  switch (slide.layout) {
    case "title":
      heading(boxes.title, "display", slide.title || "", "center");
      out.push(shape(boxes.accentBar, palette.accent1));
      out.push(
        textBox(boxes.subtitle, slide.subtitle || slide.body || "", "body", palette.dk2, style, {
          align: "center",
        }),
      );
      break;
    case "section":
      out.push(shape(boxes.accentBar, palette.accent1));
      heading(boxes.title, "section", slide.title || "");
      out.push(textBox(boxes.subtitle, slide.subtitle || slide.body || "", "body-sm", palette.dk2, style));
      break;
    case "bullets":
      out.push(shape(boxes.accentDot, palette.accent1));
      heading(boxes.title, "heading", slide.title || "");
      out.push(bulletBox(boxes.bullets, slide.bullets || [], "body", palette.dk1, style, DECK_GRID.bulletPitch));
      break;
    case "two-column":
      heading(boxes.title, "heading", slide.title || "");
      out.push(bulletBox(boxes.left, slide.left || [], "body-sm", palette.dk1, style, DECK_GRID.columnPitch));
      out.push(bulletBox(boxes.right, slide.right || [], "body-sm", palette.dk1, style, DECK_GRID.columnPitch));
      break;
    case "data-table": {
      heading(boxes.title, "heading", slide.title || "");
      const table = slide.table || { header: [], rows: [] };
      const columns = Math.max(1, table.header.length);
      const cellWidth = boxes.table.cx / columns;
      out.push(shape({ ...boxes.table, cy: DECK_GRID.tableHeaderHeight }, palette.accent1));
      table.header.forEach((cell, column) => {
        out.push(
          textBox(
            { x: boxes.table.x + column * cellWidth, y: boxes.table.y, cx: cellWidth, cy: DECK_GRID.tableHeaderHeight },
            cell,
            "caption",
            palette.lt1,
            style,
            { anchor: "center", bold: true },
          ),
        );
      });
      table.rows.forEach((row, rowIndex) => {
        const y = boxes.table.y + DECK_GRID.tableHeaderHeight + rowIndex * DECK_GRID.tableRowHeight;
        if (rowIndex % 2 === 1) {
          out.push(shape({ x: boxes.table.x, y, cx: boxes.table.cx, cy: DECK_GRID.tableRowHeight }, palette.lt2));
        }
        row.forEach((cell, column) => {
          out.push(
            textBox(
              { x: boxes.table.x + column * cellWidth, y, cx: cellWidth, cy: DECK_GRID.tableRowHeight },
              cell,
              "table",
              palette.dk1,
              style,
              { anchor: "center" },
            ),
          );
        });
      });
      break;
    }
    case "image-full": {
      const image = slide.images?.[0];
      if (image) {
        const fit = style.fullBleedImage === "cover" ? "cover" : image.fit || "cover";
        out.push(imageElement(boxes.image, { ...image, fit }, assets));
      }
      out.push(scrimFor(slide, boxes.scrim, style));
      out.push(
        textBox(boxes.title, slide.title || "", "section", palette.lt1, style, {
          anchor: "center",
          bold: true,
        }),
      );
      break;
    }
    case "image-left":
    case "image-right": {
      const image = slide.images?.[0];
      if (image) out.push(imageElement(boxes.image, image, assets));
      heading(boxes.title, "heading", slide.title || "");
      out.push(bulletBox(boxes.bullets, slide.bullets || [], "body", palette.dk1, style, DECK_GRID.bulletPitch));
      break;
    }
    case "image-grid": {
      heading(boxes.title, "heading", slide.title || "");
      const images = slide.images || [];
      const cells = deckImageGridCells(images.length, gridColumnsFor(slide));
      images.forEach((image, index) => {
        const cell = cells[index];
        if (!cell) return;
        out.push(imageElement(cell.image, { ...image, fit: image.fit || "cover" }, assets));
        if (image.caption) {
          out.push(
            textBox(cell.caption, image.caption, "caption", palette.lt1, style, {
              anchor: "center",
              fill: palette.dk1,
              fillAlpha: 60,
            }),
          );
        }
      });
      break;
    }
    case "chart-focus":
      heading(boxes.title, "heading", slide.title || "");
      if (slide.chart) out.push(chartBox(boxes.chart, slide.chart, style));
      out.push(shape(boxes.conclusion, palette.lt2));
      out.push(textBox(boxes.conclusion, slide.note || slide.body || "", "body-sm", palette.dk1, style, { anchor: "center" }));
      break;
    case "chart-with-notes":
      heading(boxes.title, "heading", slide.title || "");
      if (slide.chart) out.push(chartBox(boxes.chart, slide.chart, style));
      out.push(bulletBox(boxes.bullets, slide.bullets || [], "body-sm", palette.dk1, style, DECK_GRID.bulletPitch));
      break;
    case "kpi-row": {
      heading(boxes.title, "heading", slide.title || "");
      const cards = deckKpiCards((slide.kpis || []).length);
      (slide.kpis || []).forEach((kpi, index) => {
        const card = cards[index];
        if (!card) return;
        out.push(shape(card, palette.lt2));
        out.push(
          textBox(
            { ...card, cy: card.cy * 0.62 },
            kpi.unit ? `${kpi.value}${kpi.unit}` : kpi.value,
            "kpi",
            palette.accent1,
            style,
            { anchor: "center", align: "center", bold: true },
          ),
        );
        out.push(
          textBox(
            { ...card, y: card.y + card.cy * 0.62, cy: card.cy * 0.38 },
            kpi.delta ? `${kpi.label} ${kpi.delta}` : kpi.label,
            "caption",
            palette.dk2,
            style,
            { anchor: "center", align: "center" },
          ),
        );
      });
      break;
    }
    case "comparison": {
      heading(boxes.title, "heading", slide.title || "");
      const sides = [
        { key: "left" as const, header: boxes.leftHeader, body: boxes.left, fill: palette.accent1 },
        { key: "right" as const, header: boxes.rightHeader, body: boxes.right, fill: palette.accent6 },
      ];
      sides.forEach((side) => {
        out.push(shape(side.header, side.fill));
        out.push(
          textBox(
            side.header,
            side.key === "left" ? slide.subtitle || "A" : slide.note || "B",
            "caption",
            palette.lt1,
            style,
            { anchor: "center", align: "center", bold: true },
          ),
        );
        out.push(bulletBox(side.body, slide[side.key] || [], "body-sm", palette.dk1, style, 460_000));
      });
      break;
    }
    case "timeline": {
      heading(boxes.title, "heading", slide.title || "");
      out.push(shape(boxes.axis, palette.accent1));
      const milestones = slide.milestones || [];
      const nodes = deckTimelineNodes(milestones.length);
      const labelWidth = boxes.axis.cx / Math.max(1, milestones.length);
      milestones.forEach((milestone, index) => {
        const node = nodes[index];
        if (!node) return;
        const centered = node.x + node.cx / 2 - labelWidth / 2;
        out.push(shape(node, palette.accent1, { circle: true }));
        out.push(
          textBox(
            { x: centered, y: boxes.axis.y - 400_000, cx: labelWidth, cy: 400_000 },
            milestone.at,
            "subheading",
            palette.dk1,
            style,
            { anchor: "bottom", align: "center", bold: true },
          ),
        );
        out.push(
          textBox(
            { x: centered, y: boxes.axis.y + 300_000, cx: labelWidth, cy: 320_000 },
            milestone.label,
            "caption",
            palette.dk1,
            style,
            { align: "center" },
          ),
        );
        if (milestone.detail) {
          out.push(
            textBox(
              { x: centered, y: boxes.axis.y + 620_000, cx: labelWidth, cy: 320_000 },
              milestone.detail,
              "caption",
              palette.dk2,
              style,
              { align: "center" },
            ),
          );
        }
      });
      break;
    }
    case "quote": {
      const background = slide.images?.[0];
      if (background) {
        const fit = style.fullBleedImage === "cover" ? "cover" : background.fit || "cover";
        out.push(imageElement(boxes.background, { ...background, fit }, assets));
      }
      out.push(shape(boxes.mark, palette.accent1));
      out.push(textBox(boxes.quote, slide.quote?.text || "", "section", palette.dk1, style));
      out.push(
        textBox(boxes.attribution, slide.quote?.attribution || "", "body", palette.dk2, style, {
          align: "right",
        }),
      );
      break;
    }
    case "mixed-triptych": {
      heading(boxes.title, "heading", slide.title || "");
      const image = slide.images?.[0];
      if (image) out.push(imageElement(boxes.image, image, assets));
      if (slide.chart) out.push(chartBox(boxes.chart, slide.chart, style));
      out.push(bulletBox(boxes.bullets, slide.bullets || [], "body-sm", palette.dk1, style, DECK_GRID.bulletPitch));
      out.push(shape(boxes.conclusion, palette.lt2));
      out.push(textBox(boxes.conclusion, slide.note || slide.body || "", "body-sm", palette.dk1, style, { anchor: "center" }));
      break;
    }
  }

  const master = project.master;
  if (master?.footerText) {
    out.push(
      textBox(
        {
          x: DECK_GRID.margin,
          y: DECK_GRID.footerBaselineY,
          cx: DECK_GRID.contentWidth / 2,
          cy: 300_000,
        },
        master.footerText,
        "note",
        palette.dk2,
        style,
      ),
    );
  }
  if (master?.showPageNumber !== false) {
    out.push(
      textBox(
        {
          x: DECK_GRID.margin + DECK_GRID.contentWidth / 2,
          y: DECK_GRID.footerBaselineY,
          cx: DECK_GRID.contentWidth / 2,
          cy: 300_000,
        },
        `${slideNumber} / ${slideCount}`,
        "note",
        palette.dk2,
        style,
        { align: "right" },
      ),
    );
  }
  if (slideNumber === slideCount && master?.creditsBar !== false) {
    out.push(
      textBox(
        {
          x: DECK_GRID.margin,
          y: DECK_GRID.footerBaselineY - 340_000,
          cx: DECK_GRID.contentWidth,
          cy: 320_000,
        },
        creditsText(project),
        "note",
        palette.dk2,
        style,
      ),
    );
  }
  return out.join("");
}

function stylesheet(): string {
  return `
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:#111;color:#fff}
body{overflow:hidden;font-family:system-ui,sans-serif}
.deck-app{min-height:100vh;display:grid;grid-template-rows:1fr auto;place-items:center;padding:16px;gap:12px}
.deck-frame{position:relative;overflow:visible}
.deck-stage{position:absolute;left:0;top:0;transform-origin:top left;overflow:hidden;background:#fff;cursor:pointer}
.deck-slide{position:absolute;inset:0;overflow:hidden}
.deck-slide[hidden]{display:none}
.deck-object{position:absolute}
.deck-text{display:flex;flex-direction:column;overflow:hidden;white-space:pre-wrap;padding:9.144px;line-height:1.18}
.deck-bullets{display:block;padding-top:9.144px}
.deck-bullet{position:relative;padding-left:28px;overflow:hidden}
.deck-bullet::before{content:"•";position:absolute;left:0;top:0}
.deck-image{display:block}
.deck-chart{overflow:hidden}
.deck-chart-svg{display:block;width:100%;height:100%}
.deck-chart-axis{position:absolute;left:6%;right:6%;bottom:1%;text-align:center;overflow:hidden;white-space:nowrap}
.deck-controls{display:flex;align-items:center;gap:10px;font:14px/1.2 system-ui,sans-serif}
.deck-controls button{border:1px solid #777;background:#222;color:#fff;border-radius:4px;padding:7px 12px;cursor:pointer}
.deck-counter{min-width:72px;text-align:center;font-variant-numeric:tabular-nums}
`;
}

function runtimeScript(): string {
  return `(function(){
"use strict";
var slides=Array.prototype.slice.call(document.querySelectorAll("[data-deck-slide]"));
var stage=document.getElementById("deck-stage");
var frame=document.getElementById("deck-frame");
var counter=document.getElementById("deck-counter");
var index=0;
var width=Number(stage.getAttribute("data-page-width"));
var height=Number(stage.getAttribute("data-page-height"));
function show(next){
  if(!slides.length)return;
  index=(next+slides.length)%slides.length;
  slides.forEach(function(slide,i){slide.hidden=i!==index;});
  counter.textContent=String(index+1)+" / "+String(slides.length);
}
function fit(){
  var scale=Math.min((window.innerWidth-32)/width,(window.innerHeight-76)/height,1);
  stage.style.width=String(width)+"px";
  stage.style.height=String(height)+"px";
  stage.style.transform="scale("+String(scale)+")";
  frame.style.width=String(width*scale)+"px";
  frame.style.height=String(height*scale)+"px";
}
document.getElementById("deck-prev").addEventListener("click",function(event){event.stopPropagation();show(index-1);});
document.getElementById("deck-next").addEventListener("click",function(event){event.stopPropagation();show(index+1);});
document.getElementById("deck-fullscreen").addEventListener("click",function(event){
  event.stopPropagation();
  if(document.fullscreenElement&&document.exitFullscreen){document.exitFullscreen();return;}
  if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();
});
stage.addEventListener("click",function(event){
  var rect=stage.getBoundingClientRect();
  show(index+(event.clientX-rect.left<rect.width/2?-1:1));
});
document.addEventListener("keydown",function(event){
  if(event.key==="ArrowLeft"){event.preventDefault();show(index-1);}
  if(event.key==="ArrowRight"){event.preventDefault();show(index+1);}
});
window.addEventListener("resize",fit);
document.addEventListener("fullscreenchange",fit);
show(0);fit();
}());`;
}

/** Build one deterministic, self-contained HTML file. */
export async function buildDeckHtml(
  project: DeckIrDocument,
  options: DeckHtmlBuildOptions = {},
): Promise<DeckHtmlBuild> {
  const extended = project as DeckIrDocument & { aspect?: DeckHtmlAspect; packId?: string };
  const aspect: DeckHtmlAspect =
    options.aspect === "4:3" || extended.aspect === "4:3" ? "4:3" : "16:9";
  const packId = options.packId || extended.packId;
  const style = await resolveStyle(project, packId);
  const references = resolveAssets(project, options.assets);
  const pageWidth = Number((DECK_GRID.pageWidth / 10_000).toFixed(3));
  const pageHeight = Number(
    (aspect === "4:3" ? pageWidth * 0.75 : DECK_GRID.pageHeight / 10_000).toFixed(3),
  );
  const slides = project.slides
    .map(
      (slide, index) =>
        `<section class="deck-slide" data-deck-slide="${index + 1}" ` +
        `data-layout="${escapeHtml(slide.layout)}" ` +
        `style="background:#${style.pageColor};"${index === 0 ? "" : " hidden"}>` +
        renderSlideBody(slide, index + 1, project.slides.length, project, style, references) +
        `</section>`,
    )
    .join("");
  const html =
    `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(project.title)}</title><style>${stylesheet()}</style></head>` +
    `<body><main class="deck-app" data-deck-html="1" data-aspect="${aspect}">` +
    `<div id="deck-frame" class="deck-frame" style="width:${pageWidth}px;height:${pageHeight}px;">` +
    `<div id="deck-stage" class="deck-stage" style="width:${pageWidth}px;height:${pageHeight}px;" ` +
    `data-page-width="${pageWidth}" data-page-height="${pageHeight}">${slides}</div></div>` +
    `<nav class="deck-controls" aria-label="幻灯片控制">` +
    `<button id="deck-prev" type="button" aria-label="上一页">上一页</button>` +
    `<span id="deck-counter" class="deck-counter"></span>` +
    `<button id="deck-next" type="button" aria-label="下一页">下一页</button>` +
    `<button id="deck-fullscreen" type="button">全屏</button></nav></main>` +
    `<script>${runtimeScript()}</script></body></html>\n`;

  const notes: string[] = [];
  if (packId && !style.packApplied) {
    notes.push(`Pack "${packId}" was unavailable, so the IR theme fallback was used.`);
  }
  return {
    html,
    aspect,
    pageWidth,
    pageHeight,
    packId: packId || null,
    packApplied: style.packApplied,
    notes,
  };
}
