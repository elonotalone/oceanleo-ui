"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { portalHref } from "../../contracts/domain-family";
import { useUI } from "../../i18n/ui/useUI";
import {
  computerActivityApi,
  memoryPercent,
  runningPrograms,
  upgradeConfirmList,
  type ActivityEndTarget,
  type ActivityProgram,
  type ActivityTerminal,
  type ComputerActivity,
  type ComputerActivityClient,
  heldElsewhereGateway,
} from "../../lib/computer-activity-api";
import { formatBytes, formatDuration } from "../../lib/upload/progress";
import { PROGRAM_LABEL, type AgentProgram } from "../../native-agent-core/index";
import { DEVICE_BUTTON, DEVICE_PRIMARY_BUTTON, DeviceDialog } from "./DeviceDialog";

type Translate = ReturnType<typeof useUI>;

/** The card's one line: 「N 个程序在运行 · 内存 x% · CPU y%」 (usage left out for a node that sends none). */
export function activityLine(tt: Translate, activity: ComputerActivity): string {
  if (activity.online && activity.reachable === false) return tt("在线，但当前版本连不到它");
  const parts = [tt("{count} 个程序在运行", { count: runningPrograms(activity).length })];
  const memory = activity.usage ? memoryPercent(activity.usage) : null;
  if (memory !== null) parts.push(tt("内存 {percent}%", { percent: memory }));
  if (activity.usage) parts.push(tt("CPU {percent}%", { percent: Math.round(activity.usage.cpu_percent) }));
  return parts.join(" · ");
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function programLabel(program: string): string {
  return PROGRAM_LABEL[program as AgentProgram] ?? program;
}

function taskHref(taskId: string): string {
  return portalHref(`/tasks/${encodeURIComponent(taskId)}`);
}

function runningFor(startedAt: string | null, now: number): string | null {
  const started = startedAt ? Date.parse(startedAt) : Number.NaN;
  return Number.isNaN(started) ? null : formatDuration(now - started);
}

/**
 * One computer's device panel: machine usage, every running program and terminal with
 * 结束 / 全部结束, and 升级节点 (the user's click; the confirm lists what the restart ends,
 * as the gateway's own refusal reports it). Re-read on open, after each action and every
 * `refreshMs` while open.
 */
export function DeviceActivityPanel({ computerId, name, client = computerActivityApi, initial = null, refreshMs = 10_000, now = Date.now, onActivity, onClose }: {
  computerId: string;
  name: string;
  client?: ComputerActivityClient;
  initial?: ComputerActivity | null;
  refreshMs?: number;
  now?: () => number;
  onActivity?: (activity: ComputerActivity) => void;
  onClose: () => void;
}) {
  const tt = useUI();
  const [activity, setActivity] = useState<ComputerActivity | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ programs: ActivityProgram[]; terminals: ActivityTerminal[] } | null>(null);
  const [upgradingTo, setUpgradingTo] = useState<string | null>(null);
  const alive = useRef(true);
  const report = useRef(onActivity);
  report.current = onActivity;
  // The answer to the request issued last wins: a slow refresh never overwrites what an End returned.
  const issued = useRef(0);
  const applied = useRef(0);

  async function read(request: () => Promise<ComputerActivity>) {
    const ticket = ++issued.current;
    const next = await request();
    if (!alive.current || ticket < applied.current) return;
    applied.current = ticket;
    setActivity(next);
    setError(null);
    report.current?.(next);
  }

  function markHeldElsewhere(cause: unknown): boolean {
    const gateway = heldElsewhereGateway(cause);
    if (gateway === undefined) return false;
    setConfirm(null);
    setError(null);
    if (activity) {
      const next = { ...activity, online: true, reachable: false, gateway };
      setActivity(next);
      report.current?.(next);
    }
    return true;
  }

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try { await read(() => client.getActivity(computerId)); }
      catch (cause) { if (alive.current && !markHeldElsewhere(cause)) setError(errorText(cause)); }
      finally { if (alive.current) timer = setTimeout(load, refreshMs); }
    }
    void load();
    return () => { alive.current = false; clearTimeout(timer); };
    // `read` only touches refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, computerId, refreshMs]);

  async function act(key: string, request: () => Promise<ComputerActivity>) {
    if (busy) return;
    setBusy(key); setError(null);
    try { await read(request); }
    catch (cause) { if (alive.current && !markHeldElsewhere(cause)) setError(errorText(cause)); }
    finally { if (alive.current) setBusy(null); }
  }

  function end(key: string, target: ActivityEndTarget) {
    void act(key, () => client.endActivity(computerId, target));
  }

  async function upgrade(confirmed: boolean) {
    if (busy) return;
    setBusy("upgrade"); setError(null);
    try {
      const result = await client.upgradeNode(computerId, confirmed ? { confirm: true } : {});
      if (!alive.current) return;
      setConfirm(null); setUpgradingTo(result.to);
    } catch (cause) {
      if (!alive.current) return;
      const list = confirmed ? null : upgradeConfirmList(cause);
      setConfirm(list);
      if (!list && !markHeldElsewhere(cause)) setError(errorText(cause));
    } finally { if (alive.current) setBusy(null); }
  }

  const programs = activity ? runningPrograms(activity) : [];
  const terminals = activity?.terminals ?? [];
  const usage = activity?.usage ?? null;
  const memory = usage ? memoryPercent(usage) : null;
  const upgrading = upgradingTo !== null && activity?.node_version !== upgradingTo;
  const unreachable = activity?.online === true && activity.reachable === false;
  const at = now();

  return <DeviceDialog title={name} onClose={onClose} testId="activity">
    {error && <p role="alert" className="mb-4 break-words rounded-xl bg-red-50 p-3 text-sm text-red-600" data-device-activity-error>{error}</p>}
    {!activity ? (!error && <p role="status" className="py-8 text-center text-sm text-neutral-500">{tt("正在加载…")}</p>) : <>
      <section className="flex flex-wrap items-start justify-between gap-4 pb-6" data-device-activity-machine>
        <div className="min-w-0 text-sm text-neutral-700">
          {unreachable ? <>
            <p className="font-medium text-amber-700" data-device-activity-unreachable>{tt("在线，但当前版本连不到它")}</p>
            {activity.gateway && <p className="mt-1 text-xs text-neutral-500" data-device-activity-gateway>{tt("网关 {gateway}", { gateway: activity.gateway })}</p>}
            <p className="mt-1 text-xs text-neutral-500" data-device-activity-unreachable-reason>{tt("当前版本无法控制这台电脑。")}</p>
          </> : !activity.online && <p className="font-medium text-neutral-500" data-device-activity-offline>{tt("离线")}</p>}
          {usage && <p data-device-activity-usage>{tt("CPU {percent}%", { percent: Math.round(usage.cpu_percent) })}{memory !== null && <> · {tt("内存 {percent}%", { percent: memory })} <span className="text-neutral-400">{formatBytes(usage.mem_used_bytes)} / {formatBytes(usage.mem_total_bytes)}</span></>}</p>}
          <p className="mt-1 text-xs text-neutral-500">{tt("节点版本 {version}", { version: activity.node_version || "—" })}{activity.update_available && <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700">{tt("有更新")}</span>}</p>
        </div>
        {(activity.update_available || upgrading) && <button type="button" className={DEVICE_BUTTON} disabled={Boolean(busy) || upgrading || !activity.online || unreachable} onClick={() => void upgrade(false)} data-device-upgrade>{tt(upgrading ? "正在升级…" : "升级节点")}</button>}
      </section>
      <section className="border-t border-neutral-200 py-6" data-device-activity-programs>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{tt("正在运行的程序")}</h3>
          {(programs.length > 0 || terminals.length > 0) && <button type="button" className={`${DEVICE_BUTTON} text-red-600`} disabled={Boolean(busy) || unreachable} onClick={() => void act("all", () => client.endAll(computerId))} data-device-end-all>{tt("全部结束")}</button>}
        </div>
        {programs.length === 0 ? <p className="text-sm text-neutral-400">{tt("没有程序在运行")}</p> : <ul className="divide-y divide-neutral-200">
          {programs.map((item) => {
            const age = runningFor(item.started_at, at);
            const facts = [age && tt("已运行 {time}", { time: age }), item.rss_bytes !== null && tt("内存 {size}", { size: formatBytes(item.rss_bytes) }), item.cpu_percent !== null && tt("CPU {percent}%", { percent: Math.round(item.cpu_percent) })].filter(Boolean);
            return <li key={item.slot} className="flex items-center justify-between gap-4 py-3" data-activity-program={item.slot}>
              <div className="min-w-0">
                <p className="truncate text-sm text-neutral-800"><span className="font-medium">{programLabel(item.program)}</span>{item.task_id && <> · <Link href={taskHref(item.task_id)} className="underline-offset-2 hover:underline" data-activity-task={item.task_id}>{item.task_title || tt("未命名任务")}</Link></>}</p>
                {facts.length > 0 && <p className="mt-1 text-xs text-neutral-500">{facts.join(" · ")}</p>}
              </div>
              <button type="button" className={DEVICE_BUTTON} disabled={Boolean(busy) || unreachable} onClick={() => end(item.slot, { slot: item.slot })} data-activity-end={item.slot}>{tt("结束")}</button>
            </li>;
          })}
        </ul>}
      </section>
      {terminals.length > 0 && <section className="border-t border-neutral-200 py-6" data-device-activity-terminals>
        <h3 className="mb-3 text-sm font-semibold">{tt("终端")}</h3>
        <ul className="divide-y divide-neutral-200">
          {terminals.map((item) => {
            const age = runningFor(item.started_at, at);
            const title = item.title || tt("终端");
            return <li key={item.session_id} className="flex items-center justify-between gap-4 py-3" data-activity-terminal={item.session_id}>
              <div className="min-w-0">
                <p className="truncate text-sm text-neutral-800">{item.task_id ? <Link href={taskHref(item.task_id)} className="underline-offset-2 hover:underline" data-activity-task={item.task_id}>{title}</Link> : title}</p>
                {age && <p className="mt-1 text-xs text-neutral-500">{tt("已运行 {time}", { time: age })}</p>}
              </div>
              <button type="button" className={DEVICE_BUTTON} disabled={Boolean(busy) || unreachable} onClick={() => end(item.session_id, { session_id: item.session_id })} data-activity-end={item.session_id}>{tt("结束")}</button>
            </li>;
          })}
        </ul>
      </section>}
      {(programs.length > 0 || terminals.length > 0) && <p className="border-t border-neutral-200 pt-4 text-xs text-neutral-500">{tt("结束后对话不丢，再发消息会接着聊")}</p>}
    </>}
    {confirm && <DeviceDialog title={tt("升级节点")} compact onClose={() => setConfirm(null)} testId="upgrade-confirm">
      <p className="text-sm text-neutral-600">{tt("升级会结束这些程序和终端")}</p>
      <ul className="mt-4 space-y-2 text-sm text-neutral-800" data-device-upgrade-ends>
        {confirm.programs.map((item) => <li key={item.slot} data-upgrade-ends-program={item.slot}>{programLabel(item.program)}{item.task_id ? ` · ${item.task_title || tt("未命名任务")}` : ""}</li>)}
        {confirm.terminals.map((item) => <li key={item.session_id} data-upgrade-ends-terminal={item.session_id}>{item.title || tt("终端")}</li>)}
      </ul>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={DEVICE_BUTTON} onClick={() => setConfirm(null)}>{tt("取消")}</button>
        <button type="button" className={DEVICE_PRIMARY_BUTTON} disabled={Boolean(busy)} onClick={() => void upgrade(true)} data-device-upgrade-confirm>{tt("结束并升级")}</button>
      </div>
    </DeviceDialog>}
  </DeviceDialog>;
}
