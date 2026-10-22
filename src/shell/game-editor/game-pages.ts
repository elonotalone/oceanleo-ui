import type { AdvancedEditorPagesAdapter } from "../plugin-chrome/plugin-pages";

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

/** 游戏只有一个模式（无专业页）；切页只是同实例的 Code 辅助页。 */
export const GAME_DUAL_ENGINE_HANDOFF = false;

export function gameLeavePolicy() {
  return { wait: false, confirm: false, beforeunload: false } as const;
}
