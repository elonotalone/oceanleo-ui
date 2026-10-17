export {
  EDITOR_SESSION_PROTOCOL,
  MAX_EDITOR_SESSION_BYTES,
  type EditorSessionEditorToHostType,
  type EditorSessionHostToEditorType,
  type EditorSessionOpen,
  type EditorSessionSave,
  type EditorSessionSaveAck,
} from "./editor-session-v1";
export {
  EDITOR_ASSET_MANIFEST_SCHEMA,
  isForbiddenRemoteEditorEntry,
  type EditorAssetManifestV1,
} from "./asset-manifest";
export {
  FABRIC_IMAGE_CORE,
  FABRIC_IMAGE_MANIFEST,
  FABRIC_IMAGE_SCHEMA,
  parseFabricImageProject,
} from "./fabric-image";
export {
  CLIENT_EDITOR_ADAPTERS,
  type ClientEditorAdapterRecord,
  type EditorLocalizationStatus,
} from "./registry";
