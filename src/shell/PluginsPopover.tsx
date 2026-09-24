"use client";

import { useEffect, useState, type RefObject } from "react";
import { getUserEmail } from "../lib/auth";
import { useUI } from "../i18n/ui/useUI";
import { AuthDialog } from "../pages/AuthDialog";
import { AnchoredPopover } from "./anchored-popover";
import {
  buildPopoverConnectors,
  usePluginsCatalog,
  type OrgMcpConnection,
  type PopoverConnector,
} from "./usePluginsCatalog";

export interface PluginsPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}

function ConnectorGlyph({ row }: { row: PopoverConnector }) {
  if (row.iconIsUrl) {
    return (
      <img
        src={row.icon}
        alt=""
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }
  if (row.icon) {
    return (
      <span className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-[15px]">
        {row.icon}
      </span>
    );
  }
  return (
    <span className="grid h-8 w-8 place-items-center rounded-full bg-neutral-900 text-[12px] font-semibold text-white">
      {row.letter}
    </span>
  );
}

export function PluginsPopover({
  open,
  onClose,
  anchorRef,
}: PluginsPopoverProps) {
  const tt = useUI();
  const catalog = usePluginsCatalog();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void getUserEmail().then((email) => {
      if (alive) setSignedIn(Boolean(email));
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const connectors = buildPopoverConnectors({
    items: catalog.items,
    connections: catalog.orgConnections,
    orgs: catalog.orgs,
  });

  function closeThenGo(href: string) {
    onClose();
    if (typeof window !== "undefined") window.location.href = href;
  }

  function connectionOf(row: PopoverConnector): OrgMcpConnection | undefined {
    return catalog.orgConnections.find(
      (item) =>
        item.connectorId === row.connectorId &&
        (!row.orgId || item.orgId === row.orgId),
    );
  }

  return (
    <>
      <AnchoredPopover
        open={open}
        anchorRef={anchorRef}
        onClose={onClose}
        align="start"
        preferredPlacement="above"
        maxHeight={420}
        role="dialog"
        ariaLabel={tt("插件与连接器")}
        lockScroll={false}
        className="z-50 flex w-[min(20rem,88vw)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
        attributes={{ "data-plugins-popover": true }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {signedIn === false ? (
            <div
              data-plugins-signin
              className="flex items-center justify-between gap-3 px-2 py-3"
            >
              <p className="text-[13px] text-neutral-600">{tt("登录后可用")}</p>
              <button
                type="button"
                onClick={() => setShowAuth(true)}
                className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-neutral-800"
              >
                {tt("登录")}
              </button>
            </div>
          ) : catalog.loading || signedIn === null ? (
            <p
              data-plugins-loading
              className="px-2 py-4 text-center text-[12px] text-neutral-400"
            >
              …
            </p>
          ) : catalog.error ? (
            <div
              data-plugins-error
              className="flex items-center justify-between gap-3 px-2 py-3"
            >
              <p className="text-[12px] text-rose-600">{tt("连接器加载失败")}</p>
              <button
                type="button"
                onClick={() => catalog.reload()}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50"
              >
                {tt("重试")}
              </button>
            </div>
          ) : connectors.length === 0 ? (
            <p
              data-plugins-empty
              className="px-2 py-4 text-center text-[13px] text-neutral-500"
            >
              {tt("还没有可用的连接器")}
            </p>
          ) : (
            <ul className="flex flex-col">
              {connectors.map((row) => {
                const busy = catalog.busyConnector === row.connectorId;
                const linked = connectionOf(row);
                return (
                  <li
                    key={`${row.orgId}:${row.connectorId}`}
                    data-connector-row={row.id}
                    data-connector-kind={row.kind}
                    className="flex items-center gap-3 rounded-lg px-2 py-2"
                  >
                    <ConnectorGlyph row={row} />
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-neutral-900">
                          {row.name}
                        </span>
                        {row.beta && (
                          <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                            Beta
                          </span>
                        )}
                      </p>
                    </div>
                    {row.kind === "connect" && (
                      <button
                        type="button"
                        data-connector-connect
                        onClick={() => closeThenGo(row.connectHref)}
                        className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-neutral-800"
                      >
                        {tt("连接")}
                      </button>
                    )}
                    {row.kind === "toggle" && linked && (
                      <button
                        type="button"
                        role="switch"
                        data-connector-toggle
                        aria-checked={linked.enabled}
                        disabled={busy}
                        onClick={() =>
                          void catalog.patchConnection(linked, {
                            enabled: !linked.enabled,
                          })
                        }
                        // 命中区 44px（min-h-11 / w-11），视觉轨道仍是 20×36 的小开关。
                        className="flex min-h-11 w-11 shrink-0 items-center justify-center disabled:opacity-60"
                      >
                        <span
                          aria-hidden="true"
                          className={`relative block h-5 w-9 rounded-full transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
                            linked.enabled ? "bg-neutral-900" : "bg-neutral-200"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
                              linked.enabled ? "left-4" : "left-0.5"
                            }`}
                          />
                        </span>
                      </button>
                    )}
                    {row.kind === "connected" && (
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[12px] text-neutral-400">
                          {tt("已连接")}
                        </span>
                        <a
                          href={row.manageHref}
                          data-connector-manage
                          onClick={onClose}
                          className="text-[12px] font-medium text-neutral-600 hover:text-neutral-900"
                        >
                          {tt("管理")}
                        </a>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {/* 与 openSettingsModal("plugins") 同一个地址；不 import 它，是为了不把整个设置窗拖进输入框的模块图。 */}
        <a
          href="#settings/plugins"
          data-plugins-add-connector
          onClick={onClose}
          className="block shrink-0 border-t border-neutral-100 px-4 py-2.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
        >
          + {tt("添加连接器")}
        </a>
      </AnchoredPopover>
      {showAuth && (
        <AuthDialog
          onClose={() => setShowAuth(false)}
          onSuccess={() => {
            setShowAuth(false);
            setSignedIn(true);
            catalog.reload();
          }}
        />
      )}
    </>
  );
}
