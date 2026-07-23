import type { Model3DOperation } from "./model3d-operations.mjs";

export type Model3DTransformMode = "translate" | "rotate" | "scale";
export type Model3DTextureSlot =
  | "baseColor"
  | "normal"
  | "metallicRoughness"
  | "emissive"
  | "occlusion";

export interface Model3DViewState {
  azimuth: number;
  elevation: number;
  zoom: number;
  autoRotate: boolean;
  exposure: number;
  background: string;
  environmentUrl: string;
  environmentIntensity: number;
  shadowEnabled: boolean;
  shadowIntensity: number;
  shadowSoftness: number;
}

export interface Model3DSceneNode {
  id: string;
  parentId: string;
  path: string;
  depth: number;
  name: string;
  kind: string;
  type: string;
  visible: boolean;
  selectable: boolean;
  childCount: number;
}

export interface Model3DMaterialState {
  index: number;
  name: string;
  selected: boolean;
  color: string;
  metalness: number;
  roughness: number;
  textures: Record<Model3DTextureSlot, string>;
}

export interface Model3DSelectionState {
  id: string;
  path: string;
  name: string;
  type: string;
  visible: boolean;
  transform: {
    position: number[];
    rotation: number[];
    scale: number[];
  };
  materials: Model3DMaterialState[];
  camera?: {
    projection: "perspective" | "orthographic";
    fov?: number;
    zoom?: number;
    near: number;
    far: number;
  };
  light?: {
    kind: string;
    color: string;
    intensity: number;
    distance: number;
    decay: number;
    angle: number;
    penumbra: number;
  };
}

export interface Model3DRuntimeSnapshot {
  loaded: boolean;
  nodes: Model3DSceneNode[];
  selection: Model3DSelectionState | null;
  transformAttached: boolean;
  transformMode: Model3DTransformMode;
  animations: Array<{ name: string; duration: number }>;
  animationName: string;
  animationPlaying: boolean;
  animationSpeed: number;
  animationTime: number;
  animationDuration: number;
  annotationPlacementArmed: boolean;
  history: {
    canUndo: boolean;
    canRedo: boolean;
    undoLabel: string;
    redoLabel: string;
  };
  operationJournal: Model3DOperation[];
  operationCount: number;
  operationBytes: number;
  view: Model3DViewState;
}

export interface Model3DAnnotationPoint {
  position: number[];
  normal: number[];
  nodePath: string;
}

export interface Model3DAnnotationScreen {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface Model3DRuntimeOptions {
  onSnapshot?: (snapshot: Model3DRuntimeSnapshot) => void;
  onSceneEdited?: (operation: Model3DOperation | null) => void;
  onViewChange?: (view: Model3DViewState) => void;
  onViewCommit?: (view: Model3DViewState) => void;
  onAnnotationPoint?: (point: Model3DAnnotationPoint) => void;
  onAnnotationFrame?: (entries: Model3DAnnotationScreen[]) => void;
  onError?: (message: string) => void;
  resolveAssetUrl?: (url: string) => string;
}

export class Model3DSceneRuntime {
  constructor(canvas: HTMLCanvasElement, options?: Model3DRuntimeOptions);
  readonly gestureActive: boolean;
  loadUrl(
    url: string,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<void>;
  loadArrayBuffer(
    source: Blob | ArrayBuffer | ArrayBufferView,
  ): Promise<void>;
  cancelLoad(): void;
  clear(): void;
  exportGlb(): Promise<ArrayBuffer>;
  getOperationJournal(): Model3DOperation[];
  applyOperationJournal(value: unknown): Promise<number>;
  commitCheckpoint(coveredOperationIds?: string[]): void;
  capturePng(): Promise<Blob>;
  setSelectedNode(id: string): void;
  setTransformMode(mode: Model3DTransformMode): void;
  beginGesture(controlId: string): boolean;
  commitGesture(): boolean;
  cancelGesture(): boolean;
  patchSelectedTransform(patch: {
    position?: number[];
    rotation?: number[];
    scale?: number[];
  }): void;
  selectMaterialSlot(index: number): void;
  patchSelectedMaterial(patch: {
    color?: string;
    metalness?: number;
    roughness?: number;
  }): void;
  replaceSelectedTexture(
    slot: Model3DTextureSlot,
    url: string,
  ): Promise<void>;
  clearSelectedTexture(slot: Model3DTextureSlot): void;
  patchSelectedCamera(patch: {
    fov?: number;
    zoom?: number;
    near?: number;
    far?: number;
  }): void;
  patchSelectedLight(patch: {
    color?: string;
    intensity?: number;
    distance?: number;
    decay?: number;
    angle?: number;
    penumbra?: number;
  }): void;
  addCamera(): void;
  addLight(kind: "directional" | "point" | "spot"): void;
  deleteSelected(): void;
  setNodeVisible(visible: boolean): void;
  undo(): boolean;
  redo(): boolean;
  selectAnimation(name: string, commit?: boolean): void;
  setAnimationPlaying(playing: boolean): void;
  setAnimationSpeed(speed: number): void;
  setAnimationTime(time: number): void;
  setView(
    patch: Partial<Model3DViewState>,
    options?: { emit?: boolean },
  ): void;
  armAnnotationPlacement(armed?: boolean): void;
  setAnnotations(
    annotations: Array<{ id: string; x: number; y: number; z: number }>,
  ): void;
  applyLegacyMaterialOverrides(
    overrides: Array<{
      index: number;
      color: string;
      metallic: number;
      roughness: number;
    }>,
  ): void;
  resize(): void;
  dispose(): void;
}

export const TEXTURE_SLOTS: Readonly<
  Record<Model3DTextureSlot, readonly string[]>
>;
