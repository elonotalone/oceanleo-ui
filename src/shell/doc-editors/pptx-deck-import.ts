import {
  normalizeDeckDocument,
  type DeckDocument,
  type DeckElement,
  type DeckSlide,
  type DeckTextAlign,
} from "./deck-schema";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

interface PptxElementContext {
  slideIndex: number;
  origin: "layout" | "slide";
  path: number[];
  offsetX: number;
  offsetY: number;
  usedIds: Set<string>;
}

interface PptxElementEntry {
  value: unknown;
  context: PptxElementContext;
}

interface OceanLeoObjectIdentity {
  id: string;
  part: "main" | "label";
  occurrence: number;
}

function oceanLeoObjectIdentity(value: unknown): OceanLeoObjectIdentity | null {
  const match =
    /^OceanLeoElement-(.*)-(main|label)(?:-duplicate-(\d+))?$/.exec(
      string(value),
    );
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]).trim();
    if (!id) return null;
    return {
      id,
      part: match[2] as "main" | "label",
      occurrence: Math.max(1, number(match[3], 1)),
    };
  } catch {
    return null;
  }
}

function deterministicHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function stableElementId(
  source: JsonRecord,
  context: PptxElementContext,
): string {
  const identity = oceanLeoObjectIdentity(source.name);
  const recovered = identity
    ? `${identity.id}${
        identity.occurrence > 1 ? `-duplicate-${identity.occurrence}` : ""
      }`
    : "";
  const fingerprint = [
    context.slideIndex,
    context.origin,
    context.path.join("."),
    string(source.type),
    string(source.name),
    string(source.order),
    string(source.left),
    string(source.top),
    string(source.width),
    string(source.height),
  ].join("|");
  const base = recovered || `pptx-element-${deterministicHash(fingerprint)}`;
  let candidate = base.slice(0, 160);
  let suffix = 2;
  while (context.usedIds.has(candidate)) {
    candidate = `${base.slice(0, 145)}-duplicate-${suffix}`;
    suffix += 1;
  }
  context.usedIds.add(candidate);
  return candidate;
}

function plainText(html: unknown): string {
  const source = string(html);
  if (!source) return "";
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(source, "text/html");
    return (document.body.textContent || "").replace(/\u00a0/g, " ").trim();
  }
  return source
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function cssValue(html: string, property: string): string {
  const match = html.match(
    new RegExp(`${property}\\s*:\\s*([^;"']+)`, "i"),
  );
  return match?.[1]?.trim() || "";
}

function hex(value: unknown, fallback = ""): string {
  const candidate = string(value).trim();
  if (/^#[0-9a-f]{3,8}$/i.test(candidate)) return candidate;
  if (/^[0-9a-f]{6}$/i.test(candidate)) return `#${candidate}`;
  return fallback;
}

function fillColor(value: unknown): string {
  const fill = record(value);
  return fill.type === "color" ? hex(fill.value) : "";
}

function percentage(value: unknown, total: number, fallback: number): number {
  if (!total) return fallback;
  return (number(value) / total) * 100;
}

function textStyle(content: string): Pick<
  DeckElement,
  | "fontSize"
  | "fontFamily"
  | "color"
  | "bold"
  | "italic"
  | "underline"
  | "align"
  | "lineHeight"
  | "letterSpacing"
> {
  const fontSize = number(cssValue(content, "font-size").replace(/pt$/i, ""), 18);
  const textAlign = cssValue(content, "text-align").toLowerCase();
  const lineHeight = number(cssValue(content, "line-height"), 1.15);
  const letterSpacing = number(
    cssValue(content, "letter-spacing").replace(/px$/i, ""),
    0,
  );
  return {
    fontSize: Math.max(4, Math.min(300, fontSize)),
    fontFamily: cssValue(content, "font-family") || undefined,
    color: hex(cssValue(content, "color"), "#111827"),
    bold: /font-weight\s*:\s*(?:bold|[6-9]00)/i.test(content),
    italic: /font-style\s*:\s*italic/i.test(content),
    underline: /text-decoration(?:-line)?\s*:[^;"']*underline/i.test(content),
    align: (
      textAlign === "center" || textAlign === "right" ? textAlign : "left"
    ) as DeckTextAlign,
    lineHeight: Math.max(0.7, Math.min(4, lineHeight)),
    letterSpacing: Math.max(-10, Math.min(40, letterSpacing)),
  };
}

function hasComplexFill(value: unknown): boolean {
  const fill = record(value);
  return Object.keys(fill).length > 0 && fill.type !== "color";
}

function deckShapeName(value: unknown): string | null {
  const shape = string(value).trim().toLowerCase();
  if (shape === "rect" || shape === "rectangle") return "rectangle";
  if (shape === "roundrect" || shape === "rounded") return "rounded";
  if (shape === "ellipse" || shape === "oval" || shape === "circle") {
    return "circle";
  }
  if (shape === "triangle") return "triangle";
  if (shape === "diamond") return "diamond";
  if (shape === "star" || shape === "star5") return "star";
  if (shape === "arrow" || shape === "rightarrow") return "arrow";
  if (shape === "hexagon") return "hexagon";
  if (
    shape === "line" ||
    shape === "straightconnector1" ||
    shape === "connector"
  ) {
    return "line";
  }
  return null;
}

function lineDash(value: unknown): DeckElement["lineDash"] {
  const borderType = string(value).toLowerCase();
  if (borderType === "dashed") return "dash";
  if (borderType === "dotted") return "dot";
  return "solid";
}

function baseElement(
  source: JsonRecord,
  type: DeckElement["type"],
  size: { width: number; height: number },
  index: number,
  context: PptxElementContext,
): DeckElement {
  return {
    id: stableElementId(source, context),
    type,
    x: percentage(number(source.left) + context.offsetX, size.width, 10),
    y: percentage(number(source.top) + context.offsetY, size.height, 10),
    width: Math.max(0.5, percentage(source.width, size.width, 30)),
    height: Math.max(0.5, percentage(source.height, size.height, 15)),
    rotation: number(source.rotate),
    order: number(source.order, index),
    flipX: Boolean(source.isFlipH),
    flipY: Boolean(source.isFlipV),
    shadow: Boolean(source.shadow),
    label: string(source.name).trim().slice(0, 500) || undefined,
  };
}

function convertElement(
  value: unknown,
  size: { width: number; height: number },
  index: number,
  unsupported: Map<string, number>,
  context: PptxElementContext,
): DeckElement | null {
  const source = record(value);
  const type = string(source.type).toLowerCase();
  const content = string(source.content);
  const preserveUnsupported = (
    kind = type || "unknown",
    label = `${kind || "未知"} 元素（原始内容保留在源文件）`,
  ): DeckElement => {
    unsupported.set(kind, (unsupported.get(kind) || 0) + 1);
    return {
      ...baseElement(source, "unsupported", size, index, context),
      label,
      alt: string(source.name).trim().slice(0, 1_000) || undefined,
    };
  };
  if (type === "text") {
    if (Boolean(source.isVertical) || hasComplexFill(source.fill)) {
      return preserveUnsupported(
        "complex-text",
        "复杂文字框（原始内容保留在源文件）",
      );
    }
    return {
      ...baseElement(source, "text", size, index, context),
      text: plainText(content),
      fill: fillColor(source.fill) || undefined,
      borderColor: hex(source.borderColor) || undefined,
      borderWidth: Math.max(0, number(source.borderWidth)),
      lineDash: lineDash(source.borderType),
      ...textStyle(content),
    };
  }
  if (type === "shape") {
    const shape = deckShapeName(source.shapType || source.shapeType);
    if (!shape || hasComplexFill(source.fill)) {
      return preserveUnsupported(
        "complex-shape",
        "复杂形状（原始几何与效果保留在源文件）",
      );
    }
    return {
      ...baseElement(source, "shape", size, index, context),
      text: plainText(content) || undefined,
      shape,
      fill: fillColor(source.fill) || undefined,
      borderColor: hex(source.borderColor) || undefined,
      borderWidth: Math.max(0, number(source.borderWidth)),
      lineDash: lineDash(source.borderType),
      ...textStyle(content),
    };
  }
  if (type === "image") {
    const src = string(source.base64 || source.blob);
    if (!/^(?:data:image\/|blob:|https?:)/i.test(src)) {
      return preserveUnsupported(
        "image",
        "图片（原始媒体保留在源文件）",
      );
    }
    const filters = record(source.filters);
    return {
      ...baseElement(source, "image", size, index, context),
      src,
      alt: string(source.name || source.ref || "PPTX 图片"),
      borderColor: hex(source.borderColor) || undefined,
      borderWidth: Math.max(0, number(source.borderWidth)),
      brightness: number(filters.brightness, 1),
      contrast: number(filters.contrast, 1),
      saturation: number(filters.saturation, 1),
    };
  }
  if (type === "table") {
    const data = Array.isArray(source.data) ? source.data : [];
    const hasMergedCells = data.some(
      (row) =>
        Array.isArray(row) &&
        row.some((cell) => {
          const sourceCell = record(cell);
          return (
            number(sourceCell.rowSpan, 1) > 1 ||
            number(sourceCell.colSpan, 1) > 1 ||
            sourceCell.vMerge != null ||
            sourceCell.hMerge != null
          );
        }),
    );
    if (hasMergedCells) {
      return preserveUnsupported(
        "complex-table",
        "合并单元格表格（原始结构保留在源文件）",
      );
    }
    return {
      ...baseElement(source, "table", size, index, context),
      rows: data.map((row) =>
        Array.isArray(row)
          ? row.map((cell) => plainText(record(cell).text ?? cell))
          : [],
      ),
    };
  }
  if (type === "math") {
    const image = string(source.picBase64 || source.picBlob);
    if (/^(?:data:image\/|blob:)/i.test(image)) {
      return {
        ...baseElement(source, "image", size, index, context),
        src: image,
        alt: string(source.text || source.latex || "公式"),
      };
    }
    return preserveUnsupported("math", "公式（原始结构保留在源文件）");
  }
  return preserveUnsupported(
    type || "unknown",
    type === "chart"
      ? "图表（原始数据保留在源文件）"
      : type === "diagram"
        ? "SmartArt / 图示（原始内容保留在源文件）"
        : type === "group"
          ? "复杂组合（原始组合保留在源文件）"
          : `${type || "未知"} 元素（原始内容保留在源文件）`,
  );
}

function mergeOceanLeoShapeLabels(values: unknown[]): unknown[] {
  const cloned = values.map((value) => {
    const source = { ...record(value) };
    if (Array.isArray(source.elements)) {
      source.elements = mergeOceanLeoShapeLabels(source.elements);
    }
    return source;
  });
  const mainShapes = new Map<string, JsonRecord>();
  for (const source of cloned) {
    const identity = oceanLeoObjectIdentity(source.name);
    if (identity?.part !== "main" || source.type !== "shape") continue;
    mainShapes.set(`${identity.id}\u0000${identity.occurrence}`, source);
  }
  return cloned.filter((source) => {
    const identity = oceanLeoObjectIdentity(source.name);
    if (identity?.part !== "label" || source.type !== "text") return true;
    const shape = mainShapes.get(`${identity.id}\u0000${identity.occurrence}`);
    if (!shape) return true;
    if (string(source.content).trim()) shape.content = source.content;
    return false;
  });
}

function rawElementFingerprint(value: unknown): string {
  const source = record(value);
  return [
    string(source.type).toLowerCase(),
    string(source.name).trim(),
    number(source.left).toFixed(3),
    number(source.top).toFixed(3),
    number(source.width).toFixed(3),
    number(source.height).toFixed(3),
    string(source.name).trim() ? "" : plainText(source.content),
  ].join("|");
}

function explicitSlideElements(
  layoutElements: unknown[],
  slideElements: unknown[],
): unknown[] {
  const explicit = new Set(slideElements.map(rawElementFingerprint));
  return [
    ...layoutElements.filter(
      (element) => !explicit.has(rawElementFingerprint(element)),
    ),
    ...slideElements,
  ];
}

function booleanFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function safeGroupedLeaf(value: unknown): boolean {
  const source = record(value);
  const type = string(source.type).toLowerCase();
  if (type === "text") {
    return !booleanFlag(source.isVertical) && !hasComplexFill(source.fill);
  }
  return (
    type === "shape" &&
    Boolean(deckShapeName(source.shapType || source.shapeType)) &&
    !hasComplexFill(source.fill)
  );
}

function flattenSafeGroup(entry: PptxElementEntry): PptxElementEntry[] | null {
  const source = record(entry.value);
  if (string(source.type).toLowerCase() !== "group") return [entry];
  if (
    Math.abs(number(source.rotate)) > 0.001 ||
    booleanFlag(source.isFlipH) ||
    booleanFlag(source.isFlipV)
  ) {
    return null;
  }
  const children = Array.isArray(source.elements)
    ? mergeOceanLeoShapeLabels(source.elements)
    : [];
  if (children.length === 0) return null;
  const output: PptxElementEntry[] = [];
  for (const [index, child] of children.entries()) {
    const childContext: PptxElementContext = {
      ...entry.context,
      path: [...entry.context.path, index],
      offsetX: entry.context.offsetX + number(source.left),
      offsetY: entry.context.offsetY + number(source.top),
    };
    const childEntry = { value: child, context: childContext };
    if (string(record(child).type).toLowerCase() === "group") {
      const nested = flattenSafeGroup(childEntry);
      if (!nested) return null;
      output.push(...nested);
    } else {
      if (!safeGroupedLeaf(child)) return null;
      output.push(childEntry);
    }
  }
  return output;
}

function convertPptxElements(
  values: unknown[],
  size: { width: number; height: number },
  slideIndex: number,
  unsupported: Map<string, number>,
  usedIds: Set<string>,
): DeckElement[] {
  const output: DeckElement[] = [];
  for (const [index, value] of mergeOceanLeoShapeLabels(values).entries()) {
    const context: PptxElementContext = {
      slideIndex,
      origin: "slide",
      path: [index],
      offsetX: 0,
      offsetY: 0,
      usedIds,
    };
    const entry = { value, context };
    const flattened =
      string(record(value).type).toLowerCase() === "group"
        ? flattenSafeGroup(entry)
        : [entry];
    const candidates = flattened || [entry];
    for (const candidate of candidates) {
      const converted = convertElement(
        candidate.value,
        size,
        output.length,
        unsupported,
        candidate.context,
      );
      if (converted) output.push(converted);
    }
  }
  return output.sort((left, right) => left.order - right.order);
}

function slideBackground(value: unknown): string {
  return fillColor(record(value).fill || value);
}

function inferSlideTitle(elements: DeckElement[], index: number): string {
  const textElements = elements
    .filter((element) => element.text?.trim())
    .sort(
      (left, right) =>
        number(right.fontSize, 18) - number(left.fontSize, 18) ||
        left.y - right.y,
    );
  return textElements[0]?.text?.split(/\r?\n/)[0]?.slice(0, 200) || `第 ${index + 1} 页`;
}

function slideHasEditableText(elements: readonly DeckElement[]): boolean {
  return elements.some(
    (element) =>
      element.type === "text" ||
      element.type === "table" ||
      (element.type === "shape" && typeof element.text === "string"),
  );
}

function ensureSlideEditableText(
  elements: DeckElement[],
  slideIndex: number,
  usedIds: Set<string>,
  notes: string,
): DeckElement[] {
  if (slideHasEditableText(elements)) return elements;
  const base = `pptx-slide-${slideIndex + 1}-title`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-duplicate-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  const maxOrder = elements.reduce(
    (highest, element) => Math.max(highest, number(element.order)),
    0,
  );
  const title =
    notes.trim().split(/\r?\n/)[0]?.slice(0, 200) || `第 ${slideIndex + 1} 页`;
  return [
    ...elements,
    {
      id,
      type: "text",
      x: 8,
      y: 8,
      width: 84,
      height: 12,
      rotation: 0,
      order: maxOrder + 1,
      text: title,
      fontSize: 28,
      align: "left",
      color: "#1c1917",
      lineHeight: 1.15,
      letterSpacing: 0,
      opacity: 1,
      label: "可编辑标题",
    },
  ];
}

export function mapPptxPresentationToDeck(
  parsed: JsonRecord,
  fallbackTitle: string,
  sourceExtension = "pptx",
): DeckDocument {
  const rawSize = record(parsed.size);
  const size = {
    width: Math.max(1, number(rawSize.width, 960)),
    height: Math.max(1, number(rawSize.height, 540)),
  };
  const unsupported = new Map<string, number>();
  const usedIds = new Set<string>();
  const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
  const slides: DeckSlide[] = rawSlides.map((value, slideIndex) => {
    const source = record(value);
    const layoutElements = Array.isArray(source.layoutElements)
      ? source.layoutElements
      : [];
    const slideElements = Array.isArray(source.elements) ? source.elements : [];
    const notes = string(source.note);
    const elements = ensureSlideEditableText(
      convertPptxElements(
        explicitSlideElements(layoutElements, slideElements),
        size,
        slideIndex,
        unsupported,
        usedIds,
      ),
      slideIndex,
      usedIds,
      notes,
    );
    return {
      id: `pptx-slide-${slideIndex + 1}`,
      title: inferSlideTitle(elements, slideIndex),
      body: "",
      bullets: [],
      notes,
      layout: "blank",
      background: slideBackground(source.fill),
      elements,
    };
  });
  if (!slides.length) throw new Error("PPTX 中没有可读取的幻灯片");
  const warnings = [...unsupported.entries()].map(
    ([kind, count]) => `${count} 个 ${kind} 元素以只读占位保留`,
  );
  if (sourceExtension.toLowerCase() !== "pptx") {
    warnings.push(`${sourceExtension.toUpperCase()} 宏或模板能力不会写入导出文件`);
  }
  return normalizeDeckDocument(
    {
      version: 2,
      title: fallbackTitle || "演示文稿",
      aspect: size.width / size.height < 1.5 ? "4:3" : "16:9",
      theme: "paper",
      slides,
      importWarnings: warnings,
    },
    fallbackTitle,
  );
}

/**
 * Import OOXML presentation data into OceanLeo's positioned native deck model.
 * The parser is loaded only for real PPTX files, keeping blank decks lightweight.
 */
export async function importPptxDeck(
  bytes: ArrayBuffer,
  fallbackTitle: string,
  sourceExtension = "pptx",
): Promise<DeckDocument> {
  // The package's legacy `main` points at a side-effect-only UMD bundle while
  // its ESM parser lives here; use the explicit ESM entry in every runtime.
  const module = (await import("pptxtojson/dist/index.js")) as unknown as {
    parse?: (
      file: ArrayBuffer,
      options?: Record<string, unknown>,
    ) => Promise<JsonRecord>;
    default?: {
      parse?: (
        file: ArrayBuffer,
        options?: Record<string, unknown>,
      ) => Promise<JsonRecord>;
    };
  };
  const parse = module.parse || module.default?.parse;
  if (!parse) throw new Error("PPTX 导入器未正确加载");
  const parsed = await parse(bytes, {
    imageMode: "base64",
    videoMode: "none",
    audioMode: "none",
  });
  return mapPptxPresentationToDeck(parsed, fallbackTitle, sourceExtension);
}
