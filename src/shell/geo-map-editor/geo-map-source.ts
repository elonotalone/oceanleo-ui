/**
 * `oceanleo.geo-map.v1` parse / serialize plane.
 *
 * Nothing in this module performs I/O. §1.2 pins no map runtime and the preview
 * sandbox runs under `connect-src 'none'`, so bytes always arrive from the
 * platform's own rendition plumbing and dependency resolution is a pure
 * comparison against what the caller already holds (§3.3 `resolving`).
 */

import {
  GEO_MAP_CONSTANTS,
  canonicalGeoMapProject,
  evaluateGeoMapCompleteness,
  geoMapProjectByteLength,
  serializeGeoMapProject,
  validateGeoMapProject,
  type GeoMapErrorCode,
  type GeoMapProject,
  type GeoMapValidationError,
} from "./geo-map-schema";

export {
  GEO_MAP_ADAPTER_ID,
  GEO_MAP_ARTIFACT_TYPE,
  GEO_MAP_CLOSURE_FLOORS,
  GEO_MAP_COMPLETENESS,
  GEO_MAP_CONSTANTS,
  GEO_MAP_EDITOR_CAPABILITY,
  GEO_MAP_ERROR_CODES,
  GEO_MAP_FEATURE_ID,
  GEO_MAP_LICENSE_CODES,
  GEO_MAP_PALETTE,
  GEO_MAP_PROJECT_SCHEMA,
  GEO_MAP_PROJECT_VERSION,
  GEO_MAP_SOURCE_MEDIA_TYPE,
  canonicalGeoMapProject,
  evaluateGeoMapCompleteness,
  evaluateGeoMapSimilarity,
  geoMapContrastRatio,
  geoMapDataLayers,
  geoMapJaccardSimilarity,
  geoMapPaintColors,
  geoMapProjectByteLength,
  repairGeoMapLabelContrast,
  serializeGeoMapProject,
  validateGeoMapProject,
} from "./geo-map-schema";
export type {
  GeoMapAnnotation,
  GeoMapAttribution,
  GeoMapAttributionEntry,
  GeoMapBasemap,
  GeoMapCamera,
  GeoMapColor,
  GeoMapColorOrRamp,
  GeoMapCompletenessResult,
  GeoMapDependency,
  GeoMapErrorCode,
  GeoMapGeometry,
  GeoMapInteractions,
  GeoMapLayer,
  GeoMapLayerPaint,
  GeoMapLegend,
  GeoMapLegendEntry,
  GeoMapLicenseCode,
  GeoMapMetadata,
  GeoMapProject,
  GeoMapProjection,
  GeoMapSourceEntry,
  GeoMapValidationError,
  GeoMapValidationResult,
} from "./geo-map-schema";

export const GEO_MAP_EDITOR_ID = "geo-map-editor" as const;
export const GEO_MAP_EDITOR_ADAPTER = "geo-map-editor@1" as const;

export const GEO_MAP_SOURCE_REPAIR =
  "数据修复：为当前 revision 补录 oceanleo.geo-map.v1 结构化源与完整依赖闭包；不会从 HTML、瓦片图片或截图逆向伪恢复。";

/**
 * The only routes a geo-map dependency may resolve through. Both are same-origin
 * platform routes; a `http(s)://` or protocol-relative dependency is rejected in
 * the schema plane, so the sandbox never needs `connect-src` widened.
 */
export const GEO_MAP_SAME_ORIGIN_ROUTE_PREFIXES = [
  "/v1/artifacts/",
  "/v1/assets/library/",
] as const;

export class GeoMapSourceError extends Error {
  readonly code: GeoMapErrorCode;
  readonly errors: GeoMapValidationError[];

  constructor(
    code: GeoMapErrorCode,
    message: string,
    errors: GeoMapValidationError[] = [],
  ) {
    super(`${message} ${GEO_MAP_SOURCE_REPAIR}`);
    this.name = "GeoMapSourceError";
    this.code = code;
    this.errors = errors;
  }
}

export interface GeoMapParseOptions {
  /** §8.1: pass `true` on the ingest path so a 233 B shell fails at parse. */
  enforceMinimumBytes?: boolean;
}

const textEncoder = new TextEncoder();

function decodeUtf8(input: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new GeoMapSourceError(
      "geo-map-not-utf8",
      "geo-map source 不是有效的 UTF-8 字节。",
    );
  }
}

/** §1.1 / ADR-04: HTML never becomes an editable geo-map source. */
function assertNotHtml(text: string): void {
  if (/^\s*(?:<!doctype|<html|<\?xml|<svg)/i.test(text)) {
    throw new GeoMapSourceError(
      "geo-map-html-source",
      "geo-map source 以标记语言开头；geo_map MUST NOT 以 html 落库。",
    );
  }
}

/**
 * Preferred error code for a failed validation: the §6 codes win over the generic
 * schema violation so callers can branch on the real failure mode.
 */
function primaryCode(errors: GeoMapValidationError[]): GeoMapErrorCode {
  const specific = errors.find(
    (entry) => entry.code !== "geo-map-schema-violation",
  );
  return specific?.code ?? "geo-map-schema-violation";
}

export function parseGeoMapSource(
  input: string | Uint8Array,
  options: GeoMapParseOptions = {},
): GeoMapProject {
  const text = (typeof input === "string" ? input : decodeUtf8(input)).replace(
    /^\uFEFF/,
    "",
  );
  if (!text.trim()) {
    throw new GeoMapSourceError(
      "geo-map-empty-source",
      "geo-map source 为空。",
    );
  }
  assertNotHtml(text);
  const byteLength =
    typeof input === "string"
      ? textEncoder.encode(text).byteLength
      : input.byteLength;
  if (byteLength > GEO_MAP_CONSTANTS.sourceBytesMax) {
    throw new GeoMapSourceError(
      "geo-map-source-too-large",
      `geo-map source 为 ${byteLength} B，超过 ${GEO_MAP_CONSTANTS.sourceBytesMax} B 首屏上限（C33）。`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeoMapSourceError(
      "geo-map-invalid-json",
      "geo-map source 必须是合法 JSON；HTML 与脚本永不求值。",
    );
  }
  const validated = validateGeoMapProject(parsed);
  if (!validated.ok) {
    throw new GeoMapSourceError(
      primaryCode(validated.errors),
      `geo-map source 未通过 §3.2 校验：${validated.errors
        .slice(0, 6)
        .map((entry) => `${entry.path} ${entry.message}`)
        .join("；")}。`,
      validated.errors,
    );
  }
  if (options.enforceMinimumBytes) {
    const completeness = evaluateGeoMapCompleteness({
      project: validated.project,
      sourceBytes: byteLength,
    });
    if (!completeness.ok) {
      throw new GeoMapSourceError(
        primaryCode(completeness.failures),
        `geo-map source 未达 §8 完备判据：${completeness.failures
          .map((entry) => entry.message)
          .join("；")}。`,
        completeness.failures,
      );
    }
  }
  return validated.project;
}

/** Roundtrip helper used by the save path: bytes → project → identical bytes. */
export function assertGeoMapRoundtrip(project: GeoMapProject): string {
  const json = serializeGeoMapProject(project);
  const reopened = parseGeoMapSource(json);
  const again = serializeGeoMapProject(reopened);
  if (again !== json) {
    throw new GeoMapSourceError(
      "geo-map-schema-violation",
      "geo-map 序列化不确定：同一工程两次序列化字节不一致。",
    );
  }
  return json;
}

export interface GeoMapAvailableDependency {
  path: string;
  sha256: string;
  byteSize?: number;
}

/** §3.3 旁路终态。W5 maps this onto `ready` / `degraded` / `invalid`. */
export type GeoMapClosureVerdict = "ready" | "degraded" | "invalid";

export interface GeoMapClosureResult {
  verdict: GeoMapClosureVerdict;
  /** §3.3: `degraded` MUST NOT be allowed to save (it would mint a second shell). */
  canSave: boolean;
  missingPaths: string[];
  digestMismatchPaths: string[];
  undeclaredSourcePaths: string[];
  totalBytes: number;
  errors: GeoMapValidationError[];
}

export function geoMapDeclaredDependencyPaths(
  project: GeoMapProject,
): string[] {
  return [...new Set((project.dependencies ?? []).map((entry) => entry.path))].sort();
}

/**
 * §3.3 `resolving` and §6 F3. Pure comparison: the caller supplies whatever the
 * revision actually carries, this decides ready / degraded / invalid.
 */
export function resolveGeoMapDependencyClosure(
  project: GeoMapProject,
  available: readonly GeoMapAvailableDependency[],
): GeoMapClosureResult {
  const errors: GeoMapValidationError[] = [];
  const byPath = new Map(available.map((entry) => [entry.path, entry]));
  const declared = project.dependencies ?? [];
  const missingPaths: string[] = [];
  const digestMismatchPaths: string[] = [];
  let totalBytes = 0;
  for (const dependency of declared) {
    const present = byPath.get(dependency.path);
    if (!present) {
      missingPaths.push(dependency.path);
      continue;
    }
    if (present.sha256.toLowerCase() !== dependency.sha256.toLowerCase()) {
      digestMismatchPaths.push(dependency.path);
      continue;
    }
    totalBytes += present.byteSize ?? dependency.byteSize ?? 0;
  }
  const declaredPaths = new Set(declared.map((entry) => entry.path));
  const undeclaredSourcePaths = [
    ...new Set(
      Object.values(project.sources)
        .map((source) => source.dependencyPath)
        .filter((path) => !declaredPaths.has(path)),
    ),
  ].sort();
  for (const path of missingPaths) {
    errors.push({
      code: "geo-map-dependency-closure-incomplete",
      path: "dependencies",
      message: `dependency ${path} is declared but absent from the revision closure`,
    });
  }
  for (const path of digestMismatchPaths) {
    errors.push({
      code: "geo-map-dependency-closure-incomplete",
      path: "dependencies",
      message: `dependency ${path} sha256 does not match the declared digest`,
    });
  }
  for (const path of undeclaredSourcePaths) {
    errors.push({
      code: "geo-map-dependency-closure-incomplete",
      path: "sources",
      message: `sources reference ${path}, which dependencies[] never declares`,
    });
  }
  if (totalBytes > GEO_MAP_CONSTANTS.dependencyClosureBytesMax) {
    errors.push({
      code: "geo-map-dependency-closure-incomplete",
      path: "dependencies",
      message: `dependency closure is ${totalBytes} B, above the ${GEO_MAP_CONSTANTS.dependencyClosureBytesMax} B budget (C35)`,
    });
  }
  const unresolved =
    missingPaths.length + digestMismatchPaths.length + undeclaredSourcePaths.length;
  const complete = unresolved === 0 && errors.length === 0;
  const everythingMissing =
    declared.length > 0 &&
    missingPaths.length + digestMismatchPaths.length >= declared.length;
  let verdict: GeoMapClosureVerdict;
  if (complete) {
    verdict = "ready";
  } else if (
    everythingMissing ||
    project.basemap.provider === "none" ||
    declared.length === 0
  ) {
    verdict = "invalid";
  } else {
    verdict = "degraded";
  }
  return {
    verdict,
    canSave: verdict === "ready",
    missingPaths,
    digestMismatchPaths,
    undeclaredSourcePaths,
    totalBytes,
    errors,
  };
}

/**
 * Guard for §1.2 / the sandbox CSP: returns the reasons a project would need a
 * network hop. An empty array means every byte is reachable same-origin.
 */
export function auditGeoMapNetworkReach(
  project: GeoMapProject,
): GeoMapValidationError[] {
  const errors: GeoMapValidationError[] = [];
  const remote = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
  for (const [key, source] of Object.entries(project.sources)) {
    if (remote.test(source.dependencyPath)) {
      errors.push({
        code: "geo-map-remote-fetch-forbidden",
        path: `sources.${key}.dependencyPath`,
        message: `sources.${key} points at ${source.dependencyPath}; the editor sandbox runs under connect-src 'none'`,
      });
    }
  }
  for (const [index, dependency] of (project.dependencies ?? []).entries()) {
    if (remote.test(dependency.path)) {
      errors.push({
        code: "geo-map-remote-fetch-forbidden",
        path: `dependencies[${index}].path`,
        message: `dependencies[${index}] points at ${dependency.path}; only same-origin platform routes are permitted`,
      });
    }
  }
  return errors;
}

/** Resolve a declared dependency path onto its same-origin platform route. */
export function geoMapDependencyRoute(
  artifactId: string,
  revisionId: string,
  dependencyPath: string,
): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(dependencyPath)) {
    throw new GeoMapSourceError(
      "geo-map-remote-fetch-forbidden",
      `geo-map 依赖 ${dependencyPath} 不是同源路由。`,
    );
  }
  const [prefix] = GEO_MAP_SAME_ORIGIN_ROUTE_PREFIXES;
  return `${prefix}${encodeURIComponent(artifactId)}/revisions/${encodeURIComponent(
    revisionId,
  )}/dependencies/${dependencyPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

/** Byte budget check used by both the save path and the ingest gate (§5.2). */
export function geoMapSourceBudget(project: GeoMapProject): {
  bytes: number;
  withinBudget: boolean;
  aboveFloor: boolean;
} {
  const bytes = geoMapProjectByteLength(canonicalGeoMapProject(project));
  return {
    bytes,
    withinBudget: bytes <= GEO_MAP_CONSTANTS.sourceBytesMax,
    aboveFloor: bytes >= GEO_MAP_CONSTANTS.sourceBytesMin,
  };
}
