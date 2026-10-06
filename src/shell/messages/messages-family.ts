// `imEnabledHere()` 的判定细节（纯函数，无任何运行时依赖，方便单测）。
// 契约 §9.13：境内版（域名家族 cn）不出现任何消息入口；未登录也不出现。
import type { DomainFamily } from "../../contracts/domain-family";

/** 这个家族、这个登录状态下，消息板块是否可用。 */
export function imEnabledFor(family: DomainFamily, signedIn: boolean): boolean {
  if (family === "cn") return false;
  return signedIn;
}

/** 网关 http(s) 地址 → 消息实时通道地址（契约 §6.1）。地址不合格返回 null。 */
export function imSocketUrl(gatewayBase: string): string | null {
  const base = (gatewayBase || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  if (/^https:\/\//i.test(base)) return `${base.replace(/^https:/i, "wss:")}/v1/im/ws`;
  if (/^http:\/\//i.test(base)) return `${base.replace(/^http:/i, "ws:")}/v1/im/ws`;
  return null;
}
