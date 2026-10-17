import { normalizeImageEditorSnapshot } from "../shell/image-editor/image-document-contract";
import type { EditorAssetManifestV1 } from "./asset-manifest";
import { EDITOR_ASSET_MANIFEST_SCHEMA } from "./asset-manifest";

export const FABRIC_IMAGE_SCHEMA = "oceanleo.fabric-image.v1" as const;
export const FABRIC_IMAGE_CORE = "fabric@6.9.1";

export const FABRIC_IMAGE_MANIFEST: EditorAssetManifestV1 = Object.freeze({
  schema: EDITOR_ASSET_MANIFEST_SCHEMA,
  editorId: "image",
  localEntry: "/harness/fabric-image.html",
  version: "6.9.1",
  hash: "sha256:fabric-6.9.1-local-entry",
  license: "MIT",
  actions: Object.freeze([
    "load",
    "mutate",
    "save",
    "reopen",
    "export",
    "undo",
    "redo",
  ]),
  nativeCapabilities: Object.freeze([]),
});

export function parseFabricImageProject(value: unknown): {
  schema: typeof FABRIC_IMAGE_SCHEMA;
  version: 1;
  updatedAt: string;
  snapshot: NonNullable<ReturnType<typeof normalizeImageEditorSnapshot>>;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as {
    schema?: unknown;
    version?: unknown;
    updatedAt?: unknown;
    snapshot?: unknown;
    data?: unknown;
  };
  if (record.schema !== FABRIC_IMAGE_SCHEMA) return null;
  if (record.version != null && record.version !== 1) return null;
  const snapshot = normalizeImageEditorSnapshot(record.snapshot ?? record.data);
  if (!snapshot) return null;
  return {
    schema: FABRIC_IMAGE_SCHEMA,
    version: 1,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
    snapshot,
  };
}
