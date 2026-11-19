"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { challengeAndVerify, getUserId, listMfaFactors, sendStepUpEmail, supportsMfaPasskeys, verifyMfaPasskey, verifyStepUpEmail, type MfaFactor } from "../../lib/auth/client";
import { useUI } from "../../i18n/ui/useUI";

/** Re-check identity for one pending action; never switch or collect an account. */
export function StepUpDialog({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const tt = useUI();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const owner = useRef<string | null>(null);
  const [factors, setFactors] = useState<MfaFactor[] | null>(null);
  const [factorId, setFactorId] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    void Promise.all([getUserId(), listMfaFactors()]).then(([uid, result]) => {
      if (!alive) return;
      owner.current = uid;
      if (result.error) { setError(result.error); return; }
      const verified = result.factors.filter((f) => f.status === "verified");
      setFactors(verified);
      setFactorId(verified.find((f) => f.factorType !== "webauthn")?.id || "");
    }).catch((cause) => { if (alive) setError(String(cause)); });
    return () => { alive = false; previous?.focus(); };
  }, []);
  async function run(work: () => Promise<{ error?: string }>, complete = true) {
    setBusy(true); setError("");
    try {
      if (!owner.current || await getUserId() !== owner.current) { onClose(); return; }
      const result = await work();
      if (result.error) { setError(result.error); return; }
      if (await getUserId() !== owner.current) { onClose(); return; }
      if (complete) onSuccess();
      else setSent(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  const totp = factors?.filter((f) => f.factorType !== "webauthn") || [];
  const passkeys = supportsMfaPasskeys() ? factors?.filter((f) => f.factorType === "webauthn") || [] : [];
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(() => factors?.length ? challengeAndVerify(factorId, code) : verifyStepUpEmail(code));
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4" data-vault-reauth="" onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key === "Tab") {
      const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
      <h2 id={titleId} className="text-sm font-medium">{tt("验证身份")}</h2>
      {factors === null && !error && <p role="status">{tt("加载中…")}</p>}
      {passkeys.map((factor) => <button key={factor.id} type="button" disabled={busy} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600" onClick={() => void run(() => verifyMfaPasskey(factor.id))}>{tt("使用通行密钥")}{factor.friendlyName ? ` · ${factor.friendlyName}` : ""}</button>)}
      {factors !== null && factors.length > 0 && totp.length === 0 && passkeys.length === 0 && <p role="alert" className="text-sm text-rose-600">{tt("此处暂不支持通行密钥，请使用验证器。")}</p>}
      {factors !== null && (totp.length > 0 || factors.length === 0) && <form onSubmit={submit} className="space-y-3">
        {totp.length > 1 && <select aria-label={tt("验证器")} value={factorId} onChange={(event) => setFactorId(event.target.value)}>{totp.map((factor) => <option key={factor.id} value={factor.id}>{factor.friendlyName || tt("验证器")}</option>)}</select>}
        {factors.length === 0 && <button type="button" disabled={busy || sent} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600" onClick={() => void run(sendStepUpEmail, false)}>{tt("发送邮箱验证码")}</button>}
        {(totp.length > 0 || sent) && <>
          <label className="block text-sm">{tt(totp.length ? "输入验证器上正在显示的 6 位码" : "邮箱验证码")}<input autoFocus inputMode="numeric" autoComplete="one-time-code" required pattern={totp.length ? "[0-9]{6}" : "[0-9]{6,10}"} maxLength={totp.length ? 6 : 10} value={code} onChange={(event) => setCode(event.target.value)} className="mt-2 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-600" /></label>
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">{tt("确认")}</button>
        </>}
      </form>}
      {error && <p role="alert" className="text-sm text-rose-600">{tt(error)}</p>}
      <button type="button" onClick={onClose} className="text-sm text-neutral-500">{tt("取消")}</button>
    </div>
  </div>;
}
