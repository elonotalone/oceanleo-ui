import { devicesCloudHref, portalHref } from "../../../lib/portal-href";

export { devicesCloudHref, portalHref };
export type ServerPageCard = "acp" | "cli" | "terminal";
export type ServerPageHrefOptions = {
  card?: ServerPageCard;
  program?: string;
  session?: string;
};
