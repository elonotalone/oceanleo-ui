"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { deviceErrorCopy } from "../api/device-error-copy";
import {
  remoteDesktopClient as defaultRemoteDesktopClient,
  type RemoteDesktopClient,
  type RemoteDesktopStatus,
} from "../api/remote-desktop";
import {
  devicesFacade,
  type Device,
  type DeviceGrantKind,
  type DevicePlatform,
  type DevicesFacade,
} from "../facades/devices";
import type { CloudComputerClient } from "../lib/cloud-computer-api";
import { useUI } from "../i18n/ui/useUI";
import { ConfirmDialog } from "../ui";
import { CloudComputersSection } from "./CloudComputersPage";
import { PageHeader } from "./PageHeader";
import { RemoteDesktopPanel } from "./RemoteDesktopPanel";
import { blockerCopy, statusBlocker } from "./remote-desktop-input";

export type DevicesPageTab = "devices" | "cloud";

export interface DevicesPageProps {
  client?: DevicesFacade;
  cloudClient?: CloudComputerClient;
  /** 远程桌面接口；缺省走网站网关。 */
  remoteDesktopClient?: RemoteDesktopClient;
  /** 远程桌面状态的刷新间隔（毫秒）；缺省 10 秒。 */
  remoteStatusIntervalMs?: number;
  initialTab?: DevicesPageTab;
  /**
   * `page`（缺省）：独立的 `/devices` 页，带统一页头，认地址栏的 `?tab=cloud` / `#cloud`。
   * `pane`：嵌在设置窗「我的设备」面板里。不渲染页头、不占整页；地址栏属于设置窗
   * 背后的页面，所以只认显式的 `initialTab`。
   */
  variant?: "page" | "pane";
}

function resolveDevicesTab(initialTab?: DevicesPageTab, readLocation = true): DevicesPageTab {
  if (initialTab === "cloud" || initialTab === "devices") return initialTab;
  if (!readLocation || typeof window === "undefined") return "devices";
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "cloud") return "cloud";
    if (window.location.hash === "#cloud") return "cloud";
  } catch {
    /* ignore */
  }
  return "devices";
}

const PLATFORM_LABELS: Record<DevicePlatform, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
  harmony: "HarmonyOS",
};

/** `shell` is absent on purpose: it is not a grantable category (contract §3). */
const GRANT_LABELS: Record<DeviceGrantKind, string> = {
  read: "读取",
  write: "写入",
  python: "Python",
};

/**
 * A category the site does not recognise is dropped rather than printed: a
 * device mirror that still carries `shell` must not read as an authorisation.
 */
function grantLabels(device: Device): string[] {
  return device.granted_kinds
    .map((kind) => GRANT_LABELS[kind] as string | undefined)
    .filter((label): label is string => Boolean(label));
}

/**
 * Never hand an error code back as its own message: an unrecognised code used
 * to surface as `device_quota_paired_devices_per_user_exceeded` on the page.
 */
function pairErrorCopy(code?: string, limit?: number): string {
  return deviceErrorCopy(code, { limit });
}

function actionErrorCopy(code?: string, limit?: number): string {
  if (code === "revoked") return "这台设备已被撤销";
  return deviceErrorCopy(code, { limit });
}

/** 状态刷新的间隔与一次最多问几台，避免设备很多时刷屏。 */
const REMOTE_STATUS_INTERVAL_MS = 10_000;
const REMOTE_STATUS_MAX_DEVICES = 20;

/** 只有电脑能被远程查看；手机卡不出入口。 */
function isRemoteDesktopHost(device: Device): boolean {
  return device.platform === "windows" || device.platform === "macos" || device.platform === "linux";
}

function remoteEntryBlocker(status: RemoteDesktopStatus | undefined, online: boolean) {
  return status ? statusBlocker(status) : !online ? "offline" : null;
}

function DeviceDisplayIcon({ phone }: { phone: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true" data-device-kind={phone ? "phone" : "computer"}>
      {phone ? (
        <><rect x="6.5" y="2" width="11" height="20" rx="2.5" /><path d="M10 18.5h4" /></>
      ) : (
        <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4m-4 0h8" /></>
      )}
    </svg>
  );
}

export function DevicesPage({
  client = devicesFacade,
  cloudClient,
  remoteDesktopClient = defaultRemoteDesktopClient,
  remoteStatusIntervalMs = REMOTE_STATUS_INTERVAL_MS,
  initialTab,
  variant = "page",
}: DevicesPageProps) {
  const tt = useUI();
  const pane = variant === "pane";
  const tab = resolveDevicesTab(initialTab, !pane);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<Device | null>(null);
  // 远程桌面：状态只用于界面提示，本机才是权限的唯一出处（网页不能替电脑开权限）。
  const [remoteStatus, setRemoteStatus] = useState<Record<string, RemoteDesktopStatus>>({});
  const [remoteOpenId, setRemoteOpenId] = useState<string | null>(null);

  async function refreshDevices() {
    const result = await client.listDevices();
    if (result.ok && result.data) {
      setDevices(result.data);
      setPageError(null);
    } else {
      setPageError(actionErrorCopy(result.error, result.limit));
    }
    return result;
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    client.listDevices().then((result) => {
      if (!alive) return;
      if (result.ok && result.data) {
        setDevices(result.data);
        setPageError(null);
      } else {
        setPageError(actionErrorCopy(result.error, result.limit));
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [client]);

  // 手机是控制端，不提供被控桌面，所以不问状态；电脑不论列表里是在线还是离线都要问，
  // 因为列表只在打开页面时取一次，刚上线（或刚掉线）的电脑要靠这里的新鲜状态翻过来。
  const remoteTargetKey = useMemo(
    () =>
      devices
        .filter(isRemoteDesktopHost)
        .slice(0, REMOTE_STATUS_MAX_DEVICES)
        .map((device) => device.device_id)
        .join(","),
    [devices],
  );

  useEffect(() => {
    if (!remoteTargetKey) return;
    const ids = remoteTargetKey.split(",");
    const controller = new AbortController();
    const { signal } = controller;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function refreshOne(deviceId: string) {
      try {
        const result = await remoteDesktopClient.getStatus(deviceId, { signal });
        if (signal.aborted) return;
        if (result.ok && result.data) {
          const status = result.data;
          setRemoteStatus((current) => ({ ...current, [deviceId]: status }));
        } else if (result.error !== "aborted") {
          // 查不到就不再采信旧状态，回到列表里的在线标记；点进去由会话接口说明原因。
          setRemoteStatus((current) => {
            if (!(deviceId in current)) return current;
            const next = { ...current };
            delete next[deviceId];
            return next;
          });
        }
      } catch {
        /* 同上：静默回退 */
      }
    }

    // 一轮跑完再排下一轮：请求慢时不会叠起来。
    async function loop() {
      while (!signal.aborted) {
        if (typeof document === "undefined" || !document.hidden) {
          await Promise.all(ids.map(refreshOne));
        }
        if (signal.aborted) return;
        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, remoteStatusIntervalMs);
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      }
    }
    void loop();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [remoteTargetKey, remoteDesktopClient, remoteStatusIntervalMs]);

  /** 电脑以新鲜的远控状态为准（它看的是客户端最近一次心跳），其余回到列表。 */
  function onlineOf(device: Device): boolean {
    const status = isRemoteDesktopHost(device) ? remoteStatus[device.device_id] : undefined;
    return status ? status.online : device.online;
  }

  async function handlePair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = pairCode.trim();
    if (code.length !== 8) {
      setPairError(tt("请输入客户端显示的 8 位配对码"));
      return;
    }
    setPairing(true);
    setPairError(null);
    const result = await client.pairDevice(code);
    if (!result.ok) {
      setPairError(tt(pairErrorCopy(result.error, result.limit)));
      setPairing(false);
      return;
    }
    setPairCode("");
    await refreshDevices();
    setPairing(false);
  }

  function beginRename(device: Device) {
    setEditingId(device.device_id);
    setEditingName(device.device_name);
    setPageError(null);
  }

  async function saveRename(device: Device) {
    const nextName = editingName.trim();
    if (!nextName || savingName) return;
    setSavingName(true);
    const previousName = device.device_name;
    setDevices((current) =>
      current.map((item) =>
        item.device_id === device.device_id ? { ...item, device_name: nextName } : item,
      ),
    );
    setEditingId(null);
    const result = await client.renameDevice(device.device_id, nextName);
    if (!result.ok) {
      setDevices((current) =>
        current.map((item) =>
          item.device_id === device.device_id
            ? { ...item, device_name: previousName }
            : item,
        ),
      );
      setPageError(actionErrorCopy(result.error, result.limit));
    }
    await refreshDevices();
    setSavingName(false);
  }

  async function revokeConfirmed(device: Device) {
    setConfirmRevoke(null);
    setPageError(null);
    setDevices((current) => current.filter((item) => item.device_id !== device.device_id));
    const result = await client.revokeDevice(device.device_id);
    if (!result.ok) setPageError(actionErrorCopy(result.error, result.limit));
    await refreshDevices();
  }

  const allOffline = devices.length > 0 && devices.every((device) => !onlineOf(device));

  return (
    <div
      className={pane ? "min-h-0" : "px-8 py-6"}
      data-oceanleo-devices-page
      data-devices-pane={pane ? "" : undefined}
    >
      {!pane && <PageHeader title={tt("我的设备")} />}

      {confirmRevoke && (
        <ConfirmDialog
          title={tt("撤销「{name}」？", { name: confirmRevoke.device_name })}
          body={tt("撤销后这台电脑立刻不再接收任何任务，需要重新配对。")}
          confirmLabel={tt("确认撤销")}
          danger
          onConfirm={() => revokeConfirmed(confirmRevoke)}
          onCancel={() => setConfirmRevoke(null)}
        />
      )}

      <div className={pane ? "max-w-3xl space-y-6" : "mx-auto mt-7 max-w-3xl space-y-6"}>
        <section
          className="rounded-2xl border border-neutral-200 bg-white p-5"
          data-oceanleo-devices-phones
        >
          <h2 className="text-[15px] font-semibold text-neutral-900">{tt("连接一台电脑")}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
            {tt("下载客户端后，客户端会显示一个配对码。请在下面输入该 8 位配对码。")}
          </p>
          <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={handlePair}>
            <input
              aria-label={tt("8 位配对码")}
              autoComplete="one-time-code"
              inputMode="text"
              maxLength={8}
              value={pairCode}
              onInput={(event) => {
                setPairCode(event.currentTarget.value.replace(/\s/g, ""));
                setPairError(null);
              }}
              placeholder={tt("输入 8 位配对码")}
              className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 font-mono text-[15px] tracking-[0.18em] text-neutral-900 outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus:border-neutral-400"
            />
            <button
              type="submit"
              disabled={pairing || pairCode.trim().length !== 8}
              className="rounded-xl bg-neutral-900 px-5 py-2.5 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pairing ? tt("正在配对…") : tt("连接设备")}
            </button>
          </form>
          {pairError && <p className="mt-2 text-[12px] text-red-600">{pairError}</p>}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-neutral-900">
              {tt("我的电脑与手机")}
            </h2>
            {!loading && devices.length > 0 && (
              <span className="text-[12px] text-neutral-400">
                {tt("{n} 台在线", { n: devices.filter(onlineOf).length })}
              </span>
            )}
          </div>

          {pageError && (
            <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
              {pageError}
            </p>
          )}

          {loading ? (
            <div className="space-y-3" aria-label={tt("正在加载设备")}>
              <div className="h-36 animate-pulse rounded-2xl bg-neutral-100" />
              <div className="h-36 animate-pulse rounded-2xl bg-neutral-100" />
            </div>
          ) : devices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 px-6 py-10 text-center">
              <p className="text-[14px] font-medium text-neutral-800">
                {tt("你还没有把任何电脑连上来")}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">
                {tt("下载客户端后，客户端会显示一个配对码；在上方输入即可连接。")}
              </p>
            </div>
          ) : (
            <div className="space-y-3" data-all-offline={allOffline ? "true" : "false"}>
              {devices.map((device) => (
                <article
                  key={device.device_id}
                  className="rounded-2xl border border-neutral-200 bg-white p-5"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        {isRemoteDesktopHost(device) ? (
                          <button
                            type="button"
                            data-remote-device-icon={device.device_id}
                            aria-label={`${device.device_name} · ${tt("进入桌面")}`}
                            title={remoteEntryBlocker(remoteStatus[device.device_id], onlineOf(device))
                              ? tt(blockerCopy(remoteEntryBlocker(remoteStatus[device.device_id], onlineOf(device))!))
                              : tt("进入桌面")}
                            disabled={remoteEntryBlocker(remoteStatus[device.device_id], onlineOf(device)) !== null}
                            onClick={() => setRemoteOpenId(device.device_id)}
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <DeviceDisplayIcon phone={false} />
                          </button>
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600">
                            <DeviceDisplayIcon phone />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                      {editingId === device.device_id ? (
                        <div className="flex max-w-md gap-2">
                          <input
                            aria-label={tt("设备名称")}
                            autoFocus
                            maxLength={80}
                            value={editingName}
                            onChange={(event) => setEditingName(event.target.value)}
                            className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-[14px] outline-none focus:border-neutral-500"
                          />
                          <button
                            type="button"
                            disabled={!editingName.trim() || savingName}
                            onClick={() => saveRename(device)}
                            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-50"
                          >
                            {tt("保存")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-600"
                          >
                            {tt("取消")}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-[15px] font-semibold text-neutral-900">
                            {device.device_name}
                          </h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              onlineOf(device)
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-neutral-100 text-neutral-500"
                            }`}
                          >
                            {onlineOf(device) ? tt("在线") : tt("离线")}
                          </span>
                        </div>
                      )}
                      <p className="mt-1 text-[12px] text-neutral-500">
                        {PLATFORM_LABELS[device.platform] || device.platform}
                      </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => beginRename(device)}
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50"
                      >
                        {tt("改名")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRevoke(device)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-[12px] text-red-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-red-50"
                      >
                        {tt("撤销设备")}
                      </button>
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-3 text-[12px] sm:grid-cols-2">
                    <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
                      <dt className="text-neutral-400">{tt("允许云端下发")}</dt>
                      <dd className="mt-0.5 font-medium text-neutral-800">
                        {device.local_exec_enabled ? tt("开着") : tt("关着")}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
                      <dt className="text-neutral-400">{tt("已授权类别")}</dt>
                      <dd className="mt-0.5 font-medium text-neutral-800">
                        {grantLabels(device).length > 0
                          ? grantLabels(device).map((label) => tt(label)).join("、")
                          : tt("无")}
                      </dd>
                    </div>
                  </dl>

                  {isRemoteDesktopHost(device) && (
                    <RemoteDesktopEntry
                      device={device}
                      online={onlineOf(device)}
                      status={remoteStatus[device.device_id]}
                      open={remoteOpenId === device.device_id}
                      client={remoteDesktopClient}
                      onOpen={() => setRemoteOpenId(device.device_id)}
                      onClose={() =>
                        setRemoteOpenId((current) =>
                          current === device.device_id ? null : current,
                        )
                      }
                    />
                  )}

                  {!onlineOf(device) && (
                    <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-800">
                      {tt("{name}现在离线，需要它执行的步骤会排队等它上线", { name: device.device_name })}
                    </p>
                  )}
                  {onlineOf(device) && !device.local_exec_enabled && (
                    <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-800">
                      {tt(
                        "{name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。",
                        { name: device.device_name },
                      )}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <CloudComputersSection
          {...(cloudClient ? { client: cloudClient } : {})}
          autoFocus={tab === "cloud"}
        />

        <details className="rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-4">
          <summary className="cursor-pointer text-[13px] font-medium text-neutral-800">
            {tt("设备权限如何保护你")}
          </summary>
          <p className="mt-3 text-[12px] leading-relaxed text-neutral-600">
            {tt(
              "网页端只能给设备下单。打开开关、放宽授权目录、配对新设备，这三件事只能在那台电脑上做。即使有人拿到你的账号，也改不了这三样，而且那台电脑上会留下记录。",
            )}
          </p>
        </details>
      </div>
    </div>
  );
}

interface RemoteDesktopEntryProps {
  device: Device;
  /** 已按新鲜远控状态校正过的在线标记。 */
  online: boolean;
  status: RemoteDesktopStatus | undefined;
  open: boolean;
  client: RemoteDesktopClient;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * 电脑卡上的「进入桌面」入口。离线、客户端太旧、本机没允许，各说各的；
 * 状态没查到（网络或旧网关）时不替用户下结论，点进去由会话接口给明确原因。
 */
function RemoteDesktopEntry({
  device,
  online,
  status,
  open,
  client,
  onOpen,
  onClose,
}: RemoteDesktopEntryProps) {
  const tt = useUI();
  if (open) {
    return (
      <div className="mt-4" data-oceanleo-remote-entry>
        <RemoteDesktopPanel
          deviceId={device.device_id}
          deviceName={device.device_name}
          client={client}
          onClose={onClose}
        />
      </div>
    );
  }
  const blocker = remoteEntryBlocker(status, online);
  const busy = status?.session_id ? true : false;
  return (
    <div
      className="mt-4 flex flex-col gap-2 rounded-xl bg-neutral-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      data-oceanleo-remote-entry
      data-remote-blocker={blocker ?? ""}
    >
      <div className="min-w-0 text-[12px]">
        <p className="font-medium text-neutral-800">{tt("远程桌面")}</p>
        <p className="mt-0.5 leading-relaxed text-neutral-500">
          {blocker
            ? tt(blockerCopy(blocker))
            : busy
              ? tt("这台电脑已有一个正在进行的远程会话。")
              : tt("查看这台电脑的屏幕，并用鼠标键盘操控。")}
        </p>
      </div>
      <button
        type="button"
        disabled={blocker !== null}
        onClick={onOpen}
        className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {tt("进入桌面")}
      </button>
    </div>
  );
}
