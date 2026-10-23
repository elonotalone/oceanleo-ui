// 10-23 R3：「加文字」里的中日韩文字必须存得下、重开看得见。
// PDFium 给 FreeText 生成的外观流在内容含汉字时是空的（浏览器实测：/Contents 有「Zhang San 张三」，
// /AP 只有 `/GS gs `，重开后整条文字不见）。导出时补标准外观流：预定义 CJK 字体（不嵌入）+ UCS-2。
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import zlib from "node:zlib";

import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream } from "pdf-lib";

import {
  cjkAppearanceContent,
  fixPdfCjkFreeTextAppearances,
  layoutCjkLines,
  needsCjkAppearance,
  pdfCjkScript,
  ucs2Hex,
} from "../src/shell/media-editors/pdf-cjk-appearance.ts";
import { servePdfiumWasm } from "./helpers/pdfium-wasm.mjs";

async function pdfWithFreeTexts(texts) {
  const document = await PDFDocument.create();
  const page = document.addPage([595.28, 841.89]);
  const font = document.context.register(
    document.context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica" }),
  );
  texts.forEach((text, index) => {
    const y = 700 - index * 60;
    // 和 PDFium 生成的一样：外观流只有 `/GS gs `（汉字画不出）
    const empty = document.context.register(
      document.context.stream("/GS gs ", {
        Type: "XObject",
        Subtype: "Form",
        BBox: [40, y, 200, y + 20],
        Resources: { Font: { Helv: font } },
      }),
    );
    const annot = document.context.register(
      document.context.obj({
        Type: "Annot",
        Subtype: "FreeText",
        Rect: [40, y, 200, y + 20],
        Contents: PDFHexString.fromText(text),
        DA: PDFHexString.fromText("0 0 0 rg /Helv 12 Tf"),
        Q: 0,
        F: 4,
        AP: { N: empty },
      }),
    );
    page.node.addAnnot(annot);
  });
  return document.save();
}

function apText(document, annot) {
  const stream = annot.lookup(PDFName.of("AP"), PDFDict).lookup(PDFName.of("N"));
  assert.ok(stream instanceof PDFRawStream);
  return { stream, content: zlib.inflateSync(Buffer.from(stream.getContents())).toString("latin1") };
}

test("which text needs a CJK appearance, and which script font it gets", () => {
  assert.equal(needsCjkAppearance("Zhang San"), false);
  assert.equal(needsCjkAppearance("café"), false, "Latin-1 is still encodable by the standard font");
  assert.equal(needsCjkAppearance("Zhang San 张三"), true);
  assert.equal(pdfCjkScript("张三"), "gb");
  assert.equal(pdfCjkScript("やまだ 太郎"), "jp");
  assert.equal(pdfCjkScript("김철수"), "kr");
  assert.equal(ucs2Hex("A张"), "00415F20");
  assert.equal(ucs2Hex("😀"), "003F", "beyond UCS-2 becomes ?");
  assert.deepEqual(layoutCjkLines("张三李四", 10, 25), ["张三", "李四"]);
  assert.deepEqual(layoutCjkLines("a\nb", 10, 100), ["a", "b"]);
});

test("the appearance draws every line with the CJK font at the DA size and colour", () => {
  const content = cjkAppearanceContent({
    text: "Zhang San 张三",
    rect: [40, 700, 200, 720],
    da: "1 0 0 rg /Helv 14 Tf",
    align: 0,
  });
  assert.match(content, /^\/Tx BMC\nq\nBT\n1 0 0 rg\n\/FCJK 14 Tf/);
  assert.match(content, new RegExp(`<${ucs2Hex("Zhang San 张三")}> Tj`));
  assert.match(content, /ET\nQ\nEMC$/);
});

test("only FreeTexts with CJK get a new appearance; the contents and DA stay as they were", async () => {
  const bytes = await pdfWithFreeTexts(["Zhang San 张三", "Latin only"]);
  const result = await fixPdfCjkFreeTextAppearances(bytes);
  assert.equal(result.fixed, 1);
  const document = await PDFDocument.load(result.bytes);
  const [cjk, latin] = document.getPage(0).node.Annots().asArray().map((ref) => document.context.lookup(ref, PDFDict));
  assert.equal(cjk.lookup(PDFName.of("Contents")).decodeText(), "Zhang San 张三");
  assert.equal(cjk.lookup(PDFName.of("DA")).decodeText(), "0 0 0 rg /Helv 12 Tf");
  const { stream, content } = apText(document, cjk);
  assert.match(content, new RegExp(ucs2Hex("Zhang San 张三")));
  const font = stream.dict.lookup(PDFName.of("Resources"), PDFDict).lookup(PDFName.of("Font"), PDFDict).lookup(PDFName.of("FCJK"), PDFDict);
  assert.equal(font.lookup(PDFName.of("Subtype")).toString(), "/Type0");
  assert.equal(font.lookup(PDFName.of("Encoding")).toString(), "/UniGB-UCS2-H");
  assert.equal(font.lookup(PDFName.of("BaseFont")).toString(), "/STSong-Light-UniGB-UCS2-H");
  // 拉丁那条原样（PDFium 自己生成的外观流画得出来）
  const latinStream = latin.lookup(PDFName.of("AP"), PDFDict).lookup(PDFName.of("N"));
  assert.equal(Buffer.from(latinStream.getContents()).toString("latin1"), "/GS gs ");
});

test("nothing to fix → the same bytes back (no pdf-lib rewrite)", async () => {
  const bytes = await pdfWithFreeTexts(["Latin only"]);
  const result = await fixPdfCjkFreeTextAppearances(bytes);
  assert.equal(result.fixed, 0);
  assert.equal(result.bytes, bytes);
});

test("PDFium draws the new appearance through the charset fallback (sc.ttf), not an empty box", async () => {
  const require = createRequire(import.meta.url);
  const { createPdfiumEngine } = await import(require.resolve("@embedpdf/engines/pdfium-direct-engine"));
  const fontsDir = "/root/projects/oceanleo/public/pdfium-fonts";
  const requested = [];
  const wasm = await servePdfiumWasm();
  try {
    const engine = await createPdfiumEngine(wasm.url, {
      fontFallback: {
        fonts: { 134: "sc.ttf", 136: "tc.ttf", 128: "jp.ttf", 129: "kr.ttf" },
        fontLoader: (path) => {
          requested.push(path);
          const file = join(fontsDir, path);
          return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
        },
      },
    });
    const dark = async (bytes, id) => {
      const doc = await engine.openDocumentBuffer({ id, content: Uint8Array.from(bytes).buffer }).toPromise();
      const image = await engine.renderPageRaw(doc, doc.pages[0], { scaleFactor: 2, dpr: 1, withAnnotations: true }).toPromise();
      let count = 0;
      // the FreeText rect: x 40..200, y 700..720 (PDF space) → top-down 121.89..141.89 pt
      for (let y = 122 * 2; y < 142 * 2; y += 1) {
        for (let x = 40 * 2; x < 200 * 2; x += 1) {
          const i = (y * image.width + x) * 4;
          if (image.data[i] < 128 && image.data[i + 1] < 128 && image.data[i + 2] < 128) count += 1;
        }
      }
      await engine.closeDocument(doc).toPromise();
      return count;
    };
    const original = await pdfWithFreeTexts(["张三李四王五"]);
    assert.equal(await dark(original, "before"), 0, "PDFium's own appearance draws nothing");
    const fixed = await fixPdfCjkFreeTextAppearances(original);
    const after = await dark(fixed.bytes, "after");
    assert.ok(requested.includes("sc.ttf"), `PDFium never asked for the GB fallback font: ${JSON.stringify(requested)}`);
    if (existsSync(join(fontsDir, "sc.ttf"))) assert.ok(after > 50, `CJK glyphs not drawn (${after} dark px)`);
  } finally {
    await wasm.close();
  }
});
