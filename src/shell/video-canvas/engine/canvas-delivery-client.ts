import { authed } from "../../../lib/agent";
import { dispatchWorkspaceAction } from "../../workspace-actions";
import { submitRenderJob, getRenderJob, cancelRenderJob } from "../../video-editor/render-client";
import type { CanvasTimelineSource } from "../../video-editor/video-timeline-source";
import type { TimelineDoc } from "../../video-editor/types";
import { CanvasAdapterError, type CanvasProviderProgress, type CanvasTimelineRenderReceipt } from "./canvas-gateway";

export interface CanvasLibraryIdentity { artifactId: string; revisionId: string }

export function openCanvasLibraryItem(item: CanvasLibraryIdentity): void {
  dispatchWorkspaceAction({ nonce: crypto.randomUUID(), action: {
    version: 1, tab: "mine", itemId: item.artifactId, revisionId: item.revisionId, intent: "edit",
  } });
}

async function renderRequestId(requestId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`canvas-render:${requestId}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** FFmpeg is a streamed job: completed artifacts persist; unfinished jobs cancel/refund on restart. */
export async function renderComposedCanvas(input: {
  requestId: string; title: string; timeline: TimelineDoc; canvasSource: CanvasTimelineSource;
  signal?: AbortSignal; onProgress?: (progress: CanvasProviderProgress) => void; pollMs?: number;
}): Promise<CanvasTimelineRenderReceipt & { libraryItem: CanvasLibraryIdentity }> {
  const startedAt = new Date().toISOString();
  const requestId = await renderRequestId(input.requestId);
  const payload = { timeline: input.timeline, title: input.title, site_id: "video", canvas_source: input.canvasSource };
  let jobId = "";
  try {
    input.onProgress?.({ phase: "submitting", progress: 0.05 });
    jobId = await submitRenderJob(payload, input.signal, requestId);
    const deadline = Date.now() + 45 * 60_000;
    while (Date.now() < deadline) {
      const state = await getRenderJob(jobId, input.signal) as Awaited<ReturnType<typeof getRenderJob>> & {
        artifact_id?: string; revision_id?: string; error_code?: string; refund_status?: string;
      };
      input.onProgress?.({ phase: state.status === "settling" ? "finalizing" : "rendering",
        progress: state.status === "settling" ? 0.95 : 0.5, externalRunId: jobId });
      if (state.status === "done") {
        if (!state.url || !state.artifact_id || !state.revision_id) throw new Error("成片没有返回我的库条目，请稍后重试查询。");
        return { receiptId: input.requestId, jobId, url: state.url, mimeType: "video/mp4",
          provider: "oceanleo-timeline-ffmpeg", model: "oceanleo-convert", startedAt,
          completedAt: new Date().toISOString(), libraryItem: { artifactId: state.artifact_id, revisionId: state.revision_id },
          pricing: { billing: "provider", amount: null, currency: "OCEANLEO_CREDITS", estimated: false, label: "视频合成" } };
      }
      if (state.error_code === "gateway_restart") throw new CanvasAdapterError("gateway_restart", "网关重启中断了渲染，费用已自动退回。请重新生成成片。");
      if (state.status === "error" || state.status === "canceled") throw new CanvasAdapterError("render_failed", state.error || "渲染已取消，费用将退回。");
      await pause(input.pollMs ?? 2000, input.signal);
    }
    throw new CanvasAdapterError("render_timeout", "渲染仍未返回结果，请稍后查询。", { retryable: true });
  } catch (error) {
    if (input.signal?.aborted) {
      // The POST response may be lost after admission: its idempotent ID still cancels that job.
      await cancelRenderJob(jobId || requestId);
      throw new CanvasAdapterError("render_canceled", "已请求取消渲染，未交付的费用将退回。", { cancelled: true });
    }
    throw error;
  }
}

export async function handoffCanvasTimeline(input: {
  projectDocument: string; title: string; previous?: CanvasLibraryIdentity; signal?: AbortSignal;
}): Promise<CanvasLibraryIdentity> {
  const result = await authed<{ artifact_id: string; revision_id: string }>("/v1/video/render-timeline/handoff", {
    method: "POST", signal: input.signal, body: JSON.stringify({ project: JSON.parse(input.projectDocument), title: input.title,
      ...(input.previous ? { artifact_id: input.previous.artifactId, expected_revision_id: input.previous.revisionId } : {}) }),
  });
  if (!result.ok || !result.data?.artifact_id || !result.data.revision_id) throw new Error(result.error || "无法交接到时间线，请重试。");
  return { artifactId: result.data.artifact_id, revisionId: result.data.revision_id };
}
