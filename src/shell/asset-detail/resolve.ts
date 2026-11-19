import { resolveBayAsset } from '../../lib/bay/assets';
import { getArtifactItem } from '../artifact-client';
import { bayAssetToLibraryEntry } from '../bay/asset/library-entry-adapter';
import { workspaceEntryFromLibraryItem } from '../workspace-library-model';
import type { ResolveAssetDetail } from './types';

export type AssetDetailErrorKind = 'not-found' | 'no-access' | 'temporary';

export class AssetDetailError extends Error {
  readonly kind: AssetDetailErrorKind;
  readonly status?: number;
  constructor(kind: AssetDetailErrorKind, status?: number, options?: ErrorOptions) {
    super(`asset_detail_${kind.replace('-', '_')}`, options);
    this.name = 'AssetDetailError';
    this.kind = kind;
    this.status = status;
  }
}

export function assetDetailError(error: unknown): AssetDetailError {
  if (error instanceof AssetDetailError) return error;
  const failure = error as { status?: number; code?: string } | null;
  const status = failure?.status;
  const kind = status === 404 || failure?.code === 'not-found' ? 'not-found'
    : status === 401 || status === 403 || failure?.code === 'unauthorized' ? 'no-access' : 'temporary';
  return new AssetDetailError(kind, status, { cause: error });
}

/** One authoritative identity/rights read for every detail surface. */
export const resolveAssetDetail: ResolveAssetDetail = async (ref, options = {}) => {
  try {
    const resolved = await resolveBayAsset(ref, { signal: options.signal });
    options.signal?.throwIfAborted();
    const actionContext = { ...resolved.actionContext, surface: options.surface ?? 'bay' };
    if (resolved.artifactRef) {
      const identity = resolved.artifactRef;
      if (!identity.revisionId) throw new Error('asset_revision_unavailable');
      const result = await getArtifactItem(identity.artifactId, identity.revisionId, options.signal);
      options.signal?.throwIfAborted();
      if (!result.ok || !result.data) throw assetDetailError(result);
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
  } catch (error) {
    if (options.signal?.aborted || (error as Error)?.name === "AbortError") throw error;
    throw assetDetailError(error);
  }
};
