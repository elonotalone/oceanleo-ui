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
  view: Model3DViewProject;
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
): Model3DProjectRecovery | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const view = normalizeModel3DRecovery(record.view ?? record, fallback);
  if (!view) return null;
  const checkpointUrl =
    typeof record.checkpointUrl === "string" && record.checkpointUrl.trim()
      ? record.checkpointUrl.trim()
      : typeof record.sourceUrl === "string" && record.sourceUrl.trim()
        ? record.sourceUrl.trim()
        : fallbackCheckpointUrl;
  return {
    checkpointUrl,
    operations: normalizeModel3DOperationJournal(record.operations),
    view: { ...view, sourceUrl: checkpointUrl },
  };
}

export async function persistModel3DProject({
  item,
  siteId,
  title,
  checkpointUrl,
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
  glb?: Blob | ArrayBuffer;
  operations: Model3DOperation[];
  checkpointReason?: string;
  thumbUrl?: string;
  view: Omit<Model3DViewProject, "sourceUrl">;
  revision: number;
}): Promise<PersistedEditorVersion> {
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
      format: "glb",
      view: wireView,
      model_dependency_mode: "checkpoint-glb+operation-journal",
      checkpoint_reason: checkpointReason || "journal-only",
      journal_count: journal.length,
    },
    project: {
      schema: MODEL3D_PROJECT_SCHEMA,
      data: {
        checkpointUrl: file ? "" : checkpointUrl,
        operationSchema: MODEL3D_OPERATION_SCHEMA,
        operations: journal,
        view: sidecarView,
      },
    },
  });
  if (!saved.ok) throw new Error(saved.error || "3D checkpoint/sidecar 保存失败");
  return {
    url: saved.url,
    versionId: saved.versionId,
    projectUrl: saved.projectUrl,
    projectSchema: saved.projectSchema,
  };
}
