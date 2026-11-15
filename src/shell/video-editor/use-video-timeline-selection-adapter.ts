"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { selectionAdapterContext } from "../selection-adapter";
import type { SelectionAdapter } from "../selection-context";
import type { SelectionCommand } from "../selection-context";
import { viewOnlyContext } from "../collab/adapters/visual-readonly";
import type { VideoTimelineState } from "./use-video-timeline";
import { runVideoClipCommand, videoClipSelection, VIDEO_TIMELINE_REPLACE_IMAGE_EVENT } from "./video-edit-bar";

/**
 * 选中时间线片段时的编辑栏。控件清单与命令都在 `video-edit-bar.ts`（规范 id，D9 / D10）；
 * 外壳统一渲染控件；这里仅提供选区数据和命令。
 */
export function useVideoTimelineSelectionAdapter({
  state,
  readOnly = false,
  enabled = true,
  canReplaceImage = true,
}: {
  state: VideoTimelineState;
  enabled?: boolean;
  /** 只有宿主已挂载 Library picker 时才声明替换入口。 */
  canReplaceImage?: boolean;
  /** 只能查看：浮条里所有改片段的控件置灰并提示「你只能查看」，命令也不生效（播放 / 拖播放头在舞台上，不受影响）。 */
  readOnly?: boolean;
}): SelectionAdapter {
  const tt = useUI();
  const located = state.selected;
  const context = useMemo(
    () => (enabled && located ? videoClipSelection(located, tt, state.doc, { canReplaceImage }) : null),
    [enabled, located, state.doc, tt, canReplaceImage],
  );
  const viewContext = useMemo(
    () => viewOnlyContext(context, readOnly, tt),
    [context, readOnly, tt],
  );
  const command = (message: SelectionCommand) => {
    if (readOnly || !enabled || !viewContext || !located) return;
    runVideoClipCommand({ ...state, replaceImage: canReplaceImage ? (clipId) => {
      window.dispatchEvent(new window.CustomEvent(VIDEO_TIMELINE_REPLACE_IMAGE_EVENT, { detail: { clipId, doc: state.doc } }));
    } : undefined }, located, message);
  };
  return { context: selectionAdapterContext(viewContext), dispatch: command };
}
