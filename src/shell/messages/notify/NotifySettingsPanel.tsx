"use client";

// 消息浮层设置页里的提醒设置（work-chat W03，契约 §8.2；导出名不改）。
// 六个开关：隐身、邮件提醒、浏览器推送、桌面通知、提示音、回放里显示精确时刻。
// 推送开关比别的多一步：要在门户域里走「请求权限 → 注册 Service Worker → 订阅」，
// 不在门户域的站只给一条「去 oceanleo.com 开启」的链接。

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  DEFAULT_IM_SETTINGS,
  fetchImSettings,
  fetchPushConfig,
  saveImSettings,
  type ImPushConfig,
} from "../../../lib/im/notify-api";
import type { ImSettings } from "../../../lib/im/types";
import { disablePush, enablePush, isPortalOrigin, pushSupported, type EnablePushResult } from "./push-subscribe";

type ToggleKey = Exclude<keyof ImSettings, "push_enabled">;

function SwitchButton({
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
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-50 ${
        checked ? "bg-neutral-900" : "bg-neutral-300"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-neutral-900">{title}</div>
        <p className="mt-0.5 text-[12px] leading-5 text-neutral-500">{hint}</p>
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

type Notice = "denied" | "unsupported" | "wrong_origin" | "server_off" | "push_failed" | "save_failed";

function noticeFor(reason: Exclude<EnablePushResult, { ok: true }>["reason"]): Notice {
  switch (reason) {
    case "denied":
    case "unsupported":
    case "wrong_origin":
    case "server_off":
      return reason;
    default:
      return "push_failed";
  }
}

export function NotifySettingsPanel() {
  const tt = useUI();
  const [settings, setSettings] = useState<ImSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pushConfig, setPushConfig] = useState<ImPushConfig | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoadFailed(false);
    const [loaded, config] = await Promise.all([fetchImSettings(), fetchPushConfig()]);
    if (!alive.current) return;
    if (!loaded.ok) {
      setLoadFailed(true);
      return;
    }
    setSettings(loaded.data);
    if (config.ok) setPushConfig(config.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (key: ToggleKey, next: boolean) => {
      setNotice(null);
      setSettings((current) => ({ ...(current ?? DEFAULT_IM_SETTINGS), [key]: next }));
      if (key === "desktop_notifications" && next && typeof Notification !== "undefined" && Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission === "denied" && alive.current) setNotice("denied");
      }
      const saved = await saveImSettings({ [key]: next });
      if (!alive.current) return;
      if (saved.ok) {
        setSettings(saved.data);
      } else {
        setSettings((current) => ({ ...(current ?? DEFAULT_IM_SETTINGS), [key]: !next }));
        setNotice("save_failed");
      }
    },
    [],
  );

  const togglePush = useCallback(
    async (next: boolean) => {
      setNotice(null);
      setPushBusy(true);
      try {
        if (next) {
          const result = await enablePush(pushConfig ?? undefined);
          if (!alive.current) return;
          if (result.ok) {
            setSettings((current) => ({ ...(current ?? DEFAULT_IM_SETTINGS), push_enabled: true }));
          } else {
            setNotice(noticeFor(result.reason));
          }
        } else {
          const ok = await disablePush();
          if (!alive.current) return;
          if (ok) setSettings((current) => ({ ...(current ?? DEFAULT_IM_SETTINGS), push_enabled: false }));
          else setNotice("save_failed");
        }
      } finally {
        if (alive.current) setPushBusy(false);
      }
    },
    [pushConfig],
  );

  if (loadFailed) {
    return (
      <section data-im-notify-settings="" className="px-4 py-3">
        <p className="text-[13px] text-neutral-600">{tt("提醒设置没能加载出来。")}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-neutral-800"
        >
          {tt("重试")}
        </button>
      </section>
    );
  }
  if (!settings) {
    return (
      <section data-im-notify-settings="" className="px-4 py-3 text-[13px] text-neutral-500">
        {tt("正在加载…")}
      </section>
    );
  }

  const onPortal = !!pushConfig && isPortalOrigin(pushConfig.portal_origin);
  const supported = pushSupported();

  return (
    <section data-im-notify-settings="" aria-label={tt("消息提醒设置")} className="px-4 py-2">
      <h3 className="py-2 text-[14px] font-semibold text-neutral-900">{tt("消息提醒设置")}</h3>
      <div className="divide-y divide-neutral-200/70">
        <Row title={tt("隐身模式")} hint={tt("开启后，别人看到你始终是离线。")}>
          <SwitchButton
            label={tt("隐身模式")}
            checked={settings.presence_invisible}
            onChange={(next) => void toggle("presence_invisible", next)}
          />
        </Row>
        <Row
          title={tt("邮件提醒")}
          hint={tt("联系人或同事私聊你、@ 你的消息 30 分钟没看，会发一封汇总邮件，邮件里可以一键退订。")}
        >
          <SwitchButton
            label={tt("邮件提醒")}
            checked={settings.email_reminders}
            onChange={(next) => void toggle("email_reminders", next)}
          />
        </Row>
        <Row title={tt("浏览器推送")} hint={tt("页面关着，这台电脑也能收到新消息提醒。")}>
          {onPortal ? (
            <SwitchButton
              label={settings.push_enabled ? tt("在这台电脑关闭推送") : tt("在这台电脑开启推送")}
              checked={settings.push_enabled}
              disabled={pushBusy || !supported || !pushConfig?.enabled}
              onChange={(next) => void togglePush(next)}
            />
          ) : (
            <SwitchButton
              label={tt("浏览器推送")}
              checked={settings.push_enabled}
              disabled={pushBusy || !settings.push_enabled}
              onChange={(next) => (next ? undefined : void togglePush(false))}
            />
          )}
        </Row>
        {onPortal ? (
          pushConfig && !pushConfig.enabled ? (
            <p className="py-2 text-[12px] text-neutral-500">{tt("推送功能还没有开通。")}</p>
          ) : !supported ? (
            <p className="py-2 text-[12px] text-neutral-500">{tt("这个浏览器不支持推送。")}</p>
          ) : null
        ) : (
          <p className="py-2 text-[12px] leading-5 text-neutral-500">
            {tt("推送只能在 oceanleo.com 上开启一次，之后这台电脑关着页面也能收到。")}{" "}
            {pushConfig ? (
              <a
                href={`${pushConfig.portal_origin}/?im=inbox`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-neutral-900 underline underline-offset-2"
              >
                {tt("去 oceanleo.com 开启")}
              </a>
            ) : null}
          </p>
        )}
        <Row title={tt("桌面通知")} hint={tt("页面在后台时，在电脑上弹出新消息提醒。")}>
          <SwitchButton
            label={tt("桌面通知")}
            checked={settings.desktop_notifications}
            onChange={(next) => void toggle("desktop_notifications", next)}
          />
        </Row>
        <Row title={tt("提示音")} hint={tt("收到新消息时响一声。")}>
          <SwitchButton
            label={tt("提示音")}
            checked={settings.sound}
            onChange={(next) => void toggle("sound", next)}
          />
        </Row>
        <Row
          title={tt("回放里显示精确时刻")}
          hint={tt("别人看你的工作回放时也能看到具体时刻；默认只显示日期和活跃时长。")}
        >
          <SwitchButton
            label={tt("回放里显示精确时刻")}
            checked={settings.show_exact_times_in_replays}
            onChange={(next) => void toggle("show_exact_times_in_replays", next)}
          />
        </Row>
      </div>
      {notice ? (
        <p role="status" className="mt-2 text-[12px] text-red-600">
          {notice === "denied"
            ? tt("浏览器拒绝了通知权限，请在浏览器的网站设置里允许通知后再试。")
            : notice === "unsupported"
              ? tt("这个浏览器不支持推送。")
              : notice === "wrong_origin"
                ? tt("推送只能在 oceanleo.com 上开启一次，之后这台电脑关着页面也能收到。")
                : notice === "server_off"
                  ? tt("推送功能还没有开通。")
                  : notice === "push_failed"
                    ? tt("没能开启推送，请稍后再试。")
                    : tt("没能保存，请再试一次。")}
        </p>
      ) : null}
    </section>
  );
}
