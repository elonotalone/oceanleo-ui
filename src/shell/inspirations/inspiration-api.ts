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
