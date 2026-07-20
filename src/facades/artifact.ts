export * from "../shell/artifact-contract";
export {
  bindArtifactToContext,
  createArtifactRevision,
  ensureArtifact,
  ensureDurableArtifactItem,
  forkArtifact,
  getArtifactEditDecision,
  getArtifactItem,
  listPrimaryArtifacts,
  prepareArtifactForAction,
  refreshArtifactRendition,
  retireArtifact,
  searchArtifactLibrary,
  setArtifactFavorite,
} from "../shell/artifact-client";
export type {
  ArtifactApiResult,
  ArtifactEditDecision,
  ArtifactRevisionCommit,
  ArtifactSearchResult,
} from "../shell/artifact-client";
export {
  ArtifactActionButtons,
  artifactActionMatrix,
} from "../shell/ArtifactActions";
export type {
  ArtifactActionMatrixOptions,
  ArtifactActionState,
  ArtifactTargetActionEvidence,
} from "../shell/ArtifactActions";
export {
  ArtifactRenditionFailure,
  useArtifactRendition,
  withResolvedRendition,
} from "../shell/ArtifactRendition";
export type { ArtifactRenditionState } from "../shell/ArtifactRendition";
