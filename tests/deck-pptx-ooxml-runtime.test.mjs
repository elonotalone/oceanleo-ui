import assert from "node:assert/strict";
import test from "node:test";

import { strFromU8, unzipSync } from "fflate";
import PptxGenJS from "pptxgenjs";

import {
  deckPptxObjectName,
  injectDeckPptxOoxml,
} from "../src/shell/doc-editors/deck-pptx-ooxml.ts";

const transitions = [
  ["fade", "<p:fade/>"],
  ["push-left", '<p:push dir="l"/>'],
  ["push-right", '<p:push dir="r"/>'],
  ["wipe", '<p:wipe dir="r"/>'],
  ["zoom", '<p:zoom dir="in"/>'],
];
const animations = ["fade", "fly-up", "wipe", "zoom", "fade"];

function slideDocument(index) {
  const id = `element-${index + 1}`;
  return {
    id: `slide-${index + 1}`,
    title: `Slide ${index + 1}`,
    body: "",
    bullets: [],
    notes: "",
    layout: "blank",
    background: "",
    transition: {
      type: transitions[index][0],
      durationMs: 400 + index * 400,
    },
    masterId: "master-default",
    elements: [
      {
        id,
        type: "text",
        x: 10,
        y: 10,
        width: 30,
        height: 15,
        rotation: 0,
        order: 0,
        text: `Animated ${index + 1}`,
        animation: {
          type: animations[index],
          durationMs: 500 + index * 100,
          delayMs: index * 125,
        },
      },
    ],
  };
}

test("exported PPTX XML carries every Deck transition and object animation", async () => {
  const slides = transitions.map((_, index) => slideDocument(index));
  const pptx = new PptxGenJS();
  for (const [index, source] of slides.entries()) {
    const slide = pptx.addSlide();
    slide.addText(source.elements[0].text, {
      x: 1,
      y: 1,
      w: 3,
      h: 1,
      objectName: deckPptxObjectName(source.elements[0].id),
    });
    slide.addNotes(`slide ${index + 1}`);
  }
  const raw = await pptx.write({ outputType: "blob" });
  const exported = await injectDeckPptxOoxml(raw, slides);
  const archive = unzipSync(new Uint8Array(await exported.arrayBuffer()));

  for (const [index, source] of slides.entries()) {
    const xml = strFromU8(archive[`ppt/slides/slide${index + 1}.xml`]);
    assert.ok(xml.includes("<mc:AlternateContent"));
    assert.ok(xml.includes(transitions[index][1]));
    assert.ok(
      xml.includes(`p14:dur="${source.transition.durationMs}"`),
      `slide ${index + 1} transition duration`,
    );
    assert.ok(xml.includes("<p:timing>"));
    assert.ok(
      xml.indexOf("<mc:AlternateContent") < xml.indexOf("<p:timing>"),
      "transition precedes timing in CT_Slide",
    );

    const name = deckPptxObjectName(source.elements[0].id);
    const shapeTag = [...xml.matchAll(/<p:cNvPr\b[^>]*>/g)].find((match) =>
      match[0].includes(`name="${name}"`),
    )?.[0];
    assert.ok(shapeTag, `slide ${index + 1} has a named animation target`);
    const shapeId = /\bid="(\d+)"/.exec(shapeTag)?.[1];
    assert.ok(shapeId);
    assert.ok(xml.includes(`<p:spTgt spid="${shapeId}"/>`));
    assert.ok(
      xml.includes(`dur="${source.elements[0].animation.durationMs}"`),
    );
    assert.ok(
      xml.includes(`delay="${source.elements[0].animation.delayMs}"`),
    );
  }

  const allXml = transitions
    .map((_, index) =>
      strFromU8(archive[`ppt/slides/slide${index + 1}.xml`]),
    )
    .join("\n");
  assert.ok(allXml.includes('filter="fade"'));
  assert.ok(allXml.includes('filter="slide(fromBottom)"'));
  assert.ok(allXml.includes('filter="wipe(right)"'));
  assert.ok(allXml.includes("<p:animScale>"));
  assert.ok(allXml.includes('<p:from x="0" y="0"/>'));
  assert.ok(allXml.includes('<p:to x="100000" y="100000"/>'));
});

test("PPTX postprocessing leaves slides without motion metadata untouched", async () => {
  const slide = {
    ...slideDocument(0),
    transition: undefined,
    elements: [{ ...slideDocument(0).elements[0], animation: undefined }],
  };
  const pptx = new PptxGenJS();
  pptx.addSlide().addText("static", {
    x: 1,
    y: 1,
    w: 3,
    h: 1,
    objectName: deckPptxObjectName(slide.elements[0].id),
  });
  const raw = await pptx.write({ outputType: "blob" });
  const exported = await injectDeckPptxOoxml(raw, [slide]);
  const archive = unzipSync(new Uint8Array(await exported.arrayBuffer()));
  const xml = strFromU8(archive["ppt/slides/slide1.xml"]);
  assert.doesNotMatch(xml, /<p:transition\b/);
  assert.doesNotMatch(xml, /<p:timing\b/);
});

test("real PPTX export uniquely targets an animated table beside other shapes", async () => {
  const textId = "same-slide-text";
  const tableId = "animated-table";
  const shapeId = "other-shape";
  const source = {
    ...slideDocument(0),
    transition: { type: "fade", durationMs: 700 },
    elements: [
      {
        ...slideDocument(0).elements[0],
        id: textId,
        animation: undefined,
      },
      {
        id: tableId,
        type: "table",
        x: 10,
        y: 30,
        width: 50,
        height: 30,
        rotation: 0,
        order: 1,
        rows: [
          ["Metric", "Value"],
          ["Users", "42"],
        ],
        animation: {
          type: "wipe",
          durationMs: 900,
          delayMs: 150,
        },
      },
      {
        id: shapeId,
        type: "shape",
        x: 70,
        y: 20,
        width: 20,
        height: 20,
        rotation: 0,
        order: 2,
        shape: "rectangle",
      },
    ],
  };
  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();
  slide.addText("same page", {
    x: 1,
    y: 0.5,
    w: 3,
    h: 0.6,
    objectName: deckPptxObjectName(textId),
  });
  slide.addTable(
    [
      ["Metric", "Value"],
      ["Users", "42"],
    ],
    {
      x: 1,
      y: 1.5,
      w: 5,
      h: 2,
      objectName: deckPptxObjectName(tableId),
    },
  );
  slide.addShape(pptx.ShapeType.rect, {
    x: 7,
    y: 1,
    w: 2,
    h: 2,
    objectName: deckPptxObjectName(shapeId),
  });

  const raw = await pptx.write({ outputType: "blob" });
  const exported = await injectDeckPptxOoxml(raw, [source]);
  const archive = unzipSync(new Uint8Array(await exported.arrayBuffer()));
  const xml = strFromU8(archive["ppt/slides/slide1.xml"]);
  const objects = [...xml.matchAll(/<p:cNvPr\b[^>]*>/g)].map((match) => ({
    id: Number(/\bid="(\d+)"/.exec(match[0])?.[1]),
    name: /\bname="([^"]*)"/.exec(match[0])?.[1] || "",
  }));
  const objectIds = objects.map((object) => object.id);
  assert.equal(
    new Set(objectIds).size,
    objectIds.length,
    "every slide cNvPr id is unique",
  );

  const byName = (name) => objects.find((object) => object.name === name);
  const textObject = byName(deckPptxObjectName(textId));
  const tableObject = byName(deckPptxObjectName(tableId));
  const shapeObject = byName(deckPptxObjectName(shapeId));
  assert.ok(textObject);
  assert.ok(tableObject);
  assert.ok(shapeObject);
  const timingTargets = [...xml.matchAll(/<p:spTgt spid="(\d+)"\/>/g)].map(
    (match) => Number(match[1]),
  );
  assert.deepEqual(timingTargets, [tableObject.id]);
  assert.notEqual(tableObject.id, textObject.id);
  assert.notEqual(tableObject.id, shapeObject.id);
  assert.ok(
    xml.indexOf("</p:clrMapOvr>") < xml.indexOf("<mc:AlternateContent"),
    "transition and timing are direct CT_Slide children, not table children",
  );
});
