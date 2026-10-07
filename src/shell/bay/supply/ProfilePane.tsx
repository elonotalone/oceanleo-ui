"use client";

// 个人主页窗格：别人的主页（`profile:<handle>`）与我自己的主页（`profile:me`）。
// 版面由 `page/ProfilePage` 按 `page_doc` 画；本人多一个「编辑主页」，进编辑后是 `page/ProfilePageEditor`。
// 不登录也能看别人的主页；先聊聊、收藏、举报、拉黑要登录。

import { useMemo, useState } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { getUserId } from "../../../lib/auth/client";
import {
  blockBayUser,
  getBayProfile,
  reportBayProfile,
  type BayProfilePage,
  type BayReview,
} from "../../../lib/bay/directory";
import { defaultPageDoc, normalizePageDoc, type BayPageDoc } from "../../../lib/bay/page-doc";
import {
  getSellerProfile,
  listMyServices,
  listMyShowcase,
  saveSellerPage,
  saveSellerProfile,
  sellerProfileBody,
  type BaySellerProfile,
} from "../../../lib/bay/seller";
import type { BayService } from "../../../lib/bay/services";
import { openTradeThread } from "../deal";
import { ProfilePage } from "../page/ProfilePage";
import { ProfilePageEditor } from "../page/ProfilePageEditor";
import { BaySignInPrompt } from "../shell/BayMine";
import { openBay, requireBayLogin, setBayFilter, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { FavoriteButton, PaneLoading, PaneMessage, ReportBox } from "./parts";
import { errorText, useBayResource } from "./use-bay-resource";

/** `profile:me` = 我自己的主页（没有就自动建一份）。 */
export const BAY_OWN_HANDLE = "me";
/** 官方发布者的主页地址。 */
export const BAY_OFFICIAL_HANDLE = "oceanleo";

const MOTION = "transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";
const ACTION_PRIMARY = `rounded-full bg-neutral-900 px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm ${MOTION} hover:bg-neutral-800 disabled:opacity-50`;
const ACTION_SECONDARY = `rounded-full border border-neutral-200 bg-white px-5 py-2.5 text-[13px] font-medium text-neutral-700 shadow-sm ${MOTION} hover:bg-neutral-50 disabled:opacity-50`;

interface OwnPage extends BayProfilePage {
  own: true;
  seller: BaySellerProfile;
}

async function loadOwnPage(): Promise<OwnPage> {
  let { profile } = await getSellerProfile();
  if (!profile) profile = (await saveSellerPage(null)).profile;
  const [services, showcase] = await Promise.all([
    listMyServices().then(
      (result) => result.items || [],
      () => [],
    ),
    listMyShowcase().then(
      (result) => result.items || [],
      () => [],
    ),
  ]);
  let reviews: BayReview[] = [];
  if (profile.published) {
    try {
      reviews = (await getBayProfile(profile.handle)).reviews || [];
    } catch {
      reviews = [];
    }
  }
  return {
    own: true,
    seller: profile,
    profile: { ...profile, user_id: profile.user_id || "" } as BayProfilePage["profile"],
    // 主页上只摆已上架的；草稿在「我的 → 我的服务」里。
    services: services.filter((service) => service.status === "published" && !service.moderation_hidden) as unknown as BayService[],
    showcase: showcase as unknown as BayProfilePage["showcase"],
    reviews,
  };
}

function isOwnPage(page: BayProfilePage): page is OwnPage {
  return (page as Partial<OwnPage>).own === true;
}

export function ProfilePane({ target }: BayPaneProps) {
  const tt = useUI();
  const handle = target.kind === "profile" ? target.handle : "";
  const mine = handle === BAY_OWN_HANDLE;
  const signedIn = useBaySignedIn();
  const page = useBayResource<BayProfilePage>(handle && (!mine || signedIn) ? `profile:${handle}` : null, () => (mine ? loadOwnPage() : getBayProfile(handle)));
  const viewer = useBayResource("viewer", () => getUserId());
  if (!handle) return null;
  if (mine && !signedIn) return <BaySignInPrompt text={tt("登录后就能有一张自己的主页")} />;
  if (page.loading) return <PaneLoading />;
  if (!page.data?.profile) {
    const text = page.status === 404 || !page.error ? tt("这个主页不存在或尚未公开") : tt(page.error);
    return <PaneMessage text={text} onRetry={page.reload} />;
  }
  return <ProfileDetailView page={page.data} viewerId={viewer.data} onChanged={page.reload} />;
}

export function ProfileDetailView({ page, viewerId, onChanged }: { page: BayProfilePage; viewerId: string | null; onChanged?: () => void }) {
  const tt = useUI();
  const profile = page.profile as BayProfilePage["profile"] & { page_doc?: unknown; official?: boolean };
  const own = isOwnPage(page) || Boolean(viewerId && profile.user_id && viewerId === profile.user_id);
  const [editing, setEditing] = useState(false);
  const [savedDoc, setSavedDoc] = useState<BayPageDoc | null>(null);
  const [published, setPublished] = useState(Boolean(profile.published ?? true));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [talkError, setTalkError] = useState("");
  const [blockState, setBlockState] = useState<"idle" | "done" | "busy">("idle");

  // 记住这份版面：编辑器拿它当「改之前的样子」来判断有没有改动，所以不能每次重画都换一个新对象。
  const doc = useMemo(
    () => savedDoc ?? normalizePageDoc(profile.page_doc) ?? defaultPageDoc(profile, tt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedDoc, profile.page_doc, profile.display_name, profile.headline, profile.bio],
  );

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
    try {
      await blockBayUser(profile.user_id);
      setBlockState("done");
    } catch (error) {
      setTalkError(errorText(error) || tt("没拉黑成功，请稍后再试。"));
      setBlockState("idle");
    }
  }

  async function save(next: BayPageDoc) {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const result = await saveSellerPage(next);
      setSavedDoc(normalizePageDoc(result.profile.page_doc) ?? next);
      setEditing(false);
    } catch (error) {
      setSaveError(errorText(error) || tt("没保存成功，请稍后再试。"));
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (saving || !isOwnPage(page)) return;
    setSaving(true);
    setSaveError("");
    try {
      const seller = page.seller;
      await saveSellerProfile(
        sellerProfileBody({
          handle: seller.handle,
          display_name: seller.display_name,
          avatar_url: seller.avatar_url || "",
          headline: seller.headline || "",
          bio: seller.bio || "",
          categories: seller.categories || [],
          skills: seller.skills || [],
          languages: seller.languages || [],
          availability: seller.availability || "open",
          engagement_kinds: seller.engagement_kinds || ["fixed"],
          hourly_rate_fen: seller.hourly_rate_fen ?? null,
          min_budget_fen: seller.min_budget_fen ?? null,
          published: true,
        }),
      );
      setPublished(true);
      onChanged?.();
    } catch (error) {
      setSaveError(errorText(error) || tt("没公开成功，请稍后再试。"));
    } finally {
      setSaving(false);
    }
  }

  if (own && editing) {
    return <ProfilePageEditor page={page} initial={doc} saving={saving} error={saveError} onSave={(next) => void save(next)} onCancel={() => setEditing(false)} />;
  }

  const official = Boolean(profile.official) && profile.handle === BAY_OFFICIAL_HANDLE;
  const canTalk = !own && Boolean(profile.user_id);

  const actions = own ? (
    <>
      {!published ? (
        <button type="button" data-bay-page-action="publish" disabled={saving} onClick={() => void publish()} className={ACTION_SECONDARY}>
          {tt("公开主页")}
        </button>
      ) : null}
      <button type="button" data-bay-page-action="settings" onClick={() => openBay({ kind: "settings", pane: "profile" })} className={ACTION_SECONDARY}>
        {tt("资料")}
      </button>
      <button type="button" data-bay-page-action="edit" onClick={() => setEditing(true)} className={ACTION_PRIMARY}>
        {tt("编辑主页")}
      </button>
    </>
  ) : canTalk ? (
    <>
      <button type="button" data-bay-talk onClick={() => void talk()} className={ACTION_PRIMARY}>
        {tt("先聊聊")}
      </button>
      <span className="rounded-full bg-white px-2 py-1 text-neutral-900 shadow-sm">
        <FavoriteButton kind="profile" refId={profile.user_id} />
      </span>
    </>
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-bay-profile={own ? "own" : "public"}>
      {own && !published ? (
        <p className="shrink-0 bg-amber-50 px-4 py-2.5 text-center text-[12.5px] text-amber-900" data-bay-page-unpublished>
          {tt("这张主页现在只有你自己看得到。公开之后别人才能访问，发布商品或服务时也会自动公开。")}
        </p>
      ) : null}
      {saveError && !editing ? <p className="shrink-0 bg-rose-50 px-4 py-2 text-center text-[12.5px] text-rose-700">{tt(saveError)}</p> : null}
      {talkError ? <p className="shrink-0 bg-rose-50 px-4 py-2 text-center text-[12.5px] text-rose-700">{tt(talkError)}</p> : null}
      <ProfilePage
        page={page}
        doc={doc}
        actions={actions}
        onTalk={canTalk ? () => void talk() : undefined}
        onBrowseMaterials={
          official
            ? () => {
                setBayFilter({ kind: "material" });
                openBay({ kind: "feed" });
              }
            : undefined
        }
      />
      {canTalk ? (
        <footer className="flex shrink-0 flex-wrap items-center justify-center gap-4 border-t border-neutral-100 bg-white px-4 py-3 text-neutral-900">
          <ReportBox onSubmit={(reason, detail) => reportBayProfile(profile.user_id, reason, detail)} />
          {blockState === "done" ? (
            <span data-bay-blocked className="text-[12px] text-neutral-500">
              {tt("已拉黑")}
            </span>
          ) : (
            <button type="button" data-bay-block onClick={() => void block()} className={`rounded-lg px-2 py-1.5 text-[12px] text-neutral-500 ${MOTION} hover:bg-neutral-100 hover:text-neutral-900`}>
              {tt("拉黑")}
            </button>
          )}
        </footer>
      ) : null}
    </div>
  );
}
