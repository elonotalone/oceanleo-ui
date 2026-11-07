import { devicesCloudHref, portalHref } from "../../../lib/portal-href";

export { devicesCloudHref, portalHref };
export type ServerPageCard = "cli" | "terminal";
export type ServerPageHrefOptions = {
  card?: ServerPageCard;
  program?: string;
  session?: string;
};

/** Legacy device-card links remain stable while the page itself redirects to Devices. */
export function serverPageHref(
  computerId: string,
  options: ServerPageHrefOptions = {},
): string {
  const query = new URLSearchParams({ computer: computerId });
  if (options.card) query.set("view", options.card);
  if (options.program) query.set("program", options.program);
  if (options.session) query.set("session", options.session);
  return portalHref(`/devices?${query.toString()}`);
}
