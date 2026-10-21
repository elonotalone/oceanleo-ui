import {
  advancedCommittedRevisionItem,
  advancedRootItemId,
  advancedSavedItem,
} from "../advanced-session";
import { isDurableLibraryItem, type LibraryItem } from "../library-data";

/**
 * Pin an image flush result to the exact base captured by useFabricImageEditor.
 * Durable-to-durable commits retain the shared strict lineage/integrity gate.
 * A non-durable source has no revision pin to validate; its own save receipt
 * may fork to either a durable artifact or a legacy working-head item, but the
 * receipt must retain the source root.
 */
export function imageSaveReceiptItem(
  baseItem: LibraryItem,
  savedItem: LibraryItem | undefined,
  meta: Record<string, unknown>,
  fallback: { url: string; versionId: string },
): LibraryItem {
  if (!savedItem) {
    return advancedSavedItem(baseItem, {
      url: fallback.url,
      versionId: fallback.versionId,
      meta,
    });
  }

  if (isDurableLibraryItem(baseItem)) {
    return advancedCommittedRevisionItem(baseItem, savedItem, meta);
  }

  const rootId = advancedRootItemId(baseItem);
  if (advancedRootItemId(savedItem) !== rootId) {
    throw new Error("图片保存回执不属于当前源素材的 root。");
  }
  if (
    isDurableLibraryItem(savedItem) &&
    !savedItem.artifact.integrity.ok
  ) {
    throw new Error("图片 fork 回执未通过 artifact 完整性校验。");
  }
  return {
    ...savedItem,
    meta: {
      ...savedItem.meta,
      ...meta,
      parent_asset_id: rootId,
    },
  };
}
