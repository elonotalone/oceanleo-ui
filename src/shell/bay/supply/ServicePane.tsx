"use client";

// 服务详情（移植自 talent `app/services/[id]/page.tsx`，外壳不搬）。
// 不登录也能看；下单、先聊聊、收藏、举报要登录（requireBayLogin）。卖家本人看到「编辑」，看不到下单与先聊聊。
// 用户内容（标题、描述、常见问题、评价）一律纯文本；媒体只认 http(s)，不内嵌任何别站页面。

import { useMemo, useState } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { getUserId } from "../../../lib/auth/client";
import { rememberCheckoutAddons } from "../../../lib/bay/checkout";
import {
  enabledAddons,
  enabledTiers,
  formatBayMoney,
  getBayService,
  isOwnService,
  reportBayService,
  serviceSelection,
  defaultTier,
  type BayServiceDetail,
  type BayServiceMedia,
  type BayServiceTier,
} from "../../../lib/bay/services";
import { openTradeThread } from "../deal";
import { openBay, requireBayLogin, type BayLayout, type BayPaneProps } from "../shell/bay-state";
import { deliveryDaysText, moneyOrFree, revisionsText, safeHttpUrl, tierLabel } from "./format";
import { DoneMeans, FavoriteButton, PaneLoading, PaneMessage, ReportBox, ReviewList, Section, SellerCard } from "./parts";
import { errorText, useBayResource } from "./use-bay-resource";

export function ServicePane({ target, layout }: BayPaneProps) {
  const tt = useUI();
  const serviceId = target.kind === "service" ? target.id : "";
  const service = useBayResource(serviceId ? `service:${serviceId}` : null, () => getBayService(serviceId).then((data) => data.service));
  const viewer = useBayResource("viewer", () => getUserId());
  if (!serviceId) return null;
  if (service.loading) return <PaneLoading />;
  if (!service.data) {
    const text = service.status === 404 || !service.error ? tt("这个服务不存在或已经下架") : tt(service.error);
    return <PaneMessage text={text} onRetry={service.reload} />;
  }
  return <ServiceDetailView service={service.data} viewerId={viewer.data} layout={layout} />;
}

function MediaView({ media }: { media: BayServiceMedia }) {
  const tt = useUI();
  const url = safeHttpUrl(media.url);
  if (!url) return null;
  if (media.kind === "video") {
    return <video controls preload="metadata" poster={safeHttpUrl(media.poster_url) || undefined} src={url} className="aspect-video w-full rounded-xl bg-neutral-950 object-contain" />;
  }
  if (media.kind === "image") return <img src={url} alt={media.caption || ""} className="aspect-video w-full rounded-xl bg-neutral-100 object-cover" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="grid aspect-video place-items-center rounded-xl bg-neutral-100 text-[13px] font-medium text-neutral-700">
      {tt("打开附件")}
    </a>
  );
}

function TierCard({ tier, selected, currency, onSelect }: { tier: BayServiceTier; selected: boolean; currency?: string; onSelect: () => void }) {
  const tt = useUI();
  return (
    <article data-bay-tier={tier.tier} data-selected={selected ? "true" : "false"} className={"rounded-xl border p-3 " + (selected ? "border-neutral-900" : "border-neutral-200")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-neutral-500">{tierLabel(tt, tier.tier)}</p>
          <p className="break-words text-[14px] font-semibold text-neutral-900">{tier.title}</p>
        </div>
        <span className="shrink-0 text-[14px] font-semibold text-neutral-900">{moneyOrFree(tt, tier.price_fen, tier.currency || currency)}</span>
      </div>
      {tier.description ? <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] text-neutral-600">{tier.description}</p> : null}
      <p className="mt-2 text-[12px] text-neutral-500">
        {deliveryDaysText(tt, tier.delivery_days)}
        {" · "}
        {revisionsText(tt, tier.revisions)}
      </p>
      {tier.features.length ? (
        <ul className="mt-2 space-y-0.5 text-[12px] text-neutral-600">
          {tier.features.map((feature) => (
            <li key={feature} className="break-words">
              ✓ {feature}
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={onSelect}
        className={"mt-3 w-full rounded-lg px-3 py-1.5 text-[12px] " + (selected ? "bg-neutral-900 text-white" : "border border-neutral-200 text-neutral-700 hover:bg-neutral-50")}
      >
        {selected ? tt("已选择") : tt("选择此档")}
      </button>
    </article>
  );
}

export interface ServiceDetailViewProps {
  service: BayServiceDetail;
  viewerId: string | null;
  layout: BayLayout;
}

export function ServiceDetailView({ service, viewerId, layout }: ServiceDetailViewProps) {
  const tt = useUI();
  const tiers = enabledTiers(service);
  const addons = enabledAddons(service);
  const [tierName, setTierName] = useState<string>(defaultTier(service)?.tier || "");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [activeMedia, setActiveMedia] = useState(0);
  const [talking, setTalking] = useState(false);
  const [error, setError] = useState("");
  const selection = serviceSelection(service, tierName, addonIds);
  const owner = isOwnService(service, viewerId);
  const currency = selection.tier?.currency || service.currency;
  const wide = layout === "page" || layout === "full";

  const media = useMemo(() => {
    const list = (service.media || []).filter((item) => safeHttpUrl(item.url));
    const cover = safeHttpUrl(service.cover_url);
    if (list.length || !cover) return list;
    return [{ id: "cover", kind: "image" as const, url: cover, poster_url: null, caption: service.title }];
  }, [service]);

  function order() {
    if (!selection.tier || !requireBayLogin()) return;
    rememberCheckoutAddons(service.id, addonIds);
    openBay({ kind: "checkout", serviceId: service.id, tier: selection.tier.tier });
  }

  async function talk() {
    if (talking || !requireBayLogin()) return;
    setTalking(true);
    setError("");
    try {
      await openTradeThread({ kind: "service", subjectRef: service.id });
    } catch (err) {
      setError(errorText(err) || tt("会话没打开，请稍后再试。"));
    } finally {
      setTalking(false);
    }
  }

  const summary = (
    <section data-bay-service-summary className="rounded-xl border border-neutral-200 p-3">
      <p className="text-[11px] text-neutral-500">{tt("当前选择")}</p>
      <p className="mt-0.5 text-[14px] font-semibold text-neutral-900">
        {selection.tier ? `${tierLabel(tt, selection.tier.tier)} · ${selection.tier.title}` : tt("暂时无法下单")}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-neutral-50 p-2.5">
        <div>
          <p className="text-[11px] text-neutral-500">{tt("合计")}</p>
          <p data-bay-total className="mt-0.5 text-[16px] font-semibold text-neutral-900">
            {selection.tier ? moneyOrFree(tt, selection.totalFen, currency) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-neutral-500">{tt("预计交付")}</p>
          <p className="mt-0.5 text-[16px] font-semibold text-neutral-900">{deliveryDaysText(tt, selection.deliveryDays)}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {owner ? (
          <>
            <p className="text-[12px] text-neutral-500">{tt("这是你发布的服务")}</p>
            <button
              type="button"
              data-bay-action="edit"
              onClick={() => openBay({ kind: "service-editor", serviceId: service.id })}
              className="rounded-lg bg-neutral-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-neutral-800"
            >
              {tt("编辑")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-bay-action="order"
              disabled={!selection.tier}
              onClick={order}
              className="rounded-lg bg-neutral-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-500"
            >
              {selection.tier ? tt("立即下单") : tt("暂时无法下单")}
            </button>
            <button
              type="button"
              data-bay-action="talk"
              disabled={talking}
              onClick={() => void talk()}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
            >
              {talking ? tt("正在打开…") : tt("先聊聊")}
            </button>
          </>
        )}
        {error ? <p className="text-[12px] text-rose-600">{tt(error)}</p> : null}
        <div className="flex items-start justify-between gap-2">
          <FavoriteButton kind="service" refId={service.id} />
          {owner ? null : <ReportBox onSubmit={(reason, detail) => reportBayService(service.id, reason, detail)} />}
        </div>
      </div>
    </section>
  );

  const main = (
    <div className="min-w-0">
      <section>
        {media.length ? (
          <MediaView media={media[Math.min(activeMedia, media.length - 1)]} />
        ) : (
          <div className="grid aspect-video place-items-center rounded-xl bg-neutral-100 text-[13px] text-neutral-400">{tt("卖家暂未上传作品图")}</div>
        )}
        {media.length > 1 ? (
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {media.map((item, index) => {
              const thumb = item.kind === "image" ? safeHttpUrl(item.url) : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={activeMedia === index}
                  aria-label={tt("第 {n} 项", { n: index + 1 })}
                  onClick={() => setActiveMedia(index)}
                  className={"overflow-hidden rounded-lg border " + (activeMedia === index ? "border-neutral-900" : "border-neutral-200")}
                >
                  {thumb ? <img src={thumb} alt="" className="aspect-video w-full object-cover" /> : <span className="grid aspect-video place-items-center bg-neutral-100 text-[10px] text-neutral-500">▶</span>}
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="mt-4">
        <h2 className="break-words text-[18px] font-semibold text-neutral-950">{service.title}</h2>
        {service.delivery_mode === "off_platform" ? (
          <p className="mt-1 inline-block rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">{tt("这项服务在平台外完成")}</p>
        ) : null}
        {service.summary ? <p className="mt-1.5 break-words text-[13px] text-neutral-600">{service.summary}</p> : null}
        <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[12px] text-neutral-500">
          <span>{tt("{n} 次浏览", { n: service.view_count || 0 })}</span>
          <span>{tt("{n} 份订单", { n: service.order_count || 0 })}</span>
          {(service.tags || []).slice(0, 6).map((tag) => (
            <span key={tag} className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-neutral-600">
              {tag}
            </span>
          ))}
        </p>
        {service.description ? <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-neutral-700">{service.description}</p> : null}
      </section>

      <DoneMeans service={service} />

      <Section title={tt("选择档位")}>
        {tiers.length ? (
          <div className={wide ? "grid gap-2 md:grid-cols-3" : "grid gap-2"}>
            {tiers.map((tier) => (
              <TierCard key={tier.id} tier={tier} currency={service.currency} selected={selection.tier?.tier === tier.tier} onSelect={() => setTierName(tier.tier)} />
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-neutral-500">{tt("暂时无法下单")}</p>
        )}
      </Section>

      {addons.length ? (
        <Section title={tt("可选加购")}>
          <div className="space-y-2">
            {addons.map((addon) => {
              const checked = addonIds.includes(addon.id);
              return (
                <label key={addon.id} data-bay-addon={addon.id} className={"flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 " + (checked ? "border-neutral-900" : "border-neutral-200")}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => setAddonIds((current) => (event.target.checked ? [...current, addon.id] : current.filter((id) => id !== addon.id)))}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[13px] font-medium text-neutral-900">{addon.title}</span>
                    {addon.description ? <span className="mt-0.5 block break-words text-[12px] text-neutral-500">{addon.description}</span> : null}
                  </span>
                  <span className="shrink-0 text-right text-[12px] font-medium text-neutral-800">
                    +{formatBayMoney(addon.price_fen, currency)}
                    {addon.extra_days ? <span className="block font-normal text-neutral-500">{tt("+{n} 天", { n: addon.extra_days })}</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </Section>
      ) : null}

      {wide ? null : <div className="mt-5">{summary}</div>}

      {(service.faq || []).length ? (
        <Section title={tt("常见问题")}>
          <div className="space-y-2">
            {service.faq.map((item) => (
              <details key={item.id} className="rounded-xl border border-neutral-200 px-3 py-2">
                <summary className="cursor-pointer break-words text-[13px] font-medium text-neutral-800">{item.question}</summary>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-neutral-600">{item.answer}</p>
              </details>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title={tt("买家评价")}>
        <ReviewList reviews={service.reviews || []} empty={tt("这个服务还没有已公开的评价。")} />
      </Section>

      {wide || !service.seller ? null : (
        <div className="mt-5">
          <SellerCard seller={service.seller} />
        </div>
      )}
    </div>
  );

  if (!wide) return <div data-bay-pane="service" className="p-4">{main}</div>;
  return (
    <div data-bay-pane="service" className="grid items-start gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {main}
      <aside className="space-y-3 lg:sticky lg:top-4">
        {summary}
        {service.seller ? <SellerCard seller={service.seller} /> : null}
      </aside>
    </div>
  );
}
