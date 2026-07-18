export const MODEL3D_OPERATION_SCHEMA: "oceanleo.model3d-operations@1";
export const MODEL3D_CHECKPOINT_OPERATION_LIMIT: 64;
export const MODEL3D_CHECKPOINT_BYTE_LIMIT: number;
export const MODEL3D_JOURNAL_HARD_LIMIT: 256;

export type Model3DOperation =
  | {
      id: string;
      kind: "transform";
      target: string;
      value: Model3DTransformValue;
    }
  | {
      id: string;
      kind: "material";
      target: string;
      materialIndex: number;
      value: Model3DMaterialValue;
    }
  | {
      id: string;
      kind: "texture";
      target: string;
      materialIndex: number;
      slot: Model3DTextureSlot;
      value: string | null;
      requiresCheckpoint: boolean;
    }
  | {
      id: string;
      kind: "camera";
      target: string;
      value: Model3DCameraValue;
    }
  | {
      id: string;
      kind: "light";
      target: string;
      value: Model3DLightValue;
    }
  | {
      id: string;
      kind: "presence";
      target: string;
      parent: string;
      index: number;
      present: boolean;
      object?: Model3DObjectSpec;
    }
  | {
      id: string;
      kind: "visibility";
      target: string;
      visible: boolean;
    };

export type Model3DTextureSlot =
  | "baseColor"
  | "normal"
  | "metallicRoughness"
  | "emissive"
  | "occlusion";
export interface Model3DTransformValue {
  position: number[];
  rotation: number[];
  scale: number[];
}
export interface Model3DMaterialValue {
  color: string;
  metalness: number;
  roughness: number;
}
export interface Model3DCameraValue {
  fov: number;
  zoom: number;
  near: number;
  far: number;
}
export interface Model3DLightValue {
  color: string;
  intensity: number;
  distance: number;
  decay: number;
  angle: number;
  penumbra: number;
}
export interface Model3DObjectSpec {
  kind: "camera" | "directional" | "point" | "spot";
  name: string;
  transform: Model3DTransformValue;
  camera?: Model3DCameraValue;
  light?: Model3DLightValue;
}

export function normalizeModel3DOperation(value: unknown): Model3DOperation | null;
export function normalizeModel3DOperationJournal(value: unknown): Model3DOperation[];
export function model3DJournalByteLength(value: unknown): number;
export function model3DCheckpointReason(
  journal: Model3DOperation[],
  options?: { force?: boolean },
): "" | "forced" | "binary-dependency" | "operation-limit" | "byte-limit";
export function shouldCheckpointModel3DJournal(
  journal: Model3DOperation[],
  options?: { force?: boolean },
): boolean;
export function createModel3DSavePlan(
  journal: Model3DOperation[],
  options?: { force?: boolean },
): {
  checkpointReason:
    | ""
    | "forced"
    | "binary-dependency"
    | "operation-limit"
    | "byte-limit";
  shouldExportGlb: boolean;
  coveredOperationIds: string[];
  persistedOperations: Model3DOperation[];
};
