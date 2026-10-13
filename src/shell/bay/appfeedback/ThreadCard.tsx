"use client";

import type { ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayAppThread } from "../../../lib/bay/app-feedback";
import { openBay } from "../shell/bay-state";
import { Avatar } from "../supply/parts";
import { authorDisplayName, formatThreadTime, kindLabel, previewBody, statusLabel } from "./feedback-model";

export function ThreadCard({
  thread,
  showAppTitle = false,
  timeField = "created_at",
}: {
  thread: BayAppThread;
  showAppTitle?: boolean;
  timeField?: "created_at" | "last_post_at";
}): ReactElement {
  const tt = useUI();
  const name = authorDisplayName(thread.author.display_name);
  const time = formatThreadTime(timeField === "last_post_at" ? thread.last_post_at : thread.created_at);
  return (
    <button
      type="button"
      data-bay-thread={thread.id}
      onClick={() => openBay({ kind: "app-thread", id: thread.id })}
      className="block w-full py-3 text-left hover:opacity-80"
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span data-bay-thread-kind={thread.kind} className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-neutral-600">
          {tt(kindLabel(thread.kind))}
        </span>
        <span data-bay-thread-status={thread.status} className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-neutral-600">
          {tt(statusLabel(thread.status))}
        </span>
        {thread.visibility === "private" ? (
          <span data-bay-thread-private className="rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-800">
            {tt("仅作者可见")}
          </span>
        ) : null}
        {thread.ai_answered ? (
          <span data-bay-thread-ai className="rounded-md bg-sky-50 px-1.5 py-0.5 text-sky-800">
            {tt("AI 已回答")}
          </span>
        ) : null}
      </div>
      {showAppTitle && thread.app_title ? (
        <p className="mt-1.5 truncate text-[12px] text-neutral-500">{thread.app_title}</p>
      ) : null}
      <p className="mt-1.5 break-words text-[14px] font-semibold text-neutral-900">{thread.title}</p>
      {thread.body ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-neutral-600">{previewBody(thread.body)}</p>
      ) : null}
      <div className="mt-2 flex items-center gap-2 text-[12px] text-neutral-500">
        <Avatar url={thread.author.avatar_url} name={name} size="sm" />
        <span className="min-w-0 truncate">{name}</span>
        {time ? <span>{time}</span> : null}
        <span>{tt("{n} 条回复", { n: thread.reply_count })}</span>
      </div>
    </button>
  );
}
