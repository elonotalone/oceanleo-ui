// 云电脑公开网址：端口 / 名字校验、从已有 url 取后缀、检测与状态文案。域名不写死。
import type { BayAppEndpoint, BayEndpointCheck } from "../../../lib/bay/app-endpoints";

const PORT_MIN = 1024;
const PORT_MAX = 65535;
const SLUG_MIN = 3;
const SLUG_MAX = 32;

export function portProblem(raw: string): string | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return "端口必须是 1024 到 65535 的整数";
  const port = Number(text);
  if (port < PORT_MIN || port > PORT_MAX) return "端口必须是 1024 到 65535 的整数";
  return null;
}

export function parsePort(raw: string): number | null {
  return portProblem(raw) ? null : Number(raw.trim());
}

export function slugProblem(raw: string): string | null {
  const slug = raw.trim();
  if (!slug) return null;
  if (slug.length < SLUG_MIN) return "名字至少 3 位";
  if (slug.length > SLUG_MAX) return "名字不能超过 32 位";
  if (!/^[a-z0-9-]+$/.test(slug)) return "名字只能用小写字母、数字和连字符";
  if (slug.startsWith("-") || slug.endsWith("-")) return "名字不能以连字符开头或结尾";
  if (slug.includes("--")) return "名字不能包含连续两个连字符";
  return null;
}

/** 从已有公开网址取出 `{slug}` 后面的那截（含 `--`），界面用它拼预览，不写死域名。 */
export function hostSuffixFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const at = host.indexOf("--");
    if (at <= 0) return null;
    return host.slice(at);
  } catch {
    return null;
  }
}

export function suffixFromEndpoints(items: readonly BayAppEndpoint[]): string | null {
  for (const item of items) {
    const suffix = hostSuffixFromUrl(item.url);
    if (suffix) return suffix;
  }
  return null;
}

export function previewPublicUrl(slug: string, suffix: string | null): string | null {
  const name = slug.trim();
  if (!name || !suffix || slugProblem(name)) return null;
  return `https://${name}${suffix}`;
}

export function checkOutcomeText(result: Pick<BayEndpointCheck, "ok" | "status_code" | "error">): string {
  if (result.ok) return `应用回应了（HTTP ${result.status_code ?? 0}）`;
  return result.error || "";
}

export function checkHintText(): string {
  return "确认应用正在云电脑上运行，并且监听的是 127.0.0.1 或 0.0.0.0 的这个端口";
}

export function statusButton(status: BayAppEndpoint["status"]): { action: "pause" | "resume"; label: "暂停" | "恢复" } {
  return status === "active" ? { action: "pause", label: "暂停" } : { action: "resume", label: "恢复" };
}

export function endpointStatusLabel(status: BayAppEndpoint["status"]): "开放中" | "已暂停" {
  return status === "active" ? "开放中" : "已暂停";
}

export function pickableEndpoints(items: readonly BayAppEndpoint[], keepAppId?: string | null): BayAppEndpoint[] {
  return items.filter((item) => item.app_id == null || (keepAppId != null && item.app_id === keepAppId));
}

export function endpointForApp(items: readonly BayAppEndpoint[], appId: string): BayAppEndpoint | null {
  return items.find((item) => item.app_id === appId) || null;
}

export function formatEndpointTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 19).replace("T", " ");
}
