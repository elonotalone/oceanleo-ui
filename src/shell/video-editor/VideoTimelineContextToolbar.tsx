"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type { SelectionCommand } from "../selection-context";
import { viewOnlyContext } from "../collab/adapters/visual-readonly";
import type { VideoTimelineState } from "./use-video-timeline";
import { runVideoClipCommand, videoClipSelection } from "./video-edit-bar";

/**
 * 选中时间线片段时的编辑栏。控件清单与命令都在 `video-edit-bar.ts`（规范 id，D9 / D10）；
 * 这里只把它接到共享 SelectionToolbar 上。
 */
export function VideoTimelineContextToolbar({
  state,
  accent = "#4f46e5",
  readOnly = false,
}: {
  state: VideoTimelineState;
  accent?: string;
  /** 只能查看：浮条里所有改片段的控件置灰并提示「你只能查看」，命令也不生效（播放 / 拖播放头在舞台上，不受影响）。 */
  readOnly?: boolean;
}) {
  const tt = useUI();
  const located = state.selected;
  const context = useMemo(
    () => (located ? videoClipSelection(located, tt) : null),
    [located, tt],
  );
  const viewContext = useMemo(
    () => viewOnlyContext(context, readOnly, tt),
    [context, readOnly, tt],
  );
  if (!viewContext || !located) return null;
  const command = (message: SelectionCommand) => {
    if (readOnly) return;
    runVideoClipCommand(state, located, message);
  };
  return (
    <SelectionToolbar
      context={viewContext}
      onCommand={command}
      accent={accent}
    />
  );
}
