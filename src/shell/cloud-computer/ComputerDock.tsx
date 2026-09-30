"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cloudComputerApi,
  type CloudComputerClient,
  type Computer,
} from "../../lib/cloud-computer-api";
import { currentDomainFamily } from "../../contracts/domain-family";
import { devicesFacade, type Device } from "../../facades/devices";
import { useUI } from "../../i18n/ui/useUI";
import { AnchoredPopover } from "../anchored-popover";
import { openSettingsModal } from "../account/SettingsModalHost";
import { ConnectServerDialog } from "./ConnectServerDialog";
import { CreateComputerDialog } from "./CreateComputerDialog";
import {
  computerDisplayState,
  isConnectedComputer,
  isPendingComputer,
  type ComputerDisplayState,
} from "./computer-state";
import { serverPageHref } from "./server-page/href";
import { useCloudComputers } from "./useCloudComputers";

const PLATFORM_LABEL: Record<Device["platform"], string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
  harmony: "HarmonyOS",
};

function statusWord(state: ComputerDisplayState, tt: (zh: string) => string): string {
  if (state === "ready") return tt("在线");
  if (state === "offline") return tt("离线");
  if (state === "stopped") return tt("已停机");
  if (state === "unpaid") return tt("欠费");
  return "";
}

function statusDotClass(state: ComputerDisplayState): string {
  if (state === "ready") return "bg-emerald-500";
  if (state === "unpaid") return "bg-rose-500";
  return "bg-neutral-300";
}

export function ComputerDock({
  client = cloudComputerApi,
  computers: computersProp,
}: {
  client?: CloudComputerClient;
  computers?: Computer[];
}) {
  const tt = useUI();
  const router = useRouter();
  const { computers, mountedId, setMountedId, refresh, loading } =
    useCloudComputers({ client, computers: computersProp });
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void devicesFacade.listDevices().then((result) => {
      if (!alive) return;
      setDevices(result.ok && result.data ? result.data : []);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const connected = computers.filter(isConnectedComputer);
  const pending = computers.filter(isPendingComputer);
  const failed = computers.filter((item) => computerDisplayState(item) === "error");
  const emptyCloud = connected.length === 0;
  const failedOnly = emptyCloud && pending.length === 0 && failed.length > 0;

  return (
    <div
      className="relative"
      data-oceanleo-cc-dock
      data-oceanleo-cc-edition={currentDomainFamily()}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-neutral-600 hover:bg-neutral-100"
        aria-label={tt("设备")}
        aria-expanded={open}
        data-oceanleo-cc-dock-trigger
        data-oceanleo-cc-dock-empty={emptyCloud && !loading ? "" : undefined}
        data-oceanleo-cc-dock-waiting={loading ? (mountedId ? "remembered" : "pending") : undefined}
      >
        <ComputerGlyph />
        {tt("设备")}
      </button>
      <AnchoredPopover
        open={open}
        anchorRef={btnRef}
        panelRef={panelRef}
        onClose={() => setOpen(false)}
        align="start"
        role="dialog"
        ariaLabel={tt("设备")}
        className="z-[80] w-[min(280px,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white py-2 shadow-lg"
      >
        <div ref={panelRef} className="px-1">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            {tt("云服务器")}
          </p>
          {loading && <p className="px-2 py-1.5 text-[12px] text-neutral-400">…</p>}
          {!loading && emptyCloud && (
            <div className="px-1 pb-1">
              <button
                type="button"
                className="block w-full rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-neutral-50"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
              >
                {tt("购买云电脑")}
              </button>
              <button
                type="button"
                className="block w-full rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-neutral-50"
                onClick={() => {
                  setOpen(false);
                  setConnectOpen(true);
                }}
              >
                {tt("连接我的服务器")}
              </button>
              {pending.length > 0 && (
                <p className="px-2 py-1 text-[12px] text-neutral-400" data-oceanleo-cc-dock-pending-progress>
                  {tt("接入进行中 · 查看进度")}
                </p>
              )}
              {failedOnly && (
                <p className="px-2 py-1 text-[12px] text-neutral-400" data-oceanleo-cc-dock-failed>
                  {tt("开通失败")}
                </p>
              )}
              {pending.length === 0 && !failedOnly && (
                <p className="px-2 py-1 text-[12px] text-neutral-400">{tt("还没有云服务器")}</p>
              )}
            </div>
          )}
          {!loading &&
            connected.map((item) => {
              const state = computerDisplayState(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  data-oceanleo-cc-dock-mounted={item.id === mountedId ? "" : undefined}
                  data-oceanleo-cc-switch-item={item.id}
                  data-oceanleo-cc-status={state}
                  data-oceanleo-cc-online={state === "ready" ? "1" : "0"}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-neutral-50 ${
                    item.id === mountedId ? "font-medium" : ""
                  }`}
                  onClick={() => {
                    setMountedId(item.id);
                    setOpen(false);
                    router.push(serverPageHref(item.id));
                  }}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(state)}`} />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {statusWord(state, tt) ? (
                    <span className="shrink-0 text-neutral-500">{statusWord(state, tt)}</span>
                  ) : null}
                </button>
              );
            })}

          <p className="mt-2 px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            {tt("客户端设备")}
          </p>
          {devices.length === 0 && (
            <div className="px-1">
              <p className="px-2 py-1 text-[12px] text-neutral-400">{tt("还没有客户端设备")}</p>
              <button
                type="button"
                className="block w-full rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-neutral-50"
                onClick={() => {
                  setOpen(false);
                  openSettingsModal("devices");
                }}
              >
                {tt("配对客户端")}
              </button>
            </div>
          )}
          {devices.map((item) => (
            <button
              key={item.device_id}
              type="button"
              data-oceanleo-device-client={item.device_id}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-neutral-50"
              onClick={() => {
                setOpen(false);
                openSettingsModal("devices");
              }}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.online ? "bg-emerald-500" : "bg-neutral-300"}`}
              />
              <span className="min-w-0 flex-1 truncate">{item.device_name || PLATFORM_LABEL[item.platform]}</span>
              <span className="shrink-0 text-neutral-500">
                {item.online ? tt("在线") : tt("离线")}
              </span>
            </button>
          ))}
        </div>
      </AnchoredPopover>
      {createOpen && (
        <CreateComputerDialog
          client={client}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void refresh();
          }}
        />
      )}
      {connectOpen && (
        <ConnectServerDialog
          key="new"
          client={client}
          onClose={() => setConnectOpen(false)}
          onCreated={() => {
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function ComputerGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 19h8M12 17v2" />
    </svg>
  );
}
