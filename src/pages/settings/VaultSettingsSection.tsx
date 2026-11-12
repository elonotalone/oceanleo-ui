"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocale } from "../../i18n/useT.client";
import { AUTH_STATE_EVENT, getUserId } from "../../lib/auth/client";
import {
  createVaultBrowserBinding, createVaultSecret, deleteVaultBrowserBinding, deleteVaultSecret, getVault, getVaultFenceStatus, getVaultProjectNames, getVaultReferences, getVaultSealKey, checkVaultWriteAccess, recoverVault,
  normalizeVaultBrowserOrigin, safeVaultFingerprint, updateVaultSecret, vaultFenceState, vaultMutationWasCommitted, VaultApiError,
  type VaultFenceRow, type VaultKind, type VaultRecovery, type VaultReference, type VaultSecret, type VaultStatus,
} from "../../lib/vault-api";
import { AuthPanel } from "../AuthDialog";
import { sealVaultValue } from "../../lib/vault-seal";

export type VaultPrefill = { name?: string; kind?: string; target?: string };

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
    case "browser_login": return text("浏览器登录", "Browser sign-in");
    default: return reference.scope === "browser" ? text("浏览器登录或表单填入", "Browser sign-in / form fill") : text("已授权用途", "Granted purpose");
  }
}

export function vaultReferenceSlotLabel(slot: VaultReference["slot"], text: (zh: string, en: string) => string): string {
  return slot === "database" ? text("数据库", "Database") : slot === "auth" ? text("用户登录", "User sign-in") : slot === "storage" ? text("文件存储", "File storage") : text("服务", "Service");
}

export function vaultCommittedNotice(text: (zh: string, en: string) => string): string {
  return text("保险箱变更已保存，但运行环境的恢复尚未确认。请检查网站运行状态，并刷新查看最新密钥或授权；不要重复提交这次变更。", "Your vault change was saved, but runtime recovery could not be confirmed. Check the website runtime status and refresh the current vault details; do not submit the change again.");
}

export function vaultFenceText(text: (zh: string, en: string) => string, site = false): string {
  return site
    ? text("上一次密钥变更还没有确认完成。为安全起见，此网站已暂停使用新密钥，系统会自动核对。", "Your last vault change has not been confirmed yet. For safety, this website is not using the new secret yet; the system is checking automatically.")
    : text("上一次密钥变更还没有确认完成。为安全起见，相关网站已暂停使用新密钥，系统会自动核对。", "Your last vault change has not been confirmed yet. For safety, affected websites are not using the new secret yet; the system is checking automatically.");
}

/** `readyAt` is a local clock deadline; `null` means recovery may start now. */
export type VaultFence = { state: "settling" | "uncertain"; readyAt: number | null };

function fenceFromRows(rows: Array<Pick<VaultFenceRow, "state" | "retry_after">>): VaultFence | null {
  if (!rows.length) return null;
  const wait = Math.max(0, ...rows.map((row) => row.retry_after));
  return { state: rows.some((row) => row.state === "uncertain") ? "uncertain" : "settling", readyAt: wait ? Date.now() + wait * 1000 : null };
}

/**
 * Fence state for one owner (no projectId) or one website. Callers pass their
 * own lifetime signal, so a label change never aborts or replaces a pending write.
 */
export function useVaultFence(projectId?: string) {
  const [fence, setFenceState] = useState<VaultFence | null>(null);
  const generation = useRef(0);
  const relevant = useCallback((row: { scope?: string; project_id: string | null }) =>
    projectId === undefined || row.scope === "owner" || row.project_id === projectId, [projectId]);
  const setFence = useCallback((next: VaultFence | null) => { generation.current += 1; setFenceState(next); }, []);
  // Status only ever adds a notice: an older gateway (404/503) or a failed read shows nothing extra.
  const checkFence = useCallback(async (signal: AbortSignal) => {
    const current = generation.current;
    let rows: VaultFenceRow[] = [];
    try { rows = (await getVaultFenceStatus(signal))?.fences.filter(relevant) ?? []; } catch { /* Unknown. */ }
    if (!signal.aborted && current === generation.current && rows.length) setFence(fenceFromRows(rows));
  }, [relevant, setFence]);
  const noteFence = useCallback(async (cause: unknown, signal: AbortSignal) => {
    const state = vaultFenceState(cause);
    if (!state || signal.aborted) return;
    const wait = cause instanceof VaultApiError ? cause.retryAfter : null;
    setFence({ state, readyAt: wait ? Date.now() + wait * 1000 : null });
    if (wait === null) await checkFence(signal);
  }, [checkFence, setFence]);
  /** Apply a recovery result; returns the restart count relevant to this surface. */
  const settle = useCallback((recovery: VaultRecovery) => {
    setFence(fenceFromRows(recovery.pending.filter((row) => relevant({ project_id: row.project_id }))
      .map((row) => ({ state: "held" as const, retry_after: row.retry_after }))));
    return new Set(recovery.runtime_restart_required.filter((id) => relevant({ project_id: id }))).size;
  }, [relevant, setFence]);
  return { fence, setFence, checkFence, noteFence, settle };
}

export function vaultRecoveredNotice(restart: number, pending: boolean, text: (zh: string, en: string) => string, site = false): string {
  const done = pending ? "" : text("已恢复。", "Recovered.");
  const rerun = !restart ? "" : site
    ? text("此网站需要重新启动后才会使用最新密钥。", "Restart this website to use the latest secret.")
    : text(`有 ${restart} 个网站需要重新启动后才会使用最新密钥。`, `${restart} ${restart === 1 ? "website needs" : "websites need"} a restart to use the latest secret.`);
  return [done, rerun].filter(Boolean).join(text("", " "));
}

/** One countdown timer per notice; it is cleared on unmount or when the deadline changes. */
export function VaultFenceNotice(props: { fence: VaultFence; busy: boolean; site?: boolean; className: string; onRecover: () => void; text: (zh: string, en: string) => string }) {
  return <FenceNoticeBody key={props.fence.readyAt ?? 0} {...props} />;
}

function FenceNoticeBody({ fence, busy, site, className, onRecover, text }: Parameters<typeof VaultFenceNotice>[0]) {
  const [now, setNow] = useState(() => Date.now());
  const remaining = fence.readyAt === null ? 0 : Math.max(0, fence.readyAt - now);
  useEffect(() => {
    if (remaining <= 0) return;
    // Wake when the displayed minute changes, or at the deadline.
    const timer = window.setTimeout(() => setNow(Date.now()), remaining % 60000 || 60000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
  const minutes = Math.max(1, Math.ceil(remaining / 60000));
  return <div data-vault-fence={fence.state} role="status" className="space-y-2 rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
    <p>{vaultFenceText(text, site)}</p>
    {remaining > 0 && <p className="text-[12px]">{text(`约 ${minutes} 分钟后可恢复`, `Recovery available in about ${minutes} min`)}</p>}
    <button type="button" disabled={busy || remaining > 0} className={className} onClick={onRecover}>{text("恢复", "Recover")}</button>
  </div>;
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
    case "fence_settling": case "fence_uncertain": return vaultFenceText(text);
    case "fence_busy": return text("另一项保险箱变更正在进行，请稍后重试。", "Another vault change is in progress. Try again shortly.");
    default: return text("保险箱操作未完成，请稍后重试。", "The vault operation could not be completed. Try again.");
  }
}

export function VaultSettingsSection({ accent, prefill }: { accent?: string; prefill?: VaultPrefill } = {}) {
  const text = useVaultText();
  const [identity, setIdentity] = useState<{ loading: boolean; uid: string | null }>({ loading: true, uid: null });
  useEffect(() => {
    let active = true;
    let generation = 0;
    let currentUid: string | null = null;
    const readIdentity = async (event?: Event) => {
      // A fresh session for this owner must not discard an encrypted pending save.
      const detail = (event as CustomEvent<{ userId?: string | null }> | undefined)?.detail;
      if (detail?.userId && detail.userId === currentUid) return;
      const current = ++generation;
      // Unmount any secret editor while the active account is being resolved.
      setIdentity({ loading: true, uid: null });
      let uid: string | null = null;
      try { uid = await getUserId(); } catch { /* Show the signed-out state. */ }
      if (active && current === generation) { currentUid = uid; setIdentity({ loading: false, uid }); }
    };
    void readIdentity();
    window.addEventListener(AUTH_STATE_EVENT, readIdentity);
    return () => { active = false; window.removeEventListener(AUTH_STATE_EVENT, readIdentity); };
  }, []);
  if (identity.loading) return <p role="status" className="text-[13px] text-neutral-500">{text("正在读取保险箱…", "Loading vault…")}</p>;
  if (!identity.uid) return <p role="status" className="text-[13px] text-neutral-500">{text("登录后可管理你的保险箱。", "Sign in to manage your vault.")}</p>;
  return <SignedInVault key={identity.uid} uid={identity.uid} accent={accent} prefill={prefill} />;
}

function SignedInVault({ uid, accent, prefill }: { uid: string; accent?: string; prefill?: VaultPrefill }) {
  const text = useVaultText();
  const latestText = useRef(text);
  latestText.current = text;
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [references, setReferences] = useState<VaultReference[] | null>(null);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reauth, setReauth] = useState(false);
  const pendingAuth = useRef<{ resolve: () => void; reject: (cause: unknown) => void } | null>(null);
  const [committed, setCommitted] = useState(false);
  const [editor, setEditor] = useState<{ secret?: VaultSecret; prefill?: VaultPrefill } | null>(null);
  const [deleting, setDeleting] = useState<VaultSecret | null>(null);
  const [browserGrant, setBrowserGrant] = useState<string | null>(null);
  const [removingBrowser, setRemovingBrowser] = useState<string | null>(null);
  const active = useRef(true);
  const operation = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const { fence, checkFence, noteFence, settle } = useVaultFence();

  const refresh = useCallback(async (signal: AbortSignal, preserveReferences = false) => {
    const next = await getVault(signal);
    if (signal.aborted) return;
    setStatus(next);
    if (!preserveReferences) setReferences(null);
    if (next.enabled) {
      const usage = await getVaultReferences(signal);
      if (signal.aborted) return;
      setReferences(usage.references.filter((ref) => ref.scope !== "connector" && ref.scope !== "project_connector"));
      if (usage.references.some((ref) => ref.project_id)) {
        const names = await getVaultProjectNames(signal);
        if (!signal.aborted) setProjectNames(names);
      }
    } else setReferences([]);
  }, []);

  // A label change must not replace the controller of a pending vault write.
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    active.current = true;
    void checkFence(controller.signal);
    void refresh(controller.signal).catch(async (cause: unknown) => {
      if (controller.signal.aborted) return;
      if (vaultFenceState(cause)) await noteFence(cause, controller.signal);
      else if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(vaultErrorText(cause, latestText.current));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { active.current = false; controller.abort(); };
  }, [refresh, checkFence, noteFence]);

  // Capability actions can name an existing item or request a new one. Never
  // accept a value in the action; the editor's password field remains empty.
  const appliedPrefill = useRef("");
  useEffect(() => {
    if (!prefill || loading || !status?.enabled) return;
    const key = `${prefill.name || ""}\u0000${prefill.kind || ""}\u0000${prefill.target || ""}`;
    if (appliedPrefill.current === key) return;
    appliedPrefill.current = key;
    const existing = prefill.name ? status.secrets.find((item) => item.name === prefill.name) : undefined;
    setEditor(existing ? { secret: existing } : { prefill });
    setError("");
  }, [loading, prefill, status]);

  // Only sealed envelopes or metadata remain in a pending operation.
  async function withFreshAuth(work: () => Promise<unknown>, signal: AbortSignal) {
    try { return await work(); }
    catch (cause) {
      if (!(cause instanceof VaultApiError) || cause.code !== "reauth_required" || signal.aborted) throw cause;
      await new Promise<void>((resolve, reject) => {
        const abort = () => { pendingAuth.current = null; reject(new DOMException("Aborted", "AbortError")); };
        signal.addEventListener("abort", abort, { once: true });
        pendingAuth.current = {
          resolve: () => { signal.removeEventListener("abort", abort); resolve(); },
          reject: (error) => { signal.removeEventListener("abort", abort); reject(error); },
        };
        setReauth(true);
      });
      if (signal.aborted || await getUserId() !== uid) throw new VaultApiError("signed_out", 401);
      return work(); // Retry exactly once; never replay an ambiguous/committed mutation.
    }
  }

  async function authenticated() {
    if (await getUserId() !== uid) return;
    const pending = pendingAuth.current;
    pendingAuth.current = null;
    setReauth(false);
    pending?.resolve();
  }

  function cancelAuthentication() {
    const pending = pendingAuth.current;
    pendingAuth.current = null;
    setReauth(false);
    pending?.reject(new DOMException("Aborted", "AbortError"));
  }

  function openEditor(next: { secret?: VaultSecret; prefill?: VaultPrefill }) {
    void act(async (signal) => {
      await checkVaultWriteAccess(signal);
      if (!signal.aborted) { setEditor(next); setDeleting(null); setRemovingBrowser(null); }
    });
  }

  async function recoverCommitted(signal: AbortSignal) {
    if (signal.aborted) return;
    setCommitted(true); setNotice(""); setError("");
    setEditor(null); setDeleting(null); setBrowserGrant(null); setRemovingBrowser(null); setStatus(null); setReferences(null);
    try { await refresh(signal); }
    catch { if (!signal.aborted) setError(latestText.current("变更已保存，暂时无法读取最新保险箱。请刷新。", "The change was saved, but current vault details are unavailable. Refresh to check.")); }
  }

  async function act(work: (signal: AbortSignal) => Promise<unknown>, preserveReferences = false) {
    const signal = lifetime.current?.signal;
    if (operation.current || !signal || signal.aborted) return;
    operation.current = true;
    setBusy(true); setError(""); setNotice("");
    let saved = false;
    try { await withFreshAuth(() => work(signal), signal); saved = true; await refresh(signal, preserveReferences); }
    catch (cause) {
      if (!signal.aborted) {
        if (saved && preserveReferences) setError(latestText.current("变更已保存，但暂时无法更新使用位置。请刷新查看。", "Your change was saved, but usage locations could not be refreshed. Refresh to check."));
        else if (vaultMutationWasCommitted(cause)) await recoverCommitted(signal);
        else if (vaultFenceState(cause)) await noteFence(cause, signal);
        else if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(vaultErrorText(cause, latestText.current));
      }
    }
    finally { if (lifetime.current?.signal === signal) { operation.current = false; if (!signal.aborted) setBusy(false); } }
  }

  function recover() {
    void act(async (signal) => {
      const { recovery } = await recoverVault(signal);
      if (signal.aborted) return;
      const restart = settle(recovery);
      setNotice(vaultRecoveredNotice(restart, recovery.pending.length > 0, latestText.current));
    });
  }

  function kindLabel(kind: VaultKind) {
    return kind === "api_key" ? text("API 密钥 / 令牌", "API key / token") : kind === "password" ? text("密码", "Password") : text("私密文本 / 服务引用", "Private text / service reference");
  }

  return <section data-settings-pane="vault" aria-label={text("保险箱", "Vault")} aria-busy={loading || busy} className="space-y-4 text-[13px] text-neutral-700 dark:text-neutral-300">
    <p className="text-[12px] text-neutral-500">{text("安全保存和管理密钥。", "Securely store and manage secrets.")}</p>
    {reauth && <div data-vault-reauth="" className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-700">
      <AuthPanel title={text("确认身份后继续", "Sign in to continue")} closeOnSuccess={false} onSuccess={() => void authenticated()} onClose={cancelAuthentication} />
    </div>}
    {loading && <p role="status">{text("正在读取保险箱…", "Loading vault…")}</p>}
    {error && <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-red-700 dark:bg-red-950/30">
      <p>{error}</p><button type="button" disabled={busy} className={QUIET} onClick={() => void act(async () => {})}>{text("刷新", "Refresh")}</button>
    </div>}
    {notice && <p role="status" className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800">{notice}</p>}
    {fence && <VaultFenceNotice fence={fence} busy={busy} className={QUIET} text={text} onRecover={recover} />}
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
        <button type="button" className={QUIET} disabled={busy || loading || !!editor || !!browserGrant || status.secrets.length >= status.limits.max_secrets} onClick={() => openEditor({})}>{text("添加", "Add item")}</button>
      </div>
      {status.secrets.length >= status.limits.max_secrets && <p role="status" className="text-neutral-500">{text("保险箱已达到容量上限。", "Your vault has reached its item limit.")}</p>}
      {editor && <SecretEditor key={editor.secret?.id || "new"} uid={uid} secret={editor.secret} prefill={editor.prefill} accent={accent} maxValueBytes={status.limits.max_value_bytes}
        withFreshAuth={withFreshAuth} onClose={() => setEditor(null)} onSaving={setBusy} onSaved={async () => {
          const signal = lifetime.current?.signal;
          setEditor(null);
          if (signal && !signal.aborted) await refresh(signal);
        }} onError={async (cause) => {
          const signal = lifetime.current?.signal;
          if (!active.current || !signal || signal.aborted) return;
          if (vaultMutationWasCommitted(cause)) await recoverCommitted(signal);
          else if (vaultFenceState(cause)) await noteFence(cause, signal);
          else if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(vaultErrorText(cause, latestText.current));
        }} />}
      {!status.secrets.length && !loading && <p className="rounded-2xl border border-dashed border-neutral-200 p-5 text-center text-neutral-500 dark:border-neutral-700">{text("还没有密钥。", "No secrets yet.")}</p>}
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {status.secrets.map((secret) => <article key={secret.id} data-vault-item={secret.id} className="space-y-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h4 className="break-words font-medium text-neutral-900 dark:text-neutral-100">{secret.name}</h4>
              <p className="text-[12px] text-neutral-500">{kindLabel(secret.kind)} · {text("版本", "Version")} {secret.version} {safeVaultFingerprint(secret.kind, secret.fingerprint) && <code className="ml-2">{safeVaultFingerprint(secret.kind, secret.fingerprint)}</code>}</p>
              {secret.kind === "password" && secret.username && <p className="break-all text-neutral-500">{text("用户名", "Username")}: {secret.username}</p>}
              {secret.description && <p className="break-words text-neutral-500">{secret.description}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" className={QUIET} disabled={busy || !!editor || !!browserGrant || secret.needs_reentry} data-vault-browser-authorize={secret.id} onClick={() => { setBrowserGrant(secret.id); setDeleting(null); setRemovingBrowser(null); setError(""); setNotice(""); }}>{text("授权浏览器", "Authorize browser")}</button>
              <button type="button" className={QUIET} disabled={busy || !!editor || !!browserGrant} onClick={() => openEditor({ secret })}>{text("更新密钥", "Rotate")}</button>
              <button type="button" className={`${QUIET} text-red-600`} disabled={busy || !!editor || !!browserGrant} onClick={() => { setDeleting(secret); setRemovingBrowser(null); }}>{text("删除", "Delete")}</button>
            </div>
          </div>
          {secret.needs_reentry && <p role="status" className="text-amber-700">{text("此项目需要重新输入密钥，现有引用暂时不能使用。", "Re-enter this secret before its references can be used.")}</p>}
          {browserGrant === secret.id && <BrowserGrantEditor secret={secret} references={references} busy={busy} accent={accent}
            onClose={() => setBrowserGrant(null)} onGrant={(origin) => void act(async (signal) => {
              const { reference } = await createVaultBrowserBinding({ secret_id: secret.id, purpose: "browser_login", origin }, signal);
              if (signal.aborted) return;
              // A successful write remains visible even if its follow-up read fails.
              setReferences((current) => [...(current ?? []).filter((ref) => ref.id !== reference.id), reference]);
              setBrowserGrant(null);
              setNotice(latestText.current(`已授权 ${secret.name} 用于 ${reference.origin} 的浏览器登录。`, `${secret.name} is authorized for browser sign-in on ${reference.origin}.`));
            }, true)} />}
          <div className="space-y-1 text-[12px] text-neutral-500">
            <p className="font-medium">{text("使用位置", "Used by")}</p>
            {references === null ? <p>{text("引用列表暂未确认，请刷新后查看。", "Usage references are not confirmed yet. Refresh to check.")}</p> : <>
              {!references.some((ref) => ref.secret_id === secret.id) && !secret.machines?.length && <p>{text("尚未授权给任何网站、应用或电脑。", "Not granted to any website, app or computer.")}</p>}
              <ul className="space-y-1">
                {references.filter((ref) => ref.secret_id === secret.id).map((ref) => <li key={ref.id} data-vault-used-by={ref.id} className="break-all">
                  {ref.purpose === "supabase_provision_password" ? text("服务", "Service") : ref.scope === "browser" ? text("浏览器", "Browser") : ref.scope === "connector" ? text("连接器", "Connector") : ref.scope === "project_connector" ? text("网站服务", "Website service") : text("网站 / 应用", "Website / app")} · {ref.project_id ? projectNames[ref.project_id] || ref.project_id : text("账号", "Account")} · {vaultPurposeLabel(ref, text)}
                  {ref.origin && <> · <code>{ref.origin}</code></>}
                  {ref.scope === "browser" && ref.purpose !== "browser_login" && ref.purpose !== "supabase_provision_password" && <> · {text("用途", "Purpose")}: <code>{ref.purpose}</code></>}
                  {(ref.scope === "connector" || ref.scope === "project_connector") && typeof ref.binding?.provider === "string" && <> · {ref.binding.provider}</>}
                  {ref.scope === "project_connector" && <> · {vaultReferenceSlotLabel(ref.slot, text)}</>}
                  {ref.env_name && <> · <code>{ref.env_name}</code></>}
                  {(ref.scope === "project" || ref.scope === "project_connector") && <> · {ref.environment === "production" ? text("生产", "Production") : text("预览", "Preview")}</>}
                  {ref.scope === "browser" && ref.purpose !== "supabase_provision_password" && <>
                    {" "}<button type="button" className={`${QUIET} text-red-600`} data-vault-browser-remove={ref.id} disabled={busy || !!editor || !!browserGrant} onClick={() => { setRemovingBrowser(ref.id); setDeleting(null); }}>{text("移除引用", "Remove")}</button>
                    {removingBrowser === ref.id && <div data-vault-browser-remove-confirm={ref.id} className="mt-2 space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
                      <p>{text(`移除此引用将撤销 ${ref.origin} 使用此项目的浏览器权限。`, `Removing this reference revokes browser access to this item on ${ref.origin}.`)}</p>
                      <div className="flex gap-2"><button type="button" className={`${QUIET} text-red-600`} disabled={busy} onClick={() => void act(async (signal) => {
                        await deleteVaultBrowserBinding(ref.id, signal);
                        if (signal.aborted) return;
                        setReferences((current) => current?.filter((item) => item.id !== ref.id) ?? null);
                        setRemovingBrowser(null);
                        setNotice(latestText.current(`已撤销 ${ref.origin} 的浏览器使用权限。`, `Browser access on ${ref.origin} has been revoked.`));
                      }, true)}>{text("确认移除", "Remove reference")}</button><button type="button" className={QUIET} disabled={busy} onClick={() => setRemovingBrowser(null)}>{text("取消", "Cancel")}</button></div>
                    </div>}
                  </>}
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
  </section>;
}

function BrowserGrantEditor({ secret, references, busy, accent, onClose, onGrant }: {
  secret: VaultSecret; references: VaultReference[] | null; busy: boolean; accent?: string;
  onClose: () => void; onGrant: (origin: string) => void;
}) {
  const text = useVaultText();
  const id = useId();
  const [origin, setOrigin] = useState("");
  const [invalid, setInvalid] = useState(false);
  const normalized = normalizeVaultBrowserOrigin(origin);
  const duplicate = !!normalized && !!references?.some((ref) => ref.secret_id === secret.id && ref.scope === "browser"
    && !ref.project_id && ref.purpose === "browser_login" && ref.origin === normalized);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || duplicate) return;
    if (!normalized) { setInvalid(true); return; }
    onGrant(normalized);
  }
  return <form data-vault-browser-grant={secret.id} aria-label={text("授权浏览器", "Authorize browser")} aria-busy={busy} noValidate autoComplete="off" onSubmit={submit} className="space-y-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
    <p className="font-medium">{text("授权项目", "Vault item")}: {secret.name}</p>
    <fieldset disabled={busy} className="space-y-3">
      <label htmlFor={`${id}-origin`} className="block space-y-1"><span>{text("网站（完整 HTTPS 地址）", "Website (exact HTTPS origin)")}</span><input id={`${id}-origin`} type="url" className={FIELD} value={origin} onChange={(event) => { setOrigin(event.target.value); setInvalid(false); }} placeholder="https://example.com" maxLength={300} autoCapitalize="off" spellCheck={false} aria-invalid={invalid} aria-describedby={`${id}-hint`} required /></label>
      <p id={`${id}-hint`} className="text-[12px] leading-relaxed text-neutral-500">{text("只授权此网站的浏览器登录。填写 https:// 加网站域名，可含 HTTPS 端口；不要填写路径、查询参数、通配符或账号密码。仅保存引用，agent 无法看到密钥。", "Allow browser sign-in only on this website. Enter https:// and its hostname, with an HTTPS port if needed; omit paths, queries, wildcards and credentials. Only a reference is saved; agents cannot see the secret.")}</p>
      {normalized && <p className="break-all" data-vault-browser-target="">{text("允许登录的网站", "Website allowed to sign in")}: <code>{normalized}</code></p>}
      {invalid && <p role="alert" className="text-red-600">{text("请输入完整、有效的 HTTPS 网站地址，不含路径、查询参数、片段、通配符或账号密码。", "Enter a valid exact HTTPS origin without a path, query, fragment, wildcard or credentials.")}</p>}
      {duplicate && <p role="status">{text("此项目已授权用于该网站的浏览器登录，可在使用位置中移除引用。", "This item is already authorized for browser sign-in on this website. Remove its reference under Used by to revoke access.")}</p>}
      <div className="flex gap-2"><button type="submit" className={PRIMARY} style={accent ? { backgroundColor: accent } : undefined} disabled={busy || !origin || duplicate}>{busy ? text("授权中…", "Authorizing…") : text("确认授权", "Authorize login")}</button><button type="button" className={QUIET} disabled={busy} onClick={onClose}>{text("取消", "Cancel")}</button></div>
    </fieldset>
  </form>;
}

function SecretEditor({ uid, secret, prefill, maxValueBytes, accent, withFreshAuth, onClose, onSaved, onSaving, onError }: {
  uid: string; secret?: VaultSecret; prefill?: VaultPrefill; maxValueBytes: number; accent?: string;
  withFreshAuth: (work: () => Promise<unknown>, signal: AbortSignal) => Promise<unknown>;
  onClose: () => void; onSaved: () => Promise<void>; onSaving: (saving: boolean) => void; onError: (cause: unknown) => Promise<void>;
}) {
  const text = useVaultText();
  const id = useId();
  const [name, setName] = useState(secret?.name || prefill?.name || "");
  const [kind, setKind] = useState<VaultKind>(secret?.kind || (prefill?.kind === "password" || prefill?.kind === "text" ? prefill.kind : "api_key"));
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
      await withFreshAuth(() => secret
        ? updateVaultSecret(secret.id, { ...metadata, sealed }, current.signal)
        : createVaultSecret({ ...metadata, kind, sealed }, current.signal), current.signal);
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
      {prefill?.target && <label className="block space-y-1" htmlFor={`${id}-target`}><span>{text("授权目标", "Target")}</span><input id={`${id}-target`} data-vault-prefill-target value={prefill.target} className={FIELD} readOnly /></label>}
      <label className="block space-y-1" htmlFor={`${id}-value`}><span>{secret ? text("新密钥值", "New secret value") : text("密钥值", "Secret value")}</span>
        <input id={`${id}-value`} type="password" className={FIELD} value={value} onChange={(event) => setValue(event.target.value)} autoFocus={!secret} autoComplete="new-password" autoCapitalize="off" spellCheck={false} aria-invalid={invalid} aria-describedby={`${id}-hint`} required />
      </label>
      <p id={`${id}-hint`} className="text-[12px] leading-relaxed text-neutral-500">{text("保存后无法查看原值。", "Saved values cannot be displayed.")}</p>
      {secret && <p className="text-[12px] text-neutral-500">{text("所有引用会使用更新后的版本，无需重新添加到各个网站。", "Every reference follows the new version; you do not need to add it to each website again.")}</p>}
      {invalid && <p role="alert" className="text-red-600">{text("密钥不能为空、不能含空字符，且不能超过", "The value must be nonempty, contain no NUL and be at most")} {Math.min(maxValueBytes, 12000)} {text("字节。请重新输入。", "bytes. Enter it again.")}</p>}
      <label className="block space-y-1" htmlFor={`${id}-description`}><span>{text("说明（不要填写秘密）", "Description (no secrets)")}</span><input id={`${id}-description`} className={FIELD} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} /></label>
      <div className="flex gap-2"><button type="submit" className={PRIMARY} style={accent ? { backgroundColor: accent } : undefined} disabled={!value || !name.trim()}>{busy ? text("保存中…", "Saving…") : text("保存", "Save")}</button><button type="button" className={QUIET} onClick={close}>{text("取消", "Cancel")}</button></div>
    </fieldset>
  </form>;
}
