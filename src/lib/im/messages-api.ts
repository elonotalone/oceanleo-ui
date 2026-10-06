// 会话里的消息接口（契约 §4.2）。W09 持有；只做请求拼装，不放界面逻辑。
// `createMessagesApi(fetcher)` 让测试注入假的 fetcher；默认实例走 W08 的 `imFetch`（带 token、网关地址）。

import { imFetch } from "./client";
import type {
  ImAttachment,
  ImCard,
  ImConversationDetail,
  ImMessage,
  ImMessageKind,
  ImProfile,
} from "./types";

export type ImFetcher = <T>(
  path: string,
  init?: RequestInit & { json?: unknown },
) => Promise<T>;

export interface MessagePage {
  items: ImMessage[];
  has_more_before: boolean;
  has_more_after: boolean;
  /** 仅私聊：对方已读到的 seq。 */
  peer_last_read_seq?: number;
}

export interface ListMessagesParams {
  before_seq?: number;
  after_seq?: number;
  around_seq?: number;
  limit?: number;
  thread_root_id?: string;
}

export interface SendMessageInput {
  client_id: string;
  kind: Extract<
    ImMessageKind,
    "text" | "file" | "image" | "video" | "audio" | "voice" | "artifact" | "replay"
  >;
  body?: string;
  mentions?: string[];
  mention_all?: boolean;
  mention_leo?: boolean;
  quote_id?: string | null;
  thread_root_id?: string | null;
  attachments?: ImAttachment[];
  card?: ImCard | null;
  leo_payer_org_id?: string | null;
}

export interface UploadInitInput {
  name: string;
  size: number;
  mime: string;
  kind: ImAttachment["kind"];
}

export interface UploadInitResult {
  upload_url: string;
  finalize_token: string;
  /** 已经传完（断点续传命中）时为 true，直接 finalize。 */
  upload_complete?: boolean;
  headers?: Record<string, string>;
  [extra: string]: unknown;
}

export interface CoeditPresence {
  users: Array<{ id: string; name: string; color: string; avatar_url: string | null }>;
}

/** 把 `{a: 1, b: undefined}` 拼成 `?a=1`；空值整个丢掉。 */
export function queryString(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

function listPath(conversationId: string, params: ListMessagesParams): string {
  return (
    `/v1/im/conversations/${encodeURIComponent(conversationId)}/messages` +
    queryString({
      before_seq: params.before_seq,
      after_seq: params.after_seq,
      around_seq: params.around_seq,
      limit: params.limit,
      thread_root_id: params.thread_root_id,
    })
  );
}

export function createMessagesApi(fetcher: ImFetcher) {
  return {
    me(): Promise<{ profile: ImProfile }> {
      return fetcher("/v1/im/me");
    },
    async profiles(ids: string[]): Promise<ImProfile[]> {
      if (ids.length === 0) return [];
      const result = await fetcher<{ items: ImProfile[] }>(
        `/v1/im/profiles${queryString({ ids: ids.slice(0, 100).join(",") })}`,
      );
      return result?.items ?? [];
    },
    getConversation(conversationId: string): Promise<ImConversationDetail> {
      return fetcher(`/v1/im/conversations/${encodeURIComponent(conversationId)}`);
    },
    listMessages(conversationId: string, params: ListMessagesParams = {}): Promise<MessagePage> {
      return fetcher(listPath(conversationId, params));
    },
    sendMessage(conversationId: string, input: SendMessageInput): Promise<ImMessage> {
      return fetcher(`/v1/im/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        json: input,
      });
    },
    editMessage(messageId: string, body: string): Promise<ImMessage> {
      return fetcher(`/v1/im/messages/${encodeURIComponent(messageId)}`, {
        method: "PATCH",
        json: { body },
      });
    },
    recallMessage(messageId: string): Promise<ImMessage> {
      return fetcher(`/v1/im/messages/${encodeURIComponent(messageId)}/recall`, { method: "POST" });
    },
    addReaction(messageId: string, emoji: string): Promise<unknown> {
      return fetcher(`/v1/im/messages/${encodeURIComponent(messageId)}/reactions`, {
        method: "POST",
        json: { emoji },
      });
    },
    removeReaction(messageId: string, emoji: string): Promise<unknown> {
      return fetcher(
        `/v1/im/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
        { method: "DELETE" },
      );
    },
    async listPins(conversationId: string): Promise<ImMessage[]> {
      const result = await fetcher<ImMessage[] | { items: ImMessage[] }>(
        `/v1/im/conversations/${encodeURIComponent(conversationId)}/pins`,
      );
      return Array.isArray(result) ? result : (result?.items ?? []);
    },
    pin(conversationId: string, messageId: string): Promise<unknown> {
      return fetcher(`/v1/im/conversations/${encodeURIComponent(conversationId)}/pins`, {
        method: "POST",
        json: { message_id: messageId },
      });
    },
    unpin(conversationId: string, messageId: string): Promise<unknown> {
      return fetcher(
        `/v1/im/conversations/${encodeURIComponent(conversationId)}/pins/${encodeURIComponent(messageId)}`,
        { method: "DELETE" },
      );
    },
    markRead(conversationId: string, seq: number): Promise<unknown> {
      return fetcher(`/v1/im/conversations/${encodeURIComponent(conversationId)}/read`, {
        method: "POST",
        json: { seq },
      });
    },
    getThread(messageId: string): Promise<{ root: ImMessage; items: ImMessage[] }> {
      return fetcher(`/v1/im/messages/${encodeURIComponent(messageId)}/thread`);
    },
    async listDrafts(): Promise<Array<{ conversation_id: string; thread_root_id: string | null; body: string }>> {
      const result = await fetcher<
        | Array<{ conversation_id: string; thread_root_id: string | null; body: string }>
        | { items: Array<{ conversation_id: string; thread_root_id: string | null; body: string }> }
      >("/v1/im/drafts");
      return Array.isArray(result) ? result : (result?.items ?? []);
    },
    putDraft(conversationId: string, body: string, threadRootId: string | null = null): Promise<unknown> {
      return fetcher(`/v1/im/conversations/${encodeURIComponent(conversationId)}/draft`, {
        method: "PUT",
        json: { body, thread_root_id: threadRootId },
      });
    },
    transcribe(messageId: string): Promise<unknown> {
      return fetcher(`/v1/im/messages/${encodeURIComponent(messageId)}/transcribe`, { method: "POST" });
    },
    uploadInit(input: UploadInitInput): Promise<UploadInitResult> {
      return fetcher("/v1/im/uploads/init", { method: "POST", json: input });
    },
    uploadFinalize(finalizeToken: string, extra: Record<string, unknown> = {}): Promise<ImAttachment> {
      return fetcher("/v1/im/uploads/finalize", {
        method: "POST",
        json: { ...extra, finalize_token: finalizeToken },
      });
    },
    /** 作品卡上的「N 人正在改」（W04 presence）。 */
    coeditPresence(roomKey: string): Promise<CoeditPresence> {
      return fetcher(`/v1/collab/rooms/${encodeURIComponent(roomKey)}/presence`);
    },
  };
}

export type MessagesApi = ReturnType<typeof createMessagesApi>;

export const messagesApi: MessagesApi = createMessagesApi(<T,>(path: string, init?: RequestInit & { json?: unknown }) => imFetch<T>(path, init));
