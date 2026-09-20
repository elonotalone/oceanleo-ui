"use client";

import { useEffect, useRef, useState } from "react";
import {
  cloudComputerApi,
  type CloudComputerClient,
  type Computer,
} from "../../lib/cloud-computer-api";
import { currentDomainFamily } from "../../contracts/domain-family";
import { useUI } from "../../i18n/ui/useUI";
import { ConnectServerDialog } from "./ConnectServerDialog";
import { CreateComputerDialog } from "./CreateComputerDialog";
import { TerminalPanel } from "./TerminalPanel";
import {
  newShellEnabled,
  useCloudComputers,
} from "./useCloudComputers";

export function ComputerDock({
  client = cloudComputerApi,
  computers: computersProp,
}: {
  client?: CloudComputerClient;
  computers?: Computer[];
}) {
  const tt = useUI();
  const hidden = currentDomainFamily() === "cn";
  const { computers, mounted, mountedId, setMountedId, refresh } =
    useCloudComputers({ client, computers: computersProp });
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !switchOpen) return;
    function onDoc(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setSwitchOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, switchOpen]);

  if (hidden) return null;

  const empty = computers.length === 0;
  const shellOn = newShellEnabled(mounted);

  async function openNewShell() {
    if (!mounted || !shellOn) return;
    setTerminalOpen(true);
    setTerminalCollapsed(false);
    await client.openTerminal(mounted.id, { cols: 80, rows: 24 });
    await refresh();
  }

  return (
    <div ref={rootRef} className="relative" data-oceanleo-cc-dock>
      {empty ? (
        <>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-neutral-600 hover:bg-neutral-100"
            aria-label={tt("电脑")}
            data-oceanleo-cc-dock-empty
          >
            <ComputerGlyph />
            {tt("电脑")}
          </button>
          {menuOpen && (
            <div className="absolute bottom-9 left-0 z-50 min-w-[180px] rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-[12px] hover:bg-neutral-50"
                onClick={() => {
                  setMenuOpen(false);
                  setCreateOpen(true);
                }}
              >
                {tt("创建云电脑")}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-[12px] hover:bg-neutral-50"
                onClick={() => {
                  setMenuOpen(false);
                  setConnectOpen(true);
                }}
              >
                {tt("接入我的服务器")}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSwitchOpen((open) => !open)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-neutral-700 hover:bg-neutral-100"
            data-oceanleo-cc-dock-mounted
            aria-label={mounted?.name || tt("电脑")}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                mounted?.node_online ? "bg-emerald-500" : "bg-neutral-300"
              }`}
              data-oceanleo-cc-online={mounted?.node_online ? "1" : "0"}
            />
            <span className="max-w-[120px] truncate">
              {mounted?.name || tt("电脑")}
            </span>
          </button>
          {switchOpen && (
            <div
              className="absolute bottom-9 left-0 z-50 min-w-[200px] rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
              data-oceanleo-cc-switch-list
            >
              {computers.map((item) => (
                <button
                  key={item.id}
                  type="button"
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
                  {item.node_online ? ` · ${tt("在线")}` : ""}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => void openNewShell()}
            disabled={!shellOn}
            data-oceanleo-cc-new-shell
            aria-label={tt("新建 Shell")}
            className="rounded-lg px-2 py-1 text-[12px] text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
          >
            {tt("新建 Shell")}
          </button>
          <a
            href="/computers"
            className="rounded-lg px-2 py-1 text-[12px] text-neutral-500 hover:bg-neutral-100"
            data-oceanleo-cc-manage
          >
            {tt("管理")}
          </a>
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
          client={client}
          onClose={() => setConnectOpen(false)}
          onCreated={() => {
            void refresh();
          }}
        />
      )}
      {terminalOpen && mounted && (
        <TerminalPanel
          computerId={mounted.id}
          client={client}
          collapsed={terminalCollapsed}
          onCollapsedChange={setTerminalCollapsed}
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
