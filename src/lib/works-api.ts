"use client";

import { accessToken } from "./auth/client";
import { gatewayBase } from "./auth/config";
import { normalizeWork, type Work, type WorkPreviewResult, type WorkServerInput, type WorkUpdate } from "../shell/works/model";

export class WorksApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;

  constructor(status: number, code: string, detail?: unknown) {
    super(code || `HTTP ${status}`);
    this.name = "WorksApiError";
    this.status = status;
    this.code = code || `HTTP ${status}`;
    this.detail = detail;
  }

  get unsupported(): boolean {
    return this.status === 404 || this.status === 405;
  }
}

type WorkEnvelope = { work?: unknown };
type WorksEnvelope = { items?: unknown };

function errorCode(body: unknown, status: number): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return `HTTP ${status}`;
  const value = body as { code?: unknown; error?: unknown; detail?: unknown };
  if (typeof value.code === "string" && value.code.trim()) return value.code.trim();
  if (typeof value.error === "string" && value.error.trim()) return value.error.trim();
  if (value.detail && typeof value.detail === "object" && !Array.isArray(value.detail)) {
    const nested = value.detail as { code?: unknown };
    if (typeof nested.code === "string" && nested.code.trim()) return nested.code.trim();
  }
  return `HTTP ${status}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(gatewayBase() + path, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Empty mutation responses are valid; malformed successful payloads are
    // rejected by the caller's normalizer below.
  }
  if (!response.ok) throw new WorksApiError(response.status, errorCode(body, response.status), body);
  return body as T;
}

function requireWork(value: unknown): Work {
  const work = normalizeWork(value);
  if (!work) throw new WorksApiError(502, "response_malformed");
  return work;
}

function requireWorks(value: unknown): Work[] {
  const envelope = value && typeof value === "object" && !Array.isArray(value) ? value as WorksEnvelope : null;
  if (!Array.isArray(envelope?.items)) throw new WorksApiError(502, "response_malformed");
  return envelope.items.map(normalizeWork).filter((work): work is Work => Boolean(work));
}

export interface WorksApi {
  list(signal?: AbortSignal): Promise<Work[]>;
  createServer(input: WorkServerInput, signal?: AbortSignal): Promise<Work>;
  update(id: string, input: WorkUpdate, signal?: AbortSignal): Promise<Work>;
  remove(id: string, signal?: AbortSignal): Promise<void>;
  preview(id: string, signal?: AbortSignal): Promise<WorkPreviewResult>;
  stop(id: string, signal?: AbortSignal): Promise<WorkPreviewResult>;
  /** Optional capability hooks. W7 may expose these after the first API cut. */
  moveToServer?: (id: string, input: WorkServerInput, signal?: AbortSignal) => Promise<Work>;
  saveToCloud?: (id: string, signal?: AbortSignal) => Promise<Work>;
}

export const worksApi: WorksApi = {
  async list(signal) {
    return requireWorks(await request<WorksEnvelope>("/v1/works", { signal }));
  },
  async createServer(input, signal) {
    const body = await request<WorkEnvelope>("/v1/works/server", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    });
    return requireWork(body.work);
  },
  async update(id, input, signal) {
    const body = await request<WorkEnvelope>(`/v1/works/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
      signal,
    });
    return requireWork(body.work);
  },
  async remove(id, signal) {
    await request<unknown>(`/v1/works/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal,
    });
  },
  async preview(id, signal) {
    return request<WorkPreviewResult>(`/v1/works/${encodeURIComponent(id)}/preview`, {
      method: "POST",
      signal,
    });
  },
  async stop(id, signal) {
    return request<WorkPreviewResult>(`/v1/works/${encodeURIComponent(id)}/stop`, {
      method: "POST",
      signal,
    });
  },
};
