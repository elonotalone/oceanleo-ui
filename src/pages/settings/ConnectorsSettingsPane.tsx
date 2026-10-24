"use client";

// 设置中心「连接器」（skills-overhaul W10，合同 D3）。
// 页面只列我已连接 / 已添加的连接器；「+ 添加连接器 ▾」打开目录大弹窗或自定义 MCP。
// 一键授权、令牌连接、探活、停用、断开全部沿用 useConnectorController（原插件页逻辑）。
// 国内版的阿里云市场目录并进目录弹窗的「阿里云市场」页签。

import { useEffect, useMemo, useRef, useState } from "react";

import { useUI } from "../../i18n/ui/useUI";
// 直接引 kit 的叶子文件，不经 kit/index（那里还挂着文件夹 API 与鉴权链，连接器页用不到）。
import { AddMenu } from "../../shell/skills/kit/AddMenu";
import { ConfigEmptyState } from "../../shell/skills/kit/ConfigEmptyState";
import { ConfigItemCard } from "../../shell/skills/kit/ConfigItemCard";
import { ConfigToolbar } from "../../shell/skills/kit/ConfigToolbar";
import { usePluginsCatalog } from "../../shell/usePluginsCatalog";
import { ConnectorCatalogDialog, OVER_CONFIG_DIALOG_Z } from "../plugins/ConnectorCatalogDialog";
import { ConnectorIcon } from "../plugins/connector-icons";
import {
  CUSTOM_CONNECTOR_ID,
  connectorIdFromLocationHash,
  myConnectorRows,
  myConnectorStatus,
} from "../plugins/connector-logic";
import { useConnectorController } from "../plugins/ConnectorsSection";

export interface ConnectorsSettingsPaneProps {
  /** 独立页（/plugins）上下排列两个 pane 时显示自己的标题；设置窗里标题由设置中心画。 */
  heading?: boolean;
  /** 打开后直接弹出这个连接器的连接对话框（`/plugins#connect=<id>` 旧授权弹窗入口）。 */
  initialConnectorId?: string;
  accent?: string;
}

function CatalogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="6.5" rx="1.5" />
      <rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5" />
      <path d="M7 7.25h.01M7 16.75h.01M11 7.25h5M11 16.75h5" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
      <path d="M9 3.5v4M15 3.5v4" />
      <path d="M6.5 7.5h11v3.5a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 16.5v4" />
    </svg>
  );
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

/** 卡片右下「…」：重新连接、探活、断开。 */
function ConnectorRowMenu({
  label,
  onReconnect,
  onProbe,
  onDisconnect,
  probing,
}: {
  label: string;
  onReconnect: () => void;
  onProbe: () => void;
  onDisconnect: () => void;
  probing: boolean;
}) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const item =
    "block w-full rounded-lg px-3 py-2 text-left text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none dark:hover:bg-neutral-800";
  const pick = (run: () => void) => () => {
    setOpen(false);
    run();
  };
  return (
    <div ref={rootRef} className="relative" data-connector-row-menu>
      <button
        type="button"
        aria-label={tt("更多操作：{name}", { name: label })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="-my-2 -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-neutral-800"
      >
        <MoreIcon />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute bottom-10 right-0 z-20 w-44 rounded-xl border border-neutral-200 bg-white p-1 shadow-[0_12px_40px_rgba(0,0,0,0.14)] dark:border-neutral-700 dark:bg-neutral-900"
        >
          <button type="button" role="menuitem" data-connector-menu="reconnect" className={item} onClick={pick(onReconnect)}>
            {tt("重新连接")}
          </button>
          <button type="button" role="menuitem" data-connector-menu="probe" disabled={probing} className={`${item} disabled:opacity-60`} onClick={pick(onProbe)}>
            {probing ? tt("探活中…") : tt("探活")}
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

export function ConnectorsSettingsPane({
  heading = false,
  initialConnectorId,
  accent,
}: ConnectorsSettingsPaneProps) {
  const tt = useUI();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const controller = useConnectorController({
    dialogZClassName: catalogOpen ? OVER_CONFIG_DIALOG_Z : undefined,
  });
  const market = usePluginsCatalog();
  const [q, setQ] = useState("");

  const rows = useMemo(
    () => myConnectorRows(controller.connections, controller.registry, q),
    [controller.connections, controller.registry, q],
  );
  const customMeta = controller.registry.find((c) => c.id === CUSTOM_CONNECTOR_ID);

  // `/plugins#connect=<id>`（子站一键授权打开的门户页）与设置中心转交的 id：目录到了就直接弹连接框。
  const openedRef = useRef("");
  useEffect(() => {
    const wanted =
      (initialConnectorId || "").trim() ||
      connectorIdFromLocationHash(typeof window !== "undefined" ? window.location.hash : "");
    if (!wanted || controller.registryStatus !== "ready" || openedRef.current === wanted) return;
    const found = controller.registry.find((c) => c.id === wanted);
    if (found) {
      openedRef.current = wanted;
      controller.openConnector(found);
    }
  }, [controller, initialConnectorId]);

  const addMenu = (variant: "primary" | "secondary") => (
    <AddMenu
      label={tt("添加连接器")}
      variant={variant}
      items={[
        {
          id: "catalog",
          icon: <CatalogIcon />,
          title: tt("从连接器目录添加"),
          description: market.showMarketplace
            ? tt("一键授权或粘贴令牌连接常用应用，也可浏览阿里云市场")
            : tt("一键授权或粘贴令牌连接常用应用"),
          onSelect: () => setCatalogOpen(true),
        },
        {
          id: "custom",
          icon: <ServerIcon />,
          title: tt("自定义 MCP 服务器"),
          description: tt("粘贴服务地址与令牌，连接任意 MCP 服务器"),
          disabled: !customMeta,
          separatorBefore: true,
          onSelect: () => {
            if (customMeta) controller.openConnector(customMeta);
          },
        },
      ]}
    />
  );

  const list =
    controller.connections.length === 0 ? (
      <div data-my-connectors-empty className="rounded-2xl border border-dashed border-neutral-300 bg-white/60 dark:border-neutral-700 dark:bg-neutral-900/40">
        <ConfigEmptyState
          icon={<PlugIcon />}
          title={tt("还没有连接器")}
          description={tt("连接应用与 API（MCP）后，Agent 在任务中可直接调用该服务的工具。")}
          action={addMenu("primary")}
        />
      </div>
    ) : rows.length === 0 ? (
      <p className="py-10 text-center text-[13px] text-neutral-500">{tt("没有匹配的连接器")}</p>
    ) : (
      <div data-my-connectors className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map(({ connection, meta }) => {
          const id = connection.connector_id;
          const name = meta ? tt(meta.name) : connection.label || id;
          const status = myConnectorStatus(connection, controller.staleIds.has(id));
          const open = () => {
            if (meta) controller.openConnector(meta);
          };
          return (
            <div key={connection.id || id} data-my-connector={id} data-my-connector-status={status}>
              <ConfigItemCard
                title={
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ConnectorIcon icon={meta?.icon} id={id} label={name} size="sm" />
                    <span className="truncate">{connection.label && connection.label !== name ? connection.label : name}</span>
                  </span>
                }
                description={meta ? tt(meta.desc) : connection.endpoint || undefined}
                badge={
                  <span
                    className={
                      status === "stale"
                        ? "font-medium text-red-600"
                        : status === "connected"
                          ? "font-medium text-emerald-600"
                          : "text-neutral-500"
                    }
                  >
                    {status === "stale"
                      ? tt("已失效")
                      : status === "connected"
                        ? tt("已连接 · {n} 工具", { n: connection.tools_count ?? 0 })
                        : tt("已停用")}
                  </span>
                }
                meta={meta ? tt(meta.category) : undefined}
                toggle={{
                  checked: connection.enabled,
                  onChange: (next) => controller.toggle(id, next),
                  label: connection.enabled ? tt("停用 {name}", { name }) : tt("启用 {name}", { name }),
                }}
                menu={
                  <ConnectorRowMenu
                    label={name}
                    probing={controller.probingId === id}
                    onReconnect={open}
                    onProbe={() => controller.probe(id)}
                    onDisconnect={() => controller.requestDisconnect(id)}
                  />
                }
                onOpen={meta ? open : undefined}
              />
            </div>
          );
        })}
      </div>
    );

  return (
    <section data-plugins-connectors data-settings-connectors-pane className="min-h-0 pb-10">
      <span data-mcp-oauth-return-origin={controller.returnOrigin} hidden />
      {heading ? (
        <h2 className="mb-4 text-[24px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          {tt("连接器")}
        </h2>
      ) : null}
      {controller.connections.length > 0 ? (
        <div className="mb-5">
          <ConfigToolbar
            search={{ value: q, onChange: setQ, placeholder: tt("搜索我的连接器") }}
            primary={addMenu("primary")}
          />
        </div>
      ) : null}
      {list}
      <ConnectorCatalogDialog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        controller={controller}
        marketplace={market}
        accent={accent}
      />
      {catalogOpen ? null : controller.dialogs}
    </section>
  );
}
