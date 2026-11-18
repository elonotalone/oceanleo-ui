"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { LIVE_MATERIAL_LABELS, LIVE_MATERIAL_TYPES, materialHttpUrl, searchLiveMaterials, useLiveMaterial,
  type LiveMaterial, type LiveMaterialType } from "../../../lib/live-materials";
import type { LibraryItem } from "../../library-data";
import { SketchfabConnection } from "../../../pages/settings/SketchfabConnection";

const buttonClass = "min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-sm";

export function LiveMaterialSearch({ types = LIVE_MATERIAL_TYPES, initialQuery = "", initialType, actionLabel = "存到我的库", onUse }: {
  types?: readonly LiveMaterialType[]; initialQuery?: string; initialType?: LiveMaterialType;
  actionLabel?: string; onUse?: (item: LibraryItem) => Promise<void> | void;
}) {
  const tt = useUI();
  const typeKey = types.join(",");
  const [selectedType, setType] = useState<LiveMaterialType>(initialType && types.includes(initialType) ? initialType : types[0] || "image");
  const type = types.includes(selectedType) ? selectedType : types[0] || "image";
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<LiveMaterial[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<Record<string, "pending" | "done" | "failed">>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  const [connectionNeeded, setConnectionNeeded] = useState("");
  const [sketchfabReady, setSketchfabReady] = useState(false);
  const [variants, setVariants] = useState<Record<string, string>>({});
  // Cache only copies the user actually selected, including across failed insert attempts.
  const copies = useRef(new Map<string, LibraryItem>());
  const busy = useRef(new Set<string>());
  const lifecycle = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller;
    return () => controller.abort();
  }, []);
  const generation = useRef(0);
  useEffect(() => { setDraft(initialQuery); setQuery(initialQuery); }, [initialQuery]);
  useEffect(() => { setPage(1); setItems([]); setHasMore(false); setError(""); setMessage(""); setVariants({}); }, [type, query, typeKey]);
  useEffect(() => {
    if (!types.length) return;
    const controller = new AbortController();
    const request = ++generation.current;
    setLoading(true); setError("");
    void searchLiveMaterials({ q: query, type, page, signal: controller.signal }).then(result => {
      if (controller.signal.aborted || request !== generation.current) return;
      setItems(previous => page === 1 ? result.items : [...new Map([...previous, ...result.items].map(item => [item.id, item])).values()]);
      setHasMore(result.has_more); setPartial(result.partial); setLoading(false);
    }).catch(() => {
      if (!controller.signal.aborted && request === generation.current) { setLoading(false); setError("在线素材未能加载，请重试"); }
    });
    return () => controller.abort();
  }, [type, query, page, retry, typeKey]);

  async function choose(asset: LiveMaterial) {
    const key = `${asset.id}\u0000${variants[asset.id] || ""}`;
    if (busy.current.has(key)) return;
    busy.current.add(key); setSaving(previous => ({ ...previous, [key]: "pending" })); setMessage(""); setError("");
    try {
      let copy = copies.current.get(key);
      if (!copy) {
        copy = await useLiveMaterial({ id: asset.id, ...(variants[asset.id] ? { variant: variants[asset.id] } : {}) }, {
          signal: lifecycle.current?.signal,
          onProgress: state => { if (!lifecycle.current?.signal.aborted) setSaving(previous => ({ ...previous, [key]: state.state })); },
        });
        copies.current.set(key, copy);
      }
      if (lifecycle.current?.signal.aborted) return;
      setSaving(previous => ({ ...previous, [key]: "done" }));
      if (copy.meta.library_folder_id) {
        setMessage("已存到我的库");
        return;
      }
      await onUse?.(copy);
      setMessage(onUse ? "已使用素材" : "已存到我的库");
    } catch (caught) {
      if (lifecycle.current?.signal.aborted) return;
      setSaving(previous => ({ ...previous, [key]: "failed" }));
      const reason = caught instanceof Error && ["保存已中断，请重试", "库空间不足，请清理后重试", "存储服务暂不可用，请重试", "素材来源暂不可用，请重试"].includes(caught.message) ? caught.message : "素材未能存入我的库，请重试";
      setFailures(previous => ({ ...previous, [key]: reason }));
      const code = caught && typeof caught === "object" && "code" in caught ? String(caught.code) : "";
      if (asset.provider === "sketchfab" && /connect|auth|oauth|unconfigured/i.test(code)) { setSketchfabReady(false); setConnectionNeeded(asset.id); }
      setError("素材未能使用，请重试");
    } finally { busy.current.delete(key); }
  }

  return <section data-live-material-search className="flex min-h-0 flex-col gap-3 p-3">
    <div role="group" aria-label={tt("文件类型")} className="flex flex-wrap gap-2">
      {types.map(value => <button key={value} type="button" className={buttonClass} aria-pressed={type === value}
        onClick={() => setType(value)}>{tt(LIVE_MATERIAL_LABELS[value])}</button>)}
    </div>
    <form className="flex gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(draft.trim()); setRetry(value => value + 1); }}>
      <input type="search" aria-label={tt("搜索在线素材")} placeholder={tt("搜索在线素材")} value={draft}
        onChange={event => setDraft(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm" />
      <button type="submit" className={buttonClass}>{tt("搜索")}</button>
    </form>
    {error ? <p role="alert">{tt(error)} <button type="button" className={buttonClass} onClick={() => setRetry(value => value + 1)}>{tt("重试")}</button></p> : null}
    {partial ? <p role="status" className="text-xs text-[var(--fg-2)]">{tt("部分来源暂不可用，可重试获取更多素材")}</p> : null}
    {message ? <p role="status">{tt(message)}</p> : null}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy={loading}>
      {items.map(asset => {
        const key = `${asset.id}\u0000${variants[asset.id] || ""}`;
        const state = saving[key];
        const source = materialHttpUrl(asset.source_url);
        const licence = materialHttpUrl(asset.license.url);
        const preview = materialHttpUrl(asset.preview_url);
        const thumb = materialHttpUrl(asset.thumb_url) || (asset.type !== "video" ? preview : "");
        return <article key={asset.id} data-live-material={asset.id} className="flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--border)] p-3">
          {asset.type === "video" && preview ? <video src={preview} poster={thumb || undefined} controls preload="none" className="aspect-video w-full rounded-lg object-contain" />
            : thumb ? <img src={thumb} alt={asset.title} loading="lazy" className="aspect-video w-full rounded-lg object-contain" /> : null}
          <h3 className="text-sm font-medium">{asset.title}</h3>
          <span data-material-provider className="w-fit rounded bg-[var(--bg-2)] px-2 py-1 text-xs">{asset.provider === "polyhaven" ? "Poly Haven" : asset.provider}</span>
          {asset.author ? <p className="text-xs">{asset.author}</p> : null}
          {asset.collection || asset.provider === "iconify" ? <p className="text-xs">{asset.collection || asset.id.split(":")[1]}</p> : null}
          <p className="text-xs">{tt("许可")}: {licence ? <a href={licence} target="_blank" rel="noopener noreferrer" className="underline">{asset.license.code || tt("查看许可")}</a> : asset.license.code}</p>
          {asset.license.attributionText ? <p className="break-words text-xs text-[var(--fg-2)]">{asset.license.attributionText}</p> : null}
          {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="text-xs underline">{tt("来源页面")}</a> : null}
          {asset.provider === "pexels" ? <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="text-xs underline">{tt("照片和视频由 Pexels 提供")}</a> : null}
          {asset.provider === "openverse" ? <a href="https://openverse.org" target="_blank" rel="noopener noreferrer" className="text-xs underline">Openverse</a> : null}
          {asset.formats.length > 1 ? <label className="text-xs">{tt("文件格式")}<select aria-label={tt("文件格式")} className="ml-2 min-h-11 rounded border bg-[var(--card)] p-2" value={variants[asset.id] || ""}
            onChange={event => setVariants(previous => ({ ...previous, [asset.id]: event.target.value }))}>
            <option value="">{tt("默认")}</option>{asset.formats.map(format => <option key={format} value={format}>{format}</option>)}
          </select></label> : null}
          {state ? <p role={state === "failed" ? "alert" : "status"} className="text-xs">{tt(state === "pending" ? "正在存入我的库…" : state === "done" ? "已存到我的库" : failures[key] || "素材未能存入我的库，请重试")}</p> : null}
          {((asset.needs_connection === "sketchfab" && !sketchfabReady) || connectionNeeded === asset.id) ? <SketchfabConnection compact onConnected={() => { setSketchfabReady(true); setConnectionNeeded(""); }} />
            : <button type="button" disabled={state === "pending"} className={buttonClass} onClick={() => void choose(asset)}>{tt(state === "pending" ? "正在存入我的库…" : state === "failed" ? "重试" : ["texture", "hdri", "font"].includes(asset.type) ? "存到我的库" : actionLabel)}</button>}
        </article>;
      })}
    </div>
    {loading ? <p role="status">{tt("加载中…")}</p> : !items.length && !error ? <p>{tt("暂无素材")}</p> : null}
    {!loading && hasMore && !error ? <button type="button" className={buttonClass} onClick={() => setPage(value => value + 1)}>{tt("加载更多")}</button> : null}
  </section>;
}
