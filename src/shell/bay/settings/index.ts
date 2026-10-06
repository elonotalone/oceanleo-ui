import type { ReactNode } from "react";

export type BaySettingsPane = "profile" | "vetting" | "money";

export function BaySettingsSection(_props: { pane?: BaySettingsPane }): null {
  return null;
}

export function openBaySettings(_pane?: BaySettingsPane): void {}

export async function ensureBayTerms(_scope: "buyer" | "seller"): Promise<boolean> {
  return false;
}

export function BayTermsGate(props: { scope: "buyer" | "seller"; children?: ReactNode }): ReactNode {
  return props.children ?? null;
}
