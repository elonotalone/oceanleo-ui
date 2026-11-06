"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addLibraryMemoArtifact, addLibraryMemoText, deleteLibraryMemoItem, listLibraryMemoItems, type LibraryMemoItem } from "../../lib/library-memo-api";
import { uploadFile } from "../../lib/database";
import { resolveAttachmentDisplayUrl } from "../../lib/attachment-url";
import { libraryMemoCopy as copy } from "../../i18n/ui/messages/library-memo-copy";

export interface LibraryMemoPageProps { className?: string; }

export function LibraryMemoPage({ className = "" }: LibraryMemoPageProps) {
  const [items, setItems] = useState<LibraryMemoItem[]>([]);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setItems((await listLibraryMemoItems()).items || []); setError(""); }
    catch { setError(copy.error); }
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
    catch { setError(copy.error); }
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
    } catch { setError(copy.error); }
    finally { setAdding(false); }
  };
  const remove = async (item: LibraryMemoItem) => {
    try { await deleteLibraryMemoItem(item.id); setItems((current) => current.filter((entry) => entry.id !== item.id)); }
    catch { setError(copy.error); }
  };

  return <section className={`flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 ${className}`} data-library-memo="">
    <header><h1 className="text-lg font-semibold">{copy.title}</h1><p className="text-sm opacity-70">{copy.description}</p></header>
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      <textarea ref={inputRef} value={text} onChange={(event) => setText(event.target.value)} maxLength={20000} placeholder={copy.addText} className="min-h-20 resize-y rounded border p-2" />
      <div className="flex gap-2"><button type="button" onClick={() => void saveText()} disabled={!text.trim() || adding}>{copy.save}</button><label className="cursor-pointer"><input type="file" className="sr-only" onChange={(event) => { void onFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />{copy.addFile}</label></div>
    </div>
    {error ? <p role="alert">{error}</p> : null}
    {loading ? <p>{copy.loading}</p> : items.length === 0 ? <p>{copy.empty}</p> : <ul className="flex flex-col gap-2">{items.map((item) => <li key={item.id} className="rounded-xl border p-3">
      {item.kind === "text" ? <p className="whitespace-pre-wrap">{item.text}</p> : <p>{item.artifact?.name || "文件"}</p>}
      <div className="mt-2 flex gap-2 text-sm"><button type="button" onClick={() => { if (item.kind === "text" && item.text) void navigator.clipboard?.writeText(item.text); }}>{copy.copy}</button>{item.artifact ? <><button type="button" onClick={async () => { const url = await resolveAttachmentDisplayUrl({ artifactId: item.artifact!.id, revisionId: item.artifact!.revision_id }, "source"); if (url) window.open(url, "_blank", "noopener,noreferrer"); }}>{copy.open}</button><button type="button" onClick={async () => { const url = await resolveAttachmentDisplayUrl({ artifactId: item.artifact!.id, revisionId: item.artifact!.revision_id }, "source"); if (url) { const link = document.createElement("a"); link.href = url; link.download = item.artifact!.name; link.click(); } }}>{copy.download}</button></> : null}<button type="button" onClick={() => void remove(item)}>{copy.delete}</button></div>
    </li>)}</ul>}
  </section>;
}

export default LibraryMemoPage;
