import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

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

export async function injectDeckPptxOoxml(
  blob: Blob,
  slides: readonly DeckSlide[],
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
      injectDeckSlideOoxml(
        strFromU8(data),
        slides[index],
        options,
        index + 1,
      ),
    );
  }
  const bytes = Uint8Array.from(zipSync(archive, { level: 6 }));
  return new Blob([bytes], { type: PPTX_MIME });
}
