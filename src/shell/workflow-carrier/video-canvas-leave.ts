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
  admission?: { sourceReady?: boolean; error?: string },
): { ok: true; item: LibraryItem } | { ok: false; error: string } {
  if (admission && admission.sourceReady === false) {
    return {
      ok: false,
      error:
        admission.error ||
        "工作流源未成功载入，未改用空白图画覆盖原件。",
    };
  }
  return {
    ok: true,
    item: {
      ...item,
      meta: { ...item.meta, graph },
    },
  };
}
