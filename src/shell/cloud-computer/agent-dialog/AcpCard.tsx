"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getOceanleoAgent,
  installOceanleoAgent,
  type Computer,
  type OceanleoAgentStatus,
} from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";
import { serverPageHref } from "../server-page/href";
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

function ProgramState({
  program,
  row,
  oceanleoStatus,
}: {
  program: AgentProgram;
  row?: ProgramStatus;
  oceanleoStatus: OceanleoAgentStatus | null;
}) {
  const tt = useUI();
  if (program === "oceanleo") {
    if (oceanleoStatus?.installed) {
      return (
        <span className={`text-xs ${tone.muted}`} data-oceanleo-acp-agent-state="installed">
          {oceanleoStatus.version
            ? tt("已安装 · {version}", { version: oceanleoStatus.version })
            : tt("已安装")}
        </span>
      );
    }
    return (
      <span className={`text-xs ${tone.muted}`} data-oceanleo-acp-agent-state="cloud">
        {tt("云端 OceanLeo agent")}
      </span>
    );
  }
  if (!row?.installed) {
    return (
      <span className={`text-xs ${tone.muted}`} data-oceanleo-acp-agent-state="missing">
        {tt("未安装")}
      </span>
    );
  }
  if (row.logged_in === false) {
    return (
      <span className="text-xs text-amber-700 dark:text-amber-200" data-oceanleo-acp-agent-state="signed-out">
        {tt("未登录")}
      </span>
    );
  }
  return (
    <span className={`text-xs ${tone.muted}`} data-oceanleo-acp-agent-state={row.logged_in ? "ready" : "unknown"}>
      {row.version
        ? tt("已安装 · {version}", { version: row.version })
        : row.logged_in
          ? tt("已登录")
          : tt("已安装")}
    </span>
  );
}

export function AcpCard({
  computer,
  initialProgram,
  initialSessionId,
}: {
  computer: Computer;
  initialProgram?: string;
  initialSessionId?: string;
}) {
  const tt = useUI();
  const router = useRouter();
  const [selected, setSelected] = useState<AgentProgram | null>(() =>
    agentProgram(initialProgram),
  );
  const [agentsExpanded, setAgentsExpanded] = useState(false);
  const [settingsProgram, setSettingsProgram] = useState<AgentProgram | null>(null);
  const [keyProgram, setKeyProgram] = useState<WsProgram | null>(null);
  const [oceanleoStatus, setOceanleoStatus] = useState<OceanleoAgentStatus | null>(null);
  const [oceanleoLoaded, setOceanleoLoaded] = useState(false);
  const [oceanleoInstalling, setOceanleoInstalling] = useState(false);
  const [oceanleoError, setOceanleoError] = useState("");
  const initialSessionApplied = useRef("");

  const dialog = useAgentDialog({
    computerId: computer.id,
    enabled: oceanleoLoaded,
    localOceanleo: oceanleoStatus?.installed === true,
  });

  useEffect(() => {
    let active = true;
    setOceanleoLoaded(false);
    setOceanleoStatus(null);
    setOceanleoError("");
    setSelected(agentProgram(initialProgram));
    setSettingsProgram(null);
    setKeyProgram(null);
    setAgentsExpanded(false);
    initialSessionApplied.current = "";
    void getOceanleoAgent(computer.id)
      .then((status) => {
        if (active) setOceanleoStatus(status);
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
  }, [computer.id, initialProgram]);

  useEffect(() => {
    if (!oceanleoLoaded || !selected || dialog.program === selected || dialog.busy) return;
    dialog.setProgram(selected);
  }, [dialog, oceanleoLoaded, selected]);

  useEffect(() => {
    if (!initialSessionId || !selected || dialog.program !== selected) return;
    const key = `${computer.id}:${selected}:${initialSessionId}`;
    if (initialSessionApplied.current === key) return;
    initialSessionApplied.current = key;
    dialog.openSession(initialSessionId);
  }, [computer.id, dialog, initialSessionId, selected]);

  function replaceAddress(program: AgentProgram, session?: string) {
    router.replace(
      serverPageHref(computer.id, {
        card: "acp",
        program,
        session: session || undefined,
      }),
    );
  }

  function openProgram(program: AgentProgram) {
    if (dialog.busy && dialog.program !== program) return;
    dialog.setProgram(program);
    setSelected(program);
    setAgentsExpanded(false);
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
  const keyRow = keyProgram ? statusOf(keyProgram, dialog.programs) : undefined;

  return (
    <section
      className={`relative flex min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-2xl border text-zinc-900 dark:text-neutral-100 ${tone.border} ${tone.panel}`}
      data-oceanleo-acp-card=""
      data-oceanleo-acp-program={selected ?? ""}
    >
      {selected ? (
        <>
          <header className={`border-b px-3 py-2 ${tone.border}`} data-oceanleo-acp-agent-bar="">
            {agentsExpanded ? (
              <div className="flex flex-wrap items-center gap-2" data-oceanleo-acp-agents-expanded="">
                {PROGRAMS.map((program) => (
                  <span key={program} className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      disabled={dialog.busy && selected !== program}
                      onClick={() => openProgram(program)}
                      className={`rounded-lg px-2.5 py-1 text-xs disabled:opacity-40 ${
                        selected === program ? tone.chipActive : `${tone.chip} ${tone.hover}`
                      }`}
                      data-oceanleo-acp-agent-tab={program}
                    >
                      {PROGRAM_LABEL[program]}
                    </button>
                    <button
                      type="button"
                      disabled={dialog.busy && selected !== program}
                      onClick={() => openSettings(program)}
                      className={`rounded-md px-1.5 py-1 text-xs disabled:opacity-40 ${tone.hover} ${tone.muted}`}
                      aria-label={`${PROGRAM_LABEL[program]} · ${tt("设置")}`}
                      data-oceanleo-acp-agent-settings={program}
                    >
                      ⚙
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setAgentsExpanded(false)}
                  className={`ml-auto rounded-lg px-2 py-1 text-xs ${tone.hover} ${tone.muted}`}
                  aria-label={tt("收起")}
                  data-oceanleo-acp-agents-collapse=""
                >
                  ↑
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2" data-oceanleo-acp-agents-collapsed="">
                <button
                  type="button"
                  onClick={() => setAgentsExpanded(true)}
                  className={`flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium ${tone.hover}`}
                  aria-label={tt("展开")}
                  data-oceanleo-acp-agents-expand=""
                >
                  <span className="truncate">{PROGRAM_LABEL[selected]}</span>
                  <span aria-hidden="true" className={tone.muted}>↓</span>
                </button>
                <button
                  type="button"
                  onClick={() => openSettings(selected)}
                  className={`rounded-lg px-2 py-1.5 text-sm ${tone.hover} ${tone.muted}`}
                  aria-label={`${PROGRAM_LABEL[selected]} · ${tt("设置")}`}
                  data-oceanleo-acp-current-settings=""
                >
                  ⚙
                </button>
              </div>
            )}
          </header>

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <aside
              className={`w-full shrink-0 border-b p-3 md:w-56 md:border-b-0 md:border-r ${tone.border}`}
              data-oceanleo-acp-sessions=""
            >
              <div className="flex items-center justify-between gap-2">
                <p className={`text-xs font-medium ${tone.muted}`}>{tt("过去的对话")}</p>
                <button
                  type="button"
                  className={`rounded-md px-1.5 py-1 text-xs ${tone.hover} ${tone.muted}`}
                  onClick={dialog.requestSessions}
                  aria-label={tt("刷新")}
                  data-oceanleo-acp-sessions-refresh=""
                >
                  ↻
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  dialog.newSession();
                  replaceAddress(selected);
                }}
                className={`mt-3 w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${tone.primary}`}
                data-oceanleo-acp-new-session=""
              >
                + {tt("新对话")}
              </button>
              <div className="mt-3 space-y-1">
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

            <div className="flex min-h-[28rem] min-w-0 flex-1 flex-col" data-oceanleo-acp-conversation="">
              {selected === "oceanleo" && !oceanleoStatus?.installed ? (
                <div className={`m-3 rounded-xl border px-3 py-2 text-xs ${tone.warn}`}>
                  {tt("当前使用云端 OceanLeo agent；也可以安装到这台服务器本地运行。")}
                </div>
              ) : selected !== "oceanleo" && (!currentWsRow?.installed || currentWsRow.logged_in === false) ? (
                <div className={`m-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs ${tone.warn}`}>
                  <span className="min-w-0 flex-1">
                    {!currentWsRow?.installed ? tt("未安装") : tt("未登录")}
                  </span>
                  {!currentWsRow?.installed ? (
                    <button type="button" className="underline" onClick={() => requestInstall(selected)}>
                      {tt("安装")}
                    </button>
                  ) : (
                    <>
                      <button type="button" className="underline" onClick={() => requestLogin(selected)}>
                        {tt("登录")}
                      </button>
                      <button type="button" className="underline" onClick={() => requestKey(selected)}>
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
        </>
      ) : (
        <div className="p-5" data-oceanleo-acp-picker="">
          <h2 className="text-lg font-semibold">{tt("AI 对话")}</h2>
          <p className={`mt-1 text-sm ${tone.muted}`}>
            {tt("选择在这台服务器上运行的 AI agent。")}
          </p>

          {!oceanleoStatus?.installed ? (
            <div className={`mt-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm ${tone.warn}`} data-oceanleo-acp-oceanleo-banner="">
              <span className="min-w-0 flex-1">
                {tt("在这台服务器上安装 OceanLeo agent：本地运行、按用量从余额扣费")}
              </span>
              <button
                type="button"
                disabled={!oceanleoLoaded || oceanleoInstalling}
                onClick={() => void installLocalAgent()}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${tone.primary}`}
                data-oceanleo-acp-oceanleo-install=""
              >
                {oceanleoInstalling ? tt("正在安装…") : tt("安装")}
              </button>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PROGRAMS.map((program) => {
              const row = program === "oceanleo" ? undefined : statusOf(program, dialog.programs);
              const canOpen = program === "oceanleo" || row?.installed === true;
              return (
                <article
                  key={program}
                  className={`rounded-xl border p-4 ${tone.border}`}
                  data-oceanleo-acp-agent={program}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      disabled={!canOpen}
                      className={`min-w-0 flex-1 rounded-lg text-left disabled:cursor-not-allowed disabled:opacity-60 ${canOpen ? tone.hover : ""}`}
                      onClick={() => openProgram(program)}
                      data-oceanleo-acp-agent-open={program}
                    >
                      <span className="block text-sm font-medium">{PROGRAM_LABEL[program]}</span>
                      <span className="mt-2 block">
                        <ProgramState program={program} row={row} oceanleoStatus={oceanleoStatus} />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openSettings(program)}
                      className={`rounded-lg px-2 py-1 text-sm ${tone.hover} ${tone.muted}`}
                      aria-label={`${PROGRAM_LABEL[program]} · ${tt("设置")}`}
                      data-oceanleo-acp-picker-settings={program}
                    >
                      ⚙
                    </button>
                  </div>
                  {program !== "oceanleo" && !row?.installed ? (
                    <button
                      type="button"
                      className={`mt-3 rounded-lg px-3 py-1.5 text-xs ${tone.primary}`}
                      onClick={() => requestInstall(program)}
                      data-oceanleo-acp-picker-install={program}
                    >
                      {tt("安装")}
                    </button>
                  ) : program !== "oceanleo" && row?.logged_in === false ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className={`rounded-lg px-3 py-1.5 text-xs ${tone.primary}`}
                        onClick={() => requestLogin(program)}
                        data-oceanleo-acp-picker-login={program}
                      >
                        {tt("登录")}
                      </button>
                      <button
                        type="button"
                        className={`rounded-lg border px-3 py-1.5 text-xs ${tone.border} ${tone.hover}`}
                        onClick={() => requestKey(program)}
                        data-oceanleo-acp-picker-key={program}
                      >
                        {tt("Key")}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      )}

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
            setOceanleoStatus(status);
            setOceanleoError("");
          }}
        />
      ) : null}
    </section>
  );
}
