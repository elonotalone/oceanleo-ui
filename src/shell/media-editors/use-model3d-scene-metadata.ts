/**
 * Compatibility export for callers compiled against the short-lived
 * model-viewer metadata hook. The active implementation now owns annotations
 * and viewer-only state independently from the editable Three.js GLB scene.
 */
export {
  useModel3DSidecar,
  useModel3DSidecar as useModel3DSceneMetadata,
} from "./use-model3d-sidecar";
