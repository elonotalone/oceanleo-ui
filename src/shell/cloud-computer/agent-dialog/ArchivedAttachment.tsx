"use client";
import { useState } from "react";
import * as computerApi from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";
import { safeArchivedAttachment, type UserAttachment } from "./message-attachments";

/** Retrieve an owner-checked, expiring URL only after the user requests the file. */
export function ArchivedAttachmentLink({ attachment }: { attachment: UserAttachment }) {
  const tt = useUI();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const archive = safeArchivedAttachment(attachment.archive);
  if (!archive) return <span>{attachment.name}</span>;
  async function prepare() {
    if (busy || !archive) return;
    setBusy(true); setError("");
    try {
      const result = await computerApi.cloudComputerRequest<{url: string}>(archive.download_path);
      const parsed = new URL(result.url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(tt("附件下载地址无效"));
      setUrl(parsed.href);
    } catch (reason) { setError(reason instanceof Error ? reason.message : tt("附件读取失败")); }
    finally { setBusy(false); }
  }
  return <span>
    {url ? <a href={url} target="_blank" rel="noreferrer" download={archive.name}>{attachment.name} · {tt("下载")}</a> : <button type="button" disabled={busy} onClick={() => void prepare()}>{attachment.name} · {busy ? tt("正在读取…") : tt("获取云端附件")}</button>}
    {error ? <span role="alert">{error}</span> : null}
  </span>;
}
