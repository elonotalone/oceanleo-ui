import type { LibraryItem } from "../library-data";
import { model3dFromRevisionJson } from "../collab/adapters/model3d";
import { model3DSourceForItem } from "./model3d-workbench-defaults";
import { normalizeModel3DSourceProvenance } from "./model3d-project";

type FetchRevision = (artifact: string, revision: string, pick: (item: LibraryItem) => string) => Promise<unknown | null>;

/** A local typed-save acknowledgement is not a remote edit. In particular its
 * empty operation journal must not replace the representation in Undo history.
 */
export async function loadModel3DCollabRevision(
  artifact: string, revision: string,
  isOwn: (artifact: string, revision: string) => boolean,
  fetchRevision: FetchRevision,
) {
  if (!artifact || !revision || isOwn(artifact, revision)) return null;
  let found: LibraryItem | null = null;
  const json = await fetchRevision(artifact, revision, (item) => {
    found = item;
    return String(item.meta.editor_project_url || item.meta.editor_manifest_url || "");
  });
  // The receipt can arrive while the immutable revision is being fetched.
  if (!json || isOwn(artifact, revision)) return null;
  const state = model3dFromRevisionJson(json);
  const item = found as LibraryItem | null;
  if (!state.checkpointUrl && item) {
    state.checkpointUrl = model3DSourceForItem(item);
    state.provenance = normalizeModel3DSourceProvenance({
      sourceUrl: state.checkpointUrl, dependencyBaseUrl: state.checkpointUrl,
      artifactId: artifact, revisionId: revision,
      sourceDigest: item.artifact?.renditions.source?.digest || "", format: "glb",
    }, state.checkpointUrl, "glb");
  }
  // Never apply an empty scene when an authoritative manifest lacks its source.
  return state.checkpointUrl ? state : null;
}
