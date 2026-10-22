// 旧「会话会议」只剩这一处：与 Leo 实时通话的互斥（`RealtimeCallHost.tsx` 从这里取）。
// 实现已迁到通话引擎（calls-v2 合同 §3.9 `engine/mutex.ts`），这里只再导出，状态只有一份。
// openMeeting / closeMeeting / useMeetingHostRequest / createMeetingInvitationHandler 已随旧会议面板删除（A20）。
export { activeCallOwner, claimCall, releaseCall } from "../call/engine/mutex";
