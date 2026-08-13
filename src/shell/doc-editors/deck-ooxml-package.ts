/**
 * `oceanleo.deck.v1` → PresentationML package.
 *
 * Implements spec §3.2 (the parts P1–P9 the old generator never wrote),
 * §3.2a (attribution lives in `docProps/custom.xml`; `dc:rights` does not
 * exist in OPC core properties), §3.3 (`p:pic`), §3.4 (chart part with
 * complete `c:numCache` / `c:strCache`), §3.5 (master / 16 layouts / theme)
 * and §4 (the 16 layout grammars).
 */

import { strToU8, zipSync } from "fflate";

import {
  DECK_CONSTANTS,
  DECK_FONT_SIZES,
  DECK_GRID,
  DECK_LAYOUT_DEFINITIONS,
  DECK_SERIES_COLORS,
  DECK_THEME_PALETTE,
  DECK_THEME_SLOT_ORDER,
  deckImageGridCells,
  deckKpiCards,
  deckLayoutDefinition,
  deckTimelineNodes,
  type DeckBox,
  type DeckFontRole,
  type DeckIrLayout,
  type DeckThemeSlot,
} from "./deck-layout-grid";
import {
  DECK_PPTX_MAX_BYTES,
  DECK_PPTX_MIN_BYTES,
  type DeckIrChart,
  type DeckIrDocument,
  type DeckIrImage,
  type DeckIrSlide,
  type DeckIrThemeSurfaceImage,
} from "./deck-ir";
import { packById, type DeckPack } from "./deck-packs";

const XML_DECLARATION =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  c: "http://schemas.openxmlformats.org/drawingml/2006/chart",
} as const;

/** §3.2 — relationship type URIs, used verbatim. */
export const DECK_RELATIONSHIP_TYPES = {
  officeDocument: `${NS.r}/officeDocument`,
  slideMaster: `${NS.r}/slideMaster`,
  slideLayout: `${NS.r}/slideLayout`,
  slide: `${NS.r}/slide`,
  notesSlide: `${NS.r}/notesSlide`,
  notesMaster: `${NS.r}/notesMaster`,
  theme: `${NS.r}/theme`,
  image: `${NS.r}/image`,
  chart: `${NS.r}/chart`,
  /** §3.2a.3 gap 1 — note the `package/2006` domain. */
  coreProperties:
    "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
  /** §3.2a.2 — note the `officeDocument/2006` domain, not `package/2006`. */
  customProperties: `${NS.r}/custom-properties`,
} as const;

/** §3.2 / §3.2a — the content types every Override must carry. */
export const DECK_CONTENT_TYPES = {
  presentation:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  slide: "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
  slideMaster:
    "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml",
  slideLayout:
    "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml",
  notesSlide:
    "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml",
  notesMaster:
    "application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml",
  theme: "application/vnd.openxmlformats-officedocument.theme+xml",
  chart: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
  /** §3.2a.3 gap 1 — missing today, which orphans `docProps/core.xml`. */
  coreProperties: "application/vnd.openxmlformats-package.core-properties+xml",
  /** §3.2a.3 gap 2 — missing in the `04-presentation_editing.pptx` precedent. */
  customProperties:
    "application/vnd.openxmlformats-officedocument.custom-properties+xml",
} as const;

/** §3.2a.2 — the fixed GUID for user-defined properties. */
export const DECK_CUSTOM_PROPERTY_FMTID =
  "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}";
/** §3.2a.2 — the property name carrying the credits string. */
export const DECK_CREDITS_PROPERTY = "OceanLeoCredits";
/** §5 C50 — `pid` 0 and 1 are reserved. */
export const DECK_CUSTOM_PROPERTY_FIRST_PID = DECK_CONSTANTS.C50;

const DEFAULT_MAJOR_FONT = "Aptos";
/**
 * §3.5 — `a:ea` must name a CJK face or the fallback glyphs drift per machine.
 * This is the default, not the rule: `theme.fontEastAsian` overrides it.
 */
const DEFAULT_EAST_ASIAN_FONT = "Microsoft YaHei";
/** The shipped scrim opacity over a full-bleed photograph, in percent. */
const DEFAULT_SCRIM_ALPHA = 60;
/** The shipped image-grid width, in cells. */
const DEFAULT_GRID_COLUMNS = 3;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // OOXML forbids C0 control characters other than tab / LF / CR.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function hex6(value: string | undefined, fallback: string): string {
  const candidate = (value || "").trim().replace(/^#/, "");
  return /^[0-9A-Fa-f]{6}$/.test(candidate) ? candidate.toUpperCase() : fallback;
}

function deckPackFor(project: DeckIrDocument): Readonly<DeckPack> | undefined {
  const packId = (project as DeckIrDocument & { packId?: unknown }).packId;
  return typeof packId === "string" ? packById(packId) : undefined;
}

interface ResolvedDeckSurface {
  color?: string;
  image?: DeckIrThemeSurfaceImage;
}

function deckResolvedSurface(
  project: DeckIrDocument,
  pack: Readonly<DeckPack> | undefined,
  palette: Record<DeckThemeSlot, string>,
): ResolvedDeckSurface {
  const source = project.theme.surface;
  const fallback = pack?.surface.color || palette.lt1;
  const color = source?.color
    ? hex6(source.color, fallback)
    : pack?.surface.color || (source?.image ? fallback : undefined);
  return {
    ...(color ? { color } : {}),
    ...(source?.image ? { image: source.image } : {}),
  };
}

/** §2.1 — the resolved 12-slot palette after `theme.accent*` overrides. */
export function deckResolvedPalette(
  project: DeckIrDocument,
): Record<DeckThemeSlot, string> {
  const pack = deckPackFor(project);
  if (pack) {
    const { key: _key, label: _label, ...palette } = pack.palette;
    return { ...DECK_THEME_PALETTE, ...palette };
  }
  const theme = project.theme;
  return {
    ...DECK_THEME_PALETTE,
    accent1: hex6(theme.accent, DECK_THEME_PALETTE.accent1),
    accent2: hex6(theme.accent2, DECK_THEME_PALETTE.accent2),
    accent3: hex6(theme.accent3, DECK_THEME_PALETTE.accent3),
    accent4: hex6(theme.accent4, DECK_THEME_PALETTE.accent4),
    accent5: hex6(theme.accent5, DECK_THEME_PALETTE.accent5),
    accent6: hex6(theme.accent6, DECK_THEME_PALETTE.accent6),
  };
}

/**
 * §3.2a.2 / §5 C48 — the `vt:lpwstr` payload. Over 4,000 characters the string
 * is cut at the last complete entry, never mid-word.
 */
export function deckCreditsText(project: DeckIrDocument): string {
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

interface ShapeAllocator {
  next(): number;
  count(): number;
}

function shapeAllocator(): ShapeAllocator {
  let id = 1;
  let shapes = 0;
  return {
    next() {
      id += 1;
      shapes += 1;
      return id;
    },
    count() {
      return shapes;
    },
  };
}

function xfrm(target: DeckBox): string {
  return (
    `<a:xfrm><a:off x="${Math.round(target.x)}" y="${Math.round(target.y)}"/>` +
    `<a:ext cx="${Math.round(target.cx)}" cy="${Math.round(target.cy)}"/></a:xfrm>`
  );
}

function solidFill(color: string, alphaPercent?: number): string {
  const alpha =
    alphaPercent === undefined
      ? ""
      : `<a:alpha val="${Math.round(alphaPercent * 1000)}"/>`;
  return `<a:solidFill><a:srgbClr val="${color}">${alpha}</a:srgbClr></a:solidFill>`;
}

interface TextRunStyle {
  role: DeckFontRole;
  color: string;
  bold?: boolean;
  align?: "l" | "ctr" | "r";
  bullet?: boolean;
  fontMajor?: string;
  fontEastAsian?: string;
  fontScale?: number;
  lineSpacing?: number;
}

/**
 * `a:spcPts/@val` is in hundredths of a point and one point is 12,700 EMU, so an
 * EMU line pitch converts with 12,700 / 100 = 127.
 */
const EMU_PER_HUNDREDTH_POINT = 127;

function paragraph(text: string, style: TextRunStyle): string {
  const scale = style.fontScale ?? 1;
  const size =
    scale === 1
      ? DECK_FONT_SIZES[style.role]
      : Math.round(DECK_FONT_SIZES[style.role] * scale);
  const spacing = style.lineSpacing
    ? `<a:lnSpc><a:spcPts val="${Math.round(style.lineSpacing / EMU_PER_HUNDREDTH_POINT)}"/></a:lnSpc>`
    : "";
  const bullet = style.bullet
    ? '<a:buFont typeface="Arial"/><a:buChar char="\u2022"/>'
    : "<a:buNone/>";
  const properties =
    `<a:pPr algn="${style.align || "l"}" ${style.bullet ? 'marL="228600" indent="-228600"' : 'marL="0" indent="0"'}>` +
    `${spacing}${bullet}</a:pPr>`;
  const run =
    `<a:r><a:rPr lang="zh-CN" altLang="en-US" sz="${size}" b="${style.bold ? 1 : 0}" dirty="0">` +
    solidFill(style.color) +
    `<a:latin typeface="${escapeXml(style.fontMajor || DEFAULT_MAJOR_FONT)}"/>` +
    `<a:ea typeface="${escapeXml(style.fontEastAsian || DEFAULT_EAST_ASIAN_FONT)}"/>` +
    `</a:rPr><a:t>${escapeXml(text)}</a:t></a:r>`;
  return `<a:p>${properties}${run}</a:p>`;
}

function textBox(
  id: number,
  name: string,
  target: DeckBox,
  paragraphs: string[],
  options: { anchor?: "t" | "ctr" | "b"; fill?: string; fillAlpha?: number } = {},
): string {
  const fill = options.fill ? solidFill(options.fill, options.fillAlpha) : "<a:noFill/>";
  return (
    "<p:sp><p:nvSpPr>" +
    `<p:cNvPr id="${id}" name="${escapeXml(name)}"/>` +
    '<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
    `<p:spPr>${xfrm(target)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}</p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="91440" rIns="91440" anchor="${options.anchor || "t"}">` +
    "<a:normAutofit/></a:bodyPr><a:lstStyle/>" +
    (paragraphs.length ? paragraphs.join("") : '<a:p><a:endParaRPr lang="zh-CN"/></a:p>') +
    "</p:txBody></p:sp>"
  );
}

function shapeBlock(
  id: number,
  name: string,
  target: DeckBox,
  fill: string,
  options: { preset?: string; alpha?: number } = {},
): string {
  return (
    "<p:sp><p:nvSpPr>" +
    `<p:cNvPr id="${id}" name="${escapeXml(name)}"/>` +
    "<p:cNvSpPr/><p:nvPr/></p:nvSpPr>" +
    `<p:spPr>${xfrm(target)}` +
    `<a:prstGeom prst="${options.preset || "rect"}"><a:avLst/></a:prstGeom>` +
    `${solidFill(fill, options.alpha)}<a:ln><a:noFill/></a:ln></p:spPr>` +
    '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody>' +
    "</p:sp>"
  );
}

/**
 * §3.3 — `p:pic`. `fit = cover` centre-crops with `a:srcRect` (C34: thousandths
 * of a percent) rather than stretching; `descr` is the SC 1.1.1 alt text.
 */
export function deckPictureXml(
  id: number,
  relationshipId: string,
  target: DeckBox,
  image: DeckIrImage,
  natural?: { width: number; height: number },
): string {
  let srcRect = "<a:srcRect/>";
  if ((image.fit || "cover") === "cover" && natural && natural.width > 0 && natural.height > 0) {
    const frameRatio = target.cx / target.cy;
    const imageRatio = natural.width / natural.height;
    if (imageRatio > frameRatio) {
      const keep = frameRatio / imageRatio;
      const crop = Math.round(((1 - keep) / 2) * DECK_CONSTANTS.C34[1]);
      if (crop > 0) srcRect = `<a:srcRect l="${crop}" r="${crop}"/>`;
    } else if (imageRatio < frameRatio) {
      const keep = imageRatio / frameRatio;
      const crop = Math.round(((1 - keep) / 2) * DECK_CONSTANTS.C34[1]);
      if (crop > 0) srcRect = `<a:srcRect t="${crop}" b="${crop}"/>`;
    }
  }
  return (
    "<p:pic><p:nvPicPr>" +
    `<p:cNvPr id="${id}" name="p${id}" descr="${escapeXml(image.alt)}"/>` +
    '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>' +
    "<p:nvPr/></p:nvPicPr>" +
    `<p:blipFill><a:blip r:embed="${relationshipId}"/>${srcRect}` +
    "<a:stretch><a:fillRect/></a:stretch></p:blipFill>" +
    `<p:spPr>${xfrm(target)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    "</p:pic>"
  );
}

function containPictureBox(
  target: DeckBox,
  natural: { width?: number; height?: number } | undefined,
): DeckBox {
  if (
    !natural?.width ||
    !natural.height ||
    natural.width <= 0 ||
    natural.height <= 0
  ) {
    return target;
  }
  const frameRatio = target.cx / target.cy;
  const imageRatio = natural.width / natural.height;
  if (imageRatio > frameRatio) {
    const cy = Math.round(target.cx / imageRatio);
    return {
      x: target.x,
      y: target.y + Math.round((target.cy - cy) / 2),
      cx: target.cx,
      cy,
    };
  }
  const cx = Math.round(target.cy * imageRatio);
  return {
    x: target.x + Math.round((target.cx - cx) / 2),
    y: target.y,
    cx,
    cy: target.cy,
  };
}

/** §3.4 — the frame uses `p:xfrm`, not `a:xfrm`; the wrong prefix breaks the package. */
export function deckGraphicFrameXml(
  id: number,
  relationshipId: string,
  target: DeckBox,
): string {
  return (
    "<p:graphicFrame><p:nvGraphicFramePr>" +
    `<p:cNvPr id="${id}" name="c${id}"/>` +
    "<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>" +
    `<p:xfrm><a:off x="${Math.round(target.x)}" y="${Math.round(target.y)}"/>` +
    `<a:ext cx="${Math.round(target.cx)}" cy="${Math.round(target.cy)}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="${NS.c}">` +
    `<c:chart xmlns:c="${NS.c}" xmlns:r="${NS.r}" r:id="${relationshipId}"/>` +
    "</a:graphicData></a:graphic></p:graphicFrame>"
  );
}

function numberCache(values: number[], formatCode = "General"): string {
  const points = values
    .map((value, index) => `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`)
    .join("");
  return (
    `<c:numCache><c:formatCode>${formatCode}</c:formatCode>` +
    `<c:ptCount val="${values.length}"/>${points}</c:numCache>`
  );
}

function stringCache(values: string[]): string {
  const points = values
    .map((value, index) => `<c:pt idx="${index}"><c:v>${escapeXml(value)}</c:v></c:pt>`)
    .join("");
  return `<c:strCache><c:ptCount val="${values.length}"/>${points}</c:strCache>`;
}

function columnLetter(index: number): string {
  let value = index + 1;
  let letters = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

const CATEGORY_AXIS_ID = 111_111_111;
const VALUE_AXIS_ID = 222_222_222;

/**
 * §3.4 / §7 F5 — the chart part. `c:strCache` and `c:numCache` are always
 * written in full: without them LibreOffice paints an empty plot on first
 * render, which is exactly the hollow-preview symptom this carrier governs.
 */
export function deckChartXml(chart: DeckIrChart, palette: Record<DeckThemeSlot, string>): string {
  const categories = chart.categories;
  const lastRow = categories.length + 1;
  // Three or more series told apart by colour alone are unreadable to a
  // colour-blind viewer, so labels are on by default once the chart gets that
  // busy. `showDataLabels: false` used to be quietly reversed here; an explicit
  // answer is now obeyed, and the IR readings say what the trade-off was.
  const showLabels =
    chart.showDataLabels === undefined
      ? chart.series.length >= 3
      : chart.showDataLabels === true;
  const dataLabels = showLabels
    ? '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/>' +
      '<c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>'
    : "";
  const isScatter = chart.chartType === "scatter";
  const isPie = chart.chartType === "pie";

  const series = chart.series
    .map((entry, index) => {
      const letter = columnLetter(index + 1);
      const color = hex6(entry.color, DECK_SERIES_COLORS[index % DECK_SERIES_COLORS.length]);
      const name =
        `<c:tx><c:strRef><c:f>Sheet1!$${letter}$1</c:f>` +
        `${stringCache([entry.name])}</c:strRef></c:tx>`;
      const shape = isPie ? "" : `<c:spPr>${solidFill(color)}</c:spPr>`;
      const marker =
        chart.chartType === "line" || isScatter
          ? `<c:marker><c:symbol val="${["circle", "square", "diamond", "triangle", "x", "star"][index % 6]}"/>` +
            `<c:size val="7"/><c:spPr>${solidFill(color)}</c:spPr></c:marker>`
          : "";
      const categoryRef =
        `<c:strRef><c:f>Sheet1!$A$2:$A$${lastRow}</c:f>${stringCache(categories)}</c:strRef>`;
      const valueRef =
        `<c:numRef><c:f>Sheet1!$${letter}$2:$${letter}$${lastRow}</c:f>` +
        `${numberCache(entry.values)}</c:numRef>`;
      const body = isScatter
        ? `<c:xVal>${categoryRef}</c:xVal><c:yVal>${valueRef}</c:yVal><c:smooth val="0"/>`
        : `<c:cat>${categoryRef}</c:cat><c:val>${valueRef}</c:val>` +
          (chart.chartType === "line" ? '<c:smooth val="0"/>' : "");
      return (
        `<c:ser><c:idx val="${index}"/><c:order val="${index}"/>${name}` +
        `${shape}${marker}${dataLabels}${body}</c:ser>`
      );
    })
    .join("");

  const axisIds = isPie ? "" : `<c:axId val="${CATEGORY_AXIS_ID}"/><c:axId val="${VALUE_AXIS_ID}"/>`;
  const plot =
    chart.chartType === "bar"
      ? `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>` +
        `<c:varyColors val="0"/>${series}<c:gapWidth val="60"/>${axisIds}</c:barChart>`
      : chart.chartType === "line"
        ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}` +
          `<c:marker val="1"/>${axisIds}</c:lineChart>`
        : chart.chartType === "area"
          ? `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}${axisIds}</c:areaChart>`
          : isPie
            ? `<c:pieChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/></c:pieChart>`
            : `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${series}${axisIds}</c:scatterChart>`;

  const axisTitle = chart.axisLabel
    ? "<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>" +
      `<a:p><a:r><a:rPr lang="zh-CN" sz="${DECK_FONT_SIZES.caption}"/>` +
      `<a:t>${escapeXml(chart.axisLabel)}</a:t></a:r></a:p></c:rich></c:tx>` +
      '<c:overlay val="0"/></c:title>'
    : "";
  const categoryAxis = isPie
    ? ""
    : isScatter
      ? `<c:valAx><c:axId val="${CATEGORY_AXIS_ID}"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
        `<c:delete val="0"/><c:axPos val="b"/>${axisTitle}<c:crossAx val="${VALUE_AXIS_ID}"/></c:valAx>`
      : `<c:catAx><c:axId val="${CATEGORY_AXIS_ID}"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
        `<c:delete val="0"/><c:axPos val="b"/>${axisTitle}` +
        `<c:crossAx val="${VALUE_AXIS_ID}"/></c:catAx>`;
  const valueAxis = isPie
    ? ""
    : `<c:valAx><c:axId val="${VALUE_AXIS_ID}"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
      '<c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/>' +
      `<c:numFmt formatCode="General" sourceLinked="1"/><c:crossAx val="${CATEGORY_AXIS_ID}"/></c:valAx>`;

  return (
    `${XML_DECLARATION}\n` +
    `<c:chartSpace xmlns:c="${NS.c}" xmlns:a="${NS.a}" xmlns:r="${NS.r}">` +
    '<c:roundedCorners val="0"/><c:chart><c:autoTitleDeleted val="1"/>' +
    `<c:plotArea><c:layout/>${plot}${categoryAxis}${valueAxis}</c:plotArea>` +
    `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>` +
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>' +
    `<c:spPr>${solidFill(palette.lt1)}</c:spPr></c:chartSpace>`
  );
}

export interface DeckAssetBytes {
  /** `assets[].id` */
  id: string;
  bytes: Uint8Array;
  width?: number;
  height?: number;
}

interface SlideRelationship {
  id: string;
  type: string;
  target: string;
}

interface SlideBuild {
  xml: string;
  relationships: SlideRelationship[];
  chartXml: string[];
  shapeCount: number;
  pictureCount: number;
  chartFrameCount: number;
}

interface SlideContext {
  project: DeckIrDocument;
  pack?: Readonly<DeckPack>;
  surface: ResolvedDeckSurface;
  palette: Record<DeckThemeSlot, string>;
  slideNumber: number;
  slideCount: number;
  media: Map<string, { path: string; width?: number; height?: number }>;
  chartCounter: { value: number };
  fontMajor: string;
  fontEastAsian: string;
  fontScale: number;
  /**
   * Anything the writer noticed while laying this page out that the caller
   * would want to know — a picture handed to a grammar with no frame for it,
   * a count clamped to what the grid holds. Never fatal.
   */
  notes: string[];
}

/**
 * §2.2 — `pitch` is an EMU line pitch, not one fixed constant. §5 already names
 * two of them (C11 `bulletPitch` 520,000 for full-width bullets, C12
 * `columnPitch` 500,000 for the two-column grammar) and §4 L13 packs the
 * comparison columns tighter still. The annotation is required: `DECK_GRID` is
 * `as const`, so an unannotated default would infer the literal `520000` and
 * reject every other pitch in the domain.
 */
function bulletParagraphs(
  items: readonly string[],
  role: DeckFontRole,
  color: string,
  context: SlideContext,
  pitch: number = DECK_GRID.bulletPitch,
): string[] {
  return items.map((item) =>
    paragraph(item, {
      role,
      color,
      bullet: true,
      lineSpacing: pitch,
      fontMajor: context.fontMajor,
      fontEastAsian: context.fontEastAsian,
      fontScale: context.fontScale,
    }),
  );
}

function plain(
  text: string,
  role: DeckFontRole,
  color: string,
  context: SlideContext,
  extra: Partial<TextRunStyle> = {},
): string {
  return paragraph(text, {
    role,
    color,
    fontMajor: context.fontMajor,
    fontEastAsian: context.fontEastAsian,
    fontScale: context.fontScale,
    ...extra,
  });
}

/** The caller's scrim opacity if they gave a usable one, otherwise the default. */
function scrimAlphaFor(slide: DeckIrSlide): number {
  const asked = slide.scrimAlpha;
  if (typeof asked !== "number" || !Number.isFinite(asked) || asked < 0 || asked > 100) {
    return DEFAULT_SCRIM_ALPHA;
  }
  return asked;
}

function packScrimShapes(
  pack: Readonly<DeckPack>,
  target: DeckBox,
  allocator: ShapeAllocator,
): string[] {
  const bands = pack.scrim.verticalBands;
  return bands.map((alpha, index) => {
    const left = Math.round((target.cx * index) / bands.length);
    const right = Math.round((target.cx * (index + 1)) / bands.length);
    return shapeBlock(
      allocator.next(),
      `scrim-band-${index + 1}`,
      { x: target.x + left, y: target.y, cx: right - left, cy: target.cy },
      pack.scrim.color,
      { alpha },
    );
  });
}

/** The caller's grid width if they gave a usable one, otherwise the default. */
function gridColumnsFor(slide: DeckIrSlide): number {
  const asked = slide.gridColumns;
  if (typeof asked !== "number" || !Number.isInteger(asked) || asked < 1 || asked > 6) {
    return DEFAULT_GRID_COLUMNS;
  }
  return asked;
}

function buildSlide(slide: DeckIrSlide, context: SlideContext): SlideBuild {
  const definition = deckLayoutDefinition(slide.layout);
  const palette = context.palette;
  const allocator = shapeAllocator();
  const shapes: string[] = [];
  const relationships: SlideRelationship[] = [];
  const chartXml: string[] = [];
  let pictureCount = 0;
  let chartFrameCount = 0;

  const addPicture = (image: DeckIrImage, target: DeckBox) => {
    const media = context.media.get(image.assetId);
    if (!media) {
      context.notes.push(
        `Page ${context.slideNumber}: no bytes were supplied for picture "${image.assetId}", ` +
          "so the page ships with an empty picture frame.",
      );
      return false;
    }
    const relationshipId = `rId${relationships.length + 2}`;
    relationships.push({
      id: relationshipId,
      type: DECK_RELATIONSHIP_TYPES.image,
      target: `../media/${media.path}`,
    });
    shapes.push(
      deckPictureXml(
        allocator.next(),
        relationshipId,
        target,
        image,
        media.width && media.height
          ? { width: media.width, height: media.height }
          : undefined,
      ),
    );
    pictureCount += 1;
    return true;
  };

  const addChart = (chart: DeckIrChart, target: DeckBox) => {
    context.chartCounter.value += 1;
    const number = context.chartCounter.value;
    const relationshipId = `rId${relationships.length + 2}`;
    relationships.push({
      id: relationshipId,
      type: DECK_RELATIONSHIP_TYPES.chart,
      target: `../charts/chart${number}.xml`,
    });
    chartXml.push(deckChartXml(chart, palette));
    shapes.push(deckGraphicFrameXml(allocator.next(), relationshipId, target));
    chartFrameCount += 1;
  };

  const heading = (target: DeckBox, role: DeckFontRole, value: string, align: "l" | "ctr" | "r" = "l") => {
    shapes.push(
      textBox(allocator.next(), `title-${context.slideNumber}`, target, [
        plain(value, role, palette.dk1, context, { bold: true, align }),
      ]),
    );
  };

  const boxes = definition.boxes;
  const surfaceImage = context.surface.image;
  if (surfaceImage) {
    const media = context.media.get(surfaceImage.assetId);
    const page: DeckBox = {
      x: 0,
      y: 0,
      cx: DECK_GRID.pageWidth,
      cy: DECK_GRID.pageHeight,
    };
    addPicture(
      surfaceImage,
      surfaceImage.fit === "contain"
        ? containPictureBox(page, media)
        : page,
    );
  }

  switch (slide.layout) {
    case "title": {
      heading(boxes.title, "display", slide.title || "", "ctr");
      shapes.push(
        shapeBlock(allocator.next(), "accent-bar", boxes.accentBar, palette.accent1),
      );
      shapes.push(
        textBox(allocator.next(), "subtitle", boxes.subtitle, [
          plain(slide.subtitle || slide.body || "", "body", palette.dk2, context, {
            align: "ctr",
          }),
        ]),
      );
      break;
    }
    case "section": {
      shapes.push(
        shapeBlock(allocator.next(), "accent-rail", boxes.accentBar, palette.accent1),
      );
      heading(boxes.title, "section", slide.title || "");
      shapes.push(
        textBox(allocator.next(), "subtitle", boxes.subtitle, [
          plain(slide.subtitle || slide.body || "", "body-sm", palette.dk2, context),
        ]),
      );
      break;
    }
    case "bullets": {
      shapes.push(
        shapeBlock(allocator.next(), "accent-dot", boxes.accentDot, palette.accent1),
      );
      heading(boxes.title, "heading", slide.title || "");
      shapes.push(
        textBox(
          allocator.next(),
          "bullets",
          boxes.bullets,
          bulletParagraphs(slide.bullets || [], "body", palette.dk1, context),
        ),
      );
      break;
    }
    case "two-column": {
      heading(boxes.title, "heading", slide.title || "");
      shapes.push(
        textBox(
          allocator.next(),
          "left",
          boxes.left,
          bulletParagraphs(
            slide.left || [],
            "body-sm",
            palette.dk1,
            context,
            DECK_GRID.columnPitch,
          ),
        ),
      );
      shapes.push(
        textBox(
          allocator.next(),
          "right",
          boxes.right,
          bulletParagraphs(
            slide.right || [],
            "body-sm",
            palette.dk1,
            context,
            DECK_GRID.columnPitch,
          ),
        ),
      );
      break;
    }
    case "data-table": {
      heading(boxes.title, "heading", slide.title || "");
      const table = slide.table || { header: [], rows: [] };
      const columns = Math.max(1, table.header.length);
      const cellWidth = boxes.table.cx / columns;
      shapes.push(
        shapeBlock(
          allocator.next(),
          "table-header",
          { ...boxes.table, cy: DECK_GRID.tableHeaderHeight },
          palette.accent1,
        ),
      );
      table.header.forEach((cell, column) => {
        shapes.push(
          textBox(
            allocator.next(),
            `th-${column}`,
            {
              x: boxes.table.x + column * cellWidth,
              y: boxes.table.y,
              cx: cellWidth,
              cy: DECK_GRID.tableHeaderHeight,
            },
            [plain(cell, "caption", palette.lt1, context, { bold: true })],
            { anchor: "ctr" },
          ),
        );
      });
      table.rows.forEach((row, rowIndex) => {
        const y =
          boxes.table.y +
          DECK_GRID.tableHeaderHeight +
          rowIndex * DECK_GRID.tableRowHeight;
        if (rowIndex % 2 === 1) {
          shapes.push(
            shapeBlock(
              allocator.next(),
              `tr-${rowIndex}`,
              { x: boxes.table.x, y, cx: boxes.table.cx, cy: DECK_GRID.tableRowHeight },
              palette.lt2,
            ),
          );
        }
        row.forEach((cell, column) => {
          shapes.push(
            textBox(
              allocator.next(),
              `td-${rowIndex}-${column}`,
              { x: boxes.table.x + column * cellWidth, y, cx: cellWidth, cy: DECK_GRID.tableRowHeight },
              [plain(cell, "table", palette.dk1, context)],
              { anchor: "ctr" },
            ),
          );
        });
      });
      break;
    }
    case "image-full": {
      const image = slide.images?.[0];
      // The fit used to be forced to "cover" here, which silently discarded a
      // caller who had asked for "contain". Full-bleed still defaults to cover.
      if (image) {
        const fit = context.pack?.surface.fullBleedImage === "cover"
          ? "cover"
          : image.fit || "cover";
        addPicture({ ...image, fit }, boxes.image);
      }
      // §2.4 SC 1.4.3: the dk1 scrim is what lets `section`-sized white text
      // clear 3.0:1 over an arbitrary photograph. 60 % is the default, and a
      // caller who knows their photograph is already dark can ask for less.
      if (context.pack) {
        shapes.push(...packScrimShapes(context.pack, boxes.scrim, allocator));
      } else {
        shapes.push(
          shapeBlock(allocator.next(), "scrim", boxes.scrim, palette.dk1, {
            alpha: scrimAlphaFor(slide),
          }),
        );
      }
      shapes.push(
        textBox(
          allocator.next(),
          "title",
          boxes.title,
          [plain(slide.title || "", "section", palette.lt1, context, { bold: true })],
          { anchor: "ctr" },
        ),
      );
      break;
    }
    case "image-left":
    case "image-right": {
      const image = slide.images?.[0];
      if (image) addPicture(image, boxes.image);
      heading(boxes.title, "heading", slide.title || "");
      shapes.push(
        textBox(
          allocator.next(),
          "bullets",
          boxes.bullets,
          bulletParagraphs(slide.bullets || [], "body", palette.dk1, context),
        ),
      );
      break;
    }
    case "image-grid": {
      heading(boxes.title, "heading", slide.title || "");
      const images = slide.images || [];
      const cells = deckImageGridCells(images.length, gridColumnsFor(slide));
      if (images.length > cells.length) {
        context.notes.push(
          `Page ${context.slideNumber}: the grid holds ${cells.length} pictures and ` +
            `${images.length} were given, so the last ${images.length - cells.length} do not appear.`,
        );
      }
      images.forEach((image, index) => {
        const cell = cells[index];
        if (!cell) return;
        addPicture({ ...image, fit: image.fit || "cover" }, cell.image);
        if (image.caption) {
          shapes.push(
            textBox(
              allocator.next(),
              `caption-${index}`,
              cell.caption,
              [plain(image.caption, "caption", palette.lt1, context)],
              { anchor: "ctr", fill: palette.dk1, fillAlpha: 60 },
            ),
          );
        }
      });
      break;
    }
    case "chart-focus": {
      heading(boxes.title, "heading", slide.title || "");
      if (slide.chart) addChart(slide.chart, boxes.chart);
      shapes.push(
        shapeBlock(allocator.next(), "conclusion-bar", boxes.conclusion, palette.lt2),
      );
      shapes.push(
        textBox(
          allocator.next(),
          "conclusion",
          boxes.conclusion,
          [plain(slide.note || slide.body || "", "body-sm", palette.dk1, context)],
          { anchor: "ctr" },
        ),
      );
      break;
    }
    case "chart-with-notes": {
      heading(boxes.title, "heading", slide.title || "");
      if (slide.chart) addChart(slide.chart, boxes.chart);
      shapes.push(
        textBox(
          allocator.next(),
          "notes",
          boxes.bullets,
          bulletParagraphs(slide.bullets || [], "body-sm", palette.dk1, context),
        ),
      );
      break;
    }
    case "kpi-row": {
      heading(boxes.title, "heading", slide.title || "");
      const kpis = slide.kpis || [];
      const cards = deckKpiCards(kpis.length);
      kpis.forEach((kpi, index) => {
        const card = cards[index];
        if (!card) return;
        shapes.push(shapeBlock(allocator.next(), `kpi-card-${index}`, card, palette.lt2));
        shapes.push(
          textBox(
            allocator.next(),
            `kpi-value-${index}`,
            { ...card, cy: card.cy * 0.62 },
            [
              plain(
                kpi.unit ? `${kpi.value}${kpi.unit}` : kpi.value,
                "kpi",
                palette.accent1,
                context,
                { bold: true, align: "ctr" },
              ),
            ],
            { anchor: "ctr" },
          ),
        );
        shapes.push(
          textBox(
            allocator.next(),
            `kpi-label-${index}`,
            { ...card, y: card.y + card.cy * 0.62, cy: card.cy * 0.38 },
            [
              plain(
                kpi.delta ? `${kpi.label} ${kpi.delta}` : kpi.label,
                "caption",
                palette.dk2,
                context,
                { align: "ctr" },
              ),
            ],
            { anchor: "ctr" },
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
      for (const side of sides) {
        shapes.push(
          shapeBlock(allocator.next(), `${side.key}-header`, side.header, side.fill),
        );
        shapes.push(
          textBox(
            allocator.next(),
            `${side.key}-header-text`,
            side.header,
            [
              plain(
                side.key === "left" ? slide.subtitle || "A" : slide.note || "B",
                "caption",
                palette.lt1,
                context,
                { bold: true, align: "ctr" },
              ),
            ],
            { anchor: "ctr" },
          ),
        );
        shapes.push(
          textBox(
            allocator.next(),
            `${side.key}-items`,
            side.body,
            bulletParagraphs(slide[side.key] || [], "body-sm", palette.dk1, context, 460_000),
          ),
        );
      }
      break;
    }
    case "timeline": {
      heading(boxes.title, "heading", slide.title || "");
      shapes.push(shapeBlock(allocator.next(), "axis", boxes.axis, palette.accent1));
      const milestones = slide.milestones || [];
      const nodes = deckTimelineNodes(milestones.length);
      const labelWidth = Math.round(boxes.axis.cx / Math.max(1, milestones.length));
      milestones.forEach((milestone, index) => {
        const node = nodes[index];
        if (!node) return;
        shapes.push(
          shapeBlock(allocator.next(), `node-${index}`, node, palette.accent1, {
            preset: "ellipse",
          }),
        );
        const centered = node.x + node.cx / 2 - labelWidth / 2;
        shapes.push(
          textBox(
            allocator.next(),
            `at-${index}`,
            { x: centered, y: boxes.axis.y - 400_000, cx: labelWidth, cy: 400_000 },
            [plain(milestone.at, "subheading", palette.dk1, context, { bold: true, align: "ctr" })],
            { anchor: "b" },
          ),
        );
        shapes.push(
          textBox(
            allocator.next(),
            `label-${index}`,
            { x: centered, y: boxes.axis.y + 300_000, cx: labelWidth, cy: 320_000 },
            [plain(milestone.label, "caption", palette.dk1, context, { align: "ctr" })],
          ),
        );
        if (milestone.detail) {
          shapes.push(
            textBox(
              allocator.next(),
              `detail-${index}`,
              { x: centered, y: boxes.axis.y + 620_000, cx: labelWidth, cy: 320_000 },
              [plain(milestone.detail, "caption", palette.dk2, context, { align: "ctr" })],
            ),
          );
        }
      });
      break;
    }
    case "quote": {
      const background = slide.images?.[0];
      if (background) {
        const fit = context.pack?.surface.fullBleedImage === "cover"
          ? "cover"
          : background.fit || "cover";
        addPicture({ ...background, fit }, boxes.background);
      }
      shapes.push(shapeBlock(allocator.next(), "quote-mark", boxes.mark, palette.accent1));
      shapes.push(
        textBox(allocator.next(), "quote", boxes.quote, [
          plain(slide.quote?.text || "", "section", palette.dk1, context),
        ]),
      );
      shapes.push(
        textBox(allocator.next(), "quote-attribution", boxes.attribution, [
          plain(slide.quote?.attribution || "", "body", palette.dk2, context, { align: "r" }),
        ]),
      );
      break;
    }
    case "mixed-triptych": {
      heading(boxes.title, "heading", slide.title || "");
      const image = slide.images?.[0];
      if (image) addPicture(image, boxes.image);
      if (slide.chart) addChart(slide.chart, boxes.chart);
      shapes.push(
        textBox(
          allocator.next(),
          "bullets",
          boxes.bullets,
          bulletParagraphs(slide.bullets || [], "body-sm", palette.dk1, context),
        ),
      );
      shapes.push(
        shapeBlock(allocator.next(), "conclusion-bar", boxes.conclusion, palette.lt2),
      );
      shapes.push(
        textBox(
          allocator.next(),
          "conclusion",
          boxes.conclusion,
          [plain(slide.note || slide.body || "", "body-sm", palette.dk1, context)],
          { anchor: "ctr" },
        ),
      );
      break;
    }
  }

  const master = context.project.master;
  if (master?.footerText) {
    shapes.push(
      textBox(
        allocator.next(),
        "footer",
        {
          x: DECK_GRID.margin,
          y: DECK_GRID.footerBaselineY,
          cx: DECK_GRID.contentWidth / 2,
          cy: 300_000,
        },
        [plain(master.footerText, "note", palette.dk2, context)],
      ),
    );
  }
  if (master?.showPageNumber !== false) {
    shapes.push(
      textBox(
        allocator.next(),
        "page-number",
        {
          x: DECK_GRID.margin + DECK_GRID.contentWidth / 2,
          y: DECK_GRID.footerBaselineY,
          cx: DECK_GRID.contentWidth / 2,
          cy: 300_000,
        },
        [
          plain(
            `${context.slideNumber} / ${context.slideCount}`,
            "note",
            palette.dk2,
            context,
            { align: "r" },
          ),
        ],
      ),
    );
  }

  // §3.2a.4 — attribution must survive "save as PDF", so the last page carries
  // the same credit string as a visible `note`-sized text box (C51). A caller
  // who is placing the credits themselves can turn this one off; the machine
  // readable copy in `docProps/custom.xml` is written either way.
  if (
    context.slideNumber === context.slideCount &&
    context.project.master?.creditsBar !== false
  ) {
    shapes.push(
      textBox(
        allocator.next(),
        "oceanleo-credits",
        {
          x: DECK_GRID.margin,
          y: DECK_GRID.footerBaselineY - 340_000,
          cx: DECK_GRID.contentWidth,
          cy: 320_000,
        },
        [plain(deckCreditsText(context.project), "note", palette.dk2, context)],
      ),
    );
  }

  const layoutNumber = definition.ordinal;
  relationships.unshift({
    id: "rId1",
    type: DECK_RELATIONSHIP_TYPES.slideLayout,
    target: `../slideLayouts/slideLayout${layoutNumber}.xml`,
  });

  const xml =
    `${XML_DECLARATION}\n` +
    `<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">` +
    "<p:cSld>" +
    (context.surface.color
      ? `<p:bg><p:bgPr>${solidFill(context.surface.color)}<a:effectLst/></p:bgPr></p:bg>`
      : "") +
    "<p:spTree>" +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    shapes.join("") +
    "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>";

  return {
    xml,
    relationships,
    chartXml,
    shapeCount: allocator.count(),
    pictureCount,
    chartFrameCount,
  };
}

/**
 * `notesSlide{n}.xml` — the speaker's script for one page.
 *
 * `slide.note` used to reach the file only on the three grammars that draw a
 * conclusion strip; on the other thirteen it was read, validated, and then
 * dropped. That is the one thing a presenter cannot work around, because the
 * text is nowhere in the package to recover. It now always lands here, and the
 * grammars that draw a strip still draw it, so nothing that used to be visible
 * stops being visible.
 */
export function deckNotesSlideXml(note: string, slideNumber: number): string {
  return (
    `${XML_DECLARATION}\n` +
    `<p:notes xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">` +
    "<p:cSld><p:spTree>" +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    "<p:sp><p:nvSpPr>" +
    `<p:cNvPr id="2" name="Notes Placeholder ${slideNumber}"/>` +
    '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
    '<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
    "<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>" +
    `<a:p><a:r><a:rPr lang="zh-CN" altLang="en-US" dirty="0"/>` +
    `<a:t>${escapeXml(note)}</a:t></a:r></a:p>` +
    "</p:txBody></p:sp>" +
    "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>"
  );
}

/** The notes master a `notesSlide` must point at for PowerPoint to accept it. */
export function deckNotesMasterXml(): string {
  return (
    `${XML_DECLARATION}\n` +
    `<p:notesMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">` +
    "<p:cSld><p:spTree>" +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    "<p:sp><p:nvSpPr>" +
    '<p:cNvPr id="2" name="Notes Placeholder"/>' +
    '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
    '<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
    "<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>" +
    '<a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp>' +
    "</p:spTree></p:cSld>" +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" ' +
    'accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" ' +
    'accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    "</p:notesMaster>"
  );
}

function relationshipsXml(entries: readonly SlideRelationship[]): string {
  return (
    `${XML_DECLARATION}\n` +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    entries
      .map(
        (entry) =>
          `<Relationship Id="${entry.id}" Type="${entry.type}" Target="${escapeXml(entry.target)}"/>`,
      )
      .join("") +
    "</Relationships>"
  );
}

/** §3.5 — `theme1.xml`: 12 colour slots, both font scripts, 3 items per format list. */
export function deckThemeXml(
  palette: Record<DeckThemeSlot, string>,
  fonts: { major: string; minor: string; eastAsian: string },
): string {
  const colors = DECK_THEME_SLOT_ORDER.map(
    (slot) => `<a:${slot}><a:srgbClr val="${palette[slot]}"/></a:${slot}>`,
  ).join("");
  const fontScheme =
    '<a:fontScheme name="OceanLeo">' +
    `<a:majorFont><a:latin typeface="${escapeXml(fonts.major)}"/>` +
    `<a:ea typeface="${escapeXml(fonts.eastAsian)}"/><a:cs typeface=""/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="${escapeXml(fonts.minor)}"/>` +
    `<a:ea typeface="${escapeXml(fonts.eastAsian)}"/><a:cs typeface=""/></a:minorFont>` +
    "</a:fontScheme>";
  const fill = (shade: number) =>
    '<a:solidFill><a:schemeClr val="phClr">' +
    `<a:lumMod val="${shade}"/></a:schemeClr></a:solidFill>`;
  const line = (width: number) =>
    `<a:ln w="${width}" cap="flat" cmpd="sng" algn="ctr">` +
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
    '<a:prstDash val="solid"/></a:ln>';
  const effect = () =>
    "<a:effectStyle><a:effectLst/></a:effectStyle>";
  const formatScheme =
    '<a:fmtScheme name="OceanLeo">' +
    `<a:fillStyleLst>${fill(100_000)}${fill(90_000)}${fill(80_000)}</a:fillStyleLst>` +
    `<a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst>` +
    `<a:effectStyleLst>${effect()}${effect()}${effect()}</a:effectStyleLst>` +
    `<a:bgFillStyleLst>${fill(100_000)}${fill(95_000)}${fill(85_000)}</a:bgFillStyleLst>` +
    "</a:fmtScheme>";
  return (
    `${XML_DECLARATION}\n` +
    `<a:theme xmlns:a="${NS.a}" name="OceanLeo Deck">` +
    "<a:themeElements>" +
    `<a:clrScheme name="OceanLeo">${colors}</a:clrScheme>` +
    fontScheme +
    formatScheme +
    "</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>"
  );
}

function placeholderTree(shapes: string): string {
  return (
    "<p:spTree>" +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    shapes +
    "</p:spTree>"
  );
}

function placeholder(
  id: number,
  name: string,
  type: string,
  target: DeckBox,
  index?: number,
): string {
  const indexAttribute = index === undefined ? "" : ` idx="${index}"`;
  return (
    "<p:sp><p:nvSpPr>" +
    `<p:cNvPr id="${id}" name="${escapeXml(name)}"/>` +
    '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
    `<p:nvPr><p:ph type="${type}"${indexAttribute}/></p:nvPr></p:nvSpPr>` +
    `<p:spPr>${xfrm(target)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody>' +
    "</p:sp>"
  );
}

/** §3.5 — `slideMaster1.xml` with a complete 12-attribute `p:clrMap`. */
export function deckSlideMasterXml(palette: Record<DeckThemeSlot, string>): string {
  const shapes =
    placeholder(2, "Title Placeholder", "title", {
      x: DECK_GRID.margin,
      y: DECK_GRID.titleTextY,
      cx: DECK_GRID.contentWidth,
      cy: 800_000,
    }) +
    placeholder(
      3,
      "Body Placeholder",
      "body",
      {
        x: DECK_GRID.margin,
        y: DECK_GRID.bodyStartY,
        cx: DECK_GRID.contentWidth,
        cy: DECK_GRID.bodyHeight,
      },
      1,
    ) +
    placeholder(
      4,
      "Slide Number Placeholder",
      "sldNum",
      {
        x: DECK_GRID.margin + DECK_GRID.contentWidth / 2,
        y: DECK_GRID.footerBaselineY,
        cx: DECK_GRID.contentWidth / 2,
        cy: 300_000,
      },
      12,
    );
  const layoutIds = DECK_LAYOUT_DEFINITIONS.map(
    (definition, index) =>
      `<p:sldLayoutId id="${2_147_483_600 + index}" r:id="rId${index + 1}"/>`,
  ).join("");
  return (
    `${XML_DECLARATION}\n` +
    `<p:sldMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">` +
    `<p:cSld><p:bg><p:bgPr>${solidFill(palette.lt1)}<a:effectLst/></p:bgPr></p:bg>` +
    `${placeholderTree(shapes)}</p:cSld>` +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" ' +
    'accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" ' +
    'accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    `<p:sldLayoutIdLst>${layoutIds}</p:sldLayoutIdLst>` +
    "</p:sldMaster>"
  );
}

/** §3.5 — one `slideLayout{n}.xml` per §4 grammar, each with a `type` attribute. */
export function deckSlideLayoutXml(layout: DeckIrLayout): string {
  const definition = deckLayoutDefinition(layout);
  const shapes = Object.entries(definition.boxes)
    .slice(0, 3)
    .map(([name, target], index) =>
      placeholder(
        index + 2,
        `${layout}-${name}`,
        index === 0 ? "title" : "body",
        target,
        index === 0 ? undefined : index,
      ),
    )
    .join("");
  return (
    `${XML_DECLARATION}\n` +
    `<p:sldLayout xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" ` +
    `type="${definition.ooxmlType}" preserve="1">` +
    `<p:cSld name="${escapeXml(layout)}">${placeholderTree(shapes)}</p:cSld>` +
    "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>"
  );
}

/**
 * §3.2 — `p:presentation` children must run
 * `p:sldMasterIdLst` → `p:sldIdLst` → `p:sldSz` → `p:notesSz`.
 */
export function deckPresentationXml(
  slideCount: number,
  masterRelId: string,
  notesMasterRelId?: string,
): string {
  const slideIds = Array.from(
    { length: slideCount },
    (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`,
  ).join("");
  const notesMasterIdLst = notesMasterRelId
    ? `<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRelId}"/></p:notesMasterIdLst>`
    : "";
  return (
    `${XML_DECLARATION}\n` +
    `<p:presentation xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" saveSubsetFonts="1">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${masterRelId}"/></p:sldMasterIdLst>` +
    notesMasterIdLst +
    `<p:sldIdLst>${slideIds}</p:sldIdLst>` +
    `<p:sldSz cx="${DECK_GRID.pageWidth}" cy="${DECK_GRID.pageHeight}"/>` +
    `<p:notesSz cx="${DECK_GRID.pageHeight}" cy="${DECK_GRID.pageWidth}"/>` +
    "</p:presentation>"
  );
}

/**
 * §3.2a.1 — the OPC core property set is closed at 15 elements and holds no
 * `rights`. Only elements from that set are written here.
 */
export function deckCorePropertiesXml(project: DeckIrDocument, timestamp: string): string {
  return (
    `${XML_DECLARATION}\n` +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(project.title)}</dc:title>` +
    `<dc:subject>${escapeXml(project.title)}</dc:subject>` +
    "<dc:creator>OceanLeo</dc:creator>" +
    "<cp:lastModifiedBy>OceanLeo</cp:lastModifiedBy>" +
    "<cp:revision>1</cp:revision>" +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>` +
    "</cp:coreProperties>"
  );
}

/**
 * §3.2a.2 — the credits live here, as a `vt:lpwstr` custom property.
 *
 * The three supply keys ride along in the same part. The visible credit line on
 * the last slide is a shape: copy the page elsewhere and it comes with it,
 * delete it and it is gone. This part travels with the whole package, so it is
 * the copy that survives. Both are written, because either one alone can be
 * lost in a way the other cannot.
 */
export function deckCustomPropertiesXml(
  credits: string,
  license: Readonly<Record<string, string>> = {},
): string {
  const entries: [string, string][] = [[DECK_CREDITS_PROPERTY, credits]];
  for (const key of ["usage_scope", "license_family", "supply_tier"] as const) {
    const value = license[key];
    if (value) entries.push([key, value]);
  }
  const body = entries
    .map(
      ([name, value], index) =>
        `<property fmtid="${DECK_CUSTOM_PROPERTY_FMTID}" ` +
        `pid="${DECK_CUSTOM_PROPERTY_FIRST_PID + index}" name="${escapeXml(name)}">` +
        `<vt:lpwstr>${escapeXml(value)}</vt:lpwstr></property>`,
    )
    .join("");
  return (
    `${XML_DECLARATION}\n` +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    `${body}</Properties>`
  );
}

export interface DeckOoxmlBuildOptions {
  /** Real image bytes keyed by `assets[].id`; missing entries force `degraded`. */
  assets?: readonly DeckAssetBytes[];
  /** Fixed timestamp so the same IR always zips to the same bytes. */
  timestamp?: string;
}

export interface DeckOoxmlBuild {
  parts: Record<string, string>;
  media: Record<string, Uint8Array>;
  slideMasterCount: number;
  slideLayoutCount: number;
  themeCount: number;
  chartCount: number;
  pictureCount: number;
  notesSlideCount: number;
  shapeCounts: number[];
  credits: string;
  license: Record<string, string>;
  missingAssetIds: string[];
  /** What the writer noticed while laying the deck out. Never fatal. */
  notes: string[];
}

const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
};

/** §3.2 P1–P9 — build every part of the package as in-memory strings/bytes. */
export function buildDeckOoxmlParts(
  project: DeckIrDocument,
  options: DeckOoxmlBuildOptions = {},
): DeckOoxmlBuild {
  const pack = deckPackFor(project);
  const palette = deckResolvedPalette(project);
  const surface = deckResolvedSurface(project, pack, palette);
  const timestamp = options.timestamp || "2026-07-29T00:00:00Z";
  const fontMajor = project.theme.fontMajor || pack?.fonts.major || DEFAULT_MAJOR_FONT;
  const fontMinor = project.theme.fontMinor || pack?.fonts.minor || fontMajor;
  const fontEastAsian =
    project.theme.fontEastAsian ||
    pack?.fonts.eastAsian ||
    DEFAULT_EAST_ASIAN_FONT;
  const askedScale = project.theme.fontScale ?? pack?.fonts.fontScale;
  const fontScale =
    typeof askedScale === "number" && Number.isFinite(askedScale) && askedScale >= 0.5 && askedScale <= 2
      ? askedScale
      : 1;
  const supplied = new Map(
    (options.assets || []).map((asset) => [asset.id, asset]),
  );

  const media: Record<string, Uint8Array> = {};
  const mediaIndex = new Map<string, { path: string; width?: number; height?: number }>();
  const missingAssetIds: string[] = [];
  let mediaNumber = 0;
  for (const asset of project.assets || []) {
    const bytes = supplied.get(asset.id);
    if (!bytes) {
      missingAssetIds.push(asset.id);
      continue;
    }
    mediaNumber += 1;
    const extension = MEDIA_EXTENSIONS[asset.mediaType] || "png";
    const path = `image${mediaNumber}.${extension}`;
    media[`ppt/media/${path}`] = bytes.bytes;
    mediaIndex.set(asset.id, {
      path,
      width: bytes.width ?? asset.width,
      height: bytes.height ?? asset.height,
    });
  }

  const chartCounter = { value: 0 };
  const parts: Record<string, string> = {};
  const shapeCounts: number[] = [];
  const notes: string[] = [];
  let pictureCount = 0;
  let notesSlideCount = 0;

  project.slides.forEach((slide, index) => {
    const build = buildSlide(slide, {
      project,
      pack,
      surface,
      palette,
      slideNumber: index + 1,
      slideCount: project.slides.length,
      media: mediaIndex,
      chartCounter,
      fontMajor,
      fontEastAsian,
      fontScale,
      notes,
    });
    parts[`ppt/slides/slide${index + 1}.xml`] = build.xml;

    const slideRelationships = [...build.relationships];
    const note = typeof slide.note === "string" ? slide.note.trim() : "";
    if (note) {
      notesSlideCount += 1;
      const number = index + 1;
      slideRelationships.push({
        id: `rId${slideRelationships.length + 1}`,
        type: DECK_RELATIONSHIP_TYPES.notesSlide,
        target: `../notesSlides/notesSlide${number}.xml`,
      });
      parts[`ppt/notesSlides/notesSlide${number}.xml`] = deckNotesSlideXml(note, number);
      parts[`ppt/notesSlides/_rels/notesSlide${number}.xml.rels`] = relationshipsXml([
        {
          id: "rId1",
          type: DECK_RELATIONSHIP_TYPES.notesMaster,
          target: "../notesMasters/notesMaster1.xml",
        },
        {
          id: "rId2",
          type: DECK_RELATIONSHIP_TYPES.slide,
          target: `../slides/slide${number}.xml`,
        },
      ]);
    }
    parts[`ppt/slides/_rels/slide${index + 1}.xml.rels`] = relationshipsXml(
      slideRelationships,
    );
    build.chartXml.forEach((xml, chartIndex) => {
      const number = chartCounter.value - build.chartXml.length + chartIndex + 1;
      parts[`ppt/charts/chart${number}.xml`] = xml;
      // §3.2 P9 — the chart rels part must exist even with no embedded
      // workbook (§3.4 makes `ppt/embeddings/` optional).
      parts[`ppt/charts/_rels/chart${number}.xml.rels`] = relationshipsXml([]);
    });
    shapeCounts.push(build.shapeCount);
    pictureCount += build.pictureCount;
  });

  parts["ppt/theme/theme1.xml"] = deckThemeXml(palette, {
    major: fontMajor,
    minor: fontMinor,
    eastAsian: fontEastAsian,
  });
  parts["ppt/slideMasters/slideMaster1.xml"] = deckSlideMasterXml(palette);
  parts["ppt/slideMasters/_rels/slideMaster1.xml.rels"] = relationshipsXml([
    ...DECK_LAYOUT_DEFINITIONS.map((definition) => ({
      id: `rId${definition.ordinal}`,
      type: DECK_RELATIONSHIP_TYPES.slideLayout,
      target: `../slideLayouts/slideLayout${definition.ordinal}.xml`,
    })),
    {
      id: `rId${DECK_LAYOUT_DEFINITIONS.length + 1}`,
      type: DECK_RELATIONSHIP_TYPES.theme,
      target: "../theme/theme1.xml",
    },
  ]);
  for (const definition of DECK_LAYOUT_DEFINITIONS) {
    parts[`ppt/slideLayouts/slideLayout${definition.ordinal}.xml`] =
      deckSlideLayoutXml(definition.id);
    parts[`ppt/slideLayouts/_rels/slideLayout${definition.ordinal}.xml.rels`] =
      relationshipsXml([
        {
          id: "rId1",
          type: DECK_RELATIONSHIP_TYPES.slideMaster,
          target: "../slideMasters/slideMaster1.xml",
        },
      ]);
  }

  const slideCount = project.slides.length;
  // The notes master exists only when at least one page carries a script; a
  // deck with no notes keeps exactly the part list it had before.
  const notesMasterRelId = notesSlideCount > 0 ? `rId${slideCount + 3}` : undefined;
  if (notesSlideCount > 0) {
    parts["ppt/notesMasters/notesMaster1.xml"] = deckNotesMasterXml();
    parts["ppt/notesMasters/_rels/notesMaster1.xml.rels"] = relationshipsXml([
      {
        id: "rId1",
        type: DECK_RELATIONSHIP_TYPES.theme,
        target: "../theme/theme1.xml",
      },
    ]);
  }
  parts["ppt/presentation.xml"] = deckPresentationXml(slideCount, "rId1", notesMasterRelId);
  parts["ppt/_rels/presentation.xml.rels"] = relationshipsXml([
    {
      id: "rId1",
      type: DECK_RELATIONSHIP_TYPES.slideMaster,
      target: "slideMasters/slideMaster1.xml",
    },
    ...Array.from({ length: slideCount }, (_, index) => ({
      id: `rId${index + 2}`,
      type: DECK_RELATIONSHIP_TYPES.slide,
      target: `slides/slide${index + 1}.xml`,
    })),
    {
      id: `rId${slideCount + 2}`,
      type: DECK_RELATIONSHIP_TYPES.theme,
      target: "theme/theme1.xml",
    },
    ...(notesMasterRelId
      ? [
          {
            id: notesMasterRelId,
            type: DECK_RELATIONSHIP_TYPES.notesMaster,
            target: "notesMasters/notesMaster1.xml",
          },
        ]
      : []),
  ]);

  const credits = deckCreditsText(project);
  const license: Record<string, string> = {};
  for (const key of ["usage_scope", "license_family", "supply_tier"] as const) {
    const value = project.license?.[key];
    if (typeof value === "string" && value) license[key] = value;
  }
  parts["docProps/core.xml"] = deckCorePropertiesXml(project, timestamp);
  parts["docProps/custom.xml"] = deckCustomPropertiesXml(credits, license);

  // §3.2a.3 gap 1 — `docProps/core.xml` gets both an Override and a package
  // relationship, otherwise its `dc:title` is invisible to a conforming
  // consumer. §3.2a.2 item 2 adds the custom-properties relationship.
  parts["_rels/.rels"] = relationshipsXml([
    {
      id: "rId1",
      type: DECK_RELATIONSHIP_TYPES.officeDocument,
      target: "ppt/presentation.xml",
    },
    {
      id: "rId2",
      type: DECK_RELATIONSHIP_TYPES.coreProperties,
      target: "docProps/core.xml",
    },
    {
      id: "rId3",
      type: DECK_RELATIONSHIP_TYPES.customProperties,
      target: "docProps/custom.xml",
    },
  ]);

  const extensions = new Set(
    Object.keys(media).map((path) => path.split(".").pop() || "png"),
  );
  const defaults = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    ...Array.from(extensions).map(
      (extension) =>
        `<Default Extension="${extension}" ContentType="image/${extension === "jpg" ? "jpeg" : extension}"/>`,
    ),
  ].join("");
  const overrides = [
    `<Override PartName="/ppt/presentation.xml" ContentType="${DECK_CONTENT_TYPES.presentation}"/>`,
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${DECK_CONTENT_TYPES.slideMaster}"/>`,
    ...DECK_LAYOUT_DEFINITIONS.map(
      (definition) =>
        `<Override PartName="/ppt/slideLayouts/slideLayout${definition.ordinal}.xml" ` +
        `ContentType="${DECK_CONTENT_TYPES.slideLayout}"/>`,
    ),
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="${DECK_CONTENT_TYPES.theme}"/>`,
    ...Array.from(
      { length: slideCount },
      (_, index) =>
        `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="${DECK_CONTENT_TYPES.slide}"/>`,
    ),
    ...Array.from(
      { length: chartCounter.value },
      (_, index) =>
        `<Override PartName="/ppt/charts/chart${index + 1}.xml" ContentType="${DECK_CONTENT_TYPES.chart}"/>`,
    ),
    ...Object.keys(parts)
      .filter((path) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path))
      .sort()
      .map(
        (path) =>
          `<Override PartName="/${path}" ContentType="${DECK_CONTENT_TYPES.notesSlide}"/>`,
      ),
    ...(notesSlideCount > 0
      ? [
          `<Override PartName="/ppt/notesMasters/notesMaster1.xml" ` +
            `ContentType="${DECK_CONTENT_TYPES.notesMaster}"/>`,
        ]
      : []),
    `<Override PartName="/docProps/core.xml" ContentType="${DECK_CONTENT_TYPES.coreProperties}"/>`,
    `<Override PartName="/docProps/custom.xml" ContentType="${DECK_CONTENT_TYPES.customProperties}"/>`,
  ].join("");
  parts["[Content_Types].xml"] =
    `${XML_DECLARATION}\n` +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    `${defaults}${overrides}</Types>`;

  return {
    parts,
    media,
    slideMasterCount: 1,
    slideLayoutCount: DECK_LAYOUT_DEFINITIONS.length,
    themeCount: 1,
    chartCount: chartCounter.value,
    pictureCount,
    notesSlideCount,
    shapeCounts,
    credits,
    license,
    missingAssetIds,
    notes,
  };
}

/** The zip epoch floor; fflate rejects anything outside 1980–2099. */
const DETERMINISTIC_MTIME = new Date(Date.UTC(1980, 0, 1, 0, 0, 0));

/** Zip the built parts. Deterministic: fixed mtime, fixed compression level. */
export function zipDeckOoxmlParts(build: DeckOoxmlBuild): Uint8Array {
  const archive: Record<string, Uint8Array> = {};
  for (const [path, xml] of Object.entries(build.parts)) {
    archive[path] = strToU8(xml);
  }
  for (const [path, bytes] of Object.entries(build.media)) {
    archive[path] = bytes;
  }
  return Uint8Array.from(
    zipSync(archive, { level: 6, mtime: DETERMINISTIC_MTIME }),
  );
}

export interface DeckPackageConformance {
  /** False only when the package would not open or would open wrong. */
  ok: boolean;
  /** Things that make the file broken. These still refuse. */
  failures: string[];
  /** Things that make the deck weaker. These are said, not enforced. */
  notes: string[];
  slideCount: number;
  notesSlideCount: number;
  slidesWithoutPictures: number;
  slideMasterCount: number;
  slideLayoutCount: number;
  themeCount: number;
  pictureCount: number;
  chartPartCount: number;
  graphicFrameCount: number;
  averageShapesPerSlide: number;
  maxShapesPerSlide: number;
  distinctLayouts: number;
  denseSlides: number;
  hasCorePropertiesOverride: boolean;
  hasCorePropertiesRelationship: boolean;
  hasCustomPropertiesOverride: boolean;
  hasCustomPropertiesRelationship: boolean;
  creditsLength: number;
  hasVisibleCreditsBar: boolean;
}

/**
 * §8.2 / §9 C-3 / C-6 — measure a built package.
 *
 * Two buckets, and the split is the whole point. `failures` is for a package a
 * consumer cannot read: a missing master, a chart whose cache never got
 * written, a picture reference with no namespace to resolve it. Those are not
 * matters of taste and they still refuse, by name, with the part path in the
 * message.
 *
 * `notes` is for everything else that used to sit in the same list — page
 * count, picture count, how many grammars were used, how busy the busiest page
 * is. Those describe a deck someone may not like. Handing them back as a
 * refusal told the caller only that something was wrong somewhere; handing them
 * back as numbers lets them decide whether it matters.
 */
export function assertDeckPackageConformance(
  project: DeckIrDocument,
  build: DeckOoxmlBuild,
): DeckPackageConformance {
  const failures: string[] = [];
  const notes: string[] = [...build.notes];
  const contentTypes = build.parts["[Content_Types].xml"] || "";
  const packageRels = build.parts["_rels/.rels"] || "";
  const slideCount = project.slides.length;
  const chartPartCount = Object.keys(build.parts).filter((path) =>
    /^ppt\/charts\/chart\d+\.xml$/.test(path),
  ).length;
  const graphicFrameCount = Object.entries(build.parts)
    .filter(([path]) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .reduce((total, [, xml]) => total + (xml.match(/<p:graphicFrame>/g) || []).length, 0);
  const pictureCount = Object.entries(build.parts)
    .filter(([path]) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .reduce((total, [, xml]) => total + (xml.match(/<p:pic>/g) || []).length, 0);
  const layouts = new Set(project.slides.map((slide) => slide.layout));
  const denseSlides = project.slides.filter(
    (slide) => slide.layout === "mixed-triptych" || slide.layout === "chart-with-notes",
  ).length;
  const totalShapes = build.shapeCounts.reduce((total, count) => total + count, 0);
  const averageShapesPerSlide = slideCount ? totalShapes / slideCount : 0;
  const maxShapesPerSlide = build.shapeCounts.reduce((max, count) => Math.max(max, count), 0);

  const hasCorePropertiesOverride = contentTypes.includes(
    `PartName="/docProps/core.xml" ContentType="${DECK_CONTENT_TYPES.coreProperties}"`,
  );
  const hasCorePropertiesRelationship = packageRels.includes(
    DECK_RELATIONSHIP_TYPES.coreProperties,
  );
  const hasCustomPropertiesOverride = contentTypes.includes(
    `PartName="/docProps/custom.xml" ContentType="${DECK_CONTENT_TYPES.customProperties}"`,
  );
  const hasCustomPropertiesRelationship = packageRels.includes(
    DECK_RELATIONSHIP_TYPES.customProperties,
  );
  const lastSlideXml = build.parts[`ppt/slides/slide${slideCount}.xml`] || "";
  const hasVisibleCreditsBar =
    lastSlideXml.includes('name="oceanleo-credits"') &&
    lastSlideXml.includes(`sz="${DECK_CONSTANTS.C51}"`);

  const slidesWithoutPictures = Object.entries(build.parts)
    .filter(([path]) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .filter(([, xml]) => !xml.includes("<p:pic>")).length;

  // ── broken: the package would not open, or would open missing something a
  //    consumer needs to render it. These refuse. ────────────────────────────
  if (build.slideMasterCount !== 1) {
    failures.push(
      "there is no slideMaster part; without it PowerPoint has nothing to inherit from and refuses the file",
    );
  }
  if (build.slideLayoutCount !== DECK_CONSTANTS.C33) {
    failures.push(
      `${build.slideLayoutCount} slideLayout parts were written instead of ${DECK_CONSTANTS.C33}; ` +
        "slides reference layouts by number, so a missing one is a dangling reference",
    );
  }
  if (build.themeCount !== 1) {
    failures.push("there is no theme part; the colour and font scheme every part refers to would be missing");
  }
  if (!hasCorePropertiesOverride) {
    failures.push(
      "[Content_Types].xml has no Override for docProps/core.xml, which makes the part invisible to a conforming reader",
    );
  }
  if (!hasCorePropertiesRelationship) {
    failures.push("_rels/.rels has no core-properties relationship, which orphans docProps/core.xml");
  }
  if (!hasCustomPropertiesOverride) {
    failures.push(
      "[Content_Types].xml has no Override for docProps/custom.xml — that part carries the credits, and without the Override it does not exist as far as a reader is concerned",
    );
  }
  if (!hasCustomPropertiesRelationship) {
    failures.push("_rels/.rels has no custom-properties relationship, which orphans the credits part");
  }
  if (build.credits.length > DECK_CONSTANTS.C48) {
    failures.push(
      `the credits string is ${build.credits.length} characters, past the ${DECK_CONSTANTS.C48} a vt:lpwstr holds; it would be truncated mid-entry, leaving a credit that points nowhere`,
    );
  }

  // ── opinions: the deck still opens and still reads. These are measured. ────
  if (slideCount < DECK_CONSTANTS.C17) {
    notes.push(`${slideCount} pages, which is short for a deck meant to stand on its own.`);
  }
  if (slideCount > DECK_CONSTANTS.C18) {
    notes.push(`${slideCount} pages, past the ${DECK_CONSTANTS.C18} the carrier was sized for.`);
  }
  if (pictureCount < 3) {
    notes.push(
      `${pictureCount} pictures in the whole deck. Pages carry better with something to look at, ` +
        "though data and agenda pages are fine without.",
    );
  }
  if (slidesWithoutPictures > 0) {
    const share = Math.round((slidesWithoutPictures / Math.max(1, slideCount)) * 100);
    notes.push(
      `${slidesWithoutPictures} of ${slideCount} pages have no picture (${share} %).` +
        (share >= 50 ? " Past half the deck starts reading as a document rather than a presentation." : ""),
    );
  }
  if (graphicFrameCount + chartPartCount < 1) {
    notes.push("No chart object. Figures shown as a chart stay readable and stay editable; figures typed into bullets do neither.");
  }
  if (layouts.size < 5) {
    notes.push(`${layouts.size} distinct grammars across ${slideCount} pages, so the pages will look alike.`);
  }
  if (denseSlides < 1) {
    notes.push("No mixed-triptych or chart-with-notes page, so nothing puts a picture, prose and numbers together.");
  }
  if (averageShapesPerSlide < 4) {
    notes.push(
      `${averageShapesPerSlide.toFixed(2)} shapes per page on average. Sparse pages are often unfinished pages.`,
    );
  }
  if (maxShapesPerSlide > 60) {
    notes.push(
      `The busiest page holds ${maxShapesPerSlide} shapes. Past about 60 the page gets slow to render and hard to read.`,
    );
  }
  if (build.credits.length < DECK_CONSTANTS.C49) {
    notes.push(
      `The credits string is ${build.credits.length} characters. If anything in this deck came from ` +
        "somewhere else, that is an attribution obligation which is currently unmet.",
    );
  }
  if (!hasVisibleCreditsBar) {
    notes.push(
      "The last page carries no visible credit line, so the attribution survives only as metadata — " +
        'which is lost the moment someone does "save as PDF".',
    );
  }
  if (build.missingAssetIds.length > 0) {
    notes.push(
      `No bytes were supplied for ${build.missingAssetIds.length} declared picture(s) ` +
        `(${build.missingAssetIds.join(", ")}), so those frames ship empty.`,
    );
  }
  for (const [path, xml] of Object.entries(build.parts)) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(path)) continue;
    if (xml.includes("r:embed") && !xml.includes(`xmlns:r="${NS.r}"`)) {
      failures.push(
        `${path} references a picture through r:embed but never declares the r namespace, so the reference cannot resolve`,
      );
    }
  }
  for (const [path, xml] of Object.entries(build.parts)) {
    if (!/^ppt\/charts\/chart\d+\.xml$/.test(path)) continue;
    // Without the caches LibreOffice paints an empty plot on first render —
    // the chart is there, the numbers are not. That is a broken artifact.
    if (!xml.includes("<c:numCache>")) {
      failures.push(`${path} carries no c:numCache, so the plot renders empty until someone opens the data source`);
    }
    if (!xml.includes("<c:strCache>")) {
      failures.push(`${path} carries no c:strCache, so the categories render blank`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    notes,
    slideCount,
    notesSlideCount: build.notesSlideCount,
    slidesWithoutPictures,
    slideMasterCount: build.slideMasterCount,
    slideLayoutCount: build.slideLayoutCount,
    themeCount: build.themeCount,
    pictureCount,
    chartPartCount,
    graphicFrameCount,
    averageShapesPerSlide,
    maxShapesPerSlide,
    distinctLayouts: layouts.size,
    denseSlides,
    hasCorePropertiesOverride,
    hasCorePropertiesRelationship,
    hasCustomPropertiesOverride,
    hasCustomPropertiesRelationship,
    creditsLength: build.credits.length,
    hasVisibleCreditsBar,
  };
}

export interface DeckPptxResult {
  bytes: Uint8Array;
  build: DeckOoxmlBuild;
  conformance: DeckPackageConformance;
}

export class DeckPackageError extends Error {
  readonly code: string;
  readonly failures: string[];

  constructor(code: string, message: string, failures: string[] = []) {
    super(message);
    this.name = "DeckPackageError";
    this.code = code;
    this.failures = failures;
  }
}

/**
 * §3.6 — the whole generation run.
 *
 * This throws when the package would be broken and returns when it would not.
 * A picture with no bytes, a five-page deck and a deck with no chart all used
 * to throw here; none of them produce a file that fails to open, so all three
 * now come back as readings on `conformance.notes` with the bytes attached.
 */
export function buildDeckPptx(
  project: DeckIrDocument,
  options: DeckOoxmlBuildOptions = {},
): DeckPptxResult {
  const build = buildDeckOoxmlParts(project, options);
  const conformance = assertDeckPackageConformance(project, build);
  if (!conformance.ok) {
    throw new DeckPackageError(
      "deck-package-broken",
      `the package would not open as written:\n${conformance.failures.map((f) => `  ${f}`).join("\n")}`,
      conformance.failures,
    );
  }
  const bytes = zipDeckOoxmlParts(build);
  if (bytes.length < DECK_PPTX_MIN_BYTES) {
    conformance.notes.push(
      `The package is ${bytes.length} bytes, under the ${DECK_PPTX_MIN_BYTES} floor. ` +
        "A deck this small has historically meant the content never made it in.",
    );
  }
  if (bytes.length > DECK_PPTX_MAX_BYTES) {
    conformance.notes.push(
      `The package is ${bytes.length} bytes, over the ${DECK_PPTX_MAX_BYTES} ceiling. ` +
        "It opens; it is awkward to mail.",
    );
  }
  return { bytes, build, conformance };
}
