import { useEffect, useMemo } from "react";
import type { AdvancedEditorPagesAdapter } from "../plugin-chrome/plugin-pages";
import { usePluginPage } from "../plugin-chrome/plugin-page-store";
import type { PluginThemeId } from "../plugin-theme";

export const GAME_CODE_PAGE = {
  id: "code",
  label: "Code",
  kind: "aux" as const,
  icon: "code" as const,
};

export function gamePagesAdapter(
  activePageId: string,
  onSelectPage: (id: string) => void,
): AdvancedEditorPagesAdapter {
  return {
    aux: [GAME_CODE_PAGE],
    activePageId,
    onSelectPage,
  };
}

/** 宿主页面行的页面存储 key：必须与壳按 adapter id（`game`）推出的 key 一致。 */
export const GAME_PAGE_PLUGIN_ID = "game" as PluginThemeId;

/**
 * 游戏当前页 = 宿主页面存储（页面行的唯一真源），不再自己留一份 useState。
 *
 * 缺陷（2026-10-22）：宿主只在点 aux 页（Code）时通知插件；点「编辑」（artifact）
 * 只写宿主存储、不回调。旧实现把 Code 记在自己的 state 里并回报给壳
 * （`adapter.pages.activePageId`），壳的同步 effect 立刻把存储改回 "code"，
 * 于是 Code → 点编辑 = 什么都不发生。现在两边读同一份存储，点哪页就是哪页。
 * 离开编辑器时回到编辑页，下一件游戏不会直接落在 Code。
 */
export function useGamePages(): {
  activePageId: string;
  pages: AdvancedEditorPagesAdapter;
} {
  const { pageId, setPage } = usePluginPage(GAME_PAGE_PLUGIN_ID);
  const activePageId = pageId === GAME_CODE_PAGE.id ? GAME_CODE_PAGE.id : "artifact";
  const pages = useMemo(
    () => gamePagesAdapter(activePageId, setPage),
    [activePageId, setPage],
  );
  useEffect(() => () => setPage("artifact"), [setPage]);
  return { activePageId, pages };
}

/** 游戏只有一个模式（无专业页）；切页只是同实例的 Code 辅助页。 */
export const GAME_DUAL_ENGINE_HANDOFF = false;

export function gameLeavePolicy() {
  return { wait: false, confirm: false, beforeunload: false } as const;
}
