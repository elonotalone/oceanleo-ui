"use client";

// 输入框上方的附件托盘：每个文件一行，进度、取消、失败重试、移除。
import { useUI } from "../../../i18n/ui/useUI";
import { formatBytes } from "../conversation/AttachmentView";
import { ImCloseIcon } from "../messages-surface";
import type { UploadErrorCode, UploadJob } from "./upload";

function errorText(tt: (zh: string, vars?: Record<string, string | number>) => string, code: UploadErrorCode | null): string {
  switch (code) {
    case "too_large":
      return tt("文件超过 100MB，不能发送");
    case "empty":
      return tt("文件是空的");
    case "cancelled":
      return tt("已取消");
    default:
      return tt("上传失败");
  }
}

export function AttachmentTray({
  jobs,
  onCancel,
  onRetry,
  onRemove,
}: {
  jobs: UploadJob[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const tt = useUI();
  if (jobs.length === 0) return null;
  return (
    <ul className="space-y-1 px-3 pt-2" data-attachment-tray="">
      {jobs.map((job) => (
        <li
          key={job.id}
          className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[12.5px]"
          data-upload-status={job.status}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-neutral-800">{job.file.name}</span>
            <span className="block text-[11.5px] text-neutral-400">
              {job.status === "uploading" ? (
                <>
                  <span className="mr-2 inline-block h-1 w-24 overflow-hidden rounded-full bg-neutral-200 align-middle">
                    <span className="block h-full bg-neutral-900" style={{ width: `${Math.round(job.ratio * 100)}%` }} />
                  </span>
                  {Math.round(job.ratio * 100)}% · {formatBytes(job.file.size)}
                </>
              ) : null}
              {job.status === "done" ? `${formatBytes(job.file.size)} · ${tt("已上传")}` : null}
              {job.status === "failed" ? <span className="text-red-600">{errorText(tt, job.error)}</span> : null}
            </span>
          </span>
          {job.status === "uploading" ? (
            <button type="button" onClick={() => onCancel(job.id)} className="shrink-0 text-neutral-500 hover:text-neutral-800">
              {tt("取消")}
            </button>
          ) : null}
          {job.status === "failed" && job.error !== "too_large" && job.error !== "empty" ? (
            <button type="button" onClick={() => onRetry(job.id)} className="shrink-0 text-neutral-700 hover:underline">
              {tt("重试")}
            </button>
          ) : null}
          {job.status !== "uploading" ? (
            <button type="button" onClick={() => onRemove(job.id)} aria-label={tt("移除")} className="shrink-0 text-neutral-400 hover:text-neutral-700">
              <ImCloseIcon />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
