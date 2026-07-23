"use client";

import type { LibraryItem } from "../library-data";
import {
  saveFileToLibrary,
  type PersistedEditorVersion,
} from "../doc-editors/doc-io";
import {
  normalizeModel3DAnnotations,
  normalizeModel3DEnvironmentUrl,
  normalizeModel3DMaterialOverrides,
  type Model3DAnnotation,
  type Model3DMaterialOverride,
} from "./model3d-view";
import {
  MODEL3D_OPERATION_SCHEMA,
  normalizeModel3DOperationJournal,
  type Model3DOperation,
} from "./model3d-operations.mjs";

export const MODEL3D_PROJECT_SCHEMA = "oceanleo.three-editor@2";
export const LEGACY_MODEL3D_PROJECT_SCHEMA = "oceanleo.three-editor@1";

export type Model3DSourceFormat = "" | "glb" | "gltf";

export interface Model3DSourceProvenance {
  sourceUrl: string;
  dependencyBaseUrl: string;
  format: Model3DSourceFormat;
  identity: string;
}

export interface PersistedModel3DVersion extends PersistedEditorVersion {
  sourceFormat: Model3DSourceFormat;
  sourceProvenance: Model3DSourceProvenance;
}

export interface Model3DViewProject {
  sourceUrl: string;
  azimuth: number;
  elevation: number;
  zoom: number;
  autoRotate: boolean;
  exposure: number;
  shadowIntensity: number;
  shadowSoftness: number;
  background: string;
  animationName: string;
  animationPlaying: boolean;
  animationSpeed: number;
  animationTime: number;
  environmentUrl: string;
  environmentIntensity: number;
  shadowEnabled: boolean;
  /** Legacy model-viewer sidecar values, applied once before the next GLB save. */
  materialOverrides: Model3DMaterialOverride[];
  annotations: Model3DAnnotation[];
}

export interface Model3DProjectRecovery {
  checkpointUrl: string;
  operations: Model3DOperation[];
  provenance: Model3DSourceProvenance;
  view: Model3DViewProject;
}

const VOLATILE_SOURCE_QUERY =
  /^(?:x-(?:amz|oss|goog)-|sig(?:nature)?$|token$|auth$|expires?$|expiry$|expires_at$|exp$|se$|sp$|sv$|st$|skoid$|sktid$|skt$|ske$|sks$|skv$)/i;

function model3DFormat(value: unknown, url = ""): Model3DSourceFormat {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "glb" || normalized === "gltf") return normalized;
  try {
    const pathname = new URL(url, "https://oceanleo.invalid").pathname;
    if (/\.gltf$/i.test(pathname)) return "gltf";
    if (/\.glb$/i.test(pathname)) return "glb";
  } catch {
    // A runtime signature check remains authoritative for opaque URLs.
  }
  return "";
}

export function model3DSourceIdentity(value: string): string {
  const source = String(value || "").trim();
  if (!source) return "";
  try {
    const parsed = new URL(source, "https://oceanleo.invalid");
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (VOLATILE_SOURCE_QUERY.test(key)) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    return parsed.origin === "https://oceanleo.invalid"
      ? `${parsed.pathname}${parsed.search}`
      : parsed.href;
  } catch {
    return source.replace(/#.*$/, "");
  }
}

function signedExpiry(value: string): number | null {
  try {
    const parsed = new URL(value, "https://oceanleo.invalid");
    let signedDate = "";
    let signedLifetime = "";
    for (const [key, entry] of parsed.searchParams) {
      if (/^x-(?:amz|goog)-date$/i.test(key)) signedDate = entry;
      if (/^x-(?:amz|goog)-expires$/i.test(key)) signedLifetime = entry;
    }
    const signedMatch = signedDate.match(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
    );
    if (signedMatch && /^\d+$/.test(signedLifetime)) {
      const issuedAt = Date.UTC(
        Number(signedMatch[1]),
        Number(signedMatch[2]) - 1,
        Number(signedMatch[3]),
        Number(signedMatch[4]),
        Number(signedMatch[5]),
        Number(signedMatch[6]),
      );
      return issuedAt + Number(signedLifetime) * 1_000;
    }
    for (const [key, entry] of parsed.searchParams) {
      if (!/^(?:expires?|expiry|expires_at|exp|se)$/i.test(key)) continue;
      if (/^\d+$/.test(entry)) {
        const numeric = Number(entry);
        return numeric >= 1_000_000_000_000 ? numeric : numeric * 1_000;
      }
      const parsedDate = Date.parse(entry);
      if (Number.isFinite(parsedDate)) return parsedDate;
    }
  } catch {
    // Invalid URLs are rejected later by the source loader.
  }
  return null;
}

export function isExpiredModel3DSourceUrl(
  value: string,
  now = Date.now(),
): boolean {
  const expiresAt = signedExpiry(value);
  return expiresAt !== null && expiresAt <= now;
}

export function resolveModel3DCheckpointUrl(
  savedUrl: string,
  refreshedUrl: string,
  now = Date.now(),
): string {
  const saved = String(savedUrl || "").trim();
  const refreshed = String(refreshedUrl || "").trim();
  if (!saved) return refreshed;
  if (!refreshed) return saved;
  const sameSource =
    model3DSourceIdentity(saved) === model3DSourceIdentity(refreshed);
  const savedExpired = isExpiredModel3DSourceUrl(saved, now);
  const refreshedExpired = isExpiredModel3DSourceUrl(refreshed, now);
  if (sameSource && savedExpired && !refreshedExpired) return refreshed;
  if (sameSource && !savedExpired && refreshedExpired) return saved;
  if (sameSource && savedExpired && refreshedExpired) return saved;
  if (saved !== refreshed && sameSource) {
    return refreshed;
  }
  return saved;
}

export function normalizeModel3DSourceProvenance(
  value: unknown,
  fallbackUrl = "",
  fallbackFormat: Model3DSourceFormat = "",
): Model3DSourceProvenance {
  const record =
    value && typeof value === "object"
      ? value as Record<string, unknown>
      : {};
  const sourceUrl =
    typeof record.sourceUrl === "string" && record.sourceUrl.trim()
      ? record.sourceUrl.trim()
      : fallbackUrl;
  const dependencyBaseUrl =
    typeof record.dependencyBaseUrl === "string" &&
      record.dependencyBaseUrl.trim()
      ? record.dependencyBaseUrl.trim()
      : sourceUrl;
  const format = model3DFormat(record.format ?? fallbackFormat, sourceUrl);
  return {
    sourceUrl,
    dependencyBaseUrl,
    format,
    identity:
      typeof record.identity === "string" && record.identity.trim()
        ? record.identity.trim()
        : model3DSourceIdentity(sourceUrl),
  };
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const finite = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const numeric = Number(value);
  return clamp(Number.isFinite(numeric) ? numeric : fallback, minimum, maximum);
};

export function normalizeModel3DRecovery(
  payload: unknown,
  fallback: Model3DViewProject,
): Model3DViewProject | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Partial<Record<keyof Model3DViewProject, unknown>>;
  return {
    sourceUrl:
      typeof value.sourceUrl === "string"
        ? value.sourceUrl
        : fallback.sourceUrl,
    azimuth: finite(value.azimuth, fallback.azimuth, -180, 180),
    elevation: finite(value.elevation, fallback.elevation, 0, 180),
    zoom: finite(value.zoom, fallback.zoom, 20, 500),
    autoRotate:
      typeof value.autoRotate === "boolean"
        ? value.autoRotate
        : fallback.autoRotate,
    exposure: finite(value.exposure, fallback.exposure, 0.1, 4),
    shadowIntensity: finite(
      value.shadowIntensity,
      fallback.shadowIntensity,
      0,
      2,
    ),
    shadowSoftness: finite(
      value.shadowSoftness,
      fallback.shadowSoftness,
      0,
      1,
    ),
    background:
      typeof value.background === "string"
        ? value.background
        : fallback.background,
    animationName:
      typeof value.animationName === "string"
        ? value.animationName
        : fallback.animationName,
    animationPlaying:
      typeof value.animationPlaying === "boolean"
        ? value.animationPlaying
        : fallback.animationPlaying,
    animationSpeed: finite(
      value.animationSpeed,
      fallback.animationSpeed,
      0.1,
      4,
    ),
    animationTime: finite(
      value.animationTime,
      fallback.animationTime,
      0,
      86_400,
    ),
    environmentUrl: normalizeModel3DEnvironmentUrl(
      value.environmentUrl ?? fallback.environmentUrl,
    ),
    environmentIntensity: finite(
      value.environmentIntensity,
      fallback.environmentIntensity,
      0,
      5,
    ),
    shadowEnabled:
      typeof value.shadowEnabled === "boolean"
        ? value.shadowEnabled
        : fallback.shadowEnabled,
    materialOverrides: normalizeModel3DMaterialOverrides(
      value.materialOverrides ?? fallback.materialOverrides,
    ),
    annotations: normalizeModel3DAnnotations(
      value.annotations ?? fallback.annotations,
    ),
  };
}

export function normalizeModel3DProjectRecovery(
  payload: unknown,
  fallback: Model3DViewProject,
  fallbackCheckpointUrl: string,
  now = Date.now(),
): Model3DProjectRecovery | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const view = normalizeModel3DRecovery(record.view ?? record, fallback);
  if (!view) return null;
  const savedCheckpointUrl =
    typeof record.checkpointUrl === "string" && record.checkpointUrl.trim()
      ? record.checkpointUrl.trim()
      : typeof record.sourceUrl === "string" && record.sourceUrl.trim()
        ? record.sourceUrl.trim()
        : "";
  const checkpointUrl = resolveModel3DCheckpointUrl(
    savedCheckpointUrl,
    fallbackCheckpointUrl,
    now,
  );
  const rawProvenance =
    record.provenance ?? record.sourceProvenance ?? {
      sourceUrl: savedCheckpointUrl,
      format: record.sourceFormat,
    };
  const provenance = normalizeModel3DSourceProvenance(
    rawProvenance,
    checkpointUrl,
    model3DFormat(record.sourceFormat, checkpointUrl),
  );
  const checkpointChanged = checkpointUrl !== savedCheckpointUrl;
  const dependencyTracksCheckpoint =
    model3DSourceIdentity(provenance.dependencyBaseUrl) ===
    model3DSourceIdentity(provenance.sourceUrl || savedCheckpointUrl);
  const recoveredProvenance = {
    ...provenance,
    sourceUrl: checkpointUrl,
    dependencyBaseUrl:
      checkpointChanged && dependencyTracksCheckpoint
        ? checkpointUrl
        : provenance.dependencyBaseUrl || checkpointUrl,
    identity: model3DSourceIdentity(checkpointUrl),
  };
  return {
    checkpointUrl,
    operations: normalizeModel3DOperationJournal(record.operations),
    provenance: recoveredProvenance,
    view: { ...view, sourceUrl: checkpointUrl },
  };
}

export async function persistModel3DProject({
  item,
  siteId,
  title,
  checkpointUrl,
  sourceProvenance,
  glb,
  operations,
  checkpointReason,
  thumbUrl,
  view,
  revision,
}: {
  item: LibraryItem;
  siteId: string;
  title: string;
  checkpointUrl: string;
  sourceProvenance: Model3DSourceProvenance;
  glb?: Blob | ArrayBuffer;
  operations: Model3DOperation[];
  checkpointReason?: string;
  thumbUrl?: string;
  view: Omit<Model3DViewProject, "sourceUrl">;
  revision: number;
}): Promise<PersistedModel3DVersion> {
  const {
    materialOverrides: _legacyMaterialOverrides,
    ...sidecarView
  } = view;
  const wireView = {
    camera_orbit: `${view.azimuth}deg ${view.elevation}deg ${view.zoom}%`,
    auto_rotate: view.autoRotate,
    exposure: view.exposure,
    shadow_intensity: view.shadowIntensity,
    shadow_softness: view.shadowSoftness,
    background: view.background,
    animation: view.animationName,
    animation_playing: view.animationPlaying,
    animation_speed: view.animationSpeed,
    animation_time: view.animationTime,
    environment_url: view.environmentUrl,
    environment_intensity: view.environmentIntensity,
    shadow_enabled: view.shadowEnabled,
    annotations: view.annotations,
  };
  const journal = normalizeModel3DOperationJournal(operations);
  const binary = glb
    ? glb instanceof Blob
      ? glb
      : new Blob([glb], { type: "model/gltf-binary" })
    : null;
  const normalizedProvenance = normalizeModel3DSourceProvenance(
    sourceProvenance,
    checkpointUrl,
  );
  const sourceFormat: Model3DSourceFormat = binary
    ? "glb"
    : normalizedProvenance.format ||
      model3DFormat(undefined, checkpointUrl);
  const projectProvenance: Model3DSourceProvenance = binary
    ? {
        sourceUrl: "",
        dependencyBaseUrl: "",
        format: "glb",
        identity: "",
      }
    : {
        ...normalizedProvenance,
        sourceUrl: checkpointUrl,
        identity: model3DSourceIdentity(checkpointUrl),
      };
  const file = binary
    ? new File([binary], `${title}.glb`, { type: "model/gltf-binary" })
    : undefined;
  const saved = await saveFileToLibrary({
    item,
    siteId,
    fallbackSite: "threed",
    file,
    deliveryUrl: file ? undefined : checkpointUrl,
    title,
    mediaType: "model3d",
    kind: "model3d",
    idempotencyKey: `model3d:${item.id}:${revision}`,
    thumbUrl,
    meta: {
      editor: "three-gltf-editor-v2",
      format: sourceFormat || "glb",
      mime:
        sourceFormat === "gltf"
          ? "model/gltf+json"
          : "model/gltf-binary",
      model_source_url: file ? "" : checkpointUrl,
      model_dependency_base_url: projectProvenance.dependencyBaseUrl,
      model_source_identity: projectProvenance.identity,
      view: wireView,
      model_dependency_mode: "checkpoint-glb+operation-journal",
      checkpoint_reason: checkpointReason || "journal-only",
      journal_count: journal.length,
    },
    project: {
      schema: MODEL3D_PROJECT_SCHEMA,
      data: {
        checkpointUrl: file ? "" : checkpointUrl,
        sourceFormat,
        provenance: projectProvenance,
        operationSchema: MODEL3D_OPERATION_SCHEMA,
        operations: journal,
        view: sidecarView,
      },
    },
  });
  if (!saved.ok) throw new Error(saved.error || "3D checkpoint/sidecar 保存失败");
  const persistedProvenance = normalizeModel3DSourceProvenance(
    binary
      ? {
          sourceUrl: saved.url,
          dependencyBaseUrl: saved.url,
          format: "glb",
        }
      : projectProvenance,
    saved.url,
    sourceFormat,
  );
  return {
    url: saved.url,
    versionId: saved.versionId,
    projectUrl: saved.projectUrl,
    projectSchema: saved.projectSchema,
    sourceFormat,
    sourceProvenance: persistedProvenance,
  };
}
