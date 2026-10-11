"use client";

// 作品详情：简介、作者、页内嵌入窗口、在新窗口打开、举报。本文件归 U2 单元；组件名与 props 是合同，不许改。
import { useEffect, useRef, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { getBayApp, recordBayAppEvent, reportBayApp, type BayApp, type BayAppMine } from "../../../lib/bay/apps";
import { openBay, type BayPaneProps } from "../shell/bay-state";
import { Avatar, PaneLoading, PaneMessage, ReportBox, Section } from "../supply/parts";
import { useBayResource } from "../supply/use-bay-resource";
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
  return <AppDetailView payload={resource.data} />;
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

function AppDetailView({ payload }: { payload: { app: BayApp | BayAppMine; viewer: { is_owner: boolean } } }): ReactElement {
  const tt = useUI();
  const { app, viewer } = payload;
  const owner = viewer.is_owner;
  const viewedRef = useRef(false);
  const openedRef = useRef(false);
  const parsed = safeAppUrl(app.url);
  const decision = embedDecision(app);
  const banner = ownerBanner(app, owner);
  const author = app.author;
  const authorName = author?.display_name || author?.handle || "";

  useEffect(() => {
    if (owner || viewedRef.current) return;
    viewedRef.current = true;
    void recordBayAppEvent(app.id, "view");
  }, [app.id, owner]);

  function recordOpen() {
    if (owner || openedRef.current) return;
    openedRef.current = true;
    void recordBayAppEvent(app.id, "open");
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

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-[18px] font-semibold text-neutral-950">{app.title}</h2>
            {owner ? (
              <button
                type="button"
                data-bay-action="edit"
                onClick={() => openBay({ kind: "app-editor", appId: app.id })}
                className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50"
              >
                {tt("编辑")}
              </button>
            ) : null}
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
        {parsed ? (
          <button
            type="button"
            onClick={openExternal}
            className="shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-neutral-800"
          >
            {tt("在新窗口打开")}
          </button>
        ) : (
          <p className="max-w-[14rem] shrink-0 text-right text-[12px] text-rose-600">{tt("这个作品的地址有问题，暂时打不开")}</p>
        )}
      </div>

      <div className="mt-4">
        <AppWindow decision={decision} title={app.title} host={app.url_host} onOpenExternal={openExternal} onReady={recordOpen} />
      </div>

      {app.description ? (
        <Section title={tt("详细介绍")}>
          <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-neutral-700">{app.description}</p>
        </Section>
      ) : null}

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
  decision: EmbedDecision;
  title: string;
  host: string;
  onOpenExternal: () => void;
  onReady: () => void;
}): ReactElement {
  const tt = useUI();
  if (decision.mode === "frame") {
    return <AppEmbedFrame src={decision.src} host={host} title={title} onOpenExternal={onOpenExternal} onReady={onReady} />;
  }
  if (decision.reason === "blocked") {
    return <FallbackCard marker="blocked" title={tt("这个网站不允许在别的页面里显示")} href={decision.href} onOpen={onOpenExternal} />;
  }
  if (decision.reason === "creator") {
    return <FallbackCard marker="creator" title={tt("这个作品需要在它自己的网站上使用")} href={decision.href} onOpen={onOpenExternal} />;
  }
  if (decision.reason === "first-party") {
    return <FallbackCard marker="first-party" title={tt("这个作品需要在它自己的网站上使用")} href={decision.href} onOpen={onOpenExternal} />;
  }
  return <FallbackCard marker="invalid" title={tt("这个作品的地址有问题，暂时打不开")} href={null} onOpen={onOpenExternal} />;
}

function FallbackCard({
  marker,
  title,
  href,
  onOpen,
}: {
  marker: "creator" | "blocked" | "first-party" | "invalid";
  title: string;
  href: string | null;
  onOpen: () => void;
}): ReactElement {
  const tt = useUI();
  return (
    <div
      data-bay-app-fallback={marker === "blocked" ? "blocked" : marker === "creator" ? "creator" : marker === "first-party" ? "first-party" : "invalid"}
      className="grid min-h-[32rem] place-items-center rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-10 text-center"
    >
      <div>
        <p className="text-[14px] font-medium text-neutral-800">{title}</p>
        {href ? (
          <button
            type="button"
            onClick={onOpen}
            className="mt-4 rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800"
          >
            {tt("打开网站")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
