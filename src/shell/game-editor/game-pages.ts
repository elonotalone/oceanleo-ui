import type { AdvancedEditorPagesAdapter } from "../plugin-chrome/plugin-pages";

export const GAME_PRO_UNAVAILABLE = "专业编辑即将到来";

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
    proUnavailableReason: GAME_PRO_UNAVAILABLE,
    aux: [GAME_CODE_PAGE],
    activePageId,
    onSelectPage,
  };
}

export function gameModeUnavailable() {
  return {
    current: "normal" as const,
    setMode: () => {},
    unavailableReason: GAME_PRO_UNAVAILABLE,
  };
}

/** 游戏没有第二套专业引擎；切页只是同实例的 Code 辅助页。 */
export const GAME_DUAL_ENGINE_HANDOFF = false;

export function gameLeavePolicy() {
  return { wait: false, confirm: false, beforeunload: false } as const;
}
