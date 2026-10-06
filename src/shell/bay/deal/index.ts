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

export function DealConversationView(_props: DealConversationViewProps): null {
  return null;
}

export async function openTradeThread(_subject: TradeThreadSubject): Promise<void> {}
