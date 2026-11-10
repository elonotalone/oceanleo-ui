"use client";

import { useEffect, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { embedCheck, worksApi } from "../../lib/works-api";
import type { LibraryItem } from "../library-data";
import { linkWorkFromLibraryItem } from "./link-work-item";
import { Button, ConfirmDialog } from "../../ui";
import { LinkWorkDialog } from "./LinkWorkDialog";

export const LINK_WORK_FRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads";

/** Standard Library action row for a link item. */
export function LinkWorkActions({ item, onDeleted }: { item: LibraryItem; onDeleted?: () => void }) {
  const tt = useUI();
  const work = linkWorkFromLibraryItem(item);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  if (!work) return null;
  const remove = async () => {

    try {
      await worksApi.remove(work.id);
      window.dispatchEvent(new CustomEvent("oceanleo:artifact-library-change"));
      onDeleted?.();
    } catch {
      setError(tt("删除失败，请重试"));
    } finally { setDeleting(false); }
  };
  return <>
    <a href={work.links[0]?.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]">{tt("在新标签页打开")}</a>
    <Button variant="secondary" onClick={() => setEditing(true)}>{tt("编辑")}</Button>
    <Button variant="danger" onClick={() => setDeleting(true)}>{tt("删除")}</Button>
    {error && <span role="alert">{error}</span>}
    {deleting && <ConfirmDialog title="确认删除这个链接项目吗？" confirmLabel="删除" danger onCancel={() => setDeleting(false)} onConfirm={remove} />}
    {editing && <LinkWorkDialog mode="edit" work={work} onClose={() => setEditing(false)} />}
  </>;
}

export function LinkWorkViewer({ item }: { item: LibraryItem }) {
  const tt = useUI();
  const work = linkWorkFromLibraryItem(item);
  const link = work?.links[0];
  const url = link?.url;
  const [embed, setEmbed] = useState<boolean | null>(null);
  useEffect(() => {
    setEmbed(null);
    if (!url) return;
    let active = true;
    void embedCheck(url).then((result) => { if (active) setEmbed(result.embeddable); }).catch(() => { if (active) setEmbed(null); });
    return () => { active = false; };
  }, [url]);
  if (!work || !link) return <div role="alert" className="p-6 text-sm text-red-600">{tt("链接无效")}</div>;
  return (
    <section className="flex h-full min-h-[420px] flex-col bg-white" data-link-work-id={work.id}>
      {embed === false ? (
        <div role="status" className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-stone-600">
          <p>{tt("暂时无法预览")}</p>
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-stone-200 px-3 py-1.5 text-[13px] text-stone-600 hover:bg-stone-50">{tt("在新标签页打开")}</a>
        </div>
      ) : (
        <iframe src={link.url} title={work.title} className="h-full min-h-[360px] w-full border-0" sandbox={LINK_WORK_FRAME_SANDBOX} referrerPolicy="no-referrer" allow="" />
      )}
    </section>
  );
}
