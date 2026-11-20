export interface BayInspiration {
  id: string;
  site_key: string;
  app_id: string;
  section: string;
  title: string;
  prompt: string;
  params: { hint?: string; set?: Record<string, unknown>; imageUrl?: string; remark?: string; data?: unknown };
  position: number;
  source: "catalog";
  /** 3:2 picture (contract §2.6). Absent from servers older than this wave; null when the inspiration has none. */
  image_url?: string | null;
}

/** The card picture: the server's `image_url`, else the raw `params.imageUrl` an older server passes through. */
export function inspirationImage(item: BayInspiration): string | null {
  const value = item.image_url ?? item.params?.imageUrl;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The card's one line: the hint, else the prompt. */
export function inspirationLine(item: BayInspiration): string {
  return (item.params?.hint || item.prompt || "").replace(/\s+/g, " ").trim();
}

export function inspirationUrl(base: string, scope: { siteKey?: string; appId?: string; offset?: number; limit?: number }): string {
  const params = new URLSearchParams({ limit: String(scope.limit ?? 200), offset: String(scope.offset ?? 0) });
  if (scope.siteKey) params.set("siteKey", scope.siteKey);
  if (scope.appId) params.set("appId", scope.appId);
  return `${base.replace(/\/$/, "")}/v1/bay/inspirations?${params}`;
}

export async function fetchInspirations(base: string, scope: { siteKey?: string; appId?: string; offset?: number; limit?: number }, signal?: AbortSignal): Promise<{ items: BayInspiration[]; total: number }> {
  const response = await fetch(inspirationUrl(base, scope), { signal, credentials: "omit" });
  if (!response.ok) throw new Error("Inspiration catalog unavailable");
  return response.json();
}
