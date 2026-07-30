// `pdf-binary@1` sidecar manifest contract.
//
// The artifact body for this carrier is the PDF binary itself, so "the full text
// is readable" cannot be machine-checked from the bytes alone without a PDF
// engine. The manifest is the machine-checkable projection of the binary that
// travels with every revision as an `editor_manifest` rendition.
//
// Spec: docs/specs/oceanleo-material-and-game-v1/L1-carriers/pdf-reader.md
//   §3.1 JSON Schema · §4 constant table · §6 failure modes
//   §8.1 byte floors · §8.2 completeness predicates · §1.3 licence lock

export const PDF_BINARY_MANIFEST_SCHEMA_ID = "pdf-binary@1";
export const PDF_BINARY_MANIFEST_VERSION = 1;
export const PDF_TEXT_LAYER_EXTRACTOR = "pdfjs-dist@4.10.38";

/** §3.1 — the manifest schema, kept as data so validation runs against it. */
export const PDF_BINARY_MANIFEST_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://oceanleo.com/schemas/pdf-binary@1.manifest.json",
  title: "pdf-binary@1 editor manifest",
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "version",
    "pageCount",
    "pages",
    "textLayer",
    "permissions",
    "provenance",
  ],
  properties: {
    schema: { const: "pdf-binary@1" },
    version: { type: "integer", const: 1 },
    pageCount: { type: "integer", minimum: 4, maximum: 2000 },
    pages: {
      type: "array",
      minItems: 4,
      maxItems: 2000,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "widthPt", "heightPt", "rotation"],
        properties: {
          index: { type: "integer", minimum: 0, maximum: 1999 },
          widthPt: { type: "number", minimum: 72, maximum: 5184 },
          heightPt: { type: "number", minimum: 72, maximum: 5184 },
          rotation: { enum: [0, 90, 180, 270] },
          textCharacters: { type: "integer", minimum: 0, maximum: 200000 },
          imageCount: { type: "integer", minimum: 0, maximum: 500 },
        },
      },
    },
    textLayer: {
      type: "object",
      additionalProperties: false,
      required: ["present", "totalCharacters", "coveragePageRatio"],
      properties: {
        present: { type: "boolean" },
        totalCharacters: { type: "integer", minimum: 0, maximum: 20000000 },
        coveragePageRatio: { type: "number", minimum: 0, maximum: 1 },
        extractor: { const: "pdfjs-dist@4.10.38" },
      },
    },
    outline: {
      type: "array",
      maxItems: 500,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "pageIndex", "level"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 300 },
          pageIndex: { type: "integer", minimum: 0, maximum: 1999 },
          level: { type: "integer", minimum: 1, maximum: 6 },
        },
      },
    },
    annotations: {
      type: "array",
      maxItems: 5000,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "pageIndex", "rect"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 64 },
          kind: { enum: ["text", "highlight"] },
          pageIndex: { type: "integer", minimum: 0, maximum: 1999 },
          rect: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "number", minimum: 0, maximum: 5184 },
          },
          contents: { type: "string", maxLength: 4000 },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
    permissions: {
      type: "object",
      additionalProperties: false,
      required: ["downloadable", "annotatable", "encrypted"],
      properties: {
        downloadable: { const: true },
        annotatable: { type: "boolean" },
        encrypted: { const: false },
        printable: { type: "boolean", default: true },
      },
    },
    provenance: {
      type: "object",
      additionalProperties: false,
      required: ["channel", "licenseCode", "licenseUrl"],
      properties: {
        channel: {
          enum: [
            "arxiv-api",
            "arxiv-oai-pmh",
            "arxiv-s3-bulk",
            "owned",
            "user-upload",
            "approved-provider",
          ],
        },
        licenseCode: { type: "string", minLength: 2, maxLength: 60 },
        licenseUrl: { type: "string", format: "uri", pattern: "^https://" },
        sourceUrl: { type: "string", format: "uri", pattern: "^https://" },
        attribution: { type: "string", maxLength: 2000 },
      },
    },
  },
} as const;

/** §4 — the normative constant table, C1 through C40. */
export const PDF_CARRIER_CONSTANTS = {
  C1_minimumPageCount: 4,
  C2_maximumPageCount: 2000,
  C3_minimumPaperPageCount: 6,
  C4_minimumPageWidthPt: 72,
  C4_maximumPageWidthPt: 5184,
  C5_minimumPageHeightPt: 72,
  C5_maximumPageHeightPt: 5184,
  C6_a4WidthPt: 595.28,
  C7_a4HeightPt: 841.89,
  C8_letterWidthPt: 612,
  C9_letterHeightPt: 792,
  C10_pageRotations: [0, 90, 180, 270],
  C11_minimumTextCoverageRatio: 0.6,
  C12_minimumTotalCharacters: 2000,
  C13_maximumPageCharacters: 200000,
  C14_maximumTotalCharacters: 20000000,
  C15_maximumOutlineEntries: 500,
  C16_outlineLevels: [1, 6],
  C17_maximumAnnotations: 5000,
  C18_maximumAnnotationContents: 4000,
  C19_annotationKindCount: 2,
  C20_minimumZoomPercent: 25,
  C21_maximumZoomPercent: 400,
  C22_zoomStopCount: 9,
  C23_thumbnailRailWidthPx: 200,
  C24_thumbnailPageWidthPx: 148,
  C25_toolbarHeightPx: 48,
  C26_minimumHitTargetPx: 24,
  C27_printRenderDpi: 300,
  C28_bleedMm: 3,
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
} as const;

/** §8.1 — byte floors. `pdf_editing` already owns a floor key in the catalog. */
export const PDF_SOURCE_MINIMUM_BYTES = PDF_CARRIER_CONSTANTS.C31_minimumSourceBytes;
export const PDF_SOURCE_MAXIMUM_BYTES = PDF_CARRIER_CONSTANTS.C32_maximumSourceBytes;
export const PDF_MANIFEST_MINIMUM_BYTES = 512;

/** §1.1 — preview and thumbnail must both be derived by rendering a real page. */
export const PDF_EXPECTED_DERIVATION = "pdf-page-render";

/** §3.3 / §4 C19 — the annotation subtypes that exist today. */
export const PDF_ANNOTATION_KINDS = ["text", "highlight"] as const;

/** §1.3 — only these licences may carry full text into the library. */
export const PDF_FULL_TEXT_TRANSFERABLE_LICENSES = ["CC0", "CC-BY", "CC-BY-SA"] as const;
/** §1.3 — CC-BY-SA may land but must stay out of exported composites. */
export const PDF_COMPOSITE_BLOCKED_LICENSES = ["CC-BY-SA"] as const;
/** §1.3 / F6 — arXiv material may only arrive through official channels. */
export const PDF_PAPER_CHANNEL_PREFIX = "arxiv-";

/** §6 — every failure mode gets a code so nothing degrades into a blank stage. */
export const PDF_FAILURE_CODES = {
  F1_notFullText: "pdf-not-full-text",
  F2_noTextLayer: "pdf-no-text-layer",
  F3_encrypted: "pdf-encrypted",
  F4_coordinateDrift: "pdf-coordinate-drift",
  F5_annotationLost: "pdf-annotation-lost",
  F6_licenseOutOfBand: "pdf-license-out-of-band",
  F7_twinDocument: "pdf-twin-document",
  F8_coverSubstituted: "pdf-cover-substituted",
  invalidSource: "pdf-invalid-source",
} as const;

export type PdfFailureCode =
  (typeof PDF_FAILURE_CODES)[keyof typeof PDF_FAILURE_CODES];

export type PdfManifestAnnotationKind = (typeof PDF_ANNOTATION_KINDS)[number];

export type PdfProvenanceChannel =
  | "arxiv-api"
  | "arxiv-oai-pmh"
  | "arxiv-s3-bulk"
  | "owned"
  | "user-upload"
  | "approved-provider";

export interface PdfManifestPage {
  index: number;
  widthPt: number;
  heightPt: number;
  rotation: 0 | 90 | 180 | 270;
  textCharacters?: number;
  imageCount?: number;
}

export interface PdfManifestTextLayer {
  present: boolean;
  totalCharacters: number;
  coveragePageRatio: number;
  extractor?: typeof PDF_TEXT_LAYER_EXTRACTOR;
}

export interface PdfManifestOutlineEntry {
  title: string;
  pageIndex: number;
  level: number;
}

export interface PdfManifestAnnotation {
  id: string;
  kind: PdfManifestAnnotationKind;
  pageIndex: number;
  rect: [number, number, number, number];
  contents?: string;
  createdAt?: string;
}

export interface PdfManifestPermissions {
  downloadable: true;
  annotatable: boolean;
  encrypted: false;
  printable?: boolean;
}

export interface PdfManifestProvenance {
  channel: PdfProvenanceChannel;
  licenseCode: string;
  licenseUrl: string;
  sourceUrl?: string;
  attribution?: string;
}

export interface PdfBinaryManifest {
  schema: typeof PDF_BINARY_MANIFEST_SCHEMA_ID;
  version: 1;
  pageCount: number;
  pages: PdfManifestPage[];
  textLayer: PdfManifestTextLayer;
  outline?: PdfManifestOutlineEntry[];
  annotations?: PdfManifestAnnotation[];
  permissions: PdfManifestPermissions;
  provenance: PdfManifestProvenance;
}

export interface PdfManifestIssue {
  keyword: string;
  path: string;
  message: string;
}

const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;
const URI = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s]+$/;

type SchemaNode = Record<string, unknown>;

function jsonType(value: unknown, expected: string): boolean {
  switch (expected) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return false;
  }
}

function checkNode(
  value: unknown,
  schema: SchemaNode,
  path: string,
  issues: PdfManifestIssue[],
): void {
  const push = (keyword: string, message: string) =>
    issues.push({ keyword, path: path || "#", message });

  if ("const" in schema && value !== schema.const) {
    push("const", `expected ${JSON.stringify(schema.const)}`);
    return;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value as never)) {
    push("enum", `expected one of ${JSON.stringify(schema.enum)}`);
    return;
  }
  if (typeof schema.type === "string" && !jsonType(value, schema.type)) {
    push("type", `expected ${schema.type}`);
    return;
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      push("minimum", `${value} < ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      push("maximum", `${value} > ${schema.maximum}`);
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      push("minLength", `length ${value.length} < ${schema.minLength}`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      push("maxLength", `length ${value.length} > ${schema.maxLength}`);
    }
    if (schema.format === "date-time" && !DATE_TIME.test(value)) {
      push("format", "expected an RFC 3339 date-time");
    }
    if (schema.format === "uri" && !URI.test(value)) {
      push("format", "expected an absolute URI");
    }
    if (
      typeof schema.pattern === "string" &&
      !new RegExp(schema.pattern).test(value)
    ) {
      push("pattern", `does not match ${schema.pattern}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      push("minItems", `${value.length} < ${schema.minItems}`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      push("maxItems", `${value.length} > ${schema.maxItems}`);
    }
    const items = schema.items as SchemaNode | undefined;
    if (items) {
      value.forEach((entry, index) =>
        checkNode(entry, items, `${path}/${index}`, issues),
      );
    }
  }

  if (jsonType(value, "object")) {
    const record = value as Record<string, unknown>;
    const properties = (schema.properties as Record<string, SchemaNode>) || {};
    for (const key of (schema.required as string[]) || []) {
      if (!(key in record)) push("required", `missing property "${key}"`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in properties)) {
          push("additionalProperties", `unexpected property "${key}"`);
        }
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in record) checkNode(record[key], child, `${path}/${key}`, issues);
    }
  }
}

export type PdfManifestValidation =
  | { ok: true; manifest: PdfBinaryManifest; errors: [] }
  | { ok: false; manifest: null; errors: PdfManifestIssue[] };

/**
 * §3.1 — validate a candidate manifest against the schema above. `pages` and
 * `pageCount` are cross-checked here because JSON Schema alone cannot tie the
 * array length to the scalar, and §8.2 requires the two to agree.
 */
export function validatePdfBinaryManifest(value: unknown): PdfManifestValidation {
  const errors: PdfManifestIssue[] = [];
  checkNode(value, PDF_BINARY_MANIFEST_JSON_SCHEMA as SchemaNode, "", errors);
  if (errors.length === 0) {
    const manifest = value as PdfBinaryManifest;
    if (manifest.pages.length !== manifest.pageCount) {
      errors.push({
        keyword: "pageCount",
        path: "#/pages",
        message: `pages length ${manifest.pages.length} != pageCount ${manifest.pageCount}`,
      });
    }
    manifest.pages.forEach((page, index) => {
      if (page.index !== index) {
        errors.push({
          keyword: "pageIndex",
          path: `#/pages/${index}/index`,
          message: `page index ${page.index} is out of document order`,
        });
      }
    });
  }
  return errors.length === 0
    ? { ok: true, manifest: value as PdfBinaryManifest, errors: [] }
    : { ok: false, manifest: null, errors };
}

const MANIFEST_KEY_ORDER: readonly (keyof PdfBinaryManifest)[] = [
  "schema",
  "version",
  "pageCount",
  "pages",
  "textLayer",
  "outline",
  "annotations",
  "permissions",
  "provenance",
];

/** Deterministic bytes: the same manifest must always serialize identically. */
export function serializePdfBinaryManifest(manifest: PdfBinaryManifest): string {
  const ordered: Record<string, unknown> = {};
  for (const key of MANIFEST_KEY_ORDER) {
    if (manifest[key] !== undefined) ordered[key] = manifest[key];
  }
  return JSON.stringify(ordered, null, 2);
}

export interface PdfManifestDraft {
  pages: readonly {
    index: number;
    widthPt: number;
    heightPt: number;
    rotation: number;
    textCharacters?: number;
    imageCount?: number;
  }[];
  textLayer: {
    present: boolean;
    totalCharacters: number;
    coveragePageRatio: number;
  };
  permissions: { annotatable: boolean; printable?: boolean };
  provenance: PdfManifestProvenance;
  outline?: readonly PdfManifestOutlineEntry[];
  annotations?: readonly PdfManifestAnnotation[];
}

function normalizedRotation(value: number): 0 | 90 | 180 | 270 {
  const rotation = (((Math.round(value / 90) * 90) % 360) + 360) % 360;
  return rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0;
}

/**
 * Build a manifest from what the editor already knows. `downloadable` and
 * `encrypted` are fixed by the schema, so they are written from the contract
 * rather than from caller input: an encrypted PDF is rejected at load (F3).
 */
export function buildPdfBinaryManifest(draft: PdfManifestDraft): PdfBinaryManifest {
  const manifest: PdfBinaryManifest = {
    schema: PDF_BINARY_MANIFEST_SCHEMA_ID,
    version: PDF_BINARY_MANIFEST_VERSION,
    pageCount: draft.pages.length,
    pages: draft.pages.map((page) => ({
      index: page.index,
      widthPt: page.widthPt,
      heightPt: page.heightPt,
      rotation: normalizedRotation(page.rotation),
      ...(page.textCharacters === undefined
        ? {}
        : { textCharacters: page.textCharacters }),
      ...(page.imageCount === undefined ? {} : { imageCount: page.imageCount }),
    })),
    textLayer: {
      present: draft.textLayer.present,
      totalCharacters: draft.textLayer.totalCharacters,
      coveragePageRatio: draft.textLayer.coveragePageRatio,
      extractor: PDF_TEXT_LAYER_EXTRACTOR,
    },
    permissions: {
      downloadable: true,
      annotatable: draft.permissions.annotatable,
      encrypted: false,
      ...(draft.permissions.printable === undefined
        ? {}
        : { printable: draft.permissions.printable }),
    },
    provenance: { ...draft.provenance },
  };
  if (draft.outline?.length) manifest.outline = draft.outline.map((entry) => ({ ...entry }));
  if (draft.annotations?.length) {
    manifest.annotations = draft.annotations.map((entry) => ({ ...entry }));
  }
  return manifest;
}

export interface PdfCarrierEvidence {
  manifest: unknown;
  /** `artifact_blobs.byte_size` of the `source` blob. */
  sourceByteLength: number;
  /** Bytes of the serialized `editor_manifest` rendition. */
  manifestByteLength?: number;
  /** §8.2 / A5 / A6 — distinct colour counts of the first and last page frames. */
  frameColorCounts?: { first: number; last: number };
  /** §1.1 — both renditions must be derived by rendering a page. */
  derivations?: { preview: string; thumbnail: string };
  /** §8.2 / C30 — shortest edge of the stored cover thumbnail. */
  thumbnailMinimumEdgePx?: number;
}

export interface PdfCarrierFailure {
  code: PdfFailureCode | "pdf-manifest-invalid" | "pdf-below-floor" | "pdf-evidence-missing";
  clause: string;
  message: string;
}

export interface PdfCarrierVerdict {
  ok: boolean;
  failures: PdfCarrierFailure[];
  manifest: PdfBinaryManifest | null;
}

/**
 * §8.1 + §8.2 — the whole completeness gate. Absent evidence fails closed: a
 * 233 B husk with no manifest is exactly the case this predicate exists to
 * reject, so "we could not check" and "it does not hold" get the same verdict.
 */
export function judgePdfCarrier(evidence: PdfCarrierEvidence): PdfCarrierVerdict {
  const failures: PdfCarrierFailure[] = [];
  const fail = (
    code: PdfCarrierFailure["code"],
    clause: string,
    message: string,
  ) => failures.push({ code, clause, message });

  const validated = validatePdfBinaryManifest(evidence.manifest);
  if (!validated.ok) {
    for (const issue of validated.errors) {
      fail("pdf-manifest-invalid", "§3.1", `${issue.path}: ${issue.message}`);
    }
    return { ok: false, failures, manifest: null };
  }
  const manifest = validated.manifest;

  if (evidence.sourceByteLength < PDF_SOURCE_MINIMUM_BYTES) {
    fail(
      "pdf-below-floor",
      "§8.1",
      `source blob ${evidence.sourceByteLength} B is under the ${PDF_SOURCE_MINIMUM_BYTES} B floor`,
    );
  }
  if (evidence.sourceByteLength > PDF_SOURCE_MAXIMUM_BYTES) {
    fail(
      "pdf-below-floor",
      "§8.1",
      `source blob ${evidence.sourceByteLength} B exceeds the ${PDF_SOURCE_MAXIMUM_BYTES} B ceiling`,
    );
  }
  const manifestBytes =
    evidence.manifestByteLength ??
    new TextEncoder().encode(serializePdfBinaryManifest(manifest)).byteLength;
  if (manifestBytes < PDF_MANIFEST_MINIMUM_BYTES) {
    fail(
      "pdf-below-floor",
      "§8.1",
      `editor_manifest ${manifestBytes} B is under the ${PDF_MANIFEST_MINIMUM_BYTES} B floor`,
    );
  }

  const paper = manifest.provenance.channel.startsWith(PDF_PAPER_CHANNEL_PREFIX);
  const minimumPages = paper
    ? PDF_CARRIER_CONSTANTS.C3_minimumPaperPageCount
    : PDF_CARRIER_CONSTANTS.C1_minimumPageCount;
  if (manifest.pageCount < minimumPages) {
    fail(
      PDF_FAILURE_CODES.F1_notFullText,
      "§8.2/C1/C3",
      `pageCount ${manifest.pageCount} < ${minimumPages}`,
    );
  }
  const bytesPerPage = evidence.sourceByteLength / Math.max(1, manifest.pageCount);
  if (bytesPerPage > PDF_CARRIER_CONSTANTS.C33_maximumBytesPerPage) {
    fail(
      "pdf-below-floor",
      "§5.2/C33",
      `${Math.round(bytesPerPage)} B per page exceeds ${PDF_CARRIER_CONSTANTS.C33_maximumBytesPerPage} B`,
    );
  }

  if (manifest.textLayer.present) {
    if (
      manifest.textLayer.coveragePageRatio <
      PDF_CARRIER_CONSTANTS.C11_minimumTextCoverageRatio
    ) {
      fail(
        PDF_FAILURE_CODES.F2_noTextLayer,
        "§8.2/C11",
        `coveragePageRatio ${manifest.textLayer.coveragePageRatio} < ${PDF_CARRIER_CONSTANTS.C11_minimumTextCoverageRatio}`,
      );
    }
    if (
      manifest.textLayer.totalCharacters <
      PDF_CARRIER_CONSTANTS.C12_minimumTotalCharacters
    ) {
      fail(
        PDF_FAILURE_CODES.F1_notFullText,
        "§8.2/C12",
        `totalCharacters ${manifest.textLayer.totalCharacters} < ${PDF_CARRIER_CONSTANTS.C12_minimumTotalCharacters}`,
      );
    }
  }

  if (!evidence.frameColorCounts) {
    fail(
      "pdf-evidence-missing",
      "§8.2",
      "first and last page frame colour counts were not supplied",
    );
  } else {
    for (const [label, count] of [
      ["first", evidence.frameColorCounts.first],
      ["last", evidence.frameColorCounts.last],
    ] as const) {
      if (count < PDF_CARRIER_CONSTANTS.C37_minimumFrameColors) {
        fail(
          PDF_FAILURE_CODES.F1_notFullText,
          "§8.2/C37",
          `${label} page frame has ${count} colours, needs ${PDF_CARRIER_CONSTANTS.C37_minimumFrameColors}`,
        );
      }
    }
  }

  if (!evidence.derivations) {
    fail("pdf-evidence-missing", "§8.2", "preview/thumbnail derivations were not supplied");
  } else {
    for (const purpose of ["preview", "thumbnail"] as const) {
      if (evidence.derivations[purpose] !== PDF_EXPECTED_DERIVATION) {
        fail(
          PDF_FAILURE_CODES.F8_coverSubstituted,
          "§8.2/§1.1",
          `${purpose} derivation is "${evidence.derivations[purpose]}", expected "${PDF_EXPECTED_DERIVATION}"`,
        );
      }
    }
  }

  if (evidence.thumbnailMinimumEdgePx === undefined) {
    fail("pdf-evidence-missing", "§8.2/C30", "thumbnail minimum edge was not supplied");
  } else if (
    evidence.thumbnailMinimumEdgePx < PDF_CARRIER_CONSTANTS.C30_minimumCoverEdgePx
  ) {
    fail(
      PDF_FAILURE_CODES.F8_coverSubstituted,
      "§8.2/C30",
      `thumbnail minimum edge ${evidence.thumbnailMinimumEdgePx} px < ${PDF_CARRIER_CONSTANTS.C30_minimumCoverEdgePx} px`,
    );
  }

  return { ok: failures.length === 0, failures, manifest };
}

export type PdfLicenseDisposition =
  | "full-text"
  | "full-text-no-composite"
  | "metadata-and-link-only";

/** §1.3 / F6 — what a licence code allows us to keep. */
export function pdfLicenseDisposition(licenseCode: string): PdfLicenseDisposition {
  const code = licenseCode.trim().toUpperCase();
  if (!(PDF_FULL_TEXT_TRANSFERABLE_LICENSES as readonly string[]).includes(code)) {
    return "metadata-and-link-only";
  }
  return (PDF_COMPOSITE_BLOCKED_LICENSES as readonly string[]).includes(code)
    ? "full-text-no-composite"
    : "full-text";
}
