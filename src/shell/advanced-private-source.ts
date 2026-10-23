import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

const AUDIO_MEDIA = new Set(["audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/webm", "audio/flac"]);

export function isPrivateEditorSourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === new URL(GATEWAY_BASE).origin && !parsed.username && !parsed.password &&
      /^\/v1\/editor-sources\/[a-f0-9]{64}$/.test(parsed.pathname);
  } catch { return false; }
}

/** Immutable owner-private audio inputs/checkpoints, independent of Library roots. */
export async function uploadPrivateEditorSource(file: File, _options?: unknown): Promise<{
  ok: boolean; error?: string; data?: { file: { url: string } };
}> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "请登录后再保存" };
  const body = new FormData(); body.append("file", file, file.name);
  const response = await fetch(`${GATEWAY_BASE}/v1/editor-sources`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, credentials: "include", body,
  });
  if (!response.ok) return { ok: false, error: "音频源上传失败" };
  const receipt = (await response.json()).file;
  if (!receipt || !/^[a-f0-9]{64}$/.test(receipt.digest) || receipt.bytes !== file.size ||
      typeof receipt.key !== "string" || !/^u\/[0-9a-f-]{36}\/editor-sources\/[A-Za-z0-9._~/-]+$/i.test(receipt.key) ||
      !AUDIO_MEDIA.has(receipt.mime)) return { ok: false, error: "音频源上传失败" };
  const url = new URL(`${GATEWAY_BASE}/v1/editor-sources/${receipt.digest}`);
  url.searchParams.set("key", receipt.key); url.searchParams.set("size", String(receipt.bytes)); url.searchParams.set("mime", receipt.mime);
  return { ok: true, data: { file: { url: url.href } } };
}

export async function readPrivateEditorSource(url: string, init: RequestInit = {}): Promise<Response> {
  if (!isPrivateEditorSourceUrl(url)) return fetch(url, init);
  const token = await accessToken();
  if (!token) throw new Error("请先登录");
  return fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, credentials: "include" });
}
