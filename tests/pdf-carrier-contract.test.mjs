// L1 carrier conformance for `pdf` / `pdf-binary@1`.
// Spec: docs/specs/oceanleo-material-and-game-v1/L1-carriers/pdf-reader.md

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

import {
  createBlankPdf,
  deletePdfPage,
  inspectPdf,
  movePdfPage,
  rotatePdfPage,
} from "../src/shell/media-editors/pdf-operations.ts";
import {
  PDF_ANNOTATION_KINDS,
  PDF_BINARY_MANIFEST_JSON_SCHEMA,
  PDF_BINARY_MANIFEST_SCHEMA_ID,
  PDF_CARRIER_CONSTANTS,
  PDF_EXPECTED_DERIVATION,
  PDF_FAILURE_CODES,
  PDF_MANIFEST_MINIMUM_BYTES,
  PDF_SOURCE_MINIMUM_BYTES,
  buildPdfBinaryManifest,
  judgePdfCarrier,
  pdfLicenseDisposition,
  serializePdfBinaryManifest,
  validatePdfBinaryManifest,
} from "../src/shell/media-editors/pdf-manifest.ts";
import {
  PDF_MAX_ZOOM,
  PDF_MIN_ZOOM,
  PDF_READER_LAYOUT,
  PDF_READER_PALETTE,
  PDF_ZOOM_STOPS,
  clampPdfZoom,
  downloadPdfBytes,
  fitPdfZoom,
  nextPdfZoomStop,
  viewportPointToVisual,
} from "../src/shell/media-editors/pdf-workbench-utils.ts";

const source = (relative) => readFile(resolve(relative), "utf8");

// ---------------------------------------------------------------------------
// fixtures

/** A document that satisfies §8.2: enough pages, real glyphs on every page. */
async function fullTextPdf({ pages = 6, rotation = 0 } = {}) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages; index += 1) {
    const page = document.addPage([595.28, 841.89]);
    page.setRotation(degrees(rotation));
    for (let line = 0; line < 24; line += 1) {
      page.drawText(
        `page ${index + 1} line ${line} of the carrier conformance corpus`,
        { x: 56, y: 780 - line * 28, size: 11, font, color: rgb(0.1, 0.1, 0.1) },
      );
    }
  }
  document.setTitle("pdf-reader carrier fixture");
  return document.save();
}

/** F1 / F8: the husk this contract exists to reject. */
function husk() {
  return {
    manifest: {
      schema: PDF_BINARY_MANIFEST_SCHEMA_ID,
      version: 1,
      pageCount: 1,
      pages: [{ index: 0, widthPt: 595.28, heightPt: 841.89, rotation: 0 }],
      textLayer: { present: false, totalCharacters: 0, coveragePageRatio: 0 },
      permissions: { downloadable: true, annotatable: true, encrypted: false },
      provenance: {
        channel: "owned",
        licenseCode: "CC0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      },
    },
    sourceByteLength: 233,
  };
}

function conformingEvidence(overrides = {}) {
  const manifest = buildPdfBinaryManifest({
    pages: Array.from({ length: 6 }, (_, index) => ({
      index,
      widthPt: 595.28,
      heightPt: 841.89,
      rotation: 0,
      textCharacters: 1800,
    })),
    textLayer: {
      present: true,
      totalCharacters: 10800,
      coveragePageRatio: 1,
    },
    permissions: { annotatable: true, printable: true },
    provenance: {
      channel: "arxiv-api",
      licenseCode: "CC-BY",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      sourceUrl: "https://arxiv.org/abs/2401.00001",
      attribution: "OceanLeo carrier fixture",
    },
  });
  return {
    manifest,
    sourceByteLength: 240_000,
    frameColorCounts: { first: 48, last: 44 },
    derivations: {
      preview: PDF_EXPECTED_DERIVATION,
      thumbnail: PDF_EXPECTED_DERIVATION,
    },
    thumbnailMinimumEdgePx: 256,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// C-4 · §0.3 the API surface this contract is allowed to name

test("C-4 §0.3: the page operation module exports exactly the surveyed API", async () => {
  // 10-23 D4：批注由 EmbedPDF 写成标准 PDF 批注；字节级只剩页面整理（缩略图栏的
  // 旋转、排序、删页）与空白新建。提取页、插空白页、合并 PDF 按裁定删除。
  const operations = await source("src/shell/media-editors/pdf-operations.ts");
  const exported = (text) =>
    [
      ...text.matchAll(
        /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g,
      ),
    ].map((match) => match[1]);
  assert.deepEqual(exported(operations).sort(), [
    "applyPdfPageOperations",
    "createBlankPdf",
    "deletePdfPage",
    "inspectPdf",
    "movePdfPage",
    "rotatePdfPage",
  ]);
  for (const file of [
    "src/shell/media-editors/pdf-operations.ts",
    "src/shell/media-editors/PdfControls.tsx",
    "src/shell/media-editors/use-pdf-workbench.ts",
    "src/shell/advanced-routes/PdfRoute.tsx",
  ]) {
    assert.doesNotMatch(
      await source(file),
      /extractPdfPages|mergePdfBytes|addBlankPdfPage/,
      `${file} still names a removed page operation`,
    );
  }
});

// ---------------------------------------------------------------------------
// C-2 · §3.1 the sidecar manifest schema

test("C-2 §3.1: the manifest schema is the one the spec publishes", () => {
  assert.equal(
    PDF_BINARY_MANIFEST_JSON_SCHEMA.$schema,
    "https://json-schema.org/draft/2020-12/schema",
  );
  assert.equal(
    PDF_BINARY_MANIFEST_JSON_SCHEMA.$id,
    "https://oceanleo.com/schemas/pdf-binary@1.manifest.json",
  );
  assert.equal(PDF_BINARY_MANIFEST_JSON_SCHEMA.additionalProperties, false);
  assert.deepEqual(
    [...PDF_BINARY_MANIFEST_JSON_SCHEMA.required],
    [
      "schema",
      "version",
      "pageCount",
      "pages",
      "textLayer",
      "permissions",
      "provenance",
    ],
  );
  assert.deepEqual(Object.keys(PDF_BINARY_MANIFEST_JSON_SCHEMA.properties), [
    "schema",
    "version",
    "pageCount",
    "pages",
    "textLayer",
    "outline",
    "annotations",
    "permissions",
    "provenance",
  ]);
  const properties = PDF_BINARY_MANIFEST_JSON_SCHEMA.properties;
  assert.equal(properties.pageCount.minimum, 4);
  assert.equal(properties.pageCount.maximum, 2000);
  assert.equal(properties.pages.items.properties.widthPt.minimum, 72);
  assert.equal(properties.pages.items.properties.heightPt.maximum, 5184);
  assert.deepEqual([...properties.pages.items.properties.rotation.enum], [
    0, 90, 180, 270,
  ]);
  assert.deepEqual(
    [...properties.textLayer.properties.extractor.enum],
    ["pdfium@embedpdf-2.15.0", "pdfjs-dist@4.10.38"],
  );
  assert.equal(properties.outline.maxItems, 500);
  assert.equal(properties.annotations.maxItems, 5000);
  assert.deepEqual([...properties.annotations.items.properties.kind.enum], [
    "text",
    "highlight",
  ]);
  // These two are definitional for the carrier, hence `const`, not `boolean`.
  assert.equal(properties.permissions.properties.downloadable.const, true);
  assert.equal(properties.permissions.properties.encrypted.const, false);
  assert.deepEqual([...properties.provenance.properties.channel.enum], [
    "arxiv-api",
    "arxiv-oai-pmh",
    "arxiv-s3-bulk",
    "owned",
    "user-upload",
    "approved-provider",
  ]);
  assert.equal(properties.provenance.properties.licenseUrl.pattern, "^https://");
});

test("C-2 §3.1: the validator enforces the schema, not just its shape", () => {
  const evidence = conformingEvidence();
  assert.equal(validatePdfBinaryManifest(evidence.manifest).ok, true);

  const cases = [
    ["additionalProperties", { extra: 1 }, "additionalProperties"],
    ["schema const", { schema: "pdf-binary@2" }, "const"],
    ["version const", { version: 2 }, "const"],
    ["pageCount floor", { pageCount: 3 }, "minimum"],
    ["pageCount ceiling", { pageCount: 2001 }, "maximum"],
  ];
  for (const [label, patch, keyword] of cases) {
    const result = validatePdfBinaryManifest({ ...evidence.manifest, ...patch });
    assert.equal(result.ok, false, label);
    assert.ok(
      result.errors.some((issue) => issue.keyword === keyword),
      `${label} should report ${keyword}, got ${JSON.stringify(result.errors)}`,
    );
  }

  // Required keys.
  for (const key of ["schema", "pageCount", "pages", "textLayer", "permissions", "provenance"]) {
    const copy = { ...evidence.manifest };
    delete copy[key];
    const result = validatePdfBinaryManifest(copy);
    assert.equal(result.ok, false, `missing ${key}`);
    assert.ok(result.errors.some((issue) => issue.keyword === "required"));
  }

  // An encrypted or non-downloadable document cannot be described at all.
  assert.equal(
    validatePdfBinaryManifest({
      ...evidence.manifest,
      permissions: { ...evidence.manifest.permissions, encrypted: true },
    }).ok,
    false,
  );
  assert.equal(
    validatePdfBinaryManifest({
      ...evidence.manifest,
      permissions: { ...evidence.manifest.permissions, downloadable: false },
    }).ok,
    false,
  );

  // §8.2: pages[] length must equal pageCount, which JSON Schema cannot say.
  const mismatched = {
    ...evidence.manifest,
    pageCount: 5,
    pages: evidence.manifest.pages,
  };
  const mismatch = validatePdfBinaryManifest(mismatched);
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.errors.some((issue) => issue.keyword === "pageCount"));

  // licenseUrl must be https, and createdAt must be RFC 3339.
  assert.equal(
    validatePdfBinaryManifest({
      ...evidence.manifest,
      provenance: {
        ...evidence.manifest.provenance,
        licenseUrl: "http://creativecommons.org/licenses/by/4.0/",
      },
    }).ok,
    false,
  );
  assert.equal(
    validatePdfBinaryManifest({
      ...evidence.manifest,
      annotations: [
        {
          id: "a",
          kind: "text",
          pageIndex: 0,
          rect: [0, 0, 24, 24],
          createdAt: "yesterday",
        },
      ],
    }).ok,
    false,
  );
  assert.equal(
    validatePdfBinaryManifest({
      ...evidence.manifest,
      annotations: [
        {
          id: "a",
          kind: "ink",
          pageIndex: 0,
          rect: [0, 0, 24, 24],
        },
      ],
    }).ok,
    false,
    "C19: only text and highlight exist",
  );
});

test("C-2 §3.1: serialization is deterministic and ordered", () => {
  const manifest = conformingEvidence().manifest;
  assert.equal(
    serializePdfBinaryManifest(manifest),
    serializePdfBinaryManifest(structuredClone(manifest)),
  );
  const keys = Object.keys(JSON.parse(serializePdfBinaryManifest(manifest)));
  assert.deepEqual(keys, [
    "schema",
    "version",
    "pageCount",
    "pages",
    "textLayer",
    "permissions",
    "provenance",
  ]);
});

test("C-3 §6: a failed load is surfaced, never left as a blank stage", async () => {
  const stage = await source("src/shell/media-editors/PdfStage.tsx");
  assert.match(stage, /role="alert"/);
  // 内核太慢：说原因并给「重新载入」，但不卸掉查看器（就绪后提示自动收起）。
  assert.match(stage, /data-pdf-init-slow=""/);
  assert.match(stage, /onClick=\{reload\}/);
  const workbench = await source("src/shell/media-editors/use-pdf-workbench.ts");
  // 源坏了：报出原因，不许拿空白页顶替。
  assert.match(workbench, /setError\(pdfErrorMessage\(caught, tt\("PDF 加载失败"\)\)\)/);
  assert.match(workbench, /throw new Error\(tt\("PDF 没有可显示的页面"\)\)/);
  const route = await source("src/shell/advanced-routes/PdfRoute.tsx");
  assert.match(route, /editor\.error \|\|/);

  assert.deepEqual(Object.values(PDF_FAILURE_CODES), [
    "pdf-not-full-text",
    "pdf-no-text-layer",
    "pdf-encrypted",
    "pdf-coordinate-drift",
    "pdf-annotation-lost",
    "pdf-license-out-of-band",
    "pdf-twin-document",
    "pdf-cover-substituted",
    "pdf-invalid-source",
  ]);
});

// ---------------------------------------------------------------------------
// C-4 · §3.3 the annotation coordinate contract

test("C-4 §3.3 / F4: zoom does not move an annotation", () => {
  // The visual space is the page frame normalised to [0,1] and the frame is
  // exactly what zoom scales, so the same physical spot on the page produces
  // the same pair at every stop. This is the property the reader relies on.
  const pageOrigin = { left: 120, top: 80 };
  const baseWidth = 595.28;
  const baseHeight = 841.89;
  const reference = { x: 0.3184, y: 0.7412 };
  for (const zoom of PDF_ZOOM_STOPS) {
    const scale = zoom / 100;
    const bounds = {
      left: pageOrigin.left,
      top: pageOrigin.top,
      width: baseWidth * scale,
      height: baseHeight * scale,
    };
    const client = {
      x: bounds.left + reference.x * bounds.width,
      y: bounds.top + reference.y * bounds.height,
    };
    const visual = viewportPointToVisual(client, bounds);
    assert.ok(
      Math.abs(visual.x - reference.x) < 1e-12 &&
        Math.abs(visual.y - reference.y) < 1e-12,
      `zoom ${zoom}% moved the point to ${JSON.stringify(visual)}`,
    );
  }
  // Pointer events outside the frame clamp instead of producing a rect that
  // pdf-lib would then push off the page.
  const bounds = { left: 0, top: 0, width: 400, height: 500 };
  assert.deepEqual(viewportPointToVisual({ x: -50, y: -50 }, bounds), { x: 0, y: 0 });
  assert.deepEqual(viewportPointToVisual({ x: 9999, y: 9999 }, bounds), { x: 1, y: 1 });
});

// ---------------------------------------------------------------------------
// §5.1 · the three capabilities that define this carrier

test("§5.1 (1/3) 全文可翻页: page count, page list and navigation agree", async () => {
  const bytes = await fullTextPdf({ pages: 6 });
  assert.equal(await inspectPdf(bytes), 6);
  assert.ok(
    6 >= PDF_CARRIER_CONSTANTS.C1_minimumPageCount,
    "C1: fewer than four pages is not a full text",
  );

  const manifest = conformingEvidence().manifest;
  assert.equal(manifest.pageCount, await inspectPdf(bytes));
  assert.equal(manifest.pages.length, manifest.pageCount);
  manifest.pages.forEach((page, index) => assert.equal(page.index, index));

  // D4：页面整理的三件事（旋转写进文件、删页、排序）都真改字节。
  assert.equal(await inspectPdf(await deletePdfPage(bytes, 0)), 5);
  const rotated = await rotatePdfPage(bytes, 2, 90);
  assert.equal(
    (await PDFDocument.load(rotated)).getPage(2).getRotation().angle,
    90,
  );
  const moved = await movePdfPage(bytes, 0, 3);
  assert.equal(await inspectPdf(moved), 6);

  // C2 / C4 / C5: page geometry stays inside the declared domains.
  const document = await PDFDocument.load(bytes);
  for (const page of document.getPages()) {
    assert.ok(page.getWidth() >= PDF_CARRIER_CONSTANTS.C4_minimumPageWidthPt);
    assert.ok(page.getWidth() <= PDF_CARRIER_CONSTANTS.C4_maximumPageWidthPt);
    assert.ok(page.getHeight() >= PDF_CARRIER_CONSTANTS.C5_minimumPageHeightPt);
    assert.ok(page.getHeight() <= PDF_CARRIER_CONSTANTS.C5_maximumPageHeightPt);
  }

  // 到达某一页的入口：左侧缩略图栏（每页一个按钮）+ 查看器自己的滚动。
  const controls = await source("src/shell/media-editors/PdfControls.tsx");
  assert.match(controls, /data-pdf-page-rail/);
  assert.match(controls, /onClick=\{\(\) => onGoTo\(page\)\}/);
});

test("§5.1 (3/3) 可下载: download hands back the source bytes as application/pdf", async () => {
  const bytes = await fullTextPdf({ pages: 6 });
  const captured = [];
  const originalDocument = globalThis.document;
  const originalURL = globalThis.URL.createObjectURL;
  const originalRevoke = globalThis.URL.revokeObjectURL;
  const originalWindow = globalThis.window;
  globalThis.URL.createObjectURL = (blob) => {
    captured.push(blob);
    return "blob:pdf-carrier-test";
  };
  globalThis.URL.revokeObjectURL = () => undefined;
  const anchor = { href: "", download: "", clicked: 0, click() { this.clicked += 1; } };
  globalThis.document = { createElement: () => anchor };
  globalThis.window = { setTimeout: () => 0 };
  try {
    downloadPdfBytes(bytes, "carrier.pdf");
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.URL.createObjectURL = originalURL;
    globalThis.URL.revokeObjectURL = originalRevoke;
  }
  assert.equal(captured.length, 1);
  assert.equal(captured[0].type, "application/pdf");
  assert.equal(captured[0].size, bytes.byteLength, "the source bytes, not a re-render");
  const roundTripped = new Uint8Array(await captured[0].arrayBuffer());
  assert.deepEqual(roundTripped, Uint8Array.from(bytes));
  assert.equal(anchor.download, "carrier.pdf");
  assert.equal(anchor.clicked, 1);

  // The manifest states the permission, and the route exposes the action.
  const manifest = conformingEvidence().manifest;
  assert.equal(manifest.permissions.downloadable, true);
  assert.equal(manifest.permissions.encrypted, false);
  const route = await source("src/shell/advanced-routes/PdfRoute.tsx");
  assert.match(route, /useExportDownloads\(\{ editor: "pdf"[\s\S]*generate: editor\.exportFile/);
  assert.match(route, /directDownload: exportDownloads\[0\]/);
