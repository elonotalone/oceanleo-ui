"use client";

// ============================================================================
// @oceanleo/ui — VideoTimelineEditor：独立可用的组合形态
// ----------------------------------------------------------------------------
// 左侧 VideoTimelineControls（工具窄栏）+ 右侧 VideoTimelineStage（预览+时间线），
// 共享一个 useVideoTimeline。宿主壳若要自排版（工具进左栏、主区进右区），直接
// 调 useVideoTimeline 并分别渲染两个子组件即可（同 AdvancedImageEditor 三件套）。
// ============================================================================

import type { LibraryItem } from "../library-data";
import { useVideoTimeline } from "./use-video-timeline";
import { VideoTimelineControls } from "./VideoTimelineControls";
import { VideoTimelineStage } from "./VideoTimelineStage";

export interface VideoTimelineEditorProps {
  item: LibraryItem;
  siteId?: string;
  /** 主题色。 */
  accent?: string;
  /** 渲染导出成功回库后回调（参数为成品 URL）。 */
  onSaved?: (url: string) => void;
}

export function VideoTimelineEditor({
  item,
  siteId = "",
  accent = "#4f46e5",
  onSaved,
}: VideoTimelineEditorProps) {
  const state = useVideoTimeline(item, siteId, onSaved);
  return (
    <div className="flex h-full min-h-0 bg-white">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-stone-200">
        <VideoTimelineControls state={state} accent={accent} />
      </div>
      <div className="min-w-0 flex-1">
        <VideoTimelineStage state={state} accent={accent} />
      </div>
    </div>
  );
}
