"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cloudComputerApi,
  type CloudComputerClient,
  type Computer,
  type TerminalRecord,
} from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";
import { ConfirmDialog } from "../../../ui";
import { IconClose, IconPlus, IconSettings } from "../server-page/chrome-icons";
import { replaceServerPageUrl } from "../server-page/url-state";
import { ServerPageStripPortal } from "../server-page/server-page-chrome";
import { tone } from "../server-page/tone";
import { AppearancePanel } from "./AppearancePanel";
import {
  shellTerminalRecords,
  terminalEndCopy,
} from "./model";
import { TerminalViewport } from "./TerminalViewport";

export type TerminalCardProps = {
  computer: Computer;
  active?: boolean;
  initialSessionId?: string;
  client?: CloudComputerClient;
  refreshIntervalMs?: number;
};

const terminalLists = new Map<string, { records: TerminalRecord[]; supported: boolean }>();

type NoticeKind = "info" | "error";

export function TerminalCard({
  computer,
  active = true,
  initialSessionId,
  client = cloudComputerApi,
  refreshIntervalMs = 15_000,
}: TerminalCardProps) {
  const tt = useUI();
  const [mountSessionId] = useState(() => initialSessionId ?? null);
  const [cached] = useState(() => terminalLists.get(computer.id));
  const [records, setRecords] = useState<TerminalRecord[]>(cached?.records ?? []);
  const [recordsSupported, setRecordsSupported] = useState(cached?.supported ?? true);
  const refreshVersion = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => mountSessionId ?? cached?.records.find((record) => cached.supported || record.alive)?.id ?? null,
  );
  const [showAppearance, setShowAppearance] = useState(false);
  const [loading, setLoading] = useState(!cached);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>("info");
  const [failed, setFailed] = useState(false);

  const terminals = useMemo(() => {
    const sorted = shellTerminalRecords(records);
    return recordsSupported ? sorted : sorted.filter((record) => record.alive);
  }, [records, recordsSupported]);

  const selected = useMemo(
    () => terminals.find((record) => record.id === selectedId) ?? null,
    [selectedId, terminals],
  );

  const showNotice = useCallback((message: string, kind: NoticeKind = "info") => {
    setNotice(message);
    setNoticeKind(kind);
  }, []);

  useEffect(() => {
    if (!active || !notice) return;
    const timer = window.setTimeout(() => {
      setNotice(null);
      setNoticeKind("info");
    }, 3_000);
    return () => window.clearTimeout(timer);
  }, [active, notice]);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const result = await client.listTerminalsWithRecords(computer.id);
      if (version !== refreshVersion.current) return;
      const next = shellTerminalRecords(result.sessions || []);
      const visible = result.records_supported
        ? next
        : next.filter((record) => record.alive);
      terminalLists.set(computer.id, { records: next, supported: result.records_supported });
      setRecords(next);
      setRecordsSupported(result.records_supported);
      setSelectedId((current) => {
        if (current && visible.some((record) => record.id === current)) {
          return current;
        }
        return visible[0]?.id ?? null;
      });
      setFailed(false);
    } catch {
      if (version === refreshVersion.current) setFailed(true);
    } finally {
      if (version === refreshVersion.current) setLoading(false);
    }
  }, [client, computer.id]);

  useEffect(() => {
    void refresh();
    return () => { refreshVersion.current += 1; };
  }, [refresh]);

  useEffect(() => {
    if (!active || refreshIntervalMs <= 0) return;
    const timer = window.setInterval(() => void refresh(), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [active, refresh, refreshIntervalMs]);

  useEffect(() => {
    if (!active) return;
    replaceServerPageUrl(computer.id, { card: "terminal", session: selectedId });
  }, [active, computer.id, selectedId]);

  const openTerminal = useCallback(async () => {
    if (!computer.node_online || busyId) return;
    setBusyId("new");
    try {
      const result = await client.openTerminalSession(computer.id, {
        cols: 120,
        rows: 36,
        kind: "shell",
      });
      setRecords((current) => [
        result.session,
        ...current.filter((record) => record.id !== result.session.id),
      ]);
      setSelectedId(result.session.id);
      setFailed(false);
      await refresh();
    } catch {
      showNotice(tt("新终端创建失败，请稍后重试。"), "error");
    } finally {
      setBusyId(null);
    }
  }, [busyId, client, computer.id, computer.node_online, refresh, showNotice, tt]);

  const closeTerminal = useCallback(
    async (sessionId: string) => {
      if (busyId) return;
      setBusyId(sessionId);
      try {
        await client.closeTerminal(computer.id, sessionId);
        showNotice(tt("已关闭，记录保留"));
        await refresh();
      } catch {
        showNotice(tt("终端关闭失败，请稍后重试。"), "error");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, client, computer.id, refresh, showNotice, tt],
  );

  const deleteRecord = useCallback(
    async (sessionId: string) => {
      if (busyId) return;
      setPendingDeleteId(null);
      setBusyId(sessionId);
      try {
        await client.deleteTerminalRecord(computer.id, sessionId);
        setSelectedId((current) => (current === sessionId ? null : current));
        showNotice(tt("终端记录已删除"));
        await refresh();
      } catch {
        showNotice(tt("终端记录删除失败，请稍后重试。"), "error");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, client, computer.id, refresh, showNotice, tt],
  );

  return (
    <section
      aria-label={tt("终端")}
      className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border ${tone.border} ${tone.panel}`}
      data-oceanleo-terminal-card=""
      data-initial-session={mountSessionId || undefined}
    >
      {active && <ServerPageStripPortal card="terminal">
      <div className="relative flex w-full shrink-0 items-center justify-end px-3 py-2">
        <button
          type="button"
          className={tone.iconBtn}
          aria-label={tt("外观设置")}
          title={tt("外观设置")}
          aria-expanded={showAppearance}
          data-oceanleo-terminal-appearance-toggle=""
          onClick={() => setShowAppearance((open) => !open)}
        >
          <IconSettings />
        </button>
      {showAppearance && (
        <div
          className="absolute right-0 top-full z-20 w-[min(28rem,90vw)]"
          data-oceanleo-terminal-appearance-overlay=""
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowAppearance(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="false"
            aria-label={tt("外观设置")}
            className={`max-h-[70dvh] w-full overflow-y-auto rounded-lg border p-4 shadow-xl ${tone.border} ${tone.page}`}
            onMouseDown={(event) => event.stopPropagation()}
            data-oceanleo-terminal-appearance-panel=""
          >
            <header className={`mb-3 flex items-center justify-between gap-3 border-b pb-3 ${tone.border}`}>
              <h3 className="text-sm font-semibold">{tt("外观设置")}</h3>
              <button
                type="button"
                className={`rounded-md p-2 text-base leading-none ${tone.hover} ${tone.muted}`}
                aria-label={tt("关闭")}
                title={tt("关闭")}
                onClick={() => setShowAppearance(false)}
                data-oceanleo-terminal-appearance-close=""
              >
                <IconClose />
              </button>
            </header>
            <AppearancePanel framed={false} />
          </section>
        </div>
      )}
      </div>
      </ServerPageStripPortal>}
      {notice && (
        <div
          className={`border-b px-4 py-2 text-xs ${noticeKind === "error" ? tone.danger : `${tone.panel} ${tone.muted}`}`}
          role={noticeKind === "error" ? "alert" : "status"}
          data-oceanleo-terminal-notice=""
        >
          {notice}
        </div>
      )}
      <div className="flex min-h-0 flex-1" data-oceanleo-terminal-card-body="">
        <aside className={`flex min-h-0 w-32 shrink-0 flex-col sm:w-52 border-r ${tone.border}`}>
          <div className={`border-b p-2 ${tone.border}`}>
            <button
              type="button"
              className="inline-flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!computer.node_online || busyId !== null}
              data-oceanleo-new-terminal=""
              onClick={() => void openTerminal()}
            >
              <IconPlus className="size-3.5" />
              {busyId === "new" ? tt("正在创建…") : tt("新终端")}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading && terminals.length === 0 && (
              <p className={`px-2 py-3 text-xs ${tone.muted}`}>{tt("加载中…")}</p>
            )}
            {!loading && terminals.length === 0 && (
              <p className={`px-2 py-3 text-xs ${tone.muted}`}>
                {tt("还没有终端记录")}
              </p>
            )}
            <div className="grid gap-1">
              {terminals.map((record) => {
                const end = terminalEndCopy(record);
                return (
                  <div
                    key={record.id}
                    className={`group flex items-start rounded-lg ${record.id === selectedId ? tone.rowActive : tone.hover}`}
                    data-oceanleo-terminal-row={record.id}
                    data-alive={record.alive ? "1" : "0"}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-2 py-2 text-left"
                      onClick={() => setSelectedId(record.id)}
                    >
                      <span className="flex items-center gap-2 text-xs font-medium">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${record.alive ? "bg-emerald-500" : "bg-zinc-400 dark:bg-neutral-600"}`}
                        />
                        <span className="truncate">
                          {record.title || record.id.slice(0, 8)}
                        </span>
                      </span>
                      {!record.alive && (
                        <span className={`mt-1 block pl-4 text-[10px] leading-4 ${tone.muted}`}>
                          {tt(end.key, end.vars)}
                          {record.ended_at
                            ? ` · ${new Date(record.ended_at).toLocaleString()}`
                            : ""}
                        </span>
                      )}
                    </button>
                    {record.alive ? (
                      <button
                        type="button"
                        className={`m-1 rounded px-1.5 py-1 text-xs opacity-0 transition-opacity duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] group-hover:opacity-100 focus:opacity-100 ${tone.hover}`}
                        aria-label={tt("关闭终端")}
                        disabled={busyId !== null}
                        onClick={() => void closeTerminal(record.id)}
                      >
                        <IconClose className="size-3.5" />
                      </button>
                    ) : (
                      <details className="relative m-1" data-oceanleo-record-menu="">
                        <summary
                          className={`cursor-pointer list-none rounded px-1.5 py-1 text-xs ${tone.hover}`}
                          aria-label={tt("终端记录菜单")}
                        >
                          ⋯
                        </summary>
                        <div className={`absolute right-0 z-20 mt-1 w-36 rounded-lg border p-1 shadow-lg ${tone.border} ${tone.panel}`}>
                          <button
                            type="button"
                            className={`w-full rounded px-2 py-1.5 text-left text-xs ${tone.hover}`}
                            disabled={busyId !== null}
                            onClick={() => setPendingDeleteId(record.id)}
                          >
                            {tt("删除这条记录")}
                          </button>
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
            {!recordsSupported && (
              <p
                className={`mt-3 px-2 py-2 text-[11px] ${tone.muted}`}
                data-oceanleo-records-unsupported=""
              >
                {tt("更新节点程序后才能保留终端记录")}
              </p>
            )}
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {failed && (
            <div className={`border-b px-3 py-2 text-xs ${tone.danger}`} role="alert">
              {tt("终端列表读取失败，请稍后重试。")}
            </div>
          )}
          {selected ? (
            <>
              {!selected.alive && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs ${tone.warn}`}
                  data-oceanleo-ended-terminal-banner=""
                >
                  <span>{tt("这是已结束的终端记录")}</span>
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    disabled={!computer.node_online || busyId !== null}
                    onClick={() => void openTerminal()}
                  >
                    {tt("在这台服务器上开一个新终端")}
                  </button>
                </div>
              )}
              <TerminalViewport
                key={selected.id}
                computerId={computer.id}
                record={selected}
                active={active}
                readOnly={!selected.alive}
                onEnded={() => void refresh()}
              />
            </>
          ) : (
            <div className={`grid min-h-0 flex-1 place-items-center p-6 text-center text-sm ${tone.muted}`}>
              <div>
                <p>{tt("选择一个终端，或新建终端。")}</p>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-2 text-xs underline-offset-2 hover:underline disabled:opacity-50"
                  disabled={!computer.node_online || busyId !== null}
                  onClick={() => void openTerminal()}
                >
                  <IconPlus className="size-3.5" />
                  {tt("新终端")}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
      {pendingDeleteId ? (
        <ConfirmDialog
          title="确定删除这条终端记录吗？"
          confirmLabel="删除"
          danger
          onConfirm={() => void deleteRecord(pendingDeleteId)}
          onCancel={() => setPendingDeleteId(null)}
        />
      ) : null}
    </section>
  );
}
