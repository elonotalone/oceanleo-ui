import type {
  AdvancedFeatureDefinition,
  AdvancedFeatureId,
} from "./advanced-features";
import type {
  EditorManifestV1,
  LibraryItem,
} from "./library-data";

const BLANK_CHART_MANIFEST: EditorManifestV1 = {
  schema: "oceanleo.editor-manifest.v1",
  id: "chart-editor",
  version: 1,
  capabilities: ["load", "mutate", "save", "reopen"],
  source: { kind: "inline", format: "echarts-option+json" },
};

const BLANK_CHART_DOCUMENT = JSON.stringify({
  schema: "oceanleo.chart.v1",
  option: {
    title: { text: "新图表" },
    color: ["#2563eb", "#f97316", "#16a34a"],
    legend: { show: true, position: "top" },
    xAxis: {
      type: "category",
      name: "",
      show: true,
      data: ["A", "B", "C"],
    },
    yAxis: { type: "value", name: "", show: true, data: [] },
    series: [
      {
        id: "series-1",
        name: "系列 1",
        type: "bar",
        data: [12, 20, 16],
        label: { show: false },
      },
    ],
  },
});

/**
 * Create a browser-local first draft for a direct `/advanced/<feature>` visit.
 * It is deliberately not a fake database row: the first explicit save creates
 * the durable library item while `root_asset_id` keeps the session identity.
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
    case "chart_editing":
      return {
        ...base,
        kind: "image",
        content: BLANK_CHART_DOCUMENT,
        meta: {
          ...base.meta,
          content_type: "chart",
          representation: "echarts-option",
          editor: BLANK_CHART_MANIFEST,
        },
        descriptor: {
          contentType: "chart",
          representation: "echarts_option",
          subtype: "",
          editor: BLANK_CHART_MANIFEST,
          capabilities: ["load", "mutate", "save", "reopen"],
          unavailableReason: "",
        },
      };
    case "website_finetuning":
      return routed("website", "embed", { editor_target: "website" });
    case "design_canvas":
      return routed("canvas", "embed", {
        editor_target: "design",
        nodes: [],
      });
    case "video_canvas":
      return routed("video_canvas", "embed", {
        editor_target: "video",
        nodes: [],
      });
    case "model_3d":
      return routed("threed", "threed", {
        subtype: "model",
        format: "glb",
      });
    default:
      throw new Error(`不支持的高级功能：${String(feature.id)}`);
  }
}
