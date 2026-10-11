"use client";

// 作品把人带到 /bay?bay=app-login&…。地址参数全部不可信；跳回作品前再核对协议/主机/端口/路径。
import { useState, useSyncExternalStore, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { previewBayAppLogin, approveBayAppLogin } from "../../../lib/bay/app-login";
import { openBay, requireBayLogin, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { Avatar, PaneLoading, PaneMessage } from "../supply/parts";
import { safeHttpUrl } from "../supply/format";
import { errorText, useBayResource } from "../supply/use-bay-resource";
import { readLoginRequest, redirectHost, sameRedirectTarget } from "./login-model";

function pageSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

function pageFramed(): boolean {
  return typeof window !== "undefined" && window.top !== window.self;
}

export function AppLoginConsentPane(_props: BayPaneProps): ReactElement {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const search = useSyncExternalStore(() => () => {}, pageSearch, () => "");
  const framed = useSyncExternalStore(() => () => {}, pageFramed, () => false);
  const parsed = readLoginRequest(search);
  const request = parsed.ok ? parsed.request : null;
  const previewKey = signedIn && request && !framed ? `login-preview:${request.client_id}:${request.redirect_uri}` : null;
  const preview = useBayResource(previewKey, () =>
    previewBayAppLogin({ client_id: request!.client_id, redirect_uri: request!.redirect_uri }),
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  async function approve() {
    if (!request || busy) return;
    if (!requireBayLogin()) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await approveBayAppLogin(request);
      if (!sameRedirectTarget(result.redirect_to, request.redirect_uri)) {
        setActionError(tt("跳回作品的地址和登记的回调地址对不上，没有跳转。请回到作品重新点登录。"));
        return;
      }
      window.location.assign(result.redirect_to);
    } catch (error) {
      setActionError(errorText(error) || tt("没同意成功，请稍后再试。"));
    } finally {
      setBusy(false);
    }
  }

  if (!parsed.ok || !request) {
    return (
      <div data-bay-pane="app-login" data-bay-login-invalid className="px-4 py-12 text-center">
        <p className="text-[14px] font-medium text-neutral-800">{tt("登录请求不完整，请回到作品重新点登录。")}</p>
      </div>
    );
  }

  if (framed) {
    return (
      <div data-bay-pane="app-login" data-bay-login-framed className="px-4 py-12 text-center">
        <p className="text-[14px] font-medium text-neutral-800">{tt("请在新窗口打开这个页面再继续")}</p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div data-bay-pane="app-login" data-bay-login-need-signin className="px-4 py-12 text-center">
        <p className="text-[14px] font-medium text-neutral-800">{tt("先登录 OceanLeo，再回来确认")}</p>
        <button
          type="button"
          data-bay-login-signin
          onClick={() => {
            requireBayLogin();
          }}
          className="mt-4 rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] text-white"
        >
          {tt("登录")}
        </button>
      </div>
    );
  }

  if (preview.loading) {
    return (
      <div data-bay-pane="app-login">
        <PaneLoading />
      </div>
    );
  }

  if (!preview.data) {
    return (
      <div data-bay-pane="app-login">
        <PaneMessage text={preview.error || tt("登录请求不完整，请回到作品重新点登录。")} onRetry={preview.reload} />
      </div>
    );
  }

  const body = preview.data;
  const cover = safeHttpUrl(body.app.cover_url);
  const host = body.app.url_host;
  const backHost = redirectHost(request.redirect_uri);

  return (
    <div data-bay-pane="app-login" className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-start gap-3">
        {cover ? (
          <img src={cover} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-neutral-100 text-[13px] font-semibold text-neutral-500">
            {body.app.title.slice(0, 1) || "?"}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="break-words text-[18px] font-semibold text-neutral-950">{body.app.title}</h2>
          {body.app.author_name ? (
            <div className="mt-1 flex items-center gap-2">
              <Avatar url={null} name={body.app.author_name} size="sm" />
              <p className="truncate text-[13px] text-neutral-600">{tt("作者 {name}", { name: body.app.author_name })}</p>
            </div>
          ) : null}
          <p data-bay-login-host className="mt-2 break-all text-[15px] font-semibold text-neutral-950">
            {host}
          </p>
        </div>
      </div>

      <p className="text-[14px] font-medium text-neutral-900">{tt("{title} 想用你的 OceanLeo 账号登录", { title: body.app.title })}</p>
      {body.already_granted ? (
        <p data-bay-login-already className="text-[13px] text-neutral-700">
          {tt("你以前同意过，可以直接继续")}
        </p>
      ) : null}

      <section>
        <h3 className="text-[13px] font-semibold text-neutral-900">{tt("它会得到")}</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-neutral-700">
          <li>{tt("只在这个作品里使用的用户编号")}</li>
          <li>{tt("你的昵称")}</li>
          <li>{tt("你的头像")}</li>
        </ul>
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-neutral-900">{tt("它不会得到")}</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-neutral-700">
          <li>{tt("你的邮箱和手机号")}</li>
          <li>{tt("你的余额和订单")}</li>
          <li>{tt("在别的作品里的身份")}</li>
          <li>{tt("以你的名义操作 OceanLeo 的能力")}</li>
        </ul>
      </section>

      {backHost ? (
        <p className="text-[12px] text-neutral-500">{tt("同意后你会回到 {host}", { host: backHost })}</p>
      ) : null}

      {actionError ? <p className="text-[12px] text-rose-600">{actionError}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-bay-login-approve
          disabled={busy}
          onClick={() => void approve()}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] text-white disabled:opacity-60"
        >
          {busy ? tt("正在确认…") : tt("同意并继续")}
        </button>
        <button
          type="button"
          data-bay-login-cancel
          disabled={busy}
          onClick={() => openBay({ kind: "feed" })}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[13px] text-neutral-700 disabled:opacity-60"
        >
          {tt("取消")}
        </button>
      </div>
    </div>
  );
}
