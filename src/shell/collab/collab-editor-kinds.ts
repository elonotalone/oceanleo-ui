/**
 * `AdvancedEditorAdapter.id`（外加可选的作品类型）→ `ImEditorKind`。
 * 返回 null = 该编辑器本轮不做多人同改（如 website，见契约 §9.14）。
 */
import type { ImEditorKind } from "../../lib/im/types";

const BY_ADAPTER: Readonly<Record<string, ImEditorKind | null>> = {
  richdoc: "richdoc",
  grid: "grid",
  deck: "deck",
  image: "image",
  // design-canvas 一个适配器托三种作品：合成图（默认）、矢量图、流程图；见下方 artifactType 细分。
  "design-canvas": "image",
  "chart-editor@1": "chart",
  game: "game",
  threed: "model3d",
  audio: "audio",
  pdf: "pdf",
  "video-timeline": "video",
  "video-canvas": "video",
  website: null,
  none: null,
};

const BY_ARTIFACT_TYPE: Readonly<Record<string, ImEditorKind>> = {
  vector_image: "vector",
  workflow: "workflow",
};

export function collabEditorKindForAdapter(
  adapterId: string | null | undefined,
  artifactType?: string | null,
): ImEditorKind | null {
  const id = String(adapterId ?? "");
  if (id === "design-canvas" && artifactType && BY_ARTIFACT_TYPE[artifactType]) {
    return BY_ARTIFACT_TYPE[artifactType]!;
  }
  return BY_ADAPTER[id] ?? null;
}
