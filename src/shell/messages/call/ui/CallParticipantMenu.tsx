"use client";

// 参与者菜单（合同 §3.9 W07 导出）：仅对我静音、举报（走现有举报对话框）、W09 的「请求控制电脑」。
// 没有主持人：菜单里没有「移出」「全员静音」这类管理项（操作员定）。对自己不出菜单。
import { useRef, useState, type RefObject } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { ReportDialog } from "../../report/ReportDialog";
import { ControlRequestMenuItem } from "../control";
import { callActions, useCall } from "../engine";
import { runCallAction } from "./CallControls";
import { CallMenu, CallMenuCheckbox, CallMenuItem, CallMenuSeparator } from "./CallMenu";

export interface CallParticipantMenuProps {
  /** 被操作的参与者（CallParticipantView.participantId）。 */
  participantId: string;
  open: boolean;
  onClose(): void;
  /** 菜单贴着哪个按钮弹出；不给就贴在组件自己放下的一个空锚点上。 */
  anchorRef?: RefObject<HTMLElement | null>;
}

interface ReportTarget {
  userId: string;
  name: string;
  conversationId: string | null;
}

export function CallParticipantMenu({ participantId, open, onClose, anchorRef }: CallParticipantMenuProps) {
  const tt = useUI();
  const call = useCall();
  // 举报对象在点「举报」那一刻定下来：对方中途离开通话，填了一半的举报不会跟着消失。
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const ownAnchorRef = useRef<HTMLSpanElement | null>(null);
  const participant = call.participants.find((item) => item.participantId === participantId) ?? null;

  const dialog = reportTarget ? (
    <ReportDialog
      target={{ kind: "user", id: reportTarget.userId, label: reportTarget.name }}
      conversationId={reportTarget.conversationId}
      onClose={() => {
        setReportTarget(null);
        onClose();
      }}
    />
  ) : null;

  if (!participant || participant.isMe) return dialog;
  const name = participant.displayName;

  return (
    <>
      {anchorRef ? null : <span ref={ownAnchorRef} aria-hidden="true" />}
      <CallMenu
        open={open && !reportTarget}
        anchorRef={anchorRef ?? ownAnchorRef}
        onClose={onClose}
        label={tt("{name} 的更多操作", { name })}
        placement="below"
        width={240}
      >
        <CallMenuCheckbox
          label={tt("仅对我静音")}
          checked={participant.locallyMuted}
          onSelect={() => {
            runCallAction(() => callActions.setLocalMute(participantId, !participant.locallyMuted));
            onClose();
          }}
        />
        <ControlRequestMenuItem participantId={participantId} />
        <CallMenuSeparator />
        <CallMenuItem
          label={tt("举报")}
          danger
          onSelect={() => setReportTarget({ userId: participant.userId, name, conversationId: call.conversationId })}
        />
      </CallMenu>
      {dialog}
    </>
  );
}
