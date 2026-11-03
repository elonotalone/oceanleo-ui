"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AUTH_STATE_EVENT } from "../../lib/auth/client";
import {
  createProjectVaultReference, deleteProjectVaultReference, deleteVaultBrowserBinding, getProjectVaultReferences,
  getVault, recoverVault, safeVaultFingerprint, validVaultEnvName, vaultFenceState, vaultMutationWasCommitted,
  type VaultEnvironment, type VaultReference, type VaultStatus,
} from "../../lib/vault-api";
import {
  useVaultFence, useVaultText, vaultCommittedNotice, vaultErrorText, VaultFenceNotice, vaultPurposeLabel, vaultRecoveredNotice, vaultReferenceSlotLabel,
} from "../../pages/settings/VaultSettingsSection";

export type SiteVaultPanelProps = {
  projectId: string;
  accent?: string;
  onOpenMainVault?: () => void;
  onChanged?: () => void;
};

const FIELD = "w-full rounded-lg border border-neutral-200 bg-transparent px-3 py-2 text-[13px] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-neutral-700";
const BUTTON = "rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

export function SiteVaultPanel(props: SiteVaultPanelProps) {
  return <SiteVaultContent key={props.projectId} {...props} />;
}

function SiteVaultContent({ projectId, accent, onOpenMainVault, onChanged }: SiteVaultPanelProps) {
  const text = useVaultText();
  const latestText = useRef(text);
  latestText.current = text;
  const id = useId();
  const [vault, setVault] = useState<VaultStatus | null>(null);
  const [references, setReferences] = useState<VaultReference[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [committed, setCommitted] = useState(false);
  const [secretId, setSecretId] = useState("");
  const [envName, setEnvName] = useState("");
  const [environment, setEnvironment] = useState<VaultEnvironment>("preview");
  const [removing, setRemoving] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const operation = useRef(false);
  const { fence, setFence, checkFence, noteFence, settle } = useVaultFence(projectId);

  const refresh = useCallback(async (signal: AbortSignal) => {
    const status = await getVault(signal);
    if (signal.aborted) return;
    setVault(status);
    if (status.enabled) {
      const result = await getProjectVaultReferences(projectId, signal);
      if (!signal.aborted) setReferences(result.references);
    } else setReferences([]);
    if (!signal.aborted) setLoaded(true);
  }, [projectId]);

  // Keep pending mutations attached to the project when only the locale changes.
  useEffect(() => {
    const load = () => {
      lifetime.current?.abort();
      const controller = new AbortController();
      lifetime.current = controller;
      setVault(null); setReferences([]); setLoaded(false); setLoading(true);
      setSecretId(""); setEnvName(""); setRemoving(null); setError(""); setNotice(""); setCommitted(false);
      operation.current = false; setBusy(false); setFence(null);
      if (!projectId) { setLoading(false); return; }
      void checkFence(controller.signal);
      void refresh(controller.signal).catch(async (cause: unknown) => {
        if (controller.signal.aborted) return;
        if (vaultFenceState(cause)) await noteFence(cause, controller.signal);
        else setError(vaultErrorText(cause, latestText.current));
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    };
    load();
    window.addEventListener(AUTH_STATE_EVENT, load);
    return () => { lifetime.current?.abort(); window.removeEventListener(AUTH_STATE_EVENT, load); };
  }, [projectId, refresh, setFence, checkFence, noteFence]);

  async function recoverCommitted(signal: AbortSignal) {
    if (signal.aborted) return;
    setCommitted(true); setNotice(""); setError("");
    setVault(null); setReferences([]); setLoaded(false); setRemoving(null); setSecretId(""); setEnvName("");
    try { await refresh(signal); }
    catch { if (!signal.aborted) setError(latestText.current("授权变更已保存，暂时无法读取最新引用。请刷新。", "The grant change was saved, but current references are unavailable. Refresh to check.")); }
    if (!signal.aborted) {
      try { onChanged?.(); } catch { /* The committed notice still directs the owner to runtime status. */ }
    }
  }

  async function act(work: (signal: AbortSignal) => Promise<unknown>) {
    const signal = lifetime.current?.signal;
    if (operation.current || !signal || signal.aborted) return;
    operation.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await work(signal);
      if (signal.aborted) return;
      await refresh(signal);
      if (!signal.aborted) onChanged?.();
    } catch (cause) {
      if (!signal.aborted) {
        if (vaultMutationWasCommitted(cause)) await recoverCommitted(signal);
        else if (vaultFenceState(cause)) { setLoaded(false); await noteFence(cause, signal); }
        else { setError(vaultErrorText(cause, latestText.current)); setLoaded(false); }
      }
    } finally {
      if (lifetime.current?.signal === signal) { operation.current = false; if (!signal.aborted) setBusy(false); }
    }
  }

  function recover() {
    void act(async (signal) => {
      const { recovery } = await recoverVault(signal);
      if (signal.aborted) return;
      const restart = settle(recovery);
      setNotice(vaultRecoveredNotice(restart, recovery.pending.some((row) => row.project_id === projectId), latestText.current, true));
    });
  }

  const selected = vault?.secrets.find((secret) => secret.id === secretId);
  const duplicate = references.some((reference) => reference.purpose === "runtime_env" && reference.env_name === envName.trim() && reference.environment === environment);
  const canBind = Boolean(projectId && loaded && vault?.enabled && selected && !selected.needs_reentry && validVaultEnvName(envName.trim()) && !duplicate && !busy && !loading);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canBind) return;
    void act(async (signal) => {
      const result = await createProjectVaultReference(projectId, { secret_id: secretId, purpose: "runtime_env", env_name: envName.trim(), environment }, signal);
      if (!signal.aborted) {
        setReferences((current) => [...current.filter((reference) => reference.id !== result.reference.id), result.reference]);
        setSecretId(""); setEnvName(""); setNotice(text("引用已添加。此网站使用主保险箱的当前版本。", "Reference added. This website uses the current version from your main vault."));
      }
    });
  }

  return <section data-site-vault-panel="" aria-label={text("网站小保险箱", "Website vault")} aria-busy={loading || busy} className="space-y-3 text-[13px] text-neutral-700 dark:text-neutral-300">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-medium text-neutral-900 dark:text-neutral-100">{text("小保险箱", "Small vault")}</h3>
      {onOpenMainVault && <button type="button" className={BUTTON} disabled={busy} onClick={onOpenMainVault}>{text("管理主保险箱", "Manage main vault")}</button>}
    </div>
    <p className="text-[12px] leading-relaxed text-neutral-500">{text("这里只保存主保险箱的引用。主密钥更新后自动跟随；移除引用会立即撤销此网站的使用权限。agent 无法读取密钥值。", "This vault stores references to your main vault. References follow rotations; removing one immediately revokes this website’s access. Agents cannot read the secret values.")}</p>
    {!projectId && <p role="status">{text("先打开一个网站项目。", "Open a website project first.")}</p>}
    {loading && <p role="status">{text("正在读取引用…", "Loading references…")}</p>}
    {error && <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-red-700 dark:bg-red-950/30"><p>{error}</p><button type="button" disabled={busy || !projectId} className={BUTTON} onClick={() => void act(async () => {})}>{text("刷新", "Refresh")}</button></div>}
    {notice && <p role="status" className="rounded-lg bg-neutral-50 p-3 text-[12px] dark:bg-neutral-800">{notice}</p>}
    {fence && <VaultFenceNotice fence={fence} busy={busy || !projectId} site className={BUTTON} text={text} onRecover={recover} />}
    {committed && <div data-site-vault-committed="" role="status" className="space-y-2 rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><p>{vaultCommittedNotice(text)}</p><button type="button" disabled={busy} className={BUTTON} onClick={() => void act(async () => {})}>{text("刷新", "Refresh")}</button></div>}
    {vault && !vault.enabled && <p role="status" className="rounded-xl border border-dashed border-neutral-200 p-4 dark:border-neutral-700">{text("当前服务尚未启用保险箱，暂时不能添加或移除引用。", "Vault is not enabled on this service. Adding and removing references are unavailable.")}</p>}
    {vault?.enabled && <>
      {loaded && !references.length && <p className="text-[12px] text-neutral-500">{text("此网站还没有密钥引用。", "This website has no secret references yet.")}</p>}
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {references.map((reference) => <li key={reference.id} data-vault-reference={reference.id} className="space-y-2 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1"><p className="break-words font-medium">{reference.secret_name}</p><p className="break-all text-[12px] text-neutral-500">{vaultPurposeLabel(reference, text)}{reference.env_name && <> · <code>{reference.env_name}</code></>}{reference.scope === "project_connector" && <> · {vaultReferenceSlotLabel(reference.slot, text)}</>}{(reference.scope === "project" || reference.scope === "project_connector") && <> · {reference.environment === "production" ? text("生产", "Production") : text("预览", "Preview")}</>} · {text("版本", "Version")} {reference.version}</p>
              {reference.origin && <p className="break-all text-[12px] text-neutral-500"><code>{reference.origin}</code></p>}
              {reference.scope === "browser" && reference.purpose !== "supabase_provision_password" && <p className="break-words text-[12px] text-neutral-500">{text("用途", "Purpose")}: <code>{reference.purpose}</code></p>}
              {reference.scope === "project_connector" && typeof reference.binding?.provider === "string" && <p className="text-[12px] text-neutral-500">{reference.binding.provider}</p>}
              {reference.scope === "connector" && <p className="text-[12px] text-neutral-500">{typeof reference.binding?.provider === "string" && <>{reference.binding.provider} · </>}{text("在设置 → 连接器中管理此账号连接。", "Manage this account connection in Settings → Connectors.")}</p>}
              {safeVaultFingerprint(reference.kind, reference.fingerprint) && <code className="block text-[12px] text-neutral-500">{safeVaultFingerprint(reference.kind, reference.fingerprint)}</code>}
            </div>
            {reference.scope !== "connector" && <button type="button" className={`${BUTTON} shrink-0 text-red-600`} disabled={busy} onClick={() => setRemoving(reference.id)}>{text("移除引用", "Remove")}</button>}
          </div>
          {removing === reference.id && <div role="alert" className="space-y-2 rounded-lg border border-red-200 p-3 text-[12px] dark:border-red-900"><p>{text("移除后，此网站将无法继续使用这项密钥；主保险箱项目和其他网站的引用会保留。", "Removing this reference revokes this website’s use of the secret. The main item and other websites’ references remain available.")}</p><div className="flex gap-2">
            <button type="button" disabled={busy} className={`${BUTTON} text-red-600`} onClick={() => void act(async (signal) => {
              if (reference.scope === "browser") await deleteVaultBrowserBinding(reference.id, signal);
              else await deleteProjectVaultReference(projectId, reference.id, signal);
              if (!signal.aborted) {
                setReferences((current) => current.filter((item) => item.id !== reference.id));
                setRemoving(null); setNotice(text("引用已移除，此网站的使用权限已撤销。", "Reference removed. This website’s access has been revoked."));
              }
            })}>{text("确认移除", "Remove reference")}</button><button type="button" className={BUTTON} disabled={busy} onClick={() => setRemoving(null)}>{text("取消", "Cancel")}</button>
          </div></div>}
        </li>)}
      </ul>
      {!vault.secrets.length && <p className="rounded-xl border border-dashed border-neutral-200 p-4 text-[12px] text-neutral-500 dark:border-neutral-700">{text("主保险箱还没有项目。请先在设置 → 保险箱添加密钥，再回来选择。", "Your main vault has no items. Add a secret in Settings → Vault, then select it here.")}</p>}
      {!!vault.secrets.length && <form onSubmit={submit} className="space-y-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
        <fieldset disabled={busy || loading || !loaded} className="space-y-3">
          <label htmlFor={`${id}-secret`} className="block space-y-1"><span>{text("从主保险箱选择", "Choose from main vault")}</span><select id={`${id}-secret`} className={FIELD} value={secretId} onChange={(event) => setSecretId(event.target.value)} required>
            <option value="">{text("选择一个项目", "Select an item")}</option>{vault.secrets.map((secret) => <option key={secret.id} value={secret.id} disabled={secret.needs_reentry}>{secret.name}{secret.needs_reentry ? text("（需要重新输入）", " (re-entry required)") : ""}</option>)}
          </select></label>
          <label htmlFor={`${id}-env`} className="block space-y-1"><span>{text("环境变量名称", "Environment variable")}</span><input id={`${id}-env`} className={FIELD} value={envName} onChange={(event) => setEnvName(event.target.value)} maxLength={128} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="SERVICE_API_KEY" aria-describedby={`${id}-env-hint`} required /></label>
          <p id={`${id}-env-hint`} className="text-[12px] text-neutral-500">{text("使用大写字母、数字和下划线，以字母或下划线开头。会公开到网页的名称，以及系统、进程、代理和加载配置均不可使用。Supabase 仅支持四个指定的服务端登录和存储变量。", "Use uppercase letters, numbers and underscores, starting with a letter or underscore. Browser-public names and system, process, proxy or loader settings are blocked. Supabase supports only four specific server-side sign-in and storage variables.")}</p>
          <label htmlFor={`${id}-environment`} className="block space-y-1"><span>{text("使用环境", "Environment")}</span><select id={`${id}-environment`} className={FIELD} value={environment} onChange={(event) => setEnvironment(event.target.value as VaultEnvironment)}><option value="preview">{text("预览", "Preview")}</option><option value="production">{text("生产", "Production")}</option></select></label>
          <p className="text-[12px] text-neutral-500">{text("预览和生产分别授权。如两边都需要，请分别添加引用。", "Preview and production are granted separately. Add a reference for each if both need access.")}</p>
          {duplicate && <p role="status" className="text-[12px] text-amber-700">{text("此环境已有同名引用，先移除旧引用再添加。", "This environment already has a reference with that name. Remove it before adding another.")}</p>}
          <button type="submit" disabled={!canBind} className="rounded-lg bg-neutral-900 px-3 py-2 text-[12px] font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900" style={accent ? { backgroundColor: accent } : undefined}>{busy ? text("保存中…", "Saving…") : text("添加引用", "Add reference")}</button>
        </fieldset>
      </form>}
    </>}
  </section>;
}
