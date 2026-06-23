"use client";

// ============================================================================
// @oceanleo/ui — BYOK：自带 API key 管理（账户 → API）
// ----------------------------------------------------------------------------
// 用户填自己的厂商 API key，即可免费使用全家桶服务（用自己的 key、自己的成本，
// OceanLeo 不扣你的钱包）。key 经 AES-256-GCM 加密存储，前端只看得到指纹。
// 一个厂商一把 active key。每个厂商展示它的能力（文本/图片/视频/语音/3D）。
// ============================================================================

import { useEffect, useState } from "react";
import {
  getKeyProviders,
  listUserKeys,
  addUserKey,
  deleteUserKey,
  type ProviderMetaBYOK,
  type UserKey,
} from "../lib/auth";

const CAP_LABEL: Record<string, string> = {
  text: "文本",
  image: "图片",
  video: "视频",
  audio: "语音",
  threed: "3D",
};

export function ByokKeys({ loggedIn }: { loggedIn: boolean }) {
  const [providers, setProviders] = useState<ProviderMetaBYOK[]>([]);
  const [keys, setKeys] = useState<UserKey[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getKeyProviders().then((r) => {
      if (r.ok && r.data) {
        setProviders(r.data.providers || []);
        if (!provider && r.data.providers?.length) setProvider(r.data.providers[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    listUserKeys().then((r) => {
      if (r.ok && r.data) setKeys(r.data.keys || []);
    });
  }, [loggedIn]);

  const selected = providers.find((p) => p.id === provider);
  const needsBaseUrl = !!selected?.needs_base_url;

  async function submit() {
    setError("");
    if (!apiKey.trim()) {
      setError("请填入 API key");
      return;
    }
    if (needsBaseUrl && !baseUrl.trim()) {
      setError("自定义厂商需要填写 base_url");
      return;
    }
    setBusy(true);
    const r = await addUserKey({
      provider,
      api_key: apiKey.trim(),
      base_url: needsBaseUrl ? baseUrl.trim() : undefined,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "添加失败");
      return;
    }
    setApiKey("");
    setBaseUrl("");
    setOpen(false);
    const list = await listUserKeys();
    if (list.ok && list.data) setKeys(list.data.keys || []);
  }

  async function remove(id: string) {
    const r = await deleteUserKey(id);
    if (r.ok) setKeys((ks) => ks.filter((k) => k.id !== id));
  }

  function labelOf(pid: string): string {
    return providers.find((p) => p.id === pid)?.name || pid;
  }

  return (
    <section className="v-fade-up" style={{ animationDelay: "30ms" }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-neutral-900">
          自带 API key（BYOK）
          <span className="ml-2 text-[11px] font-normal text-neutral-400">
            填你自己的厂商 key，免费使用全家桶（不扣钱包）
          </span>
        </h2>
        {loggedIn && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-neutral-800"
          >
            {open ? "取消" : "+ 添加 key"}
          </button>
        )}
      </div>

      {!loggedIn ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-[13px] text-neutral-500">
          登录后即可添加你自己的 API key，免费使用 OceanLeo 全家桶。
        </div>
      ) : (
        <>
          {open && (
            <div className="mb-3 space-y-3 rounded-2xl border border-neutral-200 p-4">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                  厂商
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-neutral-400"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {selected && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(selected.capabilities || []).map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700"
                      >
                        {CAP_LABEL[c] || c}
                      </span>
                    ))}
                    {selected.key_help_url && (
                      <a
                        href={selected.key_help_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-600 hover:underline"
                      >
                        如何获取该厂商的 key ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                  API key
                  {selected?.key_prefix && (
                    <span className="ml-1 font-normal text-neutral-400">
                      （通常以 {selected.key_prefix} 开头）
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={selected?.key_prefix ? `${selected.key_prefix}…` : "粘贴你的 API key"}
                  autoComplete="off"
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-neutral-400"
                />
              </div>
              {needsBaseUrl && (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                    base_url（OpenAI 兼容端点）
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://…/v1"
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-neutral-400"
                  />
                </div>
              )}
              {error && <p className="text-[12px] text-rose-600">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={submit}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
                >
                  {busy ? "保存中…" : "保存 key"}
                </button>
                <span className="text-[11px] text-neutral-400">
                  key 会加密存储，我们只保留指纹，绝不回显明文。
                </span>
              </div>
            </div>
          )}

          {keys.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-[13px] text-neutral-500">
              还没有添加任何 key。添加后，对应厂商的调用将用你的 key、免费进行。
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-neutral-200">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">厂商</th>
                    <th className="px-3 py-2 font-medium">指纹</th>
                    <th className="px-3 py-2 font-medium">添加时间</th>
                    <th className="px-3 py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {keys.map((k) => (
                    <tr key={k.id} className="text-neutral-700">
                      <td className="px-3 py-2.5 font-medium text-neutral-900">
                        {labelOf(k.provider)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-neutral-500">
                        {k.fingerprint}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-neutral-500">
                        {k.created_at
                          ? new Date(k.created_at).toLocaleDateString("zh-CN")
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => remove(k.id)}
                          className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-rose-600 transition hover:bg-rose-50"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-neutral-400">
            用你自己的 key 调用全程免费，仍会记录用量与审计内容，方便你核对自己的 token 开销。
          </p>
        </>
      )}
    </section>
  );
}
