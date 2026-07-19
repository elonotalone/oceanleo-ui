"use client";

// ============================================================================
// @oceanleo/ui — 时间线服务端渲染客户端
// ----------------------------------------------------------------------------
// 浏览器预览是 canvas 软合成（不逐帧精确），成品导出走网关 ffmpeg 渲染任务：
//   POST {GATEWAY_BASE}/v1/video/render-timeline           → { job_id }
//   GET  {GATEWAY_BASE}/v1/video/render-timeline/{job_id}  → { status, url?, error? }
// ============================================================================

import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import {
  timelineRenderRequestBody,
  type TimelineRenderRequest,
} from "./render-contract";

export type RenderJobStatus =
  | "charging"
  | "queued"
  | "running"
  | "canceling"
  | "settling"
  | "done"
  | "error"
  | "canceled";

export interface RenderJobState {
  status: RenderJobStatus;
  url?: string;
  error?: string;
}

export type SubmitRenderPayload = TimelineRenderRequest;

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await accessToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

/** 提交渲染任务，返回 job_id。抛错时 message 已是可展示文案。 */
export async function submitRenderJob(
  payload: SubmitRenderPayload,
  signal?: AbortSignal,
  requestId?: string,
): Promise<string> {
  const headers = await authHeaders();
  if (!headers) throw new Error("未登录，无法导出");
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}/v1/video/render-timeline`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(timelineRenderRequestBody(payload, requestId)),
      cache: "no-store",
      signal,
    });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
    throw new Error("网络错误：无法连接到 AI 网关。");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    throw new Error(
      (data as { detail?: string } | null)?.detail || `导出请求失败 HTTP ${res.status}`,
    );
  }
  const jobId = (data as { job_id?: string } | null)?.job_id || "";
  if (!jobId) throw new Error("网关未返回渲染任务 ID");
  return jobId;
}

/** 查询一次渲染任务状态。 */
export async function getRenderJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<RenderJobState> {
  const headers = await authHeaders();
  if (!headers) throw new Error("未登录，无法查询导出状态");
  let res: Response;
  try {
    res = await fetch(
      `${GATEWAY_BASE}/v1/video/render-timeline/${encodeURIComponent(jobId)}`,
      { headers, cache: "no-store", signal },
    );
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
    throw new Error("网络错误：无法连接到 AI 网关。");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    throw new Error(
      (data as { detail?: string } | null)?.detail || `查询导出状态失败 HTTP ${res.status}`,
    );
  }
  const state = data as RenderJobState | null;
  if (!state?.status) throw new Error("网关返回的任务状态不合法");
  return state;
}

/** Best-effort cancellation: stop an already-submitted ffmpeg render. */
export async function cancelRenderJob(jobId: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers || !jobId) return;
  try {
    await fetch(
      `${GATEWAY_BASE}/v1/video/render-timeline/${encodeURIComponent(jobId)}`,
      {
        method: "DELETE",
        headers,
        cache: "no-store",
      },
    );
  } catch {
    // Cancellation is best effort; the server still expires completed jobs.
  }
}

/**
 * 提交 + 2s 轮询直到 done/error。onState 每次轮询回调（含首个 queued）。
 * 返回成品 URL；error 状态抛错。
 */
export async function renderTimeline(
  payload: SubmitRenderPayload,
  onState?: (state: RenderJobState, jobId: string) => void,
  pollMs = 2000,
  signal?: AbortSignal,
): Promise<string> {
  let jobId = crypto.randomUUID().replace(/-/g, "");
  try {
    jobId = await submitRenderJob(payload, signal, jobId);
    onState?.({ status: "queued" }, jobId);
    for (;;) {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        const onAbort = () => {
          window.clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        };
        const timer = window.setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, pollMs);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
      const state = await getRenderJob(jobId, signal);
      onState?.(state, jobId);
      if (state.status === "done") {
        if (!state.url) throw new Error("渲染完成但未返回成品 URL");
        return state.url;
      }
      if (state.status === "error") {
        throw new Error(state.error || "服务端渲染失败");
      }
      if (state.status === "canceled") {
        throw new DOMException("Aborted", "AbortError");
      }
    }
  } catch (caught) {
    if (
      jobId &&
      ((caught instanceof DOMException && caught.name === "AbortError") ||
        signal?.aborted)
    ) {
      await cancelRenderJob(jobId);
      // The POST may have been accepted just as the browser aborted its
      // response. Retry briefly against the client-generated id so that case
      // cannot leave an orphan render running.
      window.setTimeout(() => void cancelRenderJob(jobId), 500);
      window.setTimeout(() => void cancelRenderJob(jobId), 1_500);
      window.setTimeout(() => void cancelRenderJob(jobId), 5_000);
      throw new DOMException("Aborted", "AbortError");
    }
    throw caught;
  }
}
