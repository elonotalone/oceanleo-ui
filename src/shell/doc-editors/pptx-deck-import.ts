import {
  deckId,
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
  "fontSize" | "fontFamily" | "color" | "bold" | "italic" | "align"
> {
  const fontSize = number(cssValue(content, "font-size").replace(/pt$/i, ""), 18);
  const textAlign = cssValue(content, "text-align").toLowerCase();
  return {
    fontSize: Math.max(4, Math.min(300, fontSize)),
    fontFamily: cssValue(content, "font-family") || undefined,
    color: hex(cssValue(content, "color"), "#111827"),
    bold: /font-weight\s*:\s*(?:bold|[6-9]00)/i.test(content),
    italic: /font-style\s*:\s*italic/i.test(content),
    align: (
      textAlign === "center" || textAlign === "right" ? textAlign : "left"
    ) as DeckTextAlign,
  };
}

function baseElement(
  source: JsonRecord,
  type: DeckElement["type"],
  size: { width: number; height: number },
  index: number,
): DeckElement {
  return {
    id: deckId("element"),
    type,
    x: percentage(source.left, size.width, 10),
    y: percentage(source.top, size.height, 10),
    width: Math.max(0.5, percentage(source.width, size.width, 30)),
    height: Math.max(0.5, percentage(source.height, size.height, 15)),
    rotation: number(source.rotate),
    order: number(source.order, index),
  };
}

function convertElement(
  value: unknown,
  size: { width: number; height: number },
  index: number,
  unsupported: Map<string, number>,
): DeckElement | null {
  const source = record(value);
  const type = string(source.type).toLowerCase();
  const content = string(source.content);
  if (type === "text") {
    return {
      ...baseElement(source, "text", size, index),
      text: plainText(content),
      fill: fillColor(source.fill) || undefined,
      borderColor: hex(source.borderColor) || undefined,
      borderWidth: Math.max(0, number(source.borderWidth)),
      ...textStyle(content),
    };
  }
  if (type === "shape") {
    return {
      ...baseElement(source, "shape", size, index),
      text: plainText(content) || undefined,
      shape: string(source.shapType || source.shapeType || "rect"),
      fill: fillColor(source.fill) || undefined,
      borderColor: hex(source.borderColor) || undefined,
      borderWidth: Math.max(0, number(source.borderWidth)),
      ...textStyle(content),
    };
  }
  if (type === "image") {
    const src = string(source.base64 || source.blob);
    if (!/^(?:data:image\/|blob:|https?:)/i.test(src)) return null;
    return {
      ...baseElement(source, "image", size, index),
      src,
      alt: string(source.name || source.ref || "PPTX 图片"),
      borderColor: hex(source.borderColor) || undefined,
      borderWidth: Math.max(0, number(source.borderWidth)),
    };
  }
  if (type === "table") {
    const data = Array.isArray(source.data) ? source.data : [];
    return {
      ...baseElement(source, "table", size, index),
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
        ...baseElement(source, "image", size, index),
        src: image,
        alt: string(source.text || source.latex || "公式"),
      };
    }
    return {
      ...baseElement(source, "text", size, index),
      text: string(source.text || source.latex || "公式"),
      fontSize: 18,
      color: "#111827",
    };
  }
  unsupported.set(type || "unknown", (unsupported.get(type || "unknown") || 0) + 1);
  return {
    ...baseElement(source, "unsupported", size, index),
    label:
      type === "chart"
        ? "图表（原始数据保留在源文件）"
        : type === "diagram"
          ? "SmartArt / 图示（原始内容保留在源文件）"
          : `${type || "未知"} 元素（原始内容保留在源文件）`,
  };
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
  const rawSize = record(parsed.size);
  const size = {
    width: Math.max(1, number(rawSize.width, 960)),
    height: Math.max(1, number(rawSize.height, 540)),
  };
  const unsupported = new Map<string, number>();
  const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
  const slides: DeckSlide[] = rawSlides.map((value, slideIndex) => {
    const source = record(value);
    const rawElements = [
      ...(Array.isArray(source.layoutElements) ? source.layoutElements : []),
      ...(Array.isArray(source.elements) ? source.elements : []),
    ];
    const elements = rawElements
      .map((element, index) =>
        convertElement(element, size, index, unsupported),
      )
      .filter((element): element is DeckElement => Boolean(element))
      .sort((left, right) => left.order - right.order);
    return {
      id: deckId(),
      title: inferSlideTitle(elements, slideIndex),
      body: "",
      bullets: [],
      notes: string(source.note),
      layout: "blank",
      background: slideBackground(source.fill),
      elements,
    };
  });
  if (!slides.length) throw new Error("PPTX 中没有可读取的幻灯片");
  const warnings = [...unsupported.entries()].map(
    ([kind, count]) => `${count} 个 ${kind} 元素以只读占位保留`,
  );
  if (sourceExtension !== "pptx") {
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
