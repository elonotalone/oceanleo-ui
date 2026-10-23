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
  PDF_ILLEGAL_READER_TRANSITIONS,
  PDF_READER_STATES,
  isIllegalPdfReaderTransition,
  pdfReaderTransition,
} from "../src/shell/media-editors/pdf-workbench-state.ts";
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

// ---------------------------------------------------------------------------
// C-3 · §3.2 the reading and editing state machine

test("C-3 §3.2: every documented migration fires and the five illegal ones cannot", () => {
  assert.deepEqual([...PDF_READER_STATES], [
    "empty",
    "loading",
    "paged",
    "text-ready",
    "annotating",
    "saving",
    "invalid",
    "image-only",
  ]);

  const path = [
    ["empty", "source-received", "loading"],
    ["loading", "pages-resolved", "paged"],
    ["paged", "text-layer-ready", "text-ready"],
    ["text-ready", "annotation-edited", "annotating"],
    ["annotating", "commit-started", "saving"],
    ["saving", "commit-succeeded", "text-ready"],
  ];
  for (const [from, event, to] of path) {
    assert.equal(pdfReaderTransition(from, event), to, `${from} --${event}-->`);
  }
  assert.equal(pdfReaderTransition("loading", "parse-failed"), "invalid");
  assert.equal(pdfReaderTransition("paged", "text-layer-absent"), "image-only");
  assert.equal(pdfReaderTransition("image-only", "annotation-edited"), "annotating");
  assert.equal(pdfReaderTransition("saving", "commit-conflicted"), "annotating");

  assert.deepEqual(
    PDF_ILLEGAL_READER_TRANSITIONS.map((pair) => pair.join("->")),
    [
      "loading->text-ready",
      "invalid->annotating",
      "image-only->text-ready",
      "saving->invalid",
      "paged->saving",
    ],
  );
  for (const [from, to] of PDF_ILLEGAL_READER_TRANSITIONS) {
    assert.equal(isIllegalPdfReaderTransition(from, to), true);
  }

  // No event reaches a forbidden target from any state.
  const events = [
    "source-received",
    "parse-failed",
    "pages-resolved",
    "text-layer-ready",
    "text-layer-absent",
    "annotation-edited",
    "commit-started",
    "commit-succeeded",
    "commit-conflicted",
  ];
  for (const from of PDF_READER_STATES) {
    for (const event of events) {
      for (const textLayerPresent of [true, false]) {
        const to = pdfReaderTransition(from, event, textLayerPresent);
        if (to === null) continue;
        assert.equal(
          isIllegalPdfReaderTransition(from, to),
          false,
          `${from} --${event}--> ${to} is forbidden by §3.2`,
        );
      }
    }
  }

  // Specific refusals the spec calls out by name.
  assert.equal(pdfReaderTransition("loading", "text-layer-ready"), null);
  assert.equal(pdfReaderTransition("invalid", "annotation-edited"), null);
  assert.equal(pdfReaderTransition("paged", "commit-started"), null);
  assert.equal(
    pdfReaderTransition("image-only", "commit-succeeded"),
    null,
    "a scan must not be promoted to text-ready",
  );
  // A scan that saves returns to image-only, never to a claimed full-text state.
  assert.equal(pdfReaderTransition("saving", "commit-succeeded", false), "image-only");
});

test("C-3 §6: a failed load is surfaced, never left as a blank stage", async () => {
  const stage = await source("src/shell/media-editors/PdfStage.tsx");
  assert.match(stage, /role="alert"/);
  assert.match(stage, /callbacks\.current\.onFailure\(watch\.message\)/);
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
  assert.match(route, /directDownload:[\s\S]*onTrigger:[\s\S]*editor\.download\(\)/);
  const workbench = await source("src/shell/media-editors/use-pdf-workbench.ts");
  // 下载的是查看器导出的整份字节（含标准批注），不是重渲染。
  assert.match(workbench, /downloadPdfBytes\(await bridge\.exportBytes\(\)/);
});

// ---------------------------------------------------------------------------
// C-5 · §2 and §4 numeric conformance

test("C-5 §2.1/§2.2/§2.3: palette, layout and zoom stops match the spec value for value", () => {
  assert.deepEqual({ ...PDF_READER_PALETTE }, {
    "reader.canvas": "#525659",
    "reader.page": "#FFFFFF",
    "reader.chrome": "#1F2328",
    "reader.accent": "#1F6FEB",
    "annot.highlight": "#FFD43B",
    "annot.text.marker": "#E5484D",
    "annot.selected": "#0969DA",
  });
  assert.deepEqual({ ...PDF_READER_LAYOUT }, {
    thumbnailRailWidth: 200,
    thumbnailPageWidth: 148,
    thumbnailGap: 12,
    toolbarHeight: 48,
    pageGap: 16,
    pageShadowSpread: 4,
    minimumHitTarget: 24,
  });
  assert.deepEqual([...PDF_ZOOM_STOPS], [25, 50, 75, 100, 125, 150, 200, 300, 400]);
  assert.equal(PDF_ZOOM_STOPS.length, PDF_CARRIER_CONSTANTS.C22_zoomStopCount);
  assert.equal(PDF_MIN_ZOOM, 25);
  assert.equal(PDF_MAX_ZOOM, 400);

  assert.equal(clampPdfZoom(1), 25);
  assert.equal(clampPdfZoom(10_000), 400);
  assert.equal(nextPdfZoomStop(100, 1), 125);
  assert.equal(nextPdfZoomStop(100, -1), 75);
  assert.equal(nextPdfZoomStop(400, 1), 400);
  assert.equal(nextPdfZoomStop(25, -1), 25);

  // Fit stops are computed but still clamped into the same range.
  assert.equal(fitPdfZoom("width", { width: 1190, height: 800 }, { width: 595, height: 842 }), 200);
  assert.ok(fitPdfZoom("page", { width: 40, height: 40 }, { width: 595, height: 842 }) >= 25);
  assert.ok(fitPdfZoom("width", { width: 100_000, height: 10 }, { width: 595, height: 842 }) <= 400);
});

test("C-5 §2.1 / §2.4 SC 1.4.3+1.4.11: the palette meets every contrast floor it promises", async () => {
  const channels = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const relativeLuminance = (hex) => {
    const [r, g, b] = channels(hex)
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // pdf.js paints the highlight as a translucent quad, so the obligation is on
  // the composite, not on the swatch: body glyphs stay legible through it.
  const composite = (fg, bg, alpha) =>
    `#${channels(fg)
      .map((v, i) => Math.round(v * alpha + channels(bg)[i] * (1 - alpha)))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")}`;

  const page = PDF_READER_PALETTE["reader.page"];
  const chrome = PDF_READER_PALETTE["reader.chrome"];
  const floors = [
    ["canvas separates from page", PDF_READER_PALETTE["reader.canvas"], page, 4.5],
    ["chrome carries white label text", chrome, "#FFFFFF", 4.5],
    ["accent reads on chrome", PDF_READER_PALETTE["reader.accent"], chrome, 3.0],
    ["highlight is visible on page", PDF_READER_PALETTE["annot.highlight"], page, 1.4],
    ["text marker reads on page", PDF_READER_PALETTE["annot.text.marker"], page, 3.0],
    ["selection ring reads on page", PDF_READER_PALETTE["annot.selected"], page, 3.0],
  ];
  for (const [label, fg, bg, floor] of floors) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= floor, `${label}: ${ratio.toFixed(3)} < ${floor}`);
  }
});

test("C-5 §4: the constant table carries C1 to C40", () => {
  const expected = {
    C1_minimumPageCount: 4,
    C2_maximumPageCount: 2000,
    C3_minimumPaperPageCount: 6,
    C11_minimumTextCoverageRatio: 0.6,
    C12_minimumTotalCharacters: 2000,
    C13_maximumPageCharacters: 200000,
    C14_maximumTotalCharacters: 20000000,
    C15_maximumOutlineEntries: 500,
    C17_maximumAnnotations: 5000,
    C18_maximumAnnotationContents: 4000,
    C19_annotationKindCount: 2,
    C26_minimumHitTargetPx: 24,
    C27_printRenderDpi: 300,
    C29_screenRenderDpi: 96,
    C30_minimumCoverEdgePx: 128,
    C31_minimumSourceBytes: 65536,
    C32_maximumSourceBytes: 209715200,
    C33_maximumBytesPerPage: 2097152,
    C34_firstPageRenderBudgetMs: 1500,
    C35_fullTextExtractBudgetMs: 12000,
    C36_annotationWriteBudgetMs: 2000,
    C37_minimumFrameColors: 12,
    C38_maximumFamilyJaccard: 0.85,
    C39_twinJaccardThreshold: 0.99,
    C40_existingLibraryCount: 227,
  };
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(PDF_CARRIER_CONSTANTS[key], value, key);
  }
  assert.deepEqual([...PDF_CARRIER_CONSTANTS.C10_pageRotations], [0, 90, 180, 270]);
  assert.equal(PDF_CARRIER_CONSTANTS.C6_a4WidthPt, 595.28);
  assert.equal(PDF_CARRIER_CONSTANTS.C7_a4HeightPt, 841.89);
  assert.equal(PDF_CARRIER_CONSTANTS.C8_letterWidthPt, 612);
  assert.equal(PDF_CARRIER_CONSTANTS.C9_letterHeightPt, 792);
  const ids = new Set(
    Object.keys(PDF_CARRIER_CONSTANTS).map((key) => key.split("_")[0]),
  );
  for (let index = 1; index <= 40; index += 1) {
    assert.ok(ids.has(`C${index}`), `C${index} is missing from the table`);
  }
});

// ---------------------------------------------------------------------------
// C-6 · §8 byte floors and completeness

test("C-6 §8.1/§8.2: a conforming artifact passes", () => {
  const verdict = judgePdfCarrier(conformingEvidence());
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
  assert.equal(
    new TextEncoder().encode(serializePdfBinaryManifest(verdict.manifest))
      .byteLength >= PDF_MANIFEST_MINIMUM_BYTES,
    true,
  );
});

test("C-6 §8.2: the 233 B husk is rejected", () => {
  const verdict = judgePdfCarrier(husk());
  assert.equal(verdict.ok, false);
  const clauses = verdict.failures.map((entry) => entry.clause);
  const codes = verdict.failures.map((entry) => entry.code);
  // A one-page husk cannot even describe itself: pageCount 1 breaks the schema.
  assert.ok(codes.includes("pdf-manifest-invalid"), JSON.stringify(verdict.failures));
  assert.ok(clauses.includes("§3.1"));
});

test("C-6 §8.2: an empty blank PDF from createBlankPdf cannot qualify", async () => {
  const blank = await createBlankPdf();
  assert.equal(await inspectPdf(blank), 1);
  assert.ok(
    blank.byteLength < PDF_SOURCE_MINIMUM_BYTES,
    `a blank PDF is ${blank.byteLength} B, well under the ${PDF_SOURCE_MINIMUM_BYTES} B floor`,
  );
  const verdict = judgePdfCarrier({
    manifest: buildPdfBinaryManifest({
      pages: [{ index: 0, widthPt: 595.28, heightPt: 841.89, rotation: 0 }],
      textLayer: { present: false, totalCharacters: 0, coveragePageRatio: 0 },
      permissions: { annotatable: true },
      provenance: {
        channel: "owned",
        licenseCode: "CC0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      },
    }),
    sourceByteLength: blank.byteLength,
    frameColorCounts: { first: 1, last: 1 },
    derivations: {
      preview: PDF_EXPECTED_DERIVATION,
      thumbnail: PDF_EXPECTED_DERIVATION,
    },
    thumbnailMinimumEdgePx: 128,
  });
  assert.equal(verdict.ok, false);
});

test("C-6 §8.2: each predicate fails on its own", () => {
  const cases = [
    [
      "source under the floor",
      { sourceByteLength: PDF_SOURCE_MINIMUM_BYTES - 1 },
      "§8.1",
    ],
    [
      "source over the ceiling",
      { sourceByteLength: PDF_CARRIER_CONSTANTS.C32_maximumSourceBytes + 1 },
      "§8.1",
    ],
    [
      "bytes per page over C33",
      { sourceByteLength: 6 * PDF_CARRIER_CONSTANTS.C33_maximumBytesPerPage + 1 },
      "§5.2/C33",
    ],
    [
      "first page frame is blank",
      { frameColorCounts: { first: 2, last: 40 } },
      "§8.2/C37",
    ],
    [
      "last page frame is blank",
      { frameColorCounts: { first: 40, last: 2 } },
      "§8.2/C37",
    ],
    [
      "frame evidence missing",
      { frameColorCounts: undefined },
      "§8.2",
    ],
    [
      "preview is a designed cover",
      { derivations: { preview: "uploaded-cover", thumbnail: PDF_EXPECTED_DERIVATION } },
      "§8.2/§1.1",
    ],
    [
      "thumbnail is a designed cover",
      { derivations: { preview: PDF_EXPECTED_DERIVATION, thumbnail: "uploaded-cover" } },
      "§8.2/§1.1",
    ],
    ["derivation evidence missing", { derivations: undefined }, "§8.2"],
    ["thumbnail too small", { thumbnailMinimumEdgePx: 127 }, "§8.2/C30"],
    ["thumbnail evidence missing", { thumbnailMinimumEdgePx: undefined }, "§8.2/C30"],
  ];
  for (const [label, overrides, clause] of cases) {
    const verdict = judgePdfCarrier(conformingEvidence(overrides));
    assert.equal(verdict.ok, false, label);
    assert.ok(
      verdict.failures.some((entry) => entry.clause === clause),
      `${label} should cite ${clause}, got ${JSON.stringify(verdict.failures)}`,
    );
  }
});

test("C-6 §8.2 / F1 / F2: text-layer and paper-page thresholds bite", () => {
  const withTextLayer = (textLayer, channel = "owned") =>
    conformingEvidence({
      manifest: buildPdfBinaryManifest({
        pages: Array.from({ length: 6 }, (_, index) => ({
          index,
          widthPt: 595.28,
          heightPt: 841.89,
          rotation: 0,
        })),
        textLayer,
        permissions: { annotatable: true },
        provenance: {
          channel,
          licenseCode: "CC-BY",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        },
      }),
    });

  // F2: a scan whose coverage is under C11.
  const thinCoverage = judgePdfCarrier(
    withTextLayer({ present: true, totalCharacters: 9000, coveragePageRatio: 0.4 }),
  );
  assert.equal(thinCoverage.ok, false);
  assert.ok(
    thinCoverage.failures.some(
      (entry) => entry.code === PDF_FAILURE_CODES.F2_noTextLayer,
    ),
  );

  // F1: enough coverage, not enough text.
  const thinText = judgePdfCarrier(
    withTextLayer({ present: true, totalCharacters: 1999, coveragePageRatio: 1 }),
  );
  assert.equal(thinText.ok, false);
  assert.ok(
    thinText.failures.some(
      (entry) => entry.code === PDF_FAILURE_CODES.F1_notFullText,
    ),
  );

  // §8.2: a scan may land as long as it says so, so present=false passes here.
  assert.equal(
    judgePdfCarrier(
      withTextLayer({ present: false, totalCharacters: 0, coveragePageRatio: 0 }),
    ).ok,
    true,
  );

  // C3 / F1: arXiv material needs six pages, not four.
  const fivePagePaper = judgePdfCarrier(
    conformingEvidence({
      manifest: buildPdfBinaryManifest({
        pages: Array.from({ length: 5 }, (_, index) => ({
          index,
          widthPt: 595.28,
          heightPt: 841.89,
          rotation: 0,
        })),
        textLayer: { present: true, totalCharacters: 9000, coveragePageRatio: 1 },
        permissions: { annotatable: true },
        provenance: {
          channel: "arxiv-s3-bulk",
          licenseCode: "CC-BY",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        },
      }),
    }),
  );
  assert.equal(fivePagePaper.ok, false);
  assert.ok(
    fivePagePaper.failures.some((entry) => entry.clause === "§8.2/C1/C3"),
  );
  // The same five pages from a non-paper channel are fine.
  assert.equal(
    judgePdfCarrier(
      conformingEvidence({
        manifest: buildPdfBinaryManifest({
          pages: Array.from({ length: 5 }, (_, index) => ({
            index,
            widthPt: 595.28,
            heightPt: 841.89,
            rotation: 0,
          })),
          textLayer: { present: true, totalCharacters: 9000, coveragePageRatio: 1 },
          permissions: { annotatable: true },
          provenance: {
            channel: "owned",
            licenseCode: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          },
        }),
      }),
    ).ok,
    true,
  );
});

// ---------------------------------------------------------------------------
// C-8 · §1.3 licence lock

test("C-8 §1.3 / F6: only CC0, CC-BY and CC-BY-SA carry full text", () => {
  assert.equal(pdfLicenseDisposition("CC0"), "full-text");
  assert.equal(pdfLicenseDisposition("cc-by"), "full-text");
  assert.equal(pdfLicenseDisposition("CC-BY-SA"), "full-text-no-composite");
  assert.equal(pdfLicenseDisposition("CC-BY-NC"), "metadata-and-link-only");
  assert.equal(pdfLicenseDisposition("arXiv-1.0"), "metadata-and-link-only");
  assert.equal(pdfLicenseDisposition(""), "metadata-and-link-only");

  // F6: a scraped channel cannot even be described.
  assert.equal(
    validatePdfBinaryManifest({
      ...conformingEvidence().manifest,
      provenance: {
        channel: "scraped",
        licenseCode: "CC-BY",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      },
    }).ok,
    false,
  );
});

// ---------------------------------------------------------------------------
// C-1 · §1.1 the four-tuple, and §5.4 security

test("C-1 §1.1: the editor still saves as a bounded pdf-binary@1 artifact", async () => {
  // The Library write lives in pdf-library-save.ts (split out of the workbench hook).
  const workbench =
    (await source("src/shell/media-editors/use-pdf-workbench.ts")) +
    (await source("src/shell/media-editors/pdf-library-save.ts"));
  assert.match(workbench, /deliveryProjectSchema: "pdf-binary@1"/);
  assert.match(workbench, /sourceFormat: "pdf"/);
  assert.match(workbench, /sourceMediaType: "application\/pdf"/);
  assert.match(workbench, /editor_capability: "pdf-editor"/);
  assert.match(workbench, /artifactType: "pdf"/);
  assert.equal(PDF_BINARY_MANIFEST_SCHEMA_ID, "pdf-binary@1");
});

test("§5.4: rendering stays on the PDFium (EmbedPDF) canvas path; no pdf.js", async () => {
  const stage = await source("src/shell/media-editors/PdfStage.tsx");
  assert.match(stage, /import\("@embedpdf\/react-pdf-viewer"\)/);
  assert.doesNotMatch(stage, /pdfjs/);

  // §1.2: no second PDF engine, and no server-side binaries.
  for (const file of [
    "src/shell/media-editors/pdf-operations.ts",
    "src/shell/media-editors/pdf-source.ts",
    "src/shell/media-editors/PdfStage.tsx",
    "src/shell/media-editors/pdf-viewer-bridge.ts",
    "src/shell/media-editors/use-pdf-workbench.ts",
  ]) {
    const text = await source(file);
    assert.doesNotMatch(text, /pdftotext|qpdf|mupdf|poppler|pdfkit|jspdf|pdfjs/i, file);
  }
  const packageJson = JSON.parse(await source("package.json"));
  assert.equal(packageJson.dependencies["pdf-lib"], "^1.17.1");
});

test("§1.1: the carrier does not gain a new editor directory", async () => {
  const route = await source("src/shell/advanced-routes/PdfRoute.tsx");
  assert.match(route, /from "\.\.\/media-editors\/use-pdf-workbench"/);
  assert.match(route, /min: PDF_MIN_ZOOM/);
  assert.match(route, /max: PDF_MAX_ZOOM/);
});
