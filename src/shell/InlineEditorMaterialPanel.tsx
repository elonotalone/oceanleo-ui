"use client";

import { canonicalArtifactContextId } from "./artifact-contract";
import type { LibraryItem } from "./library-data";
import { MaterialLibrary } from "./MaterialLibrary";
import type {
  useWorkbenchMaterials,
  WorkbenchMaterialAction,
} from "./workbench-material-provider";

function curatedTypeFor(item: LibraryItem): string {
  const format = String(item.meta.format || item.meta.file_ext || "")
    .trim()
    .toLowerCase();
  const mime = String(item.meta.mime || "").toLowerCase();
  const sourceUrl = item.url || item.previewUrl || "";
  if (
    format === "pdf" ||
    mime === "application/pdf" ||
    /\.pdf(?:$|[?#])/i.test(sourceUrl)
  ) {
    return "pdf";
  }
  const explicit = String(
    item.descriptor?.contentType ||
      item.meta.content_type ||
      item.meta.asset_type ||
      "",
  ).toLowerCase();
  if (explicit === "chart") return "chart";
  const map: Partial<Record<LibraryItem["kind"], string>> = {
    website: "website",
    canvas: "image",
    ppt: "ppt",
    sheet: "sheet",
    document: "document",
    image: "image",
    video: "video",
    video_canvas: "video_workflow",
    audio: "audio",
    xhs: "image",
    threed: "3d",
    // 两个新载体各自成一档，不并进 image：它们的插入面要的是同类工程与数据件，
    // 落到 `all` 会把整库素材铺进面板（`geo-map.md` §10.3 枚举面的「插入」那格）。
    geo_map: "geo_map",
    interactive_doc: "interactive_doc",
  };
  return map[item.kind] || "all";
}

export function InlineEditorMaterialPanel({
  item,
  taskId,
  siteId,
  accent,
  materials,
  primaryMaterialAction,
}: {
  item: LibraryItem;
  taskId?: string | null;
  siteId?: string;
  accent: string;
  materials: ReturnType<typeof useWorkbenchMaterials>;
  primaryMaterialAction?: WorkbenchMaterialAction;
}) {
  return (
    <div className="h-full min-h-0">
      <MaterialLibrary
        materials={[]}
        featuredEntries={[...(materials?.entries || [])]}
        curatedType={curatedTypeFor(item)}
        curatedSeriesId={siteId === "design" ? "design-materials" : ""}
        accent={accent}
        taskId={taskId}
        siteId={siteId}
        appId={materials?.appId}
        contextId={canonicalArtifactContextId(
          siteId || "",
          materials?.appId || "",
        )}
        registerRuntimeSource={false}
        materialActions={materials?.actions || []}
        onMaterialAction={
          materials
            ? (action, material) =>
                materials.perform(action, material, { source: "click" })
            : undefined
        }
        materialActionAvailable={materials?.canPerform}
        primaryMaterialAction={primaryMaterialAction}
        draggableMaterials={Boolean(primaryMaterialAction)}
        onMaterialDragStart={materials?.beginMaterialDrag}
        onMaterialDragEnd={materials?.endMaterialDrag}
        allowAdvancedOnSelect={false}
        hideSeeAll
      />
    </div>
  );
}
