"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { deviceErrorCopy } from "../api/device-error-copy";
import type { LibraryDevice } from "./library-scope";
import { listLibraryDevices } from "./library-scope-client";
import { LocalFileTree, humanizeGrantedKinds } from "./LocalFileTree";
import { LocalTaskProgress } from "./LocalTaskProgress";
import {
  createLocalTask,
  describeLocalAction,
  isAbsoluteLocalPath,
  joinLocalPath,
  localActionOutcomeText,
  localTextToBase64,
  watchLocalTask,
  LOCAL_ACTION_KINDS,
  LOCAL_ACTION_LABELS,
  LOCAL_ACTIONS_THAT_CHANGE_THE_DEVICE,
  LocalTaskApiError,
  type LocalActionKind,
  type LocalActionPayloadByKind,
  type LocalActionPlan,
  type LocalTask,
  type StartLocalActionOptions,
} from "./local-task-client";

/** 动作与它自己的 payload 绑成一个判别联合，形状对不上就编译期红。 */
type LocalActionRequest = {
  [K in LocalActionKind]: { actionKind: K; payload: LocalActionPayloadByKind[K] };
}[LocalActionKind];

// 本机动作台（W09，2026-08-20）。
//
// 差异点在这里：我们不做「云端 agent 顺手碰你的电脑」。每一个会改动那台电脑的动作，
// 发起之前先把「要动哪个路径、动完能不能撤回、需不需要有人在那台电脑上按确认」讲成
// 人话（`describeLocalAction`），发起之后每一条都留在同一张台账里，带审计指纹。
// 所以这里**不许**退化成一个只有转圈的黑盒。
//
// 六个动作的表单为什么都长在这里、而不是长在站点页面里：站点侧两个入口都有既有闸门
// （`tests/library-local-task-entry.test.mjs` 不许面板里出现第二个 <input>，
// `tests/devices-route-wiring.test.mjs` 不许 /devices 页面自己 useState/fetch），
// 意思就是「界面与状态只有一份，在 @oceanleo/ui 里」。这里按那个方向收口。
//
// 历史为什么只到「本次会话」：网关只有 create/claim/result/get-one/cancel，没有
// 「列出我的任务」端点。全量、跨会话、且带命令输出全文的记录在那台电脑的
// 「本地审计」窗口里 —— 这一点在界面上直说，不假装这里就是全部。

export interface LocalActionConsoleProps {
  device: LibraryDevice | null;
  /**
   * 宿主已经问过的已授权目录。给了就不再问第二遍（库页就是这种情况）；
   * 不给（/devices 页）时动作台自己问一次。
   */
  basePath?: string;
  devicesHref?: string;
  showFileTree?: boolean;
  className?: string;
  /** 测试缝；产品调用方一律不传。 */
  runAction?: StartLocalActionOptions;
  now?: () => number;
}

interface ConsoleRecord {
  taskId: string;
  actionKind: LocalActionKind;
  deviceName: string;
  startedAtMs: number;
  plan: LocalActionPlan;
  task?: LocalTask;
  queuedOffline: boolean;
}

const TERMINAL: ReadonlySet<string> = new Set([
  "succeeded",
  "failed",
  "denied",
  "expired",
  "cancelled",
]);

const ACTION_HINTS: Record<LocalActionKind, string> = {
  "fs.list": "看看这个目录里有什么。只读。",
  "fs.read_summary": "看一个文件的结构：类型、大小，表格再看列名与行数。只读。",
  "file.write": "把一段文本整份写进一个文件。会覆盖原内容。",
  "python.run": "用那台电脑自带的 Python 跑一段脚本，处理已授权目录里的文件。",
  "shell.run": "执行一条命令（不经过 shell，没有管道与重定向）。每次都要在那台电脑上确认。",
  "app.open": "让那台电脑用默认程序打开一个文件或应用。",
};

function timeText(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function statusText(record: ConsoleRecord): string {
  const status = record.task?.status;
  if (!status) return record.queuedOffline ? "已排队（设备离线）" : "已排队";
  switch (status) {
    case "queued":
      return "排队中";
    case "claimed":
      return "设备已领取";
    case "running":
      return "正在那台电脑上执行";
    case "succeeded":
      return "已完成";
    case "failed":
      return "执行失败";
    case "denied":
      return "被拒绝";
    case "expired":
      return "已过期";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

/** 审计指纹的最后一格：结果要么是读数，要么是一句能看懂的拒绝理由。 */
function outcomeText(record: ConsoleRecord): string {
  const task = record.task;
  if (!task || !TERMINAL.has(task.status)) return "";
  if (task.status === "denied") {
    return task.denyReason
      ? deviceErrorCopy(task.denyReason, { deviceName: record.deviceName })
      : `${record.deviceName}拒绝了这一步；原因在那台电脑的「本地审计」里。`;
  }
  return localActionOutcomeText(task, record.deviceName);
}

function NotInstalled({ devicesHref }: { devicesHref: string }) {
  return (
    <section
      className="rounded-2xl border border-stone-200 bg-white p-5"
      data-local-console-state="no-device"
    >
      <h2 className="text-base font-semibold text-stone-900">本机动作台</h2>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        这些动作发生在你自己的电脑上，所以需要先在那台电脑上装一个 OceanLeo 客户端并
        与这个账号配对。没有客户端时，网页端一个本机动作也发不出去 —— 这是设计如此，
        不是坏了。
      </p>
      <ol className="mt-3 space-y-1 text-sm text-stone-600">
        <li>1. 在要被操作的那台电脑上安装 OceanLeo 客户端。</li>
        <li>2. 客户端里拿到配对码，在「我的设备」页面输入，完成配对。</li>
        <li>3. 在那台电脑上授权你允许 OceanLeo 碰的目录，并打开「允许云端下发」。</li>
      </ol>
      <a
        href={devicesHref}
        className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
      >
        去连接一台电脑
      </a>
    </section>
  );
}

export function LocalActionConsole({
  device,
  basePath,
  devicesHref = "/devices",
  showFileTree = true,
  className,
  runAction,
  now = Date.now,
}: LocalActionConsoleProps) {
  const [pathDraft, setPathDraft] = useState("");
  const [actionKind, setActionKind] = useState<LocalActionKind>("fs.list");
  const [targetDraft, setTargetDraft] = useState("");
  const [content, setContent] = useState("");
  const [code, setCode] = useState("");
  const [command, setCommand] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [records, setRecords] = useState<ConsoleRecord[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const stopsRef = useRef<(() => void)[]>([]);

  const rootPath = (basePath ?? pathDraft).trim();
  const rootReady = isAbsoluteLocalPath(rootPath);
  const target = targetDraft.trim() || selection[0] || rootPath;

  const onSelectionChange = useCallback((paths: string[]) => {
    setSelection(paths);
  }, []);

  const request = useMemo((): LocalActionRequest => {
    switch (actionKind) {
      case "file.write":
        return { actionKind, payload: { path: target, content_b64: localTextToBase64(content) } };
      case "python.run":
        return { actionKind, payload: { cwd: rootPath, code } };
      case "shell.run":
        return { actionKind, payload: { cwd: rootPath, command } };
      case "fs.read_summary":
      case "app.open":
        return { actionKind, payload: { path: target } };
      default:
        return { actionKind: "fs.list", payload: { path: target } };
    }
  }, [actionKind, code, command, content, rootPath, target]);

  const plan = useMemo(
    () => describeLocalAction(request.actionKind, request.payload, device?.device_name),
    [device?.device_name, request],
  );

  const missingField = useMemo(() => {
    if (!rootReady) return "先填一个你已经在那台电脑上授权过的目录的绝对路径。";
    if (actionKind === "file.write") {
      if (!isAbsoluteLocalPath(target)) return "写入目标要是一个绝对路径的文件。";
      if (!content) return "还没有要写进去的内容。";
    }
    if (actionKind === "python.run" && !code.trim()) return "还没有要执行的脚本。";
    if (actionKind === "shell.run" && !command.trim()) return "还没有要执行的命令。";
    if (
      (actionKind === "fs.list" ||
        actionKind === "fs.read_summary" ||
        actionKind === "app.open") &&
      !isAbsoluteLocalPath(target)
    ) {
      return "目标要是一个绝对路径。";
    }
    return "";
  }, [actionKind, code, command, content, rootReady, target]);

  const insertSelection = useCallback(() => {
    if (selection.length === 0) return;
    if (actionKind === "python.run") {
      const literal = selection.map((path) => JSON.stringify(path)).join(",\n    ");
      setCode(
        (current) =>
          `FILES = [\n    ${literal},\n]\n${current}`.replace(/\n{3,}/g, "\n\n"),
      );
      return;
    }
    if (actionKind === "shell.run") {
      setCommand((current) =>
        [current.trim(), ...selection.map((path) => `"${path}"`)].filter(Boolean).join(" "),
      );
      return;
    }
    setTargetDraft(selection[0]);
  }, [actionKind, selection]);

  const updateRecord = useCallback((taskId: string, task: LocalTask) => {
    setRecords((current) =>
      current.map((record) =>
        record.taskId === taskId ? { ...record, task } : record,
      ),
    );
  }, []);

  const launch = useCallback(async () => {
    if (!device || submitting || missingField) return;
    setSubmitting(true);
    setError("");
    const startedAtMs = now();
    try {
      // 先建任务、再把它记进台账、最后才开始轮询：反过来的话第一条状态回调可能早于
      // 台账里出现这一行，那条更新就会被丢掉，界面停在「已排队」。
      const create = runAction?.createTask ?? createLocalTask;
      const created = await create(device.device_id, request.actionKind, request.payload);
      setRecords((current) =>
        [
          {
            taskId: created.taskId,
            actionKind: request.actionKind,
            deviceName: device.device_name,
            startedAtMs,
            plan,
            queuedOffline: created.offline || !device.online,
          },
          ...current,
        ].slice(0, 40),
      );
      stopsRef.current.push(
        watchLocalTask(
          created.taskId,
          (task) => updateRecord(created.taskId, task),
          runAction,
        ),
      );
    } catch (caught) {
      const refusal = caught instanceof LocalTaskApiError ? caught.code : "network_error";
      const limit = caught instanceof LocalTaskApiError ? caught.limit : undefined;
      setError(
        refusal === "network_error"
          ? "任务没有发出去，请检查网络后重试。它没有排上队，所以不会重复执行。"
          : deviceErrorCopy(refusal, { deviceName: device.device_name, limit }),
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    device,
    missingField,
    now,
    plan,
    request,
    runAction,
    submitting,
    updateRecord,
  ]);

  if (!device) return <NotInstalled devicesHref={devicesHref} />;

  const running = records.filter(
    (record) => !record.task || !TERMINAL.has(record.task.status),
  );
  const finished = records.filter(
    (record) => record.task && TERMINAL.has(record.task.status),
  );

  return (
    <section
      className={className}
      data-local-action-console
      data-local-console-state={device.online ? "online" : "offline"}
      aria-label="本机动作台"
    >
      <header className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-stone-900">
            本机动作台 · {device.device_name}
          </h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              device.online ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {device.online ? "在线" : "离线（下单会排队）"}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-stone-600" data-local-console-scope>
          已授权类别：{humanizeGrantedKinds(device.granted_kinds)}。
          {device.local_exec_enabled
            ? "「允许云端下发」在那台电脑上是开着的。"
            : "「允许云端下发」现在是关的，任务会被拒绝；这个开关只能在那台电脑的托盘图标里打开。"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-stone-500">
          授权到哪些目录只有{device.device_name}自己知道，网页端看不到、也不替你猜。
          你在这里填的路径若不在它的授权范围内，它会拒绝而不是照做。
        </p>
      </header>

      {basePath === undefined && (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
          <label
            htmlFor="local-console-root"
            className="block text-xs font-medium text-stone-700"
          >
            已授权目录的绝对路径
          </label>
          <input
            id="local-console-root"
            type="text"
            value={pathDraft}
            onChange={(event) => setPathDraft(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-800 outline-none focus:border-sky-400"
          />
          {pathDraft.trim() && !rootReady && (
            <p className="mt-1 text-xs text-rose-700" role="alert">
              要绝对路径：POSIX 的 /…、Windows 的 C:\… 或 \\主机\共享。
            </p>
          )}
        </div>
      )}

      {showFileTree && rootReady && (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
          <LocalFileTree
            deviceId={device.device_id}
            deviceName={device.device_name}
            deviceOnline={device.online}
            rootPath={rootPath}
            grantedKinds={device.granted_kinds}
            selectedPaths={selection}
            onSelectionChange={onSelectionChange}
            runAction={runAction}
          />
        </div>
      )}

      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="选择动作">
          {LOCAL_ACTION_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={actionKind === kind}
              onClick={() => setActionKind(kind)}
              data-local-action-tab={kind}
              className={`min-h-10 rounded-lg px-3 text-xs font-medium transition ${
                actionKind === kind
                  ? "bg-stone-900 text-white"
                  : "border border-stone-200 text-stone-700 hover:bg-stone-50"
              }`}
            >
              {LOCAL_ACTION_LABELS[kind]}
              {LOCAL_ACTIONS_THAT_CHANGE_THE_DEVICE.has(kind) && (
                <span className="ml-1 text-amber-300" aria-label="会改动那台电脑">
                  ●
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-600">{ACTION_HINTS[actionKind]}</p>

        <div className="mt-3 space-y-3">
          {(actionKind === "fs.list" ||
            actionKind === "fs.read_summary" ||
            actionKind === "app.open" ||
            actionKind === "file.write") && (
            <div>
              <label
                htmlFor="local-console-target"
                className="block text-xs font-medium text-stone-700"
              >
                {actionKind === "file.write" ? "要写入的文件（绝对路径）" : "目标（绝对路径）"}
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  id="local-console-target"
                  type="text"
                  value={targetDraft}
                  onChange={(event) => setTargetDraft(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-800 outline-none focus:border-sky-400"
                />
                {rootReady && (
                  <button
                    type="button"
                    onClick={() => setTargetDraft(rootPath)}
                    className="min-h-10 rounded-lg border border-stone-200 px-3 text-xs text-stone-700 hover:bg-stone-50"
                  >
                    用授权目录
                  </button>
                )}
                {actionKind === "file.write" && rootReady && (
                  <button
                    type="button"
                    onClick={() => setTargetDraft(joinLocalPath(rootPath, "oceanleo-写入.txt"))}
                    className="min-h-10 rounded-lg border border-stone-200 px-3 text-xs text-stone-700 hover:bg-stone-50"
                  >
                    在授权目录里新建
                  </button>
                )}
              </div>
            </div>
          )}

          {actionKind === "file.write" && (
            <div>
              <label
                htmlFor="local-console-content"
                className="block text-xs font-medium text-stone-700"
              >
                要写进去的内容（整份替换）
              </label>
              <textarea
                id="local-console-content"
                rows={5}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-800 outline-none focus:border-sky-400"
              />
            </div>
          )}

          {actionKind === "python.run" && (
            <div>
              <label
                htmlFor="local-console-code"
                className="block text-xs font-medium text-stone-700"
              >
                Python 脚本（工作目录就是上面那个已授权目录）
              </label>
              <textarea
                id="local-console-code"
                rows={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-800 outline-none focus:border-sky-400"
              />
            </div>
          )}

          {actionKind === "shell.run" && (
            <div>
              <label
                htmlFor="local-console-command"
                className="block text-xs font-medium text-stone-700"
              >
                命令（单条，不经过 shell）
              </label>
              <input
                id="local-console-command"
                type="text"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs text-stone-800 outline-none focus:border-sky-400"
              />
            </div>
          )}

          {selection.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 px-3 py-2">
              <span className="text-xs text-stone-600">
                树里选中了 {selection.length} 个文件
              </span>
              <button
                type="button"
                onClick={insertSelection}
                data-local-console-use-selection
                className="min-h-10 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-800 hover:bg-stone-50"
              >
                把选中的文件带进这个任务
              </button>
            </div>
          )}
        </div>

        <div
          className={`mt-4 rounded-xl border p-3 ${
            plan.changesDevice ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-stone-50"
          }`}
          data-local-action-plan={actionKind}
          data-local-action-changes-device={plan.changesDevice ? "true" : "false"}
        >
          <p className="text-xs font-semibold text-stone-900">
            {plan.changesDevice ? "发起前请先看清楚：这一步会改动那台电脑" : "这一步只读，不会改动那台电脑"}
          </p>
          <p className="mt-1 text-xs text-stone-800">{plan.title}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-stone-700">
            {plan.facts.map((fact) => (
              <div key={fact.label} className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-stone-500">{fact.label}</dt>
                <dd className="break-all font-mono">{fact.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-stone-700">影响范围：{plan.impact}</p>
          {plan.consent && (
            <p className="mt-1 text-xs leading-relaxed text-amber-800" data-local-action-consent>
              需要确认：{plan.consent}
            </p>
          )}
          <p className="mt-1 text-xs leading-relaxed text-stone-600">{plan.scopeNote}</p>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">{plan.resultNote}</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void launch()}
            disabled={submitting || Boolean(missingField)}
            data-local-console-launch
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "正在排队…" : plan.changesDevice ? "确认并发起" : "发起"}
          </button>
          {missingField && (
            <span className="text-xs text-stone-600" data-local-console-blocked>
              {missingField}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-2 text-xs text-rose-700" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4" data-local-console-ledger>
        <h3 className="text-sm font-semibold text-stone-900">进行中</h3>
        {running.length === 0 ? (
          <p className="mt-1 text-xs text-stone-500">现在没有正在执行的本机动作。</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {running.map((record) => (
              <li key={record.taskId} data-local-console-running={record.actionKind}>
                <RecordFingerprint record={record} />
                <LocalTaskProgress
                  taskId={record.taskId}
                  deviceName={record.deviceName}
                  actionKind={record.actionKind}
                  initialTask={record.task}
                  className="mt-2 rounded-xl border border-stone-200 px-3 py-2 text-xs"
                />
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-4 text-sm font-semibold text-stone-900">历史</h3>
        {finished.length === 0 ? (
          <p className="mt-1 text-xs text-stone-500">本次会话还没有已结束的本机动作。</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {finished.map((record) => (
              <li
                key={record.taskId}
                data-local-console-history={record.task?.status}
                className="rounded-xl border border-stone-200 px-3 py-2"
              >
                <RecordFingerprint record={record} />
                <p className="mt-1 text-xs text-stone-800" data-local-console-outcome>
                  {outcomeText(record)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-stone-500">
          这张台账记的是你在这个网页本次会话里发起过的动作。{device.device_name}上还有一份
          完整的本地审计（含命令输出全文、以及被拒绝的那些），在客户端的「本地审计」窗口里看。
        </p>
      </div>
    </section>
  );
}

export interface MyDevicesActionConsoleProps {
  devicesHref?: string;
  className?: string;
  /** 测试缝；产品调用方一律不传。 */
  listDevices?: () => Promise<readonly LibraryDevice[]>;
  runAction?: StartLocalActionOptions;
}

/**
 * 「我的设备」页用的自带取数版本。
 *
 * 为什么要有这一层：`/devices` 路由被 `tests/devices-route-wiring.test.mjs` 钉死
 * 「不许自己 useState、不许自己 fetch」—— 设备列表与动作台状态都必须留在共享组件里。
 * 所以这里把「列出我的电脑 → 选一台 → 动作台」这一小段收在 `@oceanleo/ui` 内部。
 */
export function MyDevicesActionConsole({
  devicesHref = "/devices",
  className,
  listDevices = listLibraryDevices,
  runAction,
}: MyDevicesActionConsoleProps) {
  const [devices, setDevices] = useState<readonly LibraryDevice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listDevices()
      .then((next) => {
        if (!active) return;
        setDevices(next);
        setActiveId(next[0]?.device_id ?? null);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [listDevices]);

  if (failed) {
    return (
      <p className={className} role="alert">
        设备列表暂时读不到，请刷新页面重试。已经在跑的本机任务不受影响。
      </p>
    );
  }
  if (devices === null) {
    return (
      <p className={className} role="status">
        正在读取你已连接的电脑…
      </p>
    );
  }
  if (devices.length === 0) {
    return <NotInstalled devicesHref={devicesHref} />;
  }

  const active = devices.find((device) => device.device_id === activeId) ?? devices[0];
  return (
    <div className={className} data-my-devices-console>
      {devices.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="选择一台电脑">
          {devices.map((device) => (
            <button
              key={device.device_id}
              type="button"
              aria-pressed={device.device_id === active.device_id}
              onClick={() => setActiveId(device.device_id)}
              className={`min-h-10 rounded-lg px-3 text-xs font-medium transition ${
                device.device_id === active.device_id
                  ? "bg-stone-900 text-white"
                  : "border border-stone-200 text-stone-700 hover:bg-stone-50"
              }`}
            >
              {device.device_name}
              {!device.online && <span className="ml-1 text-amber-700">（离线）</span>}
            </button>
          ))}
        </div>
      )}
      <LocalActionConsole
        device={active}
        devicesHref={devicesHref}
        runAction={runAction}
      />
    </div>
  );
}

/** 审计指纹：谁、什么时候、做了什么、结果。缺一格就退回黑盒。 */
function RecordFingerprint({ record }: { record: ConsoleRecord }) {
  const finishedAt = record.task?.finishedAt;
  return (
    <div className="text-xs text-stone-600" data-local-console-fingerprint={record.taskId}>
      <p className="font-medium text-stone-900">
        {LOCAL_ACTION_LABELS[record.actionKind]} · {statusText(record)}
      </p>
      <p className="mt-0.5">
        发起：你（这个浏览器） → {record.deviceName} · {timeText(record.startedAtMs)}
        {finishedAt ? ` · 结束 ${finishedAt}` : ""}
      </p>
      <p className="mt-0.5 break-all font-mono">
        {record.actionKind === "shell.run"
          ? `${record.plan.facts[0]?.value ?? ""} $ ${record.plan.facts[1]?.value ?? ""}`
          : record.plan.facts[0]?.value}
      </p>
      <p className="mt-0.5">任务号 {record.taskId}</p>
    </div>
  );
}
