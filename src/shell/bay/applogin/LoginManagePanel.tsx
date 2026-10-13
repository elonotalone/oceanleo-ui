"use client";

import { useEffect, useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import {
  getBayAppLoginClient,
  getBayAppLoginUsers,
  saveBayAppLoginClient,
  type BayAppLoginClient,
} from "../../../lib/bay/app-login";
import { BayRevealForm } from "../form";
import { PaneLoading, Section } from "../supply/parts";
import { errorText, useBayResource } from "../supply/use-bay-resource";
import {
  MAX_REDIRECT_URIS,
  appHostFromUrl,
  loginSampleCode,
  redirectUrisProblem,
  sdkScriptUrl,
  seedRedirectUris,
} from "./login-model";

function CopyRow({
  name,
  label,
  value,
  copied,
  onCopy,
}: {
  name: string;
  label: string;
  value: string;
  copied: string;
  onCopy: (name: string, value: string) => void;
}): ReactElement {
  const tt = useUI();
  return (
    <div data-bay-login-copy-row={name} className="space-y-1.5">
      <p className="text-[12px] font-medium text-neutral-600">{label}</p>
      <code className="block overflow-x-auto rounded-lg bg-neutral-50 px-3 py-2 text-[12px] text-neutral-800">{value}</code>
      <button
        type="button"
        data-bay-login-copy={name}
        onClick={() => onCopy(name, value)}
        className="rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700"
      >
        {copied === name ? tt("已复制") : tt("复制")}
      </button>
    </div>
  );
}

export function LoginManagePanel({ appId }: { appId: string }): ReactElement {
  const tt = useUI();
  const clientRes = useBayResource(appId ? `login-client:${appId}` : null, () => getBayAppLoginClient(appId));
  const usersRes = useBayResource(appId ? `login-users:${appId}` : null, () => getBayAppLoginUsers(appId, 30));
  const [enabled, setEnabled] = useState(false);
  const [uris, setUris] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [copyError, setCopyError] = useState("");
  const [copied, setCopied] = useState("");

  const client = clientRes.data?.client ?? null;

  useEffect(() => {
    if (!client || hydrated === client.app_id) return;
    setEnabled(client.login_enabled);
    setUris(seedRedirectUris(client.app_url, client.redirect_uris));
    setHydrated(client.app_id);
    setFormError("");
  }, [client, hydrated]);

  function applyClient(next: BayAppLoginClient) {
    setEnabled(next.login_enabled);
    setUris(seedRedirectUris(next.app_url, next.redirect_uris));
    setHydrated(next.app_id);
  }

  async function save() {
    if (busy || !client) return;
    const appHost = appHostFromUrl(client.app_url);
    const problem = redirectUrisProblem(uris, appHost, enabled);
    if (problem) {
      setFormError(tt(problem));
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const result = await saveBayAppLoginClient(appId, {
        login_enabled: enabled,
        redirect_uris: uris.map((item) => item.trim()).filter(Boolean),
      });
      applyClient(result.client);
      usersRes.reload();
    } catch (error) {
      setFormError(errorText(error) || tt("登录设置没读出来，请稍后点「重试」。"));
    } finally {
      setBusy(false);
    }
  }

  async function copy(name: string, value: string) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(name);
    } catch {
      setCopyError(tt("没能复制，请手动选中复制"));
    }
  }

  if (clientRes.loading && !client) return <PaneLoading />;
  if (!client) {
    return (
      <div data-bay-login-manage>
        <p className="text-[13px] text-rose-600">{clientRes.error || tt("登录设置没读出来，请稍后点「重试」。")}</p>
        <button type="button" onClick={clientRes.reload} className="mt-2 text-[12px] text-neutral-600 hover:underline">
          {tt("重试")}
        </button>
      </div>
    );
  }

  const opened = Boolean(client.login_enabled && client.client_id);
  const firstUri = (client.redirect_uris[0] || uris[0] || "").trim();
  const sdkUrl = sdkScriptUrl(client.token_url);
  const sample = opened && client.client_id && firstUri ? loginSampleCode(client.client_id, firstUri, sdkUrl) : "";
  const filledUris = uris.map((item) => item.trim()).filter(Boolean);

  return (
    <div data-bay-login-manage className="space-y-5">
      <label className="flex items-start gap-2 text-[13px] text-neutral-800">
        <input
          type="checkbox"
          data-bay-login-enabled
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="mt-0.5"
        />
        <span>{tt("允许访客用 OceanLeo 账号登录这个作品")}</span>
      </label>

      <BayRevealForm
        items={[
          {
            id: "redirects",
            label: tt("回调地址"),
            done: !enabled || filledUris.length > 0,
            optional: !enabled,
            summary: filledUris[0],
            children: (
              <div className="space-y-2">
                {uris.map((uri, index) => (
                  <div key={index} className="flex flex-wrap gap-2">
                    <input
                      data-bay-login-uri={index}
                      value={uri}
                      onChange={(event) => {
                        const next = [...uris];
                        next[index] = event.target.value;
                        setUris(next);
                      }}
                      className="h-10 min-w-0 flex-1 rounded-full border border-neutral-900 bg-white px-3 text-[13px] text-neutral-900 outline-none focus:border-neutral-400"
                    />
                    <button
                      type="button"
                      data-bay-login-uri-remove={index}
                      onClick={() => setUris(uris.filter((_, item) => item !== index))}
                      className="rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700"
                    >
                      {tt("删除")}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  data-bay-login-uri-add
                  disabled={uris.length >= MAX_REDIRECT_URIS}
                  onClick={() => {
                    if (uris.length >= MAX_REDIRECT_URIS) return;
                    setUris([...uris, ""]);
                  }}
                  className="rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60"
                >
                  {tt("添加回调地址")}
                </button>
              </div>
            ),
          },
        ]}
      />

      {formError ? <p data-bay-login-save-error className="text-[12px] text-rose-600">{formError}</p> : null}

      <button
        type="button"
        data-bay-login-save
        disabled={busy}
        onClick={() => void save()}
        className="rounded-full bg-neutral-900 px-3 py-1.5 text-[13px] text-white disabled:opacity-60"
      >
        {busy ? tt("正在保存…") : tt("保存")}
      </button>

      {opened && client.client_id ? (
        <Section title={tt("接入信息")}>
          <div className="space-y-3">
            <CopyRow name="client_id" label="client_id" value={client.client_id} copied={copied} onCopy={(name, value) => void copy(name, value)} />
            <CopyRow name="authorize" label={tt("授权地址")} value={client.authorize_url} copied={copied} onCopy={(name, value) => void copy(name, value)} />
            <CopyRow name="token" label={tt("换凭证地址")} value={client.token_url} copied={copied} onCopy={(name, value) => void copy(name, value)} />
            <CopyRow name="jwks" label={tt("公钥地址")} value={client.jwks_url} copied={copied} onCopy={(name, value) => void copy(name, value)} />
            <CopyRow name="verify" label={tt("校验地址")} value={client.verify_url} copied={copied} onCopy={(name, value) => void copy(name, value)} />
            {copyError ? <p className="text-[12px] text-rose-600">{copyError}</p> : null}
            {sample ? (
              <div>
                <p className="text-[12px] font-medium text-neutral-600">{tt("示例代码")}</p>
                <pre data-bay-login-sample className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-neutral-50 px-3 py-2 text-[12px] text-neutral-800">
                  {sample}
                </pre>
              </div>
            ) : null}
            <p className="text-[12px] leading-5 text-neutral-500">
              {tt("凭证里有用户编号、昵称、头像，以及这个人有没有买 / 订阅这个作品。凭证只能证明身份，不能调用 OceanLeo 的接口。有后台的应用要在服务器上用公钥验签。")}
            </p>
          </div>
        </Section>
      ) : null}

      <Section title={tt("登录用户")}>
        {usersRes.loading && !usersRes.data ? (
          <p className="text-[13px] text-neutral-500">{tt("正在读取登录人数…")}</p>
        ) : usersRes.data ? (
          <p data-bay-login-users className="text-[13px] text-neutral-800">
            {tt("累计 {total} 人 · 近 7 天新增 {new7d} · 近 30 天活跃 {active30d}", {
              total: usersRes.data.total,
              new7d: usersRes.data.new_7d,
              active30d: usersRes.data.active_30d,
            })}
          </p>
        ) : (
          <div>
            <p className="text-[13px] text-rose-600">{usersRes.error || tt("登录人数没读出来，请稍后点「重试」。")}</p>
            <button type="button" onClick={usersRes.reload} className="mt-2 text-[12px] text-neutral-600 hover:underline">
              {tt("重试")}
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}
