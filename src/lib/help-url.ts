import { familyForHost, normalizeHost } from "../contracts/domain-family";

const HELP_CENTER_HOSTS = new Set([
  "help.oceanleo.com",
  "www.help.oceanleo.com",
  "help.oceanleo.cn",
  "www.help.oceanleo.cn",
]);

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
 * Help-center origin + query for the shell 「帮助与反馈」link.
 *
 * Family comes from the same `familyForHost()` table as `cookieDomainFor()`:
 * only `oceanleo.cn` / `*.oceanleo.cn` resolve to the .cn help host.
 * LeoDev preview (`p-<32hex>.dev.oceanleo.com`), `.oceanleo.com`,
 * and anything unrecognized all go to `.com`. Pure function; no DOM.
 */
export function helpCenterUrl(input: {
  host?: string | null;
  siteKey?: string | null;
  from?: string | null;
  path?: string;
}): string {
  const origin =
    familyForHost(input.host) === "cn"
      ? "https://help.oceanleo.cn"
      : "https://help.oceanleo.com";
  let path = input.path ?? "/";
  if (!path.startsWith("/")) path = `/${path}`;

  const query: string[] = [];
  const siteKey = (input.siteKey ?? "").trim();
  if (siteKey) query.push(`site=${encodeURIComponent(siteKey)}`);
  if (input.from) query.push(`from=${encodeURIComponent(input.from)}`);

  return `${origin}${path}${query.length ? `?${query.join("&")}` : ""}`;
}
