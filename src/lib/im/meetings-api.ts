// Meeting lifecycle adapter. Provider credentials only arrive from authenticated join.
import { imFetch } from "./client";
import type { ImMeeting, ImMeetingBill, ImMeetingInvitation, ImMeetingJoinCredentials, ImMeetingSnapshot } from "./types";

const conversationMeetingPath = (conversationId: string) =>
  `/v1/im/conversations/${encodeURIComponent(conversationId)}/meeting`;
const meetingPath = (meetingId: string) => `/v1/im/meetings/${encodeURIComponent(meetingId)}`;

export function normalizeMeetingBillResponse<T extends { ok: boolean; bill?: ImMeetingBill; billing?: ImMeetingBill }>(response: T): T & { billing?: ImMeetingBill } {
  return { ...response, billing: response.bill ?? response.billing };
}

export const meetingsApi = {
  get(conversationId: string): Promise<ImMeetingSnapshot> {
    return imFetch<ImMeetingSnapshot>(conversationMeetingPath(conversationId));
  },
  create(conversationId: string): Promise<ImMeeting> {
    return imFetch<{ meeting: ImMeeting }>(conversationMeetingPath(conversationId), { method: "POST" }).then((r) => r.meeting);
  },
  join(meetingId: string): Promise<ImMeetingJoinCredentials> {
    return imFetch<ImMeetingJoinCredentials>(`${meetingPath(meetingId)}/join`, { method: "POST" });
  },
  bill(meetingId: string): Promise<ImMeetingBill> {
    return imFetch<ImMeetingBill>(`${meetingPath(meetingId)}/bill`);
  },
  invitations(meetingId: string): Promise<ImMeetingInvitation[]> {
    return imFetch<{ invitations: ImMeetingInvitation[] }>(`${meetingPath(meetingId)}/invitations`).then((r) => r.invitations);
  },
  invite(meetingId: string, recipientIds: string[]): Promise<{ meeting: ImMeeting; invitations: ImMeetingInvitation[] }> {
    return imFetch<{ meeting: ImMeeting; invitations: ImMeetingInvitation[] }>(`${meetingPath(meetingId)}/invitations`, {
      method: "POST", json: { recipient_ids: recipientIds },
    });
  },
  acceptInvitation(meetingId: string, invitationId: string): Promise<{ invitation: ImMeetingInvitation; meeting: ImMeeting }> {
    return imFetch<{ invitation: ImMeetingInvitation; meeting: ImMeeting }>(`${meetingPath(meetingId)}/invitations/${encodeURIComponent(invitationId)}/accept`, { method: "POST" });
  },
  rejectInvitation(meetingId: string, invitationId: string): Promise<{ invitation: ImMeetingInvitation; meeting: ImMeeting }> {
    return imFetch<{ invitation: ImMeetingInvitation; meeting: ImMeeting }>(`${meetingPath(meetingId)}/invitations/${encodeURIComponent(invitationId)}/reject`, { method: "POST" });
  },
  leave(meetingId: string): Promise<{ ok: boolean; billing?: ImMeetingBill }> {
    return imFetch<{ ok: boolean; bill?: ImMeetingBill; billing?: ImMeetingBill }>(`${meetingPath(meetingId)}/leave`, { method: "POST" }).then(normalizeMeetingBillResponse);
  },
  end(meetingId: string): Promise<{ ok: boolean; billing?: ImMeetingBill }> {
    return imFetch<{ ok: boolean; bill?: ImMeetingBill; billing?: ImMeetingBill }>(`${meetingPath(meetingId)}/end`, { method: "POST" }).then(normalizeMeetingBillResponse);
  },
  remove(meetingId: string, participantId: string): Promise<void> {
    return imFetch<void>(`${meetingPath(meetingId)}/participants/${encodeURIComponent(participantId)}`, { method: "DELETE" });
  },
};
