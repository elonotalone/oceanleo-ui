import type { ArtifactRenditionPurpose } from "./artifact-contract";

/** Stable identity for refreshing a private rendition. */
export interface ArtifactAccessIdentity {
  artifactId: string;
  revisionId: string;
  purpose: ArtifactRenditionPurpose;
}
