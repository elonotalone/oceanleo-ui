"use client";

// 输入框：多行文字、@ 候选、表情、附件（粘贴 / 拖拽 / 选择）、语音、「+」菜单（上传 / 分享作品 / 工作回放 / 会话里的任务卡片）、
// 草稿、引用与编辑。Enter 发送 / Shift+Enter 换行（手机上 Enter 换行、按钮发送）。
// Look = the task composer (`LeoComposer.tsx`): one Tailwind frame, round 28–32 px icon buttons, 36 px send circle.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { SendMessageInput } from "../../../lib/im/messages-api";
import { ImApiError } from "../../../lib/im/client";
import type { ImAttachment, ImCard, ImConversationDetail, ImMessage } from "../../../lib/im/types";
import { ReplayPickerDialog } from "../../replay/work/ReplayPickerDialog";
import type { ConversationStore } from "../conversation/conversation-store";
import { plainTextOf } from "../conversation/message-format";
import { payerRequestField } from "../../../lib/im/leo-api";
import { sendTyping } from "../realtime/hooks";
import { ArtifactPickerDialog } from "./ArtifactPickerDialog";
import { AttachmentTray } from "./AttachmentTray";
import { AttachMenu } from "./AttachMenu";
import { EmojiPicker } from "./EmojiPicker";
import { ArrowUpGlyph, AtGlyph, CheckGlyph, CloseGlyph, EmojiGlyph } from "./icons";
import {
  MentionPicker,
  activeMentionQuery,
  applyMention,
  collectMentions,
  mentionCandidates,
  type MentionCandidate,
} from "./MentionPicker";
import { postTaskCard, taskIdsFromLinkOnlyText, type TaskCardChoice } from "./task-card";
import { VoiceRecorder } from "./VoiceRecorder";
import { insertLeoMention } from "./leo-insert";
import { WORK_REPLY_NOTICE, type WorkSendPolicy } from "../conversation/work-policy";
import { draftBook } from "./drafts";
import {
  MAX_UPLOAD_BYTES,
  UploadError,
  messageKindForAttachments,
  uploadAttachment,
  type UploadJob,
} from "./upload";

export const MAX_BODY_CHARS = 8000;
const TYPING_THROTTLE_MS = 3000;
const NOTICE_MS = 4000;
const LINE_PX = 24;

/** The frame, defined once (same classes as the task composer's frame). */
export const COMPOSER_FRAME_CLASS =
  "relative shrink-0 rounded-2xl border bg-white shadow-sm transition-all duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] focus-within:border-neutral-300 focus-within:shadow-md";
/** Round icon button of the toolbar (emoji, @leo, voice): 32 px, press motion. */
export const COMPOSER_ICON_BUTTON_CLASS =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-all duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 hover:text-neutral-700 active:scale-95 active:duration-[var(--leo-dur-1)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100";
/** 36 px send circle with the up arrow; grey when there is nothing to send. */
export function composerSendButtonClass(enabled: boolean): string {
  return `flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-all duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] ${
    enabled ? "bg-neutral-900 hover:scale-105 hover:bg-neutral-800 active:scale-95" : "cursor-not-allowed bg-neutral-300"
  }`;
}

export type ComposerKeyAction = "send" | "newline" | "none";

/**
 * Enter 发送 / Shift+Enter 换行；手机（窄屏布局或粗指针）上 Enter 换行、靠按钮发送；
 * 输入法组词中的 Enter 永远不处理。
 */
export function composerKeyAction(input: {
  key: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  mobile?: boolean;
}): ComposerKeyAction {
  if (input.key !== "Enter") return "none";
  if (input.isComposing) return "none";
  if (input.shiftKey) return "newline";
  if (input.mobile) return "newline";
  return "send";
}

/** 输入框是空的、光标在开头时按 ↑ = 编辑我发的上一条。 */
export function shouldEditLast(input: { key: string; text: string; caret: number; editing: boolean }): boolean {
  return input.key === "ArrowUp" && !input.editing && input.text.length === 0 && input.caret === 0;
}

export interface ComposerProps {
  store: ConversationStore;
  conversationId: string;
  conversation: ImConversationDetail | null;
  viewerId: string | null;
  layout: "docked" | "full" | "mobile";
  threadRootId?: string | null;
  quote?: ImMessage | null;
  quoteLabel?: string;
  onClearQuote?: () => void;
  editing?: ImMessage | null;
  onCancelEdit?: () => void;
  onEditLast?: () => void;
  /** 发出了一条（滚到底等）。 */
  onSent?: () => void;
  placeholder?: string;
  disabled?: boolean;
  disabledReason?: string;
  workPolicy?: WorkSendPolicy;
  /**
   * Project sessions only (contract §2.4): the "+" menu gains "Task" (posts a task card), and a message that is
   * nothing but links to tasks is posted as task cards instead of the URL text.
   */
  attachTaskCard?: boolean;
  /** Test seam: posts one task card. Defaults to `POST /v1/im/conversations/{id}/task-card`. */
  postTaskCardImpl?: (conversationId: string, taskId: string) => Promise<ImMessage>;
  /** Test seam: the task list of the "Task" page. */
  loadTaskChoices?: (options: { signal?: AbortSignal }) => Promise<TaskCardChoice[]>;
}

function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function filesFrom(list: FileList | File[] | null | undefined): File[] {
  return list ? Array.from(list) : [];
}

export function Composer(props: ComposerProps) {
  const {
    store,
    conversationId,
    conversation,
    viewerId,
    layout,
    threadRootId = null,
    quote = null,
    quoteLabel,
    onClearQuote,
    editing = null,
    onCancelEdit,
    onEditLast,
    onSent,
    placeholder,
    disabled,
    disabledReason,
    attachTaskCard = false,
    postTaskCardImpl = postTaskCard,
    loadTaskChoices,
  } = props;
  const tt = useUI();
  const workPolicy = props.workPolicy ?? conversation?.send_policy;
  const textOnly = Boolean(workPolicy?.text_only);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [picked, setPicked] = useState<MentionCandidate[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  // One short notice (no microphone, voice failed, task card failed …). It floats above the frame and goes away
  // by itself, so the composer never changes height because of it.
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const lastTypingAt = useRef(0);
  const restoredRef = useRef<string>("");

  const mobile = layout === "mobile" || isCoarsePointer();
  // A task card is a message of the session itself, never a thread reply.
  const taskCardsHere = attachTaskCard && !threadRootId;
  const allLabel = tt("所有人");

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // ── 草稿：打开会话时恢复，停止输入 1 秒后存 ─────────────────────────────
  useEffect(() => {
    if (editing) return;
    let alive = true;
    const key = `${conversationId}|${threadRootId ?? ""}`;
    restoredRef.current = key;
    setText("");
    setPicked([]);
    setJobs([]);
    void draftBook.read(conversationId, threadRootId).then((draft) => {
      if (alive && restoredRef.current === key && draft) {
        setText((current) => current || draft);
      }
    });
    return () => {
      alive = false;
      void draftBook.saver.flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, threadRootId]);

  // 进入 / 退出编辑：把被编辑那条的正文放进来；退出后恢复草稿
  const prevEditingId = useRef<string | null>(null);
  useEffect(() => {
    const id = editing?.id ?? null;
    if (id) {
      setText(editing?.body ?? "");
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else if (prevEditingId.current) {
      void draftBook.read(conversationId, threadRootId).then((draft) => setText(draft));
    }
    prevEditingId.current = id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  // 引用 / 编辑时聚焦
  useEffect(() => {
    if (quote) textareaRef.current?.focus();
  }, [quote?.id]);

  // 输入框自动长高（最多 8 行）
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 8 * LINE_PX)}px`;
  }, [text]);

  const active = useMemo(() => activeMentionQuery(text, caret), [text, caret]);
  const candidates = useMemo(
    () => (active ? mentionCandidates({ conversation, viewerId, query: active.query, allLabel }) : []),
    [active, conversation, viewerId, allLabel],
  );
  useEffect(() => setActiveIndex(0), [active?.query, candidates.length]);

  const leoEnabled = Boolean(conversation?.leo_enabled) && conversation?.kind !== "talent";

  // ── 上传 ────────────────────────────────────────────────────────────────
  const runUpload = useCallback((job: UploadJob) => {
    const controller = new AbortController();
    controllers.current.set(job.id, controller);
    setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: "uploading", ratio: 0, error: null } : j)));
    uploadAttachment(job.file, {
      signal: controller.signal,
      onProgress: (ratio) =>
        setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, ratio } : j))),
    })
      .then((attachment) =>
        setJobs((list) =>
          list.map((j) => (j.id === job.id ? { ...j, status: "done", ratio: 1, attachment, error: null } : j)),
        ),
      )
      .catch((error: unknown) => {
        const code = error instanceof UploadError ? error.code : "transfer_failed";
        setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: "failed", error: code } : j)));
      })
      .finally(() => controllers.current.delete(job.id));
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      if (textOnly) { setNotice(tt(WORK_REPLY_NOTICE)); return; }
      const fresh: UploadJob[] = files.map((file) => ({
        id: globalThis.crypto.randomUUID(),
        file,
        status: file.size > MAX_UPLOAD_BYTES || file.size === 0 ? "failed" : "uploading",
        ratio: 0,
        error: file.size > MAX_UPLOAD_BYTES ? "too_large" : file.size === 0 ? "empty" : null,
        attachment: null,
      }));
      setJobs((list) => [...list, ...fresh].slice(0, 10));
      for (const job of fresh) if (job.status === "uploading") runUpload(job);
    },
    [runUpload, textOnly, tt],
  );

  const cancelJob = (id: string) => controllers.current.get(id)?.abort();
  const retryJob = (id: string) => {
    const job = jobs.find((j) => j.id === id);
    if (job) runUpload(job);
  };
  const removeJob = (id: string) => setJobs((list) => list.filter((j) => j.id !== id));

  useEffect(() => {
    const map = controllers.current;
    return () => {
      for (const controller of map.values()) controller.abort();
    };
  }, []);

  // ── 发送 ────────────────────────────────────────────────────────────────
  const uploading = jobs.some((j) => j.status === "uploading");
  const readyAttachments: ImAttachment[] = jobs
    .filter((j) => j.status === "done" && j.attachment)
    .map((j) => j.attachment as ImAttachment);
  const trimmed = text.trim();
  const canSend =
    !disabled &&
    (!textOnly || ((editing || workPolicy?.remaining_messages !== 0) && readyAttachments.length === 0)) &&
    !sending &&
    !uploading &&
    (editing ? trimmed.length > 0 && trimmed !== editing.body : trimmed.length > 0 || readyAttachments.length > 0) &&
    text.length <= MAX_BODY_CHARS;

  const afterSend = () => {
    setText("");
    setPicked([]);
    setJobs([]);
    draftBook.clear(conversationId, threadRootId);
    onClearQuote?.();
    onSent?.();
  };

  // Session only: post task cards. "refused" = the server will not card this task here (no access, not a
  // session …); "failed" = anything else (network, server error).
  const sendTaskCards = async (taskIds: readonly string[]): Promise<"ok" | "refused" | "failed"> => {
    let posted = 0;
    for (const taskId of taskIds) {
      try {
        const message = await postTaskCardImpl(conversationId, taskId);
        if (message) store.ingestMessage(message);
        posted += 1;
      } catch (error) {
        if (posted > 0) onSent?.();
        const status = error instanceof ImApiError ? error.status : 0;
        return posted === 0 && status >= 400 && status < 500 && status !== 401 && status !== 429 ? "refused" : "failed";
      }
    }
    onSent?.();
    return "ok";
  };

  const submit = async () => {
    if (!canSend) return;
    if (editing) {
      setSending(true);
      const updated = await store.edit(editing.id, trimmed);
      setSending(false);
      if (updated) {
        setText("");
        onCancelEdit?.();
      }
      return;
    }
    // A session message that is only links to tasks becomes task cards (the server checks the sender may view
    // each task). A link the server refuses to card is sent as ordinary text; any other failure keeps the text.
    const linkedTasks = taskCardsHere && readyAttachments.length === 0 && !quote ? taskIdsFromLinkOnlyText(trimmed) : null;
    if (linkedTasks) {
      setSending(true);
      const outcome = await sendTaskCards(linkedTasks);
      setSending(false);
      if (outcome === "ok") {
        afterSend();
        return;
      }
      if (outcome === "failed") {
        setNotice(tt("没能发出任务卡片，请重试。"));
        return;
      }
      // refused: a link to a task that cannot be carded here goes out as ordinary text
    }
    const mentions = collectMentions(trimmed, picked, leoEnabled);
    const kind = readyAttachments.length > 0 ? messageKindForAttachments(readyAttachments) : "text";
    const input: Omit<SendMessageInput, "client_id"> = {
      kind,
      body: trimmed,
      ...mentions,
      quote_id: quote?.id ?? null,
      thread_root_id: threadRootId,
      attachments: readyAttachments,
      ...(mentions.mention_leo ? payerRequestField() : {}),
    };
    afterSend();
    void store.send(input);
  };

  const sendCard = (card: ImCard) => {
    if (textOnly) return;
    void store.send({
      kind: card.type === "replay" ? "replay" : "artifact",
      body: "",
      card,
      thread_root_id: threadRootId,
    });
    onSent?.();
  };

  const sendVoice = useCallback(
    (file: File, durationMs: number) => {
      if (textOnly) return;
      const controller = new AbortController();
      void uploadAttachment(file, { signal: controller.signal, kind: "voice" })
        .then((attachment) => {
          void store.send({
            kind: "voice",
            body: "",
            attachments: [{ ...attachment, kind: "voice", duration_ms: attachment.duration_ms ?? durationMs }],
            thread_root_id: threadRootId,
          });
          onSent?.();
        })
        .catch(() => setNotice(tt("语音没能发出去，请重试。")));
    },
    [store, threadRootId, onSent, tt, textOnly],
  );

  // ── 输入事件 ────────────────────────────────────────────────────────────
  const pickMention = (candidate: MentionCandidate) => {
    if (!active) return;
    const next = applyMention(text, caret, active, candidate);
    setText(next.text);
    setPicked((list) => (list.some((c) => c.kind === candidate.kind && c.id === candidate.id) ? list : [...list, candidate]));
    draftBook.write(conversationId, next.text, threadRootId);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
        setCaret(next.caret);
      }
    });
  };

  const insertAtCaret = (value: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + value + text.slice(end);
    setText(next);
    draftBook.write(conversationId, next, threadRootId);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + value.length;
      el.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  // 输入框下方的 @leo 按钮：在光标处插入 `@leo `（发送时手打 @leo 的识别会把它算成提到 leo）。
  const insertLeo = () => {
    const el = textareaRef.current;
    const next = insertLeoMention(text, el?.selectionStart ?? text.length, el?.selectionEnd ?? text.length);
    if (next.text.length > MAX_BODY_CHARS) return;
    setText(next.text);
    draftBook.write(conversationId, next.text, threadRootId);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  };

  const onChange = (value: string) => {
    setText(value);
    if (!editing) draftBook.write(conversationId, value, threadRootId);
    const now = Date.now();
    if (value && now - lastTypingAt.current >= TYPING_THROTTLE_MS) {
      lastTypingAt.current = now;
      sendTyping(conversationId, threadRootId);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const composing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (candidates.length > 0 && !composing) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % candidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickMention(candidates[activeIndex] ?? candidates[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCaret(0);
        return;
      }
    }
    if (event.key === "Escape" && (editing || quote)) {
      event.preventDefault();
      if (editing) onCancelEdit?.();
      else onClearQuote?.();
      return;
    }
    if (
      shouldEditLast({ key: event.key, text, caret: event.currentTarget.selectionStart ?? 0, editing: Boolean(editing) }) &&
      onEditLast
    ) {
      event.preventDefault();
      onEditLast();
      return;
    }
    const action = composerKeyAction({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: composing,
      mobile,
    });
    if (action === "send") {
      event.preventDefault();
      void submit();
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = filesFrom(event.clipboardData?.files);
    if (files.length > 0) {
      event.preventDefault();
      addFiles(files);
    }
  };

  const hintFor = (candidate: MentionCandidate): string | null => {
    if (candidate.kind === "all") return tt("通知全体成员");
    if (candidate.kind === "leo") return tt("AI 助手");
    if (candidate.external) return tt("外部");
    return null;
  };

  if (disabled && disabledReason) {
    return (
      <div className="border-t border-neutral-200/80 px-4 py-3 text-center text-[13px] text-neutral-500" data-composer-disabled="">
        {disabledReason}
      </div>
    );
  }

  const quoteName = quoteLabel ?? "";
  const sendEnabled = canSend;
  return (
    <div
      className={`${COMPOSER_FRAME_CLASS} mx-3 mb-3 mt-2 ${dragging ? "border-neutral-300 ring-2 ring-neutral-200" : "border-neutral-200"}`}
      onDragOver={(event) => {
        if (event.dataTransfer?.types?.includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        const files = filesFrom(event.dataTransfer?.files);
        setDragging(false);
        if (files.length > 0) {
          event.preventDefault();
          addFiles(files);
        }
      }}
      data-composer=""
    >
      {notice ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-full z-20 mb-2 flex justify-center px-3">
          <p
            role="alert"
            data-composer-notice=""
            className="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white py-1 pl-3 pr-1 text-[12px] text-rose-600 shadow-sm dark:border-white/10 dark:bg-neutral-950"
          >
            <span className="min-w-0 truncate">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label={tt("关闭")}
              className="rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 active:scale-95"
            >
              <CloseGlyph />
            </button>
          </p>
        </div>
      ) : null}
      {textOnly ? <p className="px-4 pt-3 text-[12px] text-neutral-500" data-await-reply="">{tt(WORK_REPLY_NOTICE)}</p> : null}
      {editing ? (
        <div className="flex items-center justify-between gap-2 px-4 pt-2.5 text-[12px] text-neutral-500">
          <span>{tt("正在编辑消息")}</span>
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-full px-2 py-0.5 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 active:scale-95"
          >
            {tt("取消")}
          </button>
        </div>
      ) : null}
      {quote && !editing ? (
        <div className="mx-3 mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-stone-50 py-1 pl-2.5 pr-1 text-[12px] text-neutral-500" data-composer-quote="">
          <span className="min-w-0 truncate">
            {tt("回复")} <b className="font-medium text-neutral-700">{quoteName}</b>
            {"："}
            {plainTextOf(quote.body).replace(/\s+/g, " ").slice(0, 60) || quote.card?.title || quote.attachments[0]?.name || ""}
          </span>
          <button
            type="button"
            onClick={onClearQuote}
            aria-label={tt("取消引用")}
            className="shrink-0 rounded-lg p-1.5 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 active:scale-95"
          >
            <CloseGlyph />
          </button>
        </div>
      ) : null}
      <AttachmentTray jobs={jobs} onCancel={cancelJob} onRetry={retryJob} onRemove={removeJob} />
      <div className="relative">
        <MentionPicker
          candidates={candidates}
          activeIndex={activeIndex}
          onPick={pickMention}
          onHover={setActiveIndex}
          hintFor={hintFor}
        />
        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          maxLength={MAX_BODY_CHARS}
          disabled={disabled}
          placeholder={placeholder ?? tt("输入消息，Enter 发送，Shift+Enter 换行")}
          aria-label={tt("消息输入框")}
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="block max-h-48 min-h-[48px] w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[15px] leading-6 text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-1.5 px-4 pb-3 pt-1" data-composer-actions="">
        <AttachMenu
          disabled={textOnly || disabled}
          attachTaskCard={taskCardsHere}
          onUpload={() => fileInputRef.current?.click()}
          onShareArtifact={() => setArtifactOpen(true)}
          onShareReplay={() => setReplayOpen(true)}
          onPickTask={async (choice) => {
            if ((await sendTaskCards([choice.id])) === "ok") return;
            setNotice(tt("没能发出任务卡片，请重试。"));
            throw new Error("task_card_failed");
          }}
          loadTasks={loadTaskChoices}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            addFiles(filesFrom(event.target.files));
            event.target.value = "";
          }}
        />
        <div className="relative">
          <button
            type="button"
            onClick={() => setEmojiOpen((v) => !v)}
            aria-label={tt("表情")}
            aria-expanded={emojiOpen}
            title={tt("表情")}
            className={`${COMPOSER_ICON_BUTTON_CLASS} ${emojiOpen ? "bg-neutral-100 text-neutral-700" : ""}`}
          >
            <EmojiGlyph />
          </button>
          {emojiOpen ? (
            <div className="absolute bottom-full left-0 z-30 mb-2">
              <EmojiPicker
                onClose={() => setEmojiOpen(false)}
                onPick={(emoji) => {
                  setEmojiOpen(false);
                  insertAtCaret(emoji);
                }}
              />
            </div>
          ) : null}
        </div>
        {leoEnabled && !editing ? (
          <button
            type="button"
            onClick={insertLeo}
            disabled={disabled}
            aria-label={tt("问 leo")}
            title={tt("问 leo")}
            data-composer-leo=""
            className={COMPOSER_ICON_BUTTON_CLASS}
          >
            <AtGlyph />
          </button>
        ) : null}
        {!editing ? (
          <VoiceRecorder
            disabled={disabled || textOnly}
            onRecorded={sendVoice}
            onError={(code) => setNotice(code === "denied" ? tt("没有麦克风权限") : tt("这个浏览器不支持录音"))}
          />
        ) : null}
        <span className="flex-1" />
        {text.length > MAX_BODY_CHARS - 500 ? (
          <span className={"text-[12px] tabular-nums " + (text.length >= MAX_BODY_CHARS ? "text-rose-600" : "text-neutral-400")}>
            {text.length}/{MAX_BODY_CHARS}
          </span>
        ) : null}
        <button
          type="button"
          disabled={!sendEnabled}
          onClick={() => void submit()}
          className={composerSendButtonClass(sendEnabled)}
          data-send-button=""
          aria-label={editing ? tt("保存") : tt("发送")}
          title={editing ? tt("保存") : tt("发送")}
        >
          {sending ? <span className="v-spinner text-[12px]" aria-hidden="true" /> : editing ? <CheckGlyph /> : <ArrowUpGlyph />}
        </button>
      </div>
      <ArtifactPickerDialog
        open={artifactOpen}
        conversationId={conversationId}
        onClose={() => setArtifactOpen(false)}
        onPick={sendCard}
      />
      <ReplayPickerDialog
        open={replayOpen}
        onClose={() => setReplayOpen(false)}
        onPick={(card) => {
          setReplayOpen(false);
          sendCard(card);
        }}
      />
    </div>
  );
}
