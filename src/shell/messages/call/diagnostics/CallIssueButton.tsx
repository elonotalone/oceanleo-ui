"use client";

// 小窗里的警告图标（A14）：自己网络或设备有问题（`useCall().issues` 非空，或网络持续变差）时出现；
// 点开逐条一句话说明问题 + 一个办法按钮（换设备 / 仅语音 / 检查网络 / 正在重连 …），参照 Slack 通话中的排障面板。
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { AnchoredPopover } from "../../../anchored-popover";
import { callActions, useCall, type CallIssue, type MediaDeviceLite } from "../engine";
import { openCallTest } from "./diagnostics-store";
import { IconCallCheck, IconCheck, IconWarning, Spinner } from "./icons";
import { collectIssues, pruneDismissed, type DeviceKind, type IssueDescriptor } from "./issues";
import { DIAG_MENU_Z, DIAG_POPOVER_Z } from "./layer";
import { listMediaDevices, type DeviceLists } from "./media-probes";
import { useIssueEnvironment } from "./use-issue-environment";
import { useNetworkHealth } from "./use-network-health";

const PSEUDO_DEVICE_IDS = new Set(["default", "communications"]);

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

export function CallIssueButton({ className = "" }: { className?: string } = {}) {
  const tt = useUI();
  const call = useCall();
  const health = useNetworkHealth();
  const env = useIssueEnvironment(call.me.audioOnly, call.limits);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  const liveIssues = useMemo<CallIssue[]>(
    () => (health.sustainedPoor ? [...call.issues, { kind: "network_poor" }] : call.issues),
    [call.issues, health.sustainedPoor],
  );
  useEffect(() => {
    setDismissed((previous) => {
      const next = pruneDismissed(previous, liveIssues);
      return sameSet(previous, next) ? previous : next;
    });
  }, [liveIssues]);

  const items = useMemo(() => collectIssues(call.issues, health, env, dismissed), [call.issues, health, env, dismissed]);
  const inCall = call.phase !== "idle";

  useEffect(() => {
    if (!items.length) setOpen(false);
  }, [items.length]);

  if (!inCall || !items.length) return null;
  const top = items[0];
  const label =
    items.length === 1 ? tt("通话有问题，点开查看") : tt("通话有 {n} 个问题，点开查看", { n: items.length });

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-call-issue-button={top.kind}
        onClick={() => setOpen((value) => !value)}
        className={`relative flex size-8 shrink-0 items-center justify-center rounded-full text-amber-500 hover:bg-amber-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 ${className}`}
      >
        <IconWarning size={18} />
        {items.length > 1 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex min-w-[15px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-[15px] text-white"
          >
            {items.length}
          </span>
        ) : null}
      </button>
      <span className="sr-only" aria-live="polite">
        {tt(top.text, top.vars)}
      </span>
      <AnchoredPopover
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        role="dialog"
        ariaLabel={tt("通话问题")}
        align="start"
        preferredPlacement="above"
        className="overflow-y-auto overscroll-contain rounded-xl border border-neutral-200/80 bg-white p-3 text-neutral-900 shadow-[0_8px_32px_rgba(0,0,0,0.18)] dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
        style={{ width: 320, zIndex: DIAG_POPOVER_Z }}
        attributes={{ "data-call-issue-panel": "" }}
      >
        <IssueList
          items={items}
          onDismiss={(id) => setDismissed((previous) => new Set(previous).add(id))}
          onOpenTest={() => {
            setOpen(false);
            openCallTest();
          }}
        />
      </AnchoredPopover>
    </>
  );
}

/** 问题清单（无 portal，可静态渲染；单测直接渲染它核对每种问题的文案与按钮）。 */
export function IssueList({
  items,
  onDismiss,
  onOpenTest,
}: {
  items: IssueDescriptor[];
  onDismiss(id: string): void;
  onOpenTest(): void;
}) {
  const tt = useUI();
  return (
    <div data-call-issue-list="">
      <p className="mb-2 text-[13px] font-semibold">{tt("通话有问题")}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <IssueRow key={item.id} item={item} onDismiss={onDismiss} />
        ))}
      </ul>
      <button
        type="button"
        onClick={onOpenTest}
        data-open-call-test=""
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10"
      >
        <IconCallCheck size={14} />
        {tt("打开通话检测")}
      </button>
    </div>
  );
}

function IssueRow({ item, onDismiss }: { item: IssueDescriptor; onDismiss(id: string): void }) {
  const tt = useUI();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const actionRef = useRef<HTMLButtonElement | null>(null);
  const expandable = item.help.length > 0 && ["permission_help", "check_network", "browser_help"].includes(item.action.kind);

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    try {
      await task();
    } catch {
      // 引擎会把仍然存在的问题重新写进 issues；这里不重复报错
    } finally {
      setBusy(false);
    }
  }

  function onAction() {
    switch (item.action.kind) {
      case "permission_help":
      case "check_network":
      case "browser_help":
        setExpanded((value) => !value);
        return;
      case "retry_devices":
        void run(retryMicrophone);
        return;
      case "switch_mic":
      case "switch_device":
        setMenuOpen((value) => !value);
        return;
      case "audio_only":
        void run(() => callActions.setAudioOnly(true));
        return;
      case "dismiss":
        onDismiss(item.id);
        return;
      case "reconnecting":
      default:
        return;
    }
  }

  function retry() {
    if (item.retry === "mic") void run(() => callActions.setMic(true));
    else if (item.retry === "camera") void run(() => callActions.setCamera(true));
    else if (item.retry === "screen") void run(() => callActions.setScreenShare(true));
  }

  const reconnecting = item.action.kind === "reconnecting";
  return (
    <li
      data-issue={item.kind}
      className="rounded-lg bg-amber-50 px-2.5 py-2 text-[12.5px] leading-[18px] text-neutral-800 dark:bg-amber-500/10 dark:text-neutral-100"
    >
      <p>{tt(item.text, item.vars)}</p>
      <button
        ref={actionRef}
        type="button"
        data-issue-action={item.action.kind}
        disabled={Boolean(item.action.disabled) || busy}
        aria-expanded={expandable ? expanded : menuOpen ? true : undefined}
        aria-haspopup={item.action.kind === "switch_mic" || item.action.kind === "switch_device" ? "menu" : undefined}
        onClick={onAction}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 disabled:cursor-default disabled:opacity-70 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-white/10 dark:hover:bg-neutral-700"
      >
        {busy || reconnecting ? <Spinner size={12} /> : null}
        {tt(item.action.label)}
      </button>
      {expandable && expanded ? (
        <div className="mt-1.5" data-issue-help="">
          <ol className="list-decimal space-y-0.5 pl-4 text-[12px] text-neutral-600 dark:text-neutral-300">
            {item.help.map((line) => (
              <li key={line}>{tt(line)}</li>
            ))}
          </ol>
          {item.retry ? (
            <button
              type="button"
              onClick={retry}
              disabled={busy}
              data-issue-retry={item.retry}
              className="mt-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-60 dark:text-sky-300 dark:hover:bg-sky-500/10"
            >
              {tt("重试")}
            </button>
          ) : null}
        </div>
      ) : null}
      {item.action.device ? (
        <DeviceSwitchMenu
          open={menuOpen}
          anchorRef={actionRef}
          kind={item.action.device}
          reenable={item.kind === "device_lost"}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
    </li>
  );
}

async function retryMicrophone(): Promise<void> {
  const lists = await callActions.listDevices().catch(() => listMediaDevices());
  const first = lists.microphones.find((device) => !PSEUDO_DEVICE_IDS.has(device.deviceId)) ?? lists.microphones[0];
  if (first) await callActions.selectDevice("mic", first.deviceId).catch(() => undefined);
  await callActions.setMic(true);
}

const GROUPS: Array<{ kind: DeviceKind; title: string; listKey: keyof DeviceLists; fallback: string }> = [
  { kind: "mic", title: "麦克风", listKey: "microphones", fallback: "麦克风 {n}" },
  { kind: "camera", title: "摄像头", listKey: "cameras", fallback: "摄像头 {n}" },
  { kind: "speaker", title: "扬声器", listKey: "speakers", fallback: "扬声器 {n}" },
];

function DeviceSwitchMenu({
  open,
  anchorRef,
  kind,
  reenable,
  onClose,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  kind: DeviceKind | "any";
  reenable: boolean;
  onClose(): void;
}) {
  const tt = useUI();
  const call = useCall();
  const [lists, setLists] = useState<DeviceLists | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLists(null);
    callActions
      .listDevices()
      .catch(() => listMediaDevices())
      .then((next) => {
        if (!cancelled) setLists(next);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const current: Record<DeviceKind, string | null> = {
    mic: call.me.micDeviceId,
    camera: call.me.cameraDeviceId,
    speaker: call.me.speakerDeviceId,
  };
  const groups = GROUPS.filter((group) => kind === "any" || group.kind === kind);

  async function pick(deviceKind: DeviceKind, device: MediaDeviceLite) {
    onClose();
    try {
      await callActions.selectDevice(deviceKind, device.deviceId);
      if (deviceKind === "mic") await callActions.setMic(true);
      if (deviceKind === "camera" && reenable) await callActions.setCamera(true);
    } catch {
      // 引擎会把仍然存在的问题重新写进 issues
    }
  }

  return (
    <AnchoredPopover
      open={open}
      anchorRef={anchorRef}
      onClose={() => onClose()}
      role="menu"
      ariaLabel={tt("选择设备")}
      align="start"
      preferredPlacement="above"
      className="overflow-y-auto overscroll-contain rounded-xl border border-neutral-200/80 bg-white p-1 text-neutral-900 shadow-[0_8px_32px_rgba(0,0,0,0.14)] dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
      style={{ width: 264, zIndex: DIAG_MENU_Z }}
      attributes={{ "data-call-issue-devices": kind }}
    >
      {lists === null ? (
        <div className="flex items-center justify-center py-3 text-neutral-500">
          <Spinner size={14} />
        </div>
      ) : (
        groups.map((group) => {
          const devices = lists[group.listKey].filter((device) => !PSEUDO_DEVICE_IDS.has(device.deviceId));
          return (
            <div key={group.kind} role="group" aria-label={tt(group.title)}>
              {groups.length > 1 ? (
                <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-neutral-400">{tt(group.title)}</div>
              ) : null}
              {devices.length ? (
                devices.map((device, index) => {
                  const selected = current[group.kind] === device.deviceId;
                  return (
                    <button
                      key={device.deviceId}
                      type="button"
                      role="menuitem"
                      aria-current={selected ? "true" : undefined}
                      onClick={() => void pick(group.kind, device)}
                      className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none dark:hover:bg-white/10 dark:focus-visible:bg-white/10"
                    >
                      <span className="min-w-0 flex-1 truncate">{device.label || tt(group.fallback, { n: index + 1 })}</span>
                      {selected ? <IconCheck size={14} /> : null}
                    </button>
                  );
                })
              ) : (
                <div className="px-2.5 py-1.5 text-[12px] text-neutral-500">{tt("没有找到可用的设备")}</div>
              )}
            </div>
          );
        })
      )}
    </AnchoredPopover>
  );
}
