import type { BayDigitalAsset } from '../../../lib/bay/assets';
import type { BayAsset } from './library-client';
import type { LibraryItem, LibraryKind } from '../../library-data';
import { workspaceEntryFromLibraryItem, type WorkspaceLibraryEntry } from '../../workspace-library-model';

type AssetInput = BayDigitalAsset | BayAsset;
const KINDS: Record<string, LibraryKind> = {
  image: 'image', single_file_image: 'image', composite_image: 'image', poster: 'image', vector: 'image', vector_image: 'image', sticker: 'image',
  video: 'video', video_workflow: 'video_canvas', audio: 'audio', music: 'audio',
  '3d': 'threed', model_3d: 'threed', ppt: 'ppt', deck: 'ppt', document: 'document', pdf: 'document',
  grid: 'sheet', sheet: 'sheet', chart: 'image', website: 'website', workflow: 'file', game: 'game', prompt: 'document', interactive_doc: 'interactive_doc',
};
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function sellerName(asset: AssetInput): string { return text(asset.author) || ('seller_id' in asset ? text(asset.seller_id) : '') || ''; }
function priceFen(asset: AssetInput): number | null {
  const value = asset.price_fen;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function official(asset: AssetInput): boolean { return 'seller_id' in asset ? asset.seller_id === 'official' : asset.origin === 'first-party'; }

/** Preserve content URLs separately from covers; never invent a durable receipt or source rights. */
export function bayAssetToLibraryItem(asset: AssetInput): LibraryItem {
  const id = text(asset.id);
  const type = text(asset.type).toLowerCase();
  const cover = 'cover_url' in asset ? text(asset.cover_url) : '';
  const previewUrl = text(asset.preview_url) || text(asset.full_url);
  const thumbUrl = text(asset.thumb_url) || cover || previewUrl;
  const context = asset.action_context;
  const purchased = context ? context.owned && (!context.commerce || context.commerce.purchaseState === 'settled') : asset.purchase_state === 'settled';
  return {
    key: `bay:${id}`, source: 'artifact', id: `bay:${id}`,
    title: text(asset.title) || id, kind: KINDS[type] || 'file', siteId: '',
    url: text(asset.full_url) || previewUrl || undefined,
    previewUrl: previewUrl || undefined, thumbUrl: thumbUrl || undefined,
    favorite: false, createdAt: text(asset.created_at) || undefined,
    // Seller artifact ids are gated through the typed resolver, not promoted
    // into a durable item merely because the listing mentioned them.
    meta: {
      bay_asset_id: id, bay_asset_seller: sellerName(asset), bay_asset_created_at: text(asset.created_at),
      bay_asset_price_fen: priceFen(asset), bay_asset_currency: text(asset.currency).toUpperCase() || 'CNY',
      bay_asset_official: official(asset), bay_asset_purchased: purchased,
      bay_asset_read_only: context?.rights.canEdit !== true,
      bay_asset_source_rights: context?.rights.canDownloadSource === true,
      mime_type: text(asset.mime_type), format: text(asset.format), width: asset.width, height: asset.height,
      full_url: text(asset.full_url), preview_url: text(asset.preview_url), thumb_url: text(asset.thumb_url),
      license: asset.license, author: sellerName(asset),
      ...('file_size' in asset ? { file_size: asset.file_size } : {}),
    },
  };
}

export interface BayAssetLibraryEntry extends WorkspaceLibraryEntry {
  libraryItem: LibraryItem;
  uploader: string;
  uploadedAt: string;
  priceFen: number | null;
  purchased: boolean;
  official: boolean;
}

export function bayAssetToLibraryEntry(asset: AssetInput, onPurchase?: (assetId: string) => Promise<void> | void): BayAssetLibraryEntry {
  const item = bayAssetToLibraryItem(asset);
  const uploader = sellerName(asset);
  const uploadedAt = text(asset.created_at);
  const price = priceFen(asset);
  const purchased = item.meta.bay_asset_purchased === true;
  const assetId = 'listing_id' in asset ? text(asset.listing_id) : text(asset.id);
  return {
    ...workspaceEntryFromLibraryItem(item, { description: 'summary' in asset ? text(asset.summary) || undefined : undefined, category: 'LeoBay' }),
    libraryItem: item, uploader, uploadedAt, priceFen: price, purchased, official: official(asset),
    detail: { uploader, uploadedAt, ...(price === null ? {} : { priceFen: price }),
      currency: text(asset.currency).toUpperCase() || 'CNY', purchased, official: official(asset), assetId,
      onPurchase: onPurchase ? () => onPurchase(assetId) : undefined },
  };
}

export function bayAssetToLibraryEntries(assets: readonly AssetInput[], onPurchase?: (assetId: string) => Promise<void> | void): BayAssetLibraryEntry[] {
  return assets.map((asset) => bayAssetToLibraryEntry(asset, onPurchase));
}
