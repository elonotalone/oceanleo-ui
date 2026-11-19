"use client";

import { FIELD } from "../settings/personalization/parts";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { useUI } from "../../i18n/ui/useUI";
import {
  connectMcp,
  connectMcpGuided,
  disconnectMcp,
  getMcpConnections,
  getMcpRegistry,
  getMcpConnector,
  mcpOauthMessageOrigin,
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
  connectorConnectMode,
  isConnectionStale,
  oauthConnectionLanded,
  oauthWaitOutcome,
  oneClickDisabled,
  showOneClickButton,
} from "./connector-logic";
import { ConnectorIcon } from "./connector-icons";
import { InTreeDialog } from "./parts";
import { ConnectorDetail } from "../settings/connectors/ConnectorDetail";

export interface ConnectorController {
  registry: McpConnectorMeta[];
  registryStatus: "loading" | "ready" | "error";
  registryError: string;
  loadRegistry: () => Promise<void>;
  connections: McpConnection[];
  connectionsReady: boolean;
  connByConnector: Map<string, McpConnection>;
  /** 探活失败过的连接器 id（「已失效」）。再探活成功或重新连接后移除。 */
  staleIds: ReadonlySet<string>;
  probingId: string;
  openConnector: (c: McpConnectorMeta) => void;
  probe: (connectorId: string) => void;
  toggle: (connectorId: string, enabled: boolean) => void;
  requestDisconnect: (connectorId: string) => void;
  returnOrigin: string;
  /** 自定义连接对话框与断开确认；普通连接器的详情在设置页内渲染。 */
  dialogs: ReactNode;
  detail: ReactNode;
  selectedConnector: McpConnectorMeta | null;
  closeConnector: (notify?: boolean) => void;
}

/**
 * 个人 MCP 连接器的全部状态与动作：注册表、我的连接、一键授权（弹窗 + 回执 + 轮询）、
 * 令牌连接、探活、停用、断开。设置页「连接器」与连接器目录弹窗共用这一份，页面只负责画。
 */
export function useConnectorController({
  dialogZClassName = "z-[180]",
  onDetailClose,
}: { dialogZClassName?: string; onDetailClose?: () => void } = {}): ConnectorController {
  const tt = useUI();
  const ttRef = useRef(tt);
  ttRef.current = tt;
  const toast = useToast();
  const [registry, setRegistry] = useState<McpConnectorMeta[]>([]);
  const [registryStatus, setRegistryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [registryError, setRegistryError] = useState("");
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [connectionsReady, setConnectionsReady] = useState(false);
  const [staleIds, setStaleIds] = useState<ReadonlySet<string>>(() => new Set());
  const [probingId, setProbingId] = useState("");
  const [selected, setSelected] = useState<McpConnectorMeta | null>(null);
  const detailRequestRef = useRef(0);
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
  const [connectError, setConnectError] = useState("");
  const [connectToolsCount, setConnectToolsCount] = useState<number | null>(null);
  const oauthPopupRef = useRef<Window | null>(null);
  const oauthSettledRef = useRef(false);
  const oauthStartedAtRef = useRef<number | null>(null);
  const oauthBeforeRef = useRef<McpConnection | undefined>(undefined);
  const probeSequenceRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => () => { probeSequenceRef.current += 1; }, []);

  const returnOrigin = mcpOauthReturnOrigin();

  const markStale = useCallback((connectorId: string, stale: boolean) => {
    setStaleIds((prev) => {
      if (prev.has(connectorId) === stale) return prev;
      const next = new Set(prev);
      if (stale) next.add(connectorId);
      else next.delete(connectorId);
      return next;
    });
  }, []);

  const loadConnections = useCallback(async () => {
    try {
      setConnections(await getMcpConnections());
      const id = selectedIdRef.current;
      if (id && id !== "custom") {
        const request = ++detailRequestRef.current;
        void getMcpConnector(id).then((result) => {
          if (request === detailRequestRef.current && selectedIdRef.current === id && result.item?.id === id) setSelected(result.item);
        });
      }
    }
    catch { toast.error(ttRef.current("网络错误，请稍后再试。")); }
    finally { setConnectionsReady(true); }
  }, [toast]);

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
    async (connectorId: string) => {
      const sequence = ++probeSequenceRef.current;
      setProbing(true);
      setProbingId(connectorId);
      const res = await probeMcp(connectorId);
      if (sequence !== probeSequenceRef.current) return;
      setProbing(false);
      setProbingId("");
      const stale = isConnectionStale(res);
      if (selectedIdRef.current === connectorId) {
        setProbeFailed(stale);
        setProbeError(!res.ok ? tt(res.error || "网络错误，请稍后再试。") : "");
      }
      if (res.ok || stale) markStale(connectorId, stale);
      if (!res.ok) {
        toast.error(tt(res.error || "网络错误，请稍后再试。"));
        return;
      }
      toast.success(tt("连接正常 · {n} 个工具", { n: res.tools_count ?? 0 }));
      await loadConnections();
    },
    [loadConnections, markStale, toast, tt],
  );

  const openConnector = useCallback(
    (c: McpConnectorMeta) => {
      const existing = connByConnector.get(c.id);
      oauthSettledRef.current = true;
      oauthPopupRef.current = null;
      setAuthorizing(false);
      selectedIdRef.current = c.id;
      probeSequenceRef.current += 1;
      setProbing(false);
      setProbingId("");
      setSelected(c);
      const request = ++detailRequestRef.current;
      if (c.id !== "custom") void getMcpConnector(c.id).then((result) => {
        if (request === detailRequestRef.current && selectedIdRef.current === c.id && result.item?.id === c.id) setSelected(result.item);
      });
      setConnToken("");
      setConnUrl(existing?.endpoint || "");
      setConnLabel(existing?.label || tt(c.name));
      setShowAdvanced(false);
      setProbeFailed(false);
      setProbeError("");
      setConnectError("");
      setConnectToolsCount(null);
    },
    [connByConnector, tt],
  );

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
        toast.success(data.message || ttRef.current("授权成功，已连接"));
        if (selectedIdRef.current === "custom") setSelected(null);
        void loadConnections();
      } else {
        toast.error(data.message || ttRef.current("授权失败"));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadConnections, toast]);

  useEffect(() => {
    if (!authorizing) return;
    const startedAt = oauthStartedAtRef.current ?? Date.now();
    oauthStartedAtRef.current = startedAt;
    let elapsed = 0;
    let checking = false;
    const tick = async () => {
      if (oauthSettledRef.current || checking) return;
      elapsed += 400;
      const popupClosed = Boolean(oauthPopupRef.current?.closed);
      // A closed callback window is successful when the final list read sees the connection.
      if (elapsed >= OAUTH_POLL_MS || popupClosed) {
        elapsed = 0;
        checking = true;
        try {
          const rows = await getMcpConnections();
          if (oauthSettledRef.current) return;
          const after = rows.find((row) => row.connector_id === selected?.id);
          if (oauthConnectionLanded(oauthBeforeRef.current, after)) {
            oauthSettledRef.current = true;
            oauthPopupRef.current = null;
            oauthStartedAtRef.current = null;
            setAuthorizing(false);
            if (selected) markStale(selected.id, false);
            if (selectedIdRef.current === "custom") setSelected(null);
            setConnections(rows);
            void loadConnections();
            toast.success(ttRef.current("授权成功，已连接"));
            return;
          }
        } catch { /* Retry transient list failures until the bounded authorization wait ends. */ }
        finally { checking = false; }
      }
      if (oauthSettledRef.current) return;
      const outcome = oauthWaitOutcome({ startedAt, now: Date.now(), timeoutMs: OAUTH_WAIT_MS, popupClosed });
      if (outcome === "waiting") return;
      oauthSettledRef.current = true;
      oauthPopupRef.current = null;
      oauthStartedAtRef.current = null;
      setAuthorizing(false);
      setConnectError(outcome === "closed"
        ? ttRef.current("授权窗口已关闭，未完成授权")
        : ttRef.current("授权等待超时，请重试"));
    };
    const intervalId = window.setInterval(tick, 400);
    return () => window.clearInterval(intervalId);
  }, [authorizing, loadConnections, markStale, selected, toast]);

  async function handleOauth(inputs?: Record<string, string>) {
    const c = selected;
    if (!c || authorizing) return;
    const mode = connectorConnectMode(c);
    if (c.id !== "custom" && mode.mode !== "oauth" && !(mode.mode === "input" && mode.then === "oauth")) return;
    if (c.id === "custom" && oneClickDisabled(c.needs_endpoint, connUrl, authorizing)) return;
    oauthSettledRef.current = false;
    oauthStartedAtRef.current = Date.now();
    oauthBeforeRef.current = connByConnector.get(c.id);
    setAuthorizing(true);

    // Reserve the window during the click; opening only after fetch is blocked on phones.
    const w = window.open("", "oceanleo-mcp-oauth", "width=600,height=760,menubar=no,toolbar=no");
    oauthPopupRef.current = w;
    if (!w) {
      oauthSettledRef.current = true;
      setAuthorizing(false);
      setConnectError(tt("无法打开授权窗口，请允许弹出窗口后重试"));
      return;
    }
    try {
      const res = inputs ? await connectMcpGuided(c.id, inputs, tt(c.name)) : await startMcpOauth({ connector_id: c.id, endpoint: connUrl.trim() });
      if (oauthSettledRef.current || selectedIdRef.current !== c.id) { w.close(); return; }
      if (!res.ok || !res.authorize_url) throw new Error(res.error || tt("发起授权失败"));
      w.location.href = res.authorize_url;
    } catch (error) {
      w.close();
      oauthSettledRef.current = true;
      setAuthorizing(false);
      setConnectError(error instanceof Error ? error.message : tt("发起授权失败"));
    }
  }

  async function handleConnect() {
    const c = selected ? { ...selected, ...selected.manual } : null;
    if (!c) return;
    if (c.needs_endpoint && !connUrl.trim()) {
      setConnectToolsCount(null);
      setConnectError(tt("该连接器需要填写专属的 MCP 服务地址"));
      return;
    }
    const needsToken = c.auth !== "url" && c.auth !== "none";
    const existing = connByConnector.get(c.id);
    const canReuseToken = existing && existing.auth_kind !== "oauth" && connUrl.trim() === (existing.endpoint || "");
    if (needsToken && !connToken.trim() && !canReuseToken) {
      setConnectToolsCount(null);
      setConnectError(tt("请填写该连接器所需的 Token / API Key"));
      return;
    }
    setConnecting(true);
    setConnectError("");
    setConnectToolsCount(null);
    try {
      const res = await connectMcp({
        connector_id: c.id,
        token: connToken.trim(),
        endpoint: connUrl.trim(),
        label: c.id === "custom" ? connLabel.trim() || tt(c.name) : tt(c.name),
        auth_header: connByConnector.get(c.id)?.auth_header || "",
      });
      if (!res.ok) {
        setConnectError(res.error || tt("连接失败"));
        return;
      }
      setConnectToolsCount(res.tools_count ?? 0);
      setProbeFailed(false);
      setProbeError("");
      markStale(c.id, false);
      await loadConnections();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setConnectError(message || tt("连接失败"));
    } finally {
      setConnecting(false);
    }
  }

  async function handlePrimary(inputs: Record<string, string>) {
    if (!selected) return;
    setConnectError("");
    const mode = connectorConnectMode(selected);
    if (mode.mode === "oauth" || (mode.mode === "input" && mode.then === "oauth")) {
      await handleOauth(mode.mode === "input" ? inputs : undefined);
      return;
    }
    if (mode.mode !== "input" || connecting) return;
    setConnecting(true);
    try {
      const res = await connectMcpGuided(selected.id, inputs, tt(selected.name));
      if (!res.ok) { setConnectError(res.error || tt("连接失败")); return; }
      setConnectToolsCount(res.tools_count ?? 0);
      markStale(selected.id, false);
      await loadConnections();
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : tt("连接失败"));
    } finally { setConnecting(false); }
  }

  const closeConnector = (notify = true) => {
    const wasDetail = selectedIdRef.current !== "custom";
    selectedIdRef.current = null;
    detailRequestRef.current += 1;
    probeSequenceRef.current += 1;
    oauthSettledRef.current = true;
    setAuthorizing(false);
    setSelected(null);
    if (notify && wasDetail) onDetailClose?.();
  };

  async function handleDisconnect(connectorId: string) {
    const res = await disconnectMcp(connectorId);
    setDisconnectingId(null);
    if (!res.ok) {
      toast.error(res.error || tt("断开失败"));
      return;
    }
    toast.success(tt("已断开连接"));
    if (selectedIdRef.current === "custom") setSelected(null);
    setProbeFailed(false);
    setProbeError("");
    markStale(connectorId, false);
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

  const selectedSurface = selected ? (
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
          connectError={connectError}
          connectToolsCount={connectToolsCount}
          zClassName={dialogZClassName}
          onToken={setConnToken}
          onUrl={setConnUrl}
          onLabel={setConnLabel}
          onAdvanced={() => setShowAdvanced((v) => !v)}
          onClose={closeConnector}
          onOauth={() => void handleOauth()}
          onPrimary={(inputs) => void handlePrimary(inputs)}
          onConnect={() => void handleConnect()}
          onProbe={() => void runProbe(selected.id)}
          onToggle={() => {
            const conn = connByConnector.get(selected.id);
            if (conn) void handleToggle(selected.id, !conn.enabled);
          }}
          onDisconnect={() => setDisconnectingId(selected.id)}
        />
  ) : null;

  const dialogs = (
    <>
      {selected?.id === "custom" ? selectedSurface : null}
      {disconnectingId && (
        <InTreeDialog
          onClose={() => setDisconnectingId(null)}
          testId="mcp-disconnect-confirm"
          zClassName={dialogZClassName}
        >
          <h3 className="text-[13px] font-semibold text-neutral-900">{tt("断开连接")}</h3>
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
              data-mcp-disconnect-confirm
              onClick={() => void handleDisconnect(disconnectingId)}
              className="rounded-lg bg-red-600 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-red-700"
            >
              {tt("断开")}
            </button>
          </div>
        </InTreeDialog>
      )}


    </>
  );

  return {
    registry,
    registryStatus,
    registryError,
    loadRegistry,
    connections,
    connectionsReady,
    connByConnector,
    staleIds,
    probingId,
    openConnector,
    probe: (connectorId) => void runProbe(connectorId),
    toggle: (connectorId, enabled) => void handleToggle(connectorId, enabled),
    requestDisconnect: (connectorId) => setDisconnectingId(connectorId),
    returnOrigin,
    dialogs,
    detail: selected && selected.id !== "custom" ? selectedSurface : null,
    selectedConnector: selected,
    closeConnector,
  };
}

/** 目录卡只显示一个状态；点击进入详情，连接方式由网关声明。 */
export function ConnectorCard({
  connector,
  connection,
  onClick,
}: {
  connector: McpConnectorMeta;
  connection?: McpConnection;
  stale?: boolean;
  onClick: () => void;
}) {
  const tt = useUI();
  const connected = Boolean(connection);
  return (
    <button
      type="button"
      data-mcp-connector={connector.id}
      onClick={onClick}
      className="relative w-full rounded-2xl border border-neutral-200 bg-white p-5 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex gap-3">
        <ConnectorIcon icon={connector.icon} id={connector.id} label={tt(connector.name)} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{tt(connector.name)}</p>
          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-neutral-500">
            {tt(connector.tagline || connector.desc)}
          </p>
        </div>
      </div>
      <p data-mcp-connector-status={connected ? "connected" : connectorConnectMode(connector).mode} className="mt-3 text-[12px] text-neutral-500">
        {connected ? tt("已连接") : tt(connectorConnectMode(connector).mode === "oauth" ? "连接" : connectorConnectMode(connector).mode === "input" ? "需要补充连接信息" : "尚未向 OceanLeo 开放")}
      </p>
    </button>
  );
}

export function ConnectorDialog({
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
  connectError,
  connectToolsCount,
  zClassName,
  onToken,
  onUrl,
  onLabel,
  onAdvanced,
  onClose,
  onOauth,
  onPrimary,
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
  connectError: string;
  connectToolsCount: number | null;
  zClassName?: string;
  onToken: (v: string) => void;
  onUrl: (v: string) => void;
  onLabel: (v: string) => void;
  onAdvanced: () => void;
  onClose: () => void;
  onOauth: () => void;
  onPrimary: (inputs: Record<string, string>) => void;
  onConnect: () => void;
  onProbe: () => void;
  onToggle: () => void;
  onDisconnect: () => void;
}) {
  const tt = useUI();
  const manualMeta = { ...connector, ...connector.manual };
  const needsToken = manualMeta.auth !== "url" && manualMeta.auth !== "none";
  const oauth = showOneClickButton(connector.supports_oauth);
  const stale = probeFailed;
  const connectLabel = connecting
    ? tt("连接中…")
    : connector.id === "custom"
      ? tt("用凭证连接并验证")
      : stale || connection
        ? tt("重新连接 / 更新")
        : tt("连接并验证");
  const connectStatus = connecting
    ? { kind: "connecting" as const, text: tt("连接中…") }
    : connectError
      ? { kind: "error" as const, text: connectError }
      : connectToolsCount !== null
        ? {
            kind: "ok" as const,
            text: tt("已连接 {name}（发现 {n} 个工具）", {
              name: tt(connector.name),
              n: connectToolsCount,
            }),
          }
        : null;
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
      {connector.id === "custom" ? <div>
        <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">{tt("名称")}</label>
        <input className={FIELD} value={connLabel} onChange={(e) => onLabel(e.target.value)} />
      </div> : null}
      {(connector.id !== "custom" || manualMeta.needs_endpoint) && (
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">
            {tt("MCP 服务地址（你的专属 URL）")}
          </label>
          <input
            className={FIELD}
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
            className={FIELD}
            placeholder={
              connection && connection.auth_kind !== "oauth" && connUrl.trim() === (connection.endpoint || "")
                ? tt("已保存（{fingerprint}）— 留空则沿用", { fingerprint: connection.fingerprint })
                : tt("粘贴你的 Token / API Key")
            }
            value={connToken}
            onChange={(e) => onToken(e.target.value)}
          />
        </div>
      )}
    </>
  );

  if (connector.id === "custom") {
    return (
      <InTreeDialog onClose={onClose} testId="mcp-connect" zClassName={zClassName}>
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ConnectorIcon icon={connector.icon} id={connector.id} label={tt(connector.name)} />
            <h3 className="text-[16px] font-semibold text-neutral-900">{tt(connector.name)}</h3>
          </div>
          <button type="button" aria-label={tt("关闭")} onClick={onClose} className="min-h-11 min-w-11 flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100">✕</button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); onConnect(); }}>
          <div className="space-y-4">{manualFields}</div>
          {probeError || connectStatus ? (
            <div role="status" data-mcp-connect-status={connectStatus?.kind || "error"} className={`mt-4 rounded-xl px-3 py-2 text-[13px] ${connectStatus?.kind === "ok" ? "bg-emerald-50 text-emerald-800" : connectStatus?.kind === "connecting" ? "bg-neutral-50 text-neutral-600" : "bg-red-50 text-red-800"}`}>
              {connectStatus?.text || probeError}
            </div>
          ) : null}
          {connection ? <div className="mt-5 flex flex-wrap gap-1 border-t border-neutral-100 pt-3">{manageButtons}</div> : null}
          <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50">{tt("取消")}</button>
            {oauth ? (
              <button type="button" data-mcp-oauth disabled={oneClickDisabled(connector.needs_endpoint, connUrl, authorizing)} onClick={onOauth} className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">{tt(authorizing ? "正在等待对方授权…" : "连接")}</button>
            ) : null}
            <button type="submit" data-mcp-connect disabled={connecting || !connUrl.trim()} className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-50">{connecting ? tt("连接中…") : connection ? tt("保存") : tt("连接并验证")}</button>
          </div>
        </form>
      </InTreeDialog>
    );
  }

  return <ConnectorDetail key={connector.id} connector={connector} connection={connection} busy={connecting}
    authorizing={authorizing} onBack={onClose} onConnect={onPrimary} onDisconnect={onDisconnect}
    advanced={showAdvanced} onAdvanced={onAdvanced}
    status={connectStatus || probeError ? <p role="status" data-mcp-connect-status={connectStatus?.kind || "error"} className="text-[13px]">{connectStatus?.text || probeError}</p> : null}
    management={<><button type="button" data-mcp-probe disabled={probing} onClick={onProbe} className="min-h-11 px-3 text-[13px]">{tt(probing ? "探活中…" : "探活")}</button><button type="button" onClick={onToggle} className="min-h-11 px-3 text-[13px]">{tt(connection?.enabled ? "停用" : "启用")}</button></>}
    manual={<form onSubmit={(event) => { event.preventDefault(); onConnect(); }} className="space-y-4">
      {manualFields}
      <button type="submit" data-mcp-connect disabled={connecting} className="min-h-11 rounded-lg border border-neutral-200 px-4 text-[13px]">{connectLabel}</button>
    </form>}
  />;
}
