"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocale } from "../../i18n/useT.client";
import { AUTH_STATE_EVENT, getUserId } from "../../lib/auth/client";
import {
  createVaultSecret, deleteVaultSecret, getVault, getVaultReferences, getVaultSealKey,
  safeVaultFingerprint, updateVaultSecret, vaultMutationWasCommitted, VaultApiError,
  type VaultKind, type VaultManagedCredentials, type VaultReference, type VaultSecret, type VaultStatus,
} from "../../lib/vault-api";
import { sealVaultValue } from "../../lib/vault-seal";

const FIELD = "w-full rounded-lg border border-neutral-200 bg-transparent px-3 py-2 text-[13px] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-neutral-700";
const QUIET = "rounded-lg border border-neutral-200 px-3 py-1.5 text-[13px] transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";
const PRIMARY = "rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900";

/** Shared by the two vault surfaces; callers supply prose in both supported fallbacks. */
export function useVaultText() {
  const locale = useLocale();
  const chinese = locale.toLowerCase().startsWith("zh");
  return useCallback((zh: string, en: string) => chinese ? zh : en, [chinese]);
}

export function vaultPurposeLabel(reference: Pick<VaultReference, "purpose" | "scope">, text: (zh: string, en: string) => string): string {
  switch (reference.purpose) {
    case "runtime_env": return text("运行环境", "Runtime environment");
    case "build_env": return text("构建环境", "Build environment");
    case "provider_secret": return text("服务连接", "Service connection");
    case "legacy_development": return text("旧版开发环境", "Legacy development environment");
    case "db_export": return text("数据库导出", "Database export");
    case "db_transfer": return text("数据库迁移", "Database transfer");
    case "user_connector": return reference.scope === "project_connector" ? text("网站服务授权", "Website service grant") : text("账号连接凭据", "Account connector credential");
    case "supabase_provision_password": return text("Supabase 服务凭据", "Supabase service credential");
    default: return reference.scope === "browser" ? text("浏览器登录或表单填入", "Browser sign-in / form fill") : text("已授权用途", "Granted purpose");
  }
}

export function vaultReferenceSlotLabel(slot: VaultReference["slot"], text: (zh: string, en: string) => string): string {
  return slot === "database" ? text("数据库", "Database") : slot === "auth" ? text("用户登录", "User sign-in") : slot === "storage" ? text("文件存储", "File storage") : text("服务", "Service");
}

export function vaultCommittedNotice(text: (zh: string, en: string) => string): string {
  return text("保险箱变更已保存，但运行环境的恢复尚未确认。请检查网站运行状态，并刷新查看最新密钥或授权；不要重复提交这次变更。", "Your vault change was saved, but runtime recovery could not be confirmed. Check the website runtime status and refresh the current vault details; do not submit the change again.");
}

export function vaultErrorText(cause: unknown, text: (zh: string, en: string) => string): string {
  switch (cause instanceof VaultApiError ? cause.code : "unavailable") {
    case "signed_out": return text("登录状态已失效，请重新登录。", "Your session has ended. Sign in again.");
    case "reauth_required": return text("为保护密钥，请重新登录后再操作。", "Sign in again to confirm this vault change.");
    case "disabled": return text("你连接的服务尚未启用保险箱。", "Vault is not enabled on your connected service.");
    case "forbidden": return text("你没有权限修改这个保险箱。", "You do not have permission to change this vault.");
    case "not_found": return text("保险箱项目或引用已不存在，请刷新。", "This item or reference is no longer available. Refresh to continue.");
    case "invalid": return text("填写的内容不符合要求，请检查后重试。", "Check the fields and try again.");
    case "conflict": return text("名称已存在或配置已经改变，请刷新后重试。", "The name already exists or the configuration changed. Refresh and try again.");
    case "quota": return text("保险箱已达到容量上限。", "Your vault has reached its item limit.");
    case "rate_limited": return text("操作太频繁，请稍后重试。", "Too many requests. Try again shortly.");
    case "network": return text("暂时连不上保险箱，请检查网络后重试。", "Cannot reach the vault. Check your connection and try again.");
    case "mutation_committed_runtime_unavailable": return vaultCommittedNotice(text);
    default: return text("保险箱操作未完成，请稍后重试。", "The vault operation could not be completed. Try again.");
  }
}

export function VaultSettingsSection({ accent }: { accent?: string } = {}) {
  const text = useVaultText();
  const [identity, setIdentity] = useState<{ loading: boolean; uid: string | null }>({ loading: true, uid: null });
  useEffect(() => {
    let active = true;
    let generation = 0;
    const readIdentity = async () => {
      const current = ++generation;
      // Unmount any secret editor while the active account is being resolved.
      setIdentity({ loading: true, uid: null });
      let uid: string | null = null;
      try { uid = await getUserId(); } catch { /* Show the signed-out state. */ }
      if (active && current === generation) setIdentity({ loading: false, uid });
    };
    void readIdentity();
    window.addEventListener(AUTH_STATE_EVENT, readIdentity);
    return () => { active = false; window.removeEventListener(AUTH_STATE_EVENT, readIdentity); };
  }, []);
  if (identity.loading) return <p role="status" className="text-[13px] text-neutral-500">{text("正在读取保险箱…", "Loading vault…")}</p>;
  if (!identity.uid) return <p role="status" className="text-[13px] text-neutral-500">{text("登录后可管理你的保险箱。", "Sign in to manage your vault.")}</p>;
  return <SignedInVault key={identity.uid} uid={identity.uid} accent={accent} />;
}

function SignedInVault({ uid, accent }: { uid: string; accent?: string }) {
  const text = useVaultText();
  const latestText = useRef(text);
  latestText.current = text;
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [references, setReferences] = useState<VaultReference[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [committed, setCommitted] = useState(false);
  const [editor, setEditor] = useState<{ secret?: VaultSecret } | null>(null);
  const [deleting, setDeleting] = useState<VaultSecret | null>(null);
  const active = useRef(true);
  const operation = useRef(false);
  const lifetime = useRef<AbortController | null>(null);

  const refresh = useCallback(async (signal: AbortSignal) => {
    const next = await getVault(signal);
    if (signal.aborted) return;
    setStatus(next);
    setReferences(null);
    if (next.enabled) {
      const usage = await getVaultReferences(signal);
      if (!signal.aborted) setReferences(usage.references);
    } else setReferences([]);
  }, []);

  // A label change must not replace the controller of a pending vault write.
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    active.current = true;
    void refresh(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(vaultErrorText(cause, latestText.current));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { active.current = false; controller.abort(); };
  }, [refresh]);

  async function recoverCommitted(signal: AbortSignal) {
    if (signal.aborted) return;
    setCommitted(true); setNotice(""); setError("");
    setEditor(null); setDeleting(null); setStatus(null); setReferences(null);
    try { await refresh(signal); }
    catch { if (!signal.aborted) setError(latestText.current("变更已保存，暂时无法读取最新保险箱。请刷新。", "The change was saved, but current vault details are unavailable. Refresh to check.")); }
  }

  async function act(work: (signal: AbortSignal) => Promise<unknown>) {
    const signal = lifetime.current?.signal;
    if (operation.current || !signal || signal.aborted) return;
    operation.current = true;
    setBusy(true); setError(""); setNotice("");
    try { await work(signal); await refresh(signal); }
    catch (cause) {
      if (!signal.aborted) {
        if (vaultMutationWasCommitted(cause)) await recoverCommitted(signal);
        else setError(vaultErrorText(cause, latestText.current));
      }
    }
    finally { if (lifetime.current?.signal === signal) { operation.current = false; if (!signal.aborted) setBusy(false); } }
  }

  function kindLabel(kind: VaultKind) {
    return kind === "api_key" ? text("API 密钥 / 令牌", "API key / token") : kind === "password" ? text("密码", "Password") : text("私密文本 / 服务引用", "Private text / service reference");
  }

  return <section data-settings-pane="vault" aria-label={text("保险箱", "Vault")} aria-busy={loading || busy} className="space-y-4 text-[13px] text-neutral-700 dark:text-neutral-300">
    <p className="leading-relaxed text-neutral-500">{text("把密钥保存在主保险箱，再给网站、应用或浏览器授权引用。更新后引用使用新版本，agent 只能看到名称和用途。", "Save secrets in your main vault, then grant references to websites, apps or browsers. References follow rotations; agents receive only names and purposes.")}</p>
    <p className="text-[12px] text-neutral-500">{text("银行卡仅使用支付服务提供的令牌引用；不要填写卡号或安全码。", "For cards, use a payment provider token reference. Do not enter card numbers or security codes.")}</p>
    {loading && <p role="status">{text("正在读取保险箱…", "Loading vault…")}</p>}
    {error && <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-red-700 dark:bg-red-950/30">
      <p>{error}</p><button type="button" disabled={busy} className={QUIET} onClick={() => void act(async () => {})}>{text("刷新", "Refresh")}</button>
    </div>}
    {notice && <p role="status" className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800">{notice}</p>}
    {committed && <div data-vault-committed="" role="status" className="space-y-2 rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><p>{vaultCommittedNotice(text)}</p><button type="button" disabled={busy} className={QUIET} onClick={() => void act(async () => {})}>{text("刷新", "Refresh")}</button></div>}
    {status?.migration_pending && <div role="status" className="space-y-2 rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <p>{status.migration_pending === "quota"
        ? text("保险箱已满，部分已连接的密钥还在等待迁入。现有项目仍可管理，移除不再需要的项目后可重试。", "Your vault is full, so some connected credentials are waiting to be imported. You can still manage existing items. Remove an unused item and retry.")
        : text("部分已连接的密钥稍后才能迁入。现有项目仍可管理，请稍后刷新。", "Some connected credentials are waiting to be imported. You can still manage existing items. Refresh again shortly.")}</p>
      <button type="button" disabled={busy} className={QUIET} onClick={() => void act(async () => {})}>{text("刷新", "Refresh")}</button>
    </div>}
    {status && !status.enabled && <p role="status" className="rounded-2xl border border-dashed border-neutral-200 p-5 dark:border-neutral-700">{text("你连接的服务尚未启用保险箱，当前不能保存或授权密钥。", "Vault is not enabled on your connected service. Saving and granting secrets are unavailable.")}</p>}
    {status?.enabled && <>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-medium text-neutral-900 dark:text-neutral-100">{text("保险箱项目", "Vault items")} <span className="font-normal text-neutral-500">{status.secrets.length}/{status.limits.max_secrets}</span></h3>
        <button type="button" className={QUIET} disabled={busy || loading || !!editor || status.secrets.length >= status.limits.max_secrets} onClick={() => { setEditor({}); setDeleting(null); setError(""); }}>{text("添加", "Add item")}</button>
      </div>
      {status.secrets.length >= status.limits.max_secrets && <p role="status" className="text-neutral-500">{text("保险箱已达到容量上限。", "Your vault has reached its item limit.")}</p>}
      {editor && <SecretEditor key={editor.secret?.id || "new"} uid={uid} secret={editor.secret} accent={accent} maxValueBytes={status.limits.max_value_bytes}
        onClose={() => setEditor(null)} onSaving={setBusy} onSaved={async () => {
          const signal = lifetime.current?.signal;
          setEditor(null);
          if (signal && !signal.aborted) await refresh(signal);
        }} onError={async (cause) => {
          const signal = lifetime.current?.signal;
          if (!active.current || !signal || signal.aborted) return;
          if (vaultMutationWasCommitted(cause)) await recoverCommitted(signal);
          else setError(vaultErrorText(cause, latestText.current));
        }} />}
      {!status.secrets.length && !loading && <p className="rounded-2xl border border-dashed border-neutral-200 p-5 text-center text-neutral-500 dark:border-neutral-700">{text("还没有项目。先添加密钥，再从网站的小保险箱选择它。", "No items yet. Add a secret, then select it from a website’s small vault.")}</p>}
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {status.secrets.map((secret) => <article key={secret.id} data-vault-item={secret.id} className="space-y-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h4 className="break-words font-medium text-neutral-900 dark:text-neutral-100">{secret.name}</h4>
              <p className="text-[12px] text-neutral-500">{kindLabel(secret.kind)} · {text("版本", "Version")} {secret.version} {safeVaultFingerprint(secret.kind, secret.fingerprint) && <code className="ml-2">{safeVaultFingerprint(secret.kind, secret.fingerprint)}</code>}</p>
              {secret.kind === "password" && secret.username && <p className="break-all text-neutral-500">{text("用户名", "Username")}: {secret.username}</p>}
              {secret.description && <p className="break-words text-neutral-500">{secret.description}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className={QUIET} disabled={busy || !!editor} onClick={() => { setEditor({ secret }); setDeleting(null); setError(""); }}>{text("更新密钥", "Rotate")}</button>
              <button type="button" className={`${QUIET} text-red-600`} disabled={busy || !!editor} onClick={() => setDeleting(secret)}>{text("删除", "Delete")}</button>
            </div>
          </div>
          {secret.needs_reentry && <p role="status" className="text-amber-700">{text("此项目需要重新输入密钥，现有引用暂时不能使用。", "Re-enter this secret before its references can be used.")}</p>}
          <div className="space-y-1 text-[12px] text-neutral-500">
            <p className="font-medium">{text("使用位置", "Used by")}</p>
            {references === null ? <p>{text("引用列表暂未确认，请刷新后查看。", "Usage references are not confirmed yet. Refresh to check.")}</p> : <>
              {!references.some((ref) => ref.secret_id === secret.id) && !secret.machines?.length && <p>{text("尚未授权给任何网站、应用或电脑。", "Not granted to any website, app or computer.")}</p>}
              <ul className="space-y-1">
                {references.filter((ref) => ref.secret_id === secret.id).map((ref) => <li key={ref.id} data-vault-used-by={ref.id} className="break-all">
                  {ref.purpose === "supabase_provision_password" ? text("服务", "Service") : ref.scope === "browser" ? text("浏览器", "Browser") : ref.scope === "connector" ? text("连接器", "Connector") : ref.scope === "project_connector" ? text("网站服务", "Website service") : text("网站 / 应用", "Website / app")} · {ref.project_id || text("账号", "Account")} · {vaultPurposeLabel(ref, text)}
                  {ref.origin && <> · <code>{ref.origin}</code></>}
                  {ref.scope === "browser" && ref.purpose !== "supabase_provision_password" && <> · {text("用途", "Purpose")}: <code>{ref.purpose}</code></>}
                  {(ref.scope === "connector" || ref.scope === "project_connector") && typeof ref.binding?.provider === "string" && <> · {ref.binding.provider}</>}
                  {ref.scope === "project_connector" && <> · {vaultReferenceSlotLabel(ref.slot, text)}</>}
                  {ref.env_name && <> · <code>{ref.env_name}</code></>}
                  {(ref.scope === "project" || ref.scope === "project_connector") && <> · {ref.environment === "production" ? text("生产", "Production") : text("预览", "Preview")}</>}
                </li>)}
              </ul>
            </>}
            {secret.machines?.map((machine) => <p key={machine.computer_id} className="break-words">{text("电脑", "Computer")} · {machine.computer_name || machine.computer_id} · {machine.grant === "approved" ? text("已授权", "Granted") : machine.grant === "pending" ? text("等待授权", "Awaiting approval") : text("未授权", "Not granted")}</p>)}
          </div>
          {deleting?.id === secret.id && <div role="alert" className="space-y-3 rounded-xl border border-red-200 p-4 dark:border-red-900">
            <p>{text("删除主项目会让所有引用失效，并从使用它的运行环境中移除。此操作不能撤销。", "Deleting this main item invalidates every reference and removes it from runtimes using it. This cannot be undone.")}</p>
            <div className="flex gap-2"><button type="button" className={`${QUIET} text-red-600`} disabled={busy} onClick={() => void act(async (signal) => {
              await deleteVaultSecret(secret.id, signal);
              if (!signal.aborted) {
                setStatus((current) => current ? { ...current, secrets: current.secrets.filter((item) => item.id !== secret.id) } : current);
                setDeleting(null); setNotice(text("项目已删除，相关引用已失效。", "Item deleted. Its references have been revoked."));
              }
            })}>{text("确认删除", "Delete item")}</button><button type="button" className={QUIET} disabled={busy} onClick={() => setDeleting(null)}>{text("取消", "Cancel")}</button></div>
          </div>}
        </article>)}
      </div>
    </>}
    {status && <ManagedCredentialsSection summary={status.managed_credentials} />}
  </section>;
}

function ManagedCredentialsSection({ summary }: { summary?: VaultManagedCredentials }) {
  const text = useVaultText();
  const items = Array.isArray(summary?.items) ? summary.items : [];
  const available = summary?.available === true && Array.isArray(summary.items) && items.length <= 1000
    && items.every((item) => item && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 64
      && typeof item.label === "string" && item.label.length > 0 && item.label.length <= 200
      && typeof item.auth_kind === "string" && typeof item.enabled === "boolean"
      && (item.expires_at === undefined || (typeof item.expires_at === "string"
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(item.expires_at)
        && Number.isFinite(Date.parse(item.expires_at)))));
  const kindLabel = (kind: string) => {
    switch (kind) {
      case "oauth": return text("OAuth 登录授权", "OAuth sign-in");
      case "token": case "bearer": case "header": return text("令牌 / API 密钥", "Token / API key");
      case "url": return text("专用服务地址", "Personal service URL");
      case "url+token": return text("专用服务地址与令牌", "Personal service URL and token");
      case "none": return text("无需凭据的连接", "Connection without credentials");
      default: return text("连接器授权", "Connector authorization");
    }
  };

  return <section data-vault-managed-credentials="" aria-label={text("已连接服务", "Connected services")} className="space-y-3 border-t border-neutral-200 pt-5 dark:border-neutral-700">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-[14px] font-medium text-neutral-900 dark:text-neutral-100">{text("已连接服务", "Connected services")}</h3>
      <a href="/settings/connectors" className={`${QUIET} inline-block`} onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        // Load only on navigation: importing the Settings shell eagerly would
        // enlarge this page and break isolated vault consumers.
        void import("./settings-tabs").then(({ openSettingsModal }) => openSettingsModal("connectors"))
          .catch(() => { window.location.href = "/settings/connectors"; });
      }}>{text("在连接器中管理", "Managed in Connectors")}</a>
    </div>
    <p className="text-[12px] leading-relaxed text-neutral-500">{text("这些个人 MCP 授权由连接器管理，可在那里检查、重新连接或移除；这里不能把它们选入网站小保险箱。", "These personal MCP authorizations are managed in Connectors, where you can check, reconnect or remove them. They cannot be selected for website vaults here.")}</p>
    {!available ? <p role="status" className="text-[12px] text-neutral-500">{text("暂时无法读取已连接服务。主保险箱项目仍可正常管理。", "Connected services are temporarily unavailable. You can still manage your main vault items.")}</p>
      : !items.length ? <p className="text-[12px] text-neutral-500">{text("还没有保存的个人 MCP 授权。", "No personal MCP authorizations are saved.")}</p>
        : <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">{items.map((item) => <li key={item.id} data-vault-managed-credential={item.id} className="space-y-1 py-3">
          <p className="break-words font-medium text-neutral-900 dark:text-neutral-100">{item.label}</p>
          <p className="text-[12px] text-neutral-500">{kindLabel(item.auth_kind)} · {item.enabled ? text("已启用", "Enabled") : text("已停用", "Disabled")}</p>
          {item.expires_at && <p className="text-[12px] text-neutral-500">{text("已保存的到期时间", "Saved expiry")}: <time dateTime={item.expires_at}>{item.expires_at}</time></p>}
          {item.auth_kind === "oauth" && <p className="text-[12px] text-neutral-500">{text("OAuth 登录可自动续期；已保存的到期时间不代表需要重新授权。", "OAuth sign-ins may refresh automatically; a saved expiry does not mean reauthorization is required.")}</p>}
        </li>)}</ul>}
  </section>;
}

function SecretEditor({ uid, secret, maxValueBytes, accent, onClose, onSaved, onSaving, onError }: {
  uid: string; secret?: VaultSecret; maxValueBytes: number; accent?: string;
  onClose: () => void; onSaved: () => Promise<void>; onSaving: (saving: boolean) => void; onError: (cause: unknown) => Promise<void>;
}) {
  const text = useVaultText();
  const id = useId();
  const [name, setName] = useState(secret?.name || "");
  const [kind, setKind] = useState<VaultKind>(secret?.kind || "api_key");
  const [username, setUsername] = useState(secret?.username || "");
  const [description, setDescription] = useState(secret?.description || "");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);

  function close() {
    controller.current?.abort();
    setValue("");
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    // Take an ephemeral copy, then clear the controlled field before validation,
    // network or crypto can fail. Never restore a rejected secret.
    let pendingValue = value;
    setValue("");
    const validationBytes = new TextEncoder().encode(pendingValue);
    const length = validationBytes.length;
    validationBytes.fill(0);
    if (!name.trim() || !length || length > Math.min(maxValueBytes, 12000) || pendingValue.includes("\0")) {
      pendingValue = ""; setInvalid(true); return;
    }
    saving.current = true;
    setBusy(true); onSaving(true); setInvalid(false);
    const current = new AbortController();
    controller.current = current;
    try {
      const metadata = { name: name.trim(), username: kind === "password" ? username : "", description };
      const key = await getVaultSealKey(current.signal);
      const sealed = await sealVaultValue(key, { uid, op: secret ? "update" : "create", name: metadata.name, sid: secret?.id }, pendingValue);
      pendingValue = "";
      if (current.signal.aborted) return;
      if (secret) await updateVaultSecret(secret.id, { ...metadata, sealed }, current.signal);
      else await createVaultSecret({ ...metadata, kind, sealed }, current.signal);
      if (!current.signal.aborted) await onSaved();
    } catch (cause) {
      if (!current.signal.aborted && mounted.current) await onError(cause);
    } finally {
      pendingValue = ""; saving.current = false; onSaving(false);
      if (mounted.current) setBusy(false);
    }
  }

  return <form onSubmit={submit} autoComplete="off" aria-label={secret ? text("更新密钥", "Rotate secret") : text("添加保险箱项目", "Add vault item")} aria-busy={busy} className="space-y-4 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-700">
    <h3 className="text-[14px] font-medium text-neutral-900 dark:text-neutral-100">{secret ? text("更新密钥", "Rotate secret") : text("添加保险箱项目", "Add vault item")}</h3>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block space-y-1" htmlFor={`${id}-name`}><span>{text("名称", "Name")}</span><input id={`${id}-name`} className={FIELD} value={name} onChange={(event) => setName(event.target.value)} maxLength={64} readOnly={!!secret} required /></label>
      <label className="block space-y-1" htmlFor={`${id}-kind`}><span>{text("类型", "Type")}</span><select id={`${id}-kind`} className={FIELD} value={kind} disabled={!!secret} onChange={(event) => { setKind(event.target.value as VaultKind); setValue(""); }}>
        <option value="api_key">{text("API 密钥 / 令牌", "API key / token")}</option><option value="password">{text("密码", "Password")}</option><option value="text">{text("私密文本 / 服务引用", "Private text / service reference")}</option>
      </select></label>
      {kind === "password" && <label className="block space-y-1" htmlFor={`${id}-username`}><span>{text("用户名", "Username")}</span><input id={`${id}-username`} className={FIELD} autoComplete="off" value={username} maxLength={200} onChange={(event) => setUsername(event.target.value)} /></label>}
      <label className="block space-y-1" htmlFor={`${id}-value`}><span>{secret ? text("新密钥值", "New secret value") : text("密钥值", "Secret value")}</span>
        <input id={`${id}-value`} type="password" className={FIELD} value={value} onChange={(event) => setValue(event.target.value)} autoComplete="new-password" autoCapitalize="off" spellCheck={false} aria-invalid={invalid} aria-describedby={`${id}-hint`} required />
      </label>
      <p id={`${id}-hint`} className="text-[12px] leading-relaxed text-neutral-500">{text("只在此输入，浏览器密封后保存；提交或取消后立即清空，保存后无法查看原值。", "Entered here only, sealed in your browser before saving, and cleared on submit or cancel. Saved values cannot be displayed.")}</p>
      {secret && <p className="text-[12px] text-neutral-500">{text("所有引用会使用更新后的版本，无需重新添加到各个网站。", "Every reference follows the new version; you do not need to add it to each website again.")}</p>}
      {invalid && <p role="alert" className="text-red-600">{text("密钥不能为空、不能含空字符，且不能超过", "The value must be nonempty, contain no NUL and be at most")} {Math.min(maxValueBytes, 12000)} {text("字节。请重新输入。", "bytes. Enter it again.")}</p>}
      <label className="block space-y-1" htmlFor={`${id}-description`}><span>{text("说明（不要填写秘密）", "Description (no secrets)")}</span><input id={`${id}-description`} className={FIELD} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} /></label>
      <div className="flex gap-2"><button type="submit" className={PRIMARY} style={accent ? { backgroundColor: accent } : undefined} disabled={!value || !name.trim()}>{busy ? text("保存中…", "Saving…") : text("保存", "Save")}</button><button type="button" className={QUIET} onClick={close}>{text("取消", "Cancel")}</button></div>
    </fieldset>
  </form>;
}
