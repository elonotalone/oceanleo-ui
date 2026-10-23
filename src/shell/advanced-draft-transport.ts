import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

/** Working documents have their own owner-checked storage, never Library rows. */
export async function uploadPrivateWorkingDraft(file: File): Promise<{
  ok: boolean; error?: string; data?: { file: { url: string; meta: Record<string, unknown> } };
}> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "请登录后再保存" };
  const body = new FormData();
  body.append("file", file, file.name);
  const response = await fetch(`${GATEWAY_BASE}/v1/editor-drafts`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body, credentials: "include",
  });
  if (!response.ok) return { ok: false, error: "暂时无法保存私有工作文档" };
  const receipt = (await response.json()).file;
  if (!receipt || !/^[a-f0-9]{64}$/.test(receipt.digest) ||
      typeof receipt.key !== "string" || !/^u\/[0-9a-f-]{36}\/editor-drafts\/[A-Za-z0-9._~/-]+$/i.test(receipt.key) ||
      receipt.bytes !== file.size) return { ok: false, error: "存储服务没有确认草稿地址" };
  const url = new URL(`${GATEWAY_BASE}/v1/editor-drafts/${receipt.digest}`);
  url.searchParams.set("key", receipt.key);
  url.searchParams.set("size", String(receipt.bytes));
  return { ok: true, data: { file: { url: url.href, meta: { content_digest: receipt.digest } } } };
}

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
