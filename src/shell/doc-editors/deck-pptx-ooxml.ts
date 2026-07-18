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

export function deckPptxObjectName(
  elementId: string,
  part = "main",
): string {
  return `${OBJECT_PREFIX}${encodeURIComponent(elementId)}-${part}`;
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

interface SlideObjectIndex {
  xml: string;
  idsByObjectName: Map<string, number[]>;
}

function indexSlideObjects(xml: string): SlideObjectIndex {
  const objectTag = /<p:cNvPr\b[^>]*>/g;
  const tags = [...xml.matchAll(objectTag)].map((match) => match[0]);
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
  const normalizedXml = xml.replace(objectTag, (tag) => {
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
  return { xml: normalizedXml, idsByObjectName };
}

function objectNamesForElement(element: DeckElement): string[] {
  const names = [deckPptxObjectName(element.id)];
  if (element.type === "shape" && element.text) {
    names.push(deckPptxObjectName(element.id, "label"));
  }
  return names;
}

function shapeIdsForElement(
  index: SlideObjectIndex,
  element: DeckElement,
): number[] {
  return objectNamesForElement(element).map((objectName) => {
    const ids = index.idsByObjectName.get(objectName) || [];
    if (ids.length === 0) {
      throw new Error(`PPTX animation target is missing: ${element.id}`);
    }
    if (ids.length > 1) {
      throw new Error(`PPTX animation target is ambiguous: ${element.id}`);
    }
    return ids[0];
  });
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
): string {
  const objectIndex = indexSlideObjects(xml);
  const targets: AnimationTarget[] = [];
  for (const element of slide.elements) {
    if (!element.animation) continue;
    const shapeIds = shapeIdsForElement(objectIndex, element);
    for (const shapeId of shapeIds) {
      targets.push({ animation: element.animation, shapeId });
    }
  }
  const children = [
    slide.transition ? transitionXml(slide.transition) : "",
    targets.length ? timingXml(targets) : "",
  ].join("");
  return children
    ? insertSlideChildren(objectIndex.xml, children)
    : objectIndex.xml;
}

export async function injectDeckPptxOoxml(
  blob: Blob,
  slides: readonly DeckSlide[],
): Promise<Blob> {
  const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  for (let index = 0; index < slides.length; index += 1) {
    const path = `ppt/slides/slide${index + 1}.xml`;
    const data = archive[path];
    if (!data) throw new Error(`PPTX package is missing ${path}`);
    archive[path] = strToU8(
      injectDeckSlideOoxml(strFromU8(data), slides[index]),
    );
  }
  const bytes = Uint8Array.from(zipSync(archive, { level: 6 }));
  return new Blob([bytes], { type: PPTX_MIME });
}
