"use client";

import { useCallback, useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { canonicalArtifactContextId } from "./artifact-contract";
import { humanErrorMessage } from "./human-error-message";
import type { LibraryItem } from "./library-data";
import { MaterialLibrary } from "./MaterialLibrary";
import type {
  useWorkbenchMaterials,
  WorkbenchMaterialAction,
} from "./workbench-material-provider";

/**
 * 注册表的拒绝理由是写给开发者的（「command/history 契约」「artifactId + revisionId」）。
 * 面板里给用户看人话；认不出的理由原样交给 humanErrorMessage。
 */
export function humanMaterialReason(
  reason: string,
  tt: (text: string) => string,
): string {
  if (/command\/history|command contract|command executor/i.test(reason)) {
    return tt("这个编辑器还不能从素材库直接插入");
  }
  if (/不接受这种/.test(reason)) return tt("这个编辑器用不了这类素材");
  if (/artifactId \+ revisionId|耐久 identity|durable identity/i.test(reason)) {
    return tt("这份素材还没存进库，暂时不能插入");
  }
  if (/没有声明这个/.test(reason)) return tt("这个编辑器不支持这个动作");
  if (/先选中要替换的对象/.test(reason)) return tt("先选中要替换的对象，再点素材");
  return reason;
}

function materialFailureText(
  error: string | undefined,
  tt: (text: string) => string,
): string {
  const raw = String(error || "");
  const mapped = humanMaterialReason(raw, tt);
  if (mapped !== raw) return mapped;
  return tt(humanErrorMessage(raw, tt("这份素材没能插入，请重试")));
}

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

/**
 * 能「插入」却只接图片的编辑器：PDF（图片 / 签名作图章，D2）、演示、文档。
 * 它们的素材库面板列图片——列同类文件（PDF / 演示 / 文档）的话一件都插不进去。
 */
const IMAGE_INSERT_TYPES: ReadonlySet<string> = new Set(["pdf", "ppt", "document"]);

/**
 * 素材库面板列哪一类素材：编辑器申报了就按它列；没申报时按当前文件类型，
 * 只接图片的插入型编辑器改列图片（`IMAGE_INSERT_TYPES`）。
 */
export function resolveMaterialPanelType(
  item: LibraryItem,
  declared: readonly string[] | undefined,
  actions: readonly WorkbenchMaterialAction[] | undefined,
): string {
  if (declared?.[0]) return declared[0];
  const own = curatedTypeFor(item);
  if (IMAGE_INSERT_TYPES.has(own) && actions?.includes("insert")) return "image";
  return own;
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
  const tt = useUI();
  // 外壳负责插入的反馈（D2）：成功说插进了哪一份，失败说人话原因，几秒后自动消失。
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const timer = globalThis.setTimeout(() => setFeedback(null), 4000);
    return () => globalThis.clearTimeout(timer);
  }, [feedback]);
  const perform = materials?.perform;
  const onMaterialAction = useCallback(
    async (action: WorkbenchMaterialAction, material: LibraryItem) => {
      if (!perform) return { ok: false, error: tt("当前编辑器不能插入素材") };
      const result = await perform(action, material, { source: "click" });
      setFeedback(
        result.ok
          ? { ok: true, text: tt("已插入「{title}」", { title: material.title }) }
          : {
              ok: false,
              text: materialFailureText(result.error, tt),
            },
      );
      return result;
    },
    [perform, tt],
  );
  const availability = materials?.availability;
  // 灰掉的「插入 / 替换」旁边写的是真原因（人话），不是宿主的通用兜底句。
  const materialActionEvidence = useCallback(
    (action: WorkbenchMaterialAction, material: LibraryItem) => {
      const evidence = availability
        ? availability(action, material)
        : { visible: false, available: false, reason: "" };
      return evidence.available
        ? evidence
        : { ...evidence, reason: humanMaterialReason(evidence.reason, tt) };
    },
    [availability, tt],
  );
  const curatedType = resolveMaterialPanelType(
    item,
    materials?.materialTypes,
    materials?.actions,
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      {feedback ? (
        <p
          role={feedback.ok ? "status" : "alert"}
          data-material-insert-feedback={feedback.ok ? "ok" : "error"}
          className={`shrink-0 px-3 py-2 text-[12px] ${
            feedback.ok
              ? "text-[var(--awb-text,#1c1917)]"
              : "text-[var(--awb-danger,#dc2626)]"
          }`}
        >
          {feedback.text}
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
      <MaterialLibrary
        materials={[]}
        featuredEntries={[...(materials?.entries || [])]}
        curatedType={curatedType}
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
        onMaterialAction={materials ? onMaterialAction : undefined}
        materialActionAvailable={materials?.canPerform}
        materialActionEvidence={availability ? materialActionEvidence : undefined}
        primaryMaterialAction={primaryMaterialAction}
        draggableMaterials={Boolean(primaryMaterialAction)}
        onMaterialDragStart={materials?.beginMaterialDrag}
        onMaterialDragEnd={materials?.endMaterialDrag}
        allowAdvancedOnSelect={false}
        hideSeeAll
      />
      </div>
    </div>
  );
}
