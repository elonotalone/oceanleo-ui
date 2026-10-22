// native-editors W06 regression gates.
//
// 1. PDF = EmbedPDF (PDFium) only: nothing in src may load pdf.js.
// 2. Library PDF preview renders our own reader, never a browser-viewer frame.
// 3. Library video/audio preview uses OceanLeo's player, never native `controls`.
// 4. A design canvas previews like an image and never enters SandboxedWebViewer.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PDFDocument, StandardFonts } from "pdf-lib";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { servePdfiumWasm } from "./helpers/pdfium-wasm.mjs";
import {
  openPdfEngineDocument,
  overridePdfiumWasmUrlForTests,
  readPdfPageText,
} from "../src/shell/media-editors/pdf-engine-host.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(join(root, relative), "utf8");

function walk(directory, out = []) {
  for (const name of readdirSync(directory)) {
    const full = join(directory, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("no source file loads pdf.js (EmbedPDF/PDFium is the only PDF engine)", () => {
  const offenders = walk(join(root, "src"))
    .filter((file) =>
      /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']pdfjs-dist/.test(
        stripComments(readFileSync(file, "utf8")),
      ),
    )
    .map((file) => file.slice(root.length));
  assert.deepEqual(offenders, [], "pdf.js is back in the bundle");
});

const viewerStubs = {
  "../i18n/ui/useUI": dataModule("export function useUI(){ return value => value; }"),
  "./Markdown": dataModule("export function Markdown(){ return null; }"),
  "./WebsiteArtifactViewer": dataModule("export function WebsiteArtifactViewer(){ return null; }"),
  "./artifact-client": dataModule(
    "export async function prepareArtifactForAction(){ return {ok:true,data:null}; } export async function refreshArtifactRendition(){ return {ok:true,data:null}; }",
  ),
  "./material-detail-slot": dataModule(
    'export function useMaterialDetailTarget(item){ return {status:"passthrough",item}; } export function MaterialDetailUnavailable(){return null;} export function GamePlayDetail(){return null;} export function gamePlayEmbedHref(){return "";}',
  ),
  "./ArtifactRendition": dataModule(`
    export function useArtifactRendition(item){ return {url:item.url,rendition:{mediaType:item.__mediaType||""},loading:false,error:"",resourceFailed(){}}; }
    export function withResolvedRendition(item){return item;}
    export function ArtifactRenditionFailure(){return null;}
  `),
};

let viewerModule;
async function loadViewer() {
  if (!viewerModule) {
    viewerModule = await import(
      await compileModule("src/shell/library-viewers.tsx", viewerStubs)
    );
  }
  return viewerModule;
}

function item(patch) {
  return {
    key: "k1",
    id: "k1",
    source: "artifact",
    title: "Sample",
    url: "",
    meta: {},
    favorite: false,
    ...patch,
  };
}

test("Library PDF preview renders no iframe (no browser built-in PDF viewer)", async () => {
  const { LibraryItemViewer } = await loadViewer();
  const html = renderToStaticMarkup(
    React.createElement(LibraryItemViewer, {
      item: item({
        kind: "document",
        artifactType: "pdf",
        url: "https://api.oceanleo.com/v1/artifact-renditions/access/abc.pdf",
      }),
    }),
  );
  assert.equal(/<iframe/i.test(html), false, html);
  assert.equal(/<embed|<object/i.test(html), false, html);
  // The source guard: the reader is wired and the frame is gone.
  const source = read("src/shell/library-viewers.tsx");
  assert.match(source, /<LibraryPdfReader/);
  assert.equal(/<iframe[^>]*src=\{sourceUrl\}/.test(source), false);
});

test("Library video/audio preview has no native controls, PiP or download menu", async () => {
  const { LibraryMediaPreview } = await compileModule(
    "src/shell/LibraryMediaPreview.tsx",
    { "../i18n/ui/useUI": viewerStubs["../i18n/ui/useUI"] },
  ).then((url) => import(url));
  for (const kind of ["video", "audio"]) {
    const html = renderToStaticMarkup(
      React.createElement(LibraryMediaPreview, {
        kind,
        src: "https://asset.oceanleo.com/a",
        className: "x",
        onError() {},
      }),
    );
    assert.equal(/\scontrols(?:=|\s|>)/.test(html), false, `${kind} still has native controls: ${html}`);
    assert.match(html, /data-library-player-bar/);
    assert.match(html, /type="range"/, "seek bar missing");
    assert.match(html, /controlslist="[^"]*nodownload/i);
    if (kind === "video") {
      assert.match(html, /disablepictureinpicture/i);
      assert.match(html, /aria-label="全屏"/);
    }
  }
  const source = stripComments(read("src/shell/LibraryMediaPreview.tsx"));
  assert.equal(/controls:\s*true|\bcontrols\b\s*(?=[\s>/])/.test(source.replace(/controlsList/g, "")), false);
});

test("canvas items preview as an image and never enter SandboxedWebViewer", async () => {
  const { LibraryItemViewer, libraryKindLabel } = await loadViewer();
  assert.equal(libraryKindLabel("canvas"), "图片");
  const html = renderToStaticMarkup(
    React.createElement(LibraryItemViewer, {
      item: item({
        kind: "canvas",
        url: "https://p1.website.oceanleo.app/design.html",
        previewUrl: "https://asset.oceanleo.com/design-preview.png",
        thumbUrl: "https://asset.oceanleo.com/design-thumb.png",
      }),
    }),
  );
  assert.equal(/<iframe/i.test(html), false, "canvas preview must not frame the design HTML");
  assert.match(html, /<img/);
  const source = read("src/shell/library-viewers.tsx");
  const start = source.indexOf('resolvedItem.kind === "canvas"');
  const end = source.indexOf('resolvedItem.kind === "ppt"');
  assert.ok(start > 0 && end > start);
  assert.equal(stripComments(source.slice(start, end)).includes("SandboxedWebViewer"), false);
  // Real UGC frames keep their sandboxed viewer.
  assert.match(source, /<SandboxedWebViewer/);
});

test("the PDFium engine opens, renders and reads text; a blank page reads as empty (not garbage)", async () => {
  const wasm = await servePdfiumWasm();
  overridePdfiumWasmUrlForTests(wasm.url);
  try {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    document.addPage([300, 200]).drawText("Hello EmbedPDF", { x: 20, y: 100, size: 14, font });
    document.addPage([300, 200]);
    const opened = await openPdfEngineDocument(await document.save(), { mode: "direct" });
    try {
      assert.equal(opened.numPages, 2);
      assert.match(await readPdfPageText(opened, 0), /Hello EmbedPDF/);
      // PDFium's own extractText returns uninitialised junk for a zero-character
      // page; an image-only page must read as "" so it is not mistaken for text.
      assert.equal(await readPdfPageText(opened, 1), "");
      const image = await opened.engine
        .renderPageRaw(opened.doc, opened.doc.pages[0], { scaleFactor: 1 })
        .toPromise();
      assert.equal(image.width, 300);
      assert.equal(image.height, 200);
    } finally {
      await opened.close();
    }
  } finally {
    overridePdfiumWasmUrlForTests(null);
    await wasm.close();
  }
});

test("PDF cover is a PDFium first-page raster: lazy, cached per resource key, no frame", async () => {
  const wasm = await servePdfiumWasm();
  overridePdfiumWasmUrlForTests(wasm.url);
  const document = await PDFDocument.create();
  document.addPage([300, 200]).drawText("cover", { x: 20, y: 100, size: 20 });
  const pdfBytes = await document.save();
  try {
    const source = read("src/shell/workspace-library-cover.tsx");
    assert.match(source, /lazy\(\(\) => import\("\.\/WorkspacePdfCover"\)\)/);
    const cover = stripComments(read("src/shell/WorkspacePdfCover.tsx"));
    assert.match(cover, /renderPageRaw/);
    assert.match(cover, /coverCache/);
    assert.match(cover, /onError\("load"\)/, "failure must reach the caller's poster fallback");
    assert.equal(/<iframe|<embed|<object/.test(cover), false);
    // Real render path: bytes -> engine -> first page raster.
    const opened = await openPdfEngineDocument(pdfBytes, { mode: "direct" });
    try {
      const image = await opened.engine
        .renderPageRaw(opened.doc, opened.doc.pages[0], { scaleFactor: 480 / 300 })
        .toPromise();
      assert.equal(image.width, 480);
    } finally {
      await opened.close();
    }
  } finally {
    overridePdfiumWasmUrlForTests(null);
    await wasm.close();
  }
});
