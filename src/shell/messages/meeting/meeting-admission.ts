export interface MeetingAdmissionCredentials {
  meeting: { meeting_id: string };
}

export async function admitMeetingClient<TCredentials extends MeetingAdmissionCredentials, TClient>(options: {
  join: () => Promise<TCredentials>;
  createClient: (credentials: TCredentials) => Promise<TClient>;
  isCurrent: () => boolean;
  leave: (meetingId: string) => Promise<unknown>;
  destroy: (client: TClient) => Promise<unknown>;
}): Promise<{ credentials: TCredentials; client: TClient } | null> {
  let meetingId: string | null = null;
  let client: TClient | null = null;
  try {
    const credentials = await options.join();
    meetingId = credentials.meeting.meeting_id;
    if (!options.isCurrent()) {
      await options.leave(meetingId).catch(() => undefined);
      return null;
    }
    client = await options.createClient(credentials);
    if (!options.isCurrent()) {
      await options.destroy(client).catch(() => undefined);
      await options.leave(meetingId).catch(() => undefined);
      return null;
    }
    return { credentials, client };
  } catch (error) {
    if (client !== null) await options.destroy(client).catch(() => undefined);
    if (meetingId) await options.leave(meetingId).catch(() => undefined);
    throw error;
  }
}
