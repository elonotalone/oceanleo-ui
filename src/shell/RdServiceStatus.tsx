"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { normalizeLocale } from "../i18n/config";
import { RD_SERVICE_STATUS_MESSAGES, RD_SERVICE_STATUS_SOURCE as COPY } from "../i18n/ui/messages/rd-service-status-copy";

import { RDLOGIN_MESSAGES, RDLOGIN_SOURCE as LOGIN } from "../i18n/ui/messages/rdlogin-copy";

import { RDLOGIN_ACT_MESSAGES, RDLOGIN_ACT_SOURCE as ACT } from "../i18n/ui/messages/rdlogin-act-copy";

type Pane = "background" | "screen" | "accessibility";
type NativeInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type Status = {
  running?: boolean;
  startupError?: string | null;
  registration?: {
    installed?: boolean; registered?: boolean; state?: string; approvalRequired?: boolean;
    mechanism?: string; bootTrigger?: boolean;
    permissions?: { state?: string; missing?: string[]; checkedAt?: number };
  };
};

// Closed local command surface. Rust checks the calling webview and maps pane names to fixed URLs.
export function rdServicePort(scope: unknown) {
  const host = scope as { __TAURI__?: { core?: { invoke?: NativeInvoke }; invoke?: NativeInvoke } };
  const core = host?.__TAURI__?.core;
  const invoke = core?.invoke?.bind(core) ?? host?.__TAURI__?.invoke?.bind(host.__TAURI__);
  return invoke ? {
    status: () => invoke("background_service_status") as Promise<Status>,
    capabilities: () => invoke("remote_secure_desktop_status"),
    settings: (pane: Pane) => invoke("background_service_open_settings", { pane }),
  } : null;
}

export function rdServiceView(status: Status | null, now = Date.now() / 1000) {
  const registration = status?.registration;
  const permissions = registration?.permissions;
  const at = permissions?.checkedAt;
  const fresh = typeof at === "number" && Number.isFinite(at) && at > 0 && now >= at && now - at <= 15;
  const missing = fresh && permissions?.state === "required" && Array.isArray(permissions.missing)
    ? permissions.missing.filter((p) => p === "screenRecording" || p === "accessibility") : [];
  const mac = registration?.mechanism === "SMAppService.agent";
  return {
    registration: registration?.approvalRequired === true || registration?.state === "requiresApproval" ? COPY.approval
      : registration?.installed === true ? COPY.registered
        : registration?.installed === false && registration?.state !== "notFound" ? COPY.unregistered : COPY.registrationUnknown,
    responding: status?.running === true ? COPY.responding : COPY.notResponding,
    mac, missing, checkedAt: fresh ? at : undefined,
    permission: fresh && permissions?.state === "granted" ? COPY.permissionsGranted : COPY.permissionsUnknown,
    bootFallback: registration?.mechanism === "task-scheduler" && registration.installed === true && registration.bootTrigger === false,
  };
}

export function rdActivationView(value: unknown) {
  const snapshot = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const state = snapshot.activation && typeof snapshot.activation === "object" ? snapshot.activation as Record<string, unknown> : {};
  return {
    signing: state.signing === "configured" ? ACT.signingConfigured : state.signing === "notSupported" ? ACT.unsupported : ACT.signingRequired,
    elevation: state.elevation === "ready" && state.signing === "configured" ? ACT.elevationReady
      : state.elevation === "requiresApproval" ? ACT.approvalRequired : state.elevation === "notSupported" ? ACT.unsupported : ACT.elevationUnavailable,
    owner: state.owner === "approved" && state.elevation === "ready" && state.signing === "configured" ? ACT.ownerApproved : ACT.ownerUnknown,
    error: typeof state.error === "string" && state.error.length > 0 ? ACT.operationFailed : null,
  };
}

export function rdCapabilityView(value: unknown) {
  const snapshot = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rows = Array.isArray(snapshot.capabilities) ? snapshot.capabilities : [];
  const plan = snapshot.installPlan && typeof snapshot.installPlan === "object"
    ? snapshot.installPlan as Record<string, unknown> : {};
  const reason = (key: unknown) => typeof key === "string" && Object.hasOwn(LOGIN, key)
    ? LOGIN[key as keyof typeof LOGIN] : LOGIN.deviceVerificationRequired;
  return {
    message: plan.state === "integrationRequired" ? reason(plan.message)
      : plan.state === "notSupported" ? LOGIN.platformNotSupported : null,
    rows: (["loggedIn", "locked", "loggedOut", "preBoot"] as const).map((state) => {
      // Duplicate or malformed rows are not evidence. A loaded job and online heartbeat
      // do not verify screen capture or input; only the native capability proof does.
      const candidates = rows.filter((row) => row && typeof row === "object" && row.state === state);
      const row = candidates.length === 1 ? candidates[0] as Record<string, unknown> : {};
      const verified = snapshot.helperVerified === true && row.verified === true;
      const capability = (field: string) => state === "preBoot" || row[field] === "unavailable"
        ? LOGIN.unavailable : verified && row[field] === "available" ? LOGIN.available : LOGIN.unverified;
      return { state, label: LOGIN[state], presence: capability("presence"), capture: capability("capture"), input: capability("input"),
        reason: state === "preBoot" ? LOGIN.osNotRunning : reason(row.reason) };
    }),
  };
}

export function RdServiceStatus() {
  let locale = normalizeLocale("en");
  try { locale = normalizeLocale(useLocale()); } catch { /* Standalone native settings use English until locale context is ready. */ }
  // Local lookup also keeps the component translated before the parent merges the registry.
  const tt = (source: string, time?: string) => (RDLOGIN_ACT_MESSAGES[locale][source] ?? RDLOGIN_MESSAGES[locale][source] ?? RD_SERVICE_STATUS_MESSAGES[locale][source] ?? RDLOGIN_MESSAGES.en[source] ?? RD_SERVICE_STATUS_MESSAGES.en[source] ?? source)
    .replace("{time}", time ?? "");
  const [status, setStatus] = useState<Status | null>(null);
  const [capabilities, setCapabilities] = useState<unknown>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const port = rdServicePort(globalThis);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        if (!port) throw new Error("native_status_unavailable");
        const [service, secure] = await Promise.allSettled([port.status(), port.capabilities()]);
        if (active) {
          setStatus(service.status === "fulfilled" ? service.value : null);
          setFailed(service.status === "rejected");
          setCapabilities(secure.status === "fulfilled" ? secure.value : null);
        }
      } catch {
        if (active) { setStatus(null); setCapabilities(null); setFailed(true); }
      } finally {
        if (active) { setLoading(false); timer = setTimeout(refresh, 5000); }
      }
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [revision]);
  const view = rdServiceView(status);
  const capability = rdCapabilityView(capabilities);
  const activation = rdActivationView(capabilities);
  const openSettings = async (pane: Pane) => {
    setSettingsFailed(false);
    try {
      const port = rdServicePort(globalThis);
      if (!port) throw new Error("native_status_unavailable");
      await port.settings(pane);
    } catch { setSettingsFailed(true); }
  };
  const link = (label: string, pane: Pane) => <button type="button" className="text-sm underline" onClick={() => void openSettings(pane)}>{tt(label)}</button>;
  return <section className="space-y-3 border-b border-neutral-200 pb-6" data-rd-service-status>
    <h3 className="text-sm font-medium">{tt(COPY.title)}</h3>
    <div role="status" className="space-y-2 text-sm">
      {loading ? <p>{tt(COPY.checking)}</p> : failed ? <p>{tt(COPY.unavailable)}</p> : <>
        <p>{tt(view.registration)}</p>
        <p>{tt(view.responding)}</p>
        {status?.startupError && <p>{tt(COPY.startupFailed)}</p>}
        {view.mac && <>
          {link(COPY.settings, "background")}
          {view.missing.length === 0 && <p>{tt(view.permission)}</p>}
          {view.missing.includes("screenRecording") && <p>{tt(COPY.screenMissing)} · {link(COPY.screenSettings, "screen")}</p>}
          {view.missing.includes("accessibility") && <p>{tt(COPY.inputMissing)} · {link(COPY.inputSettings, "accessibility")}</p>}
          {view.checkedAt && <p className="text-neutral-500">{tt(COPY.checkedAt, new Date(view.checkedAt * 1000).toLocaleTimeString(locale))}</p>}
        </>}
        {view.bootFallback && <p>{tt(COPY.bootFallback)}</p>}
      </>}
    </div>
    <div className="space-y-2 text-sm text-neutral-500">
      <h4 className="font-medium">{tt(COPY.capabilities)}</h4>
      {capability.message && <p>{tt(capability.message)}</p>}
      <dl className="space-y-3" data-rd-activation>
        <div><dt className="font-medium">{tt(ACT.signing)}</dt><dd>{tt(activation.signing)}</dd></div>
        <div><dt className="font-medium">{tt(ACT.elevation)}</dt><dd>{tt(activation.elevation)}</dd></div>
        <div><dt className="font-medium">{tt(ACT.owner)}</dt><dd>{tt(activation.owner)}</dd></div>
      </dl>
      {activation.error && <p role="alert">{tt(activation.error)}</p>}
      <dl className="space-y-3">
        {capability.rows.map((row) => <div key={row.state} data-rd-state={row.state}>
          <dt className="font-medium">{tt(row.label)}</dt>
          <dd>{tt(LOGIN.presence)}: {tt(row.presence)} · {tt(LOGIN.capture)}: {tt(row.capture)} · {tt(LOGIN.input)}: {tt(row.input)}</dd>
          <dd>{tt(row.reason)}</dd>
        </div>)}
      </dl>
      <p>{tt(COPY.notProof)}</p>
    </div>
    <button type="button" className="text-sm underline" onClick={() => setRevision((v) => v + 1)}>{tt(COPY.retry)}</button>
    {settingsFailed && <p role="alert" className="text-sm text-rose-600">{tt(COPY.settingsFailed)}</p>}
  </section>;
}
