export type DeckAspect = "16:9" | "4:3";

export type DeckLayout =
  | "title"
  | "title-body"
  | "section"
  | "bullets"
  | "image-left"
  | "image-right"
  | "blank";

export type DeckThemeId = "ocean" | "paper" | "ink" | "sunset" | "forest";
export type DeckElementType =
  | "text"
  | "image"
  | "shape"
  | "table"
  | "unsupported";
export type DeckTextAlign = "left" | "center" | "right";
export type DeckImageFit = "contain" | "cover" | "fill";

/**
 * Positioned native slide element. Coordinates and dimensions are percentages
 * of the slide so imported PPTX pages remain responsive in the browser.
 */
export interface DeckElement {
  id: string;
  type: DeckElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  order: number;
  text?: string;
  src?: string;
  alt?: string;
  shape?: string;
  fill?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: DeckTextAlign;
  lineHeight?: number;
  letterSpacing?: number;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  shadow?: boolean;
  locked?: boolean;
  flipX?: boolean;
  flipY?: boolean;
  imageFit?: DeckImageFit;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
  rows?: string[][];
  label?: string;
}

export interface DeckImage {
  url: string;
  alt: string;
}

export interface DeckSlide {
  id: string;
  title: string;
  body: string;
  bullets: string[];
  notes: string;
  layout: DeckLayout;
  background: string;
  image?: DeckImage;
  elements: DeckElement[];
}

export interface DeckDocument {
  version: 2;
  title: string;
  aspect: DeckAspect;
  theme: DeckThemeId;
  slides: DeckSlide[];
  importWarnings?: string[];
}

export interface DeckTheme {
  id: DeckThemeId;
  label: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  fontFamily: string;
}

export const DECK_THEMES: readonly DeckTheme[] = [
  {
    id: "ocean",
    label: "海洋",
    background: "#eef6ff",
    surface: "#ffffff",
    text: "#10243e",
    muted: "#52677f",
    accent: "#1677ff",
    fontFamily: "Aptos, PingFang SC, Microsoft YaHei, sans-serif",
  },
  {
    id: "paper",
    label: "纸张",
    background: "#f5f3ef",
    surface: "#fffdf8",
    text: "#292524",
    muted: "#78716c",
    accent: "#b45309",
    fontFamily: "Georgia, Noto Serif SC, Songti SC, serif",
  },
  {
    id: "ink",
    label: "深墨",
    background: "#111827",
    surface: "#1f2937",
    text: "#f9fafb",
    muted: "#cbd5e1",
    accent: "#38bdf8",
    fontFamily: "Aptos, PingFang SC, Microsoft YaHei, sans-serif",
  },
  {
    id: "sunset",
    label: "日落",
    background: "#fff1ed",
    surface: "#fffaf7",
    text: "#4c1d20",
    muted: "#9f5f58",
    accent: "#f05a47",
    fontFamily: "Aptos, PingFang SC, Microsoft YaHei, sans-serif",
  },
  {
    id: "forest",
    label: "森林",
    background: "#edf7f0",
    surface: "#fbfefc",
    text: "#16352a",
    muted: "#587568",
    accent: "#16845b",
    fontFamily: "Aptos, PingFang SC, Microsoft YaHei, sans-serif",
  },
] as const;

const LAYOUTS = new Set<DeckLayout>([
  "title",
  "title-body",
  "section",
  "bullets",
  "image-left",
  "image-right",
  "blank",
]);
const THEMES = new Set<DeckThemeId>(DECK_THEMES.map((theme) => theme.id));
let serial = 0;

export function deckId(prefix = "slide"): string {
  serial += 1;
  return `${prefix}-${Date.now().toString(36)}-${serial.toString(36)}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function color(value: unknown): string {
  const candidate = text(value).trim();
  return /^#[0-9a-f]{3,8}$/i.test(candidate) ? candidate : "";
}

function normalizeImage(value: unknown, source: Record<string, unknown>): DeckImage | undefined {
  const image = record(value);
  const url = text(
    typeof value === "string"
      ? value
      : image.url || image.src || image.data || source.imageUrl || source.image_url,
  ).trim();
  if (!/^(?:https?:|data:image\/|blob:)/i.test(url)) return undefined;
  return { url, alt: text(image.alt || source.imageAlt || source.image_alt) };
}

function normalizeBullets(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(text).map((item) => item.trim()).filter(Boolean).slice(0, 100);
  }
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 100);
}

function finite(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function normalizeElement(value: unknown, index: number): DeckElement | null {
  const source = record(value);
  const rawType = text(source.type).trim() as DeckElementType;
  if (
    rawType !== "text" &&
    rawType !== "image" &&
    rawType !== "shape" &&
    rawType !== "table" &&
    rawType !== "unsupported"
  ) {
    return null;
  }
  const rows = Array.isArray(source.rows)
    ? source.rows
        .slice(0, 100)
        .map((row) =>
          Array.isArray(row)
            ? row.slice(0, 50).map((cell) => text(cell).slice(0, 2_000))
            : [],
        )
    : undefined;
  const align = text(source.align) as DeckTextAlign;
  const src = text(source.src || source.url).trim();
  return {
    id: text(source.id).trim() || deckId("element"),
    type: rawType,
    x: finite(source.x, 10, -100, 200),
    y: finite(source.y, 10, -100, 200),
    width: finite(source.width, 30, 0.5, 300),
    height: finite(source.height, 15, 0.5, 300),
    rotation: finite(source.rotation, 0, -360, 360),
    order: finite(source.order, index, -100_000, 100_000),
    text: text(source.text).slice(0, 100_000) || undefined,
    src: /^(?:https?:|data:image\/|blob:)/i.test(src) ? src : undefined,
    alt: text(source.alt).slice(0, 1_000) || undefined,
    shape: text(source.shape).slice(0, 80) || undefined,
    fill: color(source.fill) || undefined,
    color: color(source.color) || undefined,
    fontSize: finite(source.fontSize, 18, 4, 300),
    fontFamily: text(source.fontFamily).slice(0, 200) || undefined,
    bold: Boolean(source.bold),
    italic: Boolean(source.italic),
    underline: Boolean(source.underline),
    align:
      align === "center" || align === "right" || align === "left"
        ? align
        : undefined,
    lineHeight: finite(source.lineHeight, 1.15, 0.7, 4),
    letterSpacing: finite(source.letterSpacing, 0, -10, 40),
    borderColor: color(source.borderColor) || undefined,
    borderWidth: finite(source.borderWidth, 0, 0, 40),
    borderRadius: finite(source.borderRadius, 0, 0, 999),
    opacity: finite(source.opacity, 1, 0, 1),
    shadow: Boolean(source.shadow),
    locked: Boolean(source.locked),
    flipX: Boolean(source.flipX),
    flipY: Boolean(source.flipY),
    imageFit:
      source.imageFit === "cover" || source.imageFit === "fill"
        ? source.imageFit
        : "contain",
    brightness: finite(source.brightness, 1, 0, 3),
    contrast: finite(source.contrast, 1, 0, 3),
    saturation: finite(source.saturation, 1, 0, 3),
    blur: finite(source.blur, 0, 0, 30),
    rows,
    label: text(source.label).slice(0, 500) || undefined,
  };
}

function legacySlideElements({
  title,
  body,
  bullets,
  layout,
  image,
}: {
  title: string;
  body: string;
  bullets: string[];
  layout: DeckLayout;
  image?: DeckImage;
}): DeckElement[] {
  if (layout === "blank" && !title && !body && !bullets.length && !image?.url) {
    return [];
  }
  const centered = layout === "title" || layout === "section";
  const hasImage = Boolean(image?.url);
  const imageLeft = layout === "image-left";
  const textX = hasImage ? (imageLeft ? 52 : 7) : 8;
  const textWidth = hasImage ? 41 : 84;
  const elements: DeckElement[] = [];
  if (title) {
    elements.push({
      id: deckId("element"),
      type: "text",
      x: textX,
      y: centered ? 28 : 13,
      width: textWidth,
      height: centered ? 20 : 14,
      rotation: 0,
      order: 1,
      text: title,
      fontSize: centered ? 42 : 32,
      bold: true,
      align: centered ? "center" : "left",
      lineHeight: 1.08,
      opacity: 1,
      locked: false,
    });
  }
  const content = [body, bullets.length ? bullets.map((item) => `• ${item}`).join("\n") : ""]
    .filter(Boolean)
    .join("\n\n");
  if (content && layout !== "title") {
    elements.push({
      id: deckId("element"),
      type: "text",
      x: textX,
      y: centered ? 52 : 33,
      width: textWidth,
      height: centered ? 23 : 48,
      rotation: 0,
      order: 2,
      text: content,
      fontSize: 19,
      align: centered ? "center" : "left",
      lineHeight: 1.35,
      opacity: 1,
      locked: false,
    });
  }
  if (image?.url) {
    elements.push({
      id: deckId("element"),
      type: "image",
      x: imageLeft ? 7 : 52,
      y: 14,
      width: 41,
      height: 72,
      rotation: 0,
      order: 3,
      src: image.url,
      alt: image.alt,
      imageFit: "cover",
      borderRadius: 18,
      opacity: 1,
      locked: false,
    });
  }
  return elements;
}

export function emptyDeckSlide(title = "新幻灯片"): DeckSlide {
  return {
    id: deckId(),
    title,
    body: "",
    bullets: [],
    notes: "",
    layout: "title-body",
    background: "",
    elements: legacySlideElements({
      title,
      body: "",
      bullets: [],
      layout: "title-body",
    }),
  };
}

function normalizeSlide(value: unknown, index: number): DeckSlide {
  const source = record(value);
  const rawLayout = text(source.layout || source.type) as DeckLayout;
  const bullets = normalizeBullets(
    source.bullets || source.points || source.items,
  );
  const body = text(
    source.body || source.content || source.description || source.text,
  );
  const title =
    text(source.title || source.heading || source.name).trim() ||
    `第 ${index + 1} 页`;
  const layout = LAYOUTS.has(rawLayout)
    ? rawLayout
    : bullets.length > 0
      ? "bullets"
      : "title-body";
  const image = normalizeImage(source.image, source);
  const normalizedElements = Array.isArray(source.elements)
    ? source.elements
        .map(normalizeElement)
        .filter((element): element is DeckElement => Boolean(element))
    : [];
  return {
    id: text(source.id).trim() || deckId(),
    title,
    body,
    bullets,
    notes: text(source.notes || source.speakerNotes || source.speaker_notes),
    layout,
    background: color(source.background || source.bg || source.backgroundColor),
    image,
    elements:
      normalizedElements.length > 0
        ? normalizedElements
        : legacySlideElements({ title, body, bullets, layout, image }),
  };
}

/** Normalize agent JSON, library metadata, or a raw slide array into v2. */
export function normalizeDeckDocument(
  value: unknown,
  fallbackTitle = "演示文稿",
): DeckDocument {
  const outer = record(value);
  const nested = record(outer.deck);
  const source = Object.keys(nested).length > 0 ? nested : outer;
  const rawSlides = Array.isArray(value)
    ? value
    : Array.isArray(source.slides)
      ? source.slides
      : [];
  const rawTheme = text(source.theme || outer.theme) as DeckThemeId;
  const slides = rawSlides.map(normalizeSlide);
  const importWarnings = Array.isArray(source.importWarnings)
    ? source.importWarnings
        .map(text)
        .map((warning) => warning.trim())
        .filter(Boolean)
        .slice(0, 50)
    : [];
  return {
    version: 2,
    title: text(source.title || outer.title).trim() || fallbackTitle,
    aspect: text(source.aspect || outer.aspect) === "4:3" ? "4:3" : "16:9",
    theme: THEMES.has(rawTheme) ? rawTheme : "ocean",
    slides: slides.length ? slides : [emptyDeckSlide()],
    ...(importWarnings.length ? { importWarnings } : {}),
  };
}

export function cloneDeckDocument(deck: DeckDocument): DeckDocument {
  return {
    ...deck,
    slides: deck.slides.map((slide) => ({
      ...slide,
      bullets: [...slide.bullets],
      image: slide.image ? { ...slide.image } : undefined,
      elements: slide.elements.map((element) => ({
        ...element,
        rows: element.rows?.map((row) => [...row]),
      })),
    })),
    importWarnings: deck.importWarnings ? [...deck.importWarnings] : undefined,
  };
}

export function deckTheme(id: DeckThemeId): DeckTheme {
  return DECK_THEMES.find((theme) => theme.id === id) || DECK_THEMES[0];
}
