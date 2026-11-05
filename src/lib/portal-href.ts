import { portalHref as familyPortalHref } from "../contracts/domain-family";

/** Build a portal-relative URL while preserving the current site family. */
export function portalHref(path: string): string {
  return familyPortalHref(path);
}

export function devicesCloudHref(): string {
  return portalHref("/devices");
}
