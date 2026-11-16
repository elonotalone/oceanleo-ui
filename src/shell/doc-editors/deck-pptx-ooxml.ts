import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  DECK_CONTENT_TYPES,
  DECK_CREDITS_PROPERTY,
  DECK_CUSTOM_PROPERTY_FIRST_PID,
  DECK_CUSTOM_PROPERTY_FMTID,
  DECK_RELATIONSHIP_TYPES,
  deckCustomPropertiesXml,
  escapeXml,
} from "./pptx-properties";
import type {
  DeckElement,
  DeckElementAnimation,
  DeckSlide,
  DeckTransition,
} from "./deck-schema";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const OBJECT_PREFIX = "OceanLeoElement-";

export type DeckPptxEnhancementWarningCode =
  | "target-name-ambiguous"
  | "animation-target-missing"
  | "animation-target-ambiguous"
  | "animation-enhancement-invalid"
  | "visual-target-missing"
  | "visual-target-ambiguous"
  | "visual-enhancement-invalid";

export interface DeckPptxEnhancementWarning {
  code: DeckPptxEnhancementWarningCode;
  phase: "identity" | "animation" | "visual";
  slideNumber: number;
  target: string;
  elementId?: string;
}

export interface DeckPptxEnhancementOptions {
  onWarning?: (warning: DeckPptxEnhancementWarning) => void;
}

export function reportDeckPptxEnhancementWarning(
  options: DeckPptxEnhancementOptions,
  warning: DeckPptxEnhancementWarning,
): void {
  if (options.onWarning) {
    options.onWarning(warning);
    return;
  }
  console.warn(
    `OceanLeo PPTX optional enhancement skipped: ${JSON.stringify(warning)}`,
  );
}

export function deckPptxObjectName(
  elementId: string,
  part = "main",
  occurrence = 1,
): string {
  const base = `${OBJECT_PREFIX}${encodeURIComponent(elementId)}-${part}`;
  return occurrence > 1 ? `${base}-duplicate-${occurrence}` : base;
}

function xmlAttribute(tag: string, name: string): string {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] || "";
}

function replaceXmlAttribute(
  tag: string,
  name: string,
  value: string,
): string {
  const expression = new RegExp(`(\\s${name}=")[^"]*(")`);
  if (expression.test(tag)) {
    return tag.replace(expression, `$1${value}$2`);
  }
  return tag.replace(/\/?>$/, (closing) => ` ${name}="${value}"${closing}`);
}

export function assertDeckPptxSlideXml(
  xml: string,
  label = "PPTX slide XML",
): void {
  if (
    !/<p:sld(?:\s|>)/.test(xml) ||
    !/<p:cSld(?:\s|>)/.test(xml) ||
    !/<p:spTree(?:\s|>)/.test(xml)
  ) {
    throw new Error(`${label} is missing its required slide structure`);
  }
  const stack: string[] = [];
  const tags =
    /<\s*(\/?)\s*([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?\s*(\/?)>/g;
  for (const match of xml.matchAll(tags)) {
    const closing = match[1] === "/";
    const name = match[2];
    const selfClosing = match[3] === "/";
    if (closing) {
      if (stack.pop() !== name) {
        throw new Error(`${label} has unbalanced XML near ${name}`);
      }
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  if (stack.length > 0) {
    throw new Error(`${label} has unclosed XML element ${stack.at(-1)}`);
  }
}

interface SlideObjectIndex {
  xml: string;
  idsByObjectName: Map<string, number[]>;
}

function objectNameBasesForElement(element: DeckElement): string[] {
  const names = [deckPptxObjectName(element.id)];
  if (element.type === "shape" && element.text) {
    names.push(deckPptxObjectName(element.id, "label"));
  }
  return names;
}

export function deckPptxElementObjectNames(
  element: DeckElement,
  occurrences: Map<string, number>,
): string[] {
  return objectNameBasesForElement(element).map((base) => {
    const occurrence = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, occurrence);
    return occurrence > 1 ? `${base}-duplicate-${occurrence}` : base;
  });
}

function expectedObjectNameCounts(slide: DeckSlide): Map<string, number> {
  const counts = new Map<string, number>();
  for (const element of slide.elements) {
    for (const name of objectNameBasesForElement(element)) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return counts;
}

function indexSlideObjects(
  xml: string,
  slide: DeckSlide,
  options: DeckPptxEnhancementOptions,
  slideNumber: number,
): SlideObjectIndex {
  assertDeckPptxSlideXml(xml, `PPTX slide ${slideNumber}`);
  const objectTag = /<p:cNvPr\b[^>]*>/g;
  const inputTags = [...xml.matchAll(objectTag)].map((match) => match[0]);
  const rawNameCounts = new Map<string, number>();
  const rawNames = new Set<string>();
  for (const tag of inputTags) {
    const name = xmlAttribute(tag, "name");
    if (!name) continue;
    rawNameCounts.set(name, (rawNameCounts.get(name) || 0) + 1);
    rawNames.add(name);
  }
  const expectedCounts = expectedObjectNameCounts(slide);
  const ambiguousNames = new Set<string>();
  for (const [name, count] of rawNameCounts) {
    if (!name.startsWith(OBJECT_PREFIX) || count < 2) continue;
    const generatedNamesCollide = Array.from(
      { length: count - 1 },
      (_, index) => `${name}-duplicate-${index + 2}`,
    ).some((candidate) => rawNames.has(candidate));
    if (expectedCounts.get(name) !== count || generatedNamesCollide) {
      ambiguousNames.add(name);
      reportDeckPptxEnhancementWarning(options, {
        code: "target-name-ambiguous",
        phase: "identity",
        slideNumber,
        target: name,
      });
    }
  }
  const nameOccurrences = new Map<string, number>();
  const usedNames = new Set<string>();
  const renamedXml = xml.replace(objectTag, (tag) => {
    const name = xmlAttribute(tag, "name");
    if (!name || !name.startsWith(OBJECT_PREFIX)) return tag;
    const occurrence = (nameOccurrences.get(name) || 0) + 1;
    nameOccurrences.set(name, occurrence);
    const count = rawNameCounts.get(name) || 1;
    let nextName = name;
    if (count > 1) {
      nextName = ambiguousNames.has(name)
        ? `${name}-ambiguous-${occurrence}`
        : occurrence > 1
          ? `${name}-duplicate-${occurrence}`
          : name;
    }
    let collision = 2;
    const baseName = nextName;
    while (usedNames.has(nextName)) {
      nextName = `${baseName}-renamed-${collision}`;
      collision += 1;
    }
    usedNames.add(nextName);
    return nextName === name
      ? tag
      : replaceXmlAttribute(tag, "name", nextName);
  });
  const tags = [...renamedXml.matchAll(objectTag)].map((match) => match[0]);
  const reservedIds = new Set(
    tags
      .map((tag) => Number(xmlAttribute(tag, "id")))
      .filter(
        (id) =>
          Number.isInteger(id) &&
          id > 0 &&
          id <= 0xffff_ffff,
      ),
  );
  const usedIds = new Set<number>();
  const idsByObjectName = new Map<string, number[]>();
  let nextAvailableId = 1;
  const allocateId = () => {
    while (
      reservedIds.has(nextAvailableId) ||
      usedIds.has(nextAvailableId)
    ) {
      nextAvailableId += 1;
    }
    if (nextAvailableId > 0xffff_ffff) {
      throw new Error("PPTX slide has no available object IDs");
    }
    const allocated = nextAvailableId;
    nextAvailableId += 1;
    return allocated;
  };
  const normalizedXml = renamedXml.replace(objectTag, (tag) => {
    const parsedId = Number(xmlAttribute(tag, "id"));
    const id =
      Number.isInteger(parsedId) &&
      parsedId > 0 &&
      parsedId <= 0xffff_ffff &&
      !usedIds.has(parsedId)
        ? parsedId
        : allocateId();
    usedIds.add(id);
    const objectName = xmlAttribute(tag, "name");
    if (objectName) {
      const ids = idsByObjectName.get(objectName) || [];
      ids.push(id);
      idsByObjectName.set(objectName, ids);
    }
    return replaceXmlAttribute(tag, "id", String(id));
  });
  assertDeckPptxSlideXml(normalizedXml, `PPTX slide ${slideNumber}`);
  return { xml: normalizedXml, idsByObjectName };
}

export function normalizeDeckPptxSlideObjectIdentity(
  xml: string,
  slide: DeckSlide,
  options: DeckPptxEnhancementOptions = {},
  slideNumber = 1,
): string {
  return indexSlideObjects(xml, slide, options, slideNumber).xml;
}

function shapeIdsForElement(
  index: SlideObjectIndex,
  element: DeckElement,
  objectNames: string[],
  options: DeckPptxEnhancementOptions,
  slideNumber: number,
): number[] {
  const shapeIds: number[] = [];
  for (const objectName of objectNames) {
    const ids = index.idsByObjectName.get(objectName) || [];
    if (ids.length === 0) {
      reportDeckPptxEnhancementWarning(options, {
        code: "animation-target-missing",
        phase: "animation",
        slideNumber,
        target: objectName,
        elementId: element.id,
      });
      continue;
    }
    if (ids.length > 1) {
      reportDeckPptxEnhancementWarning(options, {
        code: "animation-target-ambiguous",
        phase: "animation",
        slideNumber,
        target: objectName,
        elementId: element.id,
      });
      continue;
    }
    shapeIds.push(ids[0]);
  }
  return shapeIds;
}

function transitionSpeed(durationMs: number): "fast" | "med" | "slow" {
  if (durationMs <= 500) return "fast";
  return durationMs <= 1_500 ? "med" : "slow";
}

function transitionEffect(transition: DeckTransition): string {
  switch (transition.type) {
    case "fade":
      return "<p:fade/>";
    case "push-left":
      return '<p:push dir="l"/>';
    case "push-right":
      return '<p:push dir="r"/>';
    case "wipe":
      return '<p:wipe dir="r"/>';
    case "zoom":
      return '<p:zoom dir="in"/>';
  }
}

function transitionXml(transition: DeckTransition): string {
  const duration = Math.max(100, Math.min(3_000, transition.durationMs));
  const speed = transitionSpeed(duration);
  const effect = transitionEffect(transition);
  return (
    '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/' +
    'markup-compatibility/2006" xmlns:p14="http://schemas.microsoft.com/' +
    'office/powerpoint/2010/main">' +
    '<mc:Choice Requires="p14">' +
    `<p:transition spd="${speed}" p14:dur="${duration}" advClick="1">` +
    `${effect}</p:transition></mc:Choice>` +
    "<mc:Fallback>" +
    `<p:transition spd="${speed}" advClick="1">${effect}</p:transition>` +
    "</mc:Fallback></mc:AlternateContent>"
  );
}

interface AnimationTarget {
  animation: DeckElementAnimation;
  shapeId: number;
}

function commonBehavior(
  timingId: number,
  durationMs: number,
  shapeId: number,
  attributes = "",
): string {
  return (
    "<p:cBhvr>" +
    `<p:cTn id="${timingId}" dur="${durationMs}" fill="hold">` +
    '<p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>' +
    `<p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl>` +
    attributes +
    "</p:cBhvr>"
  );
}

function animationBehavior(
  target: AnimationTarget,
  timingId: number,
): { xml: string; presetId: number } {
  const duration = Math.max(
    100,
    Math.min(3_000, target.animation.durationMs),
  );
  if (target.animation.type === "zoom") {
    const attributes =
      "<p:attrNameLst><p:attrName>ScaleX</p:attrName>" +
      "<p:attrName>ScaleY</p:attrName></p:attrNameLst>";
    return {
      presetId: 23,
      xml:
        "<p:animScale>" +
        commonBehavior(timingId, duration, target.shapeId, attributes) +
        '<p:from x="0" y="0"/><p:to x="100000" y="100000"/>' +
        "</p:animScale>",
    };
  }
  const effect =
    target.animation.type === "fade"
      ? { presetId: 10, filter: "fade" }
      : target.animation.type === "fly-up"
        ? { presetId: 2, filter: "slide(fromBottom)" }
        : { presetId: 22, filter: "wipe(right)" };
  return {
    presetId: effect.presetId,
    xml:
      `<p:animEffect transition="in" filter="${effect.filter}">` +
      commonBehavior(timingId, duration, target.shapeId) +
      "</p:animEffect>",
  };
}

function timingXml(targets: AnimationTarget[]): string {
  let timingId = 2;
  const nodes = targets
    .map((target) => {
      const behavior = animationBehavior(target, timingId + 1);
      const nodeId = timingId;
      timingId += 2;
      const delay = Math.max(
        0,
        Math.min(10_000, target.animation.delayMs),
      );
      return (
        "<p:par>" +
        `<p:cTn id="${nodeId}" presetID="${behavior.presetId}" ` +
        'presetClass="entr" presetSubtype="0" fill="hold" ' +
        'nodeType="withEffect">' +
        `<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>` +
        `<p:childTnLst>${behavior.xml}</p:childTnLst>` +
        "</p:cTn></p:par>"
      );
    })
    .join("");
  return (
    "<p:timing><p:tnLst><p:par>" +
    '<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">' +
    `<p:childTnLst>${nodes}</p:childTnLst>` +
    "</p:cTn></p:par></p:tnLst></p:timing>"
  );
}

function insertSlideChildren(xml: string, children: string): string {
  const commonSlideEnd = xml.lastIndexOf("</p:cSld>");
  const closingIndex = xml.lastIndexOf("</p:sld>");
  if (commonSlideEnd < 0 || closingIndex < 0) {
    throw new Error("PPTX slide XML is missing p:sld");
  }
  const extIndex = xml.indexOf(
    "<p:extLst",
    commonSlideEnd + "</p:cSld>".length,
  );
  const index =
    extIndex >= 0 && extIndex < closingIndex ? extIndex : closingIndex;
  return `${xml.slice(0, index)}${children}${xml.slice(index)}`;
}

export function injectDeckSlideOoxml(
  xml: string,
  slide: DeckSlide,
  options: DeckPptxEnhancementOptions = {},
  slideNumber = 1,
): string {
  const objectIndex = indexSlideObjects(xml, slide, options, slideNumber);
  const targets: AnimationTarget[] = [];
  const occurrences = new Map<string, number>();
  for (const element of slide.elements) {
    const objectNames = deckPptxElementObjectNames(element, occurrences);
    if (!element.animation) continue;
    const shapeIds = shapeIdsForElement(
      objectIndex,
      element,
      objectNames,
      options,
      slideNumber,
    );
    for (const shapeId of shapeIds) {
      targets.push({ animation: element.animation, shapeId });
    }
  }
  const children = [
    slide.transition ? transitionXml(slide.transition) : "",
    targets.length ? timingXml(targets) : "",
  ].join("");
  if (!children) return objectIndex.xml;
  try {
    const enhanced = insertSlideChildren(objectIndex.xml, children);
    assertDeckPptxSlideXml(enhanced, `PPTX slide ${slideNumber}`);
    return enhanced;
  } catch {
    reportDeckPptxEnhancementWarning(options, {
      code: "animation-enhancement-invalid",
      phase: "animation",
      slideNumber,
      target: slide.id,
    });
    return objectIndex.xml;
  }
}

function nextRelationshipId(rels: string): string {
  const used = new Set(
    [...rels.matchAll(/\sId="rId(\d+)"/g)].map((match) => Number(match[1])),
  );
  let candidate = 1;
  while (used.has(candidate)) candidate += 1;
  return `rId${candidate}`;
}

function appendRelationship(rels: string, type: string, target: string): string {
  if (rels.includes(`Type="${type}"`)) return rels;
  const id = nextRelationshipId(rels);
  const entry = `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`;
  return rels.includes("</Relationships>")
    ? rels.replace("</Relationships>", `${entry}</Relationships>`)
    : rels;
}

function appendOverride(
  contentTypes: string,
  partName: string,
  contentType: string,
): string {
  if (contentTypes.includes(`PartName="${partName}"`)) return contentTypes;
  const entry = `<Override PartName="${partName}" ContentType="${contentType}"/>`;
  return contentTypes.includes("</Types>")
    ? contentTypes.replace("</Types>", `${entry}</Types>`)
    : contentTypes;
}

export interface DeckPptxAttributionEntry {
  text: string;
  licenseCode: string;
}

export interface DeckPptxPackageRepair {
  /** §3.2a.2 — credits written to `docProps/custom.xml` as `OceanLeoCredits`. */
  attribution?: readonly DeckPptxAttributionEntry[];
}

export interface DeckPptxPackageRepairReport {
  coreOverrideAdded: boolean;
  coreRelationshipAdded: boolean;
  customPartAdded: boolean;
  customOverrideAdded: boolean;
  customRelationshipAdded: boolean;
  phantomMasterOverridesRemoved: number;
  credits: string;
}

/** §3.2a.2 / §5 C48 — join credits and cut at the last complete entry. */
export function deckPptxCreditsText(
  entries: readonly DeckPptxAttributionEntry[],
): string {
  const parts = entries
    .filter((entry) => entry.text && entry.licenseCode)
    .map((entry) => `${entry.text} (${entry.licenseCode})`);
  const joined = parts.join("; ");
  if (joined.length <= 4_000) return joined;
  let text = "";
  for (const part of parts) {
    const candidate = text ? `${text}; ${part}` : part;
    if (candidate.length > 4_000) break;
    text = candidate;
  }
  return text;
}

/**
 * Repairs the two OPC gaps recorded in spec §3.2a.3 on whatever PresentationML
 * package the editor hands us:
 *
 *   1. `docProps/core.xml` is written but has neither an `[Content_Types].xml`
 *      Override nor an `_rels/.rels` relationship, so its `dc:title` is
 *      invisible to a conforming consumer.
 *   2. attribution has nowhere to go — `dc:rights` does not exist in the closed
 *      15-element OPC core property set — so it goes to `docProps/custom.xml`,
 *      and all three of part + Override + relationship must land together.
 *   3. pptxgenjs declares one `slideMasterN.xml` Override per slide but only
 *      writes `slideMaster1.xml`; a viewer that follows the declaration stops at
 *      the first missing master and shows zero pages. Only master Overrides with
 *      no part behind them are dropped.
 *
 * The function is idempotent: anything already present is left alone.
 */
export function repairDeckPptxPackageParts(
  archive: Record<string, Uint8Array>,
  repair: DeckPptxPackageRepair = {},
): DeckPptxPackageRepairReport {
  const report: DeckPptxPackageRepairReport = {
    coreOverrideAdded: false,
    coreRelationshipAdded: false,
    customPartAdded: false,
    customOverrideAdded: false,
    customRelationshipAdded: false,
    phantomMasterOverridesRemoved: 0,
    credits: "",
  };
  const contentTypesRaw = archive["[Content_Types].xml"];
  const packageRelsRaw = archive["_rels/.rels"];
  if (!contentTypesRaw || !packageRelsRaw) return report;

  let contentTypes = strFromU8(contentTypesRaw).replace(
    /<Override\b[^>]*\bPartName="\/ppt\/slideMasters\/(slideMaster\d+\.xml)"[^>]*\/>/g,
    (override, part: string) => {
      if (archive[`ppt/slideMasters/${part}`]) return override;
      report.phantomMasterOverridesRemoved += 1;
      return "";
    },
  );
  let packageRels = strFromU8(packageRelsRaw);

  if (archive["docProps/core.xml"]) {
    const withOverride = appendOverride(
      contentTypes,
      "/docProps/core.xml",
      DECK_CONTENT_TYPES.coreProperties,
    );
    report.coreOverrideAdded = withOverride !== contentTypes;
    contentTypes = withOverride;
    const withRelationship = appendRelationship(
      packageRels,
      DECK_RELATIONSHIP_TYPES.coreProperties,
      "docProps/core.xml",
    );
    report.coreRelationshipAdded = withRelationship !== packageRels;
    packageRels = withRelationship;
  }

  const credits = deckPptxCreditsText(repair.attribution || []);
  report.credits = credits;
  if (credits.length >= 8) {
    if (!archive["docProps/custom.xml"]) {
      archive["docProps/custom.xml"] = strToU8(deckCustomPropertiesXml(credits));
      report.customPartAdded = true;
    } else {
      const existing = strFromU8(archive["docProps/custom.xml"]);
      if (!existing.includes(`name="${DECK_CREDITS_PROPERTY}"`)) {
        const property =
          `<property fmtid="${DECK_CUSTOM_PROPERTY_FMTID}" ` +
          `pid="${DECK_CUSTOM_PROPERTY_FIRST_PID + countCustomProperties(existing)}" ` +
          `name="${DECK_CREDITS_PROPERTY}"><vt:lpwstr>${escapeXml(credits)}</vt:lpwstr></property>`;
        archive["docProps/custom.xml"] = strToU8(
          existing.replace("</Properties>", `${property}</Properties>`),
        );
        report.customPartAdded = true;
      }
    }
    const withOverride = appendOverride(
      contentTypes,
      "/docProps/custom.xml",
      DECK_CONTENT_TYPES.customProperties,
    );
    report.customOverrideAdded = withOverride !== contentTypes;
    contentTypes = withOverride;
    const withRelationship = appendRelationship(
      packageRels,
      DECK_RELATIONSHIP_TYPES.customProperties,
      "docProps/custom.xml",
    );
    report.customRelationshipAdded = withRelationship !== packageRels;
    packageRels = withRelationship;
  }

  archive["[Content_Types].xml"] = strToU8(contentTypes);
  archive["_rels/.rels"] = strToU8(packageRels);
  return report;
}

function countCustomProperties(xml: string): number {
  return (xml.match(/<property\b/g) || []).length;
}

export async function injectDeckPptxOoxml(
  blob: Blob,
  slides: readonly DeckSlide[],
  options: DeckPptxEnhancementOptions & DeckPptxPackageRepair = {},
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
      injectDeckSlideOoxml(
        strFromU8(data),
        slides[index],
        options,
        index + 1,
      ),
    );
  }
  repairDeckPptxPackageParts(archive, { attribution: options.attribution });
  const bytes = Uint8Array.from(zipSync(archive, { level: 6 }));
  return new Blob([bytes], { type: PPTX_MIME });
}

// Read character defaults directly from the package. Keep this independent of
// both preview vendors: they do not implement the same DrawingML cascade.
interface DeckXmlNode {
  name: string;
  attrs: Record<string, string>;
  children: DeckXmlNode[];
  text: string;
}

function deckXmlText(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[entity] || "";
  });
}

/** Small non-DOM XML reader; no DTD, external entities, HTML or executable data. */
function deckReadXml(xml: string): DeckXmlNode {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new SyntaxError();
  const root: DeckXmlNode = { name: "", attrs: {}, children: [], text: "" };
  const stack = [root];
  const tokens = xml.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g) || [];
  for (const token of tokens) {
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;
    if (token.startsWith("<![CDATA[")) { stack[stack.length - 1].text += token.slice(9, -3); continue; }
    if (token.startsWith("</")) {
      if (stack.length === 1 || stack.pop()!.name !== token.slice(2, -1).trim().split(":").pop()) throw new SyntaxError();
    } else if (token.startsWith("<")) {
      const name = /^<([^\s/>]+)/.exec(token)?.[1];
      if (!name) throw new SyntaxError();
      const node: DeckXmlNode = { name: name.split(":").pop()!, attrs: {}, children: [], text: "" };
      for (const match of token.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) node.attrs[match[1]] = deckXmlText(match[2] ?? match[3]);
      stack[stack.length - 1].children.push(node);
      if (!token.endsWith("/>")) stack.push(node);
    } else stack[stack.length - 1].text += deckXmlText(token);
  }
  if (stack.length !== 1) throw new SyntaxError();
  return root.children[0] || root;
}

function deckChild(node: DeckXmlNode | undefined, name: string): DeckXmlNode | undefined {
  return node?.children.find((child) => child.name === name);
}
function deckPath(node: DeckXmlNode | undefined, ...names: string[]): DeckXmlNode | undefined {
  return names.reduce<DeckXmlNode | undefined>((value, name) => deckChild(value, name), node);
}
function deckDescendants(node: DeckXmlNode | undefined, name: string): DeckXmlNode[] {
  return node ? node.children.flatMap((child) => [...(child.name === name ? [child] : []), ...deckDescendants(child, name)]) : [];
}
function deckPartPath(base: string, target: string): string {
  const parts = target.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

type DeckInheritedStyle = Partial<Pick<DeckElement,
  "fontSize" | "fontFamily" | "color" | "bold" | "italic" | "underline" | "strike" | "align" | "lineHeight" | "letterSpacing"
>>;
export interface DeckPptxInheritedRun {
  text: string;
  style: DeckInheritedStyle;
}
export interface DeckPptxInheritedShape {
  name: string;
  type: "text" | "image";
  geometry?: { left: number; top: number; width: number; height: number };
  paragraphs: DeckPptxInheritedRun[][];
}

/** Resolve run → paragraph → list → layout/master placeholder → txStyles/default. */
export function readDeckPptxTextInheritance(bytes: ArrayBuffer): DeckPptxInheritedShape[][] {
  const archive = unzipSync(new Uint8Array(bytes));
  const cache = new Map<string, DeckXmlNode>();
  const read = (path: string): DeckXmlNode | undefined => {
    if (!archive[path]) return undefined;
    if (!cache.has(path)) cache.set(path, deckReadXml(strFromU8(archive[path])));
    return cache.get(path);
  };
  const rels = (path: string) => read(path.replace(/([^/]+)$/, "_rels/$1.rels"))?.children || [];
  const related = (path: string, kind: string): string => {
    const rel = rels(path).find((node) => node.attrs.Type?.endsWith(`/${kind}`) && node.attrs.TargetMode !== "External");
    return rel ? deckPartPath(path, rel.attrs.Target) : "";
  };
  const presentation = read("ppt/presentation.xml");
  const presentationRels = rels("ppt/presentation.xml");
  const slides = deckPath(presentation, "sldIdLst")?.children.map((id) => {
    const rel = presentationRels.find((entry) => entry.attrs.Id === id.attrs["r:id"] && entry.attrs.TargetMode !== "External");
    return rel ? deckPartPath("ppt/presentation.xml", rel.attrs.Target) : "";
  }) || [];
  const shapeNodes = (root: DeckXmlNode | undefined) => deckDescendants(root, "sp");
  const placeholder = (shape: DeckXmlNode | undefined) => deckPath(shape, "nvSpPr", "nvPr", "ph");
  const phType = (shape: DeckXmlNode | undefined) => placeholder(shape)?.attrs.type || "obj";
  const matchPlaceholder = (root: DeckXmlNode | undefined, shape: DeckXmlNode | undefined, master = false): DeckXmlNode | undefined => {
    const ph = placeholder(shape);
    if (!ph) return undefined;
    const nodes = shapeNodes(root).filter((node) => placeholder(node));
    return (master ? undefined : nodes.find((node) => (placeholder(node)!.attrs.idx || "0") === (ph.attrs.idx || "0"))) ||
      nodes.find((node) => phType(node) === phType(shape)) ||
      nodes.find((node) => /^(?:title|ctrTitle)$/.test(phType(node)) && /^(?:title|ctrTitle)$/.test(phType(shape)));
  };
  return slides.map((slidePath) => {
    const slide = read(slidePath);
    const layoutPath = related(slidePath, "slideLayout");
    const layout = read(layoutPath);
    const masterPath = related(layoutPath, "slideMaster");
    const master = read(masterPath);
    const theme = read(related(masterPath, "theme") || related("ppt/presentation.xml", "theme"));
    const scheme = deckPath(theme, "themeElements", "clrScheme");
    const colorMap = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2", ...deckChild(master, "clrMap")?.attrs,
      ...deckPath(layout, "clrMapOvr", "overrideClrMapping")?.attrs, ...deckPath(slide, "clrMapOvr", "overrideClrMapping")?.attrs } as Record<string, string>;
    const readColor = (fill: DeckXmlNode | undefined): string | undefined => {
      const color = fill?.children[0];
      if (!color) return undefined;
      // Retain the parser's colour engine for transformed/alpha fills rather
      // than approximate DrawingML luminance operations in RGB space.
      if (color.children.length) return undefined;
      let value = color.name === "srgbClr" ? color.attrs.val : color.name === "sysClr" ? color.attrs.lastClr : "";
      if (color.name === "schemeClr") {
        const key = colorMap[color.attrs.val] || color.attrs.val;
        const themeColor = deckChild(scheme, key)?.children[0];
        value = (themeColor?.name === "sysClr" ? themeColor.attrs.lastClr : themeColor?.attrs.val) || "";
      }
      if (!/^[\da-f]{6}$/i.test(value)) return undefined;
      return `#${value.toUpperCase()}`;
    };
    const resolveFont = (value: string, cjk: boolean, language: string): string => {
      const themeFont = /^\+(mj|mn)-(lt|ea|cs)$/.exec(value);
      if (!themeFont) return value;
      const family = deckPath(theme, "themeElements", "fontScheme", themeFont[1] === "mj" ? "majorFont" : "minorFont");
      const script = /^ja/.test(language) ? "Jpan" : /^ko/.test(language) ? "Hang" : /TW|HK|Hant/i.test(language) ? "Hant" : "Hans";
      return (cjk ? family?.children.find((n) => n.name === "font" && n.attrs.script === script)?.attrs.typeface : "") ||
        deckChild(family, themeFont[2] === "ea" ? "ea" : themeFont[2] === "cs" ? "cs" : "latin")?.attrs.typeface ||
        deckChild(family, "latin")?.attrs.typeface || value;
    };
    const levelProps = (style: DeckXmlNode | undefined, level: number) => [deckChild(style, "defPPr"), deckChild(style, `lvl${level + 1}pPr`)];
    const shapeList = (shape: DeckXmlNode | undefined) => deckPath(shape, "txBody", "lstStyle");
    const inheritedParagraph = (shape: DeckXmlNode | undefined, index: number) => {
      const paras = deckChild(shape, "txBody")?.children.filter((node) => node.name === "p") || [];
      return deckChild(paras[index] || paras[0], "pPr");
    };
    const shapes = [...deckDescendants(slide, "sp"), ...deckDescendants(slide, "pic")];
    return shapes.map((shape): DeckPptxInheritedShape => {
      const layoutShape = matchPlaceholder(layout, shape);
      const masterShape = matchPlaceholder(master, layoutShape || shape, true);
      const inherited = [masterShape, layoutShape, shape];
      const type = shape.name === "pic" ? "image" : "text";
      const name = deckDescendants(shape, "cNvPr")[0]?.attrs.name || "";
      const xfrm = inherited.map((node) => deckPath(node, "spPr", "xfrm")).reverse().find(Boolean);
      const off = deckChild(xfrm, "off"), ext = deckChild(xfrm, "ext");
      const geometry = off && ext ? { left: Number(off.attrs.x) / 12700, top: Number(off.attrs.y) / 12700, width: Number(ext.attrs.cx) / 12700, height: Number(ext.attrs.cy) / 12700 } : undefined;
      const paragraphs = (deckChild(shape, "txBody")?.children || []).filter((node) => node.name === "p").map((paragraph, index) => {
        const own = deckChild(paragraph, "pPr");
        const level = Math.max(0, Math.min(8, Number(own?.attrs.lvl || 0)));
        const ph = phType(layoutShape || shape);
        const textStyle = /^(?:title|ctrTitle)$/.test(ph) ? "titleStyle" : ph === "body" || ph === "subTitle" ? "bodyStyle" : "otherStyle";
        const props = [
          ...levelProps(deckChild(presentation, "defaultTextStyle"), level),
          ...levelProps(deckPath(master, "txStyles", textStyle), level),
          ...levelProps(shapeList(masterShape), level), inheritedParagraph(masterShape, index),
          ...levelProps(shapeList(layoutShape), level), inheritedParagraph(layoutShape, index),
          ...levelProps(shapeList(shape), level), own,
        ].filter((node): node is DeckXmlNode => Boolean(node));
        return paragraph.children.filter((node) => node.name === "r" || node.name === "fld" || node.name === "br").map((run): DeckPptxInheritedRun => {
          const text = run.name === "br" ? "\n" : deckChild(run, "t")?.text || "";
          const cjk = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]/.test(text);
          const style: DeckInheritedStyle = {};
          let latin = "", eastAsian = "", language = "zh-CN";
          const rProps = [...props.map((node) => deckChild(node, "defRPr")), deckChild(run, "rPr")].filter((node): node is DeckXmlNode => Boolean(node));
          for (const rPr of rProps) {
            const a = rPr.attrs;
            if (a.sz !== undefined) style.fontSize = Number(a.sz) / 100;
            if (a.b !== undefined) style.bold = a.b === "1" || a.b === "true";
            if (a.i !== undefined) style.italic = a.i === "1" || a.i === "true";
            if (a.u !== undefined) style.underline = a.u !== "none";
            if (a.strike !== undefined) style.strike = a.strike !== "noStrike";
            if (a.spc !== undefined) style.letterSpacing = Number(a.spc) / 100 / 0.75;
            const color = readColor(deckChild(rPr, "solidFill"));
            if (color) style.color = color;
            latin = deckChild(rPr, "latin")?.attrs.typeface || latin;
            eastAsian = deckChild(rPr, "ea")?.attrs.typeface || eastAsian;
            language = a.lang || language;
          }
          const font = cjk ? eastAsian || latin : latin || eastAsian;
          if (font) style.fontFamily = resolveFont(font, cjk, language);
          for (const pPr of props) {
            if (pPr.attrs.algn) style.align = ({ ctr: "center", r: "right", just: "justify", dist: "justify" } as const)[pPr.attrs.algn as "ctr"] || "left";
            const spacing = deckPath(pPr, "lnSpc", "spcPct");
            if (spacing) style.lineHeight = Number(spacing.attrs.val) / 100000;
          }
          return { text, style };
        });
      });
      return { name, type, geometry, paragraphs };
    });
  });
}
