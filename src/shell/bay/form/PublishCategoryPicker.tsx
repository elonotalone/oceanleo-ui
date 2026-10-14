"use client";

import type { ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { replaceBay } from "../shell/bay-state";
import { BAY_FORM_LABEL_CLASS } from "./form-ui";
import { BayMenuSelect } from "./BayMenuSelect";
import { rememberPublishListing } from "./publish-listing";

export type PublishIntentId = "sell" | "buy";
export type PublishDeliveryId = "digital" | "service" | "app" | "lesson" | "other";
export type PublishCategoryId = PublishDeliveryId | "need";

const INTENT_OPTIONS: { id: PublishIntentId; label: string }[] = [
  { id: "sell", label: "我想要卖" },
  { id: "buy", label: "我想要买" },
];

export function intentOfListing(value?: PublishCategoryId | ""): PublishIntentId {
  return value === "need" ? "buy" : "sell";
}

export function deliveryOfListing(value?: PublishCategoryId | ""): PublishDeliveryId {
  if (value === "service" || value === "app" || value === "lesson" || value === "other") return value;
  return "digital";
}

export function PublishCategoryPicker({
  value,
  siteCategory,
  disabled,
}: {
  value?: PublishCategoryId | "";
  siteCategory?: string;
  onPickListing?: (id: PublishDeliveryId) => void;
  disabled?: boolean;
}): ReactElement {
  const tt = useUI();
  const intent = intentOfListing(value);

  function chooseIntent(next: PublishIntentId) {
    if (next === intent) return;
    if (next === "buy") {
      replaceBay(siteCategory ? { kind: "post-need", category: siteCategory } : { kind: "post-need" });
      return;
    }
    rememberPublishListing(deliveryOfListing(value));
    replaceBay(siteCategory ? { kind: "publish", category: siteCategory } : { kind: "publish" });
  }

  return (
    <div className="block w-full" data-bay-publish-category-field data-bay-publish-intent-field>
      <span className={`mb-2 block ${BAY_FORM_LABEL_CLASS}`}>{tt("我想要卖还是买")}</span>
      <BayMenuSelect
        value={intent}
        onChange={(next) => chooseIntent(next as PublishIntentId)}
        disabled={disabled}
        selectProps={{
          "data-bay-publish-intent": "",
          "aria-label": tt("我想要卖还是买"),
        }}
        options={INTENT_OPTIONS.map((option) => ({
          value: option.id,
          label: tt(option.label),
          attrs: {
            "data-bay-intent": option.id,
            "data-bay-kind": option.id === "buy" ? "need" : undefined,
          },
        }))}
      />
    </div>
  );
}
