"use client";

// ============================================================================
// @oceanleo/ui — BYOK：自带 API key（账户 → AI 模型）
// ----------------------------------------------------------------------------
// 用户填自己的厂商 API key，即可免费使用全家桶（用自己的 key、自己的成本，
// OceanLeo 不扣钱包）。key 只以加密形式保存在这台设备的浏览器里，服务器不保存。
// 前端只看得到指纹。一个厂商一把配置。
// ============================================================================

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getKeyProviders,
  getByok,
  putByok,
  deleteByok,
  probeByok,
  getModelConnections,
  authorizeModelConnection,
  getModelConnectionAuthorization,
  deleteModelConnection,
  activateModelConnection,
  invalidateSelectedModelsCache,
  type ModelConnectionAuthorization,
  type ModelConnectionsStatus,
  type ModelConnectionProtocol,
  type KeyProvider,
  type ByokStatus,
  type ByokCap,
} from "../lib/auth";
import { runtimePageHost } from "../contracts/domain-family";
import { useUI } from "../i18n/ui/useUI";
import { HELP_BYOK_ARTICLE_PATH, helpCenterUrl } from "../lib/help-url";
import { BYOK_STATUS_CHANGED_EVENT, invalidateByokStatus } from "../shell/byok-status";

function announceConnectionChange() {
  invalidateByokStatus();
  invalidateSelectedModelsCache();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BYOK_STATUS_CHANGED_EVENT));
}

const CAP_OPTIONS: { id: ByokCap; label: string }[] = [
  { id: "tools", label: "工具调用" },
  { id: "vision", label: "图片输入" },
  { id: "reasoning", label: "推理模式" },
];

const KNOWN_BASE_URL: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com/v1",
  bailian: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  volcano: "https://ark.cn-beijing.volces.com/api/v3",
};

type ByokForm = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  displayName: string;
  protocol: ModelConnectionProtocol;
  caps: Set<ByokCap>;
};

function emptyForm(provider = ""): ByokForm {
  return {
    provider,
    apiKey: "",
    baseUrl: "",
    model: "",
    displayName: "",
    protocol: "chat_completions",
    caps: new Set<ByokCap>(["tools"]),
  };
}

function isCustomProvider(provider: KeyProvider | undefined): boolean {
  return !!provider && (provider.id === "custom" || provider.needs_base_url);
}

function endpointOf(provider: KeyProvider | undefined): string {
  if (!provider) return "";
  if (provider.base_url) return provider.base_url;
  return KNOWN_BASE_URL[provider.id] || "";
}

const RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45";
const QUIET_BTN =
  `rounded-lg border border-neutral-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-neutral-800 transition hover:bg-neutral-50 ${RING}`;
const ROW = "flex items-start justify-between gap-4 py-3";

function ByokRow({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={ROW}>
      <div className="min-w-0 pr-4">
        <p className="text-[13px] font-medium text-neutral-900">{title}</p>
        {detail}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function ByokKeys({ loggedIn }: { loggedIn: boolean }) {
  const tt = useUI();
  const [status, setStatus] = useState<ByokStatus | null>(null);
  const [providers, setProviders] = useState<KeyProvider[]>([]);
  const [form, setForm] = useState<ByokForm>(emptyForm());
  const [probing, setProbing] = useState(false);
  const [probeModels, setProbeModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [authDenied, setAuthDenied] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [editor, setEditor] = useState<"none" | "add">("none");

  const selected = useMemo(
    () => providers.find((provider) => provider.id === form.provider),
    [providers, form.provider],
  );
  const custom = isCustomProvider(selected);
  const formDisabled = !status?.enabled || saving;
  const showLogin = !loggedIn || authDenied;

  useEffect(() => {
    getKeyProviders().then((result) => {
      if (result.ok && result.data) {
        const list = (result.data.providers || []).filter((provider) => provider.id !== "cursor");
        setProviders(list);
      }
    });
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    getByok().then((result) => {
      if (!result.ok && result.status === 401) {
        setAuthDenied(true);
        return;
      }
      if (result.ok && result.data) setStatus(result.data);
      else if (result.error) setError(result.error);
    });
  }, [loggedIn]);

  function formForProvider(id: string): ByokForm {
    const nextSelected = providers.find((provider) => provider.id === id);
    return {
      ...emptyForm(id),
      baseUrl: isCustomProvider(nextSelected) ? "" : endpointOf(nextSelected),
    };
  }

  function openAdd() {
    const first = providers[0];
    setForm(formForProvider(first?.id || ""));
    setProbeModels([]);
    setError("");
    setReauthRequired(false);
    setEditor("add");
  }

  function closeAdd() {
    setEditor("none");
    setForm(emptyForm());
    setProbeModels([]);
    setError("");
    setReauthRequired(false);
  }

  function pickProvider(id: string) {
    const nextSelected = providers.find((provider) => provider.id === id);
    setProbeModels([]);
    setError("");
    setReauthRequired(false);
    setForm((prev) => ({
      ...prev,
      provider: id,
      baseUrl: isCustomProvider(nextSelected) ? "" : endpointOf(nextSelected),
    }));
  }

  function toggleCap(cap: ByokCap) {
    setForm((prev) => {
      const next = new Set(prev.caps);
      if (next.has(cap)) next.delete(cap);
      else next.add(cap);
      return { ...prev, caps: next };
    });
  }

  async function refreshStatus() {
    const result = await getByok();
    if (result.ok && result.data) {
      setStatus(result.data);
      announceConnectionChange();
    }
  }

  async function onReauth() {
    try {
      const mod = await import("../lib/auth/client");
      await mod.signOutEverywhere();
    } catch {
      /* 登出失败也不挡用户重新走登录 */
    }
    if (typeof window !== "undefined") window.location.reload();
  }

  async function onProbe() {
    setError("");
    setReauthRequired(false);
    setProbing(true);
    const result = await probeByok({
      provider: form.provider,
      base_url: custom ? form.baseUrl.trim() || undefined : undefined,
      api_key: form.apiKey.trim() || undefined,
    });
    setProbing(false);
    if (!result.ok) {
      if (result.status === 403 && result.code === "reauth_required") {
        setReauthRequired(true);
        setError(result.error || "为了保护你的钥匙，请重新登录后再添加");
        setProbeModels([]);
        return;
      }
      setError(result.error || tt("探测失败"));
      setProbeModels([]);
      return;
    }
    setProbeModels(result.data?.models || []);
  }

  async function onSave() {
    setError("");
    setReauthRequired(false);
    if (!form.apiKey.trim()) {
      setError(tt("请填入 API key"));
      return;
    }
    if (custom && !form.baseUrl.trim()) {
      setError(tt("自定义厂商需要填写 base_url"));
      return;
    }
    setSaving(true);
    const result = await putByok(form.provider, {
      api_key: form.apiKey.trim(),
      base_url: custom ? form.baseUrl.trim() : undefined,
      model: form.model.trim() || undefined,
      caps: Array.from(form.caps),
      display_name: form.displayName.trim() || selected?.name || form.provider,
      protocol: form.protocol,
    });
    setSaving(false);
    if (!result.ok) {
      if (result.status === 403 && result.code === "reauth_required") {
        setReauthRequired(true);
        setError(result.error || "为了保护你的钥匙，请重新登录后再添加");
        return;
      }
      setReauthRequired(false);
      setError(result.error || tt("添加失败"));
      return;
    }
    if (result.data) {
      setStatus(result.data);
      announceConnectionChange();
    }
    else await refreshStatus();
    closeAdd();
  }

  async function onDelete(provider: string) {
    const result = await deleteByok(provider);
    if (result.ok) {
      if (result.data) {
        setStatus(result.data);
        announceConnectionChange();
      }
      else await refreshStatus();
      return;
    }
    setError(result.error || tt("添加失败"));
  }

  const inputClass =
    "w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-neutral-400 disabled:bg-neutral-50 disabled:text-neutral-400";
  const configured = (status?.providers || []).filter((row) => row.provider !== "cursor" && row.auth_type !== "oauth");
  const gatewayOn = !!status?.enabled;

  return (
    <section
      className="v-fade-up space-y-1"
      style={{ animationDelay: "30ms" }}
      data-byok-editor={editor}
    >
      <div className="mb-2">
        <h2 className="text-[14px] font-semibold text-neutral-900">
          {tt("自带 API key（BYOK）")}
          <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-normal text-neutral-500">
            {tt("Chat Completions / Responses")}
          </span>
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">
          {tt(
            "你的 key 只以加密形式保存在这台设备的浏览器里，OceanLeo 服务器不保存；每次调用随请求经过 OceanLeo 网关转发给厂商，网关用完即弃、不记录。换设备需重填，清除站点数据会丢失。",
          )}
        </p>
        <p className="mt-2">
          <a
            data-byok-help=""
            href={helpCenterUrl({
              host: runtimePageHost() || undefined,
              path: HELP_BYOK_ARTICLE_PATH,
              from: "settings-byok",
            })}
            className="text-[12px] font-medium text-neutral-700 underline underline-offset-2"
          >
            {tt("怎么自己带密钥")}
          </a>
        </p>
      </div>

      {showLogin ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-[13px] text-neutral-500">
          {tt("登录后即可配置自己的 key")}
        </div>
      ) : (
        <>
          {status && !status.enabled && (
            <div className="mb-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
              {tt("网关尚未启用 BYOK，请稍后再试。")}
            </div>
          )}

          {configured.length > 0 ? (
            <div data-byok-configured="">
              {configured.map((row) => {
                const capLabels = (row.caps || [])
                  .map((cap) => CAP_OPTIONS.find((item) => item.id === cap)?.label || cap)
                  .map((label) => tt(label))
                  .join(" · ");
                const model = row.display_name ? (row.protocol === "responses" ? "Responses" : "Chat Completions") : row.model || tt("厂商默认");
                return (
                  <ByokRow
                    key={row.provider}
                    title={row.display_name || row.name || row.provider}
                    detail={
                      <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
                        <span className="font-mono text-neutral-500">{row.fingerprint}</span>
                        {" · "}
                        {model}
                        {capLabels ? ` · ${capLabels}` : ""}
                      </p>
                    }
                    action={
                      <button
                        type="button"
                        data-byok-delete={row.provider}
                        disabled={!gatewayOn}
                        onClick={() => onDelete(row.provider)}
                        className={QUIET_BTN}
                      >
                        {tt("删除")}
                      </button>
                    }
                  />
                );
              })}
            </div>
          ) : null}

          <ByokRow
            title={tt("添加密钥")}
            detail={
              configured.length === 0 ? (
                <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
                  {tt("还没有自带密钥")}
                </p>
              ) : null
            }
            action={
              editor === "add" ? (
                <button type="button" data-byok-cancel="" className={QUIET_BTN} onClick={closeAdd}>
                  {tt("取消")}
                </button>
              ) : (
                <button
                  type="button"
                  data-byok-add=""
                  className={QUIET_BTN}
                  disabled={!gatewayOn}
                  onClick={openAdd}
                >
                  {tt("添加")}
                </button>
              )
            }
          />

          {editor === "add" ? (
          <fieldset
            data-byok-form=""
            disabled={formDisabled}
            className="space-y-3 pb-3"
          >
            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700" htmlFor="byok-alias">{tt("连接名称")}</label>
              <input id="byok-alias" value={form.displayName} maxLength={80} placeholder={selected?.name}
                onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700" htmlFor="byok-protocol">{tt("接口协议")}</label>
              <select id="byok-protocol" value={form.protocol} className={inputClass}
                onChange={(event) => setForm((prev) => ({ ...prev, protocol: event.target.value as ModelConnectionProtocol }))}>
                <option value="chat_completions">Chat Completions</option>
                <option value="responses">Responses</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                {tt("厂商")}
              </label>
              <select
                value={form.provider}
                onChange={(event) => pickProvider(event.target.value)}
                className={inputClass}
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>

            {custom ? (
              <div>
                <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                  {tt("接口地址")}
                </label>
                <input
                  type="text"
                  value={form.baseUrl}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, baseUrl: event.target.value }))
                  }
                  placeholder="https://api.example.com/v1"
                  className={inputClass}
                />
              </div>
            ) : form.baseUrl ? (
              <p className="text-[12px] leading-relaxed text-neutral-400">
                {tt("接口地址")} {form.baseUrl}
              </p>
            ) : null}

            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                API Key
              </label>
              <input
                type="password"
                value={form.apiKey}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, apiKey: event.target.value }))
                }
                placeholder={tt("粘贴厂商 API Key")}
                autoComplete="off"
                className={inputClass}
              />
              {selected?.key_help_url ? (
                <a
                  href={selected.key_help_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[11px] text-blue-600 hover:underline"
                >
                  {tt("去厂商控制台获取 →")}
                </a>
              ) : null}
              {form.provider === "bailian" ? (
                <p className="mt-1 text-[11px] text-amber-700">
                  {tt(
                    "百炼 Coding Plan（sk-sp- 开头）的 key 禁止用于应用后端，不能在此使用。",
                  )}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                {tt("模型名称")}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={form.model}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, model: event.target.value }))
                  }
                  placeholder={tt("例如 gpt-4o；留空用厂商默认")}
                  className={`${inputClass} min-w-[12rem] flex-1`}
                />
                {probeModels.length > 0 ? (
                  <select
                    value={form.model}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, model: event.target.value }))
                    }
                    className="rounded-lg border border-neutral-200 px-2 py-2 text-[13px] text-neutral-800 outline-none focus:border-neutral-400"
                  >
                    {probeModels.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  disabled={probing || formDisabled}
                  onClick={onProbe}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-[13px] font-medium text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 disabled:opacity-50"
                >
                  {tt("探测")}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                {tt("能力")}
              </label>
              <div className="flex flex-wrap gap-4">
                {CAP_OPTIONS.map((cap) => (
                  <label
                    key={cap.id}
                    className="flex items-center gap-1.5 text-[13px] text-neutral-700"
                  >
                    <input
                      type="checkbox"
                      checked={form.caps.has(cap.id)}
                      onChange={() => toggleCap(cap.id)}
                    />
                    {tt(cap.label)}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-400">
                {tt(
                  "勾选「工具调用」后可用于智能体任务；未勾选时智能体会明确报错。",
                )}
              </p>
            </div>

            {error ? <p className="text-[12px] text-rose-600">{error}</p> : null}
            {reauthRequired ? (
              <button
                type="button"
                onClick={onReauth}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] font-medium text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50"
              >
                {tt("重新登录")}
              </button>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                data-byok-save=""
                disabled={formDisabled}
                onClick={onSave}
                className={QUIET_BTN}
              >
                {saving ? tt("保存中…") : tt("保存")}
              </button>
            </div>
          </fieldset>
          ) : null}
          <ModelConnectionSettings onChanged={refreshStatus} onReauth={onReauth} />
        </>
      )}
    </section>
  );
}

function ModelConnectionSettings({ onChanged, onReauth }: {
  onChanged: () => Promise<void>;
  onReauth: () => Promise<void>;
}) {
  const tt = useUI();
  const [list, setList] = useState<ModelConnectionsStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [caps, setCaps] = useState<ByokCap[]>(["tools"]);
  const [connectionId, setConnectionId] = useState<string>();
  const [authorization, setAuthorization] = useState<ModelConnectionAuthorization | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reauth, setReauth] = useState(false);

  async function refresh() {
    const result = await getModelConnections();
    if (result.ok && result.data) setList(result.data);
    else setError("连接暂不可用，请稍后重试。");
  }

  useEffect(() => {
    let active = true;
    void getModelConnections().then((result) => {
      if (!active) return;
      if (result.ok && result.data) setList(result.data);
      else setError("连接暂不可用，请稍后重试。");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authorization || authorization.status !== "pending") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    const poll = async () => {
      const result = await getModelConnectionAuthorization(authorization.id, abort.signal);
      if (!active) return;
      if (!result.ok || !result.data) {
        setAuthorization(null);
        setError("授权状态读取失败，请重试。");
        setReauth(result.code === "reauth_required");
        return;
      }
      const next = result.data;
      if (next.status === "ready") {
        setAuthorization(next);
        setEditing(false);
        setName("");
        setModel("");
        await Promise.all([refresh(), onChanged()]);
      } else if (next.status === "expired" || next.status === "failed") {
        setAuthorization(next);
        setError(next.status === "expired" ? "授权已过期，请重新授权。" : "授权未完成，请重新授权。");
      } else {
        timer = setTimeout(poll, 2000);
      }
    };
    timer = setTimeout(poll, 2000);
    return () => { active = false; abort.abort(); clearTimeout(timer); };
  // Polling belongs to this attempt; parent renders must not restart it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorization?.id, authorization?.status]);

  async function start() {
    if (!name.trim() || !model.trim()) {
      setError("请填写连接名称和模型名称。");
      return;
    }
    setBusy(true);
    setError("");
    setReauth(false);
    const result = await authorizeModelConnection({
      display_name: name.trim(), model: model.trim(), caps, connection_id: connectionId,
    });
    setBusy(false);
    if (result.ok && result.data) setAuthorization(result.data);
    else {
      setError("授权未能开始，请重试。");
      setReauth(result.code === "reauth_required");
    }
  }

  async function disconnect(id: string) {
    setBusy(true);
    setError("");
    const result = await deleteModelConnection(id);
    if (result.ok) {
      setAuthorization(null);
      await refresh();
      await onChanged();
    } else {
      setError("断开连接失败，请重试。");
      setReauth(result.code === "reauth_required");
    }
    setBusy(false);
  }

  async function activate(id: string) {
    setBusy(true);
    setError("");
    const result = await activateModelConnection(id);
    if (result.ok) {
      setAuthorization(null);
      await Promise.all([refresh(), onChanged()]);
    } else {
      setError("连接暂不可用，请稍后重试。");
      setReauth(result.code === "reauth_required");
    }
    setBusy(false);
  }

  const input = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px]";
  const available = !!list?.enabled && !!list.authorization_available;
  return <div data-model-connections="" className="space-y-3 border-t border-neutral-100 pt-3">
    <ByokRow title={tt("登录授权")} detail={<p className="text-[12px] text-neutral-500">{tt("通过厂商官方流程授权；授权凭据加密保存在网关，可随时断开。")}</p>}
      action={<button type="button" className={QUIET_BTN} disabled={!available || busy} data-model-connection-add=""
        onClick={() => { setEditing(true); setConnectionId(undefined); setName(""); setModel(""); setCaps(["tools"]); setAuthorization(null); setError(""); }}>{tt("添加连接")}</button>} />
    {list && !available ? <p role="status" className="text-[12px] text-neutral-500">{tt("当前暂不支持登录授权。")}{list.unavailable_reason ? ` ${tt(list.unavailable_reason)}` : ""}</p> : null}
    {list?.connections.some((connection) => !connection.active) || authorization?.activation_required ? <p className="text-[12px] text-neutral-500">{tt("使用此连接将替换这台设备上同厂商的当前配置。")}</p> : null}
    {list?.connections.map((connection) => <ByokRow key={connection.id} title={connection.display_name}
      detail={<p className="text-[12px] text-neutral-500">{tt(connection.status === "active" || connection.status === "ready" ? "已连接" : "需要重新授权")}</p>}
      action={<div className="flex flex-wrap gap-2">
        {!connection.active && (connection.status === "ready" || connection.status === "active") ? <button type="button" className={QUIET_BTN} disabled={busy || !available} data-model-connection-activate={connection.id} onClick={() => activate(connection.id)}>{tt("使用此连接")}</button> : null}
        <button type="button" disabled={!available || busy} className={QUIET_BTN} onClick={() => {
        setEditing(true); setConnectionId(connection.id); setName(connection.display_name); setModel(connection.model || ""); setCaps(connection.caps || ["tools"]); setAuthorization(null); setError("");
      }}>{tt("重新授权")}</button><button type="button" className={QUIET_BTN} disabled={busy} data-model-connection-delete={connection.id} onClick={() => disconnect(connection.id)}>{tt("断开连接")}</button></div>} />)}
    {editing ? <fieldset disabled={busy} className="space-y-3" data-model-connection-form="">
      <label className="block text-[12px]">{tt("连接名称")}<input className={input} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
      <label className="block text-[12px]">{tt("模型名称")}<input className={input} value={model} onChange={(event) => setModel(event.target.value)} /></label>
      <div className="flex flex-wrap gap-4">{CAP_OPTIONS.map((cap) => <label key={cap.id} className="flex items-center gap-1.5 text-[12px]">
        <input type="checkbox" checked={caps.includes(cap.id)} onChange={() => setCaps((previous) => previous.includes(cap.id) ? previous.filter((id) => id !== cap.id) : [...previous, cap.id])} />{tt(cap.label)}
      </label>)}</div>
      <button type="button" className={QUIET_BTN} disabled={!available || authorization?.status === "pending"} data-model-connection-authorize="" onClick={start}>{tt("开始授权")}</button>{" "}
      <button type="button" className={QUIET_BTN} onClick={() => { setEditing(false); setAuthorization(null); setError(""); }}>{tt("取消")}</button>
    </fieldset> : null}
    {authorization?.status === "pending" ? <div role="status" className="space-y-2 text-[12px]">
      <p>{tt("等待厂商授权完成…")}</p>
      {authorization.instructions ? <pre className="whitespace-pre-wrap break-all">{authorization.instructions}</pre> : null}
      {authorization.helper_url?.startsWith("https://") ? <a href={authorization.helper_url} className="block underline" download="oceanleo-authorize.py">{tt("下载")}</a> : null}
      {authorization.handoff_token ? <p>{tt("一次性授权交接码")} <code>{authorization.handoff_token}</code></p> : null}
      {authorization.authorization_url?.startsWith("https://") ? <a href={authorization.authorization_url} target="_blank" rel="noreferrer" className="underline">{tt("前往厂商授权")}</a> : null}
    </div> : null}
    {error ? <p role="alert" className="text-[12px] text-rose-600">{tt(error)}</p> : null}
    {reauth ? <button type="button" className={QUIET_BTN} onClick={onReauth}>{tt("重新登录")}</button> : null}
  </div>;
}
