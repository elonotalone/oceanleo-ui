import type {
  EditorAssetPayload,
  EditorDocumentRevision,
  EditorHistorySnapshot,
  EditorProjectManifest,
  EditorRecoverySnapshot,
  EditorToolManifestEntry,
} from "./editor-protocol-types";

export function validAssetUrl(value: unknown): boolean;
export function recordValue(
  value: unknown,
): Record<string, unknown> | null;
export function boundedString(
  value: unknown,
  max: number,
  required?: boolean,
): boolean;
export function boundedRecord(value: unknown, max: number): boolean;
export function validRevision(
  value: unknown,
): value is EditorDocumentRevision;
export function validManifestId(value: unknown): value is string;
export function normalizeEditorHistory(
  value: unknown,
): EditorHistorySnapshot | null;
export function validToolManifest(
  value: unknown,
): value is EditorToolManifestEntry[];
export function validProjectManifest(
  value: unknown,
): value is EditorProjectManifest;
export function isEditorRecoverySnapshot(
  value: unknown,
): value is EditorRecoverySnapshot;
export function validAssetPayload(
  value: unknown,
): value is EditorAssetPayload;
