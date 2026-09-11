import { familyForHost } from "../contracts/domain-family";

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
