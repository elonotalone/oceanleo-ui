import type { BayLayout } from "../shell/bay-state";

export interface DealConversationViewProps {
  threadId: string;
  layout: BayLayout;
  onBack?: () => void;
}

export interface TradeThreadSubject {
  kind: "service" | "demand" | "direct" | "handoff" | "contract";
  subjectRef?: string;
  userId?: string;
}

export { DealConversationView } from "./DealConversationView";
export { openTradeThread } from "./open-trade-thread";
