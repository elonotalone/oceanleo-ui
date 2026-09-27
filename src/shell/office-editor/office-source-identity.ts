import type { LibraryItem } from "../library-data";

/** Never inspect a signed grant. Only an explicitly identified rendition may
 * survive URL re-signing; unversioned/unidentified sources retain URL identity. */
export function officeSourceCacheKey(
  url: string,
  revision: string,
  item?: LibraryItem | null,
): string {
  const artifactId = item?.artifact?.artifactId || item?.artifactId;
  const renditions = item?.artifact?.renditions;
  const match = Object.entries(renditions || {}).find(([, r]) => r?.url === url);
  if (artifactId && revision && match) {
    const [purpose, rendition] = match;
    if (!rendition?.revisionId || rendition.revisionId === revision) {
      return JSON.stringify(["artifact", artifactId, revision, purpose]);
    }
  }
  return JSON.stringify(["url", url, revision]);
}

