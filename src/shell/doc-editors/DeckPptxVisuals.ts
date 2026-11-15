import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { deckImageAspectRatio } from "./deck-image-size";
import { deckCellElement, deckTableUsesPicture } from "./deck-table-format";
import { deckSafeLink, deckTextDecoration, deckTextListLines } from "./deck-text-format";
import { deckFontSizePx } from "./deck-text-scale";

import type {
  DeckAspect,
  DeckElement,
  DeckSlide,
} from "./deck-schema";
import {
  assertDeckPptxSlideXml,
  deckPptxElementObjectNames,
  deckPptxObjectName,
  normalizeDeckPptxSlideObjectIdentity,
  reportDeckPptxEnhancementWarning,
  type DeckPptxEnhancementOptions,
} from "./deck-pptx-ooxml";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const EMU_PER_CSS_PIXEL = 9_525;

export interface DeckPptxBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DeckPptxShadow {
  type: "outer";
  color: string;
  opacity: number;
  blur: number;
  distance: number;
  angle: number;
  rotateWithShape: boolean;
}

export interface DeckPptxTextStyleOptions {
  includeShadow?: boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

export function deckPptxVisualObjectName(
  elementId: string,
  part = "main",
  occurrence = 1,
): string {
  return deckPptxObjectName(elementId, part, occurrence);
}

export function deckPptxTransparency(element: DeckElement): number {
  return Math.round((1 - clamp(finite(element.opacity, 1), 0, 1)) * 100);
}

export function deckPptxShadow(
  element: DeckElement,
): DeckPptxShadow | undefined {
  return element.shadow
    ? {
        type: "outer",
        color: "0F172A",
        opacity:
          0.24 * clamp(finite(element.opacity, 1), 0, 1),
        blur: 24,
        distance: 10.5,
        angle: 90,
        rotateWithShape: false,
      }
    : undefined;
}

export function deckPptxTextStyle(
  element: DeckElement,
  options: DeckPptxTextStyleOptions = {},
) {
  return {
    vert: element.verticalText ? "eaVert" as const : "horz" as const,
    transparency: deckPptxTransparency(element),
    underline: element.underline ? ({ style: "sng" } as const) : undefined,
    lineSpacingMultiple: clamp(finite(element.lineHeight, 1.15), 0.7, 4),
    // Browser letter-spacing is in CSS px; PowerPoint stores character
    // spacing in points.
    charSpacing: clamp(finite(element.letterSpacing, 0) * 0.75, -7.5, 30),
    shadow:
      options.includeShadow === false ? undefined : deckPptxShadow(element),
    flipH: element.flipX === true,
    flipV: element.flipY === true,
  };
}

export function deckPptxRadiusRatio(
  element: DeckElement,
  aspect: DeckAspect,
): number {
  const logicalWidth = 960;
  const logicalHeight = aspect === "4:3" ? 720 : 540;
  const shortestSide = Math.max(
    1,
    Math.min(
      (element.width / 100) * logicalWidth,
      (element.height / 100) * logicalHeight,
    ),
  );
  return clamp(finite(element.borderRadius, 0) / shortestSide, 0, 0.5);
}

export function deckPptxShapeStyle(
  element: DeckElement,
  _box: DeckPptxBox,
  aspect: DeckAspect,
) {
  // Radius is written into the round-rect geometry in the OOXML pass below.
  // PptxGenJS deliberately has no public arbitrary-radius option.
  void aspect;
  return {
    transparency: deckPptxTransparency(element),
    shadow: deckPptxShadow(element),
    flipH: element.flipX === true,
    flipV: element.flipY === true,
  };
}

export function deckPptxImageStyle(
  element: DeckElement,
  box: DeckPptxBox,
) {
  const fit = element.imageFit || "contain";
  return {
    altText: element.alt || "",
    transparency: deckPptxTransparency(element),
    shadow: deckPptxShadow(element),
    flipH: element.flipX === true,
    flipV: element.flipY === true,
    ...(fit === "fill"
      ? {}
      : {
          sizing: {
            type: fit === "cover" ? ("cover" as const) : ("contain" as const),
            ...box,
          },
        }),
  };
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/**
 * Tables remain native/editable unless an effect unsupported by DrawingML
 * graphic frames is enabled. Such a table is flattened to a deterministic SVG
 * picture, then receives native picture opacity/shadow/transform semantics.
 */
export function deckPptxTableRequiresImage(element: DeckElement): boolean {
  return deckTableUsesPicture(element);
}

export function deckPptxTableImageData(
  element: DeckElement,
  aspect: DeckAspect = "16:9",
): string {
  const rows = element.rows?.length ? element.rows : [[""]];
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const width = 1_200;
  const logicalHeight = aspect === "4:3" ? 720 : 540;
  const renderedWidth = Math.max(1, (element.width / 100) * 960);
  const renderedHeight = Math.max(1, (element.height / 100) * logicalHeight);
  const height = Math.round(
    clamp((width * renderedHeight) / renderedWidth, 120, 2_400),
  );
  const rowHeight = height / Math.max(1, rows.length);
  const columnWidth = width / columns;
  const fill = escapeXml(element.fill || "#ffffff");
  const border = escapeXml(element.borderColor || "#d1d5db");
  const borderWidth = Math.max(1, finite(element.borderWidth, 1) * 2);
  const scale = (value: number) => deckFontSizePx(value, aspect, (width * 100) / Math.max(0.1, element.width));
  const radius = deckPptxRadiusRatio(element, aspect) * Math.min(width, height);
  const cells = rows.flatMap((row, rowIndex) =>
    Array.from({ length: columns }, (_, columnIndex) => {
      const cell = deckCellElement(element, rowIndex, columnIndex);
      const x = columnIndex * columnWidth, y = rowIndex * rowHeight;
      const fontSize = scale(cell.fontSize || 18);
      const lineHeight = fontSize * (cell.lineHeight || 1.15);
      const letterSpacing = scale((cell.letterSpacing || 0) * 0.75);
      const inset = scale((cell.indent || 0) * 0.75) + columnWidth * 0.05;
      const lines = deckTextListLines(row[columnIndex] || "", cell.list);
      const color = escapeXml(cell.color || "#292524");
      const clipId = `cell-${rowIndex}-${columnIndex}`;
      const style = `fill="${color}" font-family="${escapeXml(cell.fontFamily || "Arial, sans-serif")}" font-size="${fontSize}" font-weight="${cell.bold ? 700 : 400}" font-style="${cell.italic ? "italic" : "normal"}" text-decoration="${deckTextDecoration(cell)}" letter-spacing="${letterSpacing}"`;
      const content = lines.map((line, index) => {
        const text = line.marker ? `${line.marker} ${line.text}` : line.text;
        const estimate = Math.max(fontSize, Array.from(text).length * (fontSize * 0.65 + letterSpacing));
        if (cell.verticalText) {
          const columnX = x + columnWidth - fontSize - index * lineHeight;
          return (cell.highlight ? `<rect x="${columnX}" y="${y + inset}" width="${fontSize}" height="${estimate}" fill="${escapeXml(cell.highlight)}"/>` : "") +
            `<text x="${columnX}" y="${y + inset}" writing-mode="vertical-rl" text-orientation="mixed" ${style}>${escapeXml(text)}</text>`;
        }
        const anchor = cell.align === "center" ? "middle" : cell.align === "right" ? "end" : "start";
        const textX = cell.align === "center" ? x + columnWidth / 2 : cell.align === "right" ? x + columnWidth * 0.95 : x + inset;
        const baseline = y + rowHeight / 2 - (lines.length - 1) * lineHeight / 2 + index * lineHeight;
        const left = anchor === "middle" ? textX - estimate / 2 : anchor === "end" ? textX - estimate : textX;
        return (cell.highlight ? `<rect x="${left}" y="${baseline - fontSize / 2}" width="${estimate}" height="${fontSize}" fill="${escapeXml(cell.highlight)}"/>` : "") +
          `<text x="${textX}" y="${baseline}" dominant-baseline="middle" text-anchor="${anchor}" ${style}>${escapeXml(text)}</text>`;
      }).join("");
      return `<rect x="${x}" y="${y}" width="${columnWidth}" height="${rowHeight}" fill="${fill}" stroke="${border}" stroke-width="${borderWidth}"/>` +
        `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${columnWidth}" height="${rowHeight}"/></clipPath><g clip-path="url(#${clipId})">${content}</g>`;
    }),
  );
  return svgDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}">` +
      `<defs><clipPath id="table-clip"><rect width="${width}" height="${height}" ` +
      `rx="${radius}" ry="${radius}"/></clipPath></defs>` +
      `<g clip-path="url(#table-clip)">${cells.join("")}</g>` +
      `</svg>`,
  );
}

function imageEffectXml(element: DeckElement): string {
  const brightness = clamp(
    Math.round((finite(element.brightness, 1) - 1) * 100_000),
    -100_000,
    100_000,
  );
  const contrast = clamp(
    Math.round((finite(element.contrast, 1) - 1) * 100_000),
    -100_000,
    100_000,
  );
  const saturation = clamp(
    Math.round((finite(element.saturation, 1) - 1) * 100_000),
    -100_000,
    100_000,
  );
  const blur = Math.max(
    0,
    Math.round(finite(element.blur, 0) * EMU_PER_CSS_PIXEL),
  );
  return [
    brightness || contrast
      ? `<a:lum bright="${brightness}" contrast="${contrast}"/>`
      : "",
    saturation
      ? `<a:hsl hue="0" sat="${saturation}" lum="0"/>`
      : "",
    blur ? `<a:blur rad="${blur}" grow="0"/>` : "",
  ].join("");
}

interface VisualObjectBlock {
  start: number;
  end: number;
  xml: string;
}

function findObjectBlocks(
  xml: string,
  objectName: string,
): VisualObjectBlock[] {
  const markers = [...xml.matchAll(/<p:cNvPr\b[^>]*>/g)].filter(
    (match) => /\sname="([^"]*)"/.exec(match[0])?.[1] === objectName,
  );
  const blocks = markers.flatMap((marker) => {
    if (marker.index == null) return [];
    const prefix = xml.slice(0, marker.index);
    const matches = [...prefix.matchAll(/<p:(pic|sp|graphicFrame)\b/g)];
    const match = matches.at(-1);
    if (!match || match.index == null) return [];
    const close = `</p:${match[1]}>`;
    const closeIndex = xml.indexOf(close, marker.index);
    if (closeIndex < 0) return [];
    const end = closeIndex + close.length;
    return [
      {
        start: match.index,
        end,
        xml: xml.slice(match.index, end),
      },
    ];
  });
  return blocks.filter(
    (block, index) =>
      blocks.findIndex(
        (candidate) =>
          candidate.start === block.start && candidate.end === block.end,
      ) === index,
  );
}

function replaceObjectBlock(
  xml: string,
  objectName: string,
  update: (block: string) => string,
  options: DeckPptxEnhancementOptions,
  slideNumber: number,
  elementId: string,
): string {
  const targets = findObjectBlocks(xml, objectName);
  if (targets.length === 0) {
    reportDeckPptxEnhancementWarning(options, {
      code: "visual-target-missing",
      phase: "visual",
      slideNumber,
      target: objectName,
      elementId,
    });
    return xml;
  }
  if (targets.length > 1) {
    reportDeckPptxEnhancementWarning(options, {
      code: "visual-target-ambiguous",
      phase: "visual",
      slideNumber,
      target: objectName,
      elementId,
    });
    return xml;
  }
  const target = targets[0];
  try {
    const next = update(target.xml);
    const candidate = `${xml.slice(0, target.start)}${next}${xml.slice(target.end)}`;
    assertDeckPptxSlideXml(candidate, `PPTX slide ${slideNumber}`);
    return candidate;
  } catch {
    reportDeckPptxEnhancementWarning(options, {
      code: "visual-enhancement-invalid",
      phase: "visual",
      slideNumber,
      target: objectName,
      elementId,
    });
    return xml;
  }
}

function injectBlipEffects(block: string, effects: string): string {
  if (!effects) return block;
  const selfClosing = /<a:blip\b([^>]*)\/>/.exec(block);
  if (selfClosing) {
    return block.replace(
      selfClosing[0],
      `<a:blip${selfClosing[1]}>${effects}</a:blip>`,
    );
  }
  const opening = /<a:blip\b[^>]*>/.exec(block);
  if (!opening || opening.index == null) return block;
  const contentStart = opening.index + opening[0].length;
  const closing = block.indexOf("</a:blip>", contentStart);
  if (closing < 0) return block;
  const extension = block.indexOf("<a:extLst", contentStart);
  const insertion =
    extension >= 0 && extension < closing ? extension : closing;
  return `${block.slice(0, insertion)}${effects}${block.slice(insertion)}`;
}

function applyPictureRadius(
  block: string,
  element: DeckElement,
  aspect: DeckAspect,
): string {
  const ratio = deckPptxRadiusRatio(element, aspect);
  if (ratio <= 0) return block;
  const adjustment = Math.round(ratio * 100_000);
  const geometry =
    `<a:prstGeom prst="roundRect"><a:avLst>` +
    `<a:gd name="adj" fmla="val ${adjustment}"/>` +
    "</a:avLst></a:prstGeom>";
  return block.replace(
    /<a:prstGeom\b[^>]*(?:\/>|>[\s\S]*?<\/a:prstGeom>)/,
    geometry,
  );
}

function shapeSupportsRadius(element: DeckElement): boolean {
  const shape = (element.shape || "rectangle").toLowerCase();
  return shape === "rectangle" || shape === "rect" || shape === "rounded";
}

function applyShapeRadius(
  block: string,
  element: DeckElement,
  aspect: DeckAspect,
): string {
  if (!shapeSupportsRadius(element)) return block;
  return applyPictureRadius(block, element, aspect);
}

function withLockAttributes(tag: string, attributes: string[]): string {
  return attributes.reduce((result, attribute) => {
    const [name, value] = attribute.split("=");
    const expression = new RegExp(`\\s${name}="[^"]*"`);
    return expression.test(result)
      ? result.replace(expression, ` ${name}="${value}"`)
      : result.replace(/\/?>$/, (closing) => ` ${name}="${value}"${closing}`);
  }, tag);
}

function applyNativeLock(block: string): string {
  const variants = [
    {
      lock: "picLocks",
      parent: "p:cNvPicPr",
      attributes: [
        "noMove=1",
        "noResize=1",
        "noRot=1",
        "noCrop=1",
      ],
    },
    {
      lock: "spLocks",
      parent: "p:cNvSpPr",
      attributes: [
        "noMove=1",
        "noResize=1",
        "noRot=1",
        "noTextEdit=1",
      ],
    },
    {
      lock: "graphicFrameLocks",
      parent: "p:cNvGraphicFramePr",
      attributes: ["noMove=1", "noResize=1"],
    },
  ];
  for (const variant of variants) {
    const existing = new RegExp(`<a:${variant.lock}\\b[^>]*>`).exec(block);
    if (existing) {
      return block.replace(
        existing[0],
        withLockAttributes(existing[0], variant.attributes),
      );
    }
    const selfClosingParent = new RegExp(`<${variant.parent}\\b([^>]*)\\/>`);
    if (selfClosingParent.test(block)) {
      return block.replace(
        selfClosingParent,
        `<${variant.parent}$1><a:${variant.lock} ${variant.attributes
          .map((attribute) => attribute.replace("=", '="') + '"')
          .join(" ")}/></${variant.parent}>`,
      );
    }
    const openingParent = new RegExp(`<${variant.parent}\\b[^>]*>`).exec(block);
    if (openingParent && openingParent.index != null) {
      const insertion = openingParent.index + openingParent[0].length;
      const lock = `<a:${variant.lock} ${variant.attributes
        .map((attribute) => attribute.replace("=", '="') + '"')
        .join(" ")}/>`;
      return `${block.slice(0, insertion)}${lock}${block.slice(insertion)}`;
    }
  }
  return block;
}

function applyTableOpacity(block: string, element: DeckElement): string {
  const alpha = Math.round(
    clamp(finite(element.opacity, 1), 0, 1) * 100_000,
  );
  if (alpha >= 100_000) return block;
  const withExpandedColors = block.replace(
    /<a:(srgbClr|schemeClr)\b([^>]*)\/>/g,
    `<a:$1$2><a:alpha val="${alpha}"/></a:$1>`,
  );
  return withExpandedColors.replace(
    /(<a:(srgbClr|schemeClr)\b[^>]*>)([\s\S]*?)(<\/a:\2>)/g,
    (_match, opening: string, _kind: string, content: string, closing: string) =>
      `${opening}${
        /<a:alpha\b/.test(content)
          ? content.replace(
              /<a:alpha\b[^>]*\/>/,
              `<a:alpha val="${alpha}"/>`,
            )
          : `<a:alpha val="${alpha}"/>${content}`
      }${closing}`,
  );
}

/** Native paragraph properties shared by text boxes and every table cell. */
function paragraphXml(element: DeckElement, text: string, linkId?: string): string {
  return deckTextListLines(text, element.list).map(line => {
    const list = line.marker ? element.list : "none";
    const indent = Math.round((element.indent || 0) * EMU_PER_CSS_PIXEL);
    const marker = list === "ordered" ? `<a:buAutoNum type="arabicPeriod" startAt="${Number.parseInt(line.marker, 10)}"/>` : list === "bullet" ? '<a:buChar char="•"/>' : '<a:buNone/>';
    const color = /^#([0-9a-f]{6})$/i.exec(element.color || "#292524")?.[1];
    const highlight = /^#([0-9a-f]{6})$/i.exec(element.highlight || "")?.[1];
    const props = `sz="${Math.round((element.fontSize || 18) * 100)}" b="${element.bold ? 1 : 0}" i="${element.italic ? 1 : 0}" u="${element.underline ? "sng" : "none"}" strike="${element.strike ? "sngStrike" : "noStrike"}" spc="${Math.round((element.letterSpacing || 0) * 75)}"`;
    const run = `<a:rPr ${props}>${color ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : ""}${highlight ? `<a:highlight><a:srgbClr val="${highlight}"/></a:highlight>` : ""}${element.fontFamily ? `<a:latin typeface="${escapeXml(element.fontFamily.split(",")[0])}"/><a:ea typeface="${escapeXml(element.fontFamily.split(",")[0])}"/>` : ""}${linkId ? `<a:hlinkClick r:id="${linkId}"/>` : ""}</a:rPr>`;
    return `<a:p><a:pPr algn="${element.align === "center" ? "ctr" : element.align === "right" ? "r" : element.align === "justify" ? "just" : "l"}" marL="${indent + (line.marker ? Math.round((element.fontSize || 18) * 1.4 * 12700) : 0)}" indent="${line.marker ? -Math.round((element.fontSize || 18) * 1.4 * 12700) : 0}"><a:lnSpc><a:spcPct val="${Math.round((element.lineHeight || 1.15) * 100000)}"/></a:lnSpc>${marker}</a:pPr><a:r>${run}<a:t>${escapeXml(line.text)}</a:t></a:r><a:endParaRPr ${props}/></a:p>`;
  }).join("");
}

function tableLinkId(elementIndex: number, row: number, column: number): string {
  return `rIdOceanleoCell${elementIndex}_${row}_${column}`;
}

function applyTableText(block: string, element: DeckElement, elementIndex: number): string {
  let row = -1;
  return block.replace(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g, tr => {
    row += 1;
    let column = -1;
    return tr.replace(/<a:tc>[\s\S]*?<\/a:tc>/g, tc => {
      column += 1;
      const cell = deckCellElement(element, row, column);
      if (cell.color === undefined) cell.color = "#292524";
      if (cell.fontFamily === undefined) cell.fontFamily = /<a:latin typeface="([^"]*)"/.exec(tc)?.[1];
      return tc.replace(/<a:txBody>[\s\S]*?<\/a:txBody>/, `<a:txBody><a:bodyPr vert="${cell.verticalText ? "eaVert" : "horz"}"/><a:lstStyle/>${paragraphXml(cell, cell.text || "", deckSafeLink(cell.link) ? tableLinkId(elementIndex, row, column) : undefined)}</a:txBody>`);
    });
  });
}

function applyTextInset(block: string, element: DeckElement): string {
  if (!element.indent) return block;
  const margin = Math.round(element.indent * EMU_PER_CSS_PIXEL);
  return block.replace(/<a:pPr([^>]*?)(\/?)>/g, (_all, attrs: string, close: string) => {
    const listMargin = Number(/\bmarL="([^"]*)"/.exec(attrs)?.[1] || 0);
    return `<a:pPr${attrs.replace(/\s+marL="[^"]*"/g, "")} marL="${margin + listMargin}"${close}>`;
  });
}

/** Crop the original source before fitting; the writer only knows its target box. */
function applyImageCrop(block: string, element: DeckElement, aspect: DeckAspect, sourceRatio?: number): string {
  if (!element.crop) return block;
  const own = element.crop;
  if (element.imageFit !== "fill" && !sourceRatio) throw new Error("无法读取图片原始尺寸，不能可靠导出裁剪");
  const originalRatio = sourceRatio || 1;
  const pageWidth = (aspect === "4:3" ? 10 : 13.333) * 914400;
  const pageHeight = 7.5 * 914400;
  let width = element.width / 100 * pageWidth, height = element.height / 100 * pageHeight;
  let x = element.x / 100 * pageWidth, y = element.y / 100 * pageHeight;
  const croppedRatio = originalRatio * (1 - own.left - own.right) / (1 - own.top - own.bottom);
  const crop = { ...own };
  if (Number.isFinite(croppedRatio) && croppedRatio > 0 && element.imageFit !== "fill") {
    if (element.imageFit === "cover") {
      if (croppedRatio > width / height) { const removed = (1 - width / height / croppedRatio) * (1 - own.left - own.right) / 2; crop.left += removed; crop.right += removed; }
      else { const removed = (1 - croppedRatio / (width / height)) * (1 - own.top - own.bottom) / 2; crop.top += removed; crop.bottom += removed; }
    } else if (croppedRatio > width / height) { const next = width / croppedRatio; y += (height - next) / 2; height = next; }
    else { const next = height * croppedRatio; x += (width - next) / 2; width = next; }
  }
  const rect = `<a:srcRect l="${Math.round(crop.left * 100000)}" t="${Math.round(crop.top * 100000)}" r="${Math.round(crop.right * 100000)}" b="${Math.round(crop.bottom * 100000)}"/>`;
  let next = block.replace(/<a:srcRect\b[^>]*\/>/, "").replace(/(<a:stretch(?:\s*\/|)>)/, `${rect}$1`);
  next = next.replace(/<a:xfrm\b([^>]*)>[\s\S]*?<\/a:xfrm>/, `<a:xfrm$1><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(width)}" cy="${Math.round(height)}"/></a:xfrm>`);
  return next;
}

export function injectDeckSlideVisualOoxml(
  xml: string,
  slide: DeckSlide,
  aspect: DeckAspect,
  options: DeckPptxEnhancementOptions = {},
  slideNumber = 1,
  imageRatios: ReadonlyMap<string, number> = new Map(),
): string {
  let next = normalizeDeckPptxSlideObjectIdentity(
    xml,
    slide,
    options,
    slideNumber,
  );
  const occurrences = new Map<string, number>();
  for (const [elementIndex, element] of slide.elements.entries()) {
    const objectNames = deckPptxElementObjectNames(element, occurrences);
    const mainName = objectNames[0];
    const enhance = (
      objectName: string,
      update: (block: string) => string,
    ) => {
      next = replaceObjectBlock(
        next,
        objectName,
        update,
        options,
        slideNumber,
        element.id,
      );
    };
    if (element.type === "image") {
      enhance(mainName, (block) =>
        applyPictureRadius(
          applyImageCrop(injectBlipEffects(block, imageEffectXml(element)), element, aspect,
            imageRatios.get(/<asvg:svgBlip\b[^>]*r:embed="([^"]+)"/.exec(block)?.[1] || /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(block)?.[1] || "")),
          element,
          aspect,
        ),
      );
    } else if (element.type === "shape") {
      enhance(mainName, (block) =>
        applyShapeRadius(block, element, aspect),
      );
    } else if (element.type === "text") {
      enhance(mainName, block => applyTextInset((element.borderRadius || 0) > 0 ? applyPictureRadius(block, element, aspect) : block, element));
    } else if (
      element.type === "unsupported" &&
      (element.borderRadius || 0) > 0
    ) {
      enhance(mainName, (block) =>
        applyPictureRadius(block, element, aspect),
      );
    } else if (element.type === "table") {
      enhance(mainName, (block) =>
        block.startsWith("<p:graphicFrame")
          ? applyTableOpacity(applyTableText(block, element, elementIndex), element)
          : block,
      );
    }
    if (element.locked) {
      for (const objectName of objectNames) {
        enhance(objectName, applyNativeLock);
      }
    }
  }
  assertDeckPptxSlideXml(next, `PPTX slide ${slideNumber}`);
  return next;
}

export async function injectDeckPptxVisuals(
  blob: Blob,
  slides: readonly DeckSlide[],
  aspect: DeckAspect,
  options: DeckPptxEnhancementOptions = {},
): Promise<Blob> {
  const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  if (!archive["[Content_Types].xml"] || !archive["ppt/presentation.xml"]) {
    throw new Error("PPTX package is missing required presentation parts");
  }
  for (let index = 0; index < slides.length; index += 1) {
    const path = `ppt/slides/slide${index + 1}.xml`;
    const data = archive[path];
    if (!data) throw new Error(`PPTX package is missing ${path}`);
    const relPath = `ppt/slides/_rels/slide${index + 1}.xml.rels`;
    const rels = archive[relPath] ? strFromU8(archive[relPath]) : "";
    const imageRatios = new Map<string, number>();
    for (const relation of rels.matchAll(/<Relationship\b[^>]*\/>/g)) {
      const id = /\bId="([^"]+)"/.exec(relation[0])?.[1];
      const target = /\bTarget="([^"]+)"/.exec(relation[0])?.[1];
      if (!id || !target) continue;
      const segments: string[] = target.startsWith("/") ? [] : ["ppt", "slides"];
      for (const part of target.split("/")) { if (part === "..") segments.pop(); else if (part && part !== ".") segments.push(part); }
      const ratio = deckImageAspectRatio(archive[segments.join("/")]);
      if (ratio) imageRatios.set(id, ratio);
    }
    archive[path] = strToU8(
      injectDeckSlideVisualOoxml(
        strFromU8(data),
        slides[index],
        aspect,
        options,
        index + 1,
        imageRatios,
      ),
    );
  }
  for (const [slideIndex, slide] of slides.entries()) {
    const path = `ppt/slides/_rels/slide${slideIndex + 1}.xml.rels`;
    let rels = archive[path] ? strFromU8(archive[path]) : '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    const links: string[] = [];
    slide.elements.forEach((element, elementIndex) => {
      if (element.type !== "table") return;
      element.rows?.forEach((cells, row) => cells.forEach((_text, column) => {
        const link = deckSafeLink(deckCellElement(element, row, column).link);
        if (link) links.push(`<Relationship Id="${tableLinkId(elementIndex, row, column)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(link)}" TargetMode="External"/>`);
      }));
    });
    if (links.length) { rels = rels.replace('</Relationships>', links.join('') + '</Relationships>'); archive[path] = strToU8(rels); }
  }
  const bytes = Uint8Array.from(zipSync(archive, { level: 6 }));
  return new Blob([bytes], { type: PPTX_MIME });
}
