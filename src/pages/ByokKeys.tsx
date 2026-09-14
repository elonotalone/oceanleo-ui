"use client";

// ============================================================================
// @oceanleo/ui — BYOK：自带 API key（账户 → AI 模型）
// ----------------------------------------------------------------------------
// 用户填自己的厂商 API key，即可免费使用全家桶（用自己的 key、自己的成本，
// OceanLeo 不扣钱包）。key 只以加密形式保存在这台设备的浏览器里，服务器不保存。
// 前端只看得到指纹。一个厂商一把配置。
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import {
  getKeyProviders,
  getByok,
  putByok,
  deleteByok,
  probeByok,
  type KeyProvider,
  type ByokStatus,
  type ByokCap,
} from "../lib/auth";
import { useUI } from "../i18n/ui/useUI";

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
  caps: Set<ByokCap>;
};

function emptyForm(provider = ""): ByokForm {
  return {
    provider,
    apiKey: "",
    baseUrl: "",
    model: "",
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
        const list = result.data.providers || [];
        setProviders(list);
        setForm((prev) => {
          const nextProvider = prev.provider || list[0]?.id || "";
          const nextSelected = list.find((provider) => provider.id === nextProvider);
          return {
            ...prev,
            provider: nextProvider,
            baseUrl: isCustomProvider(nextSelected) ? prev.baseUrl : endpointOf(nextSelected),
          };
        });
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
    if (result.ok && result.data) setStatus(result.data);
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
    if (result.data) setStatus(result.data);
    else await refreshStatus();
    const nextSelected = providers.find((provider) => provider.id === form.provider);
    setForm({
      ...emptyForm(form.provider),
      baseUrl: isCustomProvider(nextSelected) ? "" : endpointOf(nextSelected),
    });
    setProbeModels([]);
  }

  async function onDelete(provider: string) {
    const result = await deleteByok(provider);
    if (result.ok) {
      if (result.data) setStatus(result.data);
      else await refreshStatus();
      return;
    }
    setError(result.error || tt("添加失败"));
  }

  const inputClass =
    "w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-neutral-400 disabled:bg-neutral-50 disabled:text-neutral-400";

  return (
    <section className="v-fade-up" style={{ animationDelay: "30ms" }}>
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold text-neutral-900">
          {tt("自带 API key（BYOK）")}
          <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-normal text-neutral-500">
            {tt("仅支持 OpenAI 兼容协议 API")}
          </span>
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">
          {tt(
            "你的 key 只以加密形式保存在这台设备的浏览器里，OceanLeo 服务器不保存；每次调用随请求经过 OceanLeo 网关转发给厂商，网关用完即弃、不记录。换设备需重填，清除站点数据会丢失。",
          )}
        </p>
      </div>

      {showLogin ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-[13px] text-neutral-500">
          {tt("登录后即可配置自己的 key")}
        </div>
      ) : (
        <>
          {status && !status.enabled && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
              {tt("网关尚未启用 BYOK，请稍后再试。")}
            </div>
          )}

          <fieldset
            disabled={formDisabled}
            className="mb-3 space-y-3 rounded-2xl border border-neutral-200 p-4"
          >
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

            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                {tt("接口地址")}
              </label>
              <input
                type="text"
                value={form.baseUrl}
                readOnly={!custom}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, baseUrl: event.target.value }))
                }
                placeholder={custom ? "https://api.example.com/v1" : undefined}
                className={inputClass}
              />
            </div>

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

            <button
              type="button"
              disabled={formDisabled}
              onClick={onSave}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? tt("保存中…") : tt("保存")}
            </button>
          </fieldset>

          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-neutral-800">
              {tt("已配置的厂商")}
            </h3>
            {(status?.providers || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-[13px] text-neutral-400">
                —
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-neutral-200">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">{tt("厂商")}</th>
                      <th className="px-3 py-2 font-medium">{tt("指纹")}</th>
                      <th className="px-3 py-2 font-medium">{tt("模型名称")}</th>
                      <th className="px-3 py-2 font-medium">{tt("能力")}</th>
                      <th className="px-3 py-2 text-right font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {(status?.providers || []).map((row) => (
                      <tr key={row.provider} className="text-neutral-700">
                        <td className="px-3 py-2.5 font-medium text-neutral-900">
                          {row.name || row.provider}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-neutral-500">
                          {row.fingerprint}
                        </td>
                        <td className="px-3 py-2.5 text-neutral-500">
                          {row.model ? row.model : tt("厂商默认")}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {(row.caps || []).map((cap) => (
                              <span
                                key={cap}
                                className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700"
                              >
                                {tt(
                                  CAP_OPTIONS.find((item) => item.id === cap)?.label ||
                                    cap,
                                )}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            disabled={!status?.enabled}
                            onClick={() => onDelete(row.provider)}
                            className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-rose-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-rose-50 disabled:opacity-50"
                          >
                            {tt("删除")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
