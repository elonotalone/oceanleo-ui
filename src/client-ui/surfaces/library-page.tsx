"use client";

import {
  ArtifactLibrary,
  type ArtifactLibraryProps,
} from "../../shell/ArtifactLibrary";

/**
 * The same product surface the portal `/library` route mounts today:
 * `ArtifactLibrary` → `MyLibrary`. Hosts inject navigation/session around it;
 * this file does not copy a static homepage.
 */
export function SharedLibraryPage(props: ArtifactLibraryProps) {
  return <ArtifactLibrary {...props} />;
}

export type { ArtifactLibraryProps };
