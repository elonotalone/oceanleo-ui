"use client";
import { useEffect, useRef, useState } from "react";
import { flushAdvancedDraftGate } from "../advanced-draft-gates";
import type { LibraryItem } from "../library-data";
import { downloadBlob } from "./doc-io";
import { convertExportFile, libraryExportHref, loadExportCapabilities, saveExportToLibrary, type ExportFile } from "./export-client";
import { CLIENT_EXPORT_TARGETS, exportTargetExtension, mergeExportTargets, type ExportCapabilities, type ExportEditor, type ExportTarget } from "./export-targets";
export function useExportDownloads({ editor, item, generate, disabled = false, sourceFormat, localTargets }: {
  editor: ExportEditor; item: LibraryItem; generate: (target: string, options?: { quality?: number }) => Promise<ExportFile>;
  disabled?: boolean; sourceFormat?: string; localTargets?: readonly ExportTarget[];
}) {
  const [capabilities, setCapabilities] = useState<ExportCapabilities | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const latestItem = useRef(item); latestItem.current = item;
  useEffect(() => {
    let alive = true;
    void loadExportCapabilities().then(value => { if (alive) setCapabilities(value); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const targets = mergeExportTargets(capabilities, editor, localTargets ?? CLIENT_EXPORT_TARGETS[editor], sourceFormat);
  async function run(target: string, save: boolean, options?: { quality?: number }) {
    if (disabled || running.current) return;
    running.current = true; setBusy(true);
    try {
      const receipt = await flushAdvancedDraftGate(latestItem.current.key || latestItem.current.id, "export");
      if (receipt && !receipt.ok) throw new Error(receipt.errorMessage || receipt.error || "导出失败，请重试");
      const parent = receipt?.ok && receipt.item ? receipt.item : latestItem.current;
      const source = await generate(target, options);
      if (!source.blob.size) throw new Error("导出失败，请重试");
      if (save) return libraryExportHref(await saveExportToLibrary(source, target, parent));
      const blob = await convertExportFile(source, target);
      const stem = (item.title || "file").replace(/\.[a-z0-9]+$/i, "");
      downloadBlob(`${stem}.${exportTargetExtension(target)}`, blob);
    } finally { running.current = false; setBusy(false); }
  }
  return targets.map(target => ({
    id: `${editor}-export-${target.target}`, target: target.target, label: target.label, icon: "download" as const,
    group: "download" as const, disabled: disabled || busy, busy,
    onTrigger: (options?: { quality?: number }) => run(target.target, false, options).then(() => {}),
    onSave: () => run(target.target, true),
  }));
}
