"use client";

import { useEffect, useRef, useState } from "react";
import {
  getOceanleoAgent,
  installOceanleoAgent,
  type Computer,
  type OceanleoAgentStatus,
} from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";
import {
  IconRefresh,
} from "../server-page/chrome-icons";
import { replaceServerPageUrl } from "../server-page/url-state";
import { ProgramStrip, type ProgramStripItem } from "../server-page/ProgramStrip";
import { ServerPageStripPortal } from "../server-page/server-page-chrome";
import { tone } from "../server-page/tone";
import { AcpSettings } from "./AcpSettings";
import { Composer } from "./Composer";
import { InstallSheet } from "./InstallSheet";
import { KeySheet } from "./KeySheet";
import { LoginCard } from "./LoginCard";
import { MessageList } from "./MessageList";
import { useAgentDialog } from "./useAgentDialogController";
import {
  PROGRAM_LABEL,
  type AgentProgram,
  type ProgramStatus,
  type WsProgram,
} from "./types";

const PROGRAMS: readonly AgentProgram[] = [
  "oceanleo",
  "cursor",
  "claude",
  "codex",
  "hermes",
];

function agentProgram(value: string | undefined): AgentProgram | null {
  return PROGRAMS.find((program) => program === value) ?? null;
}

function relativeTime(
  value: string,
  tt: (zh: string, values?: Record<string, string | number>) => string,
): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return tt("刚刚");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return tt("{m} 分钟前", { m: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tt("{h} 小时前", { h: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return tt("{d} 天前", { d: days });
  const months = Math.floor(days / 30);
  if (months < 12) return tt("{mo} 个月前", { mo: months });
  return tt("{y} 年前", { y: Math.floor(months / 12) });
}

function statusOf(program: WsProgram, rows: ProgramStatus[]): ProgramStatus | undefined {
  return rows.find((row) => row.id === program);
}

const oceanleoCache = new Map<string, OceanleoAgentStatus>();
function rememberedProgram(computerId: string): AgentProgram {
  try {
    return agentProgram(window.localStorage.getItem(`oceanleo.serverPage.lastProgram.${computerId}`) ?? undefined) ?? "oceanleo";
  } catch { return "oceanleo"; }
}

export function AcpCard({
  computer,
  initialProgram,
  initialSessionId,
  active = true,
}: {
  computer: Computer;
  initialProgram?: string;
  initialSessionId?: string;
  active?: boolean;
}) {
  const tt = useUI();
  const [selected, setSelected] = useState<AgentProgram>(() =>
    agentProgram(initialProgram) ?? rememberedProgram(computer.id),
  );
  const [mountTarget] = useState(() => ({ program: selected, session: initialSessionId }));
  const mountSession = mountTarget.session;
  const [settingsProgram, setSettingsProgram] = useState<AgentProgram | null>(null);
  const [keyProgram, setKeyProgram] = useState<WsProgram | null>(null);
  const [oceanleoStatus, setOceanleoStatus] = useState<OceanleoAgentStatus | null>(() => oceanleoCache.get(computer.id) ?? null);
  const [oceanleoLoaded, setOceanleoLoaded] = useState(false);
  const [oceanleoInstalling, setOceanleoInstalling] = useState(false);
  const [oceanleoError, setOceanleoError] = useState("");
  const initialSessionApplied = useRef("");

  const dialog = useAgentDialog({
    computerId: computer.id,
    enabled: true,
    active,
    initialProgram: selected,
    oceanleoReady: oceanleoLoaded || oceanleoStatus !== null,
    localOceanleo: oceanleoStatus?.installed === true,
  });

  useEffect(() => {
    let active = true;
    setOceanleoLoaded(false);
    setOceanleoStatus(oceanleoCache.get(computer.id) ?? null);
    setOceanleoError("");
    setSettingsProgram(null);
    setKeyProgram(null);
    initialSessionApplied.current = "";
    void getOceanleoAgent(computer.id)
      .then((status) => {
        if (active) { oceanleoCache.set(computer.id, status); setOceanleoStatus(status); }
      })
      .catch(() => {
        if (active) setOceanleoError(tt("未能读取本地 agent 状态。"));
      })
      .finally(() => {
        if (active) setOceanleoLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [computer.id]);

  useEffect(() => {
    if (!selected || dialog.program === selected || dialog.busy) return;
    dialog.setProgram(selected);
  }, [dialog, selected]);

  useEffect(() => {
    if (selected === "oceanleo" && !oceanleoLoaded) return;
    if (!mountSession || selected !== mountTarget.program || dialog.program !== selected || initialSessionApplied.current) return;
    const key = `${computer.id}:${selected}:${mountSession}`;
    if (initialSessionApplied.current === key) return;
    initialSessionApplied.current = key;
    dialog.openSession(mountSession);
  }, [computer.id, dialog, mountSession, mountTarget.program, selected, oceanleoLoaded]);

  function replaceAddress(program: AgentProgram, session?: string) {
    replaceServerPageUrl(computer.id, { card: "acp", program, session: session || null });
  }

  useEffect(() => {
    try { window.localStorage.setItem(`oceanleo.serverPage.lastProgram.${computer.id}`, selected); } catch { /* Storage may be unavailable. */ }
  }, [computer.id, selected]);

  useEffect(() => {
    if (active && dialog.program === selected) replaceServerPageUrl(computer.id, {
      card: "acp", program: selected, session: dialog.activeSession || null,
    });
  }, [active, computer.id, selected, dialog.program, dialog.activeSession, mountSession]);

  function openProgram(program: AgentProgram) {
    if (dialog.busy && dialog.program !== program) return;
    dialog.setProgram(program);
    setSelected(program);
    replaceAddress(program);
  }

  function openSettings(program: AgentProgram) {
    if (dialog.busy && dialog.program !== program) return;
    dialog.setProgram(program);
    if (selected) {
      setSelected(program);
      replaceAddress(program, dialog.program === program ? dialog.activeSession : undefined);
    }
    setSettingsProgram(program);
  }

  function requestInstall(program: WsProgram) {
    setSettingsProgram(null);
    dialog.openInstall(program);
  }

  function requestLogin(program: WsProgram) {
    setSettingsProgram(null);
    dialog.openLogin(program);
  }

  function requestKey(program: WsProgram) {
    setSettingsProgram(null);
    setKeyProgram(program);
  }

  async function installLocalAgent() {
    if (oceanleoInstalling) return;
    setOceanleoInstalling(true);
    setOceanleoError("");
    try {
      const result = await installOceanleoAgent(computer.id);
      let status: OceanleoAgentStatus;
      try {
        status = await getOceanleoAgent(computer.id);
      } catch {
        status = { installed: true, version: result.version || null, token_active: true };
      }
      oceanleoCache.set(computer.id, status);
      setOceanleoStatus(status);
    } catch {
      setOceanleoError(tt("安装失败，请稍后重试。"));
    } finally {
      setOceanleoInstalling(false);
    }
  }

  const currentWsRow = selected && selected !== "oceanleo"
    ? statusOf(selected, dialog.programs)
    : undefined;
  const sessionTitle = dialog.sessions.find((session) => session.id === dialog.activeSession)?.title;
  const keyRow = keyProgram ? statusOf(keyProgram, dialog.programs) : undefined;

  return (
    <section
      aria-label={tt("AI 对话")}
      className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border text-zinc-900 dark:text-neutral-100 ${tone.border} ${tone.panel}`}
      data-oceanleo-acp-card=""
      data-oceanleo-acp-program={selected ?? ""}
    >
      {active ? <ServerPageStripPortal card="acp">
        <ProgramStrip
          items={PROGRAMS.map((program): ProgramStripItem => {
            const row = program === "oceanleo" ? undefined : statusOf(program, dialog.programs);
            return { id: program, label: PROGRAM_LABEL[program],
              dot: program === "oceanleo" ? "green" : !row?.installed ? "gray" : row.logged_in || row.auth === "key" ? "green" : "yellow",
              running: row?.running, disabled: dialog.busy && selected !== program };
          })}
          selected={selected}
          onSelect={(id) => { const program = agentProgram(id); if (program) openProgram(program); }}
          onSettings={(id) => { const program = agentProgram(id); if (program) openSettings(program); }}
          settingsLabel={tt("设置")}
          storageKey="oceanleo.serverPage.programStrip.acp"
        />
      </ServerPageStripPortal> : null}
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <aside
              className={`flex min-h-0 max-h-48 w-full shrink-0 flex-col border-b p-3 md:max-h-none md:w-60 md:border-b-0 md:border-r ${tone.border}`}
              data-oceanleo-acp-sessions=""
            >
              <div className="flex items-center justify-between gap-2">
                <p className={`text-xs font-medium ${tone.muted}`}>{tt("过去的对话")}</p>
                <button
                  type="button"
                  className={`${tone.iconBtn} size-7`}
                  onClick={dialog.requestSessions}
                  aria-label={tt("刷新")}
                  data-oceanleo-acp-sessions-refresh=""
                >
                  <IconRefresh className="size-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  dialog.newSession();
                  replaceAddress(selected);
                }}
                className="mt-3 w-full px-2 py-1.5 text-left text-sm"
                data-oceanleo-acp-new-session=""
              >
                {tt("新对话")}
              </button>
              <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
                {dialog.sessionsSupported === false ? (
                  <p className={`text-xs leading-5 ${tone.muted}`} data-oceanleo-acp-sessions-unsupported="">
                    {tt("这个程序不支持列出过去的对话")}
                  </p>
                ) : dialog.sessions.length === 0 ? (
                  <p className={`text-xs leading-5 ${tone.muted}`} data-oceanleo-acp-sessions-empty="">
                    {dialog.sessionsSupported === null ? tt("正在读取…") : tt("还没有过去的对话")}
                  </p>
                ) : (
                  dialog.sessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => {
                        dialog.openSession(session.id);
                        replaceAddress(selected, session.id);
                      }}
                      className={`block w-full rounded-lg px-2 py-2 text-left ${tone.hover} ${
                        dialog.activeSession === session.id ? tone.rowActive : ""
                      }`}
                      data-oceanleo-acp-session={session.id}
                    >
                      <span className="block truncate text-xs font-medium">{session.title}</span>
                      {session.updatedAt ? (
                        <span className={`mt-1 block text-[11px] ${tone.muted}`}>
                          {relativeTime(session.updatedAt, tt)}
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-oceanleo-acp-conversation="">
              <header className={`shrink-0 truncate border-b px-3 py-2 text-xs ${tone.border} ${tone.muted}`}>
                {sessionTitle || PROGRAM_LABEL[selected]}
              </header>
              {selected === "oceanleo" && !oceanleoStatus?.installed ? (
                <p className={`mx-3 mt-3 shrink-0 text-xs ${tone.muted}`} data-oceanleo-acp-oceanleo-banner="">
                  {tt("当前使用云端 OceanLeo agent；也可以安装到这台服务器本地运行。")}
                  <button type="button" disabled={!oceanleoLoaded || oceanleoInstalling} onClick={() => void installLocalAgent()} data-oceanleo-acp-oceanleo-install="" className="ml-2 underline disabled:opacity-50">{oceanleoInstalling ? tt("正在安装…") : tt("安装")}</button>
                </p>
              ) : selected !== "oceanleo" && (!currentWsRow?.installed || (currentWsRow.logged_in !== true && currentWsRow.auth !== "key")) ? (
                <div className={`flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-xs ${tone.border} ${tone.muted}`}>
                  <span className="min-w-0 flex-1">
                    {!currentWsRow?.installed ? tt("未安装") : tt("未登录")}
                  </span>
                  {!currentWsRow?.installed ? (
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => requestInstall(selected)}>
                      {tt("安装")}
                    </button>
                  ) : (
                    <>
                      <button type="button" className="underline-offset-2 hover:underline" onClick={() => requestLogin(selected)}>
                        {tt("登录")}
                      </button>
                      <button type="button" className="underline-offset-2 hover:underline" onClick={() => requestKey(selected)}>
                        {tt("Key")}
                      </button>
                    </>
                  )}
                </div>
              ) : null}
              <MessageList dialog={dialog} />
              <Composer
                dialog={dialog}
                showFresh={false}
                context={{ page: "shell", computerId: computer.id, computerName: computer.name }}
              />
            </div>
          </div>

      {oceanleoError ? (
        <p className={`mx-4 mb-4 rounded-lg border px-3 py-2 text-xs ${tone.danger}`} data-oceanleo-acp-oceanleo-error="">
          {oceanleoError}
        </p>
      ) : null}

      <InstallSheet dialog={dialog} />
      <LoginCard dialog={dialog} />
      <KeySheet
        open={keyProgram !== null}
        computerId={computer.id}
        program={keyProgram}
        hasKey={keyRow?.auth === "key"}
        status={keyRow ?? null}
        onLogout={(provider) => { if (keyProgram) dialog.logoutProgram(keyProgram, provider); }}
        onClose={() => setKeyProgram(null)}
        onChanged={dialog.retryConnect}
      />
      {settingsProgram ? (
        <AcpSettings
          open
          computerId={computer.id}
          program={settingsProgram}
          dialog={dialog}
          oceanleoStatus={oceanleoStatus}
          onClose={() => setSettingsProgram(null)}
          onRequestInstall={requestInstall}
          onRequestLogin={requestLogin}
          onRequestKey={requestKey}
          onOceanleoStatusChange={(status) => {
            oceanleoCache.set(computer.id, status);
            setOceanleoStatus(status);
            setOceanleoError("");
          }}
        />
      ) : null}
    </section>
  );
}
