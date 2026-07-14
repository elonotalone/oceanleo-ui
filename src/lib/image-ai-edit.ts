"use client";

// 高级工作台图片编辑器的「AI 改图」动作：画布当前状态 → 上传拿 URL →
// 网关 /v1/images/edit（DashScope 图生图）→ 返回结果图 URL。
// 网关只吃 URL 不吃字节，所以必须先经文件库上传。

import { uploadFile } from "./database";
import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";

export async function aiEditImage(
  prompt: string,
  image: Blob,
  opts: { siteId?: string } = {},
): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("未登录");

  const file = new File([image], `ai-edit-${Date.now()}.png`, { type: "image/png" });
  const uploaded = await uploadFile(file, { siteId: opts.siteId, title: "AI 改图底图" });
  if (!uploaded.ok || !uploaded.data?.file?.url) {
    throw new Error(uploaded.ok ? "上传底图失败" : uploaded.error);
  }

  const response = await fetch(`${GATEWAY_BASE}/v1/images/edit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      site_id: opts.siteId || "image",
      image_url: uploaded.data.file.url,
      prompt,
      n: 1,
    }),
    cache: "no-store",
  });
  let data: { images?: string[]; detail?: string } | null = null;
  try {
    data = (await response.json()) as { images?: string[]; detail?: string };
  } catch {
    /* non-JSON */
  }
  if (!response.ok) {
    throw new Error(data?.detail || `AI 改图失败 HTTP ${response.status}`);
  }
  const result = data?.images?.[0];
  if (!result) throw new Error("AI 没有返回结果图");
  return result;
}
