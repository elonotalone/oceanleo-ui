import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

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
  return (
    element.shadow === true ||
    Boolean(element.rotation) ||
    element.flipX === true ||
    element.flipY === true ||
    (element.borderRadius || 0) > 0 ||
    element.bold === true ||
    element.italic === true ||
    element.underline === true ||
    (element.lineHeight != null && element.lineHeight !== 1.15) ||
    Boolean(element.letterSpacing)
  );
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
  const color = escapeXml(element.color || "#111827");
  const border = escapeXml(element.borderColor || "#d1d5db");
  const fontFamily = escapeXml(element.fontFamily || "Arial, sans-serif");
  const borderWidth = Math.max(1, finite(element.borderWidth, 1) * 2);
  const fontSize = clamp(finite(element.fontSize, 16) * 2.5, 18, 96);
  const lineHeight = fontSize * clamp(finite(element.lineHeight, 1.15), 0.7, 4);
  const letterSpacing = finite(element.letterSpacing, 0) * 2.5;
  const radius =
    deckPptxRadiusRatio(element, aspect) * Math.min(width, height);
  const cells = rows.flatMap((row, rowIndex) =>
    Array.from({ length: columns }, (_, columnIndex) => {
      const x = columnIndex * columnWidth;
      const y = rowIndex * rowHeight;
      const lines = String(row[columnIndex] || "").split(/\r?\n/);
      const textY =
        y + rowHeight / 2 - ((lines.length - 1) * lineHeight) / 2;
      const text = lines
        .map(
          (line, lineIndex) =>
            `<tspan x="${x + columnWidth * 0.05}" y="${
              textY + lineIndex * lineHeight
            }">${escapeXml(line)}</tspan>`,
        )
        .join("");
      return (
        `<rect x="${x}" y="${y}" width="${columnWidth}" height="${rowHeight}" ` +
        `fill="${fill}" stroke="${border}" stroke-width="${borderWidth}"/>` +
        `<text dominant-baseline="middle" fill="${color}" font-family="${fontFamily}" ` +
        `font-size="${fontSize}" font-weight="${element.bold ? 700 : 400}" ` +
        `font-style="${element.italic ? "italic" : "normal"}" ` +
        `text-decoration="${element.underline ? "underline" : "none"}" ` +
        `letter-spacing="${letterSpacing}">${text}</text>`
      );
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

export function injectDeckSlideVisualOoxml(
  xml: string,
  slide: DeckSlide,
  aspect: DeckAspect,
  options: DeckPptxEnhancementOptions = {},
  slideNumber = 1,
): string {
  let next = normalizeDeckPptxSlideObjectIdentity(
    xml,
    slide,
    options,
    slideNumber,
  );
  const occurrences = new Map<string, number>();
  for (const element of slide.elements) {
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
          injectBlipEffects(block, imageEffectXml(element)),
          element,
          aspect,
        ),
      );
    } else if (element.type === "shape") {
      enhance(mainName, (block) =>
        applyShapeRadius(block, element, aspect),
      );
    } else if (
      (element.type === "text" || element.type === "unsupported") &&
      (element.borderRadius || 0) > 0
    ) {
      enhance(mainName, (block) =>
        applyPictureRadius(block, element, aspect),
      );
    } else if (element.type === "table") {
      enhance(mainName, (block) =>
        block.startsWith("<p:graphicFrame")
          ? applyTableOpacity(block, element)
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
    archive[path] = strToU8(
      injectDeckSlideVisualOoxml(
        strFromU8(data),
        slides[index],
        aspect,
        options,
        index + 1,
      ),
    );
  }
  const bytes = Uint8Array.from(zipSync(archive, { level: 6 }));
  return new Blob([bytes], { type: PPTX_MIME });
}
