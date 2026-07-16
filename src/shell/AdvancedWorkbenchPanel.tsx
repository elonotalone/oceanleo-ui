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
    ppt: "image",
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
  if (activeTool === "tasks") {
    return (
      <AdvancedTasks
        siteId={siteId}
        accent={accent}
        currentSessionId={sessionId}
      />
    );
  }
  const currentFeatureId = advancedFeatureForItem(item)?.id;
  return (
    <MyLibrary
      siteId={siteId}
      accent={accent}
      taskId={taskId}
      plain
      itemFilter={(candidate) =>
        advancedFeatureForItem(candidate)?.id === currentFeatureId
      }
      onOpenItem={(nextItem) => {
        const href = advancedFeatureHrefForItem(nextItem);
        if (href) router.push(href);
      }}
    />
  );
}
