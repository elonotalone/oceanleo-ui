import type { LibraryItem } from "../library-data";
import { saveFileToLibrary, type SaveToLibraryInput } from "../doc-editors/doc-io";
import { deckProjectFromPptist } from "../doc-editors/deck-pptist-carrier";
import { renderDeckPreviewPng } from "../doc-editors/editor-preview-raster";
import {
  buildDeckPptxBlob,
  deckSavedItemForHandoff,
  DECK_PROJECT_SCHEMA,
  DECK_SOURCE_FORMAT,
  DECK_SOURCE_MEDIA_TYPE,
} from "../doc-editors/use-deck-editor";

/** Same upload / typed revision producer as normal editing; never create a new root. */
export async function saveHostedDeck(
  item: LibraryItem,
  payload: unknown,
  siteId: string,
  editRevision: number,
  dependencies = { save: saveFileToLibrary, delivery: buildDeckPptxBlob, preview: renderDeckPreviewPng },
) {
  const artifactId = String(item.artifactId || item.meta?.artifact_id || "");
  const revisionId = String(item.revisionId || item.meta?.revision_id || "");
  const artifactType = item.artifactType || item.meta?.artifact_type;
  if (!artifactId || !revisionId || artifactType !== "deck") {
    return { ok: false as const, error: "这份演示文稿的版本信息不完整，未保存。请重新打开。" };
  }
  try {
    const deck = deckProjectFromPptist(payload, item.title || "演示文稿");
    const title = deck.title;
    const stem = title.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 180) || "演示文稿";
    const input: SaveToLibraryInput = {
      item, siteId, fallbackSite: "ppt",
      createFile: async () => new File([await dependencies.delivery(deck)], `${stem}.pptx`, { type: DECK_SOURCE_MEDIA_TYPE }),
      createPreview: () => dependencies.preview(deck),
      sourceFormat: DECK_SOURCE_FORMAT, sourceMediaType: DECK_SOURCE_MEDIA_TYPE,
      title, mediaType: "ppt", kind: "deck",
      idempotencyKey: `deck:hosted:${editRevision}:${revisionId}:${artifactId}`,
      meta: {
        editor: "deck-editor", editor_capability: "deck-editor", content_type: "deck",
        representation: DECK_SOURCE_FORMAT, slides: deck.slides.length,
        aspect: deck.aspect, theme: deck.theme, deck_version: deck.version,
      },
      project: { schema: DECK_PROJECT_SCHEMA, data: deck },
      editorManifest: { id: "deck-editor", format: DECK_PROJECT_SCHEMA },
      artifactRevision: { artifactType: "deck", provenance: { editorRevision: editRevision, deckVersion: deck.version } },
    };
    const result = await dependencies.save(input);
    if (!result.ok) return { ok: false as const, error: result.error || "这次修改未保存，请重试。" };
    return { ok: true as const, item: deckSavedItemForHandoff(item, result) };
  } catch {
    return { ok: false as const, error: "这次修改未保存，请重试。" };
  }
}
