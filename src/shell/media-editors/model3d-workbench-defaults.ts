import type { LibraryItem } from "../library-data";
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

export function model3DSourceForItem(item: LibraryItem): string {
  const edited = ["three-gltf-editor-v1", "three-gltf-editor-v2"].includes(
    String(item.meta.editor || ""),
  );
  if (edited && item.url) return item.url;
  return (
    (typeof item.meta.model_source_url === "string"
      ? item.meta.model_source_url
      : "") ||
    (typeof item.meta.source_asset_url === "string"
      ? item.meta.source_asset_url
      : "") ||
    item.url ||
    item.previewUrl ||
    ""
  );
}

export function model3DSidecarWithoutSource(
  view: Model3DViewProject,
  annotations = view.annotations,
): Omit<Model3DViewProject, "sourceUrl"> {
  const { sourceUrl: _sourceUrl, ...sidecar } = view;
  return { ...sidecar, annotations };
}
