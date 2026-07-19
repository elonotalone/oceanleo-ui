import { normalizeTimelineDoc } from "./timeline-model";
import type { TimelineDoc } from "./types";

export interface TimelineRenderRequest {
  timeline: TimelineDoc;
  title?: string;
  site_id?: string;
  cover_url?: string;
  parent_id?: string;
}

/**
 * Pin and normalize the exact serializable model sent to FFmpeg. The preview
 * engine consumes the same normalization function, preventing per-surface
 * defaults from drifting.
 */
export function timelineRenderRequestBody(
  payload: TimelineRenderRequest,
  requestId?: string,
): TimelineRenderRequest & { request_id?: string } {
  return {
    ...payload,
    timeline: normalizeTimelineDoc(payload.timeline),
    ...(requestId ? { request_id: requestId } : {}),
  };
}
