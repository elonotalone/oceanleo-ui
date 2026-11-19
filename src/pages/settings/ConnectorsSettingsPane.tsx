"use client";

// 设置中心「连接器」（skills-overhaul W10，合同 D3）。
// 页面列已连接的连接器；目录卡打开同一设置表面里的详情页，自定义 MCP 保留独立表单。
// 连接、授权等待、探活、停用和断开共用 useConnectorController。
// 国内版的阿里云市场目录并进目录弹窗的「阿里云市场」页签。

import { BackButton } from "../../ui/BackButton";
import { useEffect, useMemo, useRef, useState } from "react";

import { useUI } from "../../i18n/ui/useUI";
// 直接引 kit 的叶子文件，不经 kit/index（那里还挂着文件夹 API 与鉴权链，连接器页用不到）。
import { AddMenu } from "../../shell/skills/kit/AddMenu";
import { ConfigEmptyState } from "../../shell/skills/kit/ConfigEmptyState";
import { usePluginsCatalog } from "../../shell/usePluginsCatalog";
import { ConnectorCatalogDialog, OVER_CONFIG_DIALOG_Z } from "../plugins/ConnectorCatalogDialog";
import {
  CUSTOM_CONNECTOR_ID,
  connectorDetailId,
  connectorDetailPath,
  connectedConnectorMeta,
  myConnectorRows,
  myConnectorStatus,
} from "../plugins/connector-logic";
import { useConnectorController } from "../plugins/ConnectorsSection";
import { SketchfabConnection } from "./SketchfabConnection";
import { ConnectorList, ConnectorRow } from "./connectors/ConnectorRow";

export interface ConnectorsSettingsPaneProps {
  /** 独立页（/plugins）上下排列两个 pane 时显示自己的标题；设置窗里标题由设置中心画。 */
  heading?: boolean;
  /** 打开这个连接器的详情页（兼容 `/plugins#connect=<id>` 旧授权入口）。 */
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

export function ConnectorsSettingsPane({
  heading = false,
  initialConnectorId,
  accent,
}: ConnectorsSettingsPaneProps) {
  const tt = useUI();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [detailId, setDetailId] = useState(initialConnectorId || "");
  function navigateDetail(id: string) {
    if (typeof window !== "undefined") window.history.pushState(window.history.state, "", connectorDetailPath(id, window.location.href));
    setDetailId(id);
  }
  const controller = useConnectorController({
    onDetailClose: () => navigateDetail(""),
    dialogZClassName: catalogOpen ? OVER_CONFIG_DIALOG_Z : undefined,
  });
  const openConnector = (meta: (typeof controller.registry)[number]) => {
    setCatalogOpen(false);
    if (meta.id !== CUSTOM_CONNECTOR_ID) navigateDetail(meta.id);
    controller.openConnector(meta);
    openedRef.current = meta.id;
  };
  useEffect(() => {
    const onLocation = () => setDetailId(connectorDetailId(window.location.href));
    if (!initialConnectorId) onLocation();
    window.addEventListener("popstate", onLocation);
    return () => window.removeEventListener("popstate", onLocation);
  }, [initialConnectorId]);
  const market = usePluginsCatalog();
  const [q, setQ] = useState("");
  const [highlightedId, setHighlightedId] = useState("");
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const rows = useMemo(
    () => myConnectorRows(controller.connections, controller.registry, q),
    [controller.connections, controller.registry, q],
  );
  const customMeta = controller.registry.find((c) => c.id === CUSTOM_CONNECTOR_ID);

  // 兼容旧授权入口，规范为可刷新的连接器详情 URL。
  const openedRef = useRef("");
  useEffect(() => {
    const wanted = detailId;
    if (!wanted) {
      openedRef.current = "";
      if (controller.selectedConnector && controller.selectedConnector.id !== CUSTOM_CONNECTOR_ID) controller.closeConnector(false);
      return;
    }
    if (controller.registryStatus !== "ready") return;
    setHighlightedId(wanted);
    const row = rowRefs.current.get(wanted);
    if (row) {
      row.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      row.focus?.({ preventScroll: true });
    }
    if (openedRef.current === wanted) return;
    const connection = controller.connByConnector.get(wanted);
    const found = controller.registry.find((c) => c.id === wanted) || (connection ? connectedConnectorMeta(connection) : undefined);
    if (found && (found.listed !== false || controller.connByConnector.has(wanted))) {
      openedRef.current = wanted;
      if (typeof window !== "undefined") window.history.replaceState(window.history.state, "", connectorDetailPath(wanted, window.location.href));
      controller.openConnector(found);
    }
  }, [controller, initialConnectorId, detailId]);

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
            ? tt("浏览应用与服务，也可查看阿里云市场")
            : tt("浏览应用与服务"),
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
            if (customMeta) openConnector(customMeta);
          },
        },
      ]}
    />
  );

  const list = controller.connections.length === 0 ? (
    <div data-my-connectors-empty className="rounded-xl border border-dashed border-neutral-300 bg-white/60 dark:border-neutral-700 dark:bg-neutral-900/40">
      <ConfigEmptyState
        icon={<PlugIcon />}
        title={tt("还没有连接器")}
        action={addMenu("primary")}
      />
    </div>
  ) : rows.length === 0 ? (
    <p className="py-10 text-center text-[13px] text-neutral-500">{tt("没有匹配的连接器")}</p>
  ) : (
    <div data-my-connectors>
      <ConnectorList>
        {rows.map(({ connection, meta }) => {
          const id = connection.connector_id;
          const status = myConnectorStatus(connection, controller.staleIds.has(id));
          const open = () => {
            openConnector(meta || connectedConnectorMeta(connection));
          };
          return (
            <ConnectorRow
              key={connection.id || id}
              connection={connection}
              meta={meta ?? undefined}
              status={status}
              highlighted={highlightedId === id}
              probing={controller.probingId === id}
              rowRef={(node) => {
                if (node) rowRefs.current.set(id, node);
                else rowRefs.current.delete(id);
              }}
              onOpen={open}
              onProbe={() => controller.probe(id)}
              onDisconnect={() => controller.requestDisconnect(id)}
              onToggle={(next) => controller.toggle(id, next)}
            />
          );
        })}
      </ConnectorList>
    </div>
  );

  if (detailId && controller.registryStatus === "ready" && controller.connectionsReady && !controller.connByConnector.has(detailId) && !controller.registry.some((c) => c.id === detailId && (c.listed !== false || controller.connByConnector.has(detailId)))) return <section className="min-w-0 space-y-4"><BackButton data-connector-back onClick={() => navigateDetail("")} label={tt("返回连接器")} /><p role="status">{tt("未找到这个连接器")}</p></section>;
  if (detailId && controller.selectedConnector?.id === detailId && controller.detail) return <section data-settings-connectors-pane className="min-w-0">{controller.detail}{controller.dialogs}</section>;

  return (
    <section data-plugins-connectors data-settings-connectors-pane className="min-h-0 pb-10">
      <span data-mcp-oauth-return-origin={controller.returnOrigin} hidden />
      {heading ? (
        <h2 className="mb-4 text-[24px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          {tt("连接器")}
        </h2>
      ) : null}
      <p className="mb-4 text-[12px] text-neutral-500">{tt("连接应用与 API（MCP）后，Agent 在任务中可直接调用该服务的工具。")}</p>
      {controller.connections.length > 0 ? (
        <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{tt("搜索我的连接器")}</span>
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={tt("搜索我的连接器")}
              className="min-h-11 h-10 w-full max-w-xs rounded-lg border border-neutral-200 bg-transparent px-3 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-neutral-700 dark:text-neutral-100"
              data-connector-search
            />
          </label>
          <div className="shrink-0">{addMenu("primary")}</div>
        </div>
      ) : null}
      <SketchfabConnection />
      {list}
      <ConnectorCatalogDialog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        controller={{ ...controller, openConnector }}
        marketplace={market}
        accent={accent}
      />
      {catalogOpen ? null : controller.dialogs}
    </section>
  );
}
