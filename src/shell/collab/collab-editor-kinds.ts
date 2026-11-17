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
  pdf: "pdf",
  "video-timeline": "video",
  none: null,
};

const BY_ARTIFACT_TYPE: Readonly<Record<string, ImEditorKind>> = {
  vector_image: "vector",
};

export function collabEditorKindForAdapter(
  adapterId: string | null | undefined,
  artifactType?: string | null,
): ImEditorKind | null {
  const id = String(adapterId ?? "");
  if ((id === "image" || id === "design-canvas") && artifactType && BY_ARTIFACT_TYPE[artifactType]) {
    return BY_ARTIFACT_TYPE[artifactType]!;
  }
  return BY_ADAPTER[id] ?? null;
}
