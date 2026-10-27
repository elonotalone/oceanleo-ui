"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceSettingsClient } from "../../api/device-settings";
import { listCloudAgentAvailability, type CloudAgentAvailabilityResult } from "../../lib/cloud-agent-api";
import type { CloudAgentAvailability } from "../../lib/execution-target";
import { deviceAgentBanner, localAgentCanControl, newerLocalAgentRun, parseLocalAgentRun, remoteConsent, taskLocalAgentState,
  type LocalAgentRun, type RemoteConsent } from "../../lib/local-agent-task";
import type { RemoteDesktopAgentBanner } from "../RemoteDesktopPanel";

/**
 * The cloud assistant as the remote desktop sees it (C11 contracts §2 and §4):
 * who is in control of the computer and how a takeover request is approved.
 *
 * - Discovery is `GET /v1/devices/cloud-agent` (owner only, hub memory, no
 *   cache): `live_session` names the live session and its task, and
 *   `remote_takeover` says whether the computer approves the owner's request
 *   without a dialog.
 * - The banner and 交还给 AI come from the task's own projection
 *   (`plan.local_run` of `GET /v1/agent/tasks/{id}`, what the task page reads),
 *   so they are exactly the task page's. The control is the task page's call:
 *   one revision-fenced `resume`, never retried.
 */

/** Availability is light (one owner-only read from hub memory); read this often while the remote desktop is open and visible. */
export const LIVE_POLL_MS = 2_000;
/** The task's projection is read when the live session changes, once more on the next poll, and otherwise at most this often. */
export const RUN_REFRESH_MS = 10_000;
/** Failed reads never poll forever or leave stale hand-back controls enabled. */
const MAX_AVAILABILITY_FAILURES = 3;
/** The task page's own sentence for a control without a confirmed answer (remote-desktop-copy). */
const CONTROL_UNCONFIRMED = "没有收到电脑控制的确认，请核对最新状态；不会自动重复操作。";

export type TaskRunRead = { kind: "ok"; run: LocalAgentRun | null } | { kind: "gone" } | { kind: "error" };

export interface DeviceCloudAgentClient {
  availability(signal?: AbortSignal): Promise<CloudAgentAvailabilityResult>;
  /** `plan.local_run` of the task, as the task page reads it. */
  taskRun(taskId: string): Promise<TaskRunRead>;
  /** One revision-fenced control (protocol §12.3); the answer is the run's projection. */
  control(taskId: string, action: "resume", revision: number): Promise<{ ok: boolean; run: LocalAgentRun | null }>;
  /** Whether this browser holds a standing grant (永久同意) on the computer; null when that cannot be read. */
  standingGrant(deviceId: string, signal?: AbortSignal): Promise<boolean | null>;
}

/** A live, unexpired grant of this browser's controller identity (device settings `controllers[].is_current`). */
export async function standingGrantFrom(settings: Pick<DeviceSettingsClient, "getSettings">, deviceId: string,
  signal?: AbortSignal): Promise<boolean | null> {
  try {
    const result = await settings.getSettings(deviceId, signal);
    if (!result.ok || !result.data) return null;
    const now = Date.now();
    return result.data.controllers.some((grant) => grant.is_current && (!grant.expires_at || Date.parse(grant.expires_at) > now));
  } catch {
    return null;
  }
}

export const deviceCloudAgentClient: DeviceCloudAgentClient = {
  availability: (signal) => listCloudAgentAvailability(signal),
  async taskRun(taskId) {
    // Loaded on use: the devices page does not otherwise need the agent transport.
    const { getTask } = await import("../../lib/agent");
    const result = await getTask(taskId);
    if (result.ok && result.data) return { kind: "ok", run: taskLocalAgentState(result.data.task).run };
    return result.status === 404 ? { kind: "gone" } : { kind: "error" };
  },
  async control(taskId, action, revision) {
    const { controlLocalAgentTask } = await import("../../lib/agent");
    const result = await controlLocalAgentTask(taskId, action, revision);
    return result.ok ? { ok: true, run: parseLocalAgentRun(result.data) } : { ok: false, run: null };
  },
  async standingGrant(deviceId, signal) {
    const { deviceSettingsClient } = await import("../../api/device-settings");
    return standingGrantFrom(deviceSettingsClient, deviceId, signal);
  },
};

/** The envelope's takeover is in force now; otherwise the browser's own grant decides (C11 contract §2). */
function needsGrant(row: CloudAgentAvailability | null): boolean {
  return row !== null && row.remoteTakeover !== null && !(row.remoteTakeover && (row.until === null || row.until > Date.now()));
}

/** A stable signature, so an unchanged poll does not re-render the remote desktop. */
function signature(row: CloudAgentAvailability | null): string {
  return row ? JSON.stringify(row) : "";
}

/**
 * 我的设备 → remote desktop: the AI banner and 交还给 AI for the computer's
 * live cloud-assistant session, and what to expect about consent. Polls only
 * while `deviceId` is set (the remote desktop is open) and the page is visible.
 */
export function useDeviceCloudAgent(deviceId: string | null, settings: Pick<DeviceSettingsClient, "getSettings">,
  client: DeviceCloudAgentClient = deviceCloudAgentClient): { agent?: RemoteDesktopAgentBanner; consent?: RemoteConsent } {
  const [row, setRow] = useState<CloudAgentAvailability | null>(null);
  const [run, setRun] = useState<LocalAgentRun | null>(null);
  const [grant, setGrant] = useState<boolean | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [availabilityNotice, setAvailabilityNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const poke = useRef<() => void>(() => {});

  useEffect(() => {
    setRow(null); setRun(null); setUnconfirmed(false); setAvailabilityNotice(null);
    if (!deviceId) return;
    let alive = true;
    let running = false;
    let stopped = false, failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let shown = "";
    let lastLive = "";
    let followUp = false;
    let runReadAt = 0;
    const abort = new AbortController();
    const schedule = (ms = LIVE_POLL_MS) => {
      if (!alive || stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), ms);
    };
    const show = (next: CloudAgentAvailability | null) => {
      const key = signature(next);
      if (key !== shown) { shown = key; setRow(next); }
    };
    const tick = async () => {
      if (!alive || running || stopped) return;
      if (typeof document !== "undefined" && document.hidden) { schedule(); return; }
      running = true;
      try {
        const result = await client.availability(abort.signal);
        if (!alive) return;
        if (result.kind !== "ok") {
          show(null); setRun(null); lastLive = ""; followUp = false;
          stopped = result.kind === "absent" || ++failures >= MAX_AVAILABILITY_FAILURES;
          setAvailabilityNotice(result.kind === "absent" && result.reason === "unsupported"
            ? "当前服务版本不支持 AI 电脑状态，远程桌面仍可单独连接。"
            : result.kind === "absent" && ["signed_out", "unauthorized"].includes(result.reason ?? "")
              ? "登录已失效，无法读取 AI 电脑状态。请重新登录。"
              : result.kind === "absent" && result.reason === "forbidden"
                ? "当前账号无法读取 AI 电脑状态；远程桌面仍由电脑单独确认授权。"
                : result.kind === "error" ? "暂时无法核对 AI 电脑状态，已暂停交还操作。请关闭桌面后重新进入。" : null);
        }
        if (result.kind === "ok") {
          failures = 0; setAvailabilityNotice(null);
          const next = result.devices.get(deviceId) ?? null;
          show(next);
          const live = next?.liveSession ?? null;
          const key = live ? [live.sessionId, live.taskId, live.state, live.owner].join("|") : "";
          const changed = key !== lastLive;
          lastLive = key;
          if (changed) setUnconfirmed(false);
          if (!live?.taskId) setRun(null);
          else if (changed || followUp || Date.now() - runReadAt >= RUN_REFRESH_MS) {
            runReadAt = Date.now();
            const read = await client.taskRun(live.taskId);
            if (!alive) return;
            if (read.kind === "ok") setRun((current) => newerLocalAgentRun(current, read.run));
            else if (read.kind === "gone") setRun(null);
          }
          // The projection is written right after the hub's change: read it once more on the next poll.
          followUp = changed;
        }
      } catch {
        if (alive) {
          show(null); setRun(null); lastLive = ""; followUp = false;
          stopped = ++failures >= MAX_AVAILABILITY_FAILURES;
          setAvailabilityNotice("暂时无法核对 AI 电脑状态，已暂停交还操作。请关闭桌面后重新进入。");
        }
      } finally {
        running = false;
      }
      schedule(LIVE_POLL_MS * 2 ** failures);
    };
    poke.current = () => { followUp = true; schedule(0); };
    const visible = () => { if (!document.hidden) schedule(0); };
    document.addEventListener("visibilitychange", visible);
    void tick();
    return () => {
      alive = false;
      abort.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      poke.current = () => {};
    };
  }, [deviceId, client]);

  const grantNeeded = needsGrant(row);
  useEffect(() => {
    setGrant(undefined);
    if (!deviceId || !grantNeeded) return;
    const abort = new AbortController();
    void standingGrantFrom(settings, deviceId, abort.signal).then((value) => { if (!abort.signal.aborted) setGrant(value); });
    return () => abort.abort();
  }, [deviceId, grantNeeded, settings]);

  const live = row?.liveSession ?? null;
  const taskId = live?.taskId ?? null;
  const matching = run?.driver === "cloud" && (!run.sessionId || run.sessionId === live?.sessionId) ? run : null;
  const handBack = useCallback(async () => {
    if (!taskId || !matching || inFlight.current || !localAgentCanControl(matching, "resume")) return;
    inFlight.current = true;
    setBusy(true); setUnconfirmed(false);
    try {
      const result = await client.control(taskId, "resume", matching.revision);
      if (result.ok && result.run) setRun((current) => newerLocalAgentRun(current, result.run));
      if (!result.ok) setUnconfirmed(true);
    } catch {
      setUnconfirmed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
      poke.current();
    }
  }, [client, matching, taskId]);

  const banner = deviceAgentBanner(live, matching);
  return {
    consent: remoteConsent(row, grant) ?? undefined,
    agent: banner ? {
      text: banner.text,
      ...(unconfirmed ? { note: CONTROL_UNCONFIRMED } : {}),
      handBack: banner.handBack && taskId !== null && localAgentCanControl(matching, "resume"),
      busy,
      onHandBack: () => { void handBack(); },
    } : availabilityNotice ? { text: availabilityNotice, handBack: false, busy: false, onHandBack: () => {} } : undefined,
  };
}

/**
 * The task page → 接管电脑: what to expect about consent for this computer.
 * Read when shown and again when the window regains focus.
 */
export function useRemoteConsent(deviceId: string | null, enabled: boolean,
  client: DeviceCloudAgentClient = deviceCloudAgentClient): RemoteConsent | null {
  const [row, setRow] = useState<CloudAgentAvailability | null>(null);
  const [grant, setGrant] = useState<boolean | null | undefined>(undefined);
  useEffect(() => {
    setRow(null);
    if (!deviceId || !enabled) return;
    let alive = true;
    const abort = new AbortController();
    const read = async () => {
      const result = await client.availability(abort.signal).catch((): CloudAgentAvailabilityResult => ({ kind: "error" }));
      if (!alive) return;
      if (result.kind === "ok") {
        const next = result.devices.get(deviceId) ?? null;
        setRow((current) => signature(current) === signature(next) ? current : next);
      } else setRow(null);
    };
    void read();
    const focus = () => { void read(); };
    window.addEventListener("focus", focus);
    return () => { alive = false; abort.abort(); window.removeEventListener("focus", focus); };
  }, [deviceId, enabled, client]);
  const grantNeeded = enabled && needsGrant(row);
  useEffect(() => {
    setGrant(undefined);
    if (!deviceId || !grantNeeded) return;
    let alive = true;
    const abort = new AbortController();
    void client.standingGrant(deviceId, abort.signal).then((value) => { if (alive) setGrant(value); }, () => { if (alive) setGrant(null); });
    return () => { alive = false; abort.abort(); };
  }, [deviceId, grantNeeded, client]);
  return enabled ? remoteConsent(row, grant) : null;
}
