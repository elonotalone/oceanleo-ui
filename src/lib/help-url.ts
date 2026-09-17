import {
  CONFIGURED_DOMAIN_FAMILY,
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
  if (CONFIGURED_DOMAIN_FAMILY) return CONFIGURED_DOMAIN_FAMILY;
  return familyForHost(host) === "cn" ? "cn" : "com";
}

/**
 * Help-center origin + query for the shell 「帮助与反馈」link.
 *
 * Family comes from `NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY` when set, else the
 * same `familyForHost()` table as production hosts. Unrecognized hosts and
 * LeoDev preview without a configured family still go to `.com`. Pure
 * function; no DOM.
 */
export function helpCenterUrl(input: {
  host?: string | null;
  siteKey?: string | null;
  from?: string | null;
  path?: string;
}): string {
  const origin =
    helpFamilyFor(input.host) === "cn"
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
