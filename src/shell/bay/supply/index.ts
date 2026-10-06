import type { BayProfilePublicData, BayServicePublicData } from "../../../lib/bay/public";
import type { BayPaneProps } from "../shell/bay-state";

export { ServiceCard } from "./ServiceCard";
export { ConsultCard } from "./ConsultCard";

export function ServicePane(_props: BayPaneProps): null {
  return null;
}

export function ConsultPane(_props: BayPaneProps): null {
  return null;
}

export function ProfilePane(_props: BayPaneProps): null {
  return null;
}

export function CheckoutPane(_props: BayPaneProps): null {
  return null;
}

export function BayProfilePublic(_props: { data: BayProfilePublicData }): null {
  return null;
}

export function BayServicePublic(_props: { data: BayServicePublicData }): null {
  return null;
}
