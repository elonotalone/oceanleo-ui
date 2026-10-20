"use client";

import type { ReactElement, ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayChoice } from "./BayChoice";
import type { BayRevealGroup, BayRevealItem } from "./BayRevealForm";
import {
  BAY_OFFER_BUY_APP_LABEL,
  BAY_OFFER_OPTIONS,
  LISTING_SECTION_LABELS,
  offerKindLabel,
  type BayListingIntent,
  type BayOfferKind,
} from "./bay-listing";

export function BayHowYouDeliver(props: {
  value: BayOfferKind;
  onChange: (id: BayOfferKind) => void;
  disabled?: boolean;
  buy?: boolean;
}): ReactElement {
  const tt = useUI();
  return (
    <div data-bay-how-you-deliver="" data-bay-publish-category={props.value}>
      <BayChoice
        options={BAY_OFFER_OPTIONS.map((row) => ({
          value: row.id,
          title: tt(props.buy && row.id === "app" ? BAY_OFFER_BUY_APP_LABEL : row.label),
        }))}
        value={props.value}
        onChange={props.onChange}
        columns={1}
        collapsible
        disabled={props.disabled}
        optionProps={(id) => ({
          "data-bay-kind": id,
          "data-bay-publish-app": id === "app" ? "" : undefined,
          "data-bay-publish-lesson": id === "lesson" ? "" : undefined,
        })}
      />
    </div>
  );
}

export function howYouDeliverRow(
  tt: (zh: string) => string,
  value: BayOfferKind,
  onChange: (id: BayOfferKind) => void,
  extra?: { disabled?: boolean; buy?: boolean },
): BayRevealItem {
  const summaryLabel = extra?.buy && value === "app" ? BAY_OFFER_BUY_APP_LABEL : offerKindLabel(value);
  return {
    id: "how-you-deliver",
    label: "",
    done: true,
    summary: tt(summaryLabel),
    children: (
      <BayHowYouDeliver value={value} onChange={onChange} disabled={extra?.disabled} buy={extra?.buy} />
    ),
  };
}

export type ListingGroupId = "product" | "price" | "audience" | "offer" | "terms";

export function listingSectionGroups(input: {
  tt: (zh: string) => string;
  intent?: BayListingIntent;
  productItems: BayRevealItem[];
  priceItems: BayRevealItem[];
  audienceItems?: BayRevealItem[];
  offerItems?: BayRevealItem[];
  priceExtra?: ReactNode;
  termsItems: BayRevealItem[];
  termsExtra?: ReactNode;
  highlight?: ListingGroupId | null;
  missing?: Partial<Record<ListingGroupId, string[]>>;
}): BayRevealGroup[] {
  const missing = input.missing || {};
  const highlight = input.highlight;
  const offerLabel = input.intent === "buy" ? LISTING_SECTION_LABELS.offerBuy : LISTING_SECTION_LABELS.offer;
  // 「你交付什么 / 交付给你的是什么」是产品信息里的第一块，不再单独成组。
  const offerItems = (input.offerItems || []).map((item, index) => (index === 0 ? { ...item, label: input.tt(offerLabel), required: true } : item));
  const productMissing = [...(missing.offer || []), ...(missing.product || [])];
  const productHighlight = highlight === "product" || highlight === "offer";
  const groups: BayRevealGroup[] = [
    {
      id: "product",
      label: input.tt(LISTING_SECTION_LABELS.product),
      items: [...offerItems, ...input.productItems],
      highlight: productHighlight,
      missing: productHighlight ? productMissing : undefined,
      done: productMissing.length === 0,
    },
    {
      id: "price",
      label: input.tt(LISTING_SECTION_LABELS.price),
      items: input.priceItems,
      extra: input.priceExtra,
      highlight: highlight === "price",
      missing: highlight === "price" ? missing.price : undefined,
      done: (missing.price || []).length === 0,
    },
  ];
  if (input.audienceItems?.length) {
    groups.push({
      id: "audience",
      label: input.tt(LISTING_SECTION_LABELS.audience),
      items: input.audienceItems,
      highlight: highlight === "audience",
      missing: highlight === "audience" ? missing.audience : undefined,
      done: (missing.audience || []).length === 0,
    });
  }
  groups.push({
    id: "terms",
    label: input.tt(LISTING_SECTION_LABELS.terms),
    collapsedByDefault: true,
    collapsedSummary:
      input.termsItems
        .map((item) => item.summary)
        .filter((text): text is string => Boolean(text))
        .join(" · ") || undefined,
    items: input.termsItems,
    extra: input.termsExtra,
    highlight: highlight === "terms",
    missing: highlight === "terms" ? missing.terms : undefined,
    done: (missing.terms || []).length === 0,
  });
  return groups;
}
