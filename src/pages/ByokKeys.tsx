"use client";

// ============================================================================
// @oceanleo/ui — BYOK：自带 API key（账户 → AI 模型）
// ----------------------------------------------------------------------------
// 用户填自己的厂商 API key，即可免费使用全家桶（用自己的 key、自己的成本，
// OceanLeo 不扣钱包）。key 只以加密形式保存在这台设备的浏览器里，服务器不保存。
// 前端只看得到指纹。一个连接可配置多个模型，同一厂商可添加多个连接。
// ============================================================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getKeyProviders,
  getByok,
  saveByokConnection,
  deleteByokConnection,
  deleteByok,
  invalidateSelectedModelsCache,
  type ModelConnectionProtocol,
  type KeyProvider,
  type ByokStatus,
  type ByokConnectionModel,
  type ByokConnectionView,
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

const PROTOCOLS = ["chat_completions", "responses", "images", "images_edits", "audio_speech", "audio_transcriptions", "video", "native"] as const;

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
  models: ByokConnectionModel[];
  displayName: string;
  protocol: ModelConnectionProtocol;
  connectionId?: string;
};

function emptyForm(provider = ""): ByokForm {
  return {
    provider,
    apiKey: "",
    baseUrl: "",
    models: [{ id: "", name: "" }],
    displayName: "",
    protocol: "chat_completions",
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

export function ByokKeys({ loggedIn, initialConnectionId = "" }: { loggedIn: boolean; initialConnectionId?: string }) {
  const tt = useUI();
  const [status, setStatus] = useState<ByokStatus | null>(null);
  const [providers, setProviders] = useState<KeyProvider[]>([]);
  const [form, setForm] = useState<ByokForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [authDenied, setAuthDenied] = useState(false);
  const [editor, setEditor] = useState<"none" | "add" | "edit">("none");
  const openedConnectionRef = useRef("");
  const editorEpochRef = useRef(0);

  useEffect(() => {
    if (!initialConnectionId) { openedConnectionRef.current = ""; return; }
    if (openedConnectionRef.current === initialConnectionId) return;
    const row = status?.connections?.find(connection => connection.connection_id === initialConnectionId);
    if (row) {
      openedConnectionRef.current = initialConnectionId;
      openEdit(row);
    }
  }, [initialConnectionId, status]);

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
    editorEpochRef.current += 1;
    const first = providers[0];
    setForm(formForProvider(first?.id || ""));
    setError("");
    setEditor("add");
  }

  function closeAdd() {
    editorEpochRef.current += 1;
    setSaving(false);
    setEditor("none");
    setForm(emptyForm());
    setError("");
  }

  function pickProvider(id: string) {
    const nextSelected = providers.find((provider) => provider.id === id);
    setError("");
    setForm((prev) => ({
      ...prev,
      provider: id,
      baseUrl: isCustomProvider(nextSelected) ? "" : endpointOf(nextSelected),
    }));
  }

  function openEdit(row: ByokConnectionView) {
    editorEpochRef.current += 1;
    setForm({ provider: row.provider, apiKey: "", baseUrl: row.base_url || "", displayName: row.display_name || "", protocol: row.protocol || "chat_completions", connectionId: row.connection_id, models: row.models.length ? row.models.map(model => ({ ...model })) : [{ id: "", name: "" }] });
    setError("");
    setEditor("edit");
  }

  async function refreshStatus() {
    const result = await getByok();
    if (result.ok && result.data) {
      setStatus(result.data);
      announceConnectionChange();
    }
  }

  async function onSave() {
    setError("");
    if (!form.connectionId && !form.apiKey.trim()) {
      setError(tt("请填入 API key"));
      return;
    }
    if (form.models.some(model => !model.id.trim())) {
      setError(tt("请填写模型 ID"));
      return;
    }
    if (custom && !form.baseUrl.trim()) {
      setError(tt("自定义厂商需要填写 base_url"));
      return;
    }
    setSaving(true);
    const editorEpoch = editorEpochRef.current;
    const result = await saveByokConnection({
      provider: form.provider,
      api_key: form.apiKey.trim() || undefined,
      base_url: custom ? form.baseUrl.trim() : undefined,
      models: form.models.map(model => ({ ...model, id: model.id.trim(), name: model.name?.trim() || undefined })),
      display_name: form.displayName.trim(),
      protocol: form.protocol,
    }, form.connectionId);
    if (editorEpoch !== editorEpochRef.current) {
      if (result.ok && result.data) { setStatus(result.data); announceConnectionChange(); }
      return;
    }
    setSaving(false);
    if (!result.ok) {
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

  async function onDelete(provider: string, connectionId?: string) {
    const result = await (connectionId ? deleteByokConnection(connectionId) : deleteByok(provider));
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
  const configured: ByokConnectionView[] = status?.connections || (status?.providers || []).filter(row => row.auth_type !== "oauth").map(row => ({ ...row, connection_id: row.connection_id || "", models: [{ id: row.model, protocol: row.protocol }] }));
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
            {tt("一个连接，多个模型")}
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
                return (
                  <ByokRow
                    key={row.connection_id || row.provider}
                    title={row.display_name || row.provider}
                    detail={
                      <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
                        <span className="font-mono text-neutral-500">{row.fingerprint}</span>
                        {" · "}
                        {row.provider}{" · "}{row.connection_id}
                        {row.models.map((model, index) => <span key={model.route_id || index} className="block">{model.name ? `${model.name} · ` : ""}{model.id} · {model.protocol || row.protocol || "chat_completions"}</span>)}
                      </p>
                    }
                    action={
                      <div className="flex gap-2">
                      <button type="button" data-byok-edit={row.connection_id || row.provider} disabled={!gatewayOn || !row.connection_id} onClick={() => openEdit(row)} className={QUIET_BTN}>{tt("编辑")}</button>
                      <button
                        type="button"
                        data-byok-delete={row.provider}
                        disabled={!gatewayOn}
                        onClick={() => onDelete(row.provider, row.connection_id)}
                        className={QUIET_BTN}
                      >
                        {tt("删除")}
                      </button>
                      </div>
                    }
                  />
                );
              })}
            </div>
          ) : null}
          {error && editor === "none" ? <p role="alert" className="text-[12px] text-rose-600">{error}</p> : null}

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
              editor !== "none" ? (
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

          {editor !== "none" ? (
          <fieldset
            data-byok-form=""
            disabled={formDisabled}
            className="space-y-3 pb-3"
          >
            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700" htmlFor="byok-alias">{tt("备注（选填）")}</label>
              <input id="byok-alias" value={form.displayName} maxLength={80} placeholder={selected?.name}
                onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700" htmlFor="byok-protocol">{tt("接口协议")}</label>
              <select id="byok-protocol" value={form.protocol} className={inputClass}
                onChange={(event) => setForm((prev) => ({ ...prev, protocol: event.target.value as ModelConnectionProtocol }))}>
                {PROTOCOLS.map(protocol => <option key={protocol} value={protocol}>{protocol}</option>)}
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
                aria-label="API Key"
                value={form.apiKey}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, apiKey: event.target.value }))
                }
                placeholder={tt(form.connectionId ? "留空保留现有密钥" : "粘贴厂商 API Key")}
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

            <div className="space-y-2" data-byok-models="">
              {form.models.map((model, index) => {
                const patch = (value: Partial<ByokConnectionModel>) => setForm(prev => ({ ...prev, models: prev.models.map((row, i) => i === index ? { ...row, ...value } : row) }));
                return <div key={index} data-byok-model-row="" className="space-y-2 rounded-lg border border-neutral-200 p-3">
                  <label className="block text-[12px]">{tt("模型 ID")}<input aria-label={`模型 ID ${index + 1}`} value={model.id} onChange={event => patch({ id: event.target.value })} className={inputClass} /></label>
                  <label className="block text-[12px]">{tt("模型备注（选填）")}<input aria-label={`模型备注 ${index + 1}`} value={model.name || ""} onChange={event => patch({ name: event.target.value })} className={inputClass} /></label>
                  <label className="block text-[12px]">{tt("接口协议")}<select aria-label={`模型协议 ${index + 1}`} value={model.protocol || ""} onChange={event => patch({ protocol: event.target.value as ModelConnectionProtocol || undefined })} className={inputClass}>
                    <option value="">{tt("使用连接协议")}</option>
                    {PROTOCOLS.map(protocol => <option key={protocol} value={protocol}>{protocol}</option>)}
                  </select></label>
                  <button type="button" disabled={form.models.length === 1} onClick={() => setForm(prev => ({ ...prev, models: prev.models.filter((_, i) => i !== index) }))} className={QUIET_BTN}>{tt("移除模型")}</button>
                </div>;
              })}
              <button type="button" data-byok-add-model="" onClick={() => setForm(prev => ({ ...prev, models: [...prev.models, { id: "", name: "" }] }))} className={QUIET_BTN}>{tt("添加模型")}</button>
            </div>

            {error ? <p role="alert" className="text-[12px] text-rose-600">{error}</p> : null}

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
        </>
      )}
    </section>
  );
}
