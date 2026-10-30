import { getClientHostConfig } from "../contracts/client-host-config";
import {
  CONFIGURED_DOMAIN_FAMILY,
  domainFamilyProfile,
  familyForHost,
  normalizeHost,
  type DomainFamily,
} from "../contracts/domain-family";

const HELP_CENTER_HOSTS = new Set([
  "help.oceanleo.com",
  "www.help.oceanleo.com",
  "help.oceanleo.cn",
  "www.help.oceanleo.cn",
]);

/** 帮助中心「怎么自己带密钥」；设置页与旧 /api/guide 都链到这里。 */
export const HELP_BYOK_ARTICLE_PATH = "/a/bring-your-own-key";

/**
 * True when this host *is* the help center. The shell 「帮助与反馈」
 * control must not render there (it would point at the same site).
 *
 * Apex + `www.` on both families. Port / case / trailing-dot stripped
 * via `normalizeHost`. Pure function; no DOM.
 */
export function isHelpCenterHost(host?: string | null): boolean {
  const h = normalizeHost(host);
  return h.length > 0 && HELP_CENTER_HOSTS.has(h);
}

/**
 * Help-center family: configured edition first, then the request host.
 * Cookie Domain stays host-derived; help links must follow the slot edition so
 * a cn LeoDev page on `p-<32hex>.dev.oceanleo.com` still opens help.oceanleo.cn.
 */
function helpFamilyFor(host?: string | null): DomainFamily {
  const injected = getClientHostConfig();
  if (injected) return injected.family;
  if (CONFIGURED_DOMAIN_FAMILY) return CONFIGURED_DOMAIN_FAMILY;
  const fromHost = familyForHost(host);
  return fromHost === "cn" || fromHost === "ws" ? fromHost : "com";
}

/**
 * 帮助中心 origin（含路径前缀）。com / cn 是独立的 help 主机；分身 ws 没有
 * `help.oceanbizs.com`，帮助中心就是门户自己的 `/help`（同一份 Vercel 构建），
 * 绝不回落到 help.oceanleo.com —— 那会把分身用户送去生产站、而且未登录。
 */
function helpCenterOrigin(family: DomainFamily): string {
  if (family === "cn") return "https://help.oceanleo.cn";
  if (family === "ws") return `${domainFamilyProfile("ws").portalOrigin}/help`;
  return "https://help.oceanleo.com";
}

/**
 * Help-center origin + query for the shell 「帮助与反馈」link.
 *
 * Family comes from `NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY` when set, else the
 * same `familyForHost()` table as production hosts. Unrecognized hosts and
 * LeoDev preview without a configured family still go to `.com`. The ws twin
 * (`*.oceanbizs.com`) goes to `https://oceanbizs.com/help…`. Pure function;
 * no DOM.
 */
export function helpCenterUrl(input: {
  host?: string | null;
  siteKey?: string | null;
  from?: string | null;
  path?: string;
}): string {
  const family = helpFamilyFor(input.host);
  const origin = helpCenterOrigin(family);
  let path = input.path ?? "/";
  if (!path.startsWith("/")) path = `/${path}`;
  // 门户 `/help` 前缀下，根路径就是 `/help` 本身，不拼成 `/help/`。
  if (family === "ws" && path === "/") path = "";

  const query: string[] = [];
  const siteKey = (input.siteKey ?? "").trim();
  if (siteKey) query.push(`site=${encodeURIComponent(siteKey)}`);
  if (input.from) query.push(`from=${encodeURIComponent(input.from)}`);

  return `${origin}${path}${query.length ? `?${query.join("&")}` : ""}`;
}
