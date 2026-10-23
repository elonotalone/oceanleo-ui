"use client";

// 设置 → 账户 → 「用 OceanLeo 账号登录的应用」：我同意过用 OceanLeo 账号登录的应用，随时可以撤回。
// 每行：应用名、主机、首次 / 最近登录时间、撤回授权（要二次确认）。境内外一致，不按域名分叉。
// 应用详情在 LeoBay 里，境内没有 LeoBay：那边名字只是文字，不给一个点了没反应的按钮。

import { useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { listMyBayAppLoginGrants, revokeBayAppLoginGrant, type BayAppLoginGrant } from "../../../lib/bay/app-login";
import { openBay, useBayEnabled } from "../shell/bay-state";
import { errorText, useBayResource } from "../supply/use-bay-resource";

const PILL =
  "shrink-0 rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-[13px] font-medium text-neutral-800 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";
const PILL_DARK =
  "shrink-0 rounded-full bg-neutral-900 px-4 py-1.5 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50";

function timeText(iso: string | null): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at).toLocaleString() : iso;
}

function GrantRow({
  item,
  canOpen,
  busy,
  asking,
  error,
  onAsk,
  onCancel,
  onRevoke,
}: {
  item: BayAppLoginGrant;
  canOpen: boolean;
  busy: boolean;
  asking: boolean;
  error: string;
  onAsk: () => void;
  onCancel: () => void;
  onRevoke: () => void;
}): ReactElement {
  const tt = useUI();
  const heading = (
    <>
      <span className="block break-words text-[14px] font-medium text-neutral-900">{item.app_title}</span>
      <span className="mt-0.5 block break-all text-[13px] text-neutral-500">{item.app_url_host}</span>
    </>
  );
  return (
    <li data-bay-login-grant={item.app_id} className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        {canOpen ? (
          <button
            type="button"
            data-bay-login-grant-open
            onClick={() => openBay({ kind: "app", id: item.app_id })}
            className="min-w-0 text-left hover:underline"
          >
            {heading}
          </button>
        ) : (
          <div className="min-w-0">{heading}</div>
        )}
        {asking ? null : (
          <button
            type="button"
            data-bay-login-revoke
            aria-label={`${tt("撤回授权")} · ${item.app_title}`}
            disabled={busy}
            onClick={onAsk}
            className={PILL}
          >
            {tt("撤回授权")}
          </button>
        )}
      </div>
      {item.first_at || item.last_at ? (
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-neutral-500">
          {item.first_at ? <span>{tt("首次 {time}", { time: timeText(item.first_at) })}</span> : null}
          {item.last_at ? <span>{tt("最近 {time}", { time: timeText(item.last_at) })}</span> : null}
        </p>
      ) : null}
      {asking ? (
        <div data-bay-login-revoke-confirm={item.app_id} className="mt-3 space-y-2 rounded-xl bg-neutral-50 px-3.5 py-3">
          <p className="text-[13px] text-neutral-800">{tt("撤回后这个应用要再让你同意一次才能登录")}</p>
          {error ? (
            <p role="alert" className="text-[12px] text-rose-600">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" data-bay-login-revoke-yes disabled={busy} onClick={onRevoke} className={PILL_DARK}>
              {busy ? tt("正在撤回…") : tt("撤回授权")}
            </button>
            <button type="button" data-bay-login-revoke-cancel autoFocus disabled={busy} onClick={onCancel} className={PILL}>
              {tt("取消")}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function MyAppLoginGrants(): ReactElement {
  const tt = useUI();
  const canOpen = useBayEnabled();
  const resource = useBayResource("my-login-grants", () => listMyBayAppLoginGrants());
  const [askId, setAskId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const [error, setError] = useState("");

  async function revoke(appId: string) {
    if (busyId) return;
    setBusyId(appId);
    setError("");
    try {
      const result = await revokeBayAppLoginGrant(appId);
      if (result && result.ok === false) {
        setError(tt("没撤回成功，请稍后再试。"));
        return;
      }
      // 撤回已经落库：这一行直接消失，不再重读整张列表（避免整页闪一下加载）。
      setRemoved((current) => [...current, appId]);
      setAskId(null);
    } catch (err) {
      setError(errorText(err) || tt("没撤回成功，请稍后再试。"));
    } finally {
      setBusyId(null);
    }
  }

  if (resource.loading) {
    return (
      <p data-bay-login-grants-loading className="text-[13px] text-neutral-500">
        {tt("加载中…")}
      </p>
    );
  }

  if (!resource.data) {
    const signedOut = resource.status === 401;
    return (
      <div data-bay-login-grants-error className="space-y-2">
        <p className="text-[13px] text-neutral-700">{signedOut ? tt("登录后查看你授权过的应用") : tt("授权列表没读出来，请稍后点「重试」。")}</p>
        <button type="button" onClick={resource.reload} className={PILL}>
          {tt("重试")}
        </button>
      </div>
    );
  }

  const items = (resource.data?.items ?? []).filter((item) => !removed.includes(item.app_id));
  if (items.length === 0) {
    return (
      <p
        data-bay-login-grants-empty
        className="rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-[13px] leading-6 text-neutral-500"
      >
        {tt("还没有应用用你的 OceanLeo 账号登录过。你在某个应用里同意登录后，它会出现在这里，随时可以撤回。")}
      </p>
    );
  }

  return (
    <ul
      data-bay-login-grants
      aria-label={tt("用 OceanLeo 账号登录的应用")}
      className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white"
    >
      {items.map((item) => (
        <GrantRow
          key={item.app_id}
          item={item}
          canOpen={canOpen}
          busy={busyId === item.app_id}
          asking={askId === item.app_id}
          error={askId === item.app_id ? error : ""}
          onAsk={() => {
            setError("");
            setAskId(item.app_id);
          }}
          onCancel={() => {
            setAskId(null);
            setError("");
          }}
          onRevoke={() => void revoke(item.app_id)}
        />
      ))}
    </ul>
  );
}
