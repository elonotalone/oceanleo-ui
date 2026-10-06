import type { BayProfilePublicData, BayServicePublicData } from "../../../lib/bay/public";
import type { BayPaneProps } from "../shell/bay-state";

export { ServiceCard } from "./ServiceCard";
export { ConsultCard } from "./ConsultCard";
export { ServicePane } from "./ServicePane";

export function ConsultPane(_props: BayPaneProps): null {
  return null;
}

export function ProfilePane(_props: BayPaneProps): null {
  return null;
}

export { CheckoutPane } from "./CheckoutPane";

export function BayProfilePublic(_props: { data: BayProfilePublicData }): null {
  return null;
}

export function BayServicePublic(_props: { data: BayServicePublicData }): null {
  return null;
}
