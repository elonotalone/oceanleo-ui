import type { HostedSite } from "../../../api/hosted-sites";
import { createBayApp, listMyBayApps } from "../../../lib/bay/apps";
import { BayApiError } from "../../../lib/bay/http";

const FALLBACK = "没能上架到 Bay，请稍后重试。";

export async function listHostedSiteOnBay(
  site: HostedSite,
  siteKey: string,
): Promise<{ appId: string } | { error: string }> {
  try {
    const created = await createBayApp({
      source_kind: "hosted",
      hosted_site_id: site.id,
      title: site.title,
      posted_site: siteKey || null,
    });
    return { appId: created.app.id };
  } catch (error) {
    if (error instanceof BayApiError && error.status === 409) {
      try {
        const mine = await listMyBayApps();
        const existing = (mine.items || []).find((row) => row.hosted_site_id === site.id);
        if (existing) return { appId: existing.id };
      } catch {
        /* 用原来那句 409 说明 */
      }
      return { error: error.message || FALLBACK };
    }
    return { error: error instanceof BayApiError && error.message ? error.message : FALLBACK };
  }
}
