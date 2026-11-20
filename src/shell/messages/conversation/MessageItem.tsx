"use client";

// 一条消息，与任务页同一套样子（session / sites wave 2026-11-21, F2 §3）：居中 52rem 的一栏里，自己的消息靠右灰色气泡，
// 别人的靠左白底描边气泡、上方一行灰色首字母头像 + 名字；卡片（任务 / 引用 / 作品 / 回放）不套气泡；系统消息单独一行。
// 选择模式：每行左边一个 20 px 实心勾选圈，整行可点，选中行浅色底。右键（触屏长按）在指针处打开消息菜单。
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import { MessageConfirmDialog as ConfirmDialog } from "../MessageSettingsFrame";
import { useToast } from "../../../ui/Toast";
import type { ImConversationDetail, ImMessage, ImProfile } from "../../../lib/im/types";
import { imFetch } from "../../../lib/im/client";
import { visiblePersonName } from "../../../lib/im/people-api";
import { LeoMessageBody, LeoNoticeLine } from "../leo/LeoMessageBody";
import { ArtifactCardView } from "./ArtifactCardView";
import { AttachmentView, safeMediaUrl } from "./AttachmentView";
import { MessageContextMenu, actionPermissions, type MenuPoint, type MessageActionHandlers } from "./MessageActions";
import { MessageBody } from "./MessageBody";
import { DmReadReceipt, MentionReadReceipt } from "./ReadReceipt";
import { BayOrderCard } from "../../bay/orders/BayOrderCard";
import { ReplayCardView } from "./ReplayCardView";
import { SystemLine } from "./SystemLine";
import type { ConversationStore, LeoNoticeCode, PendingMessage } from "./conversation-store";
import { plainTextOf } from "./message-format";
// Direct files, not the `task-room` index: the index also exports the session view, which renders ConversationView —
// importing it here would close a module cycle (ConversationView → MessageList → MessageItem → index → session view).
import { TaskCardView } from "../../task-room/TaskCardView";
import { QuoteCardView } from "../../task-room/QuoteCardView";
import { ShareCheckbox } from "../../share/ShareActionBar";
import { writeClipboardText } from "../../share/share-clipboard";

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

const AVATAR_SIZE: Record<number, string> = {
  20: "size-5 text-[11px]",
  24: "size-6 text-[11px]",
  28: "size-7 text-[12px]",
  32: "size-8 text-[13px]",
  36: "size-9 text-[13px]",
  40: "size-10 text-[14px]",
};

/** Grey initials (or the person's photo), the same chip the task page puts above another person's message. */
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
  const sizeClass = AVATAR_SIZE[size] ?? AVATAR_SIZE[36];
  const inner = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`${sizeClass} rounded-full object-cover`} loading="lazy" />
  ) : (
    <span className={`${sizeClass} inline-flex items-center justify-center rounded-full bg-stone-200 font-medium text-stone-600`}>
      {initial}
    </span>
  );
  if (!onClick) return <span className="inline-flex shrink-0">{inner}</span>;
  return (
    <button type="button" onClick={onClick} aria-label={name} className="inline-flex shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-stone-300">
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

/** What a task / quote card opens with when the host asked for its own handling (contract §2.4). */
export interface MessageCardOpeners {
  onOpenTask?: (taskId: string, title: string) => void;
  onOpenQuote?: (message: ImMessage) => void;
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
  /** One short line under the bubble. */
  mark?: string;
  cardOpeners?: MessageCardOpeners;
}

/** `card.type` of a task card or a quote card (the quote type lands with US's `ImCard`; read through a narrow cast). */
export function messageCardType(message: ImMessage): "task" | "quote" | null {
  const type = (message.card as { type?: string } | null)?.type;
  const kind = message.kind as string;
  if (type === "task" || kind === "task") return "task";
  if (type === "quote" || kind === "quote") return "quote";
  return null;
}

const OWN_BUBBLE =
  "min-w-0 max-w-[85%] break-words rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5 text-left text-[15px] leading-relaxed text-neutral-900 [overflow-wrap:anywhere]";
const OTHER_BUBBLE =
  "min-w-0 max-w-[85%] break-words rounded-2xl rounded-bl-md border border-stone-200 bg-white px-4 py-2.5 text-left text-[15px] leading-relaxed text-neutral-900 [overflow-wrap:anywhere]";
const META = "text-[11px] text-stone-400";

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
    mark,
    cardOpeners,
  } = props;
  const tt = useUI();
  const locale = useLocale();
  const [menuAt, setMenuAt] = useState<MenuPoint | null>(null);
  const [recallOpen, setRecallOpen] = useState(false);
  const [translation, setTranslation] = useState("");
  const [translationError, setTranslationError] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterRef = useRef<"" | "own" | "peer" | null>(null);

  const cardType = messageCardType(message);
  // Only the openers the host passed: the cards keep their own defaults otherwise (signals/UC-needs.md).
  const openers: MessageCardOpeners = {};
  if (cardOpeners?.onOpenTask) openers.onOpenTask = cardOpeners.onOpenTask;
  if (cardOpeners?.onOpenQuote) openers.onOpenQuote = cardOpeners.onOpenQuote;
  const cardNode: ReactNode = cardType === "task"
    ? <TaskCardView message={message} conversationId={message.conversation_id} {...openers} />
    : cardType === "quote"
      ? <QuoteCardView message={message} conversationId={message.conversation_id} {...openers} />
      : null;
  if (cardNode && message.sender_kind === "system" && !message.recalled_at) {
    // A card the server posted on nobody's behalf: centred like a system line.
    return (
      <div data-seq={message.seq} data-message-id={message.id} data-message-card={cardType ?? undefined} className="flex justify-center py-2">
        {cardNode}
      </div>
    );
  }
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
  const menuEnabled = !selectionMode && !isPlaceholder && !pending;

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

  // Touch: a long press opens the same menu where the finger is.
  const startPress = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch" || !menuEnabled) return;
    const point = { x: event.clientX, y: event.clientY };
    pressTimer.current = setTimeout(() => setMenuAt((current) => current ?? point), 450);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const timeLabel = formatClock(message.created_at, locale);
  const fullTime = formatFullTime(message.created_at, locale);
  const showHeader = !grouped || message.meta?.via_agent === true;
  const showAuthor = !mine && conversation?.kind !== "dm";

  const time = (
    <time dateTime={message.created_at} title={fullTime} className={META}>
      {timeLabel}
    </time>
  );
  const viaAgent = message.meta?.via_agent === true ? <span data-sent-by-agent className={META}>{tt("由智能体发送")}</span> : null;
  const header = !showHeader ? null : showAuthor ? (
    <div data-message-author="" className="flex min-w-0 max-w-[85%] items-center gap-1.5 text-[12px] text-stone-500">
      <Avatar
        size={20}
        profile={isLeo ? { user_id: "leo", display_name: "leo", avatar_url: null } : senderProfile}
        onClick={!isLeo && message.sender_id && !selectionMode ? () => handlers.onOpenProfile(message.sender_id!) : undefined}
      />
      <span data-sender-name="" className="min-w-0 truncate">{senderName}</span>
      {external ? <span className={META}>{tt("外部")}</span> : null}
      {time}
      {viaAgent}
    </div>
  ) : (
    <div className="flex items-center gap-1.5 px-1">
      {time}
      {viaAgent}
    </div>
  );

  const placeholderClass = "px-1 text-[13px] italic text-stone-400";
  let body: ReactNode = null;
  let extras: ReactNode = null;
  if (recalled) {
    body = (
      <div className={placeholderClass} data-placeholder="recalled">
        {message.recalled_by === "admin"
          ? tt("管理员撤回了一条消息")
          : tt("{name} 撤回了一条消息", { name: mine ? tt("你") : senderName })}
      </div>
    );
  } else if (hidden) {
    body = <div className={placeholderClass} data-placeholder="hidden">{tt("该消息因违反规则已隐藏")}</div>;
  } else if (blockedHidden) {
    body = <div className={placeholderClass} data-placeholder="blocked">{tt("已屏蔽的消息")}</div>;
  } else if (isLeo) {
    // leo answers like the agent on the task page: no bubble.
    body = <div className="min-w-0 max-w-full px-1 text-[15px] leading-relaxed text-neutral-900"><LeoMessageBody message={message} streamingText={streamingText} /></div>;
  } else if (cardNode) {
    // A card is its own frame: no bubble around it, no fallback text.
    body = <div className="min-w-0 max-w-[85%]" data-message-card={cardType ?? undefined}>{cardNode}</div>;
  } else {
    const hasText = Boolean(message.body) || Boolean(message.quote);
    body = hasText ? (
      <div data-message-bubble={mine ? "own" : "incoming"} className={mine ? OWN_BUBBLE : OTHER_BUBBLE}>
        {message.quote ? (
          <button
            type="button"
            onClick={() => handlers.onJumpToMessage(message.quote!.message_id)}
            className="mb-1.5 block max-w-full truncate rounded-lg border-l-2 border-stone-300 bg-stone-50 px-2 py-1 text-left text-[12px] text-stone-500"
            data-quote=""
          >
            <span className="mr-1 text-stone-400">
              {message.quote.sender_id ? nameOf(message.quote.sender_id) : "leo"}
            </span>
            {message.quote.recalled ? tt("该消息已撤回") : plainTextOf(message.quote.preview).replace(/\s+/g, " ")}
          </button>
        ) : null}
        <MessageBody message={message} profiles={profiles} viewerId={viewerId} onOpenProfile={handlers.onOpenProfile} />
      </div>
    ) : null;
    const otherCard = message.card?.type === "artifact" ? <ArtifactCardView card={message.card} />
      : message.card?.type === "replay" ? <ReplayCardView card={message.card} />
        : (message.card as { type?: string } | null)?.type === "talent_order"
          ? <BayOrderCard contractId={String((message.card as { id?: string }).id ?? "")} compact />
          : null;
    extras = (
      <>
        {message.attachments.length > 0 ? (
          <div data-message-attachments="" className={"flex max-w-[85%] flex-col gap-1.5 " + (mine ? "items-end" : "items-start")}>
            {message.attachments.map((attachment, index) => (
              <AttachmentView
                key={`${attachment.url}-${index}`}
                attachment={attachment}
                transcript={attachment.kind === "voice" ? message.transcript : null}
              />
            ))}
          </div>
        ) : null}
        {otherCard ? <div className="min-w-0 max-w-[85%]">{otherCard}</div> : null}
      </>
    );
  }

  const mentionReads = mine && message.mention_reads && Object.keys(message.mention_reads).length > 0;

  return (
    <div
      data-seq={message.seq}
      data-message-id={message.id}
      data-highlighted={highlighted ? "true" : undefined}
      data-selected={selectionMode ? (selected ? "true" : "false") : undefined}
      data-message-select-row={selectionMode ? "" : undefined}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onPointerMove={endPress}
      onContextMenu={(event) => {
        if (!menuEnabled) return;
        event.preventDefault();
        endPress();
        setMenuAt({ x: event.clientX, y: event.clientY });
      }}
      onClick={selectionMode ? () => onToggleSelected?.(message) : undefined}
      data-sending={pending?.status === "sending" ? "" : undefined}
      data-im-enter={enterRef.current || undefined}
      data-message-row={mine ? "own" : "incoming"}
      className={
        "group/message flex w-full min-w-0 gap-2.5 rounded-xl px-1.5 py-1 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] " +
        (showHeader ? "mt-2 " : "") +
        (selectionMode ? "cursor-pointer hover:bg-stone-50 " : "") +
        (selected && selectionMode ? "bg-stone-100/70 " : highlighted ? "bg-stone-100/80 " : "")
      }
    >
      {selectionMode ? (
        <ShareCheckbox checked={selected} onToggle={() => onToggleSelected?.(message)} label={tt("选择这条消息")} />
      ) : null}
      <div className={"flex min-w-0 flex-1 flex-col gap-1 " + (mine ? "items-end " : "items-start ") + (selectionMode ? "pointer-events-none" : "")}>
        {header}
        {body}
        {extras}
        {mark && !isPlaceholder ? <span data-message-mark="" className={`max-w-full truncate px-1 ${META}`}>{mark}</span> : null}
        {!isPlaceholder && message.edited_at ? <span className={`px-1 ${META}`}>{tt("已编辑")}</span> : null}
        {translation || translationError ? (
          <div className="max-w-[85%] rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] text-stone-700" data-message-translation="">
            {translationError ? tt("翻译失败，请稍后重试。") : translation}
          </div>
        ) : null}
        {pending?.status === "failed" ? (
          <div className="flex items-center gap-2 px-1 text-[12px] text-rose-600" data-send-failed="">
            <span>{tt("发送失败")}</span>
            <button type="button" className="rounded-lg px-1.5 py-0.5 font-medium hover:bg-rose-50" onClick={() => handlers.onRetry(pending.clientId)}>
              {tt("重试")}
            </button>
            <button type="button" className="rounded-lg px-1.5 py-0.5 text-stone-500 hover:bg-stone-100" onClick={() => handlers.onDiscard(pending.clientId)}>
              {tt("删除")}
            </button>
          </div>
        ) : null}
        {pending?.status === "sending" ? <div className={`px-1 ${META}`} data-sending="">{tt("发送中")}</div> : null}
        {!pending && dmRead ? <DmReadReceipt read={dmRead === "read"} /> : null}
        {!pending && mentionReads ? <MentionReadReceipt reads={message.mention_reads!} nameOf={nameOf} /> : null}
        {notice ? <LeoNoticeLine code={notice} /> : null}
      </div>
      {menuEnabled ? (
        <MessageContextMenu message={message} permissions={permissions} handlers={actionHandlers} at={menuAt} onClose={() => setMenuAt(null)} />
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
      if (await writeClipboardText(value)) toast.success(done);
      else toast.error(tt("复制失败"));
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
