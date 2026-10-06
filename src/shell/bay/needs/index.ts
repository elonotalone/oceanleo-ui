import type { BayWorkRef } from "../../../lib/bay/types";
import type { BayPaneProps } from "../shell/bay-state";

export { DemandCard, HelpRequestCard, type BayFeedCardProps } from "./NeedCards";

export function DemandPane(_props: BayPaneProps): null {
  return null;
}

export function HelpRequestPane(_props: BayPaneProps): null {
  return null;
}

export function PostNeedPane(_props: BayPaneProps): null {
  return null;
}

export function CallHumanPane(_props: BayPaneProps): null {
  return null;
}

export function ProposePane(_props: BayPaneProps): null {
  return null;
}

export function MyNeedsPane(_props: BayPaneProps): null {
  return null;
}

export function MyProposalsPane(_props: BayPaneProps): null {
  return null;
}

export function MyHelpRequestsPane(_props: BayPaneProps): null {
  return null;
}

export async function pickLibraryWork(_opts?: { title?: string }): Promise<BayWorkRef | null> {
  return null;
}
