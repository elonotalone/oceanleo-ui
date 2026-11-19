"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { listInheritedOrgAssets, orgApiCode, orgErrorCopy, type InheritedOrgAsset } from "../lib/org-api";
import { getCurrentArtifactItem } from "./artifact-client";
import type { LibraryItem } from "./library-data";
import { COLLECTION_ACTION_BTN_GHOST } from "./collection-chrome";

const Viewer = lazy(() => import("./library-viewers").then((module) => ({ default: module.LibraryItemViewer })));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function inheritedAssetHref(ref: string): string | undefined {
  if (ref.startsWith("/") && !ref.startsWith("//") && !/[\\\s]/.test(ref)) return ref;
  try {
    const url = new URL(ref);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
  } catch { /* A stable opaque reference is displayed as text. */ }
  return undefined;
}

/** These are inherited references, separate from each publisher's own files. */
export function InheritedTeamLibrary({ ownerUserId, query = "" }: { ownerUserId: string; query?: string }) {
  const tt = useUI();
  const [snapshot, setSnapshot] = useState<{ owner: string; rows: InheritedOrgAsset[]; more: boolean }>({ owner: "", rows: [], more: false });
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [failedRead, setFailedRead] = useState<"list" | "preview">("list");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ owner: string; item: LibraryItem } | null>(null);
  const [opening, setOpening] = useState(false);
  const [openId, setOpenId] = useState("");
  const [openRevision, setOpenRevision] = useState(0);

  useEffect(() => {
    setOffset(0); setError(""); setPreview(null); setOpenId(""); setOpening(false);
  }, [ownerUserId]);

  useEffect(() => {
    if (!ownerUserId) return;
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    setLoading(true); setError("");
    void listInheritedOrgAssets(offset, controller.signal).then((result) => {
      if (!alive) return;
      if (result.ownerUserId !== ownerUserId || !Array.isArray(result.assets)) throw new Error("owner mismatch");
      if (!result.available) { setSnapshot({ owner: ownerUserId, rows: [], more: false }); return; }
      setSnapshot((current) => ({ owner: ownerUserId, rows: offset && current.owner === ownerUserId ? [...current.rows, ...result.assets] : result.assets, more: result.hasMore }));
    }).catch((cause) => { if (alive) { setFailedRead("list"); setError(orgErrorCopy(orgApiCode(cause), (key) => key)); } })
      .finally(() => { clearTimeout(timeout); if (alive) setLoading(false); });
    return () => { alive = false; clearTimeout(timeout); controller.abort(); };
  }, [ownerUserId, offset, revision]);

  useEffect(() => {
    if (!openId) return;
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    setOpening(true); setError("");
    void getCurrentArtifactItem(openId, controller.signal).then((result) => {
      if (!alive) return;
      if (result.ok && result.data) setPreview({ owner: ownerUserId, item: result.data });
      else { setFailedRead("preview"); setError("暂时无法预览"); }
    }).catch(() => { if (alive) { setFailedRead("preview"); setError("暂时无法预览"); } })
      .finally(() => { clearTimeout(timeout); if (alive) setOpening(false); });
    return () => { alive = false; clearTimeout(timeout); controller.abort(); };
  }, [openId, openRevision, ownerUserId]);

  const rows = snapshot.owner === ownerUserId ? snapshot.rows : [];
  const shown = rows.filter((row) => `${row.title} ${row.summary} ${row.publishedBy} ${row.assetRef}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const currentPreview = preview?.owner === ownerUserId ? preview.item : null;
  if (!ownerUserId || (!shown.length && !error && !loading && !snapshot.more)) return null;
  return <section data-inherited-team-library="" className="mt-3 rounded-xl border border-stone-200 bg-white p-3 text-[12px] text-neutral-700">
    <h2 className="mb-2 font-medium text-neutral-900">{tt("团队库")}</h2>
    {currentPreview ? <>
      <button type="button" className={COLLECTION_ACTION_BTN_GHOST} onClick={() => { setPreview(null); setOpenId(""); }}>{tt("返回")}</button>
      <div className="overflow-auto" style={{ height: 384 }}><Suspense fallback={null}><Viewer item={currentPreview} accent="#78716c" /></Suspense></div>
    </> : <ul className="max-h-64 divide-y divide-stone-200 overflow-auto">{shown.map((row) => {
      const href = inheritedAssetHref(row.assetRef);
      return <li key={row.id} className="flex items-center justify-between gap-3 py-2">
        <div className="min-w-0"><p className="truncate font-medium">{row.title || row.assetRef}</p>
          <p className="truncate text-neutral-500">{tt("署名：{name}", { name: row.publishedBy })}</p>
          {!href && !UUID.test(row.assetRef) && <p className="truncate">{row.assetRef}</p>}
        </div>
        {UUID.test(row.assetRef) ? <button type="button" className={COLLECTION_ACTION_BTN_GHOST} disabled={opening}
          onClick={() => { setOpenId(row.assetRef); setOpenRevision((value) => value + 1); }}>{tt("打开")}</button>
          : href ? <a className={COLLECTION_ACTION_BTN_GHOST} href={href} target="_blank" rel="noopener noreferrer">{tt("打开")}</a> : null}
      </li>;
    })}</ul>}
    {loading && <p role="status">{tt("加载中…")}</p>}
    {error && <div role="status"><p>{tt(error)}</p><button type="button" className={COLLECTION_ACTION_BTN_GHOST} onClick={() => { if (failedRead === "preview") setOpenRevision((value) => value + 1); else { setOffset(0); setRevision((value) => value + 1); } }}>{tt("重试")}</button></div>}
    {snapshot.owner === ownerUserId && snapshot.more && !currentPreview && <button type="button" className={COLLECTION_ACTION_BTN_GHOST} disabled={loading} onClick={() => setOffset(rows.length)}>{tt("加载更多")}</button>}
  </section>;
}
