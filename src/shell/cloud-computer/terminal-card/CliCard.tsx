"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  IconClose,
  IconPlus,
} from "../server-page/chrome-icons";
import { replaceServerPageUrl } from "../server-page/url-state";
import { ServerPageStripPortal } from "../server-page/server-page-chrome";
import { ProgramStrip } from "../server-page/ProgramStrip";
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
  active?: boolean;
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

type CachedChats = { supported: boolean; sessions: CliChat[] };
type CliCache = { programs?: CliProgram[]; records?: TerminalRecord[]; chats: Map<string, CachedChats> };
const computerCaches = new Map<string, CliCache>();
function computerCache(id: string): CliCache {
  let cache = computerCaches.get(id);
  if (!cache) {
    cache = { chats: new Map() };
    computerCaches.set(id, cache);
  }
  return cache;
}

type NoticeKind = "info" | "error";

export function CliCard({
  computer,
  active = true,
  initialProgram,
  initialSessionId,
  client = cloudComputerApi,
  refreshIntervalMs = 15_000,
}: CliCardProps) {
  const tt = useUI();
  const cache = useMemo(() => computerCache(computer.id), [computer.id]);
  const [initial] = useState(() => ({ program: initialProgram || "oceanleo", session: initialSessionId ?? null }));
  const [programs, setPrograms] = useState<CliProgram[]>(() => cache.programs ?? []);
  const [programId, setProgramId] = useState(initial.program);
  const [records, setRecords] = useState<TerminalRecord[]>(() => cache.records ?? []);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initial.session);
  const [chatLists, setChatLists] = useState(() => new Map(cache.chats));
  const chats = chatLists.get(programId)?.sessions ?? [];
  const chatsSupported = chatLists.get(programId)?.supported ?? true;
  const [showSettings, setShowSettings] = useState(false);
  const [serverConfirmDangerous, setServerConfirmDangerous] = useState(true);
  const [cliTools, setCliToolsState] = useState<
    Partial<Record<CliToolProgram, boolean>>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toolsBusy, setToolsBusy] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(!cache.programs);
  const [loadingChatProgram, setLoadingChatProgram] = useState<string | null>(null);
  const loadingChats = loadingChatProgram === programId && !chatLists.has(programId);
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
  }, []);

  useEffect(() => {
    if (!active || !notice) return;
    const timer = window.setTimeout(() => { setNotice(null); setNoticeKind("info"); }, 3_000);
    return () => window.clearTimeout(timer);
  }, [active, notice]);

  const refreshPrograms = useCallback(async () => {
    try {
      const result = await client.listCliPrograms(computer.id);
      const next = orderedCliPrograms(result.programs || []);
      cache.programs = next;
      setPrograms(next);
      setProgramId((current) => {
        if (next.some((program) => program.id === current)) return current;
        return next[0]?.id ?? current;
      });
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoadingPrograms(false);
    }
  }, [cache, client, computer.id]);

  const refreshTerminals = useCallback(async () => {
    try {
      const result = await client.listTerminalsWithRecords(computer.id);
      const next = (result.sessions || []).map((record) => {
          const program =
            record.program || legacyCliPrograms.current.get(record.id);
          return program ? normalizeCliRecord(record, program) : record;
        });
      cache.records = next;
      setRecords(next);
    } catch {
      setFailed(true);
    }
  }, [cache, client, computer.id]);

  const refreshChats = useCallback(async () => {
    if (!programId) return;
    setLoadingChatProgram(programId);
    try {
      const result = await client.listCliSessions(computer.id, programId);
      const next = { supported: result.supported, sessions: sortCliChats(result.sessions || []) };
      cache.chats.set(programId, next);
      setChatLists((current) => new Map(current).set(programId, next));
    } catch {
      if (!cache.chats.has(programId)) {
        setChatLists((current) => new Map(current).set(programId, { supported: false, sessions: [] }));
      }
    } finally {
      setLoadingChatProgram((current) => current === programId ? null : current);
    }
  }, [cache, client, computer.id, programId]);

  useEffect(() => {
    setLoadingPrograms(!cache.programs);
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
  }, [cache, client, computer.id, refreshPrograms, refreshTerminals]);

  useEffect(() => {
    if (!cache.chats.has(programId)) void refreshChats();
  }, [cache, programId, refreshChats]);

  useEffect(() => {
    if (cache.chats.has(initial.program)) void client.listCliSessions(computer.id, initial.program).then((result) => {
      const next = { supported: result.supported, sessions: sortCliChats(result.sessions || []) };
      cache.chats.set(initial.program, next);
      setChatLists((current) => new Map(current).set(initial.program, next));
    }).catch(() => {});
  }, [cache, client, computer.id, initial.program]);

  useEffect(() => {
    if (!active || refreshIntervalMs <= 0) return;
    const timer = window.setInterval(() => void refreshTerminals(), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [active, refreshIntervalMs, refreshTerminals]);

  useEffect(() => {
    setSelectedSessionId((current) => {
      if (current && running.some((record) => record.id === current)) return current;
      if (
        initial.session &&
        running.some((record) => record.id === initial.session)
      ) {
        return initial.session;
      }
      return running[0]?.id ?? null;
    });
  }, [initial.session, programId, running]);

  useEffect(() => {
    if (!active || !programId) return;
    replaceServerPageUrl(computer.id, { card: "cli", program: programId, session: selectedSessionId });
  }, [active, computer.id, programId, selectedSessionId]);

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

  return (
    <section
      aria-label={tt("AI 命令行")}
      className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border ${tone.border} ${tone.panel}`}
      data-oceanleo-cli-card=""
      data-initial-program={initial.program}
      data-initial-session={initial.session || undefined}
    >
      {active && <ServerPageStripPortal card="cli">
        <ProgramStrip
          items={programs.map((program) => ({
            id: program.id,
            label: program.label,
            dot: program.installed ? "green" : "gray",
            running: runningCliTerminals(records, program.id).length > 0,
            title: !program.installed ? tt("未安装") : program.version ? tt("已安装 · {version}", { version: program.version }) : tt("已安装"),
          }))}
          selected={programId}
          onSelect={(id) => { setProgramId(id); setSelectedSessionId(null); }}
          onSettings={(id) => { setProgramId(id); setShowSettings(true); }}
          settingsLabel={tt("AI 命令行设置")}
          ariaLabel={tt("AI 命令行")}
          storageKey="oceanleo.serverPage.programStrip.cli"
          trailing={loadingPrograms && !programs.length ? <span className={`text-xs ${tone.muted}`}>{tt("加载中…")}</span> : undefined}
        />
      </ServerPageStripPortal>}
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
            className={`absolute right-3 top-3 flex max-h-[90%] w-[min(24rem,90%)] flex-col overflow-y-auto rounded-lg border p-4 shadow-xl ${tone.border} ${tone.page}`}
            onMouseDown={(event) => event.stopPropagation()}
            data-oceanleo-cli-settings-panel=""
          >
            <header className={`mb-3 flex items-center justify-between gap-3 border-b pb-3 ${tone.border}`}>
              <h3 className="text-[13px] font-semibold">{tt("AI 命令行设置")}</h3>
              <button
                type="button"
                className={`h-8 rounded-md px-2 text-[13px] leading-none ${tone.hover} ${tone.muted}`}
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
        <aside className={`flex min-h-0 w-56 shrink-0 flex-col overflow-hidden border-r ${tone.border}`}>
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
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {failed && (
            <div className={`border-b px-3 py-2 text-xs ${tone.danger}`} role="alert">
              {tt("AI 命令行信息读取失败，请稍后重试。")}
            </div>
          )}
          {selectedProgram && !selectedProgram.installed ? (
            <div className={`grid min-h-0 flex-1 overflow-y-auto place-items-center p-6 text-center text-sm ${tone.muted}`}>
              <div>
                <p>
                  {tt("{program} 尚未安装", { program: selectedProgram.label })}
                </p>
                <button
                  type="button"
                  className="mt-3 text-xs underline-offset-2 hover:underline"
                  data-oceanleo-cli-install={selectedProgram.id}
                  onClick={() =>
                    replaceServerPageUrl(computer.id, { card: "acp", program: selectedProgram.id, session: null })
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
            <div className={`grid min-h-0 flex-1 overflow-y-auto place-items-center p-6 text-center text-sm ${tone.muted}`}>
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
