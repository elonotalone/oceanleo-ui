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
  if (
    item.artifactId &&
    item.revisionId &&
    item.artifact &&
    item.artifact.artifactId === item.artifactId &&
    item.artifact.revisionId === item.revisionId
  ) {
    return {
      ok: false,
      error:
        "视频 Library 工程必须通过带来源闭包与 CAS 回执的 typed revision 保存；本地 graph 投影不能作为持久化回执。",
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
