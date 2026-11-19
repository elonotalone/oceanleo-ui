"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { getBayFollowing, type BayFollowingItem, type BayFollowingPage } from "../../../lib/bay/following";
import { BayApiError } from "../../../lib/bay/http";
import { requireBayLogin, useBaySignedIn } from "../shell/bay-state";
import { useBayAutoRetry } from "../shell/use-bay-auto-retry";
import { BayFollowButton } from "./BayFollowButton";

export function BayFollowing() {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const [page, setPage] = useState<BayFollowingPage>({ items: [], next_cursor: null });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [nonce, setNonce] = useState(0);
  const cursor = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const busy = useRef(false);
  async function load(append = false) {
    if (busy.current) return;
    busy.current = true;
    const controller = new AbortController(); controllerRef.current = controller;
    setLoading(true); setFailed(false); setUnavailable(false);
    try {
      const result = await getBayFollowing(append ? cursor.current : null, controller.signal);
      if (controller.signal.aborted) return;
      cursor.current = result.next_cursor;
      setPage(current => ({ ...result, items: append ? [...current.items, ...result.items.filter(item => !current.items.some(old => old.kind === item.kind && old.id === item.id))] : result.items }));
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailed(true);
      setUnavailable(error instanceof BayApiError && (error.status === 404 || error.status === 501 || Boolean(error.code?.endsWith("_unavailable"))));
    } finally {
      if (!controller.signal.aborted) { setLoading(false); busy.current = false; }
    }
  }
  useEffect(() => {
    setPage({ items: [], next_cursor: null }); cursor.current = null;
    if (signedIn) void load(); else setLoading(false);
    const update = () => { cursor.current = null; setNonce(value => value + 1); };
    window.addEventListener("bay-follow-changed", update);
    return () => { controllerRef.current?.abort(); busy.current = false; window.removeEventListener("bay-follow-changed", update); };
  }, [signedIn, nonce]);
  useBayAutoRetry(failed && signedIn, () => load(Boolean(cursor.current)));
  if (!signedIn) return <div className="p-4 text-sm"><p>{tt("登录后查看关注动态。")}</p><button type="button" onClick={() => requireBayLogin()}>{tt("登录")}</button></div>;
  return <section data-bay-following className="space-y-4 p-4">
    <h2 className="text-lg font-semibold">{tt("关注动态")}</h2>
    {unavailable ? <p role="status">{tt("关注动态暂不可用。")}</p> : loading || failed ? <div role="status" aria-busy="true" className="space-y-3"><div className="h-40 animate-pulse rounded-xl bg-neutral-100" /><p>{tt("正在加载…")}</p></div> : null}
    {!loading && !failed && page.items.length === 0 ? <div data-bay-following-empty><p>{tt("你还没有关注任何人")}</p><a href="/leochat?find=1" className="text-sm underline">{tt("找人")}</a></div> : null}
    <ul className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,220px),1fr))" }}>
      {page.items.map(item => <FollowingCard key={`${item.kind}:${item.id}`} item={item} />)}
    </ul>
    {page.next_cursor ? <button type="button" disabled={loading || failed} onClick={() => void load(true)} className="text-sm underline">{tt("加载更多")}</button> : null}
  </section>;
}

function FollowingCard({ item }: { item: BayFollowingItem }) {
  const href = (item.href.startsWith("/") && !item.href.startsWith("//")) || /^https?:\/\//i.test(item.href) ? item.href : undefined;
  const date = new Date(item.created_at);
  return <li className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white">
    <a href={href} className="block p-3">
      {item.cover_url && /^https?:\/\//i.test(item.cover_url) ? <img src={item.cover_url} alt="" loading="lazy" className="h-40 w-full rounded-lg object-cover" /> : null}
      <h3 className="mt-2 text-[14px] font-semibold">{item.title}</h3>
      <p className="text-sm text-neutral-600">{item.author.name}{item.author.username ? ` @${item.author.username}` : ""}</p>
      {!Number.isNaN(date.getTime()) ? <time dateTime={item.created_at} className="text-xs text-neutral-500">{date.toLocaleString()}</time> : null}
    </a>
    <div className="p-3"><BayFollowButton userId={item.author.user_id} username={item.author.username || ""} initialFollowing={item.author.following} /></div>
  </li>;
}
