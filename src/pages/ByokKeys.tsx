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

// ---------------------------------------------------------------------------
// Cursor（编码 agent）—— 不是聊天厂商，走自己的 /v1/cursor 端点（W17）
// ---------------------------------------------------------------------------
// key 与其它厂商一样只进这台设备的密封 cookie；写入口是 PUT /v1/cursor/key
// （/v1/byok/cursor 故意不收，因为 cursor 不是聊天模型厂商），撤销复用
// DELETE /v1/byok/cursor（下面表格的「删除」）。运行时的选择只留在组件 state：
// 这一页的规矩是不往任何浏览器存储写东西。
// `../lib/auth` 与 `../lib/auth/client` 在既有测试里被替身成极少几个导出，
// 所以这里的网关请求用运行时 import() 取 accessToken / GATEWAY_BASE，不加静态命名导入。
const CURSOR_PROVIDER = "cursor";
const CURSOR_KEY_PREFIX = "crsr_";
type CursorRuntime = "cloud" | "local";

type CursorResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
  code?: string;
};

async function cursorRequest<T>(path: string, init?: RequestInit): Promise<CursorResult<T>> {
  let token: string | null = null;
  let base = "";
  try {
    const client = await import("../lib/auth/client");
    const config = await import("../lib/auth/config");
    token = typeof client.accessToken === "function" ? await client.accessToken() : null;
    base = typeof config.GATEWAY_BASE === "string" ? config.GATEWAY_BASE : "";
  } catch {
    return { ok: false, error: "未登录", status: 401 };
  }
  if (!token) return { ok: false, error: "未登录", status: 401 };
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      credentials: "include",
    });
  } catch {
    return { ok: false, error: "网络错误：无法连接到 AI 网关。", status: 0 };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const rec = detail as { code?: unknown; message?: unknown };
      return {
        ok: false,
        status: res.status,
        code: typeof rec.code === "string" ? rec.code : undefined,
        error:
          typeof rec.message === "string" && rec.message.trim()
            ? rec.message
            : `HTTP ${res.status}`,
      };
    }
    return {
      ok: false,
      status: res.status,
      error: typeof detail === "string" && detail ? detail : `HTTP ${res.status}`,
    };
  }
  return { ok: true, data: data as T };
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

  // Cursor 段（独立于上面的聊天厂商表单）
  const [cursorKey, setCursorKey] = useState("");
  const [cursorBusy, setCursorBusy] = useState(false);
  const [cursorError, setCursorError] = useState("");
  const [cursorReauth, setCursorReauth] = useState(false);
  const [cursorVerified, setCursorVerified] = useState<{ name: string; email: string } | null>(
    null,
  );
  const [cursorRuntime, setCursorRuntime] = useState<CursorRuntime>("cloud");
  const cursorSaved = !!status?.providers?.some((row) => row.provider === CURSOR_PROVIDER);

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
      if (provider === CURSOR_PROVIDER) {
        setCursorVerified(null);
        setCursorError("");
      }
      return;
    }
    setError(result.error || tt("添加失败"));
  }

  // --- Cursor ---------------------------------------------------------------
  function cursorFailureText(result: CursorResult<unknown>): string {
    switch (result.code) {
      case "invalid_key":
        return tt("Cursor 拒绝了这把 key（无效或已撤销），请重新生成后再保存。");
      case "github_not_connected":
        return tt("你的 Cursor 账号还没有连通 GitHub：请在 Cursor Dashboard → Integrations 里连接后重试。");
      case "quota":
        return tt("Cursor 额度或频率受限，请稍后再试。");
      case "timeout":
        return tt("连接 Cursor 超时，请稍后再试。");
      case "cursor_key_invalid":
        return result.error || tt("这不是 Cursor 的 API Key（应以 crsr_ 开头）。");
      default:
        return result.error || tt("操作失败");
    }
  }

  async function onCursorVerify(): Promise<boolean> {
    const result = await cursorRequest<{ ok: boolean; name: string; email: string }>(
      "/v1/cursor/verify",
      { method: "POST" },
    );
    if (!result.ok) {
      setCursorVerified(null);
      setCursorError(cursorFailureText(result));
      return false;
    }
    setCursorVerified({ name: result.data?.name || "", email: result.data?.email || "" });
    return true;
  }

  async function onCursorSave() {
    setCursorError("");
    setCursorReauth(false);
    const key = cursorKey.trim();
    if (!key) {
      setCursorError(tt("请填入 Cursor API key"));
      return;
    }
    if (!key.startsWith(CURSOR_KEY_PREFIX)) {
      setCursorError(tt("这不是 Cursor 的 API Key（应以 crsr_ 开头）。"));
      return;
    }
    setCursorBusy(true);
    const put = await cursorRequest<ByokStatus>("/v1/cursor/key", {
      method: "PUT",
      body: JSON.stringify({ api_key: key }),
    });
    if (!put.ok) {
      setCursorBusy(false);
      if (put.status === 403 && put.code === "reauth_required") {
        setCursorReauth(true);
        setCursorError(put.error || "为了保护你的钥匙，请重新登录后再添加");
        return;
      }
      setCursorError(cursorFailureText(put));
      return;
    }
    // key 已密封进 cookie；输入框立刻清空，不在内存里多留一刻。
    setCursorKey("");
    if (put.data) setStatus(put.data);
    else await refreshStatus();
    await onCursorVerify();
    setCursorBusy(false);
  }

  async function onCursorRecheck() {
    setCursorError("");
    setCursorBusy(true);
    await onCursorVerify();
    setCursorBusy(false);
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

          <fieldset
            disabled={!status?.enabled || cursorBusy}
            className="mb-3 space-y-3 rounded-2xl border border-neutral-200 p-4"
          >
            <div>
              <h3 className="text-[13px] font-semibold text-neutral-800">
                Cursor
                <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-normal text-neutral-500">
                  {tt("编码 agent，不是聊天模型")}
                </span>
              </h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-500">
                {tt(
                  "这把 key 只用来在 OceanLeo 里启动、追问、查看和取消你自己的 Cursor 编码 agent，花的是你自己的 Cursor 额度，OceanLeo 不扣钱包。它和上面的 key 一样只以加密形式保存在这台设备的浏览器里，服务器不保存、不写日志、响应里也不会出现；要撤销，删掉下方表格里的 Cursor 一行即可。",
                )}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                Cursor API Key
              </label>
              <input
                type="password"
                value={cursorKey}
                onChange={(event) => setCursorKey(event.target.value)}
                placeholder={tt("粘贴 crsr_ 开头的 key")}
                autoComplete="off"
                className={inputClass}
              />
              <a
                href="https://cursor.com/dashboard?tab=integrations"
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[11px] text-blue-600 hover:underline"
              >
                {tt("去 Cursor Dashboard → Integrations → User API Keys 生成 →")}
              </a>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                {tt("在哪里跑")}
              </label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-[13px] text-neutral-700">
                  <input
                    type="radio"
                    name="cursor-runtime"
                    checked={cursorRuntime === "cloud"}
                    onChange={() => setCursorRuntime("cloud")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{tt("云端（Cursor 的机器）")}</span>
                    <span className="block text-[11px] text-neutral-500">
                      {tt(
                        "Cursor 开一台云端机器克隆你的 GitHub 仓库、跑完可自动开 PR。需要你的 Cursor 账号已连通 GitHub 并授权该仓库，否则会被 Cursor 拒绝（ERROR_GITHUB_NO_USER_CREDENTIALS）。",
                      )}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[13px] text-neutral-700">
                  <input
                    type="radio"
                    name="cursor-runtime"
                    checked={cursorRuntime === "local"}
                    onChange={() => setCursorRuntime("local")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{tt("本机（你已配对的电脑）")}</span>
                    <span className="block text-[11px] text-neutral-500">
                      {tt(
                        "通过设备桥在你自己的电脑上跑，文件不离开本机。那台电脑要先装好 Cursor CLI 并登录；这里的 key 不会下发到那台机器。",
                      )}
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {cursorSaved ? (
              <p className="text-[12px] text-neutral-600">
                {cursorVerified ? (
                  <>
                    {tt("已校验：")}
                    <span className="font-medium text-neutral-900">
                      {cursorVerified.name || tt("（未命名 key）")}
                    </span>
                    {cursorVerified.email ? (
                      <span className="text-neutral-500">{` · ${cursorVerified.email}`}</span>
                    ) : null}
                  </>
                ) : (
                  tt("Cursor key 已保存在这台设备。")
                )}
              </p>
            ) : null}

            {cursorError ? <p className="text-[12px] text-rose-600">{cursorError}</p> : null}
            {cursorReauth ? (
              <button
                type="button"
                onClick={onReauth}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] font-medium text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50"
              >
                {tt("重新登录")}
              </button>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!status?.enabled || cursorBusy}
                onClick={onCursorSave}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800 disabled:opacity-50"
              >
                {cursorBusy ? tt("保存中…") : tt("保存并校验")}
              </button>
              {cursorSaved ? (
                <button
                  type="button"
                  disabled={!status?.enabled || cursorBusy}
                  onClick={onCursorRecheck}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-[13px] font-medium text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 disabled:opacity-50"
                >
                  {tt("重新校验")}
                </button>
              ) : null}
            </div>
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
                          {row.provider === CURSOR_PROVIDER
                            ? tt("编码 agent（不用于聊天）")
                            : row.model
                              ? row.model
                              : tt("厂商默认")}
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
