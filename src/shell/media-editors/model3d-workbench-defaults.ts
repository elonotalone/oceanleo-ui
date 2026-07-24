import { threeDSubtypeFor, type LibraryItem } from "../library-data";
import { createModel3DDirectorDocument } from "./model3d-director";
import type { Model3DViewProject } from "./model3d-project";
import type { Model3DRuntimeSnapshot } from "./model3d-runtime.mjs";

export const DEFAULT_MODEL3D_VIEW: Model3DViewProject = {
  sourceUrl: "",
  azimuth: 35,
  elevation: 65,
  zoom: 110,
  autoRotate: false,
  exposure: 1,
  shadowIntensity: 1,
  shadowSoftness: 1,
  shadowEnabled: true,
  background: "#f5f5f4",
  animationName: "",
  animationPlaying: false,
  animationSpeed: 1,
  animationTime: 0,
  environmentUrl: "",
  environmentIntensity: 1,
  materialOverrides: [],
  annotations: [],
  director: createModel3DDirectorDocument(),
};

export const EMPTY_MODEL3D_RUNTIME: Model3DRuntimeSnapshot = {
  loaded: false,
  nodes: [],
  selection: null,
  transformAttached: false,
  transformMode: "translate",
  animations: [],
  animationName: "",
  animationPlaying: false,
  animationSpeed: 1,
  animationTime: 0,
  animationDuration: 0,
  annotationPlacementArmed: false,
  history: {
    canUndo: false,
    canRedo: false,
    undoLabel: "",
    redoLabel: "",
  },
  operationJournal: [],
  operationCount: 0,
  operationBytes: 2,
  view: DEFAULT_MODEL3D_VIEW,
};

export function isModel3DSourceItem(item: LibraryItem): boolean {
  const subtype = threeDSubtypeFor(item);
  if (subtype === "model") return true;
  if (subtype === "hdri" || subtype === "texture") return false;
  const format = String(item.meta.format || "").toLowerCase();
  const mime = String(item.meta.mime || "").toLowerCase();
  return (
    ["glb", "gltf"].includes(format) ||
    mime === "model/gltf-binary" ||
    mime === "model/gltf+json"
  );
}

export function model3DSourceForItem(item: LibraryItem): string {
  if (!isModel3DSourceItem(item)) return "";
  const edited = ["three-gltf-editor-v1", "three-gltf-editor-v2"].includes(
    String(item.meta.editor || ""),
  );
  if (edited && item.url) return item.url;
  return (
    (typeof item.meta.model_source_url === "string"
      ? item.meta.model_source_url
      : "") ||
    (typeof item.meta.editor_source_url === "string"
      ? item.meta.editor_source_url
      : "") ||
    (typeof item.meta.source_url === "string"
      ? item.meta.source_url
      : "") ||
    (typeof item.meta.source_asset_url === "string"
      ? item.meta.source_asset_url
      : "") ||
    item.url ||
    item.previewUrl ||
    ""
  );
}

function isDisplayableModelPoster(url: string, mediaType: unknown): boolean {
  if (!url || /\.(?:glb|gltf)(?:$|[?#])/i.test(url)) return false;
  const mime = String(mediaType || "").trim().toLowerCase().split(";", 1)[0];
  return (
    mime.startsWith("image/") ||
    url.startsWith("data:image/") ||
    /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(url)
  );
}

/**
 * Stable handoff for cards and the editor loading state. It never presents a
 * GLB/glTF entrypoint as an image and prefers the durable rendered poster.
 */
export function model3DPosterForItem(item: LibraryItem): string {
  const generated =
    typeof item.meta.model_poster_url === "string"
      ? item.meta.model_poster_url.trim()
      : "";
  if (isDisplayableModelPoster(generated, "image/png")) return generated;
  const thumbnail = item.thumbUrl || "";
  if (
    isDisplayableModelPoster(thumbnail, item.meta.thumbnail_media_type)
  ) return thumbnail;
  const preview = item.previewUrl || "";
  if (isDisplayableModelPoster(preview, item.meta.preview_media_type)) {
    return preview;
  }
  return "";
}

export function model3DSidecarWithoutSource(
  view: Model3DViewProject,
  annotations = view.annotations,
): Omit<Model3DViewProject, "sourceUrl"> {
  const { sourceUrl: _sourceUrl, ...sidecar } = view;
  return { ...sidecar, annotations };
}
