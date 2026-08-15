"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  devicesFacade,
  type Device,
  type DeviceGrantKind,
  type DevicePlatform,
  type DevicesFacade,
} from "../facades/devices";
import { useUI } from "../i18n/ui/useUI";
import { ConfirmDialog } from "../ui";
import { PageHeader } from "./PageHeader";

export interface DevicesPageProps {
  client?: DevicesFacade;
}

const PLATFORM_LABELS: Record<DevicePlatform, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
  harmony: "HarmonyOS",
};

const GRANT_LABELS: Record<DeviceGrantKind, string> = {
  read: "读取",
  write: "写入",
  python: "Python",
  shell: "Shell",
};

function pairErrorCopy(code?: string): string {
  if (code === "pair_code_invalid") {
    return "配对码无效或已过期，请在客户端里重新获取";
  }
  return code || "配对失败，请稍后重试";
}

function actionErrorCopy(code?: string): string {
  if (!code) return "操作失败，请稍后重试";
  if (code === "revoked") return "这台设备已被撤销";
  return code;
}

export function DevicesPage({ client = devicesFacade }: DevicesPageProps) {
  const tt = useUI();
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

  async function refreshDevices() {
    const result = await client.listDevices();
    if (result.ok && result.data) {
      setDevices(result.data);
      setPageError(null);
    } else {
      setPageError(actionErrorCopy(result.error));
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
        setPageError(actionErrorCopy(result.error));
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [client]);

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
      setPairError(tt(pairErrorCopy(result.error)));
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
      setPageError(actionErrorCopy(result.error));
    }
    await refreshDevices();
    setSavingName(false);
  }

  async function revokeConfirmed(device: Device) {
    setConfirmRevoke(null);
    setPageError(null);
    setDevices((current) => current.filter((item) => item.device_id !== device.device_id));
    const result = await client.revokeDevice(device.device_id);
    if (!result.ok) setPageError(actionErrorCopy(result.error));
    await refreshDevices();
  }

  const allOffline = devices.length > 0 && devices.every((device) => !device.online);

  return (
    <div className="px-8 py-6">
      <PageHeader title={tt("设备")} />

      {confirmRevoke && (
        <ConfirmDialog
          title={tt(`撤销「${confirmRevoke.device_name}」？`)}
          body={tt("撤销后这台电脑立刻不再接收任何任务，需要重新配对。")}
          confirmLabel={tt("确认撤销")}
          danger
          onConfirm={() => revokeConfirmed(confirmRevoke)}
          onCancel={() => setConfirmRevoke(null)}
        />
      )}

      <div className="mx-auto mt-7 max-w-3xl space-y-6">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
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
              className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 font-mono text-[15px] tracking-[0.18em] text-neutral-900 outline-none transition focus:border-neutral-400"
            />
            <button
              type="submit"
              disabled={pairing || pairCode.trim().length !== 8}
              className="rounded-xl bg-neutral-900 px-5 py-2.5 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pairing ? tt("正在配对…") : tt("连接设备")}
            </button>
          </form>
          {pairError && <p className="mt-2 text-[12px] text-red-600">{pairError}</p>}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-neutral-900">{tt("我的设备")}</h2>
            {!loading && devices.length > 0 && (
              <span className="text-[12px] text-neutral-400">
                {tt(`${devices.filter((device) => device.online).length} 台在线`)}
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
                              device.online
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-neutral-100 text-neutral-500"
                            }`}
                          >
                            {device.online ? tt("在线") : tt("离线")}
                          </span>
                        </div>
                      )}
                      <p className="mt-1 text-[12px] text-neutral-500">
                        {PLATFORM_LABELS[device.platform] || device.platform}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => beginRename(device)}
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 transition hover:bg-neutral-50"
                      >
                        {tt("改名")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRevoke(device)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-[12px] text-red-600 transition hover:bg-red-50"
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
                        {device.granted_kinds.length > 0
                          ? device.granted_kinds.map((kind) => tt(GRANT_LABELS[kind])).join("、")
                          : tt("无")}
                      </dd>
                    </div>
                  </dl>

                  {!device.online && (
                    <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-800">
                      {tt(`${device.device_name}现在离线，需要它执行的步骤会排队等它上线`)}
                    </p>
                  )}
                  {device.online && !device.local_exec_enabled && (
                    <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-800">
                      {tt(
                        `${device.device_name}在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。`,
                      )}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

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
