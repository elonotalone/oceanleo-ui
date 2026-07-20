"use client";

// ============================================================================
// @oceanleo/ui — 素材总栏目（分板块）material-catalog（单一事实源，宗旨 v22，2026-07-12）
// ----------------------------------------------------------------------------
// 操作员 2026-07-12：把「素材」做成一个独立总栏目，按板块分（网站 / PPT / 图片 / 文档 /
// 幻灯 / 视频 / 海报 / 小红书 …）。跟「导航 / 文件库」板块类似：点开某板块 → 显示该板块的
// 素材。**各站右栏「素材库」= 这个总栏目的子页面**（只显示该 app 该让用户看到的那部分），
// 点「看全部」跳到完整总栏目（父页面）。
//
// 本模块提供：
//   · MaterialBoardId / MaterialBoard —— 板块数据模型；
//   · MATERIAL_BOARDS —— 素材总栏目的**板块分类骨架**（id + 中文名 + 图标）。完整目录
//     只查询 rich-v1 公共库存；宿主注入的旧 materials 不能绕过服务端 ACL。
//   · materialsForBoards —— 从「板块→素材」映射里取若干板块的素材并集（各站右栏子页面用）。
//   · MaterialCatalog —— 完整总栏目组件：顶部板块 tab + 主体 MaterialLibrary（复用现成放大/
//     搜索/分类），是各站右栏素材库子页面的父页面。
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { MaterialLibrary, type MaterialItem } from "./MaterialLibrary";
import { CanvasSubTabs } from "./ResultCanvas";
import { useUI } from "../i18n/ui/useUI";
import {
  ARTIFACT_TYPES,
  type ArtifactType,
} from "./artifact-contract";
import type { WorkspaceActionEnvelope } from "./workspace-actions";

export type MaterialBoardId =
  | "website"
  | "ppt"
  | "image"
  | "doc"
  | "sheet"
  | "canvas"
  | "slides"
  | "video"
  | "video_canvas"
  | "poster"
  | "xhs"
  | "design"
  | "audio"
  | "threed";

export interface MaterialBoard {
  id: MaterialBoardId;
  label: string;
  /** 该板块素材（宿主注入；不给则空态）。 */
  items?: MaterialItem[];
}

/** 素材总栏目的**板块骨架**（顺序 = tab 从左到右）。素材项由宿主注入。 */
export const MATERIAL_BOARDS: { id: MaterialBoardId; label: string }[] = [
  { id: "website", label: "网站" },
  { id: "ppt", label: "PPT" },
  { id: "image", label: "图片" },
  { id: "poster", label: "海报" },
  { id: "design", label: "设计" },
  { id: "doc", label: "文档" },
  { id: "sheet", label: "Excel" },
  { id: "canvas", label: "画布" },
  { id: "slides", label: "幻灯" },
  { id: "video", label: "视频" },
  { id: "video_canvas", label: "视频工作流" },
  { id: "xhs", label: "小红书" },
  { id: "audio", label: "音频" },
  { id: "threed", label: "3D" },
];

const BOARD_ARTIFACT_TYPE: Record<MaterialBoardId, ArtifactType> = {
  website: "website",
  ppt: "deck",
  image: "single_file_image",
  doc: "document",
  sheet: "grid",
  canvas: "workflow",
  slides: "deck",
  video: "video",
  video_canvas: "workflow",
  poster: "composite_image",
  xhs: "document",
  design: "vector_image",
  audio: "audio",
  threed: "model_3d",
};

/**
 * 从「板块 id → 素材」映射里取若干板块的素材并集（保序去重）。各站右栏「素材库」子页面用：
 * 声明本 app 关心哪几个板块（如 website 站 = ["website"]、ppt 站 = ["ppt","slides"]），
 * 取出对应素材喂给 MaterialLibrary。
 */
export function materialsForBoards(
  byBoard: Partial<Record<MaterialBoardId, MaterialItem[]>>,
  boards: MaterialBoardId[],
): MaterialItem[] {
  const seen = new Set<string>();
  const out: MaterialItem[] = [];
  for (const b of boards) {
    for (const m of byBoard[b] ?? []) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    }
  }
  return out;
}

export interface MaterialCatalogProps {
  /** @deprecated 仅供 materialsForBoards 兼容；完整目录不混入宿主素材。 */
  byBoard?: Partial<Record<MaterialBoardId, MaterialItem[]>>;
  /** 只显示这些板块（不给则全部 MATERIAL_BOARDS）。 */
  boards?: MaterialBoardId[];
  /** 初始选中的板块。 */
  defaultBoard?: MaterialBoardId;
  accent?: string;
  className?: string;
}

/**
 * 完整素材总栏目：顶部板块切换（CanvasSubTabs）+ 主体 MaterialLibrary（当前板块的素材）。
 * 放进 asset 站 / 主站 `/materials` 页；各站右栏素材库子页面的「看全部」深链到这里。
 */
export function MaterialCatalog({
  boards,
  defaultBoard,
  accent = "#4f46e5",
  className = "",
}: MaterialCatalogProps) {
  const tt = useUI();
  const boardList = useMemo(
    () => (boards ? MATERIAL_BOARDS.filter((b) => boards.includes(b.id)) : MATERIAL_BOARDS),
    [boards],
  );
  const [board, setBoard] = useState<MaterialBoardId>(
    defaultBoard && boardList.some((b) => b.id === defaultBoard)
      ? defaultBoard
      : (boardList[0]?.id ?? "website"),
  );
  const activeBoard = boardList.some((b) => b.id === board) ? board : boardList[0]?.id;
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<ArtifactType>(
    BOARD_ARTIFACT_TYPE[activeBoard || "website"],
  );
  const [deepLinkAction, setDeepLinkAction] =
    useState<WorkspaceActionEnvelope | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedBoard = params.get("board") as MaterialBoardId | null;
    const taxonomyValue = params.get("taxonomy") || "";
    const taxonomy = (ARTIFACT_TYPES as readonly string[]).includes(
      taxonomyValue,
    )
      ? (taxonomyValue as ArtifactType)
      : null;
    const taxonomyBoard = taxonomy
      ? boardList.find(
          (candidate) => BOARD_ARTIFACT_TYPE[candidate.id] === taxonomy,
        ) ||
        boardList.find(
          (candidate) =>
            candidate.id === (taxonomy === "pdf" ? "doc" : "sheet"),
        )
      : null;
    const requestedBoardIsValid = Boolean(
      requestedBoard &&
        boardList.some((candidate) => candidate.id === requestedBoard),
    );
    const nextBoard =
      taxonomyBoard?.id ||
      (requestedBoardIsValid
        ? requestedBoard
        : undefined);
    if (nextBoard) setBoard(nextBoard);
    if (taxonomy) {
      setSelectedTaxonomy(taxonomy);
    } else if (nextBoard) {
      setSelectedTaxonomy(BOARD_ARTIFACT_TYPE[nextBoard]);
    }
    const artifactId = params.get("artifactId")?.trim() || "";
    const revisionId = params.get("revisionId")?.trim() || "";
    const query = params.get("q")?.trim() || "";
    setDeepLinkAction({
      nonce: `material-catalog:${artifactId}:${revisionId}:${query}`,
      action: {
        version: 1,
        tab: "materials",
        query,
        itemId:
          artifactId && revisionId
            ? `artifact:${artifactId}:${revisionId}`
            : undefined,
      },
    });
  }, [boardList]);

  const changeBoard = (next: MaterialBoardId) => {
    setBoard(next);
    setSelectedTaxonomy(BOARD_ARTIFACT_TYPE[next]);
    setDeepLinkAction({
      nonce: `material-catalog:board:${next}:${Date.now()}`,
      action: {
        version: 1,
        tab: "materials",
        query: "",
      },
    });
    const url = new URL(window.location.href);
    url.searchParams.set("board", next);
    url.searchParams.set("taxonomy", BOARD_ARTIFACT_TYPE[next]);
    url.searchParams.delete("artifactId");
    url.searchParams.delete("revisionId");
    url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url.toString());
  };

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${className}`}>
      <div className="shrink-0 px-1 pt-1">
        <CanvasSubTabs
          tabs={boardList.map((b) => ({ id: b.id, label: b.label }))}
          active={activeBoard ?? ""}
          onChange={(id) => changeBoard(id as MaterialBoardId)}
          accent={accent}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MaterialLibrary
          key={activeBoard || "all"}
          materials={[]}
          accent={accent}
          hideSeeAll
          action={deepLinkAction}
          initialLevel="more"
          lockLevel="more"
          fetchPrimary={false}
          fetchMore
          curatedType={
            selectedTaxonomy
          }
          emptyHint={tt("这个板块的素材正在充实中，稍后再来看看。")}
        />
      </div>
    </div>
  );
}
