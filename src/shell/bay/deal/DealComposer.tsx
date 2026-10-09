"use client";

// 交易会话的输入框：文字 + 文件（走站内消息现有的上传，存成 https 地址）+ 卖家可发报价。
// Enter 发送、Shift+Enter 换行（输入法组字时 Enter 不发送）。签约后整块换成「在项目群里沟通」的提示条。

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { DEAL_BODY_LIMIT, DEAL_MAX_ATTACHMENTS, type DealAttachment } from "../../../lib/bay/threads";
import { uploadAttachment, UploadError } from "../../messages/composer/upload";

export interface DealComposerProps {
  disabled?: boolean;
  /** 发送；返回 false 表示没发（内容保留）；抛错时内容保留、错误显示在上方。 */
  onSend: (body: string, attachments: DealAttachment[]) => Promise<boolean>;
  canOffer?: boolean;
  offerOpen?: boolean;
  onToggleOffer?: () => void;
  error?: string | null;
  /** 测试注入；默认用站内消息的上传。 */
  upload?: (file: File) => Promise<DealAttachment>;
}

interface PendingFile {
  key: string;
  name: string;
  status: "uploading" | "done" | "failed";
  attachment: DealAttachment | null;
}

async function defaultUpload(file: File): Promise<DealAttachment> {
  const done = await uploadAttachment(file);
  return {
    url: done.url,
    name: done.name || file.name,
    kind: done.kind === "voice" ? "audio" : done.kind,
    size: done.size,
    mime: done.mime,
  };
}

let fileSeq = 0;

export function DealComposer({
  disabled = false,
  onSend,
  canOffer = false,
  offerOpen = false,
  onToggleOffer,
  error = null,
  upload = defaultUpload,
}: DealComposerProps) {
  const tt = useUI();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const uploading = files.some((file) => file.status === "uploading");
  const ready = files.filter((file) => file.status === "done" && file.attachment).map((file) => file.attachment as DealAttachment);
  const canSend = !disabled && !busy && !uploading && (value.trim().length > 0 || ready.length > 0);

  async function submit() {
    if (!canSend) return;
    setBusy(true);
    try {
      const sent = await onSend(value.trim(), ready);
      if (sent) {
        setValue("");
        setFiles([]);
      }
    } catch {
      // 错误由上层显示，内容保留以便重发
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  }

  function uploadErrorText(err: unknown): string {
    if (err instanceof UploadError) {
      if (err.code === "too_large") return tt("单个文件最大 100MB");
      if (err.code === "empty") return tt("文件是空的");
    }
    return tt("文件没传上去，请稍后再试。");
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    setFileError(null);
    const room = Math.max(0, DEAL_MAX_ATTACHMENTS - files.length);
    if (picked.length > room) setFileError(tt("每条消息最多 10 个文件"));
    for (const file of picked.slice(0, room)) {
      fileSeq += 1;
      const key = `f${fileSeq}`;
      setFiles((prev) => [...prev, { key, name: file.name, status: "uploading", attachment: null }]);
      upload(file).then(
        (attachment) =>
          setFiles((prev) => prev.map((item) => (item.key === key ? { ...item, status: "done", attachment } : item))),
        (err) => {
          setFileError(uploadErrorText(err));
          setFiles((prev) => prev.map((item) => (item.key === key ? { ...item, status: "failed" } : item)));
        },
      );
    }
  }

  return (
    <div data-deal-composer className="border-t border-neutral-200 px-3 py-2">
      {error || fileError ? (
        <p role="alert" data-composer-error className="pb-1 text-[12px] text-red-600">
          {error || fileError}
        </p>
      ) : null}
      {files.length ? (
        <ul data-composer-files className="flex flex-wrap gap-1.5 pb-1.5">
          {files.map((file) => (
            <li
              key={file.key}
              data-file-status={file.status}
              className={
                "flex max-w-[220px] items-center gap-1 rounded-lg border px-2 py-0.5 text-[12px] " +
                (file.status === "failed" ? "border-red-200 text-red-600" : "border-neutral-200 text-neutral-700")
              }
            >
              <span className="truncate">{file.name}</span>
              <span className="shrink-0 text-neutral-400">
                {file.status === "uploading" ? tt("上传中…") : file.status === "failed" ? tt("失败") : ""}
              </span>
              <button
                type="button"
                aria-label={tt("移除")}
                data-action="remove-file"
                onClick={() => setFiles((prev) => prev.filter((item) => item.key !== file.key))}
                className="shrink-0 text-neutral-400 hover:text-neutral-700"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-end gap-2">
        <input ref={inputRef} type="file" multiple hidden data-composer-file-input onChange={onPick} />
        <button
          type="button"
          disabled={disabled || files.length >= DEAL_MAX_ATTACHMENTS}
          data-action="attach"
          aria-label={tt("发文件")}
          title={tt("发文件")}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-neutral-200 px-2.5 py-2 text-[13px] font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-40"
        >
          📎
        </button>
        <textarea
          value={value}
          rows={1}
          maxLength={DEAL_BODY_LIMIT}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={tt("写点什么…")}
          aria-label={tt("消息内容")}
          data-composer-input
          data-bay-deal-composer
          className="max-h-32 min-h-[38px] min-w-0 flex-1 resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[14px] text-neutral-900"
        />
        <button
          type="button"
          disabled={!canSend}
          data-action="send"
          onClick={() => void submit()}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-stone-800 disabled:opacity-40"
        >
          {tt("发送")}
        </button>
      </div>
      {canOffer && onToggleOffer ? (
        <div className="pt-1.5">
          <button
            type="button"
            data-action="toggle-offer"
            aria-expanded={offerOpen}
            onClick={onToggleOffer}
            className="text-[12px] font-medium text-stone-700 underline underline-offset-2 hover:text-stone-900"
          >
            {offerOpen ? tt("收起报价") : tt("发报价")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export interface DealLockedBarProps {
  onOpenProject: () => void;
}

/** 签约后代替输入框：之后在项目群里沟通。 */
export function DealLockedBar({ onOpenProject }: DealLockedBarProps) {
  const tt = useUI();
  return (
    <div data-deal-locked className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-3 py-2.5">
      <p className="text-[12.5px] text-neutral-600">{tt("已签约，之后在项目群里沟通。")}</p>
      <button
        type="button"
        data-action="open-project"
        onClick={onOpenProject}
        className="rounded-lg bg-neutral-900 px-3 py-1 text-[12px] text-white hover:bg-neutral-800"
      >
        {tt("打开项目群")}
      </button>
    </div>
  );
}

export interface DealBlockedBarProps {
  busy?: boolean;
  onUnblock: () => void;
}

/** 我拉黑了对方：不再显示输入框，可以解除。 */
export function DealBlockedBar({ busy = false, onUnblock }: DealBlockedBarProps) {
  const tt = useUI();
  return (
    <div data-deal-blocked className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-3 py-2.5">
      <p className="text-[12.5px] text-neutral-600">{tt("你已拉黑对方，解除后才能继续发消息。")}</p>
      <button
        type="button"
        disabled={busy}
        data-action="unblock"
        onClick={onUnblock}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
      >
        {tt("解除拉黑")}
      </button>
    </div>
  );
}
