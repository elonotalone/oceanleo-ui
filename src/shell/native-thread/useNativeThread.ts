"use client";

// One managed native (ACP) conversation, headless. The host renders
// `messages` with the main chat stream and drives it from LeoComposer; no
// Computers-page component (program strip, session sidebar, MessageList,
// Composer) is involved.

import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentMessage } from "../../lib/agent";
import type { Computer } from "../../lib/cloud-computer-api";
import { getComputerTaskTranscript, type ComputerTaskSession } from "../../lib/computer-task-api";
import { useUI } from "../../i18n/ui/useUI";
import type { ComposerAttachment } from "../LeoComposer";
import { modelControls } from "../cloud-computer/agent-dialog/model-controls";
import { readModelParamMemory } from "../cloud-computer/agent-dialog/model-param-memory";
import { composerOccupancy } from "../cloud-computer/agent-dialog/occupancy";
import { isWsProgram } from "../cloud-computer/agent-dialog/parse";
import { PROGRAM_LABEL, type AgentDialogMessage, type WsProgram } from "../cloud-computer/agent-dialog/types";
import { applyDialog, initialDialogState } from "../cloud-computer/agent-dialog/reduce";
import { useAgentDialog, type AgentDialogControllerV2 } from "../cloud-computer/agent-dialog/useAgentDialogController";
import { dialogToAgentMessages, type NativePermissionMeta, type NativeQuestionMeta } from "./map-dialog";
import type { NativeProgram } from "./types";
import { NativeModelPicker } from "./NativeModelPicker";

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
  /** The program is working on this conversation (show Stop / progress). */
  running: boolean;
  /** A send right now would go out (always false in draft mode). */
  ready: boolean;
  /** The computer is offline: messages are the cloud-saved transcript, composer read-only. */
  offline: boolean;
  /** One plain-language line when sending is not possible, else null. */
  blockedReason: string | null;
  /** Resolves true only when the prompt actually went out. Empty text with ready attachments is a valid send. */
  send(text: string): Promise<boolean>;
  stop(): void;
  answer(message: AgentMessage, optionIdOrAnswers: unknown): void;
  composerAttachments: ComposerAttachment[];
  onAttachFiles: ((files: File[]) => void) | undefined;
  onRemoveAttachment: (id: string) => void;
  modelPicker: ReactNode | null;
  hasOlder: boolean;
  loadOlder(): void;
  /** True only when saving this conversation to the cloud reported an error. */
  saveFailed: boolean;
  /** The headless controller (settings panel reads models/config/programs from it). */
  dialog: AgentDialogControllerV2;
};

type Archive = Awaited<ReturnType<typeof getComputerTaskTranscript>>;

function nativeProgramOf(session: ComputerTaskSession | null): WsProgram | null {
  if (!session || session.kind !== "acp") return null;
  return isWsProgram(session.program) ? session.program : null;
}

function hasConversation(messages: AgentDialogMessage[]): boolean {
  return messages.some((message) => message.kind === "user" || message.kind === "turn");
}

export function useNativeThread({ computer, session, enabled, onNativeSessionChange, program: draftProgram }: NativeThreadInput): NativeThread {
  const tt = useUI();
  const draft = !session;
  const program = session ? nativeProgramOf(session) : isWsProgram(draftProgram) ? draftProgram : null;
  const online = computer?.node_online === true;
  // `live` below = "this hook keeps a connection"; the exported `live` also needs the link up.
  const live = Boolean(enabled && online && computer && program);
  const nativeId = session?.native_session_id ?? "";
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
  });

  // Keep the controller on this session's program (never a program strip).
  useEffect(() => {
    if (program && dialog.program !== program) dialog.setProgram(program);
  }, [dialog, program]);

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
    if (openedRef.current === key) return;
    openedRef.current = key;
    dialog.openSession(nativeId);
  }, [live, program, dialog, dialog.program, dialog.activeSession, nativeId, sessionKey, session]);

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
  const [archive, setArchive] = useState<Archive | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const archiveFor = useRef("");
  const olderLoaded = useRef(false);
  useEffect(() => {
    // Only a different session clears what is shown; reconnects and
    // enable/disable keep the saved transcript (and any older pages read).
    if (archiveFor.current !== sessionKey) {
      setArchive(null);
      olderLoaded.current = false;
      archiveFor.current = sessionKey;
    }
    if (!enabled || !session || session.kind !== "acp") return;
    const controller = new AbortController();
    void getComputerTaskTranscript(session.id, { signal: controller.signal })
      .then((next) => {
        if (archiveFor.current !== session.id) return;
        setArchive((current) => (current && olderLoaded.current ? current : next));
      })
      .catch(() => { /* Reading stays quiet; the stream just shows nothing saved yet. */ });
    return () => controller.abort();
  }, [enabled, sessionKey, session?.kind, online]);

  const archiveDialog = useMemo(() => {
    if (!archive) return [] as AgentDialogMessage[];
    type State = ReturnType<typeof initialDialogState>;
    const start: State = { ...initialDialogState(), program: program ?? session?.program ?? null, activeSession: archive.session?.native_session_id ?? nativeId };
    return archive.frames.reduce<State>((state, frame) => applyDialog(state, { type: "frame", frame }), start).messages;
  }, [archive, program, nativeId]);

  const liveHasConversation = live && hasConversation(dialog.messages);
  const showArchive = !live || (!liveHasConversation && !dialog.sessionLoading && !dialog.busy && hasConversation(archiveDialog));
  const messages = useMemo(() => {
    if (!showArchive) return dialogToAgentMessages(dialog.messages, { live: true, tt });
    const saved = dialogToAgentMessages(archiveDialog, { live: false, tt });
    if (!live) return saved;
    // Online fallback: keep live notices (e.g. a failed reopen) under the saved transcript.
    const notices = dialogToAgentMessages(dialog.messages.filter((message) => message.kind === "notice"), { live: true, tt });
    const used = new Set(saved.map((message) => message.id));
    return [...saved, ...notices.filter((message) => !used.has(message.id))];
  }, [showArchive, live, dialog.messages, archiveDialog, tt]);

  const occupancyMode = composerOccupancy({
    linkUp: dialog.occupancyLink === true,
    occupancyAt: dialog.occupancyAt ?? null,
    occupancyBusy: dialog.occupancyBusy ?? [],
    sessionId: dialog.activeSession || dialog.draftRef || "",
    messages: dialog.messages,
    pendingAt: dialog.occupancyPendingAt ?? null,
    pendingSession: dialog.occupancyPendingSession ?? null,
    offline: dialog.offline,
    sessionLoading: dialog.sessionLoading,
  });
  const running = live && (occupancyMode === "working" || dialog.busy);

  const row = program ? dialog.programs.find((item) => item.id === program) : undefined;
  const name = program ? PROGRAM_LABEL[program] : "";
  let blockedReason: string | null = null;
  if (!computer || !online) blockedReason = tt("这台电脑离线，只能查看已保存的对话。");
  else if (row && !row.installed) blockedReason = tt("这台电脑上还没有安装 {program}，请在设置里安装。", { program: name });
  else if (row && (row.logged_in === false || row.auth === "none")) blockedReason = tt("{program} 还没有登录，请在设置里登录。", { program: name });
  const ready = live && !draft && !blockedReason && occupancyMode === "idle" && dialog.program === program;
  const connected = live && dialog.occupancyLink === true && !dialog.offline;

  const send = useCallback(async (text: string) => {
    if (!ready) return false;
    try {
      return (await dialog.send(text)) === true;
    } catch {
      return false;
    }
  }, [ready, dialog]);

  const stop = useCallback(() => {
    if (live) dialog.abort();
  }, [live, dialog]);

  const answer = useCallback((message: AgentMessage, value: unknown) => {
    if (!connected) return;
    const permission = message.meta?.native_permission as NativePermissionMeta | undefined;
    if (permission && typeof value === "string") {
      if (permission.chosen) return;
      const option = permission.options.find((item) => item.id === value);
      if (option) dialog.answerPermission(permission.permId, option.id, option.name);
      return;
    }
    const question = message.meta?.native_question as NativeQuestionMeta | undefined;
    if (question && value && typeof value === "object" && !Array.isArray(value)) {
      if (question.submitted) return;
      const values = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item ?? "")]),
      );
      dialog.answerQuestion(question.questionId, values);
    }
  }, [connected, dialog]);

  const composerAttachments = useMemo(() => dialog.attachments.map((item): ComposerAttachment => ({
    id: item.id,
    name: item.state === "error" ? `${item.name} · ${tt("上传失败")}` : item.name,
    mime: item.mime,
    uploading: item.state === "uploading",
  })), [dialog.attachments, tt]);

  const controls = program
    ? modelControls(program, dialog.models, dialog.configOptions || [], dialog.selectedModel,
      readModelParamMemory(computer?.id ?? "", program))
    : null;
  const hasModes = Boolean(dialog.mode && dialog.mode.options.length > 0);
  const modelPicker = live && controls && (controls.models.length > 0 || hasModes)
    ? createElement(NativeModelPicker, {
      models: controls.models,
      selected: controls.selected,
      onSelect: dialog.setSelectedModel,
      mode: dialog.mode,
      selectedMode: dialog.selectedMode,
      onMode: dialog.setMode,
    })
    : null;

  const loadOlder = useCallback(() => {
    if (!showArchive) {
      dialog.loadOlderHistory();
      return;
    }
    if (!session || !archive?.has_older || archive.next_before == null || archiveLoading) return;
    const id = session.id;
    setArchiveLoading(true);
    void getComputerTaskTranscript(id, { before: archive.next_before })
      .then((older) => {
        if (archiveFor.current !== id) return;
        olderLoaded.current = true;
        setArchive((current) => current
          ? { ...current, frames: [...older.frames, ...current.frames], has_older: older.has_older, next_before: older.next_before }
          : older);
      })
      .catch(() => { /* Keep what is shown; the button stays available. */ })
      .finally(() => setArchiveLoading(false));
  }, [showArchive, dialog, session, archive, archiveLoading]);

  const savedStatus = live ? archiveStatus : archive?.sync_status ?? session?.sync_status ?? null;

  return {
    messages,
    live: connected,
    draft,
    running,
    ready,
    offline: !online,
    blockedReason,
    send,
    stop,
    answer,
    composerAttachments,
    onAttachFiles: live ? dialog.addAttachments : undefined,
    onRemoveAttachment: dialog.removeAttachment,
    modelPicker,
    hasOlder: showArchive ? archive?.has_older === true && archive.next_before != null : dialog.hasOlder,
    loadOlder,
    saveFailed: savedStatus === "error",
    dialog,
  };
}
