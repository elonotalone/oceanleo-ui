"use client";

import { UsageHistory } from "../../UsageHistory";

export function CostSection() {
  return (
    <div data-settings-pane="cost" data-usage-history="">
      <UsageHistory limit={200} maxHeight="440px" />
    </div>
  );
}
