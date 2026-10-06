"use client";

// 一条消息：头像、名字、「外部」标记、时间、正文 / 附件 / 卡片、已编辑、撤回与隐藏占位、
// 表情回应、线程摘要、读状态；系统消息单独一行；leo 的消息用 W06 的 LeoMessageBody。
import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import { useToast } from "../../../ui/Toast";
import type { ImConversationDetail, ImMessage, ImProfile } from "../../../lib/im/types";
import { LeoMessageBody, LeoNoticeLine } from "../leo/LeoMessageBody";
import { ArtifactCardView } from "./ArtifactCardView";
import { AttachmentView, safeMediaUrl } from "./AttachmentView";
import { MessageActions, actionPermissions, type MessageActionHandlers } from "./MessageActions";
import { MessageBody } from "./MessageBody";
import { DmReadReceipt, MentionReadReceipt } from "./ReadReceipt";
import { ReactionBar } from "./ReactionBar";
import { ReplayCardView } from "./ReplayCardView";
import { SystemLine } from "./SystemLine";
import type { ConversationStore, LeoNoticeCode, PendingMessage } from "./conversation-store";
import { plainTextOf } from "./message-format";

export function formatClock(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatFullTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "medium" }).format(date);
}

export function Avatar({
  profile,
  size = 36,
  onClick,
}: {
  profile: ImProfile | undefined;
  size?: number;
  onClick?: () => void;
}) {
  const name = profile?.display_name ?? "";
  const url = safeMediaUrl(profile?.avatar_url ?? null);
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  const style = { width: size, height: size };
  const inner = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={style} className="rounded-full object-cover" loading="lazy" />
  ) : (
    <span
      style={style}
      className="flex items-center justify-center rounded-full bg-neutral-200 text-[13px] font-medium text-neutral-600"
    >
      {initial}
    </span>
  );
  if (!onClick) return <span className="shrink-0">{inner}</span>;
  return (
    <button type="button" onClick={onClick} aria-label={name} className="shrink-0 rounded-full">
      {inner}
    </button>
  );
}

export interface MessageItemHandlers {
  onQuote: (message: ImMessage) => void;
  onThread: (message: ImMessage) => void;
  onEdit: (message: ImMessage) => void;
  onRecall: (message: ImMessage) => void;
  onReact: (message: ImMessage, emoji: string) => void;
  onTogglePin: (message: ImMessage) => void;
  onReport: (message: ImMessage) => void;
  onCopyText: (message: ImMessage) => void;
  onCopyLink: (message: ImMessage) => void;
  onOpenProfile: (userId: string) => void;
  onJumpToMessage: (messageId: string) => void;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
}

export interface MessageItemProps {
  message: ImMessage;
  pending?: PendingMessage | null;
  grouped: boolean;
  viewerId: string | null;
  profiles: Record<string, ImProfile | undefined>;
  conversation: ImConversationDetail | null;
  isAdmin: boolean;
  inThread?: boolean;
  streamingText?: string;
  notice?: LeoNoticeCode;
  /** 私聊：我的最后一条上显示已读/已送达。 */
  dmRead?: "read" | "sent" | null;
  highlighted?: boolean;
  handlers: MessageItemHandlers;
}

export function MessageItem(props: MessageItemProps) {
  const {
    message,
    pending,
    grouped,
    viewerId,
    profiles,
    conversation,
    isAdmin,
    inThread = false,
    streamingText,
    notice,
    dmRead,
    highlighted,
    handlers,
  } = props;
  const tt = useUI();
  const locale = useLocale();
  const [touchOpen, setTouchOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (message.kind === "system" || message.sender_kind === "system") {
    return <SystemLine message={message} />;
  }

  const senderProfile = message.sender_id ? profiles[message.sender_id] : undefined;
  const isLeo = message.sender_kind === "leo";
  const senderName = isLeo ? "leo" : (senderProfile?.display_name ?? tt("已退出的成员"));
  const external = Boolean(
    conversation?.members.find((member) => member.user_id === message.sender_id)?.external,
  );
  const mine = Boolean(viewerId) && message.sender_id === viewerId;
  const recalled = Boolean(message.recalled_at);
  const hidden = message.hidden_reason === "moderation";
  const blockedHidden = message.hidden_reason === "blocked";
  const isPlaceholder = recalled || hidden || blockedHidden;
  const permissions = actionPermissions({ message, viewerId, isAdmin, inThread });
  const nameOf = (userId: string) => profiles[userId]?.display_name ?? tt("已退出的成员");

  const actionHandlers: MessageActionHandlers = {
    onReact: (emoji) => handlers.onReact(message, emoji),
    onQuote: () => handlers.onQuote(message),
    onThread: () => handlers.onThread(message),
    onCopyText: () => handlers.onCopyText(message),
    onCopyLink: () => handlers.onCopyLink(message),
    onTogglePin: () => handlers.onTogglePin(message),
    onEdit: () => handlers.onEdit(message),
    onRecall: () => handlers.onRecall(message),
    onReport: () => handlers.onReport(message),
  };

  const startPress = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch" || isPlaceholder || pending) return;
    pressTimer.current = setTimeout(() => setTouchOpen(true), 450);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const timeLabel = formatClock(message.created_at, locale);
  const fullTime = formatFullTime(message.created_at, locale);
  const showHeader = !grouped;

  let content: React.ReactNode;
  if (recalled) {
    content = (
      <div className="text-[13px] italic text-neutral-400" data-placeholder="recalled">
        {message.recalled_by === "admin"
          ? tt("管理员撤回了一条消息")
          : tt("{name} 撤回了一条消息", { name: mine ? tt("你") : senderName })}
      </div>
    );
  } else if (hidden) {
    content = (
      <div className="text-[13px] italic text-neutral-400" data-placeholder="hidden">
        {tt("该消息因违反规则已隐藏")}
      </div>
    );
  } else if (blockedHidden) {
    content = (
      <div className="text-[13px] italic text-neutral-400" data-placeholder="blocked">
        {tt("已屏蔽的消息")}
      </div>
    );
  } else if (isLeo) {
    content = <LeoMessageBody message={message} streamingText={streamingText} />;
  } else {
    content = (
      <>
        {message.quote ? (
          <button
            type="button"
            onClick={() => handlers.onJumpToMessage(message.quote!.message_id)}
            className="mb-1 block max-w-full truncate rounded-md border-l-2 border-neutral-300 bg-neutral-50 px-2 py-1 text-left text-[12.5px] text-neutral-500"
            data-quote=""
          >
            <span className="mr-1 text-neutral-400">
              {message.quote.sender_id ? nameOf(message.quote.sender_id) : "leo"}
            </span>
            {message.quote.recalled ? tt("该消息已撤回") : plainTextOf(message.quote.preview).replace(/\s+/g, " ")}
          </button>
        ) : null}
        <MessageBody message={message} profiles={profiles} viewerId={viewerId} onOpenProfile={handlers.onOpenProfile} />
        {message.attachments.length > 0 ? (
          <div className="mt-1 flex flex-col items-start gap-1.5">
            {message.attachments.map((attachment, index) => (
              <AttachmentView
                key={`${attachment.url}-${index}`}
                attachment={attachment}
                transcript={attachment.kind === "voice" ? message.transcript : null}
              />
            ))}
          </div>
        ) : null}
        {message.card?.type === "artifact" ? (
          <div className="mt-1">
            <ArtifactCardView card={message.card} />
          </div>
        ) : null}
        {message.card?.type === "replay" ? (
          <div className="mt-1">
            <ReplayCardView card={message.card} />
          </div>
        ) : null}
      </>
    );
  }

  const mentionReads = mine && message.mention_reads && Object.keys(message.mention_reads).length > 0;

  return (
    <div
      data-seq={message.seq}
      data-message-id={message.id}
      data-highlighted={highlighted ? "true" : undefined}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onPointerMove={endPress}
      onMouseLeave={() => setTouchOpen(false)}
      className={
        "group relative flex gap-2.5 px-4 transition-colors " +
        (showHeader ? "pt-2 " : "pt-0.5 ") +
        (highlighted ? "bg-amber-50 " : "hover:bg-neutral-50/70 ") +
        (pending?.status === "sending" ? "opacity-60" : "")
      }
    >
      <div className="w-9 shrink-0">
        {showHeader ? (
          <Avatar
            profile={isLeo ? { user_id: "leo", display_name: "leo", avatar_url: null } : senderProfile}
            onClick={!isLeo && message.sender_id ? () => handlers.onOpenProfile(message.sender_id!) : undefined}
          />
        ) : (
          <span
            className="hidden pt-1.5 text-center text-[10.5px] text-neutral-300 group-hover:block"
            title={fullTime}
          >
            {timeLabel}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 pb-0.5">
        {showHeader ? (
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              disabled={isLeo || !message.sender_id}
              onClick={() => message.sender_id && handlers.onOpenProfile(message.sender_id)}
              className="truncate text-[13.5px] font-semibold text-neutral-900 enabled:hover:underline"
            >
              {senderName}
            </button>
            {isLeo ? <span className="rounded bg-violet-50 px-1 text-[10.5px] text-violet-600">AI</span> : null}
            {external ? <span className="rounded bg-neutral-100 px-1 text-[10.5px] text-neutral-500">{tt("外部")}</span> : null}
            <time dateTime={message.created_at} title={fullTime} className="text-[11.5px] text-neutral-400">
              {timeLabel}
            </time>
          </div>
        ) : null}
        {content}
        {!isPlaceholder && message.edited_at ? (
          <span className="ml-1.5 text-[11px] text-neutral-400">{tt("已编辑")}</span>
        ) : null}
        {!isPlaceholder ? (
          <ReactionBar reactions={message.reactions} nameOf={nameOf} onToggle={(emoji) => handlers.onReact(message, emoji)} />
        ) : null}
        {!isPlaceholder && !inThread && message.thread && message.thread.reply_count > 0 ? (
          <button
            type="button"
            onClick={() => handlers.onThread(message)}
            className="mt-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[12px] text-sky-700 hover:bg-sky-50"
            data-thread-summary=""
          >
            <span className="flex -space-x-1">
              {message.thread.participant_ids.slice(0, 3).map((id) => (
                <span key={id} className="rounded-full ring-2 ring-white">
                  <Avatar profile={profiles[id]} size={16} />
                </span>
              ))}
            </span>
            {tt("{n} 条回复", { n: message.thread.reply_count })}
          </button>
        ) : null}
        {pending?.status === "failed" ? (
          <div className="mt-1 flex items-center gap-2 text-[12px] text-red-600" data-send-failed="">
            <span>{tt("发送失败")}</span>
            <button type="button" className="underline" onClick={() => handlers.onRetry(pending.clientId)}>
              {tt("重试")}
            </button>
            <button type="button" className="text-neutral-400 underline" onClick={() => handlers.onDiscard(pending.clientId)}>
              {tt("删除")}
            </button>
          </div>
        ) : null}
        {pending?.status === "sending" ? (
          <div className="mt-0.5 text-[11.5px] text-neutral-400" data-sending="">
            {tt("发送中")}
          </div>
        ) : null}
        {!pending && dmRead ? <DmReadReceipt read={dmRead === "read"} /> : null}
        {!pending && mentionReads ? <MentionReadReceipt reads={message.mention_reads!} nameOf={nameOf} /> : null}
        {notice ? (
          <div className="mt-1">
            <LeoNoticeLine code={notice} />
          </div>
        ) : null}
      </div>
      {!isPlaceholder && !pending ? (
        <div
          className={
            "absolute -top-3 right-4 z-10 " +
            (touchOpen ? "block" : "hidden group-hover:block group-focus-within:block")
          }
        >
          <MessageActions
            message={message}
            permissions={permissions}
            handlers={actionHandlers}
            canReportOthers={!mine && message.sender_kind === "user"}
          />
        </div>
      ) : null}
    </div>
  );
}

/** 复制链接用的地址：当前站的当前页 + `?im=<会话>&im_seq=<seq>`（契约 §8.3 深链）。 */
export function messageLink(href: string, conversationId: string, seq: number): string {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("im", conversationId);
  url.searchParams.set("im_seq", String(seq));
  return url.toString();
}

/** 一组操作的默认实现；各视图只需给出「引用 / 开线程 / 编辑 / 举报 / 资料卡 / 跳转」这几个界面回调。 */
export function useMessageHandlers(options: {
  store: ConversationStore;
  conversationId: string;
  onQuote: (message: ImMessage) => void;
  onThread: (message: ImMessage) => void;
  onEdit: (message: ImMessage) => void;
  onReport: (message: ImMessage) => void;
  onOpenProfile: (userId: string) => void;
  onJumpToMessage: (messageId: string) => void;
}): MessageItemHandlers {
  const tt = useUI();
  const toast = useToast();
  const { store, conversationId } = options;
  const { onQuote, onThread, onEdit, onReport, onOpenProfile, onJumpToMessage } = options;

  const copy = useCallback(
    async (value: string, done: string) => {
      try {
        await navigator.clipboard.writeText(value);
        toast.success(done);
      } catch {
        toast.error(tt("复制失败"));
      }
    },
    [toast, tt],
  );

  return useMemo<MessageItemHandlers>(
    () => ({
      onQuote,
      onThread,
      onEdit,
      onReport,
      onOpenProfile,
      onJumpToMessage,
      onReact: (message, emoji) => void store.toggleReaction(message.id, emoji),
      onTogglePin: (message) => void store.togglePin(message.id, message.pinned),
      onRecall: (message) => {
        if (window.confirm(tt("撤回这条消息？撤回后所有人都看不到内容。"))) void store.recall(message.id);
      },
      onCopyText: (message) => void copy(message.body, tt("已复制")),
      onCopyLink: (message) =>
        void copy(messageLink(window.location.href, conversationId, message.seq), tt("已复制链接")),
      onRetry: (clientId) => void store.retry(clientId),
      onDiscard: (clientId) => store.discardPending(clientId),
    }),
    [store, conversationId, copy, tt, onQuote, onThread, onEdit, onReport, onOpenProfile, onJumpToMessage],
  );
}
