"use client";

import { useCallback, useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { updateDeviceLabel } from "../../../lib/auth/account-identity";
import {
  getSecuritySessions,
  revokeSecuritySession,
  type SecurityApiCode,
  type SecuritySession,
} from "../../../lib/auth/account-security";
import { ConfirmDialog } from "../../../ui";
import { BrowserGlyph } from "./browser-icons";
import {
  displayLocation,
  formatLastActiveLine,
  parseDeviceLabel,
} from "./device-presentation";

export type LoginDevicesPageProps = {
  deviceLabels?: Record<string, string>;
  onDeviceLabelsChange?: (labels: Record<string, string>) => void;
};

function sessionsErrorCopy(code: SecurityApiCode | undefined): string {
  switch (code) {
    case "signed_out":
      return "登录状态失效了，请重新登录。";
    case "offline":
      return "连不上服务器，检查一下网络再试。";
    case "not_available":
      return "这一块还没上线，过些天再来看。";
    case "not_found":
      return "这条记录已经不在了。";
    case "rate_limited":
      return "操作太频繁了，缓一会儿再试。";
    case "server_error":
      return "服务器出了点问题，稍后再试。";
    default:
      return "这一步没有完成，请稍后重试。";
  }
}

export function LoginDevicesPage({
  deviceLabels,
  onDeviceLabelsChange,
}: LoginDevicesPageProps = {}) {
  const tt = useUI();
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [pending, setPending] = useState<SecuritySession | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>(deviceLabels ?? {});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    if (deviceLabels) setLabels(deviceLabels);
  }, [deviceLabels]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getSecuritySessions();
    setLoading(false);
    if (!result.ok || !result.data) {
      setError(tt(sessionsErrorCopy(result.code)));
      return;
    }
    setError("");
    setSessions(result.data);
  }, [tt]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke() {
    if (!pending || pending.current) return;
    const target = pending;
    setPending(null);
    const result = await revokeSecuritySession(target.id);
    if (!result.ok) {
      setError(tt(sessionsErrorCopy(result.code)));
      return;
    }
    setError("");
    setOk(tt("那台设备已经退出。"));
    setSessions((prev) => prev.filter((s) => s.id !== target.id));
  }

  async function saveName(sessionId: string) {
    const next = draftName.trim();
    const result = await updateDeviceLabel(sessionId, next);
    if (result && typeof result === "object" && "error" in result && result.error) {
      setError(tt(String(result.error)));
      return;
    }
    const merged = { ...labels };
    if (next) merged[sessionId] = next;
    else delete merged[sessionId];
    setLabels(merged);
    onDeviceLabelsChange?.(merged);
    setEditingId(null);
    setDraftName("");
  }

  const current = sessions.find((s) => s.current) ?? null;
  const others = sessions.filter((s) => !s.current);

  return (
    <div data-login-devices="" className="space-y-4">
      {pending && (
        <ConfirmDialog
          title="退出这台设备"
          body="这台设备会被立刻退出，下次要重新登录。当前设备不受影响。"
          confirmLabel="退出这台设备"
          danger
          onConfirm={() => void revoke()}
          onCancel={() => setPending(null)}
        />
      )}

      {error ? (
        <div
          data-login-devices-note="error"
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700"
        >
          {error}
        </div>
      ) : null}
      {!error && ok ? (
        <div
          data-login-devices-note="ok"
          role="status"
          className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700"
        >
          {ok}
        </div>
      ) : null}

      {loading && sessions.length === 0 ? (
        <p className="text-[13px] text-neutral-500">{tt("加载中…")}</p>
      ) : null}

      <section data-login-devices-section="current">
        <h2 className="mb-2.5 text-[14px] font-semibold text-neutral-900">{tt("当前设备")}</h2>
        {current ? (
          <DeviceCard
            session={current}
            title={rowTitle(current, labels, tt)}
            isCurrent
            editing={editingId === current.id}
            draftName={draftName}
            onDraftName={setDraftName}
            onStartEdit={() => {
              setEditingId(current.id);
              setDraftName(rowTitle(current, labels, tt));
            }}
            onSave={() => void saveName(current.id)}
            tt={tt}
          />
        ) : !loading ? (
          <p className="text-[13px] text-neutral-500">{tt("未知设备")}</p>
        ) : null}
      </section>

      <section
        data-other-devices=""
        data-login-devices-section="others"
        className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
      >
        <div className="px-4 pb-2.5 pt-3.5">
          <h2 className="text-[14px] font-semibold text-neutral-900">{tt("其他设备")}</h2>
          <p
            data-other-devices-hint=""
            className="mt-0.5 text-[12px] leading-relaxed text-neutral-400"
          >
            {tt("如果无法识别某台设备，请将其移除并更改登录方式。")}
          </p>
        </div>
        <div className="border-t border-neutral-200">
          {others.length === 0 ? (
            <p
              data-other-devices-empty=""
              className="flex min-h-[104px] items-center justify-center px-4 py-8 text-center text-[13px] text-neutral-400"
            >
              {tt("没有其他已登录的设备。")}
            </p>
          ) : (
            <ul>
              {others.map((session) => (
                <li key={session.id} className="border-b border-neutral-100 last:border-b-0">
                  <DeviceCard
                    session={session}
                    title={rowTitle(session, labels, tt)}
                    isCurrent={false}
                    editing={false}
                    draftName=""
                    onDraftName={() => {}}
                    onStartEdit={() => {}}
                    onSave={() => {}}
                    onRemove={() => setPending(session)}
                    nested
                    tt={tt}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default LoginDevicesPage;

function rowTitle(
  session: SecuritySession,
  labels: Record<string, string>,
  tt: (zh: string) => string,
): string {
  const custom = (labels[session.id] || "").trim();
  if (custom) return custom;
  if (session.deviceLabel) return session.deviceLabel;
  return tt("未知设备");
}

function DeviceCard({
  session,
  title,
  isCurrent,
  editing,
  draftName,
  onDraftName,
  onStartEdit,
  onSave,
  onRemove,
  nested,
  tt,
}: {
  session: SecuritySession;
  title: string;
  isCurrent: boolean;
  editing: boolean;
  draftName: string;
  onDraftName: (value: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onRemove?: () => void;
  nested?: boolean;
  tt: (zh: string, vars?: Record<string, string | number>) => string;
}) {
  const parsed = parseDeviceLabel(session.deviceLabel);
  const loc = displayLocation(session.location);
  const lastActive = formatLastActiveLine(session.lastSeenAt, Date.now(), tt);

  return (
    <div
      data-login-device={session.id}
      data-current-device={isCurrent ? "" : undefined}
      className={`flex items-center justify-between gap-3 ${
        nested ? "px-4 py-3" : "rounded-2xl border border-neutral-200 bg-white px-4 py-3.5"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          data-browser-icon={parsed.icon}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white p-1"
          style={{ boxShadow: "0 1px 2px rgba(15,15,15,0.06), 0 0 0 1px rgba(15,15,15,0.08)" }}
        >
          <BrowserGlyph id={parsed.icon} className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          {editing ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onSave();
              }}
            >
              <input
                data-device-label-input=""
                aria-label={tt("设备名称")}
                value={draftName}
                onChange={(e) => onDraftName(e.target.value)}
                className="w-40 rounded-md border border-neutral-200 px-2 py-1 text-[13px] outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                data-device-label-save=""
                className="text-[12px] font-medium text-blue-500"
              >
                {tt("保存名称")}
              </button>
            </form>
          ) : (
            <p className="flex items-center truncate text-[14px] font-medium text-neutral-900">
              <span className="truncate">{title}</span>
              {isCurrent ? (
                <button
                  type="button"
                  data-device-rename={session.id}
                  aria-label={tt("设备名称")}
                  onClick={onStartEdit}
                  className="ml-1.5 shrink-0 text-neutral-300 hover:text-neutral-500"
                >
                  <PencilIcon />
                </button>
              ) : null}
            </p>
          )}
          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-[12px] text-neutral-400">
            {lastActive ? (
              <>
                <ClockIcon />
                <span data-last-active="">{lastActive}</span>
              </>
            ) : null}
            {loc ? (
              <>
                <span data-device-meta-sep="" aria-hidden="true">
                  •
                </span>
                <PinIcon />
                <span data-device-location="">{loc}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>
      {isCurrent ? (
        <span
          data-current-device-pill=""
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#EAF2FF] px-3 py-1.5 text-[13px] font-medium text-[#3B82F6]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" aria-hidden="true" />
          {tt("当前设备")}
        </span>
      ) : (
        <button
          type="button"
          data-login-device-revoke={session.id}
          onClick={onRemove}
          className="shrink-0 text-[13px] text-neutral-500 transition hover:text-red-600"
        >
          {tt("移除")}
        </button>
      )}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v4.2L14.6 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s7-6.8 7-11.4A7 7 0 1 0 5 9.6C5 14.2 12 21 12 21z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.6" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
