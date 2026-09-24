import type { LibraryItem } from "../library-data";
import type { VideoCanvasGraph } from "./video-canvas-schema";

/** 工作流画布专业页不可用，不是双引擎交接。 */
export const VIDEO_CANVAS_DUAL_ENGINE_HANDOFF = false;

export function videoCanvasLeavePolicy() {
  return { wait: false, confirm: false, beforeunload: false } as const;
}

export function flushVideoCanvasGraph(
  item: LibraryItem,
  graph: VideoCanvasGraph,
): { ok: true; item: LibraryItem } {
  return {
    ok: true,
    item: {
      ...item,
      meta: { ...item.meta, graph },
    },
  };
}
