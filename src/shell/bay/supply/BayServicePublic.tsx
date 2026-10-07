"use client";

// 门户公开服务页的纯展示：只吃已经取好的 data，不取数、不碰 window、不渲染 HTML/媒体。
// 可在服务端先渲染。交期只在有数字时出现（仲裁 #9：null 不显示）。

import { useUI } from "../../../i18n/ui/useUI";
import type { BayReviewPublic, BayServicePublicData, BayServiceTierPublic } from "../../../lib/bay/public";
import { publicPrice, publicPriceFrom, publicRating, publicResponse, publicRevisions, publicTierLabel } from "./public-text";

export function BayServicePublic({ data }: { data: BayServicePublicData }) {
  const tt = useUI();
  const seller = data.seller;
  const response = seller ? publicResponse(tt, seller.response_minutes) : null;
  return (
    <article data-bay-public="service" data-bay-service={data.id}>
      <p data-bay-public-title className="break-words text-[22px] font-semibold text-neutral-950">
        {data.title}
      </p>
      {data.delivery_mode === "off_platform" ? <p className="mt-1 text-[12px] text-amber-800">{tt("这项服务在平台外完成")}</p> : null}
      {data.summary ? <p className="mt-2 break-words text-[14px] text-neutral-600">{data.summary}</p> : null}
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-neutral-600">
        <span data-bay-price>{publicPriceFrom(tt, data.min_price_fen, data.currency)}</span>
        {data.delivery_days != null ? <span data-bay-days>{tt("{n} 天交付", { n: data.delivery_days })}</span> : null}
        <span>{publicRating(tt, data.rating_avg, data.rating_count)}</span>
        {data.order_count > 0 ? <span>{tt("{n} 份订单", { n: data.order_count })}</span> : null}
      </p>
      {data.description ? <p className="mt-4 whitespace-pre-wrap break-words text-[14px] leading-6 text-neutral-700">{data.description}</p> : null}

      {data.tiers.length ? (
        <section data-bay-public-section="tiers" className="mt-6">
          {data.tiers.map((tier) => (
            <TierLine key={tier.tier} tier={tier} />
          ))}
        </section>
      ) : null}

      {data.addons.length ? (
        <section data-bay-public-section="addons" className="mt-6">
          {data.addons.map((addon) => (
            <p key={addon.id} data-bay-public-addon={addon.id} className="border-b border-neutral-100 py-2 text-[13px] text-neutral-800">
              <span className="font-medium">{addon.title}</span>
              <span className="ml-2 text-neutral-500">{publicPrice(tt, addon.price_fen, addon.currency)}</span>
              {addon.extra_days > 0 ? <span className="ml-2 text-neutral-500">{tt("+{n} 天", { n: addon.extra_days })}</span> : null}
              {addon.description ? <span className="mt-0.5 block break-words text-[12px] text-neutral-500">{addon.description}</span> : null}
            </p>
          ))}
        </section>
      ) : null}

      {data.faq.length ? (
        <section data-bay-public-section="faq" className="mt-6">
          <p className="text-[14px] font-semibold text-neutral-900">{tt("常见问题")}</p>
          {data.faq.map((item) => (
            <p key={item.id} className="mt-2 break-words text-[13px] text-neutral-700">
              <span className="block font-medium">{item.question}</span>
              <span className="mt-0.5 block whitespace-pre-wrap">{item.answer}</span>
            </p>
          ))}
        </section>
      ) : null}

      {seller ? (
        <section data-bay-public-section="seller" className="mt-6 text-[13px] text-neutral-700">
          <p className="font-semibold text-neutral-900">{seller.display_name}</p>
          {seller.handle ? <p className="text-[12px] text-neutral-500">@{seller.handle}</p> : null}
          {seller.headline ? <p className="mt-1 break-words">{seller.headline}</p> : null}
          <p className="mt-1 text-[12px] text-neutral-500">
            {publicRating(tt, seller.rating_avg, seller.rating_count)}
            {seller.completed_contracts > 0 ? ` · ${tt("{n} 份订单", { n: seller.completed_contracts })}` : ""}
            {response ? ` · ${response}` : ""}
          </p>
        </section>
      ) : null}

      <section data-bay-public-section="reviews" className="mt-6">
        <p className="text-[14px] font-semibold text-neutral-900">{tt("买家评价")}</p>
        {data.reviews.length ? (
          data.reviews.map((review) => <ReviewLine key={review.id} review={review} />)
        ) : (
          <p className="mt-2 text-[13px] text-neutral-500">{tt("这个服务还没有已公开的评价。")}</p>
        )}
      </section>
    </article>
  );
}

function TierLine({ tier }: { tier: BayServiceTierPublic }) {
  const tt = useUI();
  return (
    <p data-bay-public-tier={tier.tier} className="border-b border-neutral-100 py-2.5 text-[13px] text-neutral-800">
      <span className="text-[12px] text-neutral-500">{publicTierLabel(tt, tier.tier)}</span>
      <span className="mt-0.5 block break-words font-medium">
        {tier.title || publicTierLabel(tt, tier.tier)} · {publicPrice(tt, tier.price_fen, tier.currency)}
      </span>
      <span className="mt-0.5 block text-[12px] text-neutral-500">
        {tier.delivery_days != null ? <span data-bay-days>{tt("{n} 天交付", { n: tier.delivery_days })}</span> : null}
        {tier.delivery_days != null ? " · " : null}
        {publicRevisions(tt, tier.revisions)}
      </span>
      {tier.description ? <span className="mt-0.5 block whitespace-pre-wrap break-words text-[12px] text-neutral-600">{tier.description}</span> : null}
    </p>
  );
}

function ReviewLine({ review }: { review: BayReviewPublic }) {
  const name = review.author?.display_name || "";
  return (
    <p data-bay-public-review={review.id} className="border-b border-neutral-100 py-2.5 text-[13px] text-neutral-700">
      <span className="text-neutral-500">
        {name}
        {name ? " · " : ""}
        {review.rating}
      </span>
      {review.body ? <span className="mt-0.5 block whitespace-pre-wrap break-words">{review.body}</span> : null}
    </p>
  );
}
