"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cloudComputerApi,
  type CloudComputerClient,
  type Computer,
  type TerminalRecord,
} from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";
import { ConfirmDialog } from "../../../ui";
import { serverPageHref } from "../server-page/href";
import { tone } from "../server-page/tone";
import { AppearancePanel } from "./AppearancePanel";
import {
  shellTerminalRecords,
  terminalEndCopy,
} from "./model";
import { TerminalViewport } from "./TerminalViewport";

export type TerminalCardProps = {
  computer: Computer;
  initialSessionId?: string;
  client?: CloudComputerClient;
  refreshIntervalMs?: number;
};

export function TerminalCard({
  computer,
  initialSessionId,
  client = cloudComputerApi,
  refreshIntervalMs = 15_000,
}: TerminalCardProps) {
  const tt = useUI();
  const router = useRouter();
  const [records, setRecords] = useState<TerminalRecord[]>([]);
  const [recordsSupported, setRecordsSupported] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSessionId ?? null,
  );
  const [showAppearance, setShowAppearance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const terminals = useMemo(() => {
    const sorted = shellTerminalRecords(records);
    return recordsSupported ? sorted : sorted.filter((record) => record.alive);
  }, [records, recordsSupported]);

  const selected = useMemo(
    () => terminals.find((record) => record.id === selectedId) ?? null,
    [selectedId, terminals],
  );

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => {
      setNotice((current) => (current === message ? null : current));
    }, 3_000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await client.listTerminalsWithRecords(computer.id);
      const next = shellTerminalRecords(result.sessions || []);
      const visible = result.records_supported
        ? next
        : next.filter((record) => record.alive);
      setRecords(next);
      setRecordsSupported(result.records_supported);
      setSelectedId((current) => {
        if (current && visible.some((record) => record.id === current)) {
          return current;
        }
        if (
          initialSessionId &&
          visible.some((record) => record.id === initialSessionId)
        ) {
          return initialSessionId;
        }
        return visible[0]?.id ?? null;
      });
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [client, computer.id, initialSessionId]);

  useEffect(() => {
    setLoading(true);
    setSelectedId(initialSessionId ?? null);
    void refresh();
    if (refreshIntervalMs <= 0) return;
    const timer = window.setInterval(() => void refresh(), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [initialSessionId, refresh, refreshIntervalMs]);

  useEffect(() => {
    if (!selectedId) return;
    router.replace(
      serverPageHref(computer.id, { card: "terminal", session: selectedId }),
    );
  }, [computer.id, router, selectedId]);

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
      showNotice(tt("新终端创建失败，请稍后重试。"));
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
        showNotice(tt("终端关闭失败，请稍后重试。"));
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
        showNotice(tt("终端记录删除失败，请稍后重试。"));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, client, computer.id, refresh, showNotice, tt],
  );

  return (
    <section
      className={`flex min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-2xl border ${tone.border} ${tone.panel}`}
      data-oceanleo-terminal-card=""
      data-initial-session={initialSessionId || undefined}
    >
      <header className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${tone.border}`}>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{tt("终端")}</h2>
          <p className={`truncate text-xs ${tone.muted}`}>{computer.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${computer.node_online ? "text-emerald-600 dark:text-emerald-400" : tone.muted}`}>
            {tt(computer.node_online ? "在线" : "离线")}
          </span>
          <button
            type="button"
            className={`rounded-lg px-2 py-1 text-sm ${showAppearance ? tone.chipActive : tone.chip}`}
            aria-label={tt("外观设置")}
            aria-expanded={showAppearance}
            data-oceanleo-terminal-appearance-toggle=""
            onClick={() => setShowAppearance((open) => !open)}
          >
            ⚙
          </button>
        </div>
      </header>
      {showAppearance && (
        <div className={`border-b p-3 ${tone.border}`}>
          <AppearancePanel />
        </div>
      )}
      {notice && (
        <div className={`border-b px-4 py-2 text-xs ${tone.warn}`} role="status">
          {notice}
        </div>
      )}
      <div className="flex min-h-0 flex-1" data-oceanleo-terminal-card-body="">
        <aside className={`flex w-52 shrink-0 flex-col border-r ${tone.border}`}>
          <div className={`border-b p-2 ${tone.border}`}>
            <button
              type="button"
              className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium ${tone.primary} disabled:cursor-not-allowed disabled:opacity-50`}
              disabled={!computer.node_online || busyId !== null}
              data-oceanleo-new-terminal=""
              onClick={() => void openTerminal()}
            >
              {busyId === "new" ? tt("正在创建…") : tt("+ 新终端")}
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
                        ×
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
                className={`mt-3 rounded-lg border px-2 py-2 text-[11px] ${tone.warn}`}
                data-oceanleo-records-unsupported=""
              >
                {tt("更新节点程序后才能保留终端记录")}
              </p>
            )}
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          {failed && (
            <div className={`border-b px-3 py-2 text-xs ${tone.warn}`} role="alert">
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
                readOnly={!selected.alive}
                onEnded={() => void refresh()}
              />
            </>
          ) : (
            <div className={`grid min-h-[24rem] flex-1 place-items-center p-6 text-center text-sm ${tone.muted}`}>
              <div>
                <p>{tt("选择一个终端，或新建终端。")}</p>
                <button
                  type="button"
                  className={`mt-3 rounded-lg px-3 py-2 text-xs ${tone.primary} disabled:opacity-50`}
                  disabled={!computer.node_online || busyId !== null}
                  onClick={() => void openTerminal()}
                >
                  {tt("+ 新终端")}
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
