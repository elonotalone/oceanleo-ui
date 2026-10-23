"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  getBayAppThread,
  replyBayAppThread,
  reportBayAppThread,
  setBayAppThreadStatus,
  type BayAppThreadDetail,
} from "../../../lib/bay/app-feedback";
import { openBay, requireBayLogin, type BayPaneProps } from "../shell/bay-state";
import { Avatar, PaneLoading, PaneMessage, ReportBox } from "../supply/parts";
import {
  REPLY_MAX,
  actionErrorText,
  authorDisplayName,
  canReplyOrResolve,
  canReportThread,
  formatThreadTime,
  isNotFound,
  kindLabel,
  nextStatusAction,
  replyProblem,
  sortPostsOldToNew,
  statusLabel,
} from "./feedback-model";

export function AppThreadPane(props: BayPaneProps): ReactElement | null {
  const tt = useUI();
  const threadId = props.target.kind === "app-thread" ? props.target.id : "";
  const [detail, setDetail] = useState<BayAppThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    if (!threadId) {
      setMissing(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setMissing(false);
    try {
      setDetail(await getBayAppThread(threadId));
    } catch (caught) {
      if (isNotFound(caught)) {
        setMissing(true);
        setDetail(null);
        return;
      }
      setError(actionErrorText(caught, tt("留言没读出来，请稍后点「重试」。")));
    } finally {
      setLoading(false);
    }
  }, [threadId, tt]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendReply() {
    if (!threadId || busy) return;
    if (!requireBayLogin()) return;
    const problem = replyProblem(reply);
    if (problem) {
      setReplyError(tt(problem));
      return;
    }
    setBusy(true);
    setReplyError("");
    setActionError("");
    try {
      setDetail(await replyBayAppThread(threadId, reply.trim()));
      setReply("");
    } catch (caught) {
      setActionError(actionErrorText(caught, tt("这次没提交成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus() {
    if (!threadId || !detail || busy) return;
    if (!requireBayLogin()) return;
    const action = nextStatusAction(detail.thread.status);
    setBusy(true);
    setActionError("");
    try {
      const result = await setBayAppThreadStatus(threadId, action.next);
      setDetail((prev) => (prev ? { ...prev, thread: result.thread } : prev));
    } catch (caught) {
      setActionError(actionErrorText(caught, tt("这次没提交成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  if (!threadId) return null;
  if (loading && !detail) return <PaneLoading />;
  if (missing) {
    return (
      <div data-bay-pane="app-thread" className="p-4">
        <PaneMessage text={tt("这条留言不存在，或者只有留言的人和作者能看")} />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div data-bay-pane="app-thread" className="p-4">
        <PaneMessage text={error || tt("留言没读出来，请稍后点「重试」。")} onRetry={() => void load()} />
      </div>
    );
  }

  const thread = detail.thread;
  const posts = sortPostsOldToNew(detail.posts);
  const writable = canReplyOrResolve(thread);
  const statusAction = nextStatusAction(thread.status);
  const authorName = authorDisplayName(thread.author.display_name);
  const created = formatThreadTime(thread.created_at);

  return (
    <div data-bay-pane="app-thread" className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span data-bay-thread-kind={thread.kind} className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-neutral-600">
          {tt(kindLabel(thread.kind))}
        </span>
        <span data-bay-thread-status={thread.status} className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-neutral-600">
          {tt(statusLabel(thread.status))}
        </span>
        {thread.visibility === "private" ? (
          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-800">{tt("仅作者可见")}</span>
        ) : null}
      </div>
      <h2 className="break-words text-[18px] font-semibold text-neutral-950">{thread.title}</h2>
      <div className="flex items-center gap-2 text-[12px] text-neutral-500">
        <Avatar url={thread.author.avatar_url} name={authorName} size="sm" />
        <span className="min-w-0 truncate">{authorName}</span>
        {created ? <span>{created}</span> : null}
      </div>
      <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-neutral-800">{thread.body}</p>
      <button
        type="button"
        data-bay-app-link
        onClick={() => openBay({ kind: "app", id: thread.app_id })}
        className="text-[13px] text-neutral-700 hover:underline"
      >
        {tt("所属网站或软件")}
        {thread.app_title ? ` · ${thread.app_title}` : ""}
      </button>

      <div data-bay-thread-posts className="space-y-2">
        {posts.map((post) => {
          const name = authorDisplayName(post.author.display_name);
          const ai = post.author_kind === "ai";
          const owner = post.author_kind === "owner";
          return (
            <article key={post.id} data-bay-thread-post={post.id} className="py-2">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-neutral-500">
                {ai ? null : <Avatar url={post.author.avatar_url} name={name} size="sm" />}
                <span className="font-medium text-neutral-800">{ai ? tt("AI 助手") : name}</span>
                {owner ? <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">{tt("作者")}</span> : null}
                {ai ? <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-800">{tt("AI 助手")}</span> : null}
                {formatThreadTime(post.created_at) ? <span>{formatThreadTime(post.created_at)}</span> : null}
              </div>
              {ai ? <p className="mt-1 text-[11px] text-neutral-400">{tt("由 AI 根据网站或软件的资料生成，可能不准确")}</p> : null}
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-neutral-700">{post.body}</p>
            </article>
          );
        })}
      </div>

      {writable ? (
        <div className="space-y-2">
          <textarea
            value={reply}
            maxLength={REPLY_MAX + 8}
            rows={4}
            data-bay-field="reply"
            onChange={(event) => setReply(event.target.value)}
            className="w-full rounded-full border border-neutral-900 bg-white px-3 py-2 text-[13px] outline-none focus:border-stone-400"
          />
          {replyError ? (
            <p data-bay-field-error="reply" className="text-[12px] text-rose-600">
              {replyError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-bay-action="reply"
              disabled={busy}
              onClick={() => void sendReply()}
              className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12.5px] text-white disabled:opacity-50"
            >
              {busy ? tt("回复中…") : tt("回复")}
            </button>
            <button
              type="button"
              data-bay-action={statusAction.next === "resolved" ? "resolve" : "reopen"}
              disabled={busy}
              onClick={() => void changeStatus()}
              className="rounded-full border border-neutral-900 px-3 py-1.5 text-[12.5px] text-neutral-700 disabled:opacity-50"
            >
              {tt(statusAction.label)}
            </button>
          </div>
        </div>
      ) : null}
      {actionError ? <p className="text-[12px] text-rose-600">{actionError}</p> : null}
      {canReportThread(thread) ? (
        <ReportBox onSubmit={(reason, detail) => reportBayAppThread(thread.id, reason, detail)} />
      ) : null}
    </div>
  );
}
