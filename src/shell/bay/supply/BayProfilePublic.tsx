"use client";

// 门户公开主页的纯展示：只吃已经取好的 data，不取数、不碰 window、不渲染 HTML/媒体。
// 可在服务端先渲染（客户端组件）。用户内容一律当文本。

import { useUI } from "../../../i18n/ui/useUI";
import type { BayProfilePublicData, BayReviewPublic, BayServiceSummaryPublic, BayShowcasePublic } from "../../../lib/bay/public";
import { publicPriceFrom, publicRating, publicResponse } from "./public-text";

export function BayProfilePublic({ data }: { data: BayProfilePublicData }) {
  const tt = useUI();
  const response = publicResponse(tt, data.response_minutes);
  return (
    <article data-bay-public="profile" data-bay-handle={data.handle}>
      <p data-bay-public-name className="text-[22px] font-semibold text-neutral-950">
        {data.display_name}
      </p>
      <p className="mt-0.5 text-[13px] text-neutral-500">@{data.handle}</p>
      {data.headline ? <p className="mt-2 break-words text-[14px] text-neutral-700">{data.headline}</p> : <p className="mt-2 text-[13px] text-neutral-400">{tt("卖家暂未填写简介。")}</p>}
      {data.bio ? <p className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-6 text-neutral-700">{data.bio}</p> : null}

      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-neutral-500">
        <span>{publicRating(tt, data.rating_avg, data.rating_count)}</span>
        {data.completed_contracts > 0 ? <span>{tt("{n} 份订单", { n: data.completed_contracts })}</span> : null}
        {response ? <span>{response}</span> : null}
      </p>
      {data.skills.length ? <p className="mt-2 break-words text-[13px] text-neutral-600">{data.skills.join(" · ")}</p> : null}
      {data.languages.length ? <p className="mt-1 break-words text-[13px] text-neutral-600">{data.languages.join(" · ")}</p> : null}
      {data.vetting
        .filter((entry) => entry.state === "verified" || entry.state === "expired")
        .map((entry) => (
          <p key={entry.domain} data-bay-vetting={entry.domain} className="mt-1 text-[12px] text-neutral-500">
            {entry.domain}
            {entry.state === "expired" ? ` · ${tt("核验已过期")}` : ""}
          </p>
        ))}

      {data.services.length ? (
        <section data-bay-public-section="services" className="mt-6">
          {data.services.map((service) => (
            <ServiceLine key={service.id} service={service} />
          ))}
        </section>
      ) : null}

      {data.showcase.length ? (
        <section data-bay-public-section="showcase" className="mt-6">
          {data.showcase.map((item) => (
            <ShowcaseLine key={item.id} item={item} />
          ))}
        </section>
      ) : null}

      <section data-bay-public-section="reviews" className="mt-6">
        <p className="text-[14px] font-semibold text-neutral-900">{tt("买家评价")}</p>
        {data.reviews.length ? data.reviews.map((review) => <ReviewLine key={review.id} review={review} />) : <p className="mt-2 text-[13px] text-neutral-500">{tt("暂无评价")}</p>}
      </section>
    </article>
  );
}

function ServiceLine({ service }: { service: BayServiceSummaryPublic }) {
  const tt = useUI();
  return (
    <p data-bay-public-service={service.id} className="border-b border-neutral-100 py-2.5 text-[13px] text-neutral-800">
      <span className="block break-words font-medium">{service.title}</span>
      <span className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-neutral-500">
        <span>{publicPriceFrom(tt, service.min_price_fen, service.currency)}</span>
        {service.delivery_days != null ? <span data-bay-days>{tt("{n} 天交付", { n: service.delivery_days })}</span> : null}
        {service.order_count > 0 ? <span>{tt("{n} 份订单", { n: service.order_count })}</span> : null}
      </span>
    </p>
  );
}

function ShowcaseLine({ item }: { item: BayShowcasePublic }) {
  return (
    <p data-bay-public-work={item.id} className="border-b border-neutral-100 py-2.5 text-[13px] text-neutral-800">
      <span className="block break-words font-medium">{item.title}</span>
      {item.summary ? <span className="mt-0.5 block break-words text-[12px] text-neutral-500">{item.summary}</span> : null}
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
