"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  advancedFeatureForItem,
  advancedFeatureHrefForItem,
} from "./advanced-features";
import { AdvancedAgentPanel } from "./AdvancedAgentPanel";
import { AdvancedTasks } from "./AdvancedTasks";
import type { LibraryItem } from "./library-data";
import { MaterialLibrary } from "./MaterialLibrary";
import { MyLibrary } from "./MyLibrary";
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
  };
  return map[item.kind] || "all";
}

export function AdvancedWorkbenchPanel({
  activeTool,
  hasCustomContent,
  customContent,
  item,
  taskId,
  siteId,
  accent,
  sessionId,
  materials,
  primaryMaterialAction,
}: {
  activeTool: string;
  hasCustomContent: boolean;
  customContent?: ReactNode;
  item: LibraryItem;
  taskId?: string | null;
  siteId?: string;
  accent: string;
  sessionId?: string | null;
  materials: ReturnType<typeof useWorkbenchMaterials>;
  primaryMaterialAction?: WorkbenchMaterialAction;
}) {
  const router = useRouter();
  if (hasCustomContent) return customContent;
  if (activeTool === "agent") {
    return (
      <AdvancedAgentPanel
        item={item}
        taskId={taskId}
        siteId={siteId}
        accent={accent}
      />
    );
  }
  if (activeTool === "materials") {
    const websiteTemplates =
      advancedFeatureForItem(item)?.id === "website_finetuning";
    return (
      <div className="h-full min-h-0">
        <MaterialLibrary
          materials={[]}
          featuredEntries={[
            ...(websiteTemplates
              ? (materials?.entries || []).filter(
                  (entry) => entry.libraryItem?.kind === "website",
                )
              : materials?.entries || []),
          ]}
          curatedType={curatedTypeFor(item)}
          curatedSeriesId={siteId === "design" ? "design-materials" : ""}
          accent={accent}
          taskId={taskId}
          siteId={siteId}
          appId={materials?.appId}
          registerRuntimeSource={false}
          materialActions={
            websiteTemplates ? ["apply"] : materials?.actions || []
          }
          onMaterialAction={
            websiteTemplates
              ? (_action, material) => {
                  const href = advancedFeatureHrefForItem(material);
                  if (!href) {
                    return { ok: false, error: "这个网站模板暂时无法打开。" };
                  }
                  router.push(href);
                  return { ok: true };
                }
              : materials
                ? (action, material) =>
                    materials.perform(action, material, { source: "click" })
                : undefined
          }
          materialActionAvailable={
            websiteTemplates
              ? (_action, material) =>
                  advancedFeatureForItem(material)?.id === "website_finetuning"
              : materials?.canPerform
          }
          primaryMaterialAction={
            websiteTemplates ? "apply" : primaryMaterialAction
          }
          draggableMaterials={
            !websiteTemplates && Boolean(primaryMaterialAction)
          }
          onMaterialDragStart={materials?.beginMaterialDrag}
          onMaterialDragEnd={materials?.endMaterialDrag}
          allowAdvancedOnSelect={false}
          hideSeeAll
        />
      </div>
    );
  }
  if (activeTool === "tasks") {
    return (
      <AdvancedTasks
        siteId={siteId}
        accent={accent}
        currentSessionId={sessionId}
      />
    );
  }
  return (
    <MyLibrary
      siteId={siteId}
      accent={accent}
      taskId={taskId}
      plain
      category={activeTool === "uploads" ? "上传文件" : undefined}
      onOpenItem={(nextItem) => {
        const href = advancedFeatureHrefForItem(nextItem);
        if (href) router.push(href);
      }}
    />
  );
}
