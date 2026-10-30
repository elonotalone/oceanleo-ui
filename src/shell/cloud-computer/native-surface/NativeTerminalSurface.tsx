"use client";

// 任务页里的「命令行 / 终端」左栏：只有 xterm，外框用宿主样式。
// 没有程序条、没有过去会话侧栏、没有卡内设置浮层（设置在宿主右栏）。
// 原生 id 由宿主保存（bindComputerTaskSession）；这里只在拿到新 id 时回调一次，
// 绑定没成功前不连 xterm，重试复用同一个进程，不会再开新进程。

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cloudComputerApi,
  type CloudComputerClient,
  type Computer,
  type TerminalRecord,
} from "../../../lib/cloud-computer-api";
import type { ComputerTaskSession } from "../../../lib/computer-task-api";
import { useUI } from "../../../i18n/ui/useUI";
import { SHELL_ENDED_ZH } from "../../../i18n/ui/messages/shell-ended-copy";
import { useComputerTerminal } from "../TerminalPanel";
import { useTerminalAppearance } from "../terminal-card/appearance";
import { cliLaunchOptions, readCliProgramSettings } from "../terminal-card/cli-settings";
import { DEFAULT_PTY_COLS, DEFAULT_PTY_ROWS } from "../terminal-card/model";
import { terminalThemeFor } from "../terminal-card/xterm-themes";
import { HOST } from "./host-style";

export type NativeTerminalSurfaceProps = {
  computer: Computer | null;
  /** Managed task session; kind "cli" or "terminal". */
  session: ComputerTaskSession;
  /** Visibility only. The surface stays mounted (socket + xterm kept) while hidden. */
  active: boolean;
  /** Called once per new native id; the host persists it. A rejection keeps the process for retry. */
  onNativeSessionChange?: (nativeId: string) => void | Promise<void>;
  client?: CloudComputerClient;
};

type Phase = "idle" | "opening" | "failed" | "bind_failed" | "not_installed";

function HostTerminalViewport({
  computerId,
  sessionId,
  active,
  onEnded,
}: {
  computerId: string;
  sessionId: string;
  active: boolean;
  onEnded: () => void;
}) {
  const tt = useUI();
  const [appearance] = useTerminalAppearance();
  const terminal = useComputerTerminal({ computerId, sessionId, enabled: true, active });
  const notified = useRef(false);
  useEffect(() => {
    if (terminal.status !== "exit" && terminal.status !== "gone") return;
    if (notified.current) return;
    notified.current = true;
    onEnded();
  }, [onEnded, terminal.status]);
  const background = terminalThemeFor(appearance.theme, false).background;
  return (
    <>
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200"
        style={background ? { background } : undefined}
        data-oceanleo-native-terminal-frame={sessionId}
      >
        <div ref={terminal.hostRef} className="min-h-0 w-full flex-1 px-2 py-1" data-oceanleo-card-xterm="" />
        {!terminal.ready ? (
          <div className={`pointer-events-none absolute inset-0 grid place-items-center text-[12px] ${HOST.faint}`} data-oceanleo-native-terminal-loading="">
            {tt("终端加载中")}
          </div>
        ) : null}
      </div>
      {terminal.status === "reconnecting" ? (
        <p className={`shrink-0 px-1 pt-2 ${HOST.hint}`} role="status" data-oceanleo-native-terminal-reconnecting="">
          {tt(SHELL_ENDED_ZH.reconnecting)}
        </p>
      ) : terminal.status === "error" ? (
        <div className="flex shrink-0 items-center gap-2 px-1 pt-2" role="alert" data-oceanleo-native-terminal-lost="">
          <span className={HOST.hint}>{tt(SHELL_ENDED_ZH.connectionLost)}</span>
          <button type="button" className={HOST.secondary} onClick={terminal.retry}>
            {tt(SHELL_ENDED_ZH.retryConnection)}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function NativeTerminalSurface({
  computer,
  session,
  active,
  onNativeSessionChange,
  client = cloudComputerApi,
}: NativeTerminalSurfaceProps) {
  const tt = useUI();
  const online = computer?.node_online === true;
  const computerId = computer?.id ?? session.computer_id;
  const isCli = session.kind === "cli";
  const [nativeId, setNativeId] = useState<string | null>(session.native_session_id ?? null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [ended, setEnded] = useState(false);
  const [programLabel, setProgramLabel] = useState(session.program ?? "");
  const pending = useRef<TerminalRecord | null>(null);
  const started = useRef(Boolean(session.native_session_id));
  const busy = useRef(false);
  const onBind = useRef(onNativeSessionChange);
  onBind.current = onNativeSessionChange;

  // The host may re-pass the bound id (e.g. after reload); adopt it without remounting others.
  useEffect(() => {
    const bound = session.native_session_id;
    if (bound && bound !== nativeId) {
      started.current = true;
      setNativeId(bound);
      setEnded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.native_session_id]);

  const open = useCallback(async () => {
    if (!online || busy.current) return;
    busy.current = true;
    setPhase("opening");
    try {
      let record = pending.current;
      if (!record) {
        if (isCli) {
          const program = session.program ?? "";
          const listed = await client.listCliPrograms(computerId);
          const found = (listed.programs || []).find((item) => item.id === program);
          if (found?.label) setProgramLabel(found.label);
          if (!found || !found.installed) {
            setPhase("not_installed");
            return;
          }
          let confirmDangerous = true;
          try {
            confirmDangerous = (await client.getAgentSettings(computerId)).confirm_dangerous;
          } catch {
            /* Safe default: ask before dangerous actions. */
          }
          record = (await client.launchCli(computerId, {
            program: found.id,
            options: cliLaunchOptions(found, readCliProgramSettings(computerId, found.id), confirmDangerous),
            cols: DEFAULT_PTY_COLS,
            rows: DEFAULT_PTY_ROWS,
          })).session;
        } else {
          record = (await client.openTerminalSession(computerId, {
            cols: DEFAULT_PTY_COLS,
            rows: DEFAULT_PTY_ROWS,
            kind: "shell",
          })).session;
        }
        pending.current = record;
      }
      try {
        await onBind.current?.(record.id);
      } catch {
        setPhase("bind_failed");
        return;
      }
      pending.current = null;
      setNativeId(record.id);
      setEnded(false);
      setPhase("idle");
    } catch {
      setPhase("failed");
    } finally {
      busy.current = false;
    }
  }, [client, computerId, isCli, online, session.program]);

  // A new CLI/terminal conversation opens its process the first time it is shown online.
  useEffect(() => {
    if (!active || !online || nativeId || started.current) return;
    started.current = true;
    void open();
  }, [active, online, nativeId, open]);

  const markEnded = useCallback(() => setEnded(true), []);
  const reopen = useCallback(() => {
    pending.current = null;
    void open();
  }, [open]);

  if (!online) {
    return (
      <section
        className="grid h-full min-h-0 min-w-0 place-items-center bg-white p-6 text-center"
        data-oceanleo-native-surface={session.kind}
        data-active={active ? "1" : "0"}
        data-oceanleo-native-surface-offline=""
      >
        <p className={`max-w-sm text-[13px] leading-6 ${HOST.muted}`}>
          {tt("这台电脑离线。终端内容不会保存，联网后可重新打开。")}
        </p>
      </section>
    );
  }

  const label = programLabel || session.program || "";
  return (
    <section
      aria-label={isCli ? tt("AI 命令行") : tt("终端")}
      className="flex h-full min-h-0 min-w-0 flex-col bg-white p-3 pb-0"
      data-oceanleo-native-surface={session.kind}
      data-active={active ? "1" : "0"}
    >
      {nativeId ? (
        <HostTerminalViewport key={nativeId} computerId={computerId} sessionId={nativeId} active={active} onEnded={markEnded} />
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center rounded-xl border border-neutral-200 p-6 text-center" data-oceanleo-native-surface-empty="">
          <div className="grid justify-items-center gap-3">
            <p className={`text-[13px] ${HOST.muted}`} role={phase === "failed" || phase === "bind_failed" ? "alert" : "status"}>
              {phase === "not_installed"
                ? tt("这台电脑还没有安装 {program}。", { program: label })
                : phase === "failed"
                  ? isCli ? tt("AI 命令行启动失败，请稍后重试。") : tt("新终端创建失败，请稍后重试。")
                  : phase === "bind_failed"
                    ? tt("没能把它保存到这个任务，请重试。")
                    : isCli ? tt("正在启动…") : tt("正在创建…")}
            </p>
            {phase === "failed" || phase === "bind_failed" || phase === "not_installed" ? (
              <button type="button" className={HOST.secondary} onClick={() => void open()} data-oceanleo-native-surface-retry="">
                {tt("重试")}
              </button>
            ) : null}
          </div>
        </div>
      )}
      {nativeId && ended ? (
        <div className="flex shrink-0 items-center gap-2 px-1 pt-2" data-oceanleo-native-surface-ended="">
          <span className={HOST.hint}>{isCli ? tt("这个命令行已结束。") : tt("这个终端已结束。")}</span>
          <button type="button" className={HOST.secondary} disabled={phase === "opening"} onClick={reopen} data-oceanleo-native-surface-reopen="">
            {tt("重新打开")}
          </button>
        </div>
      ) : null}
      {nativeId && phase === "bind_failed" ? (
        <div className="flex shrink-0 items-center gap-2 px-1 pt-2" role="alert">
          <span className={HOST.error}>{tt("没能把它保存到这个任务，请重试。")}</span>
          <button type="button" className={HOST.secondary} onClick={() => void open()}>{tt("重试")}</button>
        </div>
      ) : null}
      {nativeId && phase === "failed" ? (
        <p className={`shrink-0 px-1 pt-2 ${HOST.error}`} role="alert">
          {isCli ? tt("AI 命令行启动失败，请稍后重试。") : tt("新终端创建失败，请稍后重试。")}
        </p>
      ) : null}
      <div className="h-3 shrink-0" aria-hidden="true" />
    </section>
  );
}
