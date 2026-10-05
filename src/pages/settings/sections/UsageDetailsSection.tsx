"use client";

import { UsageHistory } from "../../UsageHistory";

export function UsageDetailsSection() {
  return (
    <div data-settings-pane="usage-details" data-usage-history="">
      <UsageHistory limit={200} maxHeight="440px" />
    </div>
  );
}

/** @deprecated 旧名；设置栏已改成 usage-details。 */
export const CostSection = UsageDetailsSection;
