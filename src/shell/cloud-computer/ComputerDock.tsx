"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cloudComputerApi,
  type CloudComputerClient,
  type Computer,
} from "../../lib/cloud-computer-api";
import * as ccApi from "../../lib/cloud-computer-api";
import { currentDomainFamily } from "../../contracts/domain-family";
import { useUI } from "../../i18n/ui/useUI";
import { AnchoredPopover } from "../anchored-popover";
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
  const hidden = currentDomainFamily() === "cn";
  const { computers, mounted, mountedId, rememberedId, setMountedId, refresh, loading } =
    useCloudComputers({ client, computers: computersProp });
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const connectBtnRef = useRef<HTMLButtonElement>(null);
  const connectPanelRef = useRef<HTMLDivElement>(null);
  const switchBtnRef = useRef<HTMLButtonElement>(null);
  const switchPanelRef = useRef<HTMLDivElement>(null);

  if (hidden) return null;

  const connected = computers.filter(isConnectedComputer);
  const pending = computers.filter(isPendingComputer);
  const empty = connected.length === 0;
  const mountedState = mounted ? computerDisplayState(mounted) : null;

  if (loading) {
    const rememberedName =
      typeof ccApi.readMountedComputerName === "function" ? ccApi.readMountedComputerName() : "";
    return (
      <div className="relative" data-oceanleo-cc-dock>
        <div
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-neutral-400"
          data-oceanleo-cc-dock-waiting={rememberedId ? "remembered" : "pending"}
          aria-busy="true"
        >
          <ComputerGlyph />
          <span className="max-w-[120px] truncate">{rememberedName || "…"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" data-oceanleo-cc-dock>
      {empty ? (
        <>
          <button
            ref={connectBtnRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-neutral-600 hover:bg-neutral-100"
            aria-label={tt("接入云电脑")}
            data-oceanleo-cc-dock-empty
          >
            <ComputerGlyph />
            {tt("接入云电脑")}
          </button>
          <AnchoredPopover
            open={menuOpen}
            anchorRef={connectBtnRef}
            panelRef={connectPanelRef}
            onClose={() => setMenuOpen(false)}
            align="start"
            role="menu"
            ariaLabel={tt("接入云电脑")}
            className="z-[80] min-w-[200px] rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-[12px] hover:bg-neutral-50"
              onClick={() => {
                setMenuOpen(false);
                setCreateOpen(true);
              }}
            >
              {tt("购买云电脑")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-[12px] hover:bg-neutral-50"
              onClick={() => {
                setMenuOpen(false);
                setConnectOpen(true);
              }}
            >
              {tt("连接我的服务器")}
            </button>
            {pending.length > 0 && (
              <a
                href="/devices?tab=cloud"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-[12px] text-neutral-400 hover:bg-neutral-50"
                data-oceanleo-cc-dock-pending-progress
                onClick={() => setMenuOpen(false)}
              >
                {tt("接入进行中 · 查看进度")}
              </a>
            )}
          </AnchoredPopover>
        </>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!mounted}
            onClick={() => {
              if (mounted) router.push(serverPageHref(mounted.id));
            }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-neutral-700 hover:bg-neutral-100"
            data-oceanleo-cc-dock-mounted
            data-oceanleo-cc-status={mountedState || ""}
            aria-label={mounted?.name || tt("接入云电脑")}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                mountedState ? statusDotClass(mountedState) : "bg-neutral-300"
              }`}
              data-oceanleo-cc-online={mountedState === "ready" ? "1" : "0"}
            />
            <span className="max-w-[120px] truncate">
              {mounted?.name || tt("接入云电脑")}
            </span>
            {mountedState ? (
              <span className="text-neutral-500">{statusWord(mountedState, tt)}</span>
            ) : null}
          </button>
          {connected.length > 1 && (
            <>
              <button
                ref={switchBtnRef}
                type="button"
                onClick={() => setSwitchOpen((open) => !open)}
                className="rounded-lg px-1 py-1 text-neutral-500 hover:bg-neutral-100"
                aria-label={tt("接入云电脑")}
                data-oceanleo-cc-switch-toggle
              >
                <CaretGlyph />
              </button>
              <AnchoredPopover
                open={switchOpen}
                anchorRef={switchBtnRef}
                panelRef={switchPanelRef}
                onClose={() => setSwitchOpen(false)}
                align="start"
                role="menu"
                className="z-[80] min-w-[200px] rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
                attributes={{ "data-oceanleo-cc-switch-list": "" }}
              >
                {connected.map((item) => {
                  const state = computerDisplayState(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      data-oceanleo-cc-switch-item={item.id}
                      className={`block w-full px-3 py-2 text-left text-[12px] hover:bg-neutral-50 ${
                        item.id === mountedId ? "font-medium" : ""
                      }`}
                      onClick={() => {
                        setMountedId(item.id);
                        setSwitchOpen(false);
                      }}
                    >
                      {item.name}
                      {statusWord(state, tt) ? ` · ${statusWord(state, tt)}` : ""}
                    </button>
                  );
                })}
              </AnchoredPopover>
            </>
          )}
        </div>
      )}
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

function CaretGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M5.5 7.5 L10 12 L14.5 7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
