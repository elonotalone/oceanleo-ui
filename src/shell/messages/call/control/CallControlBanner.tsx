"use client";

// 「张三正在控制李四的电脑」提示条（W07 挂在小窗/放大视图里）。所有参会者都看得到进行中的控制；
// 控制方与被控方各自有停止按钮；我发出的、还在等对方同意的请求也在这里（可取消，90 秒倒计时）。
import { useUI } from "../../../../i18n/ui/useUI";
import { bannerLines, bannerText, secondsLeft, type BannerLine } from "./banner-model";
import { participantName, useCallSnapshot, useControlSnapshot, useNow, useSelfUserId } from "./hooks";
import { ControlIcon, StopIcon } from "./icons";
import { cancelControlRequest, stopAsController, stopAsTarget } from "./runtime";
import {
  CONTROL_ACCENT,
  CONTROL_ACCENT_BORDER,
  CONTROL_ACCENT_SOFT,
  buttonStyle,
  dangerButtonStyle,
  rowStyle,
} from "./styles";

export function CallControlBanner() {
  const tt = useUI();
  const call = useCallSnapshot();
  const store = useControlSnapshot();
  const meId = useSelfUserId(call);
  const hasWaiting = store.sessions.some((s) => s.state === "pending" && s.controller_id === meId);
  const now = useNow(hasWaiting);
  const lines = bannerLines(store.sessions, { callId: call.callId, meId, now });
  if (lines.length === 0) return null;
  const fallback = tt("参会者");
  return (
    <div
      role="status"
      aria-live="polite"
      data-call-control-banner
      style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}
    >
      {lines.map((line) => (
        <BannerRow
          key={`${line.kind}:${line.sessionId}`}
          line={line}
          text={bannerText(tt, line, {
            controller: participantName(call, line.controllerId, fallback),
            target: participantName(call, line.targetId, fallback),
          })}
          seconds={secondsLeft(line.deadlineMs, now)}
        />
      ))}
    </div>
  );
}

function BannerRow({ line, text, seconds }: { line: BannerLine; text: string; seconds: number }) {
  const tt = useUI();
  const active = line.kind === "active";
  return (
    <div
      data-call-control-line={line.kind}
      data-call-control-role={line.role}
      data-call-control-session={line.sessionId}
      style={{
        ...rowStyle,
        padding: "6px 8px 6px 10px",
        borderRadius: 10,
        background: active ? CONTROL_ACCENT_SOFT : "var(--card, rgba(0, 0, 0, 0.04))",
        border: `1px solid ${active ? CONTROL_ACCENT_BORDER : "var(--border, rgba(0, 0, 0, 0.08))"}`,
        color: "var(--fg, #292524)",
        fontSize: 12,
        lineHeight: 1.4,
        minWidth: 0,
      }}
    >
      <span style={{ color: active ? CONTROL_ACCENT : "var(--muted, #78716c)", display: "inline-flex", flex: "none" }}>
        <ControlIcon />
      </span>
      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }} data-call-control-text>
        {text}
        {line.kind === "waiting" && seconds > 0 ? (
          <span style={{ color: "var(--muted, #78716c)", marginInlineStart: 6 }}>
            {tt("{seconds} 秒", { seconds })}
          </span>
        ) : null}
      </span>
      {line.kind === "waiting" ? (
        <button
          type="button"
          style={buttonStyle}
          data-call-control-action="cancel"
          onClick={() => void cancelControlRequest(line.sessionId)}
        >
          {tt("取消")}
        </button>
      ) : line.role === "controller" ? (
        <button
          type="button"
          style={dangerButtonStyle}
          data-call-control-action="stop"
          onClick={() => void stopAsController(line.sessionId)}
        >
          <StopIcon width={12} height={12} />
          {tt("停止控制")}
        </button>
      ) : line.role === "target" ? (
        <button
          type="button"
          style={dangerButtonStyle}
          data-call-control-action="stop"
          aria-label={tt("停止被控制")}
          onClick={() => void stopAsTarget(line.sessionId)}
        >
          <StopIcon width={12} height={12} />
          {tt("停止")}
        </button>
      ) : null}
    </div>
  );
}
