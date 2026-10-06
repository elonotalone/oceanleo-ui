"use client";

// 输入框：多行文字、@ 候选、表情、附件（粘贴 / 拖拽 / 选择）、语音、「+」（分享作品 / 工作回放）、草稿、引用与编辑。
// Enter 发送 / Shift+Enter 换行（手机上 Enter 换行、按钮发送）。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { SendMessageInput } from "../../../lib/im/messages-api";
import type { ImAttachment, ImCard, ImConversationDetail, ImMessage } from "../../../lib/im/types";
import { ReplayPickerDialog } from "../../replay/work/ReplayPickerDialog";
import type { ConversationStore } from "../conversation/conversation-store";
import { plainTextOf } from "../conversation/message-format";
import { LeoComposerAddon, type LeoPayerChoice } from "../leo/LeoComposerAddon";
import { sendTyping } from "../realtime/hooks";
import { ArtifactPickerDialog } from "./ArtifactPickerDialog";
import { AttachmentTray } from "./AttachmentTray";
import { EmojiPicker } from "./EmojiPicker";
import {
  MentionPicker,
  activeMentionQuery,
  applyMention,
  collectMentions,
  mentionCandidates,
  type MentionCandidate,
} from "./MentionPicker";
import { VoiceRecorder } from "./VoiceRecorder";
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
  } = props;
  const tt = useUI();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [picked, setPicked] = useState<MentionCandidate[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [payer, setPayer] = useState<LeoPayerChoice | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const lastTypingAt = useRef(0);
  const restoredRef = useRef<string>("");

  const mobile = layout === "mobile" || isCoarsePointer();
  const allLabel = tt("所有人");

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
    el.style.height = `${Math.min(el.scrollHeight, 8 * 22)}px`;
  }, [text]);

  const active = useMemo(() => activeMentionQuery(text, caret), [text, caret]);
  const candidates = useMemo(
    () =>
      active
        ? mentionCandidates({ conversation, viewerId, query: active.query, allLabel })
        : [],
    [active, conversation, viewerId, allLabel],
  );
  useEffect(() => setActiveIndex(0), [active?.query, candidates.length]);

  const leoEnabled = Boolean(conversation?.leo_enabled) && conversation?.kind !== "talent";
  const mentionsLeo = useMemo(() => collectMentions(text, picked, leoEnabled).mention_leo, [picked, text, leoEnabled]);

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
    [runUpload],
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
    !sending &&
    !uploading &&
    (editing ? trimmed.length > 0 && trimmed !== editing.body : trimmed.length > 0 || readyAttachments.length > 0) &&
    text.length <= MAX_BODY_CHARS;

  const afterSend = () => {
    setText("");
    setPicked([]);
    setJobs([]);
    setPayer(null);
    draftBook.clear(conversationId, threadRootId);
    onClearQuote?.();
    onSent?.();
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
    const mentions = collectMentions(trimmed, picked, leoEnabled);
    const teamPayer = mentions.mention_leo && payer?.kind === "team" ? payer.org_id : null;
    const kind = readyAttachments.length > 0 ? messageKindForAttachments(readyAttachments) : "text";
    const input: Omit<SendMessageInput, "client_id"> = {
      kind,
      body: trimmed,
      ...mentions,
      quote_id: quote?.id ?? null,
      thread_root_id: threadRootId,
      attachments: readyAttachments,
      ...(teamPayer ? { leo_payer_org_id: teamPayer } : {}),
    };
    afterSend();
    void store.send(input);
  };

  const sendCard = (card: ImCard) => {
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
        .catch(() => setVoiceError(tt("语音没能发出去，请重试。")));
    },
    [store, threadRootId, onSent, tt],
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
      <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-center text-[13px] text-neutral-500" data-composer-disabled="">
        {disabledReason}
      </div>
    );
  }

  const quoteName = quoteLabel ?? "";
  return (
    <div
      className={"relative border-t border-neutral-200 bg-white " + (dragging ? "ring-2 ring-inset ring-sky-300" : "")}
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
      {editing ? (
        <div className="flex items-center justify-between bg-amber-50 px-3 py-1.5 text-[12px] text-amber-800">
          <span>{tt("正在编辑消息")}</span>
          <button type="button" onClick={onCancelEdit} className="underline">
            {tt("取消")}
          </button>
        </div>
      ) : null}
      {quote && !editing ? (
        <div className="flex items-center justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-3 py-1.5 text-[12px] text-neutral-500">
          <span className="min-w-0 truncate">
            {tt("回复")} <b className="font-medium text-neutral-700">{quoteName}</b>
            {"："}
            {plainTextOf(quote.body).replace(/\s+/g, " ").slice(0, 60) || quote.card?.title || quote.attachments[0]?.name || ""}
          </span>
          <button type="button" onClick={onClearQuote} aria-label={tt("取消引用")} className="shrink-0 text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>
      ) : null}
      <AttachmentTray jobs={jobs} onCancel={cancelJob} onRetry={retryJob} onRemove={removeJob} />
      {conversation ? (
        <div className="px-3 pt-2">
          <LeoComposerAddon conversation={conversation} mentionActive={mentionsLeo} value={payer} onChange={setPayer} />
        </div>
      ) : null}
      {voiceError ? <div className="px-3 pt-1 text-[12px] text-red-600">{voiceError}</div> : null}
      <div className="relative px-3 pb-2 pt-2">
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
          className="max-h-44 min-h-[40px] w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[14px] leading-[22px] text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
        />
        <div className="mt-1.5 flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setPlusOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={plusOpen}
              aria-label={tt("更多")}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[18px] text-neutral-500 hover:bg-neutral-100"
            >
              +
            </button>
            {plusOpen ? (
              <div role="menu" className="absolute bottom-9 left-0 z-30 min-w-[160px] overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                {[
                  { label: tt("上传文件"), run: () => fileInputRef.current?.click() },
                  { label: tt("分享作品"), run: () => setArtifactOpen(true) },
                  { label: tt("分享工作回放"), run: () => setReplayOpen(true) },
                ].map((entry) => (
                  <button
                    key={entry.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setPlusOpen(false);
                      entry.run();
                    }}
                    className="block w-full px-3 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-50"
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
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
              className="flex h-8 w-8 items-center justify-center rounded-md text-[17px] text-neutral-500 hover:bg-neutral-100"
            >
              ☺
            </button>
            {emojiOpen ? (
              <div className="absolute bottom-9 left-0">
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
          {!editing ? (
            <VoiceRecorder
              disabled={disabled}
              onRecorded={sendVoice}
              onError={(code) => setVoiceError(code === "denied" ? tt("没有麦克风权限") : tt("这个浏览器不支持录音"))}
            />
          ) : null}
          <span className="flex-1" />
          {text.length > MAX_BODY_CHARS - 500 ? (
            <span className={"text-[11.5px] tabular-nums " + (text.length >= MAX_BODY_CHARS ? "text-red-600" : "text-neutral-400")}>
              {text.length}/{MAX_BODY_CHARS}
            </span>
          ) : null}
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void submit()}
            className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] text-white transition-opacity disabled:opacity-30"
            data-send-button=""
          >
            {editing ? tt("保存") : tt("发送")}
          </button>
        </div>
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
