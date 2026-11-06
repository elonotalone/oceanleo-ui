"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { useUI, type UITranslate } from "../../../i18n/ui/useUI";
import { ConnectorIcon } from "../../plugins/connector-icons";
import type { McpConnection, McpConnectorMeta } from "../../../lib/mcp-api";
import { ConfigToggle } from "../../../shell/skills/kit/ConfigItemCard";

export type ConnectorRowStatus = "connected" | "disabled" | "stale";

export interface ConnectorRowProps {
  connection: McpConnection;
  meta?: McpConnectorMeta;
  status: ConnectorRowStatus;
  highlighted?: boolean;
  probing?: boolean;
  onOpen: () => void;
  onProbe: () => void;
  onDisconnect: () => void;
  onToggle: (enabled: boolean) => void;
  rowRef?: (node: HTMLDivElement | null) => void;
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <circle cx="5.5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18.5" cy="12" r="1.6" />
    </svg>
  );
}

function ConnectorRowMenu({
  label,
  enabled,
  probing,
  onOpen,
  onProbe,
  onDisconnect,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  probing: boolean;
  onOpen: () => void;
  onProbe: () => void;
  onDisconnect: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const pick = (run: () => void) => () => {
    setOpen(false);
    run();
  };
  const item =
    "block w-full rounded-lg px-3 py-2 text-left text-[13px] transition hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none dark:hover:bg-neutral-800";
  return (
    <div ref={rootRef} className="relative" data-connector-row-menu>
      <button
        type="button"
        aria-label={tt("更多操作：{name}", { name: label })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-neutral-800"
      >
        <MoreIcon />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute bottom-11 right-0 z-20 w-48 rounded-xl border border-neutral-200 bg-white p-1 shadow-[0_12px_40px_rgba(0,0,0,0.14)] dark:border-neutral-700 dark:bg-neutral-900"
        >
          <button type="button" role="menuitem" data-connector-menu="reconnect" className={item} onClick={pick(onOpen)}>
            {tt("重新连接")}
          </button>
          <button type="button" role="menuitem" data-connector-menu="probe" disabled={probing} className={`${item} disabled:opacity-60`} onClick={pick(onProbe)}>
            {probing ? tt("探活中…") : tt("探活")}
          </button>
          <button type="button" role="menuitem" data-connector-menu="toggle" className={item} onClick={pick(() => onToggle(!enabled))}>
            {enabled ? tt("停用 {name}", { name: label }) : tt("启用 {name}", { name: label })}
          </button>
          <div className="my-1 h-px bg-neutral-100 dark:bg-neutral-800" />
          <button type="button" role="menuitem" data-connector-menu="disconnect" className={`${item} text-red-600`} onClick={pick(onDisconnect)}>
            {tt("断开连接")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function connectorDisplayName(connection: McpConnection, meta: McpConnectorMeta | undefined, tt: UITranslate) {
  const name = meta ? tt(meta.name) : connection.label || connection.connector_id;
  return connection.label && connection.label !== name ? connection.label : name;
}

export function connectorStatusLabel(
  status: ConnectorRowStatus,
  connection: McpConnection,
  tt: UITranslate,
) {
  if (status === "stale") return tt("已失效 · 点击重试");
  if (status === "disabled") return tt("已停用");
  return tt("已连接 · {n} 工具", { n: connection.tools_count ?? 0 });
}

export function ConnectorRow({
  connection,
  meta,
  status,
  highlighted = false,
  probing = false,
  onOpen,
  onProbe,
  onDisconnect,
  onToggle,
  rowRef,
}: ConnectorRowProps) {
  const tt = useUI();
  const name = connectorDisplayName(connection, meta, tt);
  const statusLabel = connectorStatusLabel(status, connection, tt);
  const primaryLabel = status === "stale" ? tt("重试") : status === "connected" ? tt("断开") : tt("连接");
  const primaryAction = status === "connected" ? onDisconnect : onOpen;
  const primaryDestructive = status === "connected";
  return (
    <div
      ref={rowRef}
      data-my-connector={connection.connector_id}
      data-my-connector-status={status}
      data-connector-row=""
      data-connector-highlighted={highlighted ? "true" : "false"}
      className={`flex min-w-0 items-center gap-3 border-b border-neutral-200 px-1 py-3.5 transition-colors last:border-b-0 dark:border-neutral-800 ${
        highlighted ? "rounded-lg bg-sky-50/80 ring-1 ring-sky-200 dark:bg-sky-950/35 dark:ring-sky-800" : ""
      }`}
    >
      <ConnectorIcon icon={meta?.icon} id={connection.connector_id} label={name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[14px] font-medium text-neutral-900 dark:text-neutral-100">{name}</span>
          {connection.label && connection.label !== name ? <span className="truncate text-[12px] text-neutral-500">{connection.label}</span> : null}
        </div>
        <p data-connector-status-line className={`truncate text-[12px] ${status === "stale" ? "text-red-600" : status === "connected" ? "text-emerald-600" : "text-neutral-500"}`}>
          {statusLabel}
        </p>
      </div>
      <ConfigToggle
        checked={connection.enabled}
        onChange={onToggle}
        label={connection.enabled ? tt("停用 {name}", { name }) : tt("启用 {name}", { name })}
      />
      <button
        type="button"
        data-connector-primary-action=""
        onClick={primaryAction}
        className={`min-h-10 shrink-0 rounded-lg px-3 text-[13px] font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${
          primaryDestructive
            ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            : "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        }`}
      >
        {primaryLabel}
      </button>
      <ConnectorRowMenu
        label={name}
        enabled={connection.enabled}
        probing={probing}
        onOpen={onOpen}
        onProbe={onProbe}
        onDisconnect={onDisconnect}
        onToggle={onToggle}
      />
    </div>
  );
}

export function ConnectorList({ children, empty }: { children?: ReactNode; empty?: ReactNode }) {
  return (
    <div data-connector-list className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white px-4 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950">
      {children ?? empty}
    </div>
  );
}
