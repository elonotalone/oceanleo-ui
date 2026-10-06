export type BayLayout = "docked" | "full" | "mobile" | "page";

export type BayMineTab = "needs" | "proposals" | "services" | "orders" | "help";

export type BayFeedFilter = {
  kind?: "all" | "demand" | "service" | "help" | "consult";
  category?: string;
  q?: string;
};

export type BayTarget =
  | { kind: "feed"; filter?: BayFeedFilter }
  | { kind: "demand"; id: string }
  | { kind: "service"; id: string }
  | { kind: "help"; id: string }
  | { kind: "consult"; id: string }
  | { kind: "profile"; handle: string }
  | { kind: "order"; id: string }
  | { kind: "conversation"; threadId: string }
  | { kind: "post-need"; category?: string }
  | { kind: "call-human"; category?: string }
  | { kind: "propose"; demandId: string }
  | { kind: "checkout"; serviceId: string; tier?: string }
  | { kind: "service-editor"; serviceId?: string }
  | { kind: "mine"; tab: BayMineTab }
  | { kind: "settings"; pane?: "profile" | "vetting" | "money" };

export interface BayPaneProps {
  target: BayTarget;
  layout: BayLayout;
  siteKey: string;
}

export interface BayTaskContext {
  taskId: string;
  messages: unknown[];
}

const FEED: BayTarget = { kind: "feed" };

export function openBay(_target?: BayTarget): void {}

export function bayBack(): void {}

export function useBayState(): { current: BayTarget; canGoBack: boolean } {
  return { current: FEED, canGoBack: false };
}

export function useBayHasDetail(): boolean {
  return false;
}

export function useBaySiteKey(): string {
  return "oceanleo";
}

export function setBaySiteKey(_siteKey: string): void {}

export function bayEnabledHere(): boolean {
  return false;
}

export function requireBayLogin(): boolean {
  return false;
}

export function bayHrefOnSite(_siteKey: string, _target: BayTarget): string {
  return "/bay";
}

export function setBayTaskContext(_ctx: BayTaskContext | null): void {}

export function useBayTaskContext(): BayTaskContext | null {
  return null;
}
