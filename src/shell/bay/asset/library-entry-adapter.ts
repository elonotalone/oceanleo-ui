import type { BayDigitalAsset } from '../../../lib/bay/assets';
import type { LibraryItem, LibraryKind } from '../../library-data';
import { workspaceEntryFromLibraryItem, type WorkspaceLibraryEntry } from '../../workspace-library-model';

const KINDS: Record<string, LibraryKind> = {
  image: 'image', poster: 'image', vector: 'image', sticker: 'image', video: 'video', audio: 'audio', music: 'audio',
  '3d': 'threed', ppt: 'ppt', document: 'document', pdf: 'document', grid: 'sheet', chart: 'image', website: 'website', workflow: 'file', game: 'game', prompt: 'document',
};

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function sellerName(asset: BayDigitalAsset): string { return asset.seller_id ? `LeoBay 用户 ${asset.seller_id}` : 'OceanLeo'; }
function priceFen(asset: BayDigitalAsset): number { return Number.isFinite(Number(asset.price_fen)) && Number(asset.price_fen) >= 0 ? Number(asset.price_fen) : 0; }
function kind(asset: BayDigitalAsset): LibraryKind { return KINDS[text((asset as unknown as Record<string, unknown>).type).toLowerCase()] || 'file'; }

/** Converts a P2 listing into the shared, view-only Library projection. */
export function bayAssetToLibraryItem(asset: BayDigitalAsset): LibraryItem {
  const id = text(asset.id);
  const previewUrl = text(asset.cover_url);
  const thumbUrl = previewUrl;
  const purchased = asset.purchase_state === 'settled';
  return {
    key: `bay:${id}`,
    source: 'artifact',
    id: `bay:${id}`,
    title: text(asset.title) || id,
    kind: kind(asset),
    siteId: '',
    url: previewUrl || undefined,
    previewUrl: previewUrl || undefined,
    thumbUrl: thumbUrl || undefined,
    favorite: false,
    createdAt: text(asset.created_at) || undefined,
    artifactId: text(asset.artifact_id) || undefined,
    revisionId: text(asset.revision_id) || undefined,
    artifactType: undefined,
    meta: {
      bay_asset_id: id,
      bay_asset_seller: sellerName(asset),
      bay_asset_created_at: text(asset.created_at),
      bay_asset_price_fen: priceFen(asset),
      bay_asset_currency: text(asset.currency).toUpperCase() || 'CNY',
      bay_asset_official: asset.seller_id === 'official',
      bay_asset_purchased: purchased,
      bay_asset_read_only: !purchased,
      bay_asset_source_rights: purchased,
    },
  };
}

export interface BayAssetLibraryEntry extends WorkspaceLibraryEntry {
  libraryItem: LibraryItem;
  uploader: string;
  uploadedAt: string;
  priceFen: number;
  purchased: boolean;
  official: boolean;
}

export function bayAssetToLibraryEntry(asset: BayDigitalAsset, onPurchase?: (assetId: string) => Promise<void> | void): BayAssetLibraryEntry {
  const item = bayAssetToLibraryItem(asset);
  const uploader = sellerName(asset);
  const uploadedAt = text(asset.created_at);
  const priceFenValue = priceFen(asset);
  const purchased = item.meta.bay_asset_purchased === true;
  return {
    ...workspaceEntryFromLibraryItem(item, { description: text(asset.summary) || undefined, category: 'LeoBay' }),
    libraryItem: item,
    uploader,
    uploadedAt,
    priceFen: priceFenValue,
    purchased,
    official: asset.seller_id === 'official',
    detail: { uploader, uploadedAt, priceFen: priceFenValue, purchased, official: asset.seller_id === 'official', assetId: text(asset.listing_id || asset.id), onPurchase: onPurchase ? () => onPurchase(text(asset.listing_id || asset.id)) : undefined },
  } as BayAssetLibraryEntry;
}

export function bayAssetToLibraryEntries(assets: readonly BayDigitalAsset[], onPurchase?: (assetId: string) => Promise<void> | void): BayAssetLibraryEntry[] {
  return assets.map((asset) => bayAssetToLibraryEntry(asset, onPurchase));
}
