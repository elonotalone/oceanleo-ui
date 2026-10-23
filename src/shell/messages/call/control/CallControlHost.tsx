"use client";

// 被控方全局宿主（W08 在 MessagesHost 挂一个）：订阅 `call_control_request` / `call_control` / `call` 事件，
// 维护会话仓，按 host-logic 决定这台机器怎么应对一个控制请求：
//  - 不在这通通话里 / 已不待批准 → 不管；
//  - 普通浏览器（没有桌面桥）→ 卡片「请在 OceanLeo 桌面客户端里同意」+「拒绝」（首次带防骗提醒）；
//  - 桌面客户端但共享的不是整屏 → 不调桥，自动拒绝（原因 share_entire_screen）并提示；
//  - 桌面客户端且整屏共享 → 调桥 offer(...)，由本机界面批准/拒绝（批准只走设备凭据，INV-2）。
// 另外：收短提示、过期清理、重连补数据、被控期间我停止共享/离开通话自动停、桥的状态回传。
import { useEffect, useRef, useState } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { useImEvent, useImResync } from "../../realtime/hooks";
import { callActions, useCall } from "../engine";
import { noticeText, type ControlNoticeCode } from "./banner-model";
import { normalizeOfferResult } from "./bridge";
import type { ControlDeclineReason } from "./control-api";
import {
  antiFraudSeen,
  decideControlRequest,
  declineAfterOffer,
  isWholeScreenShare,
  markAntiFraudSeen,
  targetStopReason,
  type ShareSurfaceLite,
} from "./host-logic";
import { CloseIcon, ControlIcon, ShieldIcon } from "./icons";
import { callIsLive, participantName, useControlNotices, useSelfUserId } from "./hooks";
import {
  browserStorage,
  closeControllerLinksOutsideCall,
  controlGatewayOrigin,
  controlNotices,
  controlStore,
  currentBridge,
  declineAsTarget,
  refreshMySessions,
  setControlSelfId,
  stopAsTarget,
} from "./runtime";
import {
  CONTROL_ACCENT,
  CONTROL_ACCENT_BORDER,
  CONTROL_ACCENT_SOFT,
  buttonStyle,
  cardStyle,
  dangerButtonStyle,
  mutedStyle,
  rowStyle,
  titleStyle,
} from "./styles";

interface PendingCard {
  sessionId: string;
  callId: string;
  controllerId: string;
  controllerName: string;
}

export function CallControlHost() {
  const tt = useUI();
  const call = useCall();
  const meId = useSelfUserId(call);
  const notices = useControlNotices();
  const [card, setCard] = useState<PendingCard | null>(null);
  const [showAntiFraud, setShowAntiFraud] = useState(false);

  const callRef = useRef(call);
  const meRef = useRef(meId);
  callRef.current = call;
  meRef.current = meId;

  useEffect(() => {
    setControlSelfId(meId);
  }, [meId]);

  // 自己的共享画面尺寸（判断是不是整屏，供 host-logic 用）。getScreenShareSurface 由 W05 引擎给（§3.9）。
  function myShareSurface(): ShareSurfaceLite | null {
    try {
      return callActions.getScreenShareSurface();
    } catch {
      return null;
    }
  }

  async function handleOffer(input: PendingCard, surface: ShareSurfaceLite): Promise<void> {
    const bridge = currentBridge();
    if (!bridge) return;
    let result: { decision: string; reason: string | null } = { decision: "unsupported", reason: null };
    try {
      const raw = await bridge.offer({
        sessionId: input.sessionId,
        callId: input.callId,
        controllerName: input.controllerName,
        gatewayOrigin: controlGatewayOrigin(),
        shareSurface: {
          width: surface.width,
          height: surface.height,
          displaySurface: surface.displaySurface,
        },
      });
      result = normalizeOfferResult(raw);
    } catch {
      result = { decision: "unsupported", reason: "bridge_error" };
    }
    const reason = declineAfterOffer(result.decision as never);
    if (reason) {
      // 本机侧理应已用设备凭据拒绝；网页再用用户会话补一次，确保控制方马上看到结果。
      await declineAsTarget(input.sessionId, reason);
      if (result.decision === "unsupported") controlNotices.push("host_unsupported", { sessionId: input.sessionId });
    }
  }

  // 新请求进来。
  useImEvent("call_control_request", (event) => {
    const me = meRef.current;
    const current = callRef.current;
    if (!me || event.controller_id === me) return;
    controlStore.addRequest(event);
    const decision = decideControlRequest({
      inThisCall: callIsLive(current) && current.callId === event.call_id,
      pending: true,
      hasBridge: Boolean(currentBridge()),
      surface: myShareSurface(),
    });
    const controllerName = participantName(current, event.controller_id, tt("对方"));
    const common: PendingCard = {
      sessionId: event.session_id,
      callId: event.call_id,
      controllerId: event.controller_id,
      controllerName,
    };
    if (decision.action === "ignore") return;
    if (decision.action === "decline_not_whole_screen") {
      void declineAsTarget(event.session_id, "share_entire_screen" as ControlDeclineReason);
      controlNotices.push("host_need_whole_screen", { sessionId: event.session_id, vars: { controller: controllerName } });
      return;
    }
    if (decision.action === "offer") {
      const surface = myShareSurface();
      if (surface && isWholeScreenShare(surface)) void handleOffer(common, surface);
      return;
    }
    // browser_card：普通浏览器，只能提示去桌面客户端同意。首次带防骗提醒。
    if (!antiFraudSeen(browserStorage())) setShowAntiFraud(true);
    setCard(common);
  });

  // 会话状态推进（active/declined/expired/ended…）：对账 + 卡片关闭。
  useImEvent("call_control", (event) => {
    controlStore.ingest(event.session);
    setCard((prev) => (prev && prev.sessionId === event.session.session_id && event.session.state !== "pending" ? null : prev));
  });

  // 通话事件里带 controls：对账（服务端是权威，补齐漏掉的事件）。
  useImEvent("call", (event) => {
    if (event.call?.call_id) controlStore.reconcileCall(event.call.call_id, event.call.controls ?? []);
    else if (!event.call && callRef.current.callId) controlStore.retainCall(null);
  });

  // 重连后补我这边的会话。
  useImResync(() => {
    void refreshMySessions();
  });

  // 定期清掉过期的待批准请求与卡片。
  useEffect(() => {
    const id = setInterval(() => {
      controlStore.expireOverdue();
      setCard((prev) => (prev && !controlStore.get(prev.sessionId) ? null : prev));
      setCard((prev) => {
        if (!prev) return prev;
        const view = controlStore.get(prev.sessionId);
        return view && view.state !== "pending" ? null : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 被控期间：我停止共享 / 共享改成窗口 / 离开通话 → 立即停。
  useEffect(() => {
    const me = meId;
    if (!me) return;
    const mineActive = controlStore.snapshot().sessions.filter((s) => s.state === "active" && s.target_id === me);
    for (const session of mineActive) {
      const reason = targetStopReason({
        phase: call.phase,
        callId: call.callId,
        sessionCallId: session.call_id,
        screenOn: call.me.screen,
        surface: myShareSurface(),
      });
      if (!reason) continue;
      const code: ControlNoticeCode =
        reason === "share_stopped" ? "host_share_stopped" : reason === "not_whole_screen" ? "host_not_whole_screen" : "host_left_call";
      controlNotices.push(code, { sessionId: session.session_id });
      void stopAsTarget(session.session_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.phase, call.callId, call.me.screen, meId]);

  // 控制方：离开通话（或换到别的通话）立刻关掉旧通话的中继链路，不等服务端对账（D9：收口到底）。
  useEffect(() => {
    closeControllerLinksOutsideCall(callIsLive(call) ? call.callId : null);
  }, [call.phase, call.callId]);

  // 桌面桥主动回传的状态（本机托盘/快捷键停止时）。
  useEffect(() => {
    const bridge = currentBridge();
    if (!bridge) return;
    return bridge.onState((s) => {
      if (s.state === "ended") controlStore.markLocal(s.sessionId, "ended", s.reason ?? "stopped");
    });
  }, []);

  const dismissCard = (reason: ControlDeclineReason) => {
    if (card) void declineAsTarget(card.sessionId, reason);
    setShowAntiFraud(false);
    setCard(null);
  };

  const dismissNotice = (id: number) => controlNotices.dismiss(id);

  return (
    <>
      {card ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={tt("控制请求")}
          data-call-control-host-card
          style={{
            position: "fixed",
            top: 16,
            insetInlineEnd: 16,
            zIndex: 1250, // W07 层级：小窗 1050、放大 1100、菜单 1150、举报 1200；控制请求要压在它们上面
            width: "min(360px, calc(100vw - 32px))",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ ...cardStyle, borderColor: CONTROL_ACCENT_BORDER }}>
            <div style={{ ...rowStyle, alignItems: "flex-start" }}>
              <span style={{ color: CONTROL_ACCENT, display: "inline-flex", flex: "none", marginTop: 1 }}>
                <ControlIcon width={18} height={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={titleStyle}>
                  {tt("{controller} 请求控制你的电脑", { controller: card.controllerName })}
                </p>
                <p style={{ ...mutedStyle, marginTop: 4 }}>{tt("请在 OceanLeo 桌面客户端里同意")}</p>
              </div>
            </div>
            {showAntiFraud ? (
              <div
                data-call-control-anti-fraud
                style={{
                  marginTop: 10,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: CONTROL_ACCENT_SOFT,
                  border: `1px solid ${CONTROL_ACCENT_BORDER}`,
                  display: "flex",
                  gap: 8,
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: CONTROL_ACCENT, flex: "none", display: "inline-flex", marginTop: 1 }}>
                  <ShieldIcon />
                </span>
                <span>{tt("OceanLeo 工作人员绝不会要求控制你的电脑。只在你认识并信任对方时才同意。")}</span>
              </div>
            ) : null}
            <div style={{ ...rowStyle, justifyContent: "flex-end", marginTop: 12 }}>
              {showAntiFraud ? (
                <button
                  type="button"
                  style={buttonStyle}
                  data-call-control-action="ack-anti-fraud"
                  onClick={() => {
                    markAntiFraudSeen(browserStorage());
                    setShowAntiFraud(false);
                  }}
                >
                  {tt("知道了")}
                </button>
              ) : null}
              <button type="button" style={dangerButtonStyle} data-call-control-action="decline" onClick={() => dismissCard("user")}>
                {tt("拒绝")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notices.length > 0 ? (
        <div
          data-call-control-notices
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 16,
            insetInlineEnd: 16,
            zIndex: 1250, // W07 层级：小窗 1050、放大 1100、菜单 1150、举报 1200；控制请求要压在它们上面
            width: "min(360px, calc(100vw - 32px))",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          {notices.map((notice) => (
            <div
              key={notice.id}
              role="status"
              data-call-control-notice={notice.code}
              style={{
                ...cardStyle,
                pointerEvents: "auto",
                borderColor: CONTROL_ACCENT_BORDER,
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
              }}
            >
              <span style={{ color: CONTROL_ACCENT, flex: "none", display: "inline-flex", marginTop: 1 }}>
                <ControlIcon />
              </span>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{noticeText(tt, notice.code, notice.vars)}</span>
              <button
                type="button"
                aria-label={tt("关闭")}
                data-call-control-action="dismiss"
                onClick={() => dismissNotice(notice.id)}
                style={{ ...buttonStyle, minHeight: 22, width: 22, padding: 0, border: 0 }}
              >
                <CloseIcon width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
