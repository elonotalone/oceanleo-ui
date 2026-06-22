"use client";

// ============================================================================
// @oceanleo/ui — 文件库 master-detail（doctrine v4，单一事实源）
// ----------------------------------------------------------------------------
// 「文件库」侧栏子栏（master）+ 主区详情（detail）：
//   子栏 LibrarySubNav：列文件库的四个分区（上传文件 / 作品 / 素材 / 知识库）。
//   主区 LibraryDetail：渲染受控的 FileLibrary（hideHeader），按选中分区显示其
//     条目网格 / 上传区 / 预览。
// 子栏与主区通过 useWorkspaceSelection("library") 共享当前分区。
//
// 文件库本身的「条目列表 + 跨站分区 + 上传 + 预览」逻辑全在 FileLibrary 里（复杂、
// 自洽），这里只把「分区选择」上提到侧栏，避免重写那套数据逻辑。
// ============================================================================

import { FileLibrary, LIBRARY_TABS, type LibraryTab, type SiteOption } from "./FileLibrary";
import { useWorkspaceSelection } from "./WorkspaceSelection";

function currentTab(sel: string | null): LibraryTab {
  return (LIBRARY_TABS.find((t) => t.id === sel)?.id as LibraryTab) || "files";
}

// ----------------------------------------------------------------------------
// 侧栏子栏：文件库四分区
// ----------------------------------------------------------------------------
export function LibrarySubNav({ accent = "#0ea5e9" }: { accent?: string }) {
  const [sel, setSel] = useWorkspaceSelection("library");
  const tab = currentTab(sel);
  return (
    <div className="space-y-0.5">
      {LIBRARY_TABS.map((t) => {
        const on = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setSel(t.id)}
            className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] transition ${
              on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
            }`}
            style={on ? { background: accent } : undefined}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 主区详情：受控 FileLibrary（按选中分区）
// ----------------------------------------------------------------------------
export function LibraryDetail({
  siteId,
  siteName,
  sites,
  accent = "#0ea5e9",
}: {
  siteId: string;
  siteName?: string;
  sites?: SiteOption[];
  accent?: string;
}) {
  const [sel, setSel] = useWorkspaceSelection("library");
  const tab = currentTab(sel);
  return (
    <FileLibrary
      siteId={siteId}
      siteName={siteName}
      sites={sites}
      accent={accent}
      tab={tab}
      onTabChange={(t) => setSel(t)}
      hideHeader
    />
  );
}
