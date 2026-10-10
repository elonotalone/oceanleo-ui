"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActionGrant } from "../../../api/action-grants";
import { listActionGrants, revokeActionGrant } from "../../../api/action-grants";
import type { DeliveryPrefs } from "../../../api/delivery-prefs";
import { getDeliveryPrefs, updateDeliveryPrefs } from "../../../api/delivery-prefs";
import type { HostedSite } from "../../../api/hosted-sites";
import { listHostedSites, unpublishHostedSite } from "../../../api/hosted-sites";
import { useUI } from "../../../i18n/ui/useUI";
import { formatRelativeLastActive } from "../account/device-presentation";
import { CARD, CARD_DESC, CARD_TITLE, Note, QUIET } from "../personalization/parts";
import { formatHostedBytes, isSafeHostedUrl } from "./automation/format";
import { applyPrefToggle, removeGrant, removeHostedSite } from "./automation/state";

export { formatHostedBytes, isSafeHostedUrl } from "./automation/format";
export { applyPrefToggle, removeGrant, removeHostedSite } from "./automation/state";

const ROW = "flex items-start justify-between gap-4 py-3";

function PrefSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-[var(--leo-dur-1)] ease-[var(--leo-ease-standard)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-50 ${
        checked ? "bg-neutral-900" : "bg-neutral-300"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-[var(--leo-dur-1)] ease-[var(--leo-ease-standard)] ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

function pushPermissionDenied(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "denied";
}

function DeliveryPrefsBlock() {
  const tt = useUI();
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [prefs, setPrefs] = useState<DeliveryPrefs | null>(null);
  const [reload, setReload] = useState(0);
  const [busyKey, setBusyKey] = useState<keyof DeliveryPrefs | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pushBlocked, setPushBlocked] = useState(false);

  useEffect(() => {
    setPushBlocked(pushPermissionDenied());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setSaveError(null);
    void getDeliveryPrefs().then((result) => {
      if (cancelled) return;
      if (result.ok && result.data?.prefs) {
        setPrefs({
          task_done_inbox: result.data.prefs.task_done_inbox !== false,
          task_done_push: result.data.prefs.task_done_push !== false,
          task_done_email: result.data.prefs.task_done_email === true,
        });
        setStatus("ready");
        return;
      }
      setStatus("failed");
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function toggle(key: keyof DeliveryPrefs, next: boolean) {
    if (!prefs || busyKey) return;
    const previous = prefs;
    setSaveError(null);
    setPrefs(applyPrefToggle(prefs, key, next));
    setBusyKey(key);
    const result = await updateDeliveryPrefs({ [key]: next });
    setBusyKey(null);
    if (!result.ok) {
      setPrefs(previous);
      setSaveError(tt("没能保存通知偏好，开关已恢复。请稍后重试。"));
      return;
    }
    if (result.data?.prefs) {
      setPrefs({
        task_done_inbox: result.data.prefs.task_done_inbox !== false,
        task_done_push: result.data.prefs.task_done_push !== false,
        task_done_email: result.data.prefs.task_done_email === true,
      });
    }
  }

  const channels: { key: keyof DeliveryPrefs; label: string; hint?: string }[] = [
    { key: "task_done_inbox", label: tt("站内通知") },
    { key: "task_done_push", label: tt("浏览器推送") },
    { key: "task_done_email", label: tt("邮件"), hint: tt("发到你的注册邮箱") },
  ];

  return (
    <section className={CARD} data-automation-block="delivery">
      <p className={CARD_TITLE}>{tt("任务做完怎么通知我")}</p>
      {status === "loading" ? (
        <p role="status" className="mt-3 text-[13px] text-neutral-500">
          {tt("加载中")}
        </p>
      ) : null}
      {status === "failed" ? (
        <div className="mt-3 space-y-2">
          <Note kind="error" text={tt("网络失败，请稍后再试。")} />
          <button type="button" className={QUIET} onClick={() => setReload((n) => n + 1)}>
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {status === "ready" && prefs ? (
        <div className="mt-1 divide-y divide-neutral-100">
          {channels.map((channel) => (
            <div key={channel.key} className={ROW}>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-neutral-900">{channel.label}</p>
                {channel.hint ? <p className={CARD_DESC}>{channel.hint}</p> : null}
                {channel.key === "task_done_push" && pushBlocked ? (
                  <p className={CARD_DESC}>{tt("这个浏览器已禁止通知，请在浏览器设置里允许")}</p>
                ) : null}
              </div>
              <PrefSwitch
                checked={prefs[channel.key]}
                disabled={busyKey === channel.key}
                label={channel.label}
                onChange={(next) => void toggle(channel.key, next)}
              />
            </div>
          ))}
        </div>
      ) : null}
      {saveError ? (
        <div className="mt-3">
          <Note kind="error" text={saveError} />
        </div>
      ) : null}
    </section>
  );
}

function ActionGrantsBlock() {
  const tt = useUI();
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [items, setItems] = useState<ActionGrant[]>([]);
  const [reload, setReload] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    void listActionGrants().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setItems(result.data?.items ?? []);
        setStatus("ready");
        return;
      }
      setStatus("failed");
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function revoke(item: ActionGrant) {
    const key = `${item.connector_id}\0${item.tool}`;
    if (busyKey) return;
    setBusyKey(key);
    setError(null);
    const result = await revokeActionGrant(item.connector_id, item.tool);
    setBusyKey(null);
    if (!result.ok) {
      setError(tt("没能撤销这项许可，请稍后重试。"));
      return;
    }
    setItems((current) => removeGrant(current, item.connector_id, item.tool));
  }

  return (
    <section className={CARD} data-automation-block="grants">
      <p className={CARD_TITLE}>{tt("不再询问的操作")}</p>
      {status === "loading" ? (
        <p role="status" className="mt-3 text-[13px] text-neutral-500">
          {tt("加载中")}
        </p>
      ) : null}
      {status === "failed" ? (
        <div className="mt-3 space-y-2">
          <Note kind="error" text={tt("网络失败，请稍后再试。")} />
          <button type="button" className={QUIET} onClick={() => setReload((n) => n + 1)}>
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {status === "ready" && items.length === 0 ? (
        <p className={`${CARD_DESC} mt-3`}>
          {tt("还没有。agent 第一次要用你连接的应用发送或修改内容时会先问你。")}
        </p>
      ) : null}
      {status === "ready" && items.length > 0 ? (
        <div className="mt-1 divide-y divide-neutral-100">
          {items.map((item) => {
            const key = `${item.connector_id}\0${item.tool}`;
            return (
              <div key={key} className={ROW} data-automation-grant={key}>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-neutral-900">
                    {item.connector_label || item.connector_id}
                    <span className="font-normal text-neutral-500"> · {item.tool}</span>
                  </p>
                  {item.created_at ? (
                    <p className={CARD_DESC}>{formatRelativeLastActive(item.created_at, Date.now(), tt)}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={QUIET}
                  disabled={busyKey === key}
                  onClick={() => void revoke(item)}
                >
                  {tt("撤销")}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      {error ? (
        <div className="mt-3">
          <Note kind="error" text={error} />
        </div>
      ) : null}
    </section>
  );
}

function HostedSitesBlock() {
  const tt = useUI();
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [items, setItems] = useState<HostedSite[]>([]);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    void listHostedSites().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setItems(result.data?.items ?? []);
        setStatus("ready");
        return;
      }
      setStatus("failed");
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const unpublish = useCallback(
    async (id: string) => {
      if (busyId) return;
      setBusyId(id);
      setError(null);
      const result = await unpublishHostedSite(id);
      setBusyId(null);
      if (!result.ok) {
        setError(tt("没能下线这个网站，请稍后重试。"));
        return;
      }
      setConfirmId(null);
      setItems((current) => removeHostedSite(current, id));
    },
    [busyId, tt],
  );

  return (
    <section className={CARD} data-automation-block="sites">
      <p className={CARD_TITLE}>{tt("已发布的网站")}</p>
      {status === "loading" ? (
        <p role="status" className="mt-3 text-[13px] text-neutral-500">
          {tt("加载中")}
        </p>
      ) : null}
      {status === "failed" ? (
        <div className="mt-3 space-y-2">
          <Note kind="error" text={tt("网络失败，请稍后再试。")} />
          <button type="button" className={QUIET} onClick={() => setReload((n) => n + 1)}>
            {tt("重试")}
          </button>
        </div>
      ) : null}
      {status === "ready" && items.length === 0 ? (
        <p className={`${CARD_DESC} mt-3`}>{tt('还没有。让 agent 做一个网站，然后说"发布"。')}</p>
      ) : null}
      {status === "ready" && items.length > 0 ? (
        <div className="mt-1 divide-y divide-neutral-100">
          {items.map((item) => {
            const safeUrl = isSafeHostedUrl(item.url);
            const published = item.published_at || item.updated_at;
            return (
              <div key={item.id} className={ROW} data-automation-site={item.id}>
                <div className="min-w-0 pr-4">
                  <p className="text-[13px] font-medium text-neutral-900">{item.title || item.slug}</p>
                  {safeUrl ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 block truncate text-[13px] text-neutral-500"
                    >
                      {item.url}
                    </a>
                  ) : (
                    <p className="mt-0.5 truncate text-[13px] text-neutral-500">{item.url}</p>
                  )}
                  <p className={CARD_DESC}>
                    {published ? `${formatRelativeLastActive(published, Date.now(), tt)} · ` : ""}
                    {tt("{count} 个文件 · {size}", {
                      count: item.file_count,
                      size: formatHostedBytes(item.bytes),
                    })}
                  </p>
                  {confirmId === item.id ? (
                    <p className="mt-2 text-[12px] leading-relaxed text-red-600">
                      {tt("下线这个网站？")} {tt("地址会立即失效")}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {confirmId === item.id ? (
                    <>
                      <button
                        type="button"
                        className={QUIET}
                        disabled={busyId === item.id}
                        onClick={() => setConfirmId(null)}
                      >
                        {tt("取消")}
                      </button>
                      <button
                        type="button"
                        className={QUIET}
                        disabled={busyId === item.id}
                        onClick={() => void unpublish(item.id)}
                      >
                        {tt("下线")}
                      </button>
                    </>
                  ) : (
                    <>
                      {safeUrl ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={QUIET}
                        >
                          {tt("打开")}
                        </a>
                      ) : (
                        <span className={`${QUIET} pointer-events-none opacity-50`}>{tt("打开")}</span>
                      )}
                      <button
                        type="button"
                        className={QUIET}
                        disabled={busyId === item.id}
                        onClick={() => setConfirmId(item.id)}
                      >
                        {tt("下线")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {error ? (
        <div className="mt-3">
          <Note kind="error" text={error} />
        </div>
      ) : null}
    </section>
  );
}

export function AutomationSettingsSection({
  variant = "page",
}: { variant?: "page" | "pane" } = {}) {
  const tt = useUI();
  return (
    <div
      className="space-y-4"
      data-settings-pane="automation"
      data-variant={variant}
    >
      <p>
        <a href="/schedules" className="text-[13px] font-medium text-neutral-700 hover:text-neutral-900">
          {tt("管理定时与事件自动化")}
        </a>
      </p>
      <DeliveryPrefsBlock />
      <ActionGrantsBlock />
      <HostedSitesBlock />
    </div>
  );
}
