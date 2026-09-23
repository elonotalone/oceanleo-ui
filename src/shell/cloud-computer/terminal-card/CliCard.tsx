"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cloudComputerApi,
  type CliChat,
  type CliProgram,
  type CloudComputerClient,
  type Computer,
  type TerminalRecord,
} from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";
import {
  IconChevron,
  IconClose,
  IconPlus,
  IconSettings,
} from "../server-page/chrome-icons";
import { serverPageHref } from "../server-page/href";
import { tone } from "../server-page/tone";
import {
  cliLaunchOptions,
  readCliProgramSettings,
} from "./cli-settings";
import {
  CliSettingsPanel,
  isCliToolProgram,
  type CliToolProgram,
} from "./CliSettingsPanel";
import {
  orderedCliPrograms,
  runningCliTerminals,
  sortCliChats,
} from "./model";
import { TerminalViewport } from "./TerminalViewport";

export type CliCardProps = {
  computer: Computer;
  initialProgram?: string;
  initialSessionId?: string;
  client?: CloudComputerClient;
  refreshIntervalMs?: number;
};

function normalizeCliRecord(record: TerminalRecord, program: string): TerminalRecord {
  return {
    ...record,
    kind: "cli",
    program,
    alive: record.alive !== false,
  };
}

type NoticeKind = "info" | "error";

export function CliCard({
  computer,
  initialProgram,
  initialSessionId,
  client = cloudComputerApi,
  refreshIntervalMs = 15_000,
}: CliCardProps) {
  const tt = useUI();
  const router = useRouter();
  const [programs, setPrograms] = useState<CliProgram[]>([]);
  const [programId, setProgramId] = useState(initialProgram || "oceanleo");
  const [records, setRecords] = useState<TerminalRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSessionId ?? null,
  );
  const [chats, setChats] = useState<CliChat[]>([]);
  const [chatsSupported, setChatsSupported] = useState(true);
  const [programsCollapsed, setProgramsCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [serverConfirmDangerous, setServerConfirmDangerous] = useState(true);
  const [cliTools, setCliToolsState] = useState<
    Partial<Record<CliToolProgram, boolean>>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toolsBusy, setToolsBusy] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [loadingChats, setLoadingChats] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>("info");
  const legacyCliPrograms = useRef(new Map<string, string>());

  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === programId) ?? null,
    [programId, programs],
  );
  const running = useMemo(
    () => runningCliTerminals(records, programId),
    [programId, records],
  );
  const selectedTerminal = useMemo(
    () => running.find((record) => record.id === selectedSessionId) ?? null,
    [running, selectedSessionId],
  );

  const showNotice = useCallback((message: string, kind: NoticeKind = "info") => {
    setNotice(message);
    setNoticeKind(kind);
    window.setTimeout(() => {
      setNotice((current) => {
        if (current !== message) return current;
        setNoticeKind("info");
        return null;
      });
    }, 3_000);
  }, []);

  const refreshPrograms = useCallback(async () => {
    try {
      const result = await client.listCliPrograms(computer.id);
      const next = orderedCliPrograms(result.programs || []);
      setPrograms(next);
      setProgramId((current) => {
        if (next.some((program) => program.id === current)) return current;
        if (
          initialProgram &&
          next.some((program) => program.id === initialProgram)
        ) {
          return initialProgram;
        }
        return next[0]?.id ?? current;
      });
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoadingPrograms(false);
    }
  }, [client, computer.id, initialProgram]);

  const refreshTerminals = useCallback(async () => {
    try {
      const result = await client.listTerminalsWithRecords(computer.id);
      setRecords(
        (result.sessions || []).map((record) => {
          const program =
            record.program || legacyCliPrograms.current.get(record.id);
          return program ? normalizeCliRecord(record, program) : record;
        }),
      );
    } catch {
      setFailed(true);
    }
  }, [client, computer.id]);

  const refreshChats = useCallback(async () => {
    if (!programId) return;
    setLoadingChats(true);
    try {
      const result = await client.listCliSessions(computer.id, programId);
      setChatsSupported(result.supported);
      setChats(sortCliChats(result.sessions || []));
    } catch {
      setChatsSupported(false);
      setChats([]);
    } finally {
      setLoadingChats(false);
    }
  }, [client, computer.id, programId]);

  useEffect(() => {
    setLoadingPrograms(true);
    setProgramId(initialProgram || "oceanleo");
    setSelectedSessionId(initialSessionId ?? null);
    void refreshPrograms();
    void refreshTerminals();
    void client
      .getAgentSettings(computer.id)
      .then((settings) => setServerConfirmDangerous(settings.confirm_dangerous))
      .catch(() => setServerConfirmDangerous(true));
    void client
      .getCliTools(computer.id)
      .then((result) => setCliToolsState(result.programs))
      .catch(() => setCliToolsState({}));
  }, [client, computer.id, initialProgram, initialSessionId, refreshPrograms, refreshTerminals]);

  useEffect(() => {
    void refreshChats();
  }, [refreshChats]);

  useEffect(() => {
    if (refreshIntervalMs <= 0) return;
    const timer = window.setInterval(() => void refreshTerminals(), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [refreshIntervalMs, refreshTerminals]);

  useEffect(() => {
    setSelectedSessionId((current) => {
      if (current && running.some((record) => record.id === current)) return current;
      if (
        initialSessionId &&
        running.some((record) => record.id === initialSessionId)
      ) {
        return initialSessionId;
      }
      return running[0]?.id ?? null;
    });
  }, [initialSessionId, programId, running]);

  useEffect(() => {
    if (!programId) return;
    router.replace(
      serverPageHref(computer.id, {
        card: "cli",
        program: programId,
        session: selectedSessionId || undefined,
      }),
    );
  }, [computer.id, programId, router, selectedSessionId]);

  const launch = useCallback(
    async (resumeId?: string) => {
      if (!selectedProgram?.installed || busy) return;
      setBusy(resumeId ? `resume:${resumeId}` : "new");
      try {
        const stored = readCliProgramSettings(computer.id, selectedProgram.id);
        const result = await client.launchCli(computer.id, {
          program: selectedProgram.id,
          ...(resumeId ? { resume_id: resumeId } : {}),
          options: cliLaunchOptions(
            selectedProgram,
            stored,
            serverConfirmDangerous,
          ),
          cols: 120,
          rows: 36,
        });
        const session = normalizeCliRecord(result.session, selectedProgram.id);
        legacyCliPrograms.current.set(session.id, selectedProgram.id);
        setRecords((current) => [
          session,
          ...current.filter((record) => record.id !== session.id),
        ]);
        setSelectedSessionId(session.id);
        setFailed(false);
        await Promise.all([refreshTerminals(), refreshChats()]);
      } catch {
      showNotice(tt("AI 命令行启动失败，请稍后重试。"), "error");
      } finally {
        setBusy(null);
      }
    },
    [
      busy,
      client,
      computer.id,
      refreshChats,
      refreshTerminals,
      selectedProgram,
      serverConfirmDangerous,
      showNotice,
      tt,
    ],
  );

  const closeTerminal = useCallback(
    async (sessionId: string) => {
      if (busy) return;
      setBusy(`close:${sessionId}`);
      try {
        await client.closeTerminal(computer.id, sessionId);
        showNotice(tt("已关闭，记录保留"));
        await refreshTerminals();
      } catch {
        showNotice(tt("终端关闭失败，请稍后重试。"), "error");
      } finally {
        setBusy(null);
      }
    },
    [busy, client, computer.id, refreshTerminals, showNotice, tt],
  );

  const toggleCliTools = useCallback(
    async (enabled: boolean) => {
      if (!isCliToolProgram(programId) || toolsBusy) return;
      setToolsBusy(true);
      try {
        const result = await client.setCliTools(computer.id, programId, enabled);
        setCliToolsState((current) => ({
          ...current,
          [programId]: result.enabled,
        }));
      } catch {
        showNotice(tt("OceanLeo 工具设置失败，请稍后重试。"), "error");
      } finally {
        setToolsBusy(false);
      }
    },
    [client, computer.id, programId, showNotice, toolsBusy, tt],
  );

  const visiblePrograms = programsCollapsed && selectedProgram
    ? [selectedProgram]
    : programs;

  return (
    <section
      aria-label={tt("AI 命令行")}
      className={`relative flex min-h-[34rem] min-w-0 flex-col overflow-hidden border ${tone.border} ${tone.panel}`}
      data-oceanleo-cli-card=""
      data-initial-program={initialProgram || undefined}
      data-initial-session={initialSessionId || undefined}
    >
      <div className={`flex items-center gap-2 border-b px-3 py-2 ${tone.border}`}>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" data-oceanleo-cli-programs="">
          {visiblePrograms.map((program) => (
            <button
              key={program.id}
              type="button"
              className={`shrink-0 border-b-2 px-2 py-1.5 text-xs ${
                program.id === programId
                  ? "border-zinc-900 text-zinc-900 dark:border-neutral-100 dark:text-neutral-100"
                  : `border-transparent ${tone.muted}`
              }`}
              data-oceanleo-cli-program={program.id}
              data-installed={program.installed ? "1" : "0"}
              title={!program.installed ? tt("未安装") : undefined}
              onClick={() => {
                setProgramId(program.id);
                setSelectedSessionId(null);
              }}
            >
              {program.label}
              {!program.installed && (
                <span
                  aria-hidden="true"
                  className="ml-1 inline-block size-1.5 rounded-full bg-amber-500 align-middle"
                />
              )}
            </button>
          ))}
          {loadingPrograms && programs.length === 0 && (
            <span className={`px-2 py-1.5 text-xs ${tone.muted}`}>{tt("加载中…")}</span>
          )}
        </div>
        <button
          type="button"
          className={tone.iconBtn}
          aria-label={tt(programsCollapsed ? "展开程序列表" : "收起程序列表")}
          aria-expanded={!programsCollapsed}
          data-oceanleo-cli-programs-toggle=""
          onClick={() => setProgramsCollapsed((collapsed) => !collapsed)}
        >
          <IconChevron up={!programsCollapsed} />
        </button>
        <button
          type="button"
          className={tone.iconBtn}
          aria-label={tt("AI 命令行设置")}
          title={tt("AI 命令行设置")}
          aria-expanded={showSettings}
          data-oceanleo-cli-settings-toggle=""
          onClick={() => setShowSettings((open) => !open)}
        >
          <IconSettings />
        </button>
      </div>
      {showSettings && selectedProgram ? (
        <div
          className="absolute inset-0 z-20 bg-black/10"
          data-oceanleo-cli-settings-overlay=""
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowSettings(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="false"
            aria-label={tt("AI 命令行设置")}
            className={`absolute right-3 top-3 flex max-h-[90%] w-[min(28rem,90%)] flex-col overflow-y-auto rounded-lg border p-4 shadow-xl ${tone.border} ${tone.page}`}
            onMouseDown={(event) => event.stopPropagation()}
            data-oceanleo-cli-settings-panel=""
          >
            <header className={`mb-3 flex items-center justify-between gap-3 border-b pb-3 ${tone.border}`}>
              <h3 className="text-sm font-semibold">{tt("AI 命令行设置")}</h3>
              <button
                type="button"
                className={`rounded-md p-2 text-base leading-none ${tone.hover} ${tone.muted}`}
                aria-label={tt("关闭")}
                title={tt("关闭")}
                onClick={() => setShowSettings(false)}
                data-oceanleo-cli-settings-close=""
              >
                <IconClose />
              </button>
            </header>
            <CliSettingsPanel
              key={`${computer.id}:${selectedProgram.id}`}
              computerId={computer.id}
              program={selectedProgram}
              serverConfirmDangerous={serverConfirmDangerous}
              toolsEnabled={
                isCliToolProgram(selectedProgram.id)
                  ? cliTools[selectedProgram.id]
                  : undefined
              }
              toolsBusy={toolsBusy}
              onToolsEnabledChange={(enabled) => void toggleCliTools(enabled)}
            />
          </section>
        </div>
      ) : null}
      {notice && (
        <div
          className={`border-b px-4 py-2 text-xs ${noticeKind === "error" ? tone.danger : `${tone.panel} ${tone.muted}`}`}
          role={noticeKind === "error" ? "alert" : "status"}
          data-oceanleo-cli-notice=""
        >
          {notice}
        </div>
      )}
      <div className="flex min-h-0 flex-1" data-oceanleo-cli-card-body="">
        <aside className={`flex w-56 shrink-0 flex-col border-r ${tone.border}`}>
          <div className={`border-b p-2 ${tone.border}`}>
            <button
              type="button"
              className="inline-flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!computer.node_online || !selectedProgram?.installed || busy !== null}
              data-oceanleo-new-cli-chat=""
              onClick={() => void launch()}
            >
              <IconPlus className="size-3.5" />
              {busy === "new" ? tt("正在启动…") : tt("打开命令行")}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <h3 className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone.muted}`}>
              {tt("正在运行")}
            </h3>
            <div className="grid gap-1">
              {running.map((record) => (
                <div
                  key={record.id}
                  className={`group flex items-center rounded-lg ${record.id === selectedSessionId ? tone.rowActive : tone.hover}`}
                  data-oceanleo-cli-running={record.id}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 px-2 py-2 text-left text-xs"
                    onClick={() => setSelectedSessionId(record.id)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      <span className="truncate">
                        {record.title || record.id.slice(0, 8)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`m-1 rounded px-1.5 py-1 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 ${tone.hover}`}
                    aria-label={tt("关闭终端")}
                    disabled={busy !== null}
                    onClick={() => void closeTerminal(record.id)}
                  >
                    <IconClose className="size-3.5" />
                  </button>
                </div>
              ))}
              {running.length === 0 && (
                <p className={`px-2 py-2 text-[11px] ${tone.muted}`}>
                  {tt("没有正在运行的命令行对话")}
                </p>
              )}
            </div>
            <h3 className={`mt-3 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone.muted}`}>
              {tt("过去的对话")}
            </h3>
            {loadingChats ? (
              <p className={`px-2 py-2 text-[11px] ${tone.muted}`}>{tt("加载中…")}</p>
            ) : chatsSupported ? (
              <div className="grid gap-1">
                {chats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    className={`rounded-lg px-2 py-2 text-left text-xs ${tone.hover}`}
                    disabled={!selectedProgram?.installed || busy !== null}
                    data-oceanleo-cli-chat={chat.id}
                    onClick={() => void launch(chat.id)}
                  >
                    <span className="block truncate font-medium">
                      {chat.title || chat.id}
                    </span>
                    <span className={`mt-1 block text-[10px] ${tone.muted}`}>
                      {new Date(chat.updated_at).toLocaleString()}
                    </span>
                  </button>
                ))}
                {chats.length === 0 && (
                  <p className={`px-2 py-2 text-[11px] ${tone.muted}`}>
                    {tt("还没有过去的命令行对话")}
                  </p>
                )}
              </div>
            ) : (
              <p
                className={`mx-2 px-2 py-2 text-[11px] ${tone.muted}`}
                data-oceanleo-cli-history-unsupported=""
              >
                {tt("这个程序不支持读取过去的命令行对话")}
              </p>
            )}
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          {failed && (
            <div className={`border-b px-3 py-2 text-xs ${tone.danger}`} role="alert">
              {tt("AI 命令行信息读取失败，请稍后重试。")}
            </div>
          )}
          {selectedProgram && !selectedProgram.installed ? (
            <div className={`grid min-h-[24rem] flex-1 place-items-center p-6 text-center text-sm ${tone.muted}`}>
              <div>
                <p>
                  {tt("{program} 尚未安装", { program: selectedProgram.label })}
                </p>
                <button
                  type="button"
                  className="mt-3 text-xs underline-offset-2 hover:underline"
                  data-oceanleo-cli-install={selectedProgram.id}
                  onClick={() =>
                    router.push(
                      serverPageHref(computer.id, {
                        card: "acp",
                        program: selectedProgram.id,
                      }),
                    )
                  }
                >
                  {tt("安装")}
                </button>
              </div>
            </div>
          ) : selectedTerminal ? (
            <TerminalViewport
              key={selectedTerminal.id}
              computerId={computer.id}
              record={selectedTerminal}
              onEnded={() => void refreshTerminals()}
            />
          ) : (
            <div className={`grid min-h-[24rem] flex-1 place-items-center p-6 text-center text-sm ${tone.muted}`}>
              <div>
                <p>{tt("选择运行中的命令行，或打开一个新的。")}</p>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-2 text-xs underline-offset-2 hover:underline disabled:opacity-50"
                  disabled={!computer.node_online || !selectedProgram?.installed || busy !== null}
                  onClick={() => void launch()}
                >
                  <IconPlus className="size-3.5" />
                  {tt("打开命令行")}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
