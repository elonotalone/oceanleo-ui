"use client";

// 参与者菜单里的「请求控制电脑」（W07 的 CallParticipantMenu 挂它，props 只有 participantId）。
// 对方正在共享屏幕时出现；点了 = 向网关发请求，随后显示「等待对方在桌面客户端同意…（可取消）」，90 秒超时。
// 对方是否共享的是「整个屏幕」由对方桌面端判断（不是整屏会自动拒绝并告诉我原因）。
import { useState } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { noticeText, secondsLeft, type ControlNoticeCode } from "./banner-model";
import { useCallSnapshot, useControlSnapshot, useNow, useSelfUserId } from "./hooks";
import { ControlIcon, StopIcon } from "./icons";
import { controlMenuModel } from "./menu-model";
import { cancelControlRequest, controlNotices, requestControl, stopAsController } from "./runtime";
import { CONTROL_ACCENT } from "./styles";

export interface ControlRequestMenuItemProps {
  participantId: string;
}

const itemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "8px 12px",
  border: 0,
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontSize: 13,
  textAlign: "start" as const,
  cursor: "pointer",
  borderRadius: 8,
};

export function ControlRequestMenuItem({ participantId }: ControlRequestMenuItemProps) {
  const tt = useUI();
  const call = useCallSnapshot();
  const store = useControlSnapshot();
  const meId = useSelfUserId(call);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ControlNoticeCode | null>(null);
  const hasWaiting = store.sessions.some((s) => s.state === "pending" && s.controller_id === meId);
  const now = useNow(hasWaiting);
  const model = controlMenuModel({
    phase: call.phase,
    callId: call.callId,
    screenSharerId: call.screenSharerId,
    participants: call.participants,
    sessions: store.sessions,
    meId,
    participantId,
    now,
  });
  if (model.kind === "hidden") return null;

  if (model.kind === "controlling") {
    return (
      <button
        type="button"
        role="menuitem"
        style={{ ...itemStyle, color: CONTROL_ACCENT, fontWeight: 600 }}
        data-call-control-menu="controlling"
        onClick={() => void stopAsController(model.sessionId)}
      >
        <StopIcon />
        <span>{tt("停止控制")}</span>
      </button>
    );
  }

  if (model.kind === "waiting") {
    const seconds = secondsLeft(model.deadlineMs, now);
    return (
      <button
        type="button"
        role="menuitem"
        style={itemStyle}
        data-call-control-menu="waiting"
        aria-label={tt("取消控制请求")}
        onClick={() => void cancelControlRequest(model.sessionId)}
      >
        <ControlIcon />
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span>{tt("取消控制请求")}</span>
          <span style={{ fontSize: 11, color: "var(--muted, #78716c)" }}>
            {tt("等待对方在桌面客户端同意…")}
            {seconds > 0 ? ` ${tt("{seconds} 秒", { seconds })}` : ""}
          </span>
        </span>
      </button>
    );
  }

  if (model.kind === "busy") {
    return (
      <button
        type="button"
        role="menuitem"
        style={{ ...itemStyle, cursor: "not-allowed", opacity: 0.55 }}
        data-call-control-menu="busy"
        aria-disabled
        disabled
      >
        <ControlIcon />
        <span>{tt("对方正被其他人控制，或已有一个待处理的请求")}</span>
      </button>
    );
  }

  const onRequest = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await requestControl(model.callId, model.targetUserId);
    setBusy(false);
    if (!result.ok) {
      setError(result.notice);
      controlNotices.push(result.notice);
    }
  };

  return (
    <button
      type="button"
      role="menuitem"
      style={{ ...itemStyle, opacity: busy ? 0.6 : 1 }}
      data-call-control-menu="request"
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={() => void onRequest()}
    >
      <ControlIcon />
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span>{tt("请求控制电脑")}</span>
        {error ? (
          <span role="alert" style={{ fontSize: 11, color: CONTROL_ACCENT }}>
            {noticeText(tt, error)}
          </span>
        ) : null}
      </span>
    </button>
  );
}
