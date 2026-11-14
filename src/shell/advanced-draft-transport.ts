import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

/** Authenticate only our exact draft route; legacy URLs keep their old read path. */
export async function readPrivateWorkingDraft(url: string, init: RequestInit): Promise<Response> {
  const parsed = new URL(url);
  const gateway = new URL(GATEWAY_BASE);
  if (parsed.origin !== gateway.origin || !/^\/v1\/editor-drafts\/[a-f0-9]{64}$/.test(parsed.pathname)) {
    return fetch(url, init);
  }
  const token = await accessToken();
  if (!token) throw new Error("服务器草稿暂时无法读取，请重新载入");
  return fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, credentials: "include" });
}
