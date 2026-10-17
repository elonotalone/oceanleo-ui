"use client";

import { DEVELOPMENT_API_ENDPOINT } from "../host-ports";
import { SharedLibraryPage, type ArtifactLibraryProps } from "../surfaces/library-page";
import { MemoryHostProvider } from "./memory-host";

/**
 * Local (non-Next) host for the real `/library` product surface.
 * Used by the phase-1 build proof and later by the desktop host.
 */
export function LocalLibraryHost({
  apiEndpoint = DEVELOPMENT_API_ENDPOINT,
  ...page
}: ArtifactLibraryProps & { apiEndpoint?: string }) {
  return (
    <MemoryHostProvider initialPath="/library" apiEndpoint={apiEndpoint}>
      <SharedLibraryPage {...page} />
    </MemoryHostProvider>
  );
}
