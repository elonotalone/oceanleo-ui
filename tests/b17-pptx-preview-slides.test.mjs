import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import PptxGenJS from "pptxgenjs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { importPptxDeck } from "../src/shell/doc-editors/pptx-deck-import.ts";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/b17-pptx-preview-zero-slides.json", import.meta.url), "utf8"),
);

test("B17 fixture has the same multi-slide OOXML shape and editor parser sees every page", async () => {
  const pptx = new PptxGenJS();
  for (const slideSpec of fixture.slides) {
    const slide = pptx.addSlide();
    slide.addText(slideSpec.title, { x: 1, y: 1, w: 8, h: 0.5 });
    slide.addText(slideSpec.body, { x: 1, y: 2, w: 8, h: 0.5 });
  }
  const blob = await pptx.write({ outputType: "blob" });
  const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const contentTypes = strFromU8(archive["[Content_Types].xml"]);
  archive["[Content_Types].xml"] = strToU8(
    contentTypes.replace(
      "</Types>",
      Array.from({ length: 7 }, (_, index) =>
        `<Override PartName="/ppt/slideMasters/slideMaster${index + 2}.xml" ContentType="application/vnd.openxmlformats-officedocument.slideMaster+xml"/>`,
      ).join("") + "</Types>",
    ),
  );
  const malformedButValid = zipSync(archive);
  const parsed = await importPptxDeck(malformedButValid.buffer, fixture.title);
  assert.equal(parsed.slides.length, fixture.slides.length);
  assert.deepEqual(parsed.slides.map((slide) => slide.title), ["第一张", "第二张"]);
});

test("PPT viewer routes a zero-page preview result through the editor parser", async () => {
  const source = await readFile(new URL("../src/shell/library-viewers.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!model\.slides\.length\)/);
  assert.match(source, /importPptxDeck\(arrayBuffer/);
  assert.match(source, /nativeSlide/);
});
