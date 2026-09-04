/**
 * Display/export adapter: OpenVideo JSON → TimelineDoc so the existing
 * canvas preview and gateway renderTimeline path can run without Remotion.
 * The source of truth remains OpenVideo JSON.
 */
export { openVideoToTimelineDoc } from "./legacy-conversion";
