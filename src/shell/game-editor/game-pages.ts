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
