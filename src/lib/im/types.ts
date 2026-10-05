// 站内消息 / 多人同改 / 工作回放的共享数据形状。
// 唯一口径：oceandino docs/work-logs/2026-10/work-chat/01-interfaces.md §5；改这里先改契约。

export type ImConversationKind = "dm" | "group" | "team" | "project" | "talent";
export type ImRole = "owner" | "admin" | "member";
export type ImNotifyLevel = "all" | "mentions" | "none";
export type ImPresence = "online" | "away" | "offline";
export type ImRelation = "self" | "contact" | "teammate" | "project" | "member" | "none";
export type ImSenderKind = "user" | "leo" | "system";
export type ImMessageKind =
  | "text" | "file" | "image" | "video" | "audio" | "voice"
  | "artifact" | "replay" | "system" | "leo";
export type ImEditorKind =
  | "richdoc" | "grid" | "deck" | "image" | "vector" | "chart"
  | "game" | "model3d" | "audio" | "pdf" | "video" | "workflow";

export interface ImProfile {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  relation?: ImRelation;
  presence?: ImPresence;
}

export interface ImMember {
  user_id: string;
  role: ImRole;
  external: boolean;
  joined_at: string;
  profile: ImProfile;
}

export interface ImLastMessage {
  id: string;
  seq: number;
  sender_id: string | null;
  sender_kind: ImSenderKind;
  kind: ImMessageKind;
  preview: string;
  created_at: string;
}

export interface ImConversationSummary {
  id: string;
  kind: ImConversationKind;
  title: string;
  avatar_url: string | null;
  peer: ImProfile | null;
  member_count: number;
  last_message: ImLastMessage | null;
  last_activity_at: string;
  unread_count: number;
  mention_count: number;
  muted: boolean;
  notify_level: ImNotifyLevel;
  org_id: string | null;
  project_id: string | null;
  has_external: boolean;
  my_role: ImRole | null;
  dissolved: boolean;
}

export interface ImConversationDetail extends ImConversationSummary {
  description: string;
  owner_id: string | null;
  join_approval: boolean;
  members_can_add: boolean;
  leo_enabled: boolean;
  members: ImMember[];
  pinned_count: number;
  pending_join_requests: number;
  created_at: string;
}

export interface ImAttachment {
  kind: "image" | "video" | "audio" | "file" | "voice";
  url: string;
  name: string;
  size: number;
  mime: string;
  width?: number;
  height?: number;
  duration_ms?: number;
}

export interface ImCard {
  type: "artifact" | "replay" | "talent_offer";
  id: string;
  title: string;
  subtitle?: string;
  thumb_url?: string | null;
  editor_kind?: ImEditorKind | null;
  open_path?: string | null;
  coedit?: { room_key: string; role: "editor" | "viewer" } | null;
}

export interface ImQuote {
  message_id: string;
  sender_id: string | null;
  preview: string;
  recalled: boolean;
}

export interface ImReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
  user_ids: string[];
}

export interface ImMessage {
  id: string;
  conversation_id: string;
  seq: number;
  sender_id: string | null;
  sender_kind: ImSenderKind;
  kind: ImMessageKind;
  body: string;
  mentions: string[];
  mention_all: boolean;
  mention_leo: boolean;
  quote: ImQuote | null;
  thread_root_id: string | null;
  thread: { reply_count: number; last_reply_at: string | null; participant_ids: string[] } | null;
  attachments: ImAttachment[];
  card: ImCard | null;
  transcript: { status: "pending" | "done" | "failed" | "skipped"; text: string } | null;
  reactions: ImReactionSummary[];
  pinned: boolean;
  edited_at: string | null;
  recalled_at: string | null;
  recalled_by: "sender" | "admin" | null;
  hidden_reason: "moderation" | "blocked" | null;
  leo: { status: "streaming" | "done" | "failed" | "cancelled"; payer: "personal" | "team"; error_code?: string } | null;
  mention_reads: Record<string, boolean> | null;
  client_id: string | null;
  created_at: string;
}

export interface ImContact {
  user_id: string;
  profile: ImProfile;
  source: "invite" | "request" | "team" | "project" | "talent";
  since: string;
}

export interface ImContactRequest {
  id: string;
  from: ImProfile;
  to: ImProfile;
  message: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
}

export interface ImInviteLink {
  code: string;
  kind: "contact" | "group";
  url: string;
  conversation_id: string | null;
  requires_approval: boolean;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string;
}

export interface ImInvitePreview {
  code: string;
  kind: "contact" | "group";
  inviter: ImProfile;
  conversation: { id: string; title: string; avatar_url: string | null; member_count: number } | null;
  requires_approval: boolean;
  already: "contact" | "member" | "pending" | null;
  expired: boolean;
}

export interface ImGroupInvite {
  id: string;
  conversation: { id: string; title: string; avatar_url: string | null; member_count: number };
  inviter: ImProfile;
  created_at: string;
}

export interface ImJoinRequest {
  id: string;
  user: ImProfile;
  message: string;
  via_code: string | null;
  created_at: string;
}

export interface ImSettings {
  presence_invisible: boolean;
  email_reminders: boolean;
  push_enabled: boolean;
  desktop_notifications: boolean;
  sound: boolean;
  show_exact_times_in_replays: boolean;
}

export interface ImSearchHit {
  message: ImMessage;
  conversation: { id: string; title: string; kind: ImConversationKind };
  highlights: Array<[number, number]>;
}

export interface ImUnread {
  total: number;
  mentions: number;
  requests: number;
  by_conversation: Record<string, { unread: number; mentions: number }>;
}

export interface ImPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface ImErrorBody {
  code: string;
  message: string;
}

export type ImEvent =
  | { type: "message.created"; conversation_id: string; message: ImMessage }
  | { type: "message.updated"; conversation_id: string; message: ImMessage }
  | { type: "leo.delta"; conversation_id: string; message_id: string; text: string }
  | { type: "leo.notice"; conversation_id: string; trigger_message_id: string;
      code: "insufficient_balance" | "disabled" | "queued" | "failed" }
  | { type: "reaction.changed"; conversation_id: string; message_id: string; reactions: ImReactionSummary[] }
  | { type: "pin.changed"; conversation_id: string; message_id: string; pinned: boolean }
  | { type: "read.updated"; conversation_id: string; user_id: string; last_read_seq: number }
  | { type: "typing"; conversation_id: string; user_id: string; thread_root_id: string | null }
  | { type: "presence.changed"; user_id: string; presence: ImPresence }
  | { type: "conversation.updated"; conversation: ImConversationSummary }
  | { type: "conversation.removed"; conversation_id: string; reason: "left" | "kicked" | "dissolved" }
  | { type: "member.changed"; conversation_id: string }
  | { type: "contact.request"; request: ImContactRequest }
  | { type: "contact.changed"; user_id: string }
  | { type: "group.invite"; invite: ImGroupInvite }
  | { type: "join.request"; conversation_id: string; request: ImJoinRequest }
  | { type: "unread.changed"; unread: ImUnread }
  | { type: "replay.consent"; replay_id: string; title: string; from: ImProfile };
