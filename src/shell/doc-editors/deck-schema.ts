import {
  deckSafeLink,
  deckTextList,
  type DeckTextList,
} from "./deck-text-format";

export type { DeckTextList } from "./deck-text-format";

export type DeckAspect = "16:9" | "4:3";

/** PPTX slides use freely positioned elements. */
export type DeckLayout = "blank";

export type DeckThemeId = "ocean" | "paper" | "ink" | "sunset" | "forest";
export type DeckElementType =
  | "text"
  | "image"
  | "shape"
  | "table"
  | "unsupported";
export type DeckTextAlign = "left" | "center" | "right" | "justify";
export type DeckImageFit = "contain" | "cover" | "fill";
export type DeckLineDash = "solid" | "dash" | "dot";
export type DeckLineMarker = "none" | "arrow" | "circle" | "diamond";
export type DeckTransitionType =
  | "none"
  | "fade"
  | "push-left"
  | "push-right"
  | "wipe"
  | "zoom";
export type DeckAnimationType = "none" | "fade" | "fly-up" | "wipe" | "zoom";

export interface DeckTransition {
  type: Exclude<DeckTransitionType, "none">;
  durationMs: number;
}

export interface DeckElementAnimation {
  type: Exclude<DeckAnimationType, "none">;
  durationMs: number;
  delayMs: number;
}

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
  /** 整框删除线、文字底色、列表、超链接（`deck-text-format.ts`，10-23 D9）。 */
  strike?: boolean;
  highlight?: string;
  list?: DeckTextList;
  link?: string;
  align?: DeckTextAlign;
  lineHeight?: number;
  letterSpacing?: number;
  borderColor?: string;
  borderWidth?: number;
  lineDash?: DeckLineDash;
  lineStart?: DeckLineMarker;
  lineEnd?: DeckLineMarker;
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
  animation?: DeckElementAnimation;
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
  transition?: DeckTransition;
  masterId?: string;
  image?: DeckImage;
  elements: DeckElement[];
}

export interface DeckMaster {
  id: string;
  name: string;
  background: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
}

export interface DeckDocument {
  version: 2;
  title: string;
  aspect: DeckAspect;
  theme: DeckThemeId;
  masters: DeckMaster[];
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

const THEMES = new Set<DeckThemeId>(DECK_THEMES.map((theme) => theme.id));
const TRANSITIONS = new Set<Exclude<DeckTransitionType, "none">>([
  "fade",
  "push-left",
  "push-right",
  "wipe",
  "zoom",
]);
const ANIMATIONS = new Set<Exclude<DeckAnimationType, "none">>([
  "fade",
  "fly-up",
  "wipe",
  "zoom",
]);
let serial = 0;

export function deckId(prefix = "slide"): string {
  serial += 1;
  return `${prefix}-${Date.now().toString(36)}-${serial.toString(36)}`;
}

export function createDeckMaster(
  themeId: DeckThemeId,
  name = "默认母版",
  id = deckId("master"),
): DeckMaster {
  const theme = deckTheme(themeId);
  return {
    id,
    name,
    background: theme.background,
    textColor: theme.text,
    accentColor: theme.accent,
    fontFamily: theme.fontFamily,
  };
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

/** 新的整框文字格式只在设过时才写进元素，旧文稿的投影与字节不因此变化。 */
function deckTextFormatFields(
  source: Record<string, unknown>,
): Pick<DeckElement, "strike" | "highlight" | "list" | "link"> {
  const list = deckTextList(source.list);
  const highlight = color(source.highlight);
  const link = deckSafeLink(source.link);
  return {
    ...(source.strike === true ? { strike: true } : {}),
    ...(highlight ? { highlight } : {}),
    ...(list !== "none" ? { list } : {}),
    ...(link ? { link } : {}),
  };
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

function normalizeMasters(value: unknown, themeId: DeckThemeId): DeckMaster[] {
  const used = new Set<string>();
  const masters = (Array.isArray(value) ? value.slice(0, 50) : []).flatMap(
    (entry, index) => {
      const source = record(entry);
      if (!Object.keys(source).length) return [];
      let id = text(source.id || `master-${index + 1}`)
        .replace(/[^a-z0-9_.:-]/gi, "-")
        .slice(0, 80);
      if (!id || used.has(id)) id = `master-${index + 1}`;
      used.add(id);
      const fallback = createDeckMaster(themeId, `母版 ${index + 1}`, id);
      return [
        {
          id,
          name: text(source.name).trim().slice(0, 120) || fallback.name,
          background: color(source.background) || fallback.background,
          textColor: color(source.textColor) || fallback.textColor,
          accentColor: color(source.accentColor) || fallback.accentColor,
          fontFamily:
            text(source.fontFamily).trim().slice(0, 200) ||
            fallback.fontFamily,
        },
      ];
    },
  );
  return masters.length
    ? masters
    : [createDeckMaster(themeId, "默认母版", "master-default")];
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
  const lineDash = text(source.lineDash) as DeckLineDash;
  const lineStart = text(source.lineStart) as DeckLineMarker;
  const lineEnd = text(source.lineEnd) as DeckLineMarker;
  const src = text(source.src || source.url).trim();
  const animationSource = record(source.animation);
  const animationType = text(
    animationSource.type || source.animationType,
  ) as Exclude<DeckAnimationType, "none">;
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
    ...deckTextFormatFields(source),
    align:
      align === "center" ||
      align === "right" ||
      align === "left" ||
      align === "justify"
        ? align
        : undefined,
    lineHeight: finite(source.lineHeight, 1.15, 0.7, 4),
    letterSpacing: finite(source.letterSpacing, 0, -10, 40),
    borderColor: color(source.borderColor) || undefined,
    borderWidth: finite(source.borderWidth, 0, 0, 40),
    lineDash:
      lineDash === "dash" || lineDash === "dot" ? lineDash : "solid",
    lineStart:
      lineStart === "arrow" ||
      lineStart === "circle" ||
      lineStart === "diamond"
        ? lineStart
        : "none",
    lineEnd:
      lineEnd === "arrow" ||
      lineEnd === "circle" ||
      lineEnd === "diamond"
        ? lineEnd
        : "none",
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
    animation: ANIMATIONS.has(animationType)
      ? {
          type: animationType,
          durationMs: finite(
            animationSource.durationMs || source.animationDurationMs,
            500,
            100,
            3_000,
          ),
          delayMs: finite(
            animationSource.delayMs || source.animationDelayMs,
            0,
            0,
            10_000,
          ),
        }
      : undefined,
  };
}

export function emptyDeckSlide(title = "新幻灯片"): DeckSlide {
  return {
    id: deckId(),
    title,
    body: "",
    bullets: [],
    notes: "",
    layout: "blank",
    background: "",
    elements: [],
  };
}

function normalizeSlide(value: unknown, index: number): DeckSlide {
  const source = record(value);
  const bullets = normalizeBullets(
    source.bullets || source.points || source.items,
  );
  const body = text(
    source.body || source.content || source.description || source.text,
  );
  const title =
    text(source.title || source.heading || source.name).trim() ||
    `第 ${index + 1} 页`;
  const image = normalizeImage(source.image, source);
  const transitionSource = record(source.transition);
  const transitionType = text(
    transitionSource.type || source.transitionType || source.transition_type,
  );
  const transition =
    TRANSITIONS.has(transitionType as Exclude<DeckTransitionType, "none">)
      ? {
          type: transitionType as Exclude<DeckTransitionType, "none">,
          durationMs: finite(
            transitionSource.durationMs ||
              transitionSource.duration_ms ||
              source.transitionDurationMs ||
              source.transition_duration_ms,
            500,
            100,
            3_000,
          ),
        }
      : undefined;
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
    layout: "blank",
    background: color(source.background || source.bg || source.backgroundColor),
    transition,
    masterId: text(source.masterId || source.master_id).trim() || undefined,
    image,
    elements: normalizedElements,
  };
}

/** Normalize the freeform working model produced by PPTX import and recovery. */
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
  const theme = THEMES.has(rawTheme) ? rawTheme : "ocean";
  const masters = normalizeMasters(source.masters, theme);
  const masterIds = new Set(masters.map((master) => master.id));
  const fallbackMasterId = masters[0].id;
  const slides = rawSlides.map(normalizeSlide).map((slide) => ({
    ...slide,
    masterId:
      slide.masterId && masterIds.has(slide.masterId)
        ? slide.masterId
        : fallbackMasterId,
  }));
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
    theme,
    masters,
    slides: slides.length
      ? slides
      : [{ ...emptyDeckSlide(), masterId: fallbackMasterId }],
    ...(importWarnings.length ? { importWarnings } : {}),

  };
}

export function cloneDeckDocument(deck: DeckDocument): DeckDocument {
  return {
    ...deck,
    masters: deck.masters.map((master) => ({ ...master })),
    slides: deck.slides.map((slide) => ({
      ...slide,
      bullets: [...slide.bullets],
      transition: slide.transition ? { ...slide.transition } : undefined,
      image: slide.image ? { ...slide.image } : undefined,
      elements: slide.elements.map((element) => ({
        ...element,
        animation: element.animation ? { ...element.animation } : undefined,
        rows: element.rows?.map((row) => [...row]),
      })),
    })),
    importWarnings: deck.importWarnings ? [...deck.importWarnings] : undefined,
  };
}

export function deckTheme(id: DeckThemeId): DeckTheme {
  return DECK_THEMES.find((theme) => theme.id === id) || DECK_THEMES[0];
}

export function deckMasterFor(
  deck: DeckDocument,
  slide: DeckSlide,
): DeckMaster {
  return (
    deck.masters.find((master) => master.id === slide.masterId) ||
    deck.masters[0] ||
    createDeckMaster(deck.theme, "默认母版", "master-default")
  );
}
