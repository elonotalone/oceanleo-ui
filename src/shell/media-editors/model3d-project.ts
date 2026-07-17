"use client";

import { fetchMediaBlob } from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";
import {
  saveFileToLibrary,
  type PersistedEditorVersion,
} from "../doc-editors/doc-io";
import { modelExtension } from "./model3d-files";

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
  filename,
  thumbUrl,
  view,
  revision,
  maxBytes,
}: {
  item: LibraryItem;
  siteId: string;
  title: string;
  sourceUrl: string;
  filename: string;
  thumbUrl?: string;
  view: Omit<Model3DViewProject, "sourceUrl">;
  revision: number;
  maxBytes: number;
}): Promise<PersistedEditorVersion> {
  const extension = modelExtension(sourceUrl, item.title);
  // A .gltf JSON file is not a model by itself: relative .bin/textures form one
  // dependency closure. Re-uploading only the JSON creates a URL that appears
  // saved but cannot reopen. Keep the already-loaded durable source closure;
  // self-contained GLB can still be copied into an immutable version.
  const preserveDependencyClosure = extension === "gltf";
  const modelBlob = preserveDependencyClosure
    ? null
    : await fetchMediaBlob(sourceUrl, { maxBytes });
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
  const saved = await saveFileToLibrary({
    item,
    siteId,
    fallbackSite: "threed",
    ...(modelBlob
      ? {
          file: new File([modelBlob], filename, {
            type: modelBlob.type || "model/gltf-binary",
          }),
        }
      : { deliveryUrl: sourceUrl }),
    title,
    mediaType: "model3d",
    kind: "model3d",
    idempotencyKey: `model3d:${item.id}:${revision}`,
    thumbUrl,
    meta: {
      editor: "model-viewer-native-v1",
      view: wireView,
      model_source_url: sourceUrl,
      model_dependency_mode: preserveDependencyClosure
        ? "preserved-gltf-closure"
        : "self-contained-glb",
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
