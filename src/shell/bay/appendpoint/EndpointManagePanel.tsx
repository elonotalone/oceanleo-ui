"use client";

import { useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { getBayApp } from "../../../lib/bay/apps";
import {
  checkBayAppEndpoint,
  deleteBayAppEndpoint,
  listMyBayAppEndpoints,
  updateBayAppEndpoint,
  type BayAppEndpoint,
} from "../../../lib/bay/app-endpoints";
import { BayApiError } from "../../../lib/bay/http";
import { DANGER_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerNotice } from "../seller/seller-ui";
import { requireBayLogin } from "../shell/bay-state";
import { PaneLoading, PaneMessage } from "../supply/parts";
import { useBayResource } from "../supply/use-bay-resource";
import { checkHintText, checkOutcomeText, endpointForApp, endpointStatusLabel, formatEndpointTime, statusButton } from "./endpoint-model";

function failText(error: unknown, fallback: string): string {
  return error instanceof BayApiError && error.message ? error.message : fallback;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function EndpointManagePanel({ appId }: { appId: string }): ReactElement {
  const tt = useUI();
  const resource = useBayResource(appId ? `app-endpoint:${appId}` : null, async () => {
    const [appBody, ends] = await Promise.all([getBayApp(appId), listMyBayAppEndpoints()]);
    return { app: appBody.app, items: ends.items || [] };
  });
  const [endpoint, setEndpoint] = useState<BayAppEndpoint | null>(null);
  const [busy, setBusy] = useState<"check" | "pause" | "resume" | "delete" | "">("");
  const [ask, setAsk] = useState<"pause" | "delete" | null>(null);
  const [actionError, setActionError] = useState("");
  const [checkLine, setCheckLine] = useState("");
  const [checkHint, setCheckHint] = useState("");
  const [copyError, setCopyError] = useState("");
  const [deleted, setDeleted] = useState(false);

  if (resource.loading) return <PaneLoading />;
  if (!resource.data) {
    return <PaneMessage text={resource.error || tt("公开网址没读出来，请稍后再试。")} onRetry={resource.reload} />;
  }

  const app = resource.data.app;
  const current = deleted ? null : endpoint || endpointForApp(resource.data.items, appId);

  if (app.source_kind !== "computer") {
    return (
      <section data-bay-endpoint-manage className="space-y-2">
        <p className="text-[13px] font-medium text-stone-900">{tt("它不是放在云电脑上的应用，不需要公开网址。")}</p>
        <p className="text-[12.5px] leading-5 text-stone-500">
          {tt("公开网址是给跑在你自己云电脑上的应用用的：OceanLeo 给它一个地址，把访客的请求转到那台机器。平台不替你运行程序。")}
        </p>
      </section>
    );
  }

  if (deleted && !current) {
    return (
      <section data-bay-endpoint-manage className="space-y-2">
        <SellerNotice tone="ok">{tt("网址已删除，已自动下架。")}</SellerNotice>
      </section>
    );
  }

  if (!current) {
    return (
      <section data-bay-endpoint-manage>
        <p className="text-[13px] text-stone-500">{tt("还没有找到它的公开网址。")}</p>
      </section>
    );
  }

  const button = statusButton(current.status);

  async function run(kind: typeof busy, work: () => Promise<void>) {
    if (busy) return;
    if (!requireBayLogin()) return;
    setBusy(kind);
    setActionError("");
    try {
      await work();
      setAsk(null);
    } catch (error) {
      setActionError(failText(error, tt("公开网址没读出来，请稍后再试。")));
    } finally {
      setBusy("");
    }
  }

  return (
    <section data-bay-endpoint-manage className="space-y-4">
      <div className="space-y-2">
        <p className="break-all text-[13px] font-medium text-stone-900">{current.url}</p>
        <dl className="grid gap-2 text-[13px] text-stone-700 sm:grid-cols-2">
          <div>
            <dt className="text-[12px] text-stone-500">{tt("云电脑")}</dt>
            <dd>{current.computer_name}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-stone-500">{tt("端口")}</dt>
            <dd>{current.port}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-stone-500">{tt("开放状态")}</dt>
            <dd data-bay-endpoint-status={current.status}>{tt(endpointStatusLabel(current.status))}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-stone-500">{tt("最近一次通的时间")}</dt>
            <dd>{current.last_ok_at ? formatEndpointTime(current.last_ok_at) : tt("还没有")}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[12px] text-stone-500">{tt("最近一次的错误")}</dt>
            <dd className="break-words">{current.last_error || tt("还没有")}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-bay-action="copy-endpoint"
            className={SECONDARY_BUTTON}
            onClick={() => {
              setCopyError("");
              void copyText(current.url).then((ok) => {
                if (!ok) setCopyError(tt("没能复制，请手动选中复制"));
              });
            }}
          >
            {tt("复制")}
          </button>
          <button
            type="button"
            data-bay-action="check-endpoint"
            disabled={Boolean(busy)}
            className={SECONDARY_BUTTON}
            onClick={() =>
              void run("check", async () => {
                const result = await checkBayAppEndpoint(current.id);
                setEndpoint(result.endpoint);
                setCheckLine(result.ok ? tt("应用回应了（HTTP {code}）", { code: result.status_code ?? 0 }) : checkOutcomeText(result));
                setCheckHint(result.ok ? "" : tt(checkHintText()));
              })
            }
          >
            {busy === "check" ? tt("正在检测…") : tt("检测")}
          </button>
          <button
            type="button"
            data-bay-action={button.action}
            disabled={Boolean(busy)}
            className={SECONDARY_BUTTON}
            onClick={() => {
              setActionError("");
              if (button.action === "pause") setAsk("pause");
              else {
                void run("resume", async () => {
                  const body = await updateBayAppEndpoint(current.id, { status: "active" });
                  setEndpoint(body.endpoint);
                });
              }
            }}
          >
            {busy === button.action ? tt("正在处理…") : tt(button.label)}
          </button>
          <button
            type="button"
            data-bay-action="delete-endpoint"
            disabled={Boolean(busy)}
            className={DANGER_BUTTON}
            onClick={() => {
              setActionError("");
              setAsk("delete");
            }}
          >
            {busy === "delete" ? tt("正在处理…") : tt("删除网址")}
          </button>
        </div>
        {copyError ? <p className="text-[12.5px] text-rose-600">{copyError}</p> : null}
        {checkLine ? <p data-bay-endpoint-check className="text-[12.5px] text-stone-700">{checkLine}</p> : null}
        {checkHint ? <p className="text-[12.5px] text-stone-500">{checkHint}</p> : null}
        {actionError ? <SellerNotice tone="error">{actionError}</SellerNotice> : null}

        {ask === "pause" ? (
          <div data-bay-confirm="pause" className="space-y-2">
            <p className="text-[13px] text-stone-800">{tt("访客会看到「这个应用暂时没有开放」")}</p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" disabled={Boolean(busy)} className={SECONDARY_BUTTON} onClick={() => setAsk(null)}>
                {tt("取消")}
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                className={PRIMARY_BUTTON}
                onClick={() =>
                  void run("pause", async () => {
                    const body = await updateBayAppEndpoint(current.id, { status: "off" });
                    setEndpoint(body.endpoint);
                  })
                }
              >
                {busy === "pause" ? tt("正在处理…") : tt("暂停")}
              </button>
            </div>
          </div>
        ) : null}

        {ask === "delete" ? (
          <div data-bay-confirm="delete" className="space-y-2">
            <p className="text-[13px] text-stone-800">{tt("删除后会自动下架")}</p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" disabled={Boolean(busy)} className={SECONDARY_BUTTON} onClick={() => setAsk(null)}>
                {tt("取消")}
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                className={DANGER_BUTTON}
                onClick={() =>
                  void run("delete", async () => {
                    await deleteBayAppEndpoint(current.id);
                    setEndpoint(null);
                    setDeleted(true);
                  })
                }
              >
                {busy === "delete" ? tt("正在处理…") : tt("删除网址")}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <ul className="list-disc space-y-1 pl-5 text-[12.5px] leading-5 text-stone-500">
        <li>{tt("访客的请求经 OceanLeo 转到你的云电脑，云电脑不需要开放任何端口。")}</li>
        <li>{tt("目前只支持普通网页请求，不支持 WebSocket。")}</li>
        <li>{tt("云电脑关机或欠费时打不开。")}</li>
      </ul>
    </section>
  );
}
