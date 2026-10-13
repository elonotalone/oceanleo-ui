"use client";

import { useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { listMyBayAppLoginGrants, revokeBayAppLoginGrant, type BayAppLoginGrant } from "../../../lib/bay/app-login";
import { openBay, requireBayLogin, useBaySignedIn } from "../shell/bay-state";
import { PaneLoading } from "../supply/parts";
import { errorText, useBayResource } from "../supply/use-bay-resource";

function timeText(iso: string | null): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at).toLocaleString() : iso;
}

function GrantRow({
  item,
  busy,
  asking,
  error,
  onAsk,
  onCancel,
  onRevoke,
}: {
  item: BayAppLoginGrant;
  busy: boolean;
  asking: boolean;
  error: string;
  onAsk: () => void;
  onCancel: () => void;
  onRevoke: () => void;
}): ReactElement {
  const tt = useUI();
  return (
    <li data-bay-login-grant={item.app_id} className="space-y-2 py-2">
      <button
        type="button"
        data-bay-login-grant-open
        onClick={() => openBay({ kind: "app", id: item.app_id })}
        className="block w-full text-left"
      >
        <p className="break-words text-[14px] font-semibold text-neutral-900">{item.app_title}</p>
        <p className="mt-0.5 break-all text-[12px] text-neutral-500">{item.app_url_host}</p>
      </button>
      <p className="mt-2 space-x-3 text-[12px] text-neutral-500">
        {item.first_at ? <span>{tt("首次 {time}", { time: timeText(item.first_at) })}</span> : null}
        {item.last_at ? <span>{tt("最近 {time}", { time: timeText(item.last_at) })}</span> : null}
      </p>
      {asking ? (
        <div data-bay-login-revoke-confirm={item.app_id} className="mt-3 space-y-2">
          <p className="text-[13px] text-neutral-800">{tt("撤回后这个作品要再让你同意一次才能登录")}</p>
          {error ? <p className="mt-2 text-[12px] text-rose-600">{error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-bay-login-revoke-yes
              disabled={busy}
              onClick={onRevoke}
              className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-60"
            >
              {busy ? tt("正在撤回…") : tt("撤回授权")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60"
            >
              {tt("取消")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-bay-login-revoke
          disabled={busy}
          onClick={onAsk}
          className="mt-3 rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60"
        >
          {tt("撤回授权")}
        </button>
      )}
    </li>
  );
}

export function MyAppLoginGrants(): ReactElement {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const resource = useBayResource(signedIn ? "my-login-grants" : null, () => listMyBayAppLoginGrants());
  const [askId, setAskId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function revoke(appId: string) {
    if (busyId) return;
    if (!requireBayLogin()) return;
    setBusyId(appId);
    setError("");
    try {
      await revokeBayAppLoginGrant(appId);
      setAskId(null);
      resource.reload();
    } catch (err) {
      setError(errorText(err) || tt("授权列表没读出来，请稍后点「重试」。"));
    } finally {
      setBusyId(null);
    }
  }

  if (!signedIn) {
    return (
      <div data-bay-login-grants className="px-4 py-3">
        <p className="text-[13px] text-neutral-600">{tt("登录后查看你授权过的作品")}</p>
        <button
          type="button"
          data-bay-login-grants-signin
          onClick={() => {
            requireBayLogin();
          }}
          className="mt-3 rounded-full bg-neutral-900 px-3 py-1.5 text-[13px] text-white"
        >
          {tt("登录")}
        </button>
      </div>
    );
  }

  if (resource.loading) return <PaneLoading />;
  if (resource.error && !resource.data) {
    return (
      <div data-bay-login-grants className="px-4 py-3">
        <p className="text-[13px] text-rose-600">{resource.error}</p>
        <button type="button" onClick={resource.reload} className="mt-2 text-[12px] text-neutral-600 hover:underline">
          {tt("重试")}
        </button>
      </div>
    );
  }

  const items = resource.data?.items ?? [];
  if (items.length === 0) {
    return (
      <p data-bay-login-grants-empty className="px-4 py-6 text-center text-[13px] text-neutral-500">
        {tt("你还没有用 OceanLeo 账号登录过任何作品")}
      </p>
    );
  }

  return (
    <ul data-bay-login-grants className="space-y-2 px-4">
      {items.map((item) => (
        <GrantRow
          key={item.app_id}
          item={item}
          busy={busyId === item.app_id}
          asking={askId === item.app_id}
          error={askId === item.app_id ? error : ""}
          onAsk={() => {
            if (!requireBayLogin()) return;
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
