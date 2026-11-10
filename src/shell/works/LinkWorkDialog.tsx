"use client";

import { useId, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { worksApi } from "../../lib/works-api";
import { Modal, Button } from "../../ui";
import { BAY_FORM_INPUT_CLASS, BAY_FORM_TEXTAREA_CLASS, BAY_FORM_LABEL_CLASS } from "../bay/form/form-ui";
import type { LinkWork } from "./link-work-item";

const validHttps = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
};

export interface LinkWorkDialogProps {
  mode: "create" | "edit";
  work?: LinkWork | null;
  onClose: () => void;
  onSaved?: (id: string) => void | Promise<void>;
}

/** The sole link form used by both Library Upload → Add link and detail Edit. */
export function LinkWorkDialog({ mode, work, onClose, onSaved }: LinkWorkDialogProps) {
  const tt = useUI();
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState("");
  const first = work?.links[0];
  const [title, setTitle] = useState(work?.title || "");
  const [url, setUrl] = useState(first?.url || "");
  const [note, setNote] = useState(work?.note || "");
  const [error, setError] = useState("");
  const save = async () => {
    const cleanTitle = title.trim();
    const cleanUrl = url.trim();
    if (!cleanTitle) return setError(tt("请填写标题"));
    if (!validHttps(cleanUrl)) return setError(tt("请填写有效的 HTTPS 链接"));
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const body = { title: cleanTitle, links: [{ label: "链接", url: cleanUrl }], note: note.trim() };
      const existingId = savedId || (mode === "edit" ? work?.id : "");
      const saved = existingId
        ? (await worksApi.update(existingId, body)).id
        : (await worksApi.createLink(body)).id;
      setSavedId(saved);
      await onSaved?.(saved);
      window.dispatchEvent(new CustomEvent("oceanleo:artifact-library-change"));
      onClose();
    } catch {
      setError(tt("保存失败，请重试"));
    } finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <h2 id={titleId} className="text-[15px] font-semibold text-neutral-900">{tt(mode === "edit" ? "编辑链接" : "添加链接")}</h2>
        <label className="flex flex-col gap-2"><span className={BAY_FORM_LABEL_CLASS}>{tt("名称")}</span>
          <input className={BAY_FORM_INPUT_CLASS} maxLength={200} disabled={busy} value={title} onChange={(event) => { setTitle(event.target.value); }} />
        </label>
        <label className="flex flex-col gap-2"><span className={BAY_FORM_LABEL_CLASS}>{tt("链接")}</span>
          <input className={BAY_FORM_INPUT_CLASS} type="url" disabled={busy} value={url} onChange={(event) => { setUrl(event.target.value); }} placeholder="https://" />
        </label>
        <label className="flex flex-col gap-2"><span className={BAY_FORM_LABEL_CLASS}>{tt("介绍")}</span>
          <textarea className={BAY_FORM_TEXTAREA_CLASS} disabled={busy} value={note} onChange={(event) => { setNote(event.target.value); }} />
        </label>
        {error && <p role="alert" className="text-[13px] text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{tt("取消")}</Button>
          <Button type="submit" disabled={busy}>{tt("保存")}</Button>
        </div>
      </form>
    </Modal>
  );
}
