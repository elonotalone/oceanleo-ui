"use client";

import { WebsiteRequestError, websiteRequest } from "./website-runtime";

export type WebsitePublicationState = "live" | "stopped" | "not_published";
export interface WebsitePublication {
  state: WebsitePublicationState; kind: "runtime" | "static" | null; url: string | null;
  commit: string | null; stoppingSessions: number;
}
export interface WebsitePublicationResult extends WebsitePublication { stopConfirmed: boolean }

export type WebsitePublicationErrorCode = "unauthorized" | "missing" | "changed" | "busy" | "unavailable" | "failed";
/** Closed code only; server text never reaches the UI. */
export class WebsitePublicationError extends Error {
  constructor(readonly code: WebsitePublicationErrorCode) {
    super("Website publication request failed");
    this.name = "WebsitePublicationError";
  }
}

const STATES = new Set<string>(["live", "stopped", "not_published"]);
const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
/** Only a live https *.oceanleo.app address without credentials or query becomes a link. */
function publicUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".oceanleo.app") && !url.username && !url.password
      && !url.search && !url.hash ? value : null;
  } catch { return null; }
}
function publication(value: unknown): WebsitePublication {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (!STATES.has(String(body.state))) throw new WebsitePublicationError("failed");
  const state = body.state as WebsitePublicationState;
  return {
    state, kind: body.kind === "runtime" || body.kind === "static" ? body.kind : null,
    url: state === "live" ? publicUrl(body.url) : null,
    commit: typeof body.commit === "string" && /^[0-9a-f]{7,64}$/i.test(body.commit) ? body.commit : null,
    stoppingSessions: count(body.stopping_sessions),
  };
}
async function request(projectId: string, suffix: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  try {
    return await websiteRequest<Record<string, unknown>>(projectId, suffix, init);
  } catch (caught) {
    if (caught instanceof WebsiteRequestError) {
      const status = caught.status;
      throw new WebsitePublicationError(status === 401 || status === 403 ? "unauthorized" : status === 404 ? "missing"
        : status === 409 ? "changed" : status === 429 ? "busy" : status >= 500 ? "unavailable" : "failed");
    }
    if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
    throw new WebsitePublicationError("failed");
  }
}
async function offline(projectId: string, operation: "stop" | "unpublish"): Promise<WebsitePublicationResult> {
  const body = await request(projectId, "/publication/" + operation, { method: "POST" });
  return { ...publication(body), stopConfirmed: body.stop_confirmed === true };
}

export const websitePublicationApi = {
  get: async (projectId: string, signal?: AbortSignal) => publication(await request(projectId, "/publication", { signal })),
  stop: (projectId: string) => offline(projectId, "stop"),
  unpublish: (projectId: string) => offline(projectId, "unpublish"),
};
export type WebsitePublicationApi = typeof websitePublicationApi;
