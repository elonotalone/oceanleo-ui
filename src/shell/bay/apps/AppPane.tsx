"use client";

// 作品详情：简介、作者、收费条、页内嵌入窗口、在新窗口打开、更新日志、买家评价、留言与反馈、举报。
// 收费条、关注、更新日志、留言、登录提示各是别的目录里的组件，按文件路径引用；本文件只负责把它们摆在一起。
import { useEffect, useRef, useState, type ReactElement } from "react";
import { BayImageStage } from "../form/BayImageGallery";
import { cleanGalleryUrls } from "../form/bay-gallery";

import { useUI } from "../../../i18n/ui/useUI";
import { getBayApp, recordBayAppEvent, reportBayApp, type BayApp, type BayAppMine } from "../../../lib/bay/apps";
import { openBay, type BayPaneProps } from "../shell/bay-state";
import { Avatar, PaneLoading, PaneMessage, ReportBox, Section } from "../supply/parts";
import { useBayResource } from "../supply/use-bay-resource";
import { markBayAppOpened, type BayAppAccess } from "../../../lib/bay/app-paid";
import { AppFeedback } from "../appfeedback/AppFeedback";
import { currentBayAppSource } from "../appinsights/app-source";
import { AppLoginHint } from "../applogin/AppLoginHint";
import { AppPurchaseBar } from "../apppaid/AppPurchaseBar";
import { AppReleases } from "../appreleases/AppReleases";
import { FollowButton } from "../appreleases/FollowButton";
import { ItemReviews } from "../reviews/ItemReviews";
import { AppEmbedFrame } from "./AppEmbedFrame";
import { embedDecision, safeAppUrl, type EmbedDecision } from "./app-embed";

export function AppPane(props: BayPaneProps): ReactElement | null {
  const tt = useUI();
  const appId = props.target.kind === "app" ? props.target.id : "";
  const resource = useBayResource(appId ? `app:${appId}` : null, () => getBayApp(appId));
  if (!appId) return null;
  if (resource.loading) return <PaneLoading />;
  if (!resource.data) {
    const text = resource.status === 404 || !resource.error ? tt("这个作品不存在或已下架") : tt(resource.error);
    return <PaneMessage text={text} onRetry={resource.reload} />;
  }
  return <AppDetailView payload={resource.data} siteKey={props.siteKey} />;
}

function isOwnerApp(app: BayApp | BayAppMine): app is BayAppMine {
  return "moderation_hidden" in app;
}

function ownerBanner(app: BayApp | BayAppMine, owner: boolean): "hidden" | "offline" | "draft" | null {
  if (!owner) return null;
  if (isOwnerApp(app) && app.moderation_hidden) return "hidden";
  if (app.status === "published") return null;
  return app.status === "offline" ? "offline" : "draft";
}

/** 收费作品在没买、没订阅、也不在试用期时不放进窗口；权益还没读出来时同样先不放。免费作品和作者本人不受影响。 */
export function appLocked(app: Pick<BayApp, "price_model">, owner: boolean, access: Pick<BayAppAccess, "entitled"> | null): boolean {
  if (owner || app.price_model === "free") return false;
  return !access || !access.entitled;
}

function AppDetailView({ payload, siteKey }: { payload: { app: BayApp | BayAppMine; viewer: { is_owner: boolean } }; siteKey: string }): ReactElement {
  const tt = useUI();
  const { app, viewer } = payload;
  const owner = viewer.is_owner;
  const viewedRef = useRef(false);
  const openedRef = useRef(false);
  const [access, setAccess] = useState<BayAppAccess | null>(null);
  const paid = app.price_model !== "free";
  const locked = appLocked(app, owner, access);
  const parsed = safeAppUrl(app.url);
  const decision = embedDecision(app);
  const banner = ownerBanner(app, owner);
  const author = app.author;
  const authorName = author?.display_name || author?.handle || "";
  const coverUrls = cleanGalleryUrls(app.gallery_urls, app.cover_url);
  const [activeCover, setActiveCover] = useState(0);

  useEffect(() => {
    if (owner || viewedRef.current) return;
    viewedRef.current = true;
    void recordBayAppEvent(app.id, "view", currentBayAppSource(app.id, siteKey));
  }, [app.id, owner, siteKey]);

  function recordOpen() {
    if (owner || openedRef.current) return;
    openedRef.current = true;
    void recordBayAppEvent(app.id, "open", currentBayAppSource(app.id, siteKey));
    // 买了或订阅了的人第一次真的用上作品：记下来，之后退款要说明理由（没用过的可以直接退）。
    if (access?.entitled && (access.reason === "purchase" || access.reason === "subscription")) void markBayAppOpened(app.id);
  }

  function openExternal() {
    if (!parsed) return;
    recordOpen();
    window.open(parsed.href, "_blank", "noopener,noreferrer");
  }

  return (
    <div data-bay-pane="app" className="p-4">
      {banner === "hidden" ? (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{tt("只有你能看到：这个作品已被平台隐藏")}</p>
      ) : null}
      {banner === "offline" ? (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{tt("只有你能看到：这个作品已下架")}</p>
      ) : null}
      {banner === "draft" ? (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{tt("只有你能看到：这个作品还没上架")}</p>
      ) : null}

      {coverUrls.length ? (
        <div className="mb-4">
          <BayImageStage urls={coverUrls} active={activeCover} onActive={setActiveCover} emptyLabel={tt("封面")} />
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-[18px] font-semibold text-neutral-950">{app.title}</h2>
            {owner ? (
              <button
                type="button"
                data-bay-action="edit"
                onClick={() => openBay({ kind: "app-editor", appId: app.id })}
                className="rounded-full border border-neutral-900 px-2 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50"
              >
                {tt("编辑")}
              </button>
            ) : null}
            {owner ? (
              <button
                type="button"
                data-bay-action="manage"
                onClick={() => openBay({ kind: "app-manage", appId: app.id })}
                className="rounded-full border border-neutral-900 px-2 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50"
              >
                {tt("管理")}
              </button>
            ) : null}
            <FollowButton appId={app.id} isOwner={owner} />
          </div>
          {app.summary ? <p className="mt-1.5 break-words text-[13px] text-neutral-600">{app.summary}</p> : null}
          {author ? (
            <div className="mt-3 flex items-center gap-2">
              <Avatar url={author.avatar_url} name={authorName} size="sm" />
              {author.handle ? (
                <button
                  type="button"
                  data-bay-author
                  onClick={() => openBay({ kind: "profile", handle: author.handle as string })}
                  className="truncate text-[13px] font-medium text-neutral-800 hover:underline"
                >
                  {authorName}
                </button>
              ) : (
                <span className="truncate text-[13px] font-medium text-neutral-800">{authorName}</span>
              )}
              {author.official ? (
                <span data-bay-official className="shrink-0 text-[11px] text-neutral-500">
                  {tt("官方")}
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[12px] text-neutral-500">
            {app.url_host ? <span>{app.url_host}</span> : null}
            <span>{tt("{n} 次打开", { n: app.open_count || 0 })}</span>
          </p>
        </div>
        {locked ? null : parsed ? (
          <button
            type="button"
            onClick={openExternal}
            className="shrink-0 rounded-full bg-neutral-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-neutral-800"
          >
            {tt(decision.mode === "frame" ? "在新窗口打开" : "打开网站")}
          </button>
        ) : (
          <p className="max-w-[14rem] shrink-0 text-right text-[12px] text-rose-600">{tt("这个作品的地址有问题，暂时打不开")}</p>
        )}
      </div>

      {paid ? (
        <div className="mt-4">
          <AppPurchaseBar app={app} isOwner={owner} onAccess={setAccess} />
        </div>
      ) : null}

      <div className="mt-4">
        {locked ? (
          <div
            data-bay-app-locked
            className="grid min-h-[20rem] place-items-center px-0 py-10 text-center"
          >
            <p className="max-w-[24rem] text-[14px] font-medium text-neutral-800">
              {app.trial_days > 0 ? tt("这个作品需要购买或开始试用后才能使用") : tt("这个作品需要购买后才能使用")}
            </p>
          </div>
        ) : decision.mode === "frame" ? (
          <AppWindow decision={decision} title={app.title} host={app.url_host} onOpenExternal={openExternal} onReady={recordOpen} />
        ) : (
          <LinkOutCard host={app.url_host} href={decision.href} onOpen={openExternal} />
        )}
      </div>

      {app.login_enabled ? <AppLoginHint app={app} /> : null}

      {app.description ? (
        <Section title={tt("详细介绍")}>
          <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-neutral-700">{app.description}</p>
        </Section>
      ) : null}

      <AppReleases appId={app.id} isOwner={owner} />

      {paid ? (
        <div className="mt-5" data-bay-app-reviews>
          <ItemReviews itemKind="app" itemId={app.id} />
        </div>
      ) : null}

      <AppFeedback appId={app.id} isOwner={owner} />

      {owner ? null : (
        <div className="mt-5">
          <ReportBox onSubmit={(reason, detail) => reportBayApp(app.id, reason, detail)} />
        </div>
      )}
    </div>
  );
}

function AppWindow({
  decision,
  title,
  host,
  onOpenExternal,
  onReady,
}: {
  decision: Extract<EmbedDecision, { mode: "frame" }>;
  title: string;
  host: string;
  onOpenExternal: () => void;
  onReady: () => void;
}): ReactElement {
  return <AppEmbedFrame src={decision.src} host={host} title={title} onOpenExternal={onOpenExternal} onReady={onReady} />;
}

function LinkOutCard({
  host,
  href,
  onOpen,
}: {
  host: string;
  href: string | null;
  onOpen: () => void;
}): ReactElement {
  const tt = useUI();
  return (
    <div data-bay-app-link-out className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-8 text-center">
      {host ? <p className="text-[12px] text-neutral-500">{host}</p> : null}
      <p className="mt-1 text-[14px] font-medium text-neutral-800">{tt("这个作品需要在它自己的网站上使用")}</p>
      {href ? (
        <button
          type="button"
          onClick={onOpen}
          className="mt-4 rounded-full bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800"
        >
          {tt("打开网站")}
        </button>
      ) : null}
    </div>
  );
}
