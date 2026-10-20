"use client";

// 一条消息：头像、名字、「外部」标记、时间、正文 / 附件 / 卡片、已编辑、撤回与隐藏占位、
// 引用、读状态；系统消息单独一行；leo 的消息用 W06 的 LeoMessageBody。
import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import { ConfirmDialog } from "../../../ui";
import { useToast } from "../../../ui/Toast";
import type { ImConversationDetail, ImMessage, ImProfile } from "../../../lib/im/types";
import { imFetch } from "../../../lib/im/client";
import { visiblePersonName } from "../../../lib/im/people-api";
import { LeoMessageBody, LeoNoticeLine } from "../leo/LeoMessageBody";
import { ArtifactCardView } from "./ArtifactCardView";
import { AttachmentView, safeMediaUrl } from "./AttachmentView";
import { MessageActions, actionPermissions, type MessageActionHandlers } from "./MessageActions";
import { MessageBody } from "./MessageBody";
import { DmReadReceipt, MentionReadReceipt } from "./ReadReceipt";
import { BayOrderCard } from "../../bay/orders/BayOrderCard";
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
    <button type="button" onClick={onClick} aria-label={name} className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
      {inner}
    </button>
  );
}

export interface MessageItemHandlers {
  onQuote: (message: ImMessage) => void;
  onForward: (message: ImMessage) => void;
  onMultiSelect: (message: ImMessage) => void;
  onEdit: (message: ImMessage) => void;
  onRecall: (message: ImMessage) => void;
  onTogglePin: (message: ImMessage) => void;
  onReport: (message: ImMessage) => void;
  onCopyText: (message: ImMessage) => void;
  onCopyLink: (message: ImMessage) => void;
  onTranslate: (message: ImMessage) => Promise<string>;
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
  streamingText?: string;
  notice?: LeoNoticeCode;
  /** 私聊：我的最后一条上显示已读/已送达。 */
  dmRead?: "read" | "sent" | null;
  highlighted?: boolean;
  handlers: MessageItemHandlers;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: (message: ImMessage) => void;
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
    streamingText,
    notice,
    dmRead,
    highlighted,
    handlers,
    selectionMode = false,
    selected = false,
    onToggleSelected,
  } = props;
  const tt = useUI();
  const locale = useLocale();
  const [touchOpen, setTouchOpen] = useState(false);
  const [recallOpen, setRecallOpen] = useState(false);
  const [translation, setTranslation] = useState("");
  const [translationError, setTranslationError] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterRef = useRef<"" | "own" | "peer" | null>(null);

  if (message.kind === "system" || message.sender_kind === "system") {
    return <SystemLine message={message} />;
  }

  const senderProfile = message.sender_id ? profiles[message.sender_id] : undefined;
  const isLeo = message.sender_kind === "leo";
  const senderName = isLeo ? "leo" : senderProfile ? visiblePersonName(senderProfile, {
    showNickname: conversation?.kind !== "dm" && conversation?.show_member_nicknames !== false,
  }) : tt("已退出的成员");
  const external = Boolean(
    conversation?.members.find((member) => member.user_id === message.sender_id)?.external,
  );
  const mine = Boolean(viewerId) && message.sender_id === viewerId;
  if (enterRef.current === null) {
    if (pending) enterRef.current = "own";
    else {
      const age = Date.now() - Date.parse(message.created_at);
      enterRef.current = Number.isFinite(age) && age >= 0 && age < 2500 ? (mine ? "own" : "peer") : "";
    }
  }
  const recalled = Boolean(message.recalled_at);
  const hidden = message.hidden_reason === "moderation";
  const blockedHidden = message.hidden_reason === "blocked";
  const isPlaceholder = recalled || hidden || blockedHidden;
  const permissions = actionPermissions({ message, viewerId, isAdmin });
  const nameOf = (userId: string) => profiles[userId]?.display_name ?? tt("已退出的成员");

  const actionHandlers: MessageActionHandlers = {
    onQuote: () => handlers.onQuote(message),
    onForward: () => handlers.onForward(message),
    onMultiSelect: () => handlers.onMultiSelect(message),
    onTranslate: () => {
      setTranslationError(false);
      void handlers.onTranslate(message).then(setTranslation).catch(() => setTranslationError(true));
    },
    onCopyText: () => handlers.onCopyText(message),
    // 撤回先在站内确认框里确认，确认后才真正撤回（不用浏览器原生弹窗：手机上难看，嵌入环境里还会被拦掉）。
    onRecall: () => setRecallOpen(true),
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
        {(message.card as { type?: string; id?: string } | undefined)?.type === "talent_order" ? (
          <div className="mt-1">
            <BayOrderCard
              contractId={String((message.card as { id?: string }).id ?? "")}
              compact
            />
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
      onContextMenu={(event) => {
        if (isPlaceholder || pending) return;
        event.preventDefault();
        setTouchOpen(true);
      }}
      onMouseLeave={() => setTouchOpen(false)}
      data-sending={pending?.status === "sending" ? "" : undefined}
      data-im-enter={enterRef.current || undefined}
      data-message-row={mine ? "own" : "incoming"}
      className={
        "group relative flex w-full min-w-0 items-start gap-2.5 px-4 " +
        (showHeader ? "pt-4 " : "pt-2 ") +
        (highlighted ? "bg-neutral-100/80 dark:bg-white/5 " : "")
      }
      style={{ flexDirection: mine ? "row-reverse" : "row" }}
    >
      <div className="w-9 shrink-0">
          <Avatar
            profile={isLeo ? { user_id: "leo", display_name: "leo", avatar_url: null } : senderProfile}
            onClick={!isLeo && message.sender_id ? () => handlers.onOpenProfile(message.sender_id!) : undefined}
          />
      </div>
      <div className={"flex min-w-0 flex-col pb-0.5 " + (mine ? "items-end" : "items-start")} style={{ maxWidth: "min(78%, 680px)" }}>
        {selectionMode ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={selected ? tt("取消选择") : tt("选择消息")}
            onClick={() => onToggleSelected?.(message)}
            className="mb-1 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-xs"
          >{selected ? "✓" : ""}</button>
        ) : null}
        {showHeader ? (
          <div className="flex items-baseline gap-2">
            {!mine && conversation?.kind !== "dm" ? (
              <span data-sender-name="" className="truncate text-[12px] text-neutral-500 dark:text-neutral-400">{senderName}</span>
            ) : null}
            {external ? <span className="text-[11px] text-neutral-400">{tt("外部")}</span> : null}
            <time dateTime={message.created_at} title={fullTime} className="text-[12px] text-neutral-400">
              {timeLabel}
            </time>
          </div>
        ) : null}
        <div
          data-message-bubble={mine ? "own" : "incoming"}
          className={"min-w-0 max-w-full rounded-xl px-3 py-2 text-left " +
            (mine ? "rounded-tr-sm bg-emerald-100 text-neutral-900 dark:bg-emerald-900 dark:text-neutral-100" : "rounded-tl-sm bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100")}
          style={{ overflowWrap: "anywhere" }}
        >
          {content}
        </div>
        {!isPlaceholder && message.edited_at ? (
          <span className="ml-1.5 text-[11px] text-neutral-400">{tt("已编辑")}</span>
        ) : null}
        {translation || translationError ? (
          <div className="mt-2 max-w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200" data-message-translation="">
            {translationError ? tt("翻译失败，请稍后重试。") : translation}
          </div>
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
            open={touchOpen}
          />
        </div>
      ) : null}
      {recallOpen ? (
        <ConfirmDialog
          title={tt("删除这条消息？删除后所有人都看不到内容。")}
          confirmLabel={tt("删除")}
          danger
          onConfirm={() => {
            setRecallOpen(false);
            handlers.onRecall(message);
          }}
          onCancel={() => setRecallOpen(false)}
        />
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

/** 一组消息操作的默认实现。 */
export function useMessageHandlers(options: {
  store: ConversationStore;
  conversationId: string;
  onQuote: (message: ImMessage) => void;
  onForward: (message: ImMessage) => void;
  onMultiSelect: (message: ImMessage) => void;
  onEdit: (message: ImMessage) => void;
  onReport: (message: ImMessage) => void;
  onOpenProfile: (userId: string) => void;
  onJumpToMessage: (messageId: string) => void;
}): MessageItemHandlers {
  const tt = useUI();
  const toast = useToast();
  const { store, conversationId } = options;
  const { onQuote, onForward, onMultiSelect, onEdit, onReport, onOpenProfile, onJumpToMessage } = options;
  const locale = useLocale();

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
      onForward,
      onMultiSelect,
      onEdit,
      onReport,
      onOpenProfile,
      onJumpToMessage,
      onTogglePin: (message) => void store.togglePin(message.id, message.pinned),
      // 确认由 MessageItem 的 ConfirmDialog 负责；走到这里就是已经确认过了。
      onRecall: (message) => void store.recall(message.id),
      onCopyText: (message) => void copy(message.body, tt("已复制")),
      onCopyLink: (message) =>
        void copy(messageLink(window.location.href, conversationId, message.seq), tt("已复制链接")),
      onTranslate: async (message) => {
        const target_lang = locale.toLowerCase().startsWith("zh") ? "en" : "zh";
        const result = await imFetch<{ result: string }>("/v1/assistant/transform", {
          method: "POST",
          json: { action: "translate", text: plainTextOf(message.body), target_lang },
        });
        return result.result;
      },
      onRetry: (clientId) => void store.retry(clientId),
      onDiscard: (clientId) => store.discardPending(clientId),
    }),
    [store, conversationId, copy, tt, locale, onQuote, onForward, onMultiSelect, onEdit, onReport, onOpenProfile, onJumpToMessage],
  );
}
