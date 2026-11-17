"use client";
import { useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import { libraryExportSource } from "../library-document-export";
import { exportEditorForItem } from "../doc-editors/export-targets";
import { useExportDownloads } from "../doc-editors/use-export-downloads";
import { ExportResultToast } from "./ExportResultToast";
/** Saved-file targets come from the exact source format, never an editor's generators. */
export function LibraryExportMenu({ item, onClose, disabled }: { item: LibraryItem; onClose: () => void; disabled: boolean }) {
  const tt = useUI();
  const [href, setHref] = useState("");
  const [error, setError] = useState("");
  const editor = exportEditorForItem(item);
  const source = String(item.artifact?.sourceFormat || item.meta.filename || item.meta.format || item.url || "").split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  const downloads = useExportDownloads({ editor: editor || "richdoc", item, sourceFormat: source,
    localTargets: source ? [{ target: source, where: "client", label: source.toUpperCase() }] : [], disabled: disabled || !editor, generate: () => libraryExportSource(item) });
  async function run(action: typeof downloads[number], save: boolean) {
    setHref(""); setError("");
    try {
      if (save) setHref(await action.onSave() || ""); else { await action.onTrigger(); onClose(); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "导出失败，请重试"); }
  }
  return <>
    <ExportResultToast href={href} error={error} onClose={() => { setHref(""); setError(""); }} />
    {downloads.length ? downloads.map(action => <div key={action.id} role="group" aria-label={tt(action.label)} style={{ display: "flex", alignItems: "center" }}>
      <button type="button" role="menuitem" disabled={action.disabled} onClick={() => { void run(action, false); }} style={{ padding: 8, flex: 1, textAlign: "start" }}>{tt(action.label)} · {tt("下载")}</button>
      <button type="button" role="menuitem" disabled={action.disabled} aria-label={tt("存到我的库：{fmt}", { fmt: tt(action.label) })} onClick={() => { void run(action, true); }} style={{ padding: 8 }}>{tt("存到我的库")}</button>
    </div>) : <span role="status">{tt("格式列表暂时无法载入")}</span>}
  </>;
}
