"use client";

// ============================================================================
// @oceanleo/ui — 文件库 master-detail（doctrine v4，单一事实源）
// ----------------------------------------------------------------------------
// 「文件库」侧栏子栏（master）+ 主区详情（detail）。
//
// 2026-07-02 操作员拍板：全系列（主站 + 27 功能子站）文件库**完完全全一样**、
// 完全打通（同一个 agent_artifacts 表 + 跨站 cookie 登录 → 任何站产出所有站可见）。
// 侧栏分区对齐主站 oceanleo.com/library：
//   全部 / 图片 / 文档 / 幻灯片 / 视频 / 音频(新) / 3D(新) / 我的收藏
// 主区 = 共享 ArtifactLibrary（搜索 + 网格/列表 + 预览 + 收藏）。
//
// 旧的「上传文件 / 作品 / 素材 / 知识库」四 tab FileLibrary 保留导出（上传与知识库
// 能力仍有站在用；LibrarySubNav 不再用它）。
// ============================================================================

import {
  ArtifactLibrary,
  ARTIFACT_FILTERS,
  type ArtifactFilter,
} from "./ArtifactLibrary";
import type { SiteOption } from "./FileLibrary";
import { useWorkspaceSelection } from "./WorkspaceSelection";
import { useUI } from "../i18n/ui/useUI";

function currentFilter(sel: string | null): ArtifactFilter {
  return (ARTIFACT_FILTERS.find((f) => f.id === sel)?.id as ArtifactFilter) || "all";
}

// ----------------------------------------------------------------------------
// 侧栏子栏：文件库分区（对齐主站）
// ----------------------------------------------------------------------------
export function LibrarySubNav({ accent = "#0ea5e9" }: { accent?: string }) {
  const tt = useUI();
  const [sel, setSel] = useWorkspaceSelection("library");
  const active = currentFilter(sel);
  return (
    <div className="space-y-0.5">
      {ARTIFACT_FILTERS.map((f) => {
        const on = f.id === active;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => setSel(f.id)}
            className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] transition ${
              on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
            }`}
            style={on ? { background: accent } : undefined}
          >
            {tt(f.label)}
          </button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 主区详情：受控 ArtifactLibrary（按选中分区）
// ----------------------------------------------------------------------------
export function LibraryDetail({
  accent = "#0ea5e9",
}: {
  /** @deprecated 文件库已全系列打通，不再按站分区；保留形参兼容旧调用方。 */
  siteId?: string;
  /** @deprecated 同上。 */
  siteName?: string;
  /** @deprecated 同上。 */
  sites?: SiteOption[];
  accent?: string;
}) {
  const [sel, setSel] = useWorkspaceSelection("library");
  const filter = currentFilter(sel);
  return (
    <div className="h-[calc(100dvh-1px)] overflow-y-auto">
      <ArtifactLibrary
        accent={accent}
        filter={filter}
        onFilterChange={(f) => setSel(f)}
      />
    </div>
  );
}
