"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { UITranslate } from "../../../i18n/ui/useUI";
import { BayChoice } from "./BayChoice";
import { BayCustomTerms } from "./BayCustomTerms";
import { BayDeadlineField } from "./BayDeadlineField";
import { formatDeadline } from "./bay-deadline";
import { isPricedOffer, type BayOfferKind } from "./bay-listing";
import { formatPriceInput, isPriceInputText, parsePriceInput } from "./bay-price";
import { BAY_FORM_AMOUNT_INPUT_CLASS } from "./form-ui";
import type { BayRevealItem } from "./BayRevealForm";

// 天数、轮数、分钟数都是几位数：用短槽，不撑满一行。
const INPUT_CLASS = BAY_FORM_AMOUNT_INPUT_CLASS;

export type ListingBilling = "service" | "session" | "hour";
export type ListingAppPriceModel = "one_time" | "subscription";
export type ListingEngagement = "fixed" | "session" | "hourly" | "free" | "retainer";

function intOrNull(value: string, min: number, max: number): number | null {
  const digits = value.replace(/[^\d-]/g, "");
  if (!digits.trim()) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function revealRow(
  id: string,
  label: string,
  done: boolean,
  children: ReactNode,
  extra?: { summary?: string; optional?: boolean; required?: boolean; alwaysOpen?: boolean },
): BayRevealItem {
  return { id, label, done, children, summary: extra?.summary, optional: extra?.optional, required: extra?.required, alwaysOpen: extra?.alwaysOpen };
}

function BayPriceInput(props: {
  valueFen: number | null;
  onChangeFen: (fen: number | null) => void;
  disabled?: boolean;
}): ReactNode {
  const [text, setText] = useState(() => formatPriceInput(props.valueFen));

  useEffect(() => {
    const parsed = parsePriceInput(text);
    if (parsed === "partial") return;
    if (parsed === props.valueFen) return;
    setText(formatPriceInput(props.valueFen));
    // 只跟外部金额；本地还在打「12.」时不要被 format 掉。
  }, [props.valueFen]);

  return (
    <div className="flex items-center gap-2" data-bay-price-amount="">
      <input
        className={BAY_FORM_AMOUNT_INPUT_CLASS}
        data-bay-field="price"
        inputMode="decimal"
        disabled={props.disabled}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          if (!isPriceInputText(next)) return;
          setText(next);
          const parsed = parsePriceInput(next);
          if (parsed === "partial") return;
          props.onChangeFen(parsed);
        }}
      />
      <span className="shrink-0 text-[13px] text-neutral-600" data-bay-price-currency="">
        USD
      </span>
    </div>
  );
}

export function engagementOf(
  offerKind: BayOfferKind,
  billing: ListingBilling,
  appPriceModel?: ListingAppPriceModel,
  priceFen?: number | null,
): ListingEngagement {
  if (offerKind === "app") {
    if (priceFen === 0) return "free";
    if (appPriceModel === "subscription") return "retainer";
    return "fixed";
  }
  if (isPricedOffer(offerKind) && billing === "hour") return "hourly";
  if (isPricedOffer(offerKind) && billing === "session") return "session";
  return "fixed";
}

export function listingPriceItems(
  tt: UITranslate,
  input: {
    offerKind: BayOfferKind;
    priceFen: number | null;
    onPriceFen: (fen: number | null) => void;
    /** 需求表单还要自己选计费方式；发布页的计费方式已经由「计费方式」卡片选，不再在这里重复。 */
    showBilling?: boolean;
    billing?: ListingBilling;
    onBilling?: (value: ListingBilling) => void;
    appPriceModel: ListingAppPriceModel;
    onAppPriceModel: (value: ListingAppPriceModel) => void;
    disabled?: boolean;
  },
): BayRevealItem[] {
  const priceFen = input.priceFen;
  // 免费只在价格框里表达：填 0 就是免费，不再单独设「免费」选项。
  const priceLabel = priceFen == null ? undefined : priceFen <= 0 ? tt("免费") : formatPriceInput(priceFen);
  const billingRow =
    input.showBilling && isPricedOffer(input.offerKind)
      ? revealRow(
          "billing",
          tt("计费方式"),
          true,
          <div data-bay-service-form>
            <BayChoice
              options={[
                { value: "service", title: tt("按约定时间交付") },
                { value: "session", title: tt("按次") },
                { value: "hour", title: tt("按小时") },
              ]}
              value={input.billing ?? "service"}
              onChange={(value) => input.onBilling?.(value)}
              disabled={input.disabled}
              optionProps={(value) => ({
                "data-bay-service-form-option": value === "service" ? "service" : "consult",
                "data-bay-billing": value,
                "data-bay-consult-unit": value === "session" || value === "hour" ? value : undefined,
              })}
            />
          </div>,
          {
            summary:
              input.billing === "hour" ? tt("按小时") : input.billing === "session" ? tt("按次") : tt("按约定时间交付"),
          },
        )
      : null;
  return [
    ...(billingRow ? [billingRow] : []),
    revealRow(
      "price",
      "",
      true,
      <BayPriceInput valueFen={priceFen} onChangeFen={input.onPriceFen} disabled={input.disabled} />,
      { summary: priceLabel, optional: true },
    ),
  ];
}

export function listingTermsItems(
  tt: UITranslate,
  input: {
    offerKind: BayOfferKind;
    billing: ListingBilling;
    deliveryDays: number | null;
    onDeliveryDays: (days: number | null) => void;
    revisions: number;
    onRevisions: (revisions: number) => void;
    consultRounds: number | null;
    onConsultRounds: (rounds: number | null) => void;
    consultMinutes: number | null;
    onConsultMinutes: (minutes: number | null) => void;
    deadline: string;
    onDeadline: (value: string) => void;
    customTerms: string;
    onCustomTerms: (value: string) => void;
    disabled?: boolean;
  },
): BayRevealItem[] {
  const typeSpecificTerms: BayRevealItem[] =
    isPricedOffer(input.offerKind)
      ? [
          ...(input.billing === "session"
            ? [
                revealRow(
                  "consult-rounds",
                  tt("一次包含几轮问答"),
                  Boolean(input.consultRounds && input.consultRounds > 0),
                  <input
                    className={INPUT_CLASS}
                    data-bay-field="consult-rounds"
                    inputMode="numeric"
                    disabled={input.disabled}
                    value={input.consultRounds == null ? "" : String(input.consultRounds)}
                    onChange={(event) => input.onConsultRounds(intOrNull(event.target.value, 1, 50))}
                  />,
                  { summary: input.consultRounds != null ? String(input.consultRounds) : undefined, optional: true },
                ),
              ]
            : input.billing === "hour"
              ? [
                  revealRow(
                    "consult-minutes",
                    tt("一小时按多少分钟计"),
                    Boolean(input.consultMinutes && input.consultMinutes > 0),
                    <input
                      className={INPUT_CLASS}
                      data-bay-field="consult-minutes"
                      inputMode="numeric"
                      disabled={input.disabled}
                      value={input.consultMinutes == null ? "" : String(input.consultMinutes)}
                      onChange={(event) => input.onConsultMinutes(intOrNull(event.target.value, 5, 600))}
                    />,
                    { summary: input.consultMinutes != null ? String(input.consultMinutes) : undefined, optional: true },
                  ),
                ]
              : []),
          revealRow(
            "delivery-days",
            tt("交付天数"),
            Boolean(input.deliveryDays && input.deliveryDays > 0),
            <input
              className={INPUT_CLASS}
              data-bay-field="delivery-days"
              inputMode="numeric"
              disabled={input.disabled}
              value={input.deliveryDays == null ? "" : String(input.deliveryDays)}
              onChange={(event) => input.onDeliveryDays(intOrNull(event.target.value, 1, 365))}
            />,
            { summary: input.deliveryDays != null ? String(input.deliveryDays) : undefined, required: true },
          ),
          revealRow(
            "revisions",
            tt("改稿次数"),
            input.revisions != null,
            <>
              <input
                className={INPUT_CLASS}
                data-bay-field="revisions"
                inputMode="numeric"
                disabled={input.disabled}
                value={String(input.revisions ?? 0)}
                onChange={(event) => input.onRevisions(intOrNull(event.target.value, -1, 100) ?? 0)}
              />
              <p className="mt-1 text-[12px] text-stone-500">{tt("-1 表示不限")}</p>
            </>,
            { summary: String(input.revisions ?? 0) },
          ),
        ]
      : [];
  return [
    ...typeSpecificTerms,
    revealRow(
      "deadline",
      tt("截止日期"),
      true,
      <BayDeadlineField value={input.deadline} onChange={input.onDeadline} disabled={input.disabled} />,
      { summary: formatDeadline(input.deadline) || tt("交期可协商"), optional: true },
    ),
    revealRow(
      "custom-terms",
      tt("用户自定义"),
      true,
      <BayCustomTerms value={input.customTerms} onChange={input.onCustomTerms} disabled={input.disabled} />,
      { summary: input.customTerms.trim() ? tt("已填好") : undefined, optional: true },
    ),
  ];
}
