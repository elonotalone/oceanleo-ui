"use client";

import type { LibraryItem } from "../library-data";
import {
  saveProjectWorkingHead,
  type PersistedEditorVersion,
} from "../doc-editors/doc-io";

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
  animationSpeed: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

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
    azimuth: clamp(Number(value.azimuth ?? fallback.azimuth), -720, 720),
    elevation: clamp(Number(value.elevation ?? fallback.elevation), -89, 89),
    zoom: clamp(Number(value.zoom ?? fallback.zoom), 50, 300),
    autoRotate: Boolean(value.autoRotate),
    exposure: clamp(Number(value.exposure ?? fallback.exposure), 0.1, 2),
    shadowIntensity: clamp(
      Number(value.shadowIntensity ?? fallback.shadowIntensity),
      0,
      2,
    ),
    shadowSoftness: clamp(
      Number(value.shadowSoftness ?? fallback.shadowSoftness),
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
    animationSpeed: clamp(
      Number(value.animationSpeed ?? fallback.animationSpeed),
      0.1,
      3,
    ),
  };
}

export async function persistModel3DProject({
  item,
  siteId,
  title,
  sourceUrl,
  thumbUrl,
  view,
  revision,
}: {
  item: LibraryItem;
  siteId: string;
  title: string;
  sourceUrl: string;
  thumbUrl?: string;
  view: Omit<Model3DViewProject, "sourceUrl">;
  revision: number;
}): Promise<PersistedEditorVersion> {
  const wireView = {
    camera_orbit: `${view.azimuth}deg ${view.elevation}deg ${view.zoom}%`,
    auto_rotate: view.autoRotate,
    exposure: view.exposure,
    shadow_intensity: view.shadowIntensity,
    shadow_softness: view.shadowSoftness,
    background: view.background,
    animation: view.animationName,
    animation_speed: view.animationSpeed,
  };
  const saved = await saveProjectWorkingHead({
    item,
    siteId,
    fallbackSite: "threed",
    title,
    mediaType: "model3d",
    kind: "model3d",
    idempotencyKey: `model3d:${item.id}:${revision}`,
    workingHeadUrl: sourceUrl,
    thumbUrl,
    meta: {
      editor: "model-viewer-native-v1",
      view: wireView,
      model_source_url: sourceUrl,
      model_dependency_mode: "preserved-source-closure",
    },
    project: {
      schema: "oceanleo.model-view@1",
      data: { view, sourceUrl },
    },
  });
  if (!saved.ok) throw new Error(saved.error || "3D 副本登记到我的库失败");
  return {
    url: saved.url,
    versionId: saved.versionId,
    projectUrl: saved.projectUrl,
    projectSchema: saved.projectSchema,
  };
}
