import { resolveBayAsset } from '../../lib/bay/assets';
import { getArtifactItem } from '../artifact-client';
import { bayAssetToLibraryEntry } from '../bay/asset/library-entry-adapter';
import { workspaceEntryFromLibraryItem } from '../workspace-library-model';
import type { ResolveAssetDetail } from './types';

/** One authoritative identity/rights read for every detail surface. */
export const resolveAssetDetail: ResolveAssetDetail = async (ref, options = {}) => {
  const resolved = await resolveBayAsset(ref, { signal: options.signal });
  options.signal?.throwIfAborted();
  const actionContext = { ...resolved.actionContext, surface: options.surface ?? 'bay' };
  if (resolved.artifactRef) {
    const identity = resolved.artifactRef;
    if (!identity.revisionId) throw new Error('asset_revision_unavailable');
    const result = await getArtifactItem(identity.artifactId, identity.revisionId, options.signal);
    options.signal?.throwIfAborted();
    if (!result.ok || !result.data) throw new Error('asset_detail_unavailable');
    const item = result.data;
    // A response for another root/revision must never enter the selected detail.
    if (item.artifactId !== identity.artifactId || item.revisionId !== identity.revisionId) {
      throw new Error('asset_identity_mismatch');
    }
    return { entry: workspaceEntryFromLibraryItem(item), actionContext };
  }
  if (!resolved.asset) throw new Error('asset_detail_unavailable');
  return {
    entry: bayAssetToLibraryEntry({ ...resolved.asset, action_context: actionContext }),
    actionContext,
  };
};
