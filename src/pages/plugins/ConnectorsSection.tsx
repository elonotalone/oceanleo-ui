"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { currentDomainProfile } from "../../contracts/domain-family";
import { useUI } from "../../i18n/ui/useUI";
import {
  connectMcp,
  disconnectMcp,
  getMcpConnections,
  getMcpRegistry,
  mcpOauthMessageOrigin,
  mcpOauthOpensPortalPage,
  mcpOauthPortalPageHref,
  mcpOauthReturnOrigin,
  probeMcp,
  startMcpOauth,
  toggleMcp,
  type McpConnection,
  type McpConnectorMeta,
} from "../../lib/mcp-api";
import { useToast } from "../../ui";
import {
  OAUTH_POLL_MS,
  OAUTH_WAIT_MS,
  connectorIdFromLocationHash,
  filterRegistryItems,
  groupRegistryByCategory,
  helpUrlIsPrimaryPath,
  isConnectionStale,
  oauthConnectionLanded,
  oauthWaitOutcome,
  oneClickDisabled,
  primaryOauthLabel,
  showOneClickButton,
} from "./connector-logic";
import { InTreeDialog } from "./parts";

export function ConnectorsSection({
  search,
  oauthOnly,
}: {
  search: string;
  oauthOnly: boolean;
}) {
  const tt = useUI();
  const toast = useToast();
  const [registry, setRegistry] = useState<McpConnectorMeta[]>([]);
  const [registryStatus, setRegistryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [registryError, setRegistryError] = useState("");
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [selected, setSelected] = useState<McpConnectorMeta | null>(null);
  const [connToken, setConnToken] = useState("");
  const [connUrl, setConnUrl] = useState("");
  const [connLabel, setConnLabel] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeFailed, setProbeFailed] = useState(false);
  const [probeError, setProbeError] = useState("");
  const oauthPopupRef = useRef<Window | null>(null);
  const oauthSettledRef = useRef(false);
  const oauthStartedAtRef = useRef<number | null>(null);
  const oauthBeforeRef = useRef<McpConnection | undefined>(undefined);

  const returnOrigin = mcpOauthReturnOrigin();

  const loadConnections = useCallback(async () => {
    setConnections(await getMcpConnections());
  }, []);

  const loadRegistry = useCallback(async () => {
    setRegistryStatus("loading");
    setRegistryError("");
    const result = await getMcpRegistry();
    if (result.error) {
      setRegistry([]);
      setRegistryError(result.error);
      setRegistryStatus("error");
      return;
    }
    setRegistry(result.items);
    setRegistryStatus("ready");
  }, []);

  useEffect(() => {
    void loadRegistry();
    void loadConnections();
  }, [loadConnections, loadRegistry]);

  const connByConnector = new Map(connections.map((c) => [c.connector_id, c]));

  const runProbe = useCallback(
    async (connectorId: string, silentOk = false) => {
      setProbing(true);
      const res = await probeMcp(connectorId);
      setProbing(false);
      const stale = isConnectionStale(res);
      setProbeFailed(stale);
      setProbeError(stale ? res.error || "" : "");
      if (stale) {
        toast.error(res.error || tt("连接已失效，请重新授权"));
        return;
      }
      if (!silentOk) {
        toast.success(tt("连接正常 · {n} 个工具", { n: res.tools_count ?? 0 }));
      }
      await loadConnections();
    },
    [loadConnections, toast, tt],
  );

  const openConnector = useCallback(
    (c: McpConnectorMeta) => {
      const existing = connByConnector.get(c.id);
      setSelected(c);
      setConnToken("");
      setConnUrl(existing?.endpoint || "");
      setConnLabel(existing?.label || c.name);
      setShowAdvanced(false);
      setProbeFailed(false);
      setProbeError("");
      if (existing) void runProbe(c.id, true);
    },
    [connByConnector, runProbe],
  );

  const openedHashRef = useRef("");
  useEffect(() => {
    const wanted = connectorIdFromLocationHash(
      typeof window !== "undefined" ? window.location.hash : "",
    );
    if (!wanted || registryStatus !== "ready" || openedHashRef.current === wanted) return;
    const found = registry.find((c) => c.id === wanted);
    if (found) {
      openedHashRef.current = wanted;
      openConnector(found);
    }
  }, [openConnector, registry, registryStatus]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const gatewayOrigin = mcpOauthMessageOrigin();
      if (!gatewayOrigin || e.origin !== gatewayOrigin) return;
      if (!oauthPopupRef.current || e.source !== oauthPopupRef.current) return;
      const data = e.data as { source?: string; ok?: boolean; message?: string };
      if (!data || data.source !== "oceanleo-mcp-oauth") return;
      oauthSettledRef.current = true;
      oauthPopupRef.current = null;
      setAuthorizing(false);
      if (data.ok) {
        toast.success(data.message || tt("授权成功，已连接"));
        setSelected(null);
        void loadConnections();
      } else {
        toast.error(data.message || tt("授权失败"));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadConnections, toast, tt]);

  useEffect(() => {
    if (!authorizing) return;
    const startedAt = oauthStartedAtRef.current ?? Date.now();
    oauthStartedAtRef.current = startedAt;
    let elapsed = 0;
    const tick = () => {
      if (oauthSettledRef.current) return;
      elapsed += 400;
      if (elapsed % OAUTH_POLL_MS < 400) {
        void getMcpConnections().then((rows) => {
          if (oauthSettledRef.current) return;
          const after = rows.find((row) => row.connector_id === selected?.id);
          if (oauthConnectionLanded(oauthBeforeRef.current, after)) {
            oauthSettledRef.current = true;
            oauthPopupRef.current = null;
            oauthStartedAtRef.current = null;
            setAuthorizing(false);
            setSelected(null);
            setConnections(rows);
            toast.success(tt("授权成功，已连接"));
          }
        });
      }
      const outcome = oauthWaitOutcome({
        startedAt,
        now: Date.now(),
        timeoutMs: OAUTH_WAIT_MS,
        popupClosed: Boolean(oauthPopupRef.current?.closed),
      });
      if (outcome === "waiting") return;
      oauthSettledRef.current = true;
      oauthPopupRef.current = null;
      oauthStartedAtRef.current = null;
      setAuthorizing(false);
      toast.error(
        outcome === "closed" ? tt("授权窗口已关闭，未完成授权") : tt("授权等待超时，请重试"),
      );
    };
    const intervalId = window.setInterval(tick, 400);
    return () => window.clearInterval(intervalId);
  }, [authorizing, selected, toast, tt]);

  async function handleOauth() {
    const c = selected;
    if (!c || !showOneClickButton(c.supports_oauth)) return;
    if (oneClickDisabled(c.needs_endpoint, connUrl, authorizing)) return;
    oauthSettledRef.current = false;
    oauthStartedAtRef.current = Date.now();
    oauthBeforeRef.current = connByConnector.get(c.id);
    setAuthorizing(true);

    const portalOrigin = currentDomainProfile().portalOrigin;
    if (mcpOauthOpensPortalPage(returnOrigin, portalOrigin)) {
      const href = mcpOauthPortalPageHref(portalOrigin, c.id);
      const w = href
        ? window.open(href, "oceanleo-mcp-oauth", "width=960,height=800,menubar=no,toolbar=no")
        : null;
      oauthPopupRef.current = w;
      if (!w) {
        oauthSettledRef.current = true;
        setAuthorizing(false);
        toast.error(tt("无法打开授权窗口，请允许弹出窗口后重试"));
      }
      return;
    }

    const res = await startMcpOauth({ connector_id: c.id, endpoint: connUrl.trim() });
    if (!res.ok || !res.authorize_url) {
      oauthSettledRef.current = true;
      setAuthorizing(false);
      toast.error(res.error || tt("发起授权失败"));
      return;
    }
    const w = window.open(
      res.authorize_url,
      "oceanleo-mcp-oauth",
      "width=600,height=760,menubar=no,toolbar=no",
    );
    oauthPopupRef.current = w;
    if (!w) {
      oauthSettledRef.current = true;
      setAuthorizing(false);
      toast.error(tt("无法打开授权窗口，请允许弹出窗口后重试"));
    }
  }

  async function handleConnect() {
    const c = selected;
    if (!c) return;
    if (c.needs_endpoint && !connUrl.trim()) {
      toast.error(tt("该连接器需要填写专属的 MCP 服务地址"));
      return;
    }
    const needsToken = c.auth !== "url" && c.auth !== "none";
    if (needsToken && !connToken.trim() && !connByConnector.get(c.id)) {
      toast.error(tt("请填写该连接器所需的 Token / API Key"));
      return;
    }
    setConnecting(true);
    const res = await connectMcp({
      connector_id: c.id,
      token: connToken.trim(),
      endpoint: connUrl.trim(),
      label: connLabel.trim() || c.name,
    });
    setConnecting(false);
    if (!res.ok) {
      toast.error(res.error || tt("连接失败"));
      return;
    }
    toast.success(tt("已连接 {name}（发现 {n} 个工具）", { name: c.name, n: res.tools_count ?? 0 }));
    setSelected(null);
    await loadConnections();
  }

  async function handleDisconnect(connectorId: string) {
    const res = await disconnectMcp(connectorId);
    setDisconnectingId(null);
    if (!res.ok) {
      toast.error(res.error || tt("断开失败"));
      return;
    }
    toast.success(tt("已断开连接"));
    setSelected(null);
    setProbeFailed(false);
    setProbeError("");
    await loadConnections();
  }

  async function handleToggle(connectorId: string, enabled: boolean) {
    const res = await toggleMcp(connectorId, enabled);
    if (!res.ok) {
      toast.error(res.error || tt("操作失败"));
      return;
    }
    await loadConnections();
  }

  const filtered = filterRegistryItems(registry, search, oauthOnly);
  const byCategory = groupRegistryByCategory(filtered);
  const connectedCount = connections.length;

  return (
    <section data-plugins-connectors className="mt-10 pb-10">
      <span data-mcp-oauth-return-origin={returnOrigin} hidden />
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-neutral-900">{tt("连接器 · MCP")}</h2>
        {connectedCount > 0 && (
          <span className="text-[12px] text-neutral-500">{tt("已连接 {n} 个", { n: connectedCount })}</span>
        )}
      </div>
      <p className="mb-4 mt-0.5 text-[12px] text-neutral-500">
        {tt(
          "连接应用程序与 API（MCP）。支持官方远程授权的连接器点「一键授权」，在对方网站登录批准后回到这里；其余按提示粘贴 Token 或专属地址。连接后 Agent 在任务中可直接调用该服务的工具。",
        )}
      </p>
      {registryStatus === "loading" ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-[13px] text-neutral-500">{tt("连接器目录加载中…")}</p>
        </div>
      ) : registryStatus === "error" ? (
        <div className="rounded-xl border border-dashed border-red-200 bg-red-50 p-8 text-center">
          <p className="text-[13px] text-red-800">{tt("连接器目录加载失败")}</p>
          {registryError ? <p className="mt-1 text-[12px] text-red-700">{registryError}</p> : null}
          <button
            type="button"
            onClick={() => void loadRegistry()}
            className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800"
          >
            {tt("重试")}
          </button>
        </div>
      ) : byCategory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-[13px] text-neutral-500">{tt("没有匹配的连接器")}</p>
        </div>
      ) : (
        byCategory.map((cat) => (
          <div key={cat.category} className="mb-6">
            <p className="mb-2 text-[12px] font-medium text-neutral-500">{tt(cat.category)}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {cat.items.map((c) => (
                <ConnectorCard
                  key={c.id}
                  connector={c}
                  connection={connByConnector.get(c.id)}
                  onClick={() => openConnector(c)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {disconnectingId && (
        <InTreeDialog onClose={() => setDisconnectingId(null)} testId="mcp-disconnect-confirm">
          <h3 className="text-[15px] font-semibold text-neutral-900">{tt("断开连接")}</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
            {tt("断开后需要重新授权或重新粘贴凭证，已授权的访问会被撤销。")}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDisconnectingId(null)}
              className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50"
            >
              {tt("取消")}
            </button>
            <button
              type="button"
              onClick={() => void handleDisconnect(disconnectingId)}
              className="rounded-lg bg-red-600 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-red-700"
            >
              {tt("断开")}
            </button>
          </div>
        </InTreeDialog>
      )}

      {selected && (
        <ConnectorDialog
          connector={selected}
          connection={connByConnector.get(selected.id)}
          connToken={connToken}
          connUrl={connUrl}
          connLabel={connLabel}
          connecting={connecting}
          authorizing={authorizing}
          showAdvanced={showAdvanced}
          probing={probing}
          probeFailed={probeFailed}
          probeError={probeError}
          onToken={setConnToken}
          onUrl={setConnUrl}
          onLabel={setConnLabel}
          onAdvanced={() => setShowAdvanced((v) => !v)}
          onClose={() => {
            setAuthorizing(false);
            setSelected(null);
          }}
          onOauth={() => void handleOauth()}
          onConnect={() => void handleConnect()}
          onProbe={() => void runProbe(selected.id)}
          onToggle={() => {
            const conn = connByConnector.get(selected.id);
            if (conn) void handleToggle(selected.id, !conn.enabled);
          }}
          onDisconnect={() => setDisconnectingId(selected.id)}
        />
      )}
    </section>
  );
}

function ConnectorCard({
  connector,
  connection,
  onClick,
}: {
  connector: McpConnectorMeta;
  connection?: McpConnection;
  onClick: () => void;
}) {
  const tt = useUI();
  const connected = Boolean(connection);
  return (
    <button
      type="button"
      data-mcp-connector={connector.id}
      onClick={onClick}
      className="relative w-full rounded-xl border border-neutral-200 p-4 text-left transition hover:border-neutral-300"
    >
      {connected ? (
        <span
          className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            connection?.enabled ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {connection?.enabled
            ? tt("已连接 · {n} 工具", { n: connection?.tools_count ?? 0 })
            : tt("已停用")}
        </span>
      ) : connector.supports_oauth ? (
        <span className="absolute right-3 top-3 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
          {tt("可一键授权")}
        </span>
      ) : null}
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-lg">
          {connector.icon}
        </div>
        <div className="min-w-0 pr-16">
          <p className="text-[13px] font-medium text-neutral-900">{connector.name}</p>
          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-neutral-500">
            {connector.desc}
          </p>
        </div>
      </div>
    </button>
  );
}

function ConnectorDialog({
  connector,
  connection,
  connToken,
  connUrl,
  connLabel,
  connecting,
  authorizing,
  showAdvanced,
  probing,
  probeFailed,
  probeError,
  onToken,
  onUrl,
  onLabel,
  onAdvanced,
  onClose,
  onOauth,
  onConnect,
  onProbe,
  onToggle,
  onDisconnect,
}: {
  connector: McpConnectorMeta;
  connection?: McpConnection;
  connToken: string;
  connUrl: string;
  connLabel: string;
  connecting: boolean;
  authorizing: boolean;
  showAdvanced: boolean;
  probing: boolean;
  probeFailed: boolean;
  probeError: string;
  onToken: (v: string) => void;
  onUrl: (v: string) => void;
  onLabel: (v: string) => void;
  onAdvanced: () => void;
  onClose: () => void;
  onOauth: () => void;
  onConnect: () => void;
  onProbe: () => void;
  onToggle: () => void;
  onDisconnect: () => void;
}) {
  const tt = useUI();
  const needsToken = connector.auth !== "url" && connector.auth !== "none";
  const oauth = showOneClickButton(connector.supports_oauth);
  const stale = probeFailed;
  const manageButtons = connection ? (
    <>
      <button
        type="button"
        data-mcp-probe
        disabled={probing}
        onClick={onProbe}
        className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
      >
        {probing ? tt("探活中…") : tt("重新探活")}
      </button>
      <button
        type="button"
        onClick={onToggle}
        className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50"
      >
        {connection.enabled ? tt("停用") : tt("启用")}
      </button>
      <button
        type="button"
        data-mcp-disconnect
        onClick={onDisconnect}
        className="rounded-lg px-4 py-2 text-[13px] text-red-600 hover:bg-red-50"
      >
        {tt("断开连接")}
      </button>
    </>
  ) : null;
  const manualFields = (
    <>
      {connector.needs_endpoint && (
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">
            {tt("MCP 服务地址（你的专属 URL）")}
          </label>
          <input
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-sky-500"
            placeholder="https://mcp.example.com/mcp"
            value={connUrl}
            onChange={(e) => onUrl(e.target.value)}
          />
        </div>
      )}
      {needsToken && (
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">Token / API Key</label>
          <input
            type="password"
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-sky-500"
            placeholder={
              connection
                ? tt("已保存（{fingerprint}）— 留空则沿用", { fingerprint: connection.fingerprint })
                : tt("粘贴你的 Token / API Key")
            }
            value={connToken}
            onChange={(e) => onToken(e.target.value)}
          />
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">{tt("名称")}</label>
        <input
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-sky-500"
          value={connLabel}
          onChange={(e) => onLabel(e.target.value)}
        />
      </div>
    </>
  );

  return (
    <InTreeDialog onClose={onClose} wide testId="mcp-connect">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{connector.icon}</span>
          <h3 className="text-[18px] font-semibold text-neutral-900">{connector.name}</h3>
        </div>
        <button
          type="button"
          aria-label={tt("关闭")}
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          ✕
        </button>
      </div>
      {connector.docs ? (
        <div className="mb-4 text-[13px] leading-relaxed text-neutral-700">{connector.docs}</div>
      ) : null}
      {!oauth && helpUrlIsPrimaryPath(false) && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-950">
          <p>{tt("这家需要你自己去 {name} 拿凭证，不能一键授权。", { name: connector.name })}</p>
          {connector.help_url ? (
            <a
              href={connector.help_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block font-medium text-sky-700 underline hover:text-sky-800"
            >
              {tt("去对方后台获取凭证 ↗")}
            </a>
          ) : null}
        </div>
      )}
      {probeFailed && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">
          <p>{tt("连接已失效，请重新授权")}</p>
          {probeError ? <p className="mt-1 text-[12px] text-red-700">{probeError}</p> : null}
        </div>
      )}
      <div className="space-y-3">
        {oauth ? (
          <>
            {connector.needs_endpoint && (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">
                  {tt("MCP 服务地址（你的专属 URL）")}
                </label>
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-sky-500"
                  value={connUrl}
                  onChange={(e) => onUrl(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-mcp-oauth
                disabled={oneClickDisabled(connector.needs_endpoint, connUrl, authorizing)}
                onClick={onOauth}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                {tt(primaryOauthLabel({ authorizing, connected: Boolean(connection), stale }))}
              </button>
              {manageButtons}
            </div>
            <p className="text-[12px] text-neutral-500">
              {tt("点「一键授权」将跳转 {name} 官方页面登录并授权，无需手动复制凭证。", {
                name: connector.name,
              })}
            </p>
            <button
              type="button"
              onClick={onAdvanced}
              className="text-[12px] text-neutral-500 underline hover:text-neutral-700"
            >
              {showAdvanced ? tt("收起") : tt("高级：手动填 Token / URL")}
            </button>
            {showAdvanced && (
              <div className="space-y-3 rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                {connector.help_url && (
                  <a
                    href={connector.help_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] text-sky-600 underline hover:text-sky-700"
                  >
                    {tt("获取凭证 ↗")}
                  </a>
                )}
                {manualFields}
                <button
                  type="button"
                  data-mcp-connect
                  disabled={connecting}
                  onClick={onConnect}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[13px] font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-60"
                >
                  {connecting ? tt("连接中…") : tt("用凭证连接并验证")}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {manualFields}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                data-mcp-connect
                disabled={connecting}
                onClick={onConnect}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                {connecting ? tt("连接中…") : stale || connection ? tt("重新连接 / 更新") : tt("连接并验证")}
              </button>
              {manageButtons}
            </div>
          </>
        )}
        {connection && (
          <p className="text-[12px] text-neutral-500">
            {tt("已连接 · 发现 {n} 个工具。连接后，Agent 在任务中可直接调用该服务的工具。", {
              n: connection.tools_count,
            })}
          </p>
        )}
      </div>
    </InTreeDialog>
  );
}
