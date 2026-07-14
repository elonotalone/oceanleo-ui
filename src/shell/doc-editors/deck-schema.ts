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
}

export interface DeckDocument {
  version: 1;
  title: string;
  aspect: DeckAspect;
  theme: DeckThemeId;
  slides: DeckSlide[];
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

export function emptyDeckSlide(title = "新幻灯片"): DeckSlide {
  return {
    id: deckId(),
    title,
    body: "",
    bullets: [],
    notes: "",
    layout: "title-body",
    background: "",
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
  return {
    id: text(source.id).trim() || deckId(),
    title:
      text(source.title || source.heading || source.name).trim() ||
      `第 ${index + 1} 页`,
    body,
    bullets,
    notes: text(source.notes || source.speakerNotes || source.speaker_notes),
    layout: LAYOUTS.has(rawLayout)
      ? rawLayout
      : bullets.length > 0
        ? "bullets"
        : "title-body",
    background: color(source.background || source.bg || source.backgroundColor),
    image: normalizeImage(source.image, source),
  };
}

/** Normalize agent JSON, library metadata, or a raw slide array into v1. */
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
  return {
    version: 1,
    title: text(source.title || outer.title).trim() || fallbackTitle,
    aspect: text(source.aspect || outer.aspect) === "4:3" ? "4:3" : "16:9",
    theme: THEMES.has(rawTheme) ? rawTheme : "ocean",
    slides: slides.length ? slides : [emptyDeckSlide()],
  };
}

export function cloneDeckDocument(deck: DeckDocument): DeckDocument {
  return {
    ...deck,
    slides: deck.slides.map((slide) => ({
      ...slide,
      bullets: [...slide.bullets],
      image: slide.image ? { ...slide.image } : undefined,
    })),
  };
}

export function deckTheme(id: DeckThemeId): DeckTheme {
  return DECK_THEMES.find((theme) => theme.id === id) || DECK_THEMES[0];
}
