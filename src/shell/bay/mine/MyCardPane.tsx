"use client";

// 「个人卡片」：买家看到的样子、卖家资料表单、打开主页 / 认证 / 收款。
// 表单保存成功后把新资料交回来，上面的预览当场跟着变。
import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayPublicProfile } from "../../../lib/bay/directory";
import { getSellerProfile, type BaySellerProfile } from "../../../lib/bay/seller";
import { BaySellerProfileSection } from "../seller/BaySellerProfileSection";
import { openBaySettings } from "../settings/settings-open";
import { openBay, type BayPaneProps } from "../shell/bay-state";
import { PaneLoading, SellerCard } from "../supply/parts";

const QUIET_BTN =
  "rounded-lg px-3 py-1.5 text-[13px] text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300";

function publicProfileFromMine(profile: BaySellerProfile): BayPublicProfile {
  return {
    user_id: profile.user_id || "",
    handle: profile.handle || "",
    display_name: profile.display_name || profile.handle || "",
    avatar_url: profile.avatar_url,
    headline: profile.headline,
    rating_avg: profile.rating_avg,
    rating_count: profile.rating_count ?? null,
    completed_contracts: profile.completed_contracts ?? null,
    languages: profile.languages,
    response_minutes: profile.response_minutes,
    skills: profile.skills,
    categories: profile.categories,
    level: profile.level ?? undefined,
    currency: profile.currency,
    official: profile.official,
  };
}

export function MyCardPane(_props: BayPaneProps) {
  const tt = useUI();
  const [profile, setProfile] = useState<BaySellerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void getSellerProfile().then(
      (data) => {
        if (!alive) return;
        setProfile(data?.profile ?? null);
        setLoading(false);
      },
      () => {
        if (!alive) return;
        setProfile(null);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section data-bay-pane="mine-card" className="space-y-6 px-4 py-4">
      <div data-bay-card-preview className="space-y-2">
        <h3 className="text-[13px] font-semibold text-stone-800">{tt("买家看到的样子")}</h3>
        {loading ? <PaneLoading /> : profile ? <SellerCard seller={publicProfileFromMine(profile)} /> : null}
        {!loading && !profile?.published ? (
          <p className="text-[12px] text-stone-500">{tt("资料还没有公开。公开后买家才能看到这张卡片，你才能上架服务。")}</p>
        ) : null}
      </div>
      <BaySellerProfileSection onSaved={setProfile} />
      <div data-bay-card-links className="flex flex-wrap gap-2">
        <button type="button" className={QUIET_BTN} onClick={() => openBay({ kind: "profile", handle: "me" })}>
          {tt("打开我的主页")}
        </button>
        <button type="button" className={QUIET_BTN} onClick={() => openBaySettings("vetting")}>
          {tt("认证")}
        </button>
        <button type="button" className={QUIET_BTN} onClick={() => openBaySettings("money")}>
          {tt("收款")}
        </button>
      </div>
    </section>
  );
}
