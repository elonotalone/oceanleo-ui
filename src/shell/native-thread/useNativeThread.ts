"use client";

// One managed native (ACP) conversation, headless. The host renders
// `messages` with the main chat stream and drives it from LeoComposer; no
// Computers-page component (program strip, session sidebar, MessageList,
// Composer) is involved.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentMessage } from "../../lib/agent";
import type { Computer } from "../../lib/cloud-computer-api";
import { getComputerTaskTranscript, type ComputerTaskSession } from "../../lib/computer-task-api";
import { useUI } from "../../i18n/ui/useUI";
import type { ComposerAttachment } from "../LeoComposer";
import { composerOccupancy, liveTurnOpen, pendingUnsentReason } from "../cloud-computer/agent-dialog/occupancy";
import { isWsProgram } from "../cloud-computer/agent-dialog/parse";
import { PROGRAM_LABEL, type AgentDialogMessage, type WsProgram } from "../cloud-computer/agent-dialog/types";
import type { NativeMessageSnapshot } from "../../native-agent-core/index";
import { applyDialog, initialDialogState, restoreNativeMessages } from "../cloud-computer/agent-dialog/reduce";
import { useAgentDialog, type AgentDialogControllerV2 } from "../cloud-computer/agent-dialog/useAgentDialogController";
import { mergeNativeDialogPages, dialogToAgentMessages, type NativePermissionMeta, type NativeQuestionMeta } from "./map-dialog";
import { mergeSavedAndLive, mergeTranscriptPages } from "./merge";
import type { NativeProgram } from "./types";
import { nativeModelPickerFor } from "./NativeModelPicker";
import { peekTranscript, readTranscript, rememberTranscript, takeTranscriptPrefetch } from "./transcript-cache";
import { originalForPreparedFile } from "../../lib/upload/image-preparation";

export type NativeThreadInput = {
  computer: Computer | null;
  /** The managed session. `null` + `program` = draft: connect for status/models only. */
  session: ComputerTaskSession | null;
  /**
   * Keep this conversation connected. Hosts keep it true for every opened
   * native chat, visible or hidden, so prompts and progress keep arriving.
   */
  enabled: boolean;
  onNativeSessionChange?: (nativeId: string) => void;
  /**
   * Draft mode only (used when `session` is null): the program picked for a
   * conversation that has no managed session yet. The thread connects to read
   * program status and models (model picker and settings work) but never
   * opens, creates or prompts a session; `send` resolves false.
   * Ignored when `session` is given (the session's program wins).
   */
  program?: NativeProgram | null;
};

export type NativeThread = {
  messages: AgentMessage[];
  /** Connected to the computer right now: permissions/questions can be answered. */
  live: boolean;
  /** No managed session yet (draft): status/models only, nothing can be sent. */
  draft: boolean;
  /**
   * The program is working on this conversation. The ONE source for the
   * composer's Stop, the step-row spinner and can-send (2026-11-02): a stop on
   * its way counts as running, so "steps spinning + send arrow" cannot happen.
   */
  running: boolean;
  /** `stopping` from the Stop click until its outcome; `error` = it did not take effect (see stopError). */
  stopState: "idle" | "stopping" | "stopped" | "error";
  /** Localized reason the last Stop did not take effect (shown next to the composer), else null. */
  stopError: string | null;
  /** A send right now would go out (always false in draft mode). */
  ready: boolean;
  /** The computer is offline: saved messages stay visible and new prompts queue until reconnect. */
  offline: boolean;
  /** One plain-language line when sending is not possible, else null. */
  blockedReason: string | null;
  /**
   * An existing conversation with nothing to show yet because its cloud-saved
   * copy is still being read (a quiet spinner, never 「正在打开对话…」).
   */
  opening: boolean;
  /** Resolves true only when the prompt actually went out. Empty text with ready attachments is a valid send. */
  send(text: string): Promise<boolean>;
  stop(): void;
  retryMessage(messageId: string): Promise<boolean>;
  restoreMessage(messageId: string): Promise<boolean>;
  answer(message: AgentMessage, optionIdOrAnswers: unknown): void;
  composerAttachments: ComposerAttachment[];
  onAttachFiles: ((files: File[]) => void) | undefined;
  onRemoveAttachment: (id: string) => void;
  /** Put a failed attachment into the inbox again. */
  onRetryAttachment?: (id: string) => void;
  modelPicker: ReactNode | null;
  hasOlder: boolean;
  /** Reads ONE more batch of earlier messages and prepends it (never re-reads the whole conversation). */
  loadOlder(): void;
  /** A batch of earlier messages is on its way (the host shows a small spinner at the top). */
  olderLoading: boolean;
  /** True only when saving this conversation to the cloud reported an error. */
  saveFailed: boolean;
  /** The headless controller (settings panel reads models/config/programs from it). */
  dialog: AgentDialogControllerV2;
  /**
   * The first prompt typed before this conversation could take it (homepage
   * launch, a picked chat's first send). It is the user's bubble in `messages`
   * at once, with its attachments, and goes out by itself as soon as the
   * session and the connection are bound. Never handed back silently: when it
   * cannot go out, `unsent` holds the plain reason (shown with a retry).
   */
  pending: NativePendingPrompt | null;
  /** Show `text` (and the composer's files) as the user's bubble now; send it once ready. False when one is already waiting. */
  queue(text: string): boolean;
  /** The waiting prompt cannot go out (e.g. its session could not be created). */
  markUnsent(reason: string): void;
  /** Try the unsent prompt again (it goes out as soon as it can). */
  retry(): void;
  /**
   * A send the computer refused hands its typed text back here (W1 controller
   * `restoredDraft`); `seq` changes once per restore. Hosts put `text` back into
   * an empty composer.
   */
  restoredDraft: { seq: number; text: string; entries?: { seq: number; text: string }[] } | null;
};

export type NativePendingPrompt = {
  text: string;
  /** null while it is waiting to go out; the plain reason once it could not be sent. */
  unsent: string | null;
  /**
   * While it waits for the computer to come back (reconnecting after a drop or a
   * gateway swap): the plain line said under its bubble, else null (2026-11-02 F2).
   */
  waiting?: string | null;
};

type PendingState = NativePendingPrompt & {
  key: number;
  queuedAt: number;
  attachmentIds: string[];
  attachments: { name: string; mime: string }[];
};

/**
 * A queued prompt that has found no way out for this long (computer state never
 * arrived, connection never came up) is marked unsent with a reason and a retry.
 */
export const PENDING_PROMPT_CONNECT_MS = 45_000;
/** The queued prompt's bubble id: below every id map-dialog hands out (-1 … -2147483647). */
const PENDING_BUBBLE_ID = -2147483648;

type Archive = Awaited<ReturnType<typeof getComputerTaskTranscript>>;
/** Earlier saved batches (oldest first) and the cursor for the next one. */
type OlderArchive = { dialog: AgentDialogMessage[]; has_older: Archive["has_older"]; next_before: Archive["next_before"] };

function archiveHasOlder(cursor: Pick<Archive, "has_older" | "next_before"> | null): boolean {
  return cursor?.has_older === true && cursor.next_before != null;
}

function nativeProgramOf(session: ComputerTaskSession | null): WsProgram | null {
  if (!session || session.kind !== "acp") return null;
  return isWsProgram(session.program) ? session.program : null;
}

/** A managed run can finish with a stale live turn still present in the socket. */
function terminalRun(session: ComputerTaskSession | null): boolean {
  return session?.run_status === "completed" || session?.run_status === "failed" || session?.run_status === "cancelled";
}

function hasConversation(messages: AgentDialogMessage[]): boolean {
  return messages.some((message) => message.kind === "user" || message.kind === "turn");
}

function userCount(messages: AgentDialogMessage[]): number {
  return messages.filter((message) => message.kind === "user").length;
}

function isImageFile(mime: string, name: string): boolean {
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name);
}

export function useNativeThread({ computer, session, enabled, onNativeSessionChange, program: draftProgram }: NativeThreadInput): NativeThread {
  const tt = useUI();
  const ttRef = useRef(tt);
  ttRef.current = tt;
  const draft = !session;
  const program = session ? nativeProgramOf(session) : isWsProgram(draftProgram) ? draftProgram : null;
  const online = computer?.node_online === true;
  const computerOnlineRef = useRef(online);
  computerOnlineRef.current = online;
  // `live` below = "this hook keeps a connection"; the exported `live` also needs the link up.
  const live = Boolean(enabled && online && computer && program);
  const [archive, setArchive] = useState<Archive | null>(null);
  const savedSession = archive?.session?.id === session?.id ? archive?.session : null;
  const nativeId = savedSession?.native_session_id || session?.native_session_id || "";
  const [archiveStatus, setArchiveStatus] = useState<"saved" | "pending" | "error" | null>(null);

  const dialog = useAgentDialog({
    computerId: computer?.id ?? "",
    enabled: live,
    active: Boolean(enabled),
    taskSessionId: session?.id,
    onArchiveStatus: setArchiveStatus,
    initialProgram: program ?? "cursor",
    initialSessionId: nativeId || undefined,
    oceanleoReady: false,
    localOceanleo: false,
    // Sessions are opened explicitly below; a draft never opens one.
    openActiveSession: false,
    // Composer files go to the inbox under THIS conversation's task session:
    // held in a draft until the session exists (homepage launch, a picked
    // chat's first send), never sent under another task's session.
    bindUploadsToTaskSession: true,
  });

  // Keep the controller on this session's program (never a program strip).
  useEffect(() => {
    if (program && dialog.program !== program) dialog.setProgram(program);
  }, [dialog, program]);

  // The first prompt waiting for this conversation (NativeThread.pending).
  const [pending, setPending] = useState<PendingState | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  // A session that grows out of this thread's draft is brand new.
  const wasDraft = useRef(false);
  if (!session) wasDraft.current = true;

  // Open this managed session's native conversation once per binding.
  const openedRef = useRef("");
  const sessionKey = session?.id ?? "";
  const previousSession = useRef(sessionKey);
  useEffect(() => {
    if (!live || !program || dialog.program !== program || !session) return;
    if (!nativeId) {
      // Switching from another managed session starts a fresh view. Coming
      // from a draft keeps the draft view (it already is fresh, and the host
      // may be about to send the first prompt into it).
      if (previousSession.current && previousSession.current !== sessionKey && openedRef.current !== `${sessionKey}:`) {
        openedRef.current = `${sessionKey}:`;
        dialog.newSession();
      }
      previousSession.current = sessionKey;
      return;
    }
    previousSession.current = sessionKey;
    if (dialog.activeSession === nativeId) {
      openedRef.current = `${sessionKey}:${nativeId}`;
      return;
    }
    const key = `${sessionKey}:${nativeId}`;
    openedRef.current = key;
    dialog.openSession(nativeId);
  }, [live, program, dialog, dialog.program, dialog.activeSession, nativeId, sessionKey, session]);

  // The host started over (a session, then a draft again, e.g. the homepage's
  // New Task): a fresh view with nothing waiting; the next session is born here.
  const hadSession = useRef(Boolean(session));
  useEffect(() => {
    if (session) { hadSession.current = true; return; }
    if (!hadSession.current) return;
    hadSession.current = false;
    previousSession.current = "";
    openedRef.current = "";
    pendingRef.current = null;
    setPending(null);
    if (dialog.activeSession || dialog.messages.length) dialog.newSession();
    // Files left in the previous conversation's composer were put under its
    // task session: they never ride into the next new chat.
    for (const item of dialog.attachments) dialog.removeAttachment(item.id);
  }, [session, dialog]);

  const reportedRef = useRef(nativeId);
  const onNativeRef = useRef(onNativeSessionChange);
  onNativeRef.current = onNativeSessionChange;
  useEffect(() => {
    const id = dialog.activeSession;
    if (!live || !id || reportedRef.current === id) return;
    reportedRef.current = id;
    onNativeRef.current?.(id);
  }, [live, dialog.activeSession]);

  useEffect(() => { setArchiveStatus(null); }, [sessionKey]);

  // Cloud-saved transcript: the source while offline, and the fallback when an
  // online computer no longer has this conversation's native history.
  // Earlier saved batches, already reduced and kept as they are: a new batch is
  // prepended, so the messages already on screen keep their ids (no full re-render).
  const [olderArchive, setOlderArchive] = useState<OlderArchive | null>(null);
  // The newest saved page read again after the link re-attached (gateway swap, reconnect):
  // joined onto what was read before, so the gap is on screen even without a live replay.
  const [archiveTail, setArchiveTail] = useState<Archive | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  /** The session whose saved copy has been read (or could not be): until then an empty view is "opening". */
  const [archiveReadFor, setArchiveReadFor] = useState("");
  const archiveFor = useRef("");
  const olderLoaded = useRef(false);
  const olderInFlight = useRef(false);
  const bornHere = useRef("");
  // Only a conversation born in this thread depends on the computer's online
  // state (it has nothing saved while online). Every other conversation's read
  // starts at once and is never restarted (or aborted) when the computer's state
  // arrives (2026-10-31 task switch speed: `online` left these deps).
  const waitsForOffline = bornHere.current === sessionKey && online;
  /** A read from the gateway landed for this session (a cached copy never overrides it). */
  const archiveFresh = useRef("");
  useEffect(() => {
    // Only a different session clears what is shown; reconnects and
    // enable/disable keep the saved transcript (and any older pages read).
    if (archiveFor.current !== sessionKey) {
      // Created from this thread's draft a moment ago: nothing is saved yet.
      if (!archiveFor.current && wasDraft.current && session && !session.native_session_id) bornHere.current = sessionKey;
      // A conversation opened before paints from its kept copy at once; the read below refreshes it.
      const kept = bornHere.current === sessionKey ? undefined : peekTranscript(sessionKey);
      setArchive(kept ?? null);
      if (kept) setArchiveReadFor(sessionKey);
      setOlderArchive(null);
      setArchiveTail(null);
      olderLoaded.current = false;
      olderInFlight.current = false;
      archiveFresh.current = "";
      archiveFor.current = sessionKey;
    }
    if (!enabled || !session || session.kind !== "acp") return;
    // A brand-new conversation reads its saved copy only once the computer is offline.
    if (bornHere.current === sessionKey && computerOnlineRef.current) return;
    const id = session.id;
    const controller = new AbortController();
    // This browser's saved copy (IndexedDB) shows while the gateway read is on its way.
    if (!archiveFresh.current) {
      void readTranscript(id).then((kept) => {
        if (!kept || controller.signal.aborted || archiveFor.current !== id || archiveFresh.current === id) return;
        setArchive((current) => current ?? kept);
        setArchiveReadFor(id);
      }).catch(() => undefined);
    }
    // A sidebar hover / press may already have started this read: take it.
    const read = takeTranscriptPrefetch(id) ?? getComputerTaskTranscript(id, { signal: controller.signal });
    void read
      .then((next) => {
        if (controller.signal.aborted || archiveFor.current !== id) return;
        archiveFresh.current = id;
        rememberTranscript(id, next);
        setArchive((current) => (current && olderLoaded.current ? current : next));
        setArchiveReadFor(id);
      })
      .catch(() => {
        // Reading stays quiet; the stream just shows nothing saved yet.
        if (!controller.signal.aborted && archiveFor.current === id) setArchiveReadFor(id);
      });
    return () => controller.abort();
  }, [enabled, sessionKey, session?.kind, waitsForOffline]);

  // Link re-attached (B2 status `link:"attached"`, an adopted session without replay, a
  // socket reopen): read the newest saved page again and join it onto what is shown.
  const reattachSeq = dialog.reattachSeq ?? 0;
  const reattachSeen = useRef(reattachSeq);
  useEffect(() => {
    if (reattachSeen.current === reattachSeq) return;
    reattachSeen.current = reattachSeq;
    if (!enabled || !session || session.kind !== "acp") return;
    const id = session.id;
    void getComputerTaskTranscript(id)
      .then((next) => {
        if (archiveFor.current !== id) return;
        rememberTranscript(id, next);
        setArchiveTail(next);
        setArchiveReadFor(id);
      })
      .catch(() => undefined);
  }, [reattachSeq, enabled, session]);

  const reduceArchive = useCallback((page: Archive, includeMissing = true): AgentDialogMessage[] => {
    type State = ReturnType<typeof initialDialogState>;
    const start: State = { ...initialDialogState(), program: program ?? session?.program ?? null, activeSession: page.session?.native_session_id ?? nativeId };
    const reduced = page.frames.reduce<State>((state, frame) => applyDialog(state, { type: "frame", frame }), start);
    const rows = (page as Archive & { messages?: NativeMessageSnapshot[] }).messages ?? [];
    return restoreNativeMessages(reduced, includeMissing ? rows : rows.filter((row) =>
      reduced.messages.some((message) => message.kind === "user" && message.messageId === row.message_id))).messages;
  }, [program, nativeId]);
  const newestArchiveDialog = useMemo(
    () => (archive ? reduceArchive(archive) : ([] as AgentDialogMessage[])),
    [archive, reduceArchive],
  );
  const tailArchiveDialog = useMemo(
    () => (archiveTail ? reduceArchive(archiveTail) : null),
    [archiveTail, reduceArchive],
  );
  const archiveDialog = useMemo(() => {
    const pages = olderArchive?.dialog.length
      ? newestArchiveDialog.some((m) => (m.kind === "user" && m.messageId) || (m.kind === "turn" && m.turnId))
        ? mergeNativeDialogPages(olderArchive.dialog, newestArchiveDialog)
        : [...olderArchive.dialog, ...newestArchiveDialog]
      : newestArchiveDialog;
    return tailArchiveDialog ? tailArchiveDialog.some((m) => (m.kind === "user" && m.messageId) || (m.kind === "turn" && m.turnId))
      ? mergeNativeDialogPages(pages, tailArchiveDialog) : mergeTranscriptPages(pages, tailArchiveDialog) : pages;
  }, [olderArchive, newestArchiveDialog, tailArchiveDialog]);

  // Saved transcript + live messages are MERGED, never switched (2026-11-02 F2): after a
  // gateway swap the live side adopts a running turn without replaying history, and the
  // old either/or hid everything said before it. A live replay the gateway vouches for
  // (`history replay:true`) takes over only once it covers what is saved (merge.ts).
  const replayKey = program ? `${program}::${dialog.activeSession || nativeId}` : "";
  const liveReplay = replayKey ? dialog.historyReplay?.[replayKey] ?? null : null;
  const merged = useMemo(
    () => (dialog.messages.some((m) => m.seq !== undefined || (m.kind === "user" && m.messageId) || (m.kind === "turn" && m.turnId))
      ? { messages: mergeNativeDialogPages(archiveDialog, dialog.messages), source: "merged" as const }
      : mergeSavedAndLive(archiveDialog, dialog.messages, { replay: liveReplay })
    ),
    [archiveDialog, dialog.messages, liveReplay],
  );
  // Older batches come from the saved copy whenever it is part of what is shown.
  const showArchive = !live || (merged.source !== "live" && hasConversation(archiveDialog));
  const messages = useMemo(
    () => dialogToAgentMessages(merged.messages, { live, tt, engine: program ?? undefined }),
    [merged, live, tt, program],
  );

  // A brand-new conversation (no native session yet) cannot be busy on the
  // computer: once the link is up it never waits for an occupancy reply.
  const brandNew = !nativeId && !dialog.activeSession;
  const occupancyMode = composerOccupancy({
    linkUp: dialog.occupancyLink === true,
    occupancyAt: brandNew && dialog.occupancyLink === true ? Date.now() : dialog.occupancyAt ?? null,
    occupancyBusy: dialog.occupancyBusy ?? [],
    sessionId: dialog.activeSession || dialog.draftRef || "",
    messages: dialog.messages,
    pendingAt: dialog.occupancyPendingAt ?? null,
    pendingSession: dialog.occupancyPendingSession ?? null,
    offline: dialog.offline,
    sessionLoading: dialog.sessionLoading,
  });
  // The persisted task-session state is authoritative once a run is terminal.
  // A reconnect/error frame can leave the controller's old live-turn bit set;
  // without this guard the composer keeps showing Stop forever and cancel has
  // nothing live left to cancel (the exact failure seen on task history pages).
  // 2026-11-02 stop contract: a live turn on screen is work too (Stop is shown and
  // always ends in an outcome), and a stop on its way counts as running.
  const viewSession = dialog.activeSession || dialog.draftRef || "";
  const stopping = dialog.stopState === "stopping";
  const protocolWorking = dialog.messages.some((message) => message.kind === "turn" && message.live && !message.stop);
  const pendingDelivery = dialog.messages.some((message) => message.kind === "user" &&
    (message.delivery?.state === "sending" || message.delivery?.state === "queued"));
  const running = stopping || (live && (
    protocolWorking ||
    occupancyMode === "working"
    || liveTurnOpen(dialog.messages, viewSession)
    || (dialog.busy && !terminalRun(session))
  ));

  const row = program ? dialog.programs.find((item) => item.id === program) : undefined;
  const name = program ? PROGRAM_LABEL[program] : "";
  let blockedReason: string | null = null;
  if (!computer || !online) blockedReason = tt("这台电脑离线，只能查看已保存的对话。");
  else if (row && !row.installed) blockedReason = tt("这台电脑上还没有安装 {program}，请在设置里安装。", { program: name });
  else if (row && (row.logged_in === false || row.auth === "none")) blockedReason = tt("{program} 还没有登录，请在设置里登录。", { program: name });
  const bindingReady = nativeId ? dialog.activeSession === nativeId : !terminalRun(session);
  const ready = live && !draft && bindingReady && !blockedReason && !stopping && !dialog.sessionLoading &&
    !dialog.offline && dialog.occupancyLink === true &&
    (occupancyMode === "idle" || occupancyMode === "working" || dialog.busy || protocolWorking || pendingDelivery) && dialog.program === program;
  const connected = live && dialog.occupancyLink === true && !dialog.offline;

  const send = useCallback(async (text: string) => {
    if (!ready) return false;
    try {
      return (await dialog.send(text)) === true;
    } catch {
      return false;
    }
  }, [ready, dialog]);

  // Queued first prompt: shown now, sent the moment the session and link are
  // bound, never handed back silently (unsent → a reason and a retry).
  const pendingKey = useRef(0);
  const sendingRef = useRef(0);
  const sentBaseline = useRef(0);
  const attachmentsRef = useRef(dialog.attachments);
  attachmentsRef.current = dialog.attachments;
  const dialogMessagesRef = useRef(dialog.messages);
  dialogMessagesRef.current = dialog.messages;
  const queue = useCallback((text: string) => {
    const current = pendingRef.current;
    if (current && !current.unsent) return false;
    // Text and its files go together: a failed file is retried or removed first (F3).
    if (attachmentsRef.current.some((item) => item.state === "error")) return false;
    const clean = text.trim();
    const files = attachmentsRef.current.filter((item) => item.state !== "error");
    if (!clean && !files.length) return false;
    pendingKey.current += 1;
    const next: PendingState = {
      key: pendingKey.current, text: clean, unsent: null, queuedAt: Date.now(),
      attachmentIds: files.map((item) => item.id),
      attachments: files.map((item) => ({ name: item.name, mime: item.mime })),
    };
    pendingRef.current = next;
    setPending(next);
    return true;
  }, []);
  const settlePending = useCallback((key: number, unsent: string | null) => {
    const current = pendingRef.current;
    if (!current || current.key !== key) return;
    const next = unsent === null ? null : { ...current, unsent };
    pendingRef.current = next;
    setPending(next);
  }, []);
  const markUnsent = useCallback((reason: string) => {
    const current = pendingRef.current;
    if (current && !current.unsent) settlePending(current.key, reason);
  }, [settlePending]);
  const retry = useCallback(() => {
    const current = pendingRef.current;
    if (!current?.unsent) return;
    const next = { ...current, unsent: null, queuedAt: Date.now() };
    pendingRef.current = next;
    setPending(next);
  }, []);
  // B2 prompt-not-sent (2026-11-02 F2): the gateway says a prompt never reached the
  // agent (link dropped / gateway swapped). It becomes this conversation's unsent
  // bubble with a resend (「未发送 · 重试」), never a silent loss. Decided once per
  // restore; when another prompt is already waiting, the text goes back to the composer.
  const restored = dialog.restoredDraft ?? null;
  const restoreDecision = useRef<{ seq: number; bubble: boolean } | null>(null);
  if (restored?.unsent && restoreDecision.current?.seq !== restored.seq) {
    const waiting = pendingRef.current;
    restoreDecision.current = { seq: restored.seq, bubble: !(waiting && !waiting.unsent) };
  }
  const restoreAsBubble = Boolean(restored?.unsent && restoreDecision.current?.seq === restored.seq && restoreDecision.current.bubble);
  const bubbledSeq = useRef(0);
  useEffect(() => {
    if (!restored || !restoreAsBubble || bubbledSeq.current === restored.seq) return;
    bubbledSeq.current = restored.seq;
    const ids = restored.fileIds ?? [];
    const files = attachmentsRef.current.filter((item) => ids.includes(item.id) && item.state !== "error");
    pendingKey.current += 1;
    const next: PendingState = {
      key: pendingKey.current, text: restored.text, unsent: ttRef.current("电脑重连时没有发出去"), queuedAt: Date.now(),
      attachmentIds: files.map((item) => item.id),
      attachments: files.map((item) => ({ name: item.name, mime: item.mime })),
    };
    pendingRef.current = next;
    setPending(next);
  }, [restored, restoreAsBubble]);
  const restoredForComposer = useMemo(
    () => (restored && !restoreAsBubble ? { seq: restored.seq, text: restored.text, ...(restored.entries ? { entries: restored.entries } : {}) } : null),
    [restored, restoreAsBubble],
  );
  // Only a known computer can be "offline"; null is still connecting.
  const blockedNow = computer && online ? blockedReason : null;
  useEffect(() => {
    if (!pending || pending.unsent || sendingRef.current === pending.key) return;
    const key = pending.key;
    if (ready) {
      sendingRef.current = key;
      sentBaseline.current = userCount(dialogMessagesRef.current);
      void send(pending.text).then((sent) => {
        if (sendingRef.current === key) sendingRef.current = 0;
        settlePending(key, sent ? null : tt("没能发出去，请重试。"));
      });
      return;
    }
    if (blockedNow) {
      settlePending(key, blockedNow);
      return;
    }
    const reason = pendingUnsentReason({
      linkUp: dialog.occupancyLink === true && !dialog.offline,
      offline: dialog.offline,
      occupancyMode,
      sessionLoading: dialog.sessionLoading,
      messages: dialog.messages,
      sessionId: dialog.activeSession || dialog.draftRef || "",
      // "Stop it first" only while Stop is actually on screen.
      running,
    });
    const reasonText = reason === "connect"
      ? tt("暂时连不上这台电脑，请稍后重试。")
      : reason === "busy"
        ? tt("没能发出去，请重试。")
        : reason === "loading"
          ? tt("这段对话还在打开，请稍后重试。")
          : tt("没能发出去，请重试。");
    const timer = setTimeout(() => settlePending(key, reasonText),
      Math.max(0, pending.queuedAt + PENDING_PROMPT_CONNECT_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [pending, ready, blockedNow, send, settlePending, tt, dialog.occupancyLink, dialog.offline,
    occupancyMode, dialog.sessionLoading, dialog.messages, dialog.activeSession, dialog.draftRef, running]);

  // Never a silent no-op: not connected → the controller says the stop could not be sent.
  const stop = useCallback(() => {
    const queued = pendingRef.current;
    // Withdraw the local first-message queue too; it must never auto-send after Stop.
    if (queued) {
      pendingRef.current = null;
      setPending(null);
      dialog.withdrawLocalPrompt(queued.text, queued.attachmentIds);
    }
    dialog.abort();
  }, [dialog, occupancyMode, settlePending, tt]);

  const answer = useCallback((message: AgentMessage, value: unknown) => {
    if (!connected) return;
    const permission = message.meta?.native_permission as NativePermissionMeta | undefined;
    if (permission && typeof value === "string") {
      if (permission.chosen || permission.actionable === false) return;
      const option = permission.options.find((item) => item.id === value);
      if (option) dialog.answerPermission(permission.permId, option.id, option.name);
      return;
    }
    const question = message.meta?.native_question as NativeQuestionMeta | undefined;
    if (question && value && typeof value === "object" && !Array.isArray(value)) {
      if (question.submitted || question.actionable === false) return;
      const values = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item ?? "")]),
      );
      dialog.answerQuestion(question.questionId, values);
    }
  }, [connected, dialog]);

  // Files that went into the queued prompt ride on its bubble, not in the composer.
  const queuedFiles = pending?.attachmentIds;
  const composerAttachments = useMemo(() => dialog.attachments
    .filter((item) => item.state === "error" || !queuedFiles?.includes(item.id))
    .map((item): ComposerAttachment => {
      const originalFile = originalForPreparedFile(dialog.attachmentFile(item.id));
      return {
      id: item.id,
      name: item.state === "error" ? `${item.name} · ${tt("上传失败")}${item.error ? `（${item.error}）` : ""}` : item.name,
      mime: item.mime,
      ...(originalFile ? { originalFile, uploadBytes: item.size } : {}),
      // Failed: the composer blocks the send and says why, with retry / remove (F3 2026-11-02).
      ...(item.state === "error" ? { failed: true, failedReason: item.error || tt("上传出错") } : {}),
      // A held file can create its session on send; it has no spinner or preview yet.
      uploading: item.state === "uploading" && !item.deferred,
      openingDisabled: item.state !== "done",
      ...(item.state === "uploading" && !item.deferred ? { progress: {
        loaded: item.size * Math.max(0, Math.min(100, item.percent ?? 0)) / 100,
        total: item.size,
        ratio: Math.max(0, Math.min(100, item.percent ?? 0)) / 100,
        elapsedMs: 0, remainingMs: null, bytesPerSecond: 0, done: false, failed: false,
      } } : {}),
      // The tile thumbnail: the local `blob:` preview of an image picked in this tab.
      ...(item.preview ? { previewUrl: item.preview, url: item.preview } : {}),
      // W6: its inbox copy (once uploaded under the session) opens any file type in the sidebar.
      ...(item.archive ? { nativeArchive: item.archive } : {}),
    }; }), [dialog.attachments, dialog.attachmentFile, queuedFiles, tt]);

  // The queued prompt is the user's bubble until the real one (sent) arrives.
  const pendingShown = Boolean(pending) &&
    !(sendingRef.current === pending?.key && userCount(dialog.messages) > sentBaseline.current);
  const threadMessages = useMemo(() => {
    if (!pending || !pendingShown) return messages;
    const attachments = pending.attachments.map((item) => ({
      url: "", name: item.name, mime: item.mime,
      media_type: isImageFile(item.mime, item.name) ? "image" : "doc",
    }));
    const bubble: AgentMessage = {
      id: PENDING_BUBBLE_ID,
      role: "user",
      kind: "text",
      content: pending.text,
      meta: {
        native: true,
        native_pending: true,
        ...(pending.unsent ? { native_unsent: true } : {}),
        ...(attachments.length ? { attachments } : {}),
      },
    };
    return [...messages, bubble];
  }, [messages, pending, pendingShown]);
  // A chat born from this draft has nothing saved to read; any other session is
  // "opening" only until its saved copy has been read.
  const opening = Boolean(enabled && session && session.kind === "acp") && threadMessages.length === 0 &&
    archiveReadFor !== sessionKey && !(bornHere.current === sessionKey && online);
  // Waiting through a reconnect is said under the bubble: it goes out by itself once connected.
  const everLinked = useRef(false);
  if (dialog.occupancyLink === true) everLinked.current = true;
  const reconnecting = Boolean(computer) && (!online || dialog.offline || (everLinked.current && dialog.occupancyLink !== true));
  const waitingLine = pending && !pending.unsent && !ready && reconnecting ? tt("电脑重连中，连上后自动发送") : null;
  const pendingPublic = useMemo<NativePendingPrompt | null>(
    () => (pending ? { text: pending.text, unsent: pending.unsent, ...(waitingLine ? { waiting: waitingLine } : {}) } : null), [pending, waitingLine]);

  // Composer controls (model · mode · fast · effort). Drafts count: shown as
  // soon as the program reports them; "正在读取…" while the computer or the
  // program's catalog is still on its way. Blocked (install / sign-in) or offline
  // keeps the pill: its account and computer rows (read-only while offline).
  const modelPicker = nativeModelPickerFor({
    program: enabled ? program : null,
    computerId: computer?.id ?? "",
    dialog,
    waiting: !computer || !blockedReason,
    online: !(computer && !online),
  });

  const loadOlder = useCallback(() => {
    if (!showArchive) {
      dialog.loadOlderHistory();
      return;
    }
    const cursor = olderArchive ?? archive;
    // One batch at a time: scroll events fire faster than state settles.
    if (!session || !cursor?.has_older || cursor.next_before == null || olderInFlight.current) return;
    const id = session.id;
    olderInFlight.current = true;
    setArchiveLoading(true);
    void getComputerTaskTranscript(id, { before: cursor.next_before })
      .then((older) => {
        if (archiveFor.current !== id) return;
        olderLoaded.current = true;
        const batch = reduceArchive(older, false);
        setOlderArchive((current) => ({
          dialog: current ? [...batch, ...current.dialog] : batch,
          has_older: older.has_older,
          next_before: older.next_before,
        }));
      })
      .catch(() => { /* Keep what is shown; scrolling to the top again retries. */ })
      .finally(() => {
        if (archiveFor.current === id) olderInFlight.current = false;
        setArchiveLoading(false);
      });
  }, [showArchive, dialog, session, archive, olderArchive, reduceArchive]);

  const savedStatus = live ? archiveStatus : archive?.sync_status ?? session?.sync_status ?? null;

  return {
    messages: threadMessages,
    live: connected,
    draft,
    running,
    stopState: dialog.stopState ?? "idle",
    stopError: dialog.stopError ?? null,
    ready,
    offline: !online,
    blockedReason,
    opening,
    send,
    stop,
    retryMessage: (messageId) => dialog.retryMessage(messageId),
    restoreMessage: (messageId) => dialog.restoreMessage(messageId),
    answer,
    composerAttachments,
    onAttachFiles: live ? dialog.addAttachments : undefined,
    onRemoveAttachment: dialog.removeAttachment,
    onRetryAttachment: dialog.retryAttachment,
    modelPicker,
    hasOlder: showArchive ? archiveHasOlder(olderArchive ?? archive) : dialog.hasOlder,
    loadOlder,
    olderLoading: showArchive ? archiveLoading : dialog.historyLoading === true,
    saveFailed: savedStatus === "error",
    dialog,
    pending: pendingPublic,
    queue,
    markUnsent,
    retry,
    restoredDraft: restoredForComposer,
  };
}
