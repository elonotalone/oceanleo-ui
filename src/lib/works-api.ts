"use client";

import { accessToken } from "./auth/client";
import { gatewayBase } from "./auth/config";
import { normalizeWork, type Work, type WorkPreviewResult, type WorkStopResult, type WorkUpdate, type WorkLink, type WorkKind } from "../shell/works/model";

export interface CreateLinkWorkInput { title: string; links: WorkLink[]; kind?: WorkKind; note?: string }
export interface EmbedCheckResult { embeddable: boolean | null; reason: "ok" | "x-frame-options" | "csp-frame-ancestors" | "unreachable" | "invalid" }

export class WorksApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;
  readonly detailMessage: string;

  constructor(status: number, code: string, detail?: unknown) {
    super(code || `HTTP ${status}`);
    this.name = "WorksApiError";
    this.status = status;
    this.code = code || `HTTP ${status}`;
    this.detail = detail;
    this.detailMessage = errorMessage(detail);
  }

  get unsupported(): boolean {
    return this.status === 404 || this.status === 405;
  }
}

type WorkEnvelope = { work?: unknown };
type WorksEnvelope = { items?: unknown };

function errorMessage(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const value = body as { message?: unknown; detail?: unknown };
  if (typeof value.message === "string" && value.message.trim()) return value.message.trim();
  if (value.detail && typeof value.detail === "object" && !Array.isArray(value.detail)) {
    const nested = value.detail as { message?: unknown };
    if (typeof nested.message === "string" && nested.message.trim()) return nested.message.trim();
  }
  return "";
}

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
  createLink(input: CreateLinkWorkInput, signal?: AbortSignal): Promise<Work>;
  update(id: string, input: WorkUpdate, signal?: AbortSignal): Promise<Work>;
  remove(id: string, signal?: AbortSignal): Promise<void>;
  preview(id: string, signal?: AbortSignal): Promise<WorkPreviewResult>;
  stop(id: string, signal?: AbortSignal): Promise<WorkStopResult>;
}

export const worksApi: WorksApi = {
  async list(signal) {
    return requireWorks(await request<WorksEnvelope>("/v1/works", { signal }));
  },
  async createLink(input, signal) {
    const body = await request<WorkEnvelope>("/v1/works/links", { method: "POST", body: JSON.stringify(input), signal });
    return requireWork(body.work ?? body);
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
    return request<WorkStopResult>(`/v1/works/${encodeURIComponent(id)}/stop`, {
      method: "POST",
      signal,
    });
  },

};

export async function embedCheck(url: string, signal?: AbortSignal): Promise<EmbedCheckResult> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) return { embeddable: false, reason: "invalid" };
    return request<EmbedCheckResult>(`/v1/works/embed-check?url=${encodeURIComponent(parsed.href)}`, { signal });
  } catch { return { embeddable: false, reason: "invalid" }; }
}

export const createLinkWork = (input: CreateLinkWorkInput, signal?: AbortSignal) => worksApi.createLink(input, signal);
export const updateLinkWork = (id: string, input: WorkUpdate, signal?: AbortSignal) => worksApi.update(id, input, signal);
export const deleteWork = (id: string, signal?: AbortSignal) => worksApi.remove(id, signal);
