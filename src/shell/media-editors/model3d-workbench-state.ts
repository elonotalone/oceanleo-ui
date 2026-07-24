import type { RefCallback } from "react";
import type { Model3DArtifactIdentity } from "./model3d-files";
import type { Model3DOperation } from "./model3d-operations.mjs";
import type {
  Model3DSourceFormat,
  Model3DSourceProvenance,
  PersistedModel3DVersion,
} from "./model3d-project";
import type {
  Model3DAnnotation,
} from "./model3d-view";
import type {
  Model3DDirectorCommand,
  Model3DDirectorDocument,
  Model3DPrevisAvailability,
  Model3DPrevisReceipt,
} from "./model3d-director";
import type {
  Model3DAnnotationScreen,
  Model3DMaterialState,
  Model3DSceneNode,
  Model3DSelectionState,
  Model3DTextureSlot,
  Model3DTransformMode,
} from "./model3d-runtime.mjs";

export interface Model3DWorkbenchState {
  canvasRef: RefCallback<HTMLCanvasElement>;
  title: string;
  sourceUrl: string;
  sourceFormat: Model3DSourceFormat;
  sourceProvenance: Model3DSourceProvenance;
  posterUrl: string;
  runtimeReady: boolean;
  modelLoaded: boolean;
  loading: boolean;
  progress: number;
  error: string;
  notice: string;
  savedUrl: string;
  capturing: boolean;
  saving: boolean;
  downloading: boolean;
  directing: boolean;
  dirty: boolean;
  editRevision: number;
  operationJournal: Model3DOperation[];
  operationCount: number;
  operationBytes: number;
  azimuth: number;
  elevation: number;
  zoom: number;
  autoRotate: boolean;
  exposure: number;
  shadowIntensity: number;
  shadowSoftness: number;
  shadowEnabled: boolean;
  background: string;
  environmentUrl: string;
  environmentIntensity: number;
  sceneNodes: Model3DSceneNode[];
  selectedNode: Model3DSelectionState | null;
  transformMode: Model3DTransformMode;
  canUndo: boolean;
  canRedo: boolean;
  animations: string[];
  animationName: string;
  animationPlaying: boolean;
  animationSpeed: number;
  animationTime: number;
  animationDuration: number;
  materials: Model3DMaterialState[];
  selectedMaterialIndex: number;
  annotations: Model3DAnnotation[];
  annotationScreens: Model3DAnnotationScreen[];
  selectedAnnotationId: string;
  annotationDraft: string;
  annotationPlacementArmed: boolean;
  director: Readonly<Model3DDirectorDocument>;
  directorPrevisReceipt: Readonly<Model3DPrevisReceipt> | null;
  directorDepthOfFieldAvailability: Readonly<Model3DPrevisAvailability>;
  directorScreenshotAvailability: Readonly<Model3DPrevisAvailability>;
  directorPlayblastAvailability: Readonly<Model3DPrevisAvailability>;
  selectNode: (id: string) => void;
  setTransformMode: (mode: Model3DTransformMode) => void;
  beginGesture: (controlId: string) => void;
  commitGesture: () => void;
  cancelGesture: () => void;
  patchSelectedTransform: (patch: {
    position?: number[];
    rotation?: number[];
    scale?: number[];
  }) => void;
  setSelectedNodeVisible: (visible: boolean) => void;
  deleteSelectedNode: () => void;
  addCamera: () => void;
  addLight: (kind: "directional" | "point" | "spot") => void;
  patchSelectedCamera: (patch: {
    fov?: number;
    zoom?: number;
    near?: number;
    far?: number;
  }) => void;
  patchSelectedLight: (patch: {
    color?: string;
    intensity?: number;
    distance?: number;
    decay?: number;
    angle?: number;
    penumbra?: number;
  }) => void;
  undo: () => void;
  redo: () => void;
  setOrbit: (azimuth: number, elevation: number) => void;
  setZoom: (distancePercent: number) => void;
  resetCamera: () => void;
  setAutoRotate: (enabled: boolean) => void;
  setExposure: (value: number) => void;
  setShadowIntensity: (value: number) => void;
  setShadowSoftness: (value: number) => void;
  setShadowEnabled: (value: boolean) => void;
  setBackground: (value: string) => void;
  selectAnimation: (name: string) => void;
  setAnimationPlaying: (playing: boolean) => void;
  setAnimationSpeed: (value: number) => void;
  setAnimationTime: (value: number) => void;
  setEnvironmentUrl: (value: string) => void;
  setEnvironmentIntensity: (value: number) => void;
  selectMaterial: (index: number) => void;
  setMaterialColor: (value: string) => void;
  setMaterialMetallic: (value: number) => void;
  setMaterialRoughness: (value: number) => void;
  replaceMaterialTexture: (
    slot: Model3DTextureSlot,
    file: File,
  ) => Promise<void>;
  clearMaterialTexture: (slot: Model3DTextureSlot) => void;
  selectAnnotation: (id: string) => void;
  setAnnotationDraft: (value: string) => void;
  beginAnnotationPlacement: () => void;
  updateSelectedAnnotation: (patch: Partial<Model3DAnnotation>) => void;
  deleteSelectedAnnotation: () => void;
  dispatchDirectorCommand: (command: Model3DDirectorCommand) => void;
  captureDirectorScreenshot: () => Promise<Readonly<Model3DPrevisReceipt>>;
  captureDirectorPlayblast: () => Promise<Readonly<Model3DPrevisReceipt>>;
  cancelDirectorPrevis: () => void;
  importModel: (file: File) => Promise<void>;
  openModelUrl: (
    url: string,
    format?: Model3DSourceFormat,
    identity?: Model3DArtifactIdentity | null,
  ) => void;
  downloadScreenshot: () => Promise<void>;
  saveScreenshot: () => Promise<void>;
  downloadModel: () => Promise<void>;
  saveCopy: () => Promise<PersistedModel3DVersion | null>;
  restoreRecovery: (payload: unknown) => boolean;
}
