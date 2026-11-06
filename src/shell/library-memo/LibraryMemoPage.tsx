"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addLibraryMemoArtifact, addLibraryMemoText, deleteLibraryMemoItem, listLibraryMemoItems, type LibraryMemoItem } from "../../lib/library-memo-api";
import { uploadFile } from "../../lib/database";
import { resolveAttachmentDisplayUrl } from "../../lib/attachment-url";
import { useUI } from "../../i18n/ui/useUI";
import { COLLECTION_ACTION_BTN_PRIMARY } from "../collection-chrome";

export interface LibraryMemoPageProps { className?: string; }

export function LibraryMemoPage({ className = "" }: LibraryMemoPageProps) {
  const tt = useUI();
  const [items, setItems] = useState<LibraryMemoItem[]>([]);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = (await listLibraryMemoItems()).items || [];
      setItems([...next].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)));
      setError("");
    }
    catch { setError(tt("Memo 暂时无法加载，请重试。")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const saveText = async () => {
    if (!text.trim() || adding) return;
    setAdding(true);
    try { const result = await addLibraryMemoText(text); setItems((current) => [result.item, ...current]); setText(""); }
    catch { setError(tt("Memo 暂时无法加载，请重试。")); }
    finally { setAdding(false); }
  };
  const onFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || adding) return;
    setAdding(true);
    try {
      const uploaded = await uploadFile(file, { title: file.name, siteId: "home", privateUpload: true });
      const row = uploaded.data?.file as { artifact_id?: string; revision_id?: string; artifact?: { id?: string; revision_id?: string } } | undefined;
      const artifactId = row?.artifact_id || row?.artifact?.id;
      const revisionId = row?.revision_id || row?.artifact?.revision_id;
      if (!uploaded.ok || !artifactId) throw new Error("upload failed");
      const result = await addLibraryMemoArtifact(artifactId, revisionId);
      setItems((current) => [result.item, ...current]);
    } catch { setError(tt("Memo 暂时无法加载，请重试。")); }
    finally { setAdding(false); }
  };
  const remove = async (item: LibraryMemoItem) => {
    try { await deleteLibraryMemoItem(item.id); setItems((current) => current.filter((entry) => entry.id !== item.id)); }
    catch { setError(tt("Memo 暂时无法加载，请重试。")); }
  };

  const artifactUrl = useRef(new Map<string, string>());
  const [, redraw] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all(items.filter((item) => item.artifact).map(async (item) => {
      const artifact = item.artifact!;
      const url = await resolveAttachmentDisplayUrl({ artifactId: artifact.id, revisionId: artifact.revision_id }, "source");
      if (active && url) artifactUrl.current.set(item.id, url);
    })).then(() => { if (active) redraw((value) => value + 1); });
    return () => { active = false; };
  }, [items]);

  return <section className={`flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 ${className}`} data-library-memo="">
    <header><h1 className="text-lg font-semibold">{tt("Memo")}</h1><p className="text-sm opacity-70">{tt("在所有设备共享的文字、图片和文件。")} </p></header>
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      <textarea ref={inputRef} value={text} onChange={(event) => setText(event.target.value)} onInput={(event) => setText(event.currentTarget.value)} maxLength={20000} placeholder={tt("添加文字")} className="min-h-20 resize-y rounded border p-2" />
      <div className="flex gap-2"><button type="button" className={COLLECTION_ACTION_BTN_PRIMARY} onClick={() => void saveText()} disabled={!text.trim() || adding}>{tt("保存")}</button><label className={`${COLLECTION_ACTION_BTN_PRIMARY} cursor-pointer`}><input type="file" className="sr-only" onChange={(event) => { void onFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />{tt("添加图片或文件")}</label></div>
    </div>
    {error ? <p role="alert">{error}</p> : null}
    {loading ? <p>{tt("正在加载 Memo…")}</p> : items.length === 0 ? <p>{tt("Memo 还是空的")}</p> : <ul className="flex flex-col gap-2">{items.map((item) => <li key={item.id} className="rounded-xl border p-3">
      {item.kind === "text" ? <p className="whitespace-pre-wrap">{item.text}</p> : <>{item.artifact && /^image\//.test(item.artifact.media_type) && artifactUrl.current.get(item.id) ? <img src={artifactUrl.current.get(item.id)} alt={item.artifact.name} className="mb-2 max-h-48 max-w-full rounded object-contain" /> : null}<p>{item.artifact?.name || tt("文件")}</p></>}
      <div className="mt-2 flex gap-2 text-sm"><button type="button" onClick={() => { if (item.kind === "text" && item.text) void navigator.clipboard?.writeText(item.text); }}>{tt("复制")}</button>{item.artifact ? <><button type="button" onClick={() => { const url = artifactUrl.current.get(item.id); if (url) window.open(url, "_blank", "noopener,noreferrer"); }}>{tt("打开")}</button><button type="button" onClick={() => { const url = artifactUrl.current.get(item.id); if (url) { const link = document.createElement("a"); link.href = url; link.download = item.artifact!.name; link.click(); } }}>{tt("下载")}</button></> : null}<button type="button" onClick={() => void remove(item)}>{tt("删除")}</button></div>
    </li>)}</ul>}
  </section>;
}

export default LibraryMemoPage;
