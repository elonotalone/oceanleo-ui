/**
 * `oceanleo.design-document.v1` load state machine, layer order, evidence and
 * completeness judgement.
 *
 * Spec: docs/specs/oceanleo-material-and-game-v1/L1-carriers/design-document.md
 * — §3.2 state machine, §3.3 layer order, §5.1/§5.3 quality, §5.4 licence,
 * §6 failure modes, §8.1 byte floor, §8.2 completeness.
 *
 * Everything here is pure and deterministic: the same source bytes plus the
 * same closure/evidence inputs always yield the same state trace and the same
 * criterion report, so the judgement can run in the ingest path and in tests.
 */

import {
  DESIGN_DOCUMENT_CONSTANTS,
  DESIGN_DOCUMENT_COMPLETENESS_THRESHOLDS,
  DESIGN_FORBIDDEN_LICENSE_CODES,
  DESIGN_GRID,
  DesignDocumentCarrierError,
  parseDesignDocumentProject,
  snapToDesignGrid,
  validateDesignDocumentProject,
  type DesignDocumentElement,
  type DesignDocumentProject,
} from "./design-document-schema";

export const DESIGN_DOCUMENT_STATES = Object.freeze([
  "empty",
  "parsing",
  "assets-resolved",
  "layout-verified",
  "rasterized",
  "ready",
  "invalid",
  "degraded",
]);

export type DesignDocumentState = (typeof DESIGN_DOCUMENT_STATES)[number];

/** §3.2 transition table, one row per spec row. */
export const DESIGN_DOCUMENT_TRANSITIONS = Object.freeze([
  Object.freeze({ from: "empty", to: "parsing", trigger: "取得 source 字节" }),
  Object.freeze({
    from: "parsing",
    to: "invalid",
    trigger: "JSON 解析失败或 §3.1 校验失败（含 elementCount < 20）",
  }),
  Object.freeze({
    from: "parsing",
    to: "assets-resolved",
    trigger: "全部 elements[].assetId 与 fonts[].assetId 命中闭包",
  }),
  Object.freeze({
    from: "parsing",
    to: "degraded",
    trigger: "图片缺失但文本与图形元素完整",
  }),
  Object.freeze({
    from: "parsing",
    to: "invalid",
    trigger: "字体缺失（字体回落会改变全部文本排版，不可降级）",
  }),
  Object.freeze({
    from: "assets-resolved",
    to: "layout-verified",
    trigger: "z 无重复、group.childIds 无悬空、无元素完全出画板",
  }),
  Object.freeze({
    from: "assets-resolved",
    to: "invalid",
    trigger: "上述任一不成立",
  }),
  Object.freeze({
    from: "layout-verified",
    to: "rasterized",
    trigger: "@napi-rs/canvas 渲出预览与缩略图",
  }),
  Object.freeze({
    from: "rasterized",
    to: "ready",
    trigger: "width/height/elementCount/elementTypes 与 evidence 相等",
  }),
  Object.freeze({
    from: "rasterized",
    to: "invalid",
    trigger: "四项任一不等",
  }),
]);

/** §3.2 illegal transitions; each one is a hollow-artifact path. */
export const DESIGN_DOCUMENT_ILLEGAL_TRANSITIONS = Object.freeze([
  Object.freeze({
    from: "parsing",
    to: "rasterized",
    reason: "跳过素材解析，渲出的是缺图版面",
  }),
  Object.freeze({
    from: "degraded",
    to: "ready",
    reason: "缺件态 MUST NOT 直接交付",
  }),
  Object.freeze({
    from: "assets-resolved",
    to: "ready",
    reason: "跳过版面校验与渲染，evidence 无从生成",
  }),
  Object.freeze({
    from: "invalid",
    to: "rasterized",
    reason: "非法源 MUST NOT 进入渲染",
  }),
  Object.freeze({ from: "empty", to: "ready", reason: "空壳产生路径" }),
]);

export function designDocumentTransitionAllowed(
  from: DesignDocumentState,
  to: DesignDocumentState,
): boolean {
  if (
    DESIGN_DOCUMENT_ILLEGAL_TRANSITIONS.some(
      (illegal) => illegal.from === from && illegal.to === to,
    )
  ) {
    return false;
  }
  return DESIGN_DOCUMENT_TRANSITIONS.some(
    (transition) => transition.from === from && transition.to === to,
  );
}

export interface DesignDocumentEvidence {
  width: number;
  height: number;
  elementCount: number;
  elementTypes: string[];
}

/**
 * §5.3: the four evidence fields are always derived here, never accepted from
 * the payload — a hand-typed `elementTypes` is what makes catalog publication
 * reject the whole pack.
 */
export function designDocumentEvidence(
  project: DesignDocumentProject,
): DesignDocumentEvidence {
  const types = new Set<string>();
  for (const element of project.document.elements) types.add(element.type);
  return {
    width: project.document.width,
    height: project.document.height,
    elementCount: project.document.elements.length,
    elementTypes: [...types].sort(),
  };
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const first = [...new Set(left)].sort();
  const second = [...new Set(right)].sort();
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

export function designDocumentEvidenceMatches(
  project: DesignDocumentProject,
  declared: DesignDocumentEvidence | null | undefined,
): boolean {
  if (!declared) return false;
  const actual = designDocumentEvidence(project);
  return (
    declared.width === actual.width &&
    declared.height === actual.height &&
    declared.width >= 1 &&
    declared.height >= 1 &&
    declared.elementCount === actual.elementCount &&
    sameStringSet(declared.elementTypes, actual.elementTypes)
  );
}

export interface DesignLayerOrderReport {
  ok: boolean;
  duplicateZ: string[];
  danglingChildIds: string[];
  misplacedChildIds: string[];
  offBoardElementIds: string[];
}

/**
 * §3.3. `x ≥ width` in the spec table reads against the artboard width; the
 * element's own `width` is already consumed by the `x + width ≤ 0` clause.
 */
export function designDocumentElementIsOffBoard(
  element: DesignDocumentElement,
  artboard: { width: number; height: number },
): boolean {
  return (
    element.x + element.width <= 0 ||
    element.y + element.height <= 0 ||
    element.x >= artboard.width ||
    element.y >= artboard.height
  );
}

export function verifyDesignDocumentLayerOrder(
  project: DesignDocumentProject,
): DesignLayerOrderReport {
  const elements = project.document.elements;
  const byId = new Map(elements.map((element) => [element.id, element]));
  const seenZ = new Map<number, string>();
  const duplicateZ: string[] = [];
  for (const element of elements) {
    const owner = seenZ.get(element.z);
    if (owner) duplicateZ.push(element.id);
    else seenZ.set(element.z, element.id);
  }

  const danglingChildIds: string[] = [];
  const misplacedChildIds: string[] = [];
  for (const group of elements) {
    if (group.type !== "group" || !group.childIds) continue;
    const childIds = new Set(group.childIds);
    const outsideZ = elements
      .filter((element) => !childIds.has(element.id) && element.z > group.z)
      .map((element) => element.z);
    const ceiling = outsideZ.length > 0 ? Math.min(...outsideZ) : Infinity;
    for (const childId of group.childIds) {
      const child = byId.get(childId);
      if (!child) {
        danglingChildIds.push(childId);
        continue;
      }
      if (child.z <= group.z || child.z >= ceiling) {
        misplacedChildIds.push(childId);
      }
    }
  }

  const offBoardElementIds = elements
    .filter((element) =>
      designDocumentElementIsOffBoard(element, project.document),
    )
    .map((element) => element.id);

  return {
    ok:
      duplicateZ.length === 0 &&
      danglingChildIds.length === 0 &&
      misplacedChildIds.length === 0 &&
      offBoardElementIds.length === 0,
    duplicateZ,
    danglingChildIds,
    misplacedChildIds,
    offBoardElementIds,
  };
}

const COVERAGE_GRID = 64;

/**
 * §8.2 coverage. Occupancy is accumulated on a fixed 64×64 lattice so that
 * overlapping elements cannot be counted twice — 20 stacked identical rects
 * must not read as 20× coverage. Rotation is ignored (bounding box), which can
 * only over-report, never let a sparse layout through.
 */
export function designDocumentCoverageRatio(
  project: DesignDocumentProject,
): number {
  const { width, height, elements } = project.document;
  const cells = new Set<number>();
  const cellWidth = width / COVERAGE_GRID;
  const cellHeight = height / COVERAGE_GRID;
  for (const element of elements) {
    if (element.opacity === 0) continue;
    if (designDocumentElementIsOffBoard(element, project.document)) continue;
    const left = Math.max(0, Math.floor(element.x / cellWidth));
    const right = Math.min(
      COVERAGE_GRID - 1,
      Math.ceil((element.x + element.width) / cellWidth) - 1,
    );
    const top = Math.max(0, Math.floor(element.y / cellHeight));
    const bottom = Math.min(
      COVERAGE_GRID - 1,
      Math.ceil((element.y + element.height) / cellHeight) - 1,
    );
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        cells.add(row * COVERAGE_GRID + column);
      }
    }
  }
  return cells.size / (COVERAGE_GRID * COVERAGE_GRID);
}

export interface DesignDocumentCriterion {
  id: string;
  criterion: string;
  threshold: string;
  actual: string;
  ok: boolean;
  spec: string;
}

export interface DesignDocumentCompletenessReport {
  ok: boolean;
  criteria: DesignDocumentCriterion[];
  failed: string[];
}

export interface DesignDocumentCompletenessInput {
  sourceByteSize: number;
  evidence?: DesignDocumentEvidence | null;
  frameColorCount?: number | null;
}

/** §8.1 byte floor plus §8.2 completeness, one row per spec row. */
export function evaluateDesignDocumentCompleteness(
  project: DesignDocumentProject,
  input: DesignDocumentCompletenessInput,
): DesignDocumentCompletenessReport {
  const elements = project.document.elements;
  const actual = designDocumentEvidence(project);
  const declared = input.evidence ?? actual;
  const layer = verifyDesignDocumentLayerOrder(project);
  const coverage = designDocumentCoverageRatio(project);
  const textElements = elements.filter(
    (element) => element.type === "text",
  ).length;
  const substantiveImages = elements.filter(
    (element) => element.type === "image" && element.decorative !== true,
  );
  const imagesWithAlt = substantiveImages.filter(
    (element) =>
      typeof element.alt === "string" &&
      [...element.alt].length >= DESIGN_DOCUMENT_CONSTANTS.C32_minimumAltLength,
  );
  const attributionEntries = project.attribution.entries;
  const wellFormedAttribution = attributionEntries.filter(
    (entry) =>
      Boolean(entry.text) &&
      Boolean(entry.licenseCode) &&
      entry.licenseUrl.startsWith("https://"),
  );

  const criteria: DesignDocumentCriterion[] = [
    {
      id: "source-bytes",
      criterion: "source blob 字节",
      threshold: `${DESIGN_DOCUMENT_CONSTANTS.C34_minimumSourceBytes} – ${DESIGN_DOCUMENT_CONSTANTS.C35_maximumSourceBytes} B`,
      actual: `${input.sourceByteSize} B`,
      ok:
        input.sourceByteSize >=
          DESIGN_DOCUMENT_CONSTANTS.C34_minimumSourceBytes &&
        input.sourceByteSize <=
          DESIGN_DOCUMENT_CONSTANTS.C35_maximumSourceBytes,
      spec: "§8.1 / C34 / C35",
    },
    {
      id: "element-count",
      criterion: "document.elements 条数",
      threshold: `≥ ${DESIGN_DOCUMENT_CONSTANTS.C1_minimumElements}`,
      actual: String(elements.length),
      ok: elements.length >= DESIGN_DOCUMENT_CONSTANTS.C1_minimumElements,
      spec: "§8.2 / C1 / reviewed_material_catalog.py:2178",
    },
    {
      id: "element-count-agrees",
      criterion: "elementCount 与实际长度",
      threshold: "相等",
      actual: `${declared.elementCount} vs ${actual.elementCount}`,
      ok: declared.elementCount === actual.elementCount,
      spec: "§8.2 / reviewed_material_catalog.py:2178",
    },
    {
      id: "element-types-agree",
      criterion: "elementTypes 与实际类型集",
      threshold: "相等",
      actual: `${declared.elementTypes.join(",")} vs ${actual.elementTypes.join(",")}`,
      ok: sameStringSet(declared.elementTypes, actual.elementTypes),
      spec: "§8.2 / reviewed_material_catalog.py:2185-2189",
    },
    {
      id: "artboard-agrees",
      criterion: "document.width / height 与 evidence",
      threshold: "相等且 ≥ 1",
      actual: `${declared.width}×${declared.height} vs ${actual.width}×${actual.height}`,
      ok:
        declared.width === actual.width &&
        declared.height === actual.height &&
        actual.width >= 1 &&
        actual.height >= 1,
      spec: "§8.2 / reviewed_material_catalog.py:2170-2176",
    },
    {
      id: "element-types-used",
      criterion: "用到的元素类型种数",
      threshold: `≥ ${DESIGN_DOCUMENT_CONSTANTS.C4_minimumElementTypesUsed}`,
      actual: String(actual.elementTypes.length),
      ok:
        actual.elementTypes.length >=
        DESIGN_DOCUMENT_CONSTANTS.C4_minimumElementTypesUsed,
      spec: "§8.2 / C4",
    },
    {
      id: "text-elements",
      criterion: "text 元素条数",
      threshold: `≥ ${DESIGN_DOCUMENT_COMPLETENESS_THRESHOLDS.minimumTextElements}`,
      actual: String(textElements),
      ok:
        textElements >=
        DESIGN_DOCUMENT_COMPLETENESS_THRESHOLDS.minimumTextElements,
      spec: "§8.2",
    },
    {
      id: "coverage",
      criterion: "元素覆盖画板面积比",
      threshold: `≥ ${DESIGN_DOCUMENT_COMPLETENESS_THRESHOLDS.minimumCoverageRatio}`,
      actual: coverage.toFixed(4),
      ok:
        coverage >=
        DESIGN_DOCUMENT_COMPLETENESS_THRESHOLDS.minimumCoverageRatio,
      spec: "§8.2 / F2",
    },
    {
      id: "off-board",
      criterion: "完全出画板的元素数",
      threshold: "= 0",
      actual: String(layer.offBoardElementIds.length),
      ok: layer.offBoardElementIds.length === 0,
      spec: "§8.2 / §3.3",
    },
    {
      id: "duplicate-z",
      criterion: "z 重复数",
      threshold: "= 0",
      actual: String(layer.duplicateZ.length),
      ok: layer.duplicateZ.length === 0,
      spec: "§8.2 / §3.3 / C17",
    },
    {
      id: "palette",
      criterion: "palette 色数",
      threshold: `≥ ${DESIGN_DOCUMENT_CONSTANTS.C24_paletteColors.minimum}`,
      actual: String(project.palette.length),
      ok:
        project.palette.length >=
        DESIGN_DOCUMENT_CONSTANTS.C24_paletteColors.minimum,
      spec: "§8.2 / C24",
    },
    {
      id: "image-alt",
      criterion: "非装饰 image 元素有 alt 的比例",
      threshold: "100%",
      actual: `${imagesWithAlt.length}/${substantiveImages.length}`,
      ok: imagesWithAlt.length === substantiveImages.length,
      spec: "§8.2 / WCAG 2.2 SC 1.1.1 / C32",
    },
    {
      id: "attribution",
      criterion: "attribution.entries",
      threshold: `≥ ${DESIGN_DOCUMENT_COMPLETENESS_THRESHOLDS.minimumAttributionEntries}，三字段齐全`,
      actual: `${wellFormedAttribution.length}/${attributionEntries.length}`,
      ok:
        attributionEntries.length >=
          DESIGN_DOCUMENT_COMPLETENESS_THRESHOLDS.minimumAttributionEntries &&
        wellFormedAttribution.length === attributionEntries.length,
      spec: "§8.2",
    },
    {
      id: "title",
      criterion: "title 长度",
      threshold: `≥ ${DESIGN_DOCUMENT_COMPLETENESS_THRESHOLDS.minimumTitleLength} 字符`,
      actual: String([...project.title].length),
      ok:
        [...project.title].length >=
        DESIGN_DOCUMENT_COMPLETENESS_THRESHOLDS.minimumTitleLength,
      spec: "§8.2 / reviewed_material_catalog.py:3309",
    },
    {
      id: "frame-colors",
      criterion: "抓帧颜色数",
      threshold: `≥ ${DESIGN_DOCUMENT_CONSTANTS.C41_minimumFrameColors} 种`,
      actual:
        input.frameColorCount === undefined || input.frameColorCount === null
          ? "未抓帧"
          : String(input.frameColorCount),
      ok:
        typeof input.frameColorCount === "number" &&
        input.frameColorCount >=
          DESIGN_DOCUMENT_CONSTANTS.C41_minimumFrameColors,
      spec: "§8.2 / C41 / A5",
    },
  ];

  const failed = criteria.filter((row) => !row.ok).map((row) => row.id);
  return { ok: failed.length === 0, criteria, failed };
}

/**
 * §8.2 criteria that can only be answered once `@napi-rs/canvas` has produced a
 * frame. The `rasterized → ready` edge is where they are enforced; a gate that
 * only holds source bytes MUST NOT pretend to have judged them.
 */
export const DESIGN_DOCUMENT_RASTER_STAGE_CRITERIA = Object.freeze([
  "frame-colors",
]);

/** The source-only slice of §8.1 + §8.2, for gates that run before rasterizing. */
export function designDocumentSourceCompleteness(
  project: DesignDocumentProject,
  sourceByteSize: number,
): DesignDocumentCompletenessReport {
  const full = evaluateDesignDocumentCompleteness(project, {
    sourceByteSize,
  });
  const criteria = full.criteria.filter(
    (row) => !DESIGN_DOCUMENT_RASTER_STAGE_CRITERIA.includes(row.id),
  );
  const failed = criteria.filter((row) => !row.ok).map((row) => row.id);
  return { ok: failed.length === 0, criteria, failed };
}

export interface DesignLicenseManifestEntry {
  subject: string;
  licenseCode: string;
  licenseUrl: string;
}

export interface DesignLicenseManifest {
  ok: boolean;
  entries: DesignLicenseManifestEntry[];
  fontsWithoutAttribution: string[];
  forbiddenLicenseCodes: string[];
}

/**
 * §5.4. Fonts are attributed unconditionally: the library's
 * `attribution_required` flag is a known ingest gap (`ingest_fonts.py:98`
 * hardcodes false) and OFL itself requires the notice to travel, so the flag
 * MUST NOT decide whether a font is credited.
 */
export function designDocumentLicenseManifest(
  project: DesignDocumentProject,
): DesignLicenseManifest {
  const entries: DesignLicenseManifestEntry[] = project.attribution.entries.map(
    (entry) => ({
      subject: entry.assetId ? `asset:${entry.assetId}` : entry.text,
      licenseCode: entry.licenseCode,
      licenseUrl: entry.licenseUrl,
    }),
  );
  const attributedText = project.attribution.entries
    .map((entry) => `${entry.text} ${entry.licenseCode}`)
    .join("\n");
  const fontsWithoutAttribution = (project.fonts ?? [])
    .filter(
      (font) =>
        !attributedText.includes(font.family) ||
        !project.attribution.entries.some(
          (entry) =>
            entry.text.includes(font.family) &&
            entry.licenseCode === font.licenseCode,
        ),
    )
    .map((font) => font.family);
  const forbiddenLicenseCodes = [
    ...new Set(
      [
        ...project.attribution.entries.map((entry) => entry.licenseCode),
        ...(project.assets ?? []).map((asset) => asset.licenseCode ?? ""),
      ].filter((code) =>
        DESIGN_FORBIDDEN_LICENSE_CODES.some(
          (forbidden) => forbidden.toUpperCase() === code.toUpperCase(),
        ),
      ),
    ),
  ];
  return {
    ok:
      fontsWithoutAttribution.length === 0 &&
      forbiddenLicenseCodes.length === 0,
    entries,
    fontsWithoutAttribution,
    forbiddenLicenseCodes,
  };
}

export interface DesignDocumentClosure {
  /** Asset ids resolvable in the dependency closure. */
  assetIds: readonly string[];
}

export interface DesignDocumentLoadInput {
  bytes?: string | Uint8Array | null;
  closure?: DesignDocumentClosure;
  evidence?: DesignDocumentEvidence | null;
  raster?: { ok: boolean; frameColorCount?: number } | null;
}

export interface DesignDocumentLoadResult {
  state: DesignDocumentState;
  trace: DesignDocumentState[];
  project: DesignDocumentProject | null;
  evidence: DesignDocumentEvidence | null;
  code: string | null;
  reason: string;
  missingAssetIds: string[];
  missingFontAssetIds: string[];
  layer: DesignLayerOrderReport | null;
}

/**
 * §3.2 driver. Every step is expressed as a transition that
 * `designDocumentTransitionAllowed` accepts, so the trace itself is the C-5
 * evidence: no run can contain one of the five illegal edges.
 */
export function loadDesignDocumentCarrier(
  input: DesignDocumentLoadInput,
): DesignDocumentLoadResult {
  const trace: DesignDocumentState[] = ["empty"];
  const result: DesignDocumentLoadResult = {
    state: "empty",
    trace,
    project: null,
    evidence: null,
    code: null,
    reason: "",
    missingAssetIds: [],
    missingFontAssetIds: [],
    layer: null,
  };
  const step = (to: DesignDocumentState, code?: string, reason?: string) => {
    const from = result.state;
    if (!designDocumentTransitionAllowed(from, to)) {
      throw new DesignDocumentCarrierError(
        `design document 载入路径出现非法迁移 ${from} → ${to}。`,
        "design-document-invalid-structure",
      );
    }
    result.state = to;
    trace.push(to);
    if (code) result.code = code;
    if (reason) result.reason = reason;
  };

  if (
    input.bytes === undefined ||
    input.bytes === null ||
    (typeof input.bytes === "string" && input.bytes.length === 0) ||
    (input.bytes instanceof Uint8Array && input.bytes.byteLength === 0)
  ) {
    result.reason = "没有 source 字节，停在 empty。";
    return result;
  }

  step("parsing");
  let project: DesignDocumentProject;
  try {
    project = parseDesignDocumentProject(input.bytes);
  } catch (caught) {
    const error =
      caught instanceof DesignDocumentCarrierError
        ? caught
        : new DesignDocumentCarrierError(
            "design document source 无法解析。",
            "design-document-invalid-structure",
          );
    step("invalid", error.code, error.message);
    return result;
  }
  result.project = project;
  result.evidence = designDocumentEvidence(project);

  const closure = new Set(input.closure?.assetIds ?? []);
  const fontAssetIds = (project.fonts ?? [])
    .map((font) => font.assetId)
    .filter((assetId): assetId is string => Boolean(assetId));
  result.missingFontAssetIds = fontAssetIds.filter(
    (assetId) => !closure.has(assetId),
  );
  const imageAssetIds = [
    ...new Set(
      project.document.elements
        .map((element) => element.assetId)
        .filter((assetId): assetId is string => Boolean(assetId)),
    ),
  ];
  result.missingAssetIds = imageAssetIds.filter(
    (assetId) => !closure.has(assetId),
  );

  if (result.missingFontAssetIds.length > 0) {
    step(
      "invalid",
      "design-document-font-missing",
      `字体资源缺失（${result.missingFontAssetIds.join(", ")}），字体回落会改变全部文本排版，不可降级。`,
    );
    return result;
  }
  if (result.missingAssetIds.length > 0) {
    step(
      "degraded",
      "design-document-degraded-assets",
      `图片资源缺失（${result.missingAssetIds.join(", ")}），文本与图形完整但 MUST NOT 直接交付。`,
    );
    return result;
  }

  step("assets-resolved");
  const layer = verifyDesignDocumentLayerOrder(project);
  result.layer = layer;
  if (!layer.ok) {
    const code =
      layer.danglingChildIds.length > 0
        ? "design-document-dangling-group"
        : layer.duplicateZ.length > 0 || layer.misplacedChildIds.length > 0
          ? "design-document-layer-ambiguous"
          : "design-document-padded-elements";
    step("invalid", code, "§3.3 图层序校验不通过。");
    return result;
  }

  step("layout-verified");
  if (!input.raster?.ok) {
    result.reason = "尚未渲出预览与缩略图，停在 layout-verified。";
    return result;
  }

  step("rasterized");
  if (!designDocumentEvidenceMatches(project, input.evidence)) {
    step(
      "invalid",
      "design-document-evidence-mismatch",
      "width/height/elementCount/elementTypes 与 evidence 不符。",
    );
    return result;
  }

  step("ready");
  return result;
}

/** Visual identity of a project; changes whenever a render would change. */
export function designDocumentRenderDigest(
  project: DesignDocumentProject,
): string {
  const parts = [
    `${project.document.width}x${project.document.height}`,
    project.document.background,
    project.palette.join(","),
  ];
  for (const element of [...project.document.elements].sort(
    (left, right) => left.z - right.z,
  )) {
    parts.push(
      [
        element.z,
        element.type,
        element.id,
        element.x,
        element.y,
        element.width,
        element.height,
        element.rotationDeg ?? 0,
        element.opacity ?? 1,
        element.fill ?? "",
        element.stroke ?? "",
        element.strokeWidth ?? 0,
        element.text ?? "",
        element.fontFamily ?? "",
        element.fontSizePx ?? 0,
        element.fontWeight ?? 0,
        element.assetId ?? "",
        element.pathData ?? "",
      ].join("|"),
    );
  }
  return parts.join("\n");
}

function clone(project: DesignDocumentProject): DesignDocumentProject {
  return JSON.parse(JSON.stringify(project)) as DesignDocumentProject;
}

export interface DesignPaletteRecolorResult {
  project: DesignDocumentProject;
  changedElementIds: string[];
}

/**
 * §5.1: changing `palette[index]` MUST move every element that references that
 * colour. Elements reference palette entries by value, so the swap is applied
 * to `fill` and `stroke` alike.
 */
export function recolorDesignDocumentPalette(
  project: DesignDocumentProject,
  index: number,
  nextValue: string,
): DesignPaletteRecolorResult {
  const previous = project.palette[index];
  if (previous === undefined) {
    throw new DesignDocumentCarrierError(
      `palette[${index}] 不存在。`,
      "design-document-invalid-structure",
    );
  }
  const next = clone(project);
  next.palette[index] = nextValue;
  const changedElementIds: string[] = [];
  for (const element of next.document.elements) {
    let touched = false;
    if (element.fill === previous) {
      element.fill = nextValue;
      touched = true;
    }
    if (element.stroke === previous) {
      element.stroke = nextValue;
      touched = true;
    }
    if (touched) changedElementIds.push(element.id);
  }
  return { project: next, changedElementIds };
}

/** §5.1: editing a text element MUST change the rendered result. */
export function setDesignDocumentElementText(
  project: DesignDocumentProject,
  elementId: string,
  text: string,
): DesignDocumentProject {
  const next = clone(project);
  const element = next.document.elements.find(
    (candidate) => candidate.id === elementId,
  );
  if (!element || element.type !== "text") {
    throw new DesignDocumentCarrierError(
      `元素 ${elementId} 不是可改文案的 text 元素。`,
      "design-document-invalid-structure",
    );
  }
  element.text = text;
  return next;
}

/** §5.1: every element is independently selectable, movable and re-orderable. */
export function moveDesignDocumentElement(
  project: DesignDocumentProject,
  elementId: string,
  deltaX: number,
  deltaY: number,
  options: { snap?: boolean } = {},
): DesignDocumentProject {
  const next = clone(project);
  const element = next.document.elements.find(
    (candidate) => candidate.id === elementId,
  );
  if (!element) {
    throw new DesignDocumentCarrierError(
      `元素 ${elementId} 不存在。`,
      "design-document-invalid-structure",
    );
  }
  const rawX = element.x + deltaX;
  const rawY = element.y + deltaY;
  if (options.snap === false) {
    element.x = rawX;
    element.y = rawY;
  } else {
    element.x = snapToDesignGrid(rawX);
    element.y = snapToDesignGrid(rawY);
  }
  return next;
}

export function setDesignDocumentElementZ(
  project: DesignDocumentProject,
  elementId: string,
  z: number,
): DesignDocumentProject {
  const next = clone(project);
  const element = next.document.elements.find(
    (candidate) => candidate.id === elementId,
  );
  if (!element) {
    throw new DesignDocumentCarrierError(
      `元素 ${elementId} 不存在。`,
      "design-document-invalid-structure",
    );
  }
  const taken = next.document.elements.some(
    (candidate) => candidate.id !== elementId && candidate.z === z,
  );
  if (taken) {
    throw new DesignDocumentCarrierError(
      `z=${z} 已被占用；同一 document 内 z MUST 唯一。`,
      "design-document-layer-ambiguous",
    );
  }
  element.z = z;
  return next;
}

/** §2.3: an element narrower than the minimum selectable edge cannot be hit. */
export function designDocumentSelectableElementIds(
  project: DesignDocumentProject,
): string[] {
  return project.document.elements
    .filter(
      (element) =>
        element.width >= DESIGN_GRID.minimumSelectableEdgePx &&
        element.height >= DESIGN_GRID.minimumSelectableEdgePx,
    )
    .map((element) => element.id);
}

export interface DesignDocumentConformance {
  ok: boolean;
  checks: { id: string; ok: boolean; detail: string }[];
}

/**
 * §9 C-2/C-3/C-4/C-7/C-9 in one call — the gate the ingest path uses before a
 * `composite_image` revision may claim `editability = native`.
 */
export function assertDesignDocumentCarrierConformance(
  value: unknown,
  input: DesignDocumentCompletenessInput,
): DesignDocumentConformance {
  const validation = validateDesignDocumentProject(value);
  if (!validation.ok) {
    return {
      ok: false,
      checks: [
        {
          id: "C-2",
          ok: false,
          detail: validation.errors
            .slice(0, 6)
            .map((error) => `${error.path || "<root>"} ${error.message}`)
            .join("；"),
        },
      ],
    };
  }
  const project = validation.project;
  const evidence = designDocumentEvidence(project);
  const layer = verifyDesignDocumentLayerOrder(project);
  const completeness = evaluateDesignDocumentCompleteness(project, input);
  const license = designDocumentLicenseManifest(project);
  const checks = [
    { id: "C-2", ok: true, detail: "§3.1 校验通过" },
    {
      id: "C-3",
      ok: designDocumentEvidenceMatches(project, input.evidence ?? evidence),
      detail: `evidence=${JSON.stringify(evidence)}`,
    },
    {
      id: "C-4",
      ok: layer.ok,
      detail: `duplicateZ=${layer.duplicateZ.length} dangling=${layer.danglingChildIds.length} misplaced=${layer.misplacedChildIds.length} offBoard=${layer.offBoardElementIds.length}`,
    },
    {
      id: "C-7",
      ok: completeness.ok,
      detail:
        completeness.failed.length === 0
          ? "§8.1 / §8.2 全部成立"
          : `未达标：${completeness.failed.join(", ")}`,
    },
    {
      id: "C-9",
      ok: license.ok,
      detail: `fontsWithoutAttribution=${license.fontsWithoutAttribution.join(",") || "none"} forbidden=${license.forbiddenLicenseCodes.join(",") || "none"}`,
    },
  ];
  return { ok: checks.every((check) => check.ok), checks };
}
