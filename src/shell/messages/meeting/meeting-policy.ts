import type { ImMeetingSnapshot } from "../../../lib/im/types";

export interface MeetingWallet {
  balance: number;
}

export function canJoinMeeting(input: {
  snapshot: ImMeetingSnapshot | null;
  wallet: MeetingWallet | null;
  online: boolean;
  busy: boolean;
  connected: boolean;
}): boolean {
  const { snapshot, wallet, online, busy, connected } = input;
  return Boolean(
    snapshot?.meeting?.status === "active" &&
    snapshot.artc_configured &&
    snapshot.metering_status === "ready" &&
    wallet && Number.isFinite(wallet.balance) && wallet.balance > 0 &&
    online && !busy && !connected,
  );
}

/** Backend ARTC identity is the participant UUID without hyphens. */
export function sdkUserIdForParticipant(participantId: string): string {
  return participantId.replaceAll("-", "");
}

export function meetingAvailabilityMessage(snapshot: ImMeetingSnapshot | null): string {
  if (!snapshot) return "正在读取会议状态…";
  if (!snapshot.artc_configured) return "本版 ARTC 尚未开通或配置。";
  if (snapshot.metering_status !== "ready") {
    return snapshot.metering_reason || "计费核验尚不可用，暂时不能加入会议。";
  }
  return "计费核验已就绪。费用按本人实际接收的媒体资源计入本人余额。";
}
