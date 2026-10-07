// 交易会话（talent）接口层：收发走 talent 现有接口 `/v1/talent/threads/...`，规则一条不改（契约 §4.7、§9.10）。
// 同一套规则由服务端校验：报价只在双方会话、合同与付款等交易动作按 talent 原规则。
// 本文件只做请求拼装、talent 消息行 → `ImMessage` 的映射（与后端 `app/im/talent_bridge.py` 同一口径）、
// 以及交易会话在 Bay 里的地址；没有界面逻辑。

import { currentDomainFamily } from "../../../contracts/domain-family";
import { imFetch } from "../../../lib/im/client";
import type { ImAttachment, ImCard, ImMessage, ImMessageKind, ImProfile } from "../../../lib/im/types";

export type TalentFetcher = <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>;

export const TALENT_CONVERSATION_PREFIX = "talent:";
export const TALENT_BODY_LIMIT = 8000;
export const TALENT_PAGE_SIZE = 50;

/** 站内会话 id `talent:<thread_id>` → thread_id；不是交易会话返回 null。 */
export function parseTalentConversationId(conversationId: string): string | null {
  const raw = (conversationId || "").trim();
  if (!raw.startsWith(TALENT_CONVERSATION_PREFIX)) return null;
  const id = raw.slice(TALENT_CONVERSATION_PREFIX.length).trim();
  return id && /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : null;
}

export function talentConversationId(threadId: string): string {
  return `${TALENT_CONVERSATION_PREFIX}${threadId}`;
}

// ---- talent 原始形状（只列用到的字段） --------------------------------------------

export interface TalentAttachmentRow {
  url?: string;
  name?: string;
  kind?: string;
  size?: number;
  mime?: string;
}

export interface TalentMessageRow {
  id: string;
  thread_id: string;
  user_id: string | null;
  kind: "text" | "system" | "offer" | string;
  body: string;
  meta?: Record<string, unknown> | null;
  attachments?: TalentAttachmentRow[] | null;
  created_at: string;
  moderation_hidden?: boolean;
}

export type TalentOfferState = "pending" | "accepted" | "declined" | "withdrawn" | "expired";

export interface TalentOffer {
  id: string;
  thread_id: string;
  from_user_id: string;
  to_user_id: string;
  title: string;
  description: string;
  price_fen: number;
  delivery_days: number;
  revisions: number;
  engagement_kind: string;
  service_id: string | null;
  state: TalentOfferState;
  expires_at: string | null;
  contract_id: string | null;
  currency?: string;
  created_at: string;
  updated_at: string;
}

export interface TalentThreadInfo {
  id: string;
  kind: string;
  subject_ref: string | null;
  contract_id: string | null;
  title: string;
  counterparty: { user_id?: string; display_name?: string; avatar_url?: string | null } | null;
}

export interface TalentThreadPage {
  thread: TalentThreadInfo;
  /** 新的在前，和 talent 站一致。 */
  messages: TalentMessageRow[];
  offers: TalentOffer[];
  contact_hint: boolean;
}

// ---- 请求 -------------------------------------------------------------------

export function fetchTalentThread(
  threadId: string,
  options: { before?: string | null; limit?: number } = {},
  fetcher: TalentFetcher = imFetch,
): Promise<TalentThreadPage> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? TALENT_PAGE_SIZE));
  if (options.before) params.set("before", options.before);
  return fetcher<TalentThreadPage>(`/v1/talent/threads/${encodeURIComponent(threadId)}/messages?${params.toString()}`);
}

export function sendTalentMessage(
  threadId: string,
  body: string,
  fetcher: TalentFetcher = imFetch,
): Promise<{ message: TalentMessageRow; contact_hint?: boolean }> {
  return fetcher(`/v1/talent/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    json: { body: body.slice(0, TALENT_BODY_LIMIT), attachments: [] },
  });
}

export function markTalentThreadRead(threadId: string, fetcher: TalentFetcher = imFetch): Promise<{ ok: boolean }> {
  return fetcher(`/v1/talent/threads/${encodeURIComponent(threadId)}/read`, { method: "POST" });
}

export type TalentOfferAction = "accept" | "decline" | "withdraw";

/** 报价上的按钮：接受 / 拒绝 / 撤回。服务端照旧校验身份、状态、服务条款。 */
export function actOnTalentOffer(
  offerId: string,
  action: TalentOfferAction,
  fetcher: TalentFetcher = imFetch,
): Promise<{ offer: TalentOffer; contract_id?: string }> {
  return fetcher(`/v1/talent/offers/${encodeURIComponent(offerId)}/${action}`, { method: "POST" });
}

// ---- 谁能点哪个按钮 -------------------------------------------------------------

export interface OfferActions {
  accept: boolean;
  decline: boolean;
  withdraw: boolean;
}

/** 与 talent 站 `OfferCard` 相同：只有收到报价的人能接受/拒绝，只有发出的人能撤回，且只在 pending。 */
export function offerActionsFor(offer: Pick<TalentOffer, "state" | "from_user_id" | "to_user_id">, viewerId: string | null): OfferActions {
  const pending = offer.state === "pending";
  const mine = Boolean(viewerId) && offer.from_user_id === viewerId;
  const toMe = Boolean(viewerId) && offer.to_user_id === viewerId;
  return { accept: pending && toMe, decline: pending && toMe, withdraw: pending && mine };
}

// ---- 交易会话在 LeoBay 打开 ---------------------------------------------------------

/** 站内 `/bay?bay=conversation:`；境内没有 Bay，不给链接。 */
export function talentThreadUrl(threadId: string): string | null {
  const id = (threadId || "").trim();
  if (!id || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  try {
    if (currentDomainFamily() === "cn") return null;
  } catch {
    return null;
  }
  return `/bay?bay=conversation:${id}`;
}

// ---- talent 行 → ImMessage ------------------------------------------------------

function parseMs(value: string | undefined | null): number {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** talent 消息没有序号列：用创建时刻毫秒数当序号（与后端一致，只用来排序）。 */
export function talentMessageSeq(row: Pick<TalentMessageRow, "created_at">): number {
  return parseMs(row.created_at);
}

function attachmentKind(value: string | undefined): ImAttachment["kind"] {
  return value === "image" || value === "video" || value === "audio" || value === "voice" ? value : "file";
}

function priceText(fen: number, currency?: string): string {
  const amount = (Number.isFinite(fen) ? fen : 0) / 100;
  const text = amount.toFixed(2);
  return currency ? `${text} ${currency}` : text;
}

export function offerCardOf(offer: TalentOffer | undefined, offerId: string, fallbackTitle: string): ImCard {
  const bits: string[] = [];
  if (offer) {
    bits.push(priceText(offer.price_fen, offer.currency));
    if (offer.delivery_days) bits.push(`${offer.delivery_days}d`);
  }
  return {
    type: "talent_offer",
    id: offerId,
    title: offer?.title || fallbackTitle,
    subtitle: bits.join(" · ") || undefined,
    thumb_url: null,
    editor_kind: null,
    open_path: null,
    coedit: null,
  };
}

export function toImMessage(row: TalentMessageRow, offersById: Record<string, TalentOffer> = {}): ImMessage {
  const hidden = Boolean(row.moderation_hidden);
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const attachments: ImAttachment[] = [];
  let card: ImCard | null = null;
  let kind: ImMessageKind = row.kind === "system" ? "system" : "text";
  let body = row.body || "";
  if (hidden) {
    body = "";
    kind = "text";
  } else {
    for (const item of row.attachments || []) {
      if (!item || typeof item.url !== "string" || !item.url) continue;
      attachments.push({
        kind: attachmentKind(item.kind),
        url: item.url,
        name: item.name || "",
        size: Number(item.size) || 0,
        mime: item.mime || "",
      });
    }
    if (row.kind === "offer") {
      const offerId = String((meta as { offer_id?: unknown }).offer_id || "");
      if (offerId) card = offerCardOf(offersById[offerId], offerId, row.body || "");
    }
  }
  return {
    id: row.id,
    conversation_id: talentConversationId(row.thread_id),
    seq: talentMessageSeq(row),
    sender_id: row.user_id || null,
    sender_kind: row.kind === "system" ? "system" : "user",
    kind,
    body,
    mentions: [],
    mention_all: false,
    mention_leo: false,
    quote: null,
    thread_root_id: null,
    thread: null,
    attachments,
    card,
    transcript: null,
    reactions: [],
    pinned: false,
    edited_at: null,
    recalled_at: null,
    recalled_by: null,
    hidden_reason: hidden ? "moderation" : null,
    leo: null,
    mention_reads: null,
    client_id: null,
    created_at: row.created_at,
  };
}

/** 一页（新的在前）→ 按时间升序的 ImMessage 列表。 */
export function pageToMessages(page: Pick<TalentThreadPage, "messages" | "offers">): ImMessage[] {
  const offersById: Record<string, TalentOffer> = {};
  for (const offer of page.offers || []) offersById[offer.id] = offer;
  return [...(page.messages || [])]
    .sort((a, b) => talentMessageSeq(a) - talentMessageSeq(b) || (a.id < b.id ? -1 : 1))
    .map((row) => toImMessage(row, offersById));
}

/** 事件里推来的消息并进已有列表：按 id 去重，保持升序；已有的用新的替换（审核隐藏会 updated）。 */
export function mergeMessages(current: ImMessage[], incoming: ImMessage[]): ImMessage[] {
  const byId = new Map<string, ImMessage>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.seq - b.seq || (a.id < b.id ? -1 : 1));
}

export function counterpartyProfile(info: TalentThreadInfo | null | undefined): ImProfile | null {
  const c = info?.counterparty;
  if (!c || !c.user_id) return null;
  return { user_id: c.user_id, display_name: c.display_name || "", avatar_url: c.avatar_url ?? null };
}
