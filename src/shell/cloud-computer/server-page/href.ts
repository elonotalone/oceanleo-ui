import { currentDomainProfile } from "../../../contracts/domain-family";

export type ServerPageCard = "acp" | "cli" | "terminal";

export type ServerPageHrefOptions = {
  card?: ServerPageCard;
  program?: string;
  session?: string;
};

/** 子站上指向门户；已经在门户 origin 上则保持相对路径。 */
export function portalHref(path: string): string {
  const portalOrigin = currentDomainProfile().portalOrigin;
  if (typeof window === "undefined" || window.location.origin === portalOrigin) {
    return path;
  }
  return `${portalOrigin}${path}`;
}

export function devicesCloudHref(): string {
  return portalHref("/devices?tab=cloud");
}

export function serverPageHref(
  computerId: string,
  options: ServerPageHrefOptions = {},
): string {
  const path = `/computers/${encodeURIComponent(computerId)}`;
  const query = new URLSearchParams();
  if (options.card) query.set("card", options.card);
  if (options.program) query.set("program", options.program);
  if (options.session) query.set("session", options.session);
  const suffix = query.toString();
  return portalHref(suffix ? `${path}?${suffix}` : path);
}
