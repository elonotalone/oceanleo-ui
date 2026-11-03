"use client";

import { websiteRequest } from "./website-runtime";

export type WebsitePublicationState = "live" | "stopped" | "not_published";
export interface WebsitePublication {
  state: WebsitePublicationState; kind: "runtime" | "static" | null; url: string | null;
  commit: string | null; stopping_sessions: number;
}
export interface WebsitePublicationResult extends WebsitePublication {
  operation: "stop" | "unpublish"; stopped_sessions: number; stop_confirmed: boolean;
}

const STATES = new Set<string>(["live", "stopped", "not_published"]);
const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
/** Only an https *.oceanleo.app address without credentials or query is shown as a link. */
function publicUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".oceanleo.app") && !url.username && !url.password && !url.search
      ? url.origin + "/" : null;
  } catch { return null; }
}
function publication(value: unknown): WebsitePublication {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const state = STATES.has(String(body.state)) ? body.state as WebsitePublicationState : "not_published";
  return {
    state, kind: body.kind === "runtime" || body.kind === "static" ? body.kind : null,
    url: state === "live" ? publicUrl(body.url) : null,
    commit: typeof body.commit === "string" && /^[0-9a-f]{7,64}$/i.test(body.commit) ? body.commit : null,
    stopping_sessions: count(body.stopping_sessions),
  };
}
async function offline(projectId: string, operation: "stop" | "unpublish"): Promise<WebsitePublicationResult> {
  const body = await websiteRequest<Record<string, unknown>>(projectId, "/publication/" + operation, { method: "POST" });
  return { ...publication(body), operation, stopped_sessions: count(body.stopped_sessions), stop_confirmed: body.stop_confirmed === true };
}

export const websitePublicationApi = {
  read: async (projectId: string, signal?: AbortSignal) => publication(await websiteRequest(projectId, "/publication", { signal })),
  stop: (projectId: string) => offline(projectId, "stop"),
  unpublish: (projectId: string) => offline(projectId, "unpublish"),
};
export type WebsitePublicationApi = typeof websitePublicationApi;
