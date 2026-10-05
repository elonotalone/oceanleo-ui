"use client";

import { useCallback, useEffect, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { getMcpRegistry } from "../../lib/mcp-api";
import {
  deleteOrgMcpConnection,
  listInheritedMcp,
  listOrgMcpConnections,
  patchOrgMcpConnection,
  setOrgMcpForwardIdentity,
  upsertOrgMcpConnection,
  type OrgRole,
} from "../../lib/org-api";
import {
  canManageOrgMcp,
  normalizeOrgMcpConnections,
  quietOrg,
  type OrgMcpConnection,
} from "../../shell/usePluginsCatalog";
import { ConnectorIcon } from "../plugins/connector-icons";
import { workspaceMcpForwardsIdentityByDefault } from "../plugins/connector-logic";
import { InTreeDialog } from "../plugins/parts";

export function OrgMcpSection({
  orgId,
  orgName,
  role,
}: {
  orgId: string;
  orgName: string;
  role: OrgRole | string;
}) {
  const tt = useUI();
  const manageable = canManageOrgMcp(role);
  const [rows, setRows] = useState<OrgMcpConnection[]>([]);
  const [busyConnector, setBusyConnector] = useState("");
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    const withName = (row: OrgMcpConnection): OrgMcpConnection =>
      row.orgName ? row : { ...row, orgName, orgId: row.orgId || orgId };
    const inherited = normalizeOrgMcpConnections(await quietOrg(() => listInheritedMcp()))
      .filter((row) => row.orgId === orgId)
      .map(withName);
    const byKey = new Map(inherited.map((row) => [row.connectorId, row]));
    if (manageable) {
      const owned = normalizeOrgMcpConnections(
        await quietOrg(() => listOrgMcpConnections(orgId)),
        { orgId, orgName },
      );
      for (const row of owned) byKey.set(row.connectorId, withName(row));
    }
    setRows([...byKey.values()]);
  }, [manageable, orgId, orgName]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchConnection(row: OrgMcpConnection, patch: { enabled?: boolean; memberVisible?: boolean }) {
    setBusyConnector(row.connectorId);
    await quietOrg(() => patchOrgMcpConnection(row.orgId, row.connectorId, patch));
    await load();
    setBusyConnector("");
  }

  async function removeConnection(row: OrgMcpConnection) {
    setBusyConnector(row.connectorId);
    await quietOrg(() => deleteOrgMcpConnection(row.orgId, row.connectorId));
    await load();
    setBusyConnector("");
  }

  async function setForwardIdentity(row: OrgMcpConnection, forward: boolean) {
    setBusyConnector(row.connectorId);
    await quietOrg(() => setOrgMcpForwardIdentity(row.orgId, row.connectorId, forward));
    await load();
    setBusyConnector("");
  }

  return (
    <section data-org-section="mcp" data-org-mcp-section className="mt-6 rounded-xl border border-neutral-200 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold text-neutral-900">{tt("组织提供")}</p>
        {manageable ? (
          <button
            type="button"
            data-org-mcp-connect-entry
            onClick={() => setConnecting(true)}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-neutral-800"
          >
            {tt("为组织连接")}
          </button>
        ) : null}
      </div>
      <p className="mb-3 mt-0.5 text-[12px] text-neutral-500">
        {manageable
          ? tt("在组织里连一次，组织成员就能用，不用各自填凭证。")
          : tt("组织提供的连接由管理员统一管理，你可以直接使用，不需要填凭证。")}
      </p>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center">
          <p className="text-[13px] text-neutral-500">{tt("这个组织还没有连接任何 MCP 服务器。")}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => {
            const busy = busyConnector === row.connectorId;
            return (
              <div
                key={row.connectorId}
                data-org-mcp-row={row.connectorId}
                className="rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <div className="flex items-start gap-3">
                  <ConnectorIcon icon={row.icon} id={row.connectorId} label={row.label} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-neutral-900">{row.label}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          row.enabled ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {row.enabled ? tt("已启用") : tt("已停用")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-neutral-500">
                      {tt("由组织 {name} 提供", { name: row.orgName })}
                      {" · "}
                      {tt("{n} 个工具", { n: row.toolsCount })}
                    </p>
                  </div>
                </div>
                {manageable ? (
                  <div data-org-mcp-manage className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void patchConnection(row, { enabled: !row.enabled })}
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                    >
                      {row.enabled ? tt("停用") : tt("启用")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={row.memberVisible}
                      onClick={() => void patchConnection(row, { memberVisible: !row.memberVisible })}
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                    >
                      {tt("成员可见")}
                    </button>
                    <label
                      data-org-mcp-forward-identity
                      className="flex max-w-full items-start gap-2 text-[12px] text-neutral-700"
                    >
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={row.forwardMemberIdentity}
                        onChange={(event) => void setForwardIdentity(row, event.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block">{tt("把成员身份转给这台服务器")}</span>
                        <span className="mt-0.5 block text-[11px] text-neutral-500">
                          {tt("开了以后服务器知道是哪位成员在操作、各看各的工作区；关着时服务器只知道是本组织。")}
                        </span>
                      </span>
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeConnection(row)}
                      className="rounded-lg px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      {tt("断开")}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {connecting ? (
        <OrgConnectDialog
          orgId={orgId}
          onClose={() => setConnecting(false)}
          onConnected={async () => {
            setConnecting(false);
            await load();
          }}
        />
      ) : null}
    </section>
  );
}

function orgConnectErrorText(error: unknown, tt: (zh: string) => string): string {
  if (error && typeof error === "object") {
    const rec = error as { detail?: unknown; message?: unknown };
    if (typeof rec.detail === "string" && rec.detail.trim()) return rec.detail.trim();
    if (typeof rec.message === "string" && rec.message.trim() && !rec.message.startsWith("org-api:")) {
      return rec.message.trim();
    }
  }
  return tt("连接失败，请检查地址与凭证后重试。");
}

function OrgConnectDialog({
  orgId,
  onClose,
  onConnected,
}: {
  orgId: string;
  onClose: () => void;
  onConnected: () => void | Promise<void>;
}) {
  const tt = useUI();
  const [connectors, setConnectors] = useState<{ id: string; name: string }[]>([
    { id: "custom", name: "自建服务" },
  ]);
  const [connectorId, setConnectorId] = useState("custom");
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [memberVisible, setMemberVisible] = useState(true);
  const [forwardTouched, setForwardTouched] = useState(false);
  const [forwardMemberIdentity, setForwardMemberIdentity] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failedMessage, setFailedMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getMcpRegistry().then((result) => {
      if (cancelled) return;
      const items = (result.items || []).map((row) => ({ id: row.id, name: row.name || row.id }));
      const hasCustom = items.some((row) => row.id === "custom");
      setConnectors(hasCustom ? items : [{ id: "custom", name: "自建服务" }, ...items]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function setEndpointValue(value: string) {
    setEndpoint(value);
    if (!forwardTouched) {
      setForwardMemberIdentity(workspaceMcpForwardsIdentityByDefault(value));
    }
  }

  async function submit() {
    if (!connectorId.trim()) return;
    setSubmitting(true);
    setFailedMessage("");
    try {
      await upsertOrgMcpConnection(orgId, {
        connectorId: connectorId.trim(),
        endpoint: endpoint.trim(),
        token: token.trim(),
        label: label.trim() || connectorId.trim(),
        memberVisible,
        forwardMemberIdentity,
      });
      await onConnected();
    } catch (err) {
      setFailedMessage(orgConnectErrorText(err, tt));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <InTreeDialog onClose={onClose} testId="org-mcp-dialog">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-neutral-900">{tt("为组织连接 MCP")}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          ✕
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">{tt("连接器")}</label>
          <select
            data-org-mcp-connector-select
            value={connectorId}
            onChange={(event) => setConnectorId(event.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
          >
            {connectors.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">{tt("MCP 服务地址（你的专属 URL）")}</label>
          <input
            data-org-mcp-endpoint
            value={endpoint}
            onChange={(event) => setEndpointValue(event.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">Token / API Key</label>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">{tt("名称")}</label>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
          />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-neutral-700">
          <input type="checkbox" checked={memberVisible} onChange={(event) => setMemberVisible(event.target.checked)} />
          {tt("成员可见")}
        </label>
        <label data-org-mcp-dialog-forward-identity className="flex max-w-full items-start gap-2 text-[13px] text-neutral-700">
          <input
            type="checkbox"
            checked={forwardMemberIdentity}
            onChange={(event) => {
              setForwardTouched(true);
              setForwardMemberIdentity(event.target.checked);
            }}
            className="mt-0.5"
          />
          <span>
            <span className="block">{tt("把成员身份转给这台服务器")}</span>
            <span className="mt-0.5 block text-[11px] text-neutral-500">
              {tt("开了以后服务器知道是哪位成员在操作、各看各的工作区；关着时服务器只知道是本组织。")}
            </span>
          </span>
        </label>
        {failedMessage ? (
          <p data-org-mcp-error className="text-[12px] text-red-600">
            {failedMessage}
          </p>
        ) : null}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            data-org-mcp-submit
            disabled={submitting || !connectorId.trim()}
            onClick={() => void submit()}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {submitting ? tt("连接中…") : tt("连接并验证")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50"
          >
            {tt("取消")}
          </button>
        </div>
      </div>
    </InTreeDialog>
  );
}
