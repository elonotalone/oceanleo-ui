export {
  buildLibraryItems,
  inferLibraryKind,
  libraryContentDescriptor,
  libraryItemMatches,
  normalizeArtifact,
  normalizeEditorManifest,
  normalizeWork,
  threeDSubtypeFor,
} from "../shell/library-data";
export type {
  EditorCapabilityName,
  EditorManifestV1,
  LibraryArtifactRow,
  LibraryContentDescriptor,
  LibraryItem,
  LibraryKind,
  ThreeDSubtype,
} from "../shell/library-data";
export {
  WorkspaceLibrary,
  WorkspaceLibraryEntryViewer,
  workspaceEntryFromLibraryItem,
} from "../shell/WorkspaceLibrary";
export type {
  WorkspaceLibraryEntry,
  WorkspaceLibraryProps,
} from "../shell/WorkspaceLibrary";
export {
  WORKSPACE_KIND_LABELS,
  filterWorkspaceLibraryEntries,
  visibleWorkspaceLibraryCategories,
  workspaceLibraryCategories,
} from "../shell/workspace-library-model";
export type {
  WorkspaceLibraryCategory,
} from "../shell/workspace-library-model";
export {
  MaterialLibrary,
  platformToEntry,
} from "../shell/MaterialLibrary";
export type {
  MaterialItem,
  MaterialLibraryProps,
  PlatformAsset,
} from "../shell/MaterialLibrary";
export {
  MATERIAL_TAXONOMY_LABEL,
  artifactEntry,
  materialToEntry,
  mergeMaterialEntries,
  normalizedMaterialTaxonomy,
  queryMaterialLibrary,
} from "../shell/material-library-controller";
export type {
  MaterialLibraryLevel,
} from "../shell/material-library-controller";
export {
  LibraryItemViewer,
  LibraryKindIcon,
  libraryKindLabel,
} from "../shell/library-viewers";
