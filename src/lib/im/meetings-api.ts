// Meeting lifecycle adapter. Provider credentials only arrive from authenticated join.
import { imFetch } from "./client";
import type { ImMeeting, ImMeetingJoinCredentials, ImMeetingSnapshot } from "./types";

const conversationMeetingPath = (conversationId: string) =>
  `/v1/im/conversations/${encodeURIComponent(conversationId)}/meeting`;
const meetingPath = (meetingId: string) => `/v1/im/meetings/${encodeURIComponent(meetingId)}`;

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
  leave(meetingId: string): Promise<void> {
    return imFetch<void>(`${meetingPath(meetingId)}/leave`, { method: "POST" });
  },
  end(meetingId: string): Promise<void> {
    return imFetch<void>(`${meetingPath(meetingId)}/end`, { method: "POST" });
  },
  remove(meetingId: string, participantId: string): Promise<void> {
    return imFetch<void>(`${meetingPath(meetingId)}/participants/${encodeURIComponent(participantId)}`, { method: "DELETE" });
  },
};
