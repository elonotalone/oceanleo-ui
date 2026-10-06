import type { BayLayout } from "./bay-state";

export * from "./bay-state";

export interface BayViewProps {
  part: "list" | "detail";
  layout: BayLayout;
}

export interface BayPageProps {
  siteKey: string;
  accent?: string;
}

export function BayView(_props: BayViewProps): null {
  return null;
}

export function BayGuestHost(): null {
  return null;
}

export function BayPage(_props: BayPageProps): null {
  return null;
}

export function BayNavIcon(_props: { className?: string }): null {
  return null;
}

export function CallHumanButton(_props: { siteKey: string; compact?: boolean }): null {
  return null;
}
