import type {
  AdvancedFeatureDefinition,
  AdvancedFeatureId,
} from "./advanced-features";
import type { LibraryItem } from "./library-data";

/** Operator /dev and `/advanced/<featureId>` open these canvases (chart editor deleted 2026-10-22). */
export const ADVANCED_PLUGIN_FEATURE_IDS = [
  "image_editing",
  "design_canvas",
  "video_editing",
  "website_finetuning",
  "presentation_editing",
  "document_editing",
  "spreadsheet_editing",
  "pdf_editing",
  "audio_editing",
  "model_3d",
  "video_canvas",
  "game_editing",
] as const satisfies readonly AdvancedFeatureId[];

/**
 * Browser-local first draft for a direct `/advanced/<feature>` visit.
 * Not a fake database row: the first explicit save creates the durable item.
 * Session / material 503 must not be required to paint the canvas.
 */
export function blankAdvancedFeatureItem(
  feature: Pick<AdvancedFeatureDefinition, "id" | "title">,
  siteId = "oceanleo",
): LibraryItem {
  const rootId = `draft:advanced:${feature.id}`;
  const base: LibraryItem = {
    key: rootId,
    source: "creation",
    id: rootId,
    title: `新建${feature.title}`,
    kind: "file",
    siteId: siteId || "oceanleo",
    favorite: false,
    meta: {
      draft: true,
      blank: true,
      root_asset_id: rootId,
      feature_id: feature.id,
    },
  };
  const routed = (
    kind: LibraryItem["kind"],
    route: string,
    meta: Record<string, unknown> = {},
  ): LibraryItem => ({
    ...base,
    kind,
    meta: {
      ...base.meta,
      ...meta,
      advanced_editor_route: route,
    },
  });

  switch (feature.id as AdvancedFeatureId) {
    case "video_editing":
      return routed("video", "video-timeline");
    case "audio_editing":
      return routed("audio", "audio");
    case "image_editing":
      return routed("image", "image", {
        width: 1080,
        height: 1080,
        format: "png",
      });
    case "document_editing":
      return { ...routed("document", "richdoc"), content: "" };
    case "spreadsheet_editing":
      return routed("sheet", "grid", { rows: [] });
    case "presentation_editing":
      return routed("ppt", "deck", { slides: [] });
    case "pdf_editing":
      return routed("document", "pdf", {
        mime: "application/pdf",
        format: "pdf",
      });
    case "website_finetuning":
      return routed("website", "website", { editor_target: "website" });
    case "design_canvas":
      return routed("canvas", "image", {
        editor_target: "design",
        nodes: [],
      });
    case "video_canvas":
      return routed("video_canvas", "video-canvas", {
        editor_target: "video",
        nodes: [],
      });
    case "model_3d":
      return routed("threed", "threed", {
        subtype: "model",
        format: "glb",
      });
    case "game_editing":
      return routed("game", "game");
    default:
      throw new Error(`不支持的高级功能：${String(feature.id)}`);
  }
}
