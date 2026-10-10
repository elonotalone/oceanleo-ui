import type { ActionGrant } from "../../../../api/action-grants";
import type { DeliveryPrefs } from "../../../../api/delivery-prefs";
import type { HostedSite } from "../../../../api/hosted-sites";

export function applyPrefToggle(
  prefs: DeliveryPrefs,
  key: keyof DeliveryPrefs,
  value: boolean,
): DeliveryPrefs {
  return { ...prefs, [key]: value };
}

export function removeGrant(
  items: ActionGrant[],
  connectorId: string,
  tool: string,
): ActionGrant[] {
  return items.filter((item) => item.connector_id !== connectorId || item.tool !== tool);
}

export function removeHostedSite(items: HostedSite[], id: string): HostedSite[] {
  return items.filter((item) => item.id !== id);
}
