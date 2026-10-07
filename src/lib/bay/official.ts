// 官方发布者：信息流素材卡、免费领取页用来显示「OceanLeo」。失败不抛，回落到内置身份。

import { bayGet } from "./http";

export interface BayOfficialPublisher {
  user_id: string | null;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  headline?: string;
  official: true;
}

const FALLBACK: BayOfficialPublisher = {
  user_id: null,
  handle: "oceanleo",
  display_name: "OceanLeo",
  avatar_url: null,
  headline: "OceanLeo 官方素材",
  official: true,
};

let cached: BayOfficialPublisher | null = null;

function asPublisher(value: unknown): BayOfficialPublisher | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.handle !== "string" || !row.handle) return null;
  if (typeof row.display_name !== "string" || !row.display_name) return null;
  return {
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    handle: row.handle,
    display_name: row.display_name,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    headline: typeof row.headline === "string" ? row.headline : undefined,
    official: true,
  };
}

/** `GET /v1/talent/bay/official`。成功后模块内缓存；任何失败返回内置身份，不抛。 */
export async function getBayOfficialPublisher(): Promise<BayOfficialPublisher> {
  if (cached) return cached;
  try {
    const body = await bayGet<{ publisher?: unknown }>("/v1/talent/bay/official", { anonymous: true });
    const publisher = asPublisher(body?.publisher);
    if (!publisher) return FALLBACK;
    cached = publisher;
    return cached;
  } catch {
    return FALLBACK;
  }
}
