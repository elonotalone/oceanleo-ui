import type { ReactNode } from "react";

export type BaySettingsPane = "profile" | "vetting" | "money";

export { ensureBayTerms } from "./terms-flow";
export type { BayTermsScope } from "./BayTermsDialog";

export function BaySettingsSection(_props: { pane?: BaySettingsPane }): null {
  return null;
}

export function openBaySettings(_pane?: BaySettingsPane): void {}

export function BayTermsGate(props: { scope: "buyer" | "seller"; children?: ReactNode }): ReactNode {
  return props.children ?? null;
}
