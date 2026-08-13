import {
  DECK_FONT_SIZES,
  DECK_GRID,
  DECK_IR_LAYOUTS,
  DECK_THEME_PALETTE,
  deckLayoutDefinition,
  type DeckBox,
  type DeckFontRole,
  type DeckIrLayout,
} from "./deck-layout-grid";
import type { DeckIrDocument } from "./deck-ir";
import { packById } from "./deck-packs";

export type DeckAspect = "16:9" | "4:3";

/**
 * The 16 layout grammars of `deck-extension.md` §4 plus the two legacy editor
 * grammars (`title-body`, `blank`) that pre-date the contract. §4 L1–L5 keep
 * their original identifiers so existing decks stay compatible (§6.4).
 */
export type DeckLayout =
  | DeckIrLayout
  | "title-body"
  | "blank";

/**
 * The grammars that are *not* §4 carriers. Derived from `DeckLayout` rather
 * than re-listed, so promoting a grammar into `DECK_IR_LAYOUTS` removes it from
 * the legacy placement path in the same edit instead of leaving a stale branch
 * behind.
 */
export type DeckLegacyLayout = Exclude<DeckLayout, DeckIrLayout>;

export type DeckThemeId = "ocean" | "paper" | "ink" | "sunset" | "forest";
export type DeckElementType =
  | "text"
  | "image"
  | "shape"
  | "table"
  | "unsupported";
export type DeckTextAlign = "left" | "center" | "right";
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

/** §4 — every layout the editor accepts, in §4 order with the legacy pair last. */
export const DECK_EDITOR_LAYOUTS: readonly DeckLayout[] = [
  ...DECK_IR_LAYOUTS,
  "title-body",
  "blank",
];

const LAYOUTS = new Set<DeckLayout>(DECK_EDITOR_LAYOUTS);
const IR_LAYOUTS = new Set<string>(DECK_IR_LAYOUTS);

export function deckLayoutIsCarrierGrammar(
  layout: DeckLayout,
): layout is DeckIrLayout {
  return IR_LAYOUTS.has(layout);
}

export interface DeckPercentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function percentBox(target: DeckBox): DeckPercentBox {
  return {
    x: (target.x / DECK_GRID.pageWidth) * 100,
    y: (target.y / DECK_GRID.pageHeight) * 100,
    width: (target.cx / DECK_GRID.pageWidth) * 100,
    height: (target.cy / DECK_GRID.pageHeight) * 100,
  };
}

/**
 * §2.2 → editor percentages. The stage stores element geometry as a percentage
 * of the page so imported decks stay responsive; the §4 EMU grid is the single
 * source of truth and is converted here rather than duplicated by hand.
 */
export function deckLayoutPercentBoxes(
  layout: DeckIrLayout,
): Record<string, DeckPercentBox> {
  const boxes = deckLayoutDefinition(layout).boxes;
  const result: Record<string, DeckPercentBox> = {};
  for (const [name, target] of Object.entries(boxes)) {
    result[name] = percentBox(target);
  }
  return result;
}

/** §2.3 — the `sz` ladder expressed in points for the browser stage. */
export function deckFontPoints(role: DeckFontRole): number {
  return DECK_FONT_SIZES[role] / 100;
}

interface LayoutSlots {
  title?: { box: string; role: DeckFontRole; align?: DeckTextAlign };
  content?: { box: string; role: DeckFontRole; align?: DeckTextAlign };
  image?: string;
  accent?: string;
}

/** Which §4 box each of the editor's three legacy fields lands in. */
const LAYOUT_SLOTS: Readonly<Record<DeckIrLayout, LayoutSlots>> = {
  title: {
    title: { box: "title", role: "display", align: "center" },
    content: { box: "subtitle", role: "body", align: "center" },
    accent: "accentBar",
  },
  section: {
    title: { box: "title", role: "section" },
    content: { box: "subtitle", role: "body-sm" },
    accent: "accentBar",
  },
  bullets: {
    title: { box: "title", role: "heading" },
    content: { box: "bullets", role: "body" },
    accent: "accentDot",
  },
  "two-column": {
    title: { box: "title", role: "heading" },
    content: { box: "left", role: "body-sm" },
  },
  "data-table": {
    title: { box: "title", role: "heading" },
    content: { box: "table", role: "table" },
  },
  "image-full": {
    title: { box: "title", role: "section" },
    image: "image",
    accent: "scrim",
  },
  "image-left": {
    title: { box: "title", role: "heading" },
    content: { box: "bullets", role: "body" },
    image: "image",
  },
  "image-right": {
    title: { box: "title", role: "heading" },
    content: { box: "bullets", role: "body" },
    image: "image",
  },
  "image-grid": {
    title: { box: "title", role: "heading" },
    image: "cell",
  },
  "chart-focus": {
    title: { box: "title", role: "heading" },
    content: { box: "conclusion", role: "body-sm" },
  },
  "chart-with-notes": {
    title: { box: "title", role: "heading" },
    content: { box: "bullets", role: "body-sm" },
  },
  "kpi-row": {
    title: { box: "title", role: "heading" },
    content: { box: "card", role: "kpi", align: "center" },
  },
  comparison: {
    title: { box: "title", role: "heading" },
    content: { box: "left", role: "body-sm" },
  },
  timeline: {
    title: { box: "title", role: "heading" },
    content: { box: "axis", role: "caption" },
    accent: "axis",
  },
  quote: {
    title: { box: "quote", role: "section" },
    content: { box: "attribution", role: "body", align: "right" },
    accent: "mark",
    image: "background",
  },
  "mixed-triptych": {
    title: { box: "title", role: "heading" },
    content: { box: "bullets", role: "body-sm" },
    image: "image",
  },
};
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
    align:
      align === "center" || align === "right" || align === "left"
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

export interface DeckCarrierPlacement {
  title?: DeckPercentBox & { fontSize: number; align: DeckTextAlign };
  content?: DeckPercentBox & { fontSize: number; align: DeckTextAlign };
  image?: DeckPercentBox;
}

/** §4 — where the title, the content block and the picture sit in a grammar. */
export function deckCarrierPlacement(layout: DeckIrLayout): DeckCarrierPlacement {
  const boxes = deckLayoutPercentBoxes(layout);
  const slots = LAYOUT_SLOTS[layout];
  const placement: DeckCarrierPlacement = {};
  if (slots.title && boxes[slots.title.box]) {
    placement.title = {
      ...boxes[slots.title.box],
      fontSize: deckFontPoints(slots.title.role),
      align: slots.title.align || "left",
    };
  }
  if (slots.content && boxes[slots.content.box]) {
    placement.content = {
      ...boxes[slots.content.box],
      fontSize: deckFontPoints(slots.content.role),
      align: slots.content.align || "left",
    };
  }
  if (slots.image && boxes[slots.image]) placement.image = boxes[slots.image];
  return placement;
}

/**
 * §4 — element scaffolding for the 16 carrier grammars. Placement comes from
 * the EMU grid so the stage, the preview and the OOXML export agree on where
 * each block sits.
 */
function carrierSlideElements({
  title,
  body,
  bullets,
  layout,
  image,
}: {
  title: string;
  body: string;
  bullets: string[];
  layout: DeckIrLayout;
  image?: DeckImage;
}): DeckElement[] {
  const boxes = deckLayoutPercentBoxes(layout);
  const slots = LAYOUT_SLOTS[layout];
  const elements: DeckElement[] = [];
  let order = 0;

  if (slots.accent && boxes[slots.accent]) {
    elements.push({
      id: deckId("element"),
      type: "shape",
      ...boxes[slots.accent],
      rotation: 0,
      order: (order += 1),
      shape: layout === "timeline" ? "rectangle" : "rectangle",
      fill: `#${DECK_THEME_PALETTE.accent1}`,
      opacity: layout === "image-full" ? 0.6 : 1,
      locked: false,
    });
  }
  if (slots.image && boxes[slots.image] && image?.url) {
    elements.push({
      id: deckId("element"),
      type: "image",
      ...boxes[slots.image],
      rotation: 0,
      order: (order += 1),
      src: image.url,
      alt: image.alt,
      imageFit: "cover",
      opacity: 1,
      locked: false,
    });
  }
  if (slots.title && boxes[slots.title.box] && title) {
    elements.push({
      id: deckId("element"),
      type: "text",
      ...boxes[slots.title.box],
      rotation: 0,
      order: (order += 1),
      text: title,
      fontSize: deckFontPoints(slots.title.role),
      bold: true,
      align: slots.title.align || "left",
      color:
        layout === "image-full"
          ? `#${DECK_THEME_PALETTE.lt1}`
          : `#${DECK_THEME_PALETTE.dk1}`,
      lineHeight: 1.12,
      opacity: 1,
      locked: false,
    });
  }
  const content = [
    body,
    bullets.length ? bullets.map((item) => `• ${item}`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  if (slots.content && boxes[slots.content.box] && content) {
    elements.push({
      id: deckId("element"),
      type: "text",
      ...boxes[slots.content.box],
      rotation: 0,
      order: (order += 1),
      text: content,
      fontSize: deckFontPoints(slots.content.role),
      align: slots.content.align || "left",
      color: `#${DECK_THEME_PALETTE.dk1}`,
      lineHeight: 1.32,
      opacity: 1,
      locked: false,
    });
  }
  return elements;
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
  if (deckLayoutIsCarrierGrammar(layout)) {
    return carrierSlideElements({ title, body, bullets, layout, image });
  }
  // Only `DeckLegacyLayout` reaches this point. The centred (`title`,
  // `section`) and side-by-side (`image-left`, `image-right`) grammars are §4
  // carriers, so they are placed from the EMU grid above; what is left is the
  // flush-left `title-body` / `blank` pair, with the picture parked on the
  // right.
  const hasImage = Boolean(image?.url);
  const textX = hasImage ? 7 : 8;
  const textWidth = hasImage ? 41 : 84;
  const elements: DeckElement[] = [];
  if (title) {
    elements.push({
      id: deckId("element"),
      type: "text",
      x: textX,
      y: 13,
      width: textWidth,
      height: 14,
      rotation: 0,
      order: 1,
      text: title,
      fontSize: 32,
      bold: true,
      align: "left",
      lineHeight: 1.08,
      opacity: 1,
      locked: false,
    });
  }
  const content = [body, bullets.length ? bullets.map((item) => `• ${item}`).join("\n") : ""]
    .filter(Boolean)
    .join("\n\n");
  if (content) {
    elements.push({
      id: deckId("element"),
      type: "text",
      x: textX,
      y: 33,
      width: textWidth,
      height: 48,
      rotation: 0,
      order: 2,
      text: content,
      fontSize: 19,
      align: "left",
      lineHeight: 1.35,
      opacity: 1,
      locked: false,
    });
  }
  if (image?.url) {
    elements.push({
      id: deckId("element"),
      type: "image",
      x: 52,
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
    layout,
    background: color(source.background || source.bg || source.backgroundColor),
    transition,
    masterId: text(source.masterId || source.master_id).trim() || undefined,
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

/**
 * §4 — legacy editor grammars fold onto carrier grammars when a deck is
 * serialized as `oceanleo.deck.v1`. `blank` has no §4 counterpart, so it
 * degrades to `bullets`, the §4 default.
 */
export function deckCarrierLayoutFor(layout: DeckLayout): DeckIrLayout {
  if (deckLayoutIsCarrierGrammar(layout)) return layout;
  return layout === "title-body" ? "bullets" : "bullets";
}

/**
 * §1.2 — load the `oceanleo.deck.v1` byte shape into the editor's working
 * model. `resolveAsset` turns an `assets[].id` into a URL the stage can draw;
 * unresolved ids leave the page picture-free rather than emitting a broken
 * reference (§3.6 `degraded`).
 */
export function deckDocumentFromIr(
  project: DeckIrDocument,
  resolveAsset: (assetId: string) => string | undefined = () => undefined,
): DeckDocument {
  const master = createDeckMaster("ocean", "默认母版", "master-default");
  const pack = project.packId ? packById(project.packId) : undefined;
  const sourceSurface = project.theme.surface?.color;
  const surfaceColor =
    typeof sourceSurface === "string" && /^[0-9A-Fa-f]{6}$/.test(sourceSurface)
      ? sourceSurface.toUpperCase()
      : pack?.surface.color;
  const surfaceImage = project.theme.surface?.image;
  const surfaceUrl = surfaceImage
    ? resolveAsset(surfaceImage.assetId)
    : undefined;
  const fontFamily =
    project.theme.fontMajor || pack?.fonts.major || master.fontFamily;
  return {
    version: 2,
    title: project.title,
    aspect: "16:9",
    theme: "ocean",
    masters: [
      {
        ...master,
        ...(surfaceColor ? { background: `#${surfaceColor}` } : {}),
        accentColor: `#${project.theme.accent.toUpperCase()}`,
        fontFamily,
      },
    ],
    slides: project.slides.map((slide, index) => {
      const first = slide.images?.[0];
      const url = first ? resolveAsset(first.assetId) : undefined;
      const image = url && first ? { url, alt: first.alt } : undefined;
      const bullets = [
        ...(slide.bullets || []),
        ...(slide.left || []),
        ...(slide.right || []),
        ...(slide.kpis || []).map((kpi) =>
          `${kpi.value}${kpi.unit || ""} · ${kpi.label}`,
        ),
        ...(slide.milestones || []).map(
          (milestone) => `${milestone.at} · ${milestone.label}`,
        ),
      ];
      const body =
        slide.body ||
        slide.subtitle ||
        slide.quote?.text ||
        (slide.table
          ? [slide.table.header, ...slide.table.rows]
              .map((row) => row.join(" | "))
              .join("\n")
          : "");
      const title = slide.title || slide.quote?.attribution || `第 ${index + 1} 页`;
      const surfaceElement: DeckElement[] =
        surfaceUrl && surfaceImage
          ? [
              {
                id: deckId("element"),
                type: "image",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                rotation: 0,
                order: 0,
                src: surfaceUrl,
                alt: surfaceImage.alt,
                imageFit:
                  surfaceImage.fit === "contain" ? "contain" : "cover",
                opacity: 1,
                locked: true,
              },
            ]
          : [];
      return {
        id: deckId(),
        title,
        body,
        bullets,
        notes: slide.note || "",
        layout: slide.layout,
        background: "",
        masterId: master.id,
        image,
        elements: [
          ...surfaceElement,
          ...carrierSlideElements({
            title,
            body,
            bullets,
            layout: slide.layout,
            image,
          }),
        ],
      };
    }),
  };
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
