"use client";

import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { isTaskContentId, taskAttachmentPath } from "../../lib/task-content-path";

export { taskAttachmentPath, taskAttachmentRoute } from "../../lib/task-content-path";

export interface TaskInlineArtifact {
  id: string;
  kind: string;
  title: string;
  content: string;
  created_at?: string;
}

export interface TaskContentClient {
  attachment(path: string, options?: { signal?: AbortSignal; maxBytes?: number }): Promise<Blob>;
  artifacts(taskId: string, signal?: AbortSignal): Promise<TaskInlineArtifact[]>;
  artifact(taskId: string, artifactId: string, signal?: AbortSignal): Promise<TaskInlineArtifact>;
}

export class TaskContentError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("无法读取文件，请重试。");
    this.name = "TaskContentError";
    this.status = status;
  }
}

export const TASK_ATTACHMENT_MAX_BYTES = 64 * 1024 * 1024;
export const TASK_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

async function limitedBlob(response: Response, maxBytes: number): Promise<Blob> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > TASK_ATTACHMENT_MAX_BYTES) throw new TaskContentError(413);
  const declared = Number(response.headers.get("Content-Length"));
  if (declared > maxBytes) { await response.body?.cancel(); throw new TaskContentError(413); }
  const reader = response.body?.getReader();
  if (!reader) throw new TaskContentError(502);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new TaskContentError(413); }
      chunks.push(new Uint8Array(value));
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new TaskContentError(502);
  return new Blob(chunks, { type: response.headers.get("Content-Type") || "application/octet-stream" });
}

function inlineArtifact(value: unknown): TaskInlineArtifact | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.content !== "string") return null;
  return {
    id: item.id,
    kind: typeof item.kind === "string" ? item.kind : "document",
    title: typeof item.title === "string" ? item.title : "",
    content: item.content,
    ...(typeof item.created_at === "string" ? { created_at: item.created_at } : {}),
  };
}

export function createTaskContentClient(options: {
  fetchImpl?: typeof fetch;
  tokenImpl?: () => Promise<string | null>;
  baseUrl?: string;
} = {}): TaskContentClient {
  const request = async (path: string, signal?: AbortSignal): Promise<Response> => {
    const token = await (options.tokenImpl || accessToken)();
    const response = await (options.fetchImpl || fetch)(`${options.baseUrl ?? GATEWAY_BASE}${path}`, {
      method: "GET", signal, cache: "no-store", credentials: "include", redirect: "error",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!response.ok) throw new TaskContentError(response.status);
    return response;
  };
  const artifactPath = (taskId: string, id?: string) => {
    if (!isTaskContentId(taskId) || (id !== undefined && !/^[A-Za-z0-9_-]{1,160}$/.test(id))) throw new TaskContentError(400);
    return `/v1/tasks/${taskId}/artifacts${id === undefined ? "" : `/${encodeURIComponent(id)}`}`;
  };
  return {
    async attachment(path, { signal, maxBytes = TASK_ATTACHMENT_MAX_BYTES } = {}) {
      const scoped = taskAttachmentPath(path);
      if (!scoped) throw new TaskContentError(400);
      return limitedBlob(await request(scoped, signal), maxBytes);
    },
    async artifacts(taskId, signal) {
      const result = await (await request(artifactPath(taskId), signal)).json() as { items?: unknown[] };
      if (!Array.isArray(result.items)) throw new TaskContentError(502);
      return result.items.map(inlineArtifact).filter((item): item is TaskInlineArtifact => item !== null);
    },
    async artifact(taskId, artifactId, signal) {
      const result = await (await request(artifactPath(taskId, artifactId), signal)).json() as { artifact?: unknown };
      const item = inlineArtifact(result.artifact);
      if (!item) throw new TaskContentError(502);
      return item;
    },
  };
}

export const taskContentClient = createTaskContentClient();

/** No caller-Library grant or storage URL is used for another person's task. */
export async function loadTaskAttachmentBlobUrl(path: string, mime = "", options: {
  client?: TaskContentClient;
  maxBytes?: number;
  signal?: AbortSignal;
} = {}): Promise<string> {
  const blob = await (options.client || taskContentClient).attachment(path, options);
  const typed = mime && blob.type === "application/octet-stream" ? new Blob([blob], { type: mime }) : blob;
  return URL.createObjectURL(typed);
}
