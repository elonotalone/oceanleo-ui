"use client";

import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { getUserId } from "../../../lib/auth/client";
import { getBayFollowPerson, setBayFollowing } from "../../../lib/bay/following";
import { requireBayLogin, useBaySignedIn } from "../shell/bay-state";
import { useBayAutoRetry } from "../shell/use-bay-auto-retry";

const changed = "bay-follow-changed";
export function BayFollowButton({ userId, username, initialFollowing }: { userId: string; username: string; initialFollowing?: boolean }) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const [following, setFollowing] = useState<boolean | null>(initialFollowing ?? null);
  const [own, setOwn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setLoadFailed(false); setFollowing(initialFollowing ?? null);
    if (!signedIn) return () => controller.abort();
    void getUserId().then(async (viewer) => {
      if (controller.signal.aborted) return;
      setOwn(viewer === userId);
      if (viewer === userId || initialFollowing !== undefined) return;
      const person = await getBayFollowPerson(userId, username, controller.signal);
      if (controller.signal.aborted) return;
      if (person && !person.blocked) setFollowing(person.following);
      else setError("关注状态暂不可用。");
    }).catch(() => { if (!controller.signal.aborted) { setLoadFailed(true); setError("关注状态暂不可用。"); } });
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; following: boolean }>).detail;
      if (detail.userId === userId) setFollowing(detail.following);
    };
    window.addEventListener(changed, update);
    return () => { controller.abort(); window.removeEventListener(changed, update); };
  }, [userId, username, signedIn, initialFollowing, nonce]);
  useBayAutoRetry(loadFailed, () => setNonce(value => value + 1));
  async function toggle() {
    if (busy || !requireBayLogin() || following === null) return;
    setBusy(true); setError("");
    try {
      const result = await setBayFollowing(userId, !following);
      setFollowing(result.following);
      window.dispatchEvent(new CustomEvent(changed, { detail: { userId, following: result.following } }));
    } catch {
      setError("关注操作未完成，请稍后再试。");
    } finally { setBusy(false); }
  }
  if (!userId || own) return null;
  return <span data-bay-follow={userId} className="inline-flex flex-col gap-1">
    <button type="button" disabled={busy || (signedIn && following === null)} aria-pressed={following === true}
      onClick={() => { if (!signedIn) requireBayLogin(); else void toggle(); }}
      className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-900 disabled:opacity-60">
      {tt(following ? "已关注" : "关注")}
    </button>
    {error ? <span role="status" className="text-xs text-neutral-500">{tt(error)}</span> : null}
  </span>;
}
