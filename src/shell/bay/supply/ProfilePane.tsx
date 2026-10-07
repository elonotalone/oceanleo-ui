"use client";

// 个人主页（移植自 talent `app/u/[handle]/page.tsx`，外壳不搬）。
// 不登录也能看；先聊聊、收藏、举报、拉黑要登录。窗格不自带返回栏/标题栏/滚动。

import { useState } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { getUserId } from "../../../lib/auth/client";
import {
  blockBayUser,
  getBayProfile,
  profileDisplayName,
  reportBayProfile,
  splitShowcase,
  type BayProfilePage,
  type BayPublicProfile,
} from "../../../lib/bay/directory";
import type { BayService } from "../../../lib/bay/services";
import type { BayFeedItem } from "../../../lib/bay/types";
import { openTradeThread } from "../deal";
import { openBay, requireBayLogin, type BayPaneProps } from "../shell/bay-state";
import { ratingShort, responseTimeText, safeHttpUrl } from "./format";
import { Avatar, FavoriteButton, PaneLoading, PaneMessage, PracticeLine, ReputationGrid, ReportBox, ReviewList, Section } from "./parts";
import { ServiceCard } from "./ServiceCard";
import { errorText, useBayResource } from "./use-bay-resource";

export function ProfilePane({ target }: BayPaneProps) {
  const tt = useUI();
  const handle = target.kind === "profile" ? target.handle : "";
  const page = useBayResource(handle ? `profile:${handle}` : null, () => getBayProfile(handle));
  const viewer = useBayResource("viewer", () => getUserId());
  if (!handle) return null;
  if (page.loading) return <PaneLoading />;
  if (!page.data?.profile) {
    const text = page.status === 404 || !page.error ? tt("这个主页不存在或尚未公开") : tt(page.error);
    return <PaneMessage text={text} onRetry={page.reload} />;
  }
  return <ProfileDetailView page={page.data} viewerId={viewer.data} />;
}

function asFeedItem(service: BayService, profile: BayPublicProfile): BayFeedItem & { delivery_days: number | null } {
  return {
    kind: "service",
    id: service.id,
    title: service.title,
    summary: service.summary,
    category: service.category,
    created_at: service.created_at || "",
    posted_site: null,
    handling_site: service.category || "oceanleo",
    price: {
      min_fen: service.min_price_fen ?? service.price_fen ?? null,
      max_fen: null,
      unit: service.price_unit || "project",
      currency: service.currency || "CNY",
    },
    author: {
      user_id: profile.user_id,
      handle: profile.handle,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      verified_level: 0,
      rating_avg: profile.rating_avg ?? null,
      rating_count: profile.rating_count ?? 0,
    },
    stats: { order_count: service.order_count },
    status: service.status,
    deadline_at: null,
    cover_url: service.cover_url,
    has_attached_work: false,
    delivery_days: service.delivery_days,
  };
}

export function ProfileDetailView({ page, viewerId }: { page: BayProfilePage; viewerId: string | null }) {
  const tt = useUI();
  const { profile, services, showcase, reviews } = page;
  const name = profileDisplayName(profile);
  const own = Boolean(viewerId && profile.user_id && viewerId === profile.user_id);
  const { portfolio, verified } = splitShowcase(showcase);
  const [talkError, setTalkError] = useState("");
  const [blockState, setBlockState] = useState<"idle" | "done" | "busy">("idle");
  const [blockError, setBlockError] = useState("");

  async function talk() {
    if (!requireBayLogin()) return;
    setTalkError("");
    try {
      await openTradeThread({ kind: "direct", userId: profile.user_id });
    } catch (error) {
      setTalkError(errorText(error) || tt("会话没打开，请稍后再试。"));
    }
  }

  async function block() {
    if (blockState !== "idle" || !requireBayLogin()) return;
    setBlockState("busy");
    setBlockError("");
    try {
      await blockBayUser(profile.user_id);
      setBlockState("done");
    } catch (error) {
      setBlockError(errorText(error) || tt("没拉黑成功，请稍后再试。"));
      setBlockState("idle");
    }
  }

  return (
    <article data-bay-pane="profile" className="px-4 py-4">
      <div className="flex items-start gap-3">
        <Avatar url={profile.avatar_url} name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <p data-bay-profile-name className="break-words text-[18px] font-semibold text-neutral-950">
            {name}
          </p>
          <p className="text-[12px] text-neutral-500">@{profile.handle}</p>
          <div className="mt-1">
            <PracticeLine source={profile} />
          </div>
        </div>
      </div>
      <p className="mt-3 break-words text-[13px] text-neutral-600">{profile.headline || tt("卖家暂未填写简介。")}</p>
      {profile.bio ? <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-neutral-700">{profile.bio}</p> : null}
      {(profile.skills || []).length || (profile.languages || []).length || (profile.categories || []).length ? (
        <p className="mt-2 flex flex-wrap gap-1.5 text-[12px] text-neutral-600">
          {(profile.categories || []).map((item) => (
            <span key={`c-${item}`} className="rounded-md bg-neutral-100 px-1.5 py-0.5">
              {item}
            </span>
          ))}
          {(profile.skills || []).map((item) => (
            <span key={`s-${item}`} className="rounded-md bg-neutral-100 px-1.5 py-0.5">
              {item}
            </span>
          ))}
          {(profile.languages || []).map((item) => (
            <span key={`l-${item}`}>{item}</span>
          ))}
        </p>
      ) : null}
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-neutral-500">
        <span>{ratingShort(tt, profile.rating_avg, profile.rating_count)}</span>
        <span>{responseTimeText(tt, profile.response_minutes)}</span>
      </p>
      {profile.handle ? (
        <div className="mt-3">
          <ReputationGrid handle={profile.handle} />
        </div>
      ) : null}

      {!own ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" data-bay-talk onClick={() => void talk()} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] text-white">
            {tt("先聊聊")}
          </button>
          <FavoriteButton kind="profile" refId={profile.user_id} />
          <ReportBox onSubmit={(reason, detail) => reportBayProfile(profile.user_id, reason, detail)} />
          {blockState === "done" ? (
            <span data-bay-blocked className="text-[12px] text-neutral-500">
              {tt("已拉黑")}
            </span>
          ) : (
            <button type="button" data-bay-block onClick={() => void block()} className="text-[12px] text-neutral-500 hover:underline">
              {tt("拉黑")}
            </button>
          )}
        </div>
      ) : null}
      {talkError ? <p className="mt-2 text-[12px] text-rose-600">{tt(talkError)}</p> : null}
      {blockError ? <p className="mt-2 text-[12px] text-rose-600">{tt(blockError)}</p> : null}

      <Section title={tt("服务")}>
        {services.length ? (
          <div data-bay-profile-services>
            {services.map((service) => (
              <ServiceCard key={service.id} item={asFeedItem(service, profile)} onOpen={() => openBay({ kind: "service", id: service.id })} />
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-neutral-500">{tt("还没有上架的服务。")}</p>
        )}
      </Section>

      {portfolio.length ? (
        <Section title={tt("作品集")}>
          {portfolio.map((item) => (
            <ShowcaseRow key={item.id} title={item.title} summary={item.summary} cover={item.cover_url} />
          ))}
        </Section>
      ) : null}

      {verified.length ? (
        <Section title={tt("平台见证的交付")}>
          {verified.map((item) => (
            <ShowcaseRow key={item.id} title={item.title} summary={item.summary} cover={item.cover_url} />
          ))}
        </Section>
      ) : null}

      <Section title={tt("买家评价")}>
        <ReviewList reviews={reviews} empty={tt("暂无评价")} />
      </Section>
    </article>
  );
}

function ShowcaseRow({ title, summary, cover }: { title: string; summary: string; cover: string | null }) {
  const safe = safeHttpUrl(cover);
  return (
    <div data-bay-showcase className="flex items-start gap-3 border-b border-neutral-100 py-2.5">
      {safe ? <img src={safe} alt="" className="h-12 w-16 shrink-0 rounded object-cover" /> : null}
      <div className="min-w-0">
        <p className="break-words text-[13px] font-medium text-neutral-900">{title}</p>
        {summary ? <p className="mt-0.5 line-clamp-2 break-words text-[12px] text-neutral-500">{summary}</p> : null}
      </div>
    </div>
  );
}
