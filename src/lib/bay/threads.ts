// Bay 交易会话的接口层（契约 §3.8–3.10、§4.1）：全部走 talent 现有接口 `/v1/talent/threads/...`，
// 举报与拉黑走站内消息现有接口 `/v1/im/reports`、`/v1/im/blocks`（服务端认 `talent:<id>`）。
// 只做请求拼装与形状整理，没有界面逻辑；网络层用 W03 的 `bayGet` / `bayPost` / `bayDelete`。

import { bayDelete, bayGet, bayPost } from "./http";

export const DEAL_CONVERSATION_PREFIX = "talent:";
export const DEAL_BODY_LIMIT = 8000;
export const DEAL_PAGE_SIZE = 50;
export const DEAL_MAX_ATTACHMENTS = 10;
export const DEAL_ATTACHMENT_NAME_LIMIT = 200;
export const DEAL_OFFER_TITLE_LIMIT = 200;
export const DEAL_OFFER_DESCRIPTION_LIMIT = 20_000;
export const DEAL_OFFER_MAX_DAYS = 3650;
export const DEAL_OFFER_MAX_REVISIONS = 100;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export function isDealId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** 交易会话在消息窗里的会话 id：`talent:<threadId>`。 */
export function dealConversationId(threadId: string): string {
  return `${DEAL_CONVERSATION_PREFIX}${threadId}`;
}

// ---- 形状 ---------------------------------------------------------------------

export type DealThreadKind = "service" | "demand" | "contract" | "direct" | "handoff";

export interface DealProfile {
  user_id?: string;
  handle?: string | null;
  display_name?: string;
  avatar_url?: string | null;
  verified_level?: number;
}

export interface DealThread {
  id: string;
  kind: DealThreadKind | string;
  subject_ref: string | null;
  contract_id: string | null;
  title: string;
  last_message_at?: string | null;
  created_at?: string | null;
  unread_count?: number;
  counterparty: DealProfile | null;
  last_message_summary?: string;
}

export type DealAttachmentKind = "image" | "video" | "audio" | "file";

export interface DealAttachment {
  url: string;
  name: string;
  kind: DealAttachmentKind;
  size?: number;
  mime?: string;
}

export interface DealMessage {
  id: string;
  thread_id: string;
  user_id: string | null;
  kind: "text" | "system" | "offer" | string;
  body: string;
  meta?: Record<string, unknown> | null;
  attachments?: Array<Partial<DealAttachment>> | null;
  created_at: string;
  moderation_hidden?: boolean;
}

export type DealOfferState = "pending" | "accepted" | "declined" | "withdrawn" | "expired";

export interface DealOffer {
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
  state: DealOfferState;
  expires_at: string | null;
  contract_id: string | null;
  currency?: string;
  created_at: string;
  updated_at: string;
}

export type DealNextAction = "pay" | "deliver" | "accept" | "review" | null;

/** 契约 §3.9：会话关联合同时，取会话接口带上的合同摘要。 */
export interface DealContractSummary {
  id: string;
  title: string;
  status: string;
  payment_state: string | null;
  total_fen: number;
  currency: string;
  next_action: DealNextAction;
  project_id: string | null;
  im_conversation_id: string | null;
  work: { site_key: string; task_id: string; open_path: string } | null;
}

export interface DealThreadPage {
  thread: DealThread;
  /** 新的在前（与 talent 接口一致）。 */
  messages: DealMessage[];
  offers: DealOffer[];
  contact_hint: boolean;
  contract_summary: DealContractSummary | null;
}

// ---- 形状整理 -------------------------------------------------------------------

function text(value: unknown, limit = 500): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function textOrNull(value: unknown, limit = 500): string | null {
  const out = text(value, limit).trim();
  return out ? out : null;
}

function numberOr(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const NEXT_ACTIONS = new Set(["pay", "deliver", "accept", "review"]);

/** 合同摘要：接口可能放在顶层或 `thread` 里；缺 id 视为没有。字段逐个兜底，不信任形状。 */
export function contractSummaryOf(raw: unknown): DealContractSummary | null {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!root) return null;
  const nested = root.thread && typeof root.thread === "object" ? (root.thread as Record<string, unknown>) : null;
  const candidate = (root.contract_summary ?? nested?.contract_summary ?? (root.id && root.status ? root : null)) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!candidate || typeof candidate !== "object") return null;
  const id = textOrNull(candidate.id, 80);
  if (!id) return null;
  const nextRaw = text(candidate.next_action, 20);
  const workRaw = candidate.work && typeof candidate.work === "object" ? (candidate.work as Record<string, unknown>) : null;
  const work =
    workRaw && textOrNull(workRaw.site_key, 40) && textOrNull(workRaw.open_path, 1024)
      ? {
          site_key: text(workRaw.site_key, 40),
          task_id: text(workRaw.task_id, 80),
          open_path: text(workRaw.open_path, 1024),
        }
      : null;
  return {
    id,
    title: text(candidate.title, 200),
    status: text(candidate.status, 40) || "draft",
    payment_state: textOrNull(candidate.payment_state, 40),
    total_fen: Math.max(0, Math.round(numberOr(candidate.total_fen, 0))),
    currency: text(candidate.currency, 8) || "usd",
    next_action: NEXT_ACTIONS.has(nextRaw) ? (nextRaw as DealNextAction) : null,
    project_id: textOrNull(candidate.project_id, 80),
    im_conversation_id: textOrNull(candidate.im_conversation_id, 200),
    work,
  };
}

export function normalizeThreadPage(raw: unknown): DealThreadPage {
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const threadRaw = (root.thread && typeof root.thread === "object" ? root.thread : {}) as Record<string, unknown>;
  const thread: DealThread = {
    id: text(threadRaw.id, 80),
    kind: text(threadRaw.kind, 20) || "direct",
    subject_ref: textOrNull(threadRaw.subject_ref),
    contract_id: textOrNull(threadRaw.contract_id, 80),
    title: text(threadRaw.title, 200),
    last_message_at: textOrNull(threadRaw.last_message_at, 40),
    created_at: textOrNull(threadRaw.created_at, 40),
    unread_count: numberOr(threadRaw.unread_count, 0),
    counterparty:
      threadRaw.counterparty && typeof threadRaw.counterparty === "object"
        ? (threadRaw.counterparty as DealProfile)
        : null,
  };
  return {
    thread,
    messages: Array.isArray(root.messages) ? (root.messages as DealMessage[]) : [],
    offers: Array.isArray(root.offers) ? (root.offers as DealOffer[]) : [],
    contact_hint: Boolean(root.contact_hint),
    contract_summary: contractSummaryOf(root),
  };
}

/** 附件只认 `https:`；名字与种类按 talent 服务端规则收窄（`voice` 当 `audio`）。 */
export function safeAttachmentUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function dealAttachmentKind(value: unknown): DealAttachmentKind {
  if (value === "image" || value === "video" || value === "audio") return value;
  if (value === "voice") return "audio";
  return "file";
}

export function cleanAttachments(items: ReadonlyArray<Partial<DealAttachment> | null | undefined>): DealAttachment[] {
  const out: DealAttachment[] = [];
  for (const item of items) {
    if (!item) continue;
    const url = safeAttachmentUrl(item.url);
    if (!url) continue;
    out.push({
      url,
      name: (text(item.name, DEAL_ATTACHMENT_NAME_LIMIT).trim() || "file").slice(0, DEAL_ATTACHMENT_NAME_LIMIT),
      kind: dealAttachmentKind(item.kind),
    });
    if (out.length >= DEAL_MAX_ATTACHMENTS) break;
  }
  return out;
}

// ---- 会话 ---------------------------------------------------------------------

const enc = encodeURIComponent;

export async function listDealThreads(limit = 30): Promise<DealThread[]> {
  const n = Math.min(100, Math.max(1, Math.round(limit)));
  const data = await bayGet<{ threads?: unknown }>(`/v1/talent/threads?limit=${n}`);
  const rows = Array.isArray(data?.threads) ? data.threads : [];
  return rows.map((row) => normalizeThreadPage({ thread: row }).thread).filter((row) => isDealId(row.id));
}

export async function fetchDealThread(
  threadId: string,
  options: { before?: string | null; limit?: number; signal?: AbortSignal } = {},
): Promise<DealThreadPage> {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(100, Math.max(1, options.limit ?? DEAL_PAGE_SIZE))));
  if (options.before) params.set("before", options.before);
  const raw = await bayGet<unknown>(`/v1/talent/threads/${enc(threadId)}/messages?${params.toString()}`, {
    signal: options.signal,
  });
  return normalizeThreadPage(raw);
}

export function markDealThreadRead(threadId: string): Promise<{ ok: boolean }> {
  return bayPost(`/v1/talent/threads/${enc(threadId)}/read`);
}

export function sendDealMessage(
  threadId: string,
  body: string,
  attachments: ReadonlyArray<Partial<DealAttachment>> = [],
): Promise<{ message: DealMessage; contact_hint?: boolean }> {
  return bayPost(`/v1/talent/threads/${enc(threadId)}/messages`, {
    body: body.slice(0, DEAL_BODY_LIMIT),
    attachments: cleanAttachments(attachments),
  });
}

// ---- 报价 ---------------------------------------------------------------------

export interface DealOfferInput {
  title: string;
  description?: string;
  priceFen: number;
  deliveryDays: number;
  /** -1 表示不限改稿（与 talent 一致）。 */
  revisions: number;
  serviceId?: string | null;
}

export type DealOfferAction = "accept" | "decline" | "withdraw";

/** 报价表单 → 请求体；越界的数值收进 talent 服务端认的范围，不在客户端另立规则。 */
export function offerBody(input: DealOfferInput): Record<string, unknown> {
  const days = Math.min(DEAL_OFFER_MAX_DAYS, Math.max(1, Math.round(numberOr(input.deliveryDays, 1))));
  const rawRevisions = Math.round(numberOr(input.revisions, 1));
  const revisions = rawRevisions < 0 ? -1 : Math.min(DEAL_OFFER_MAX_REVISIONS, rawRevisions);
  const body: Record<string, unknown> = {
    title: text(input.title, DEAL_OFFER_TITLE_LIMIT).trim(),
    description: text(input.description ?? "", DEAL_OFFER_DESCRIPTION_LIMIT).trim(),
    price_fen: Math.max(0, Math.round(numberOr(input.priceFen, 0))),
    delivery_days: days,
    revisions,
    engagement_kind: "fixed",
  };
  if (input.serviceId) body.service_id = input.serviceId;
  return body;
}

export function createDealOffer(threadId: string, input: DealOfferInput): Promise<{ offer: DealOffer; warning?: boolean }> {
  return bayPost(`/v1/talent/threads/${enc(threadId)}/offers`, offerBody(input));
}

export function actOnDealOffer(
  offerId: string,
  action: DealOfferAction,
): Promise<{ offer: DealOffer; contract_id?: string }> {
  return bayPost(`/v1/talent/offers/${enc(offerId)}/${action}`);
}

export interface DealOfferPermissions {
  accept: boolean;
  decline: boolean;
  withdraw: boolean;
}

/** 与 talent 站一致：收到报价的人能接受 / 拒绝，发出的人能撤回，且只在 pending。 */
export function offerPermissions(
  offer: Pick<DealOffer, "state" | "from_user_id" | "to_user_id">,
  viewerId: string | null,
): DealOfferPermissions {
  const pending = offer.state === "pending";
  const mine = Boolean(viewerId) && offer.from_user_id === viewerId;
  const toMe = Boolean(viewerId) && offer.to_user_id === viewerId;
  return { accept: pending && toMe, decline: pending && toMe, withdraw: pending && mine };
}

/**
 * 谁能发新报价（服务端照旧判，这里只决定显不显示按钮）：服务会话的发布者、需求会话里不是发布者的那一方、
 * 合同会话里的卖家、双方私聊里任意一方；求助会话没有报价（走求助自己的签约）。
 */
export function canSendOffer(
  thread: Pick<DealThread, "kind">,
  role: { isServiceOwner?: boolean; isDemandOwner?: boolean; isContractSeller?: boolean },
): boolean {
  switch (thread.kind) {
    case "service":
      return Boolean(role.isServiceOwner);
    case "demand":
      return role.isDemandOwner === false;
    case "contract":
      return Boolean(role.isContractSeller);
    case "direct":
      return true;
    default:
      return false;
  }
}

// ---- 举报、拉黑 -----------------------------------------------------------------

export type DealReportTargetKind = "message" | "user" | "conversation";
export type DealReportReason = "spam" | "harassment" | "fraud" | "illegal" | "other";

export interface DealReportInput {
  target: { kind: DealReportTargetKind; id: string };
  reason: DealReportReason;
  note?: string;
  alsoBlock?: boolean;
  /** 举报人时在哪个交易会话遇到的（`talent:<threadId>`）。 */
  conversationId?: string | null;
}

export function reportBody(input: DealReportInput): Record<string, unknown> {
  const body: Record<string, unknown> = { target: { kind: input.target.kind, id: input.target.id }, reason: input.reason };
  const note = (input.note ?? "").trim().slice(0, 1000);
  if (note) body.note = note;
  if (input.alsoBlock && input.target.kind !== "conversation") body.also_block = true;
  if (input.conversationId) body.conversation_id = input.conversationId;
  return body;
}

export function reportDeal(input: DealReportInput): Promise<{ case_id: string; blocked?: boolean }> {
  return bayPost("/v1/im/reports", reportBody(input));
}

export async function blockDealUser(userId: string): Promise<void> {
  await bayPost("/v1/im/blocks", { user_id: userId });
}

export async function unblockDealUser(userId: string): Promise<void> {
  await bayDelete(`/v1/im/blocks/${enc(userId)}`);
}

export async function listBlockedUserIds(): Promise<Set<string>> {
  const data = await bayGet<unknown>("/v1/im/blocks");
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)
      ? ((data as { items: unknown[] }).items as unknown[])
      : [];
  const out = new Set<string>();
  for (const row of rows) {
    const id = row && typeof row === "object" ? (row as { user_id?: unknown }).user_id : null;
    if (typeof id === "string" && id) out.add(id);
  }
  return out;
}

// ---- 会话的主题 -----------------------------------------------------------------

/** 会话主题的 id：服务 / 需求会话的 `subject_ref` 是「主题 id:双方 id」，取第一段；合同、求助就是它本身。 */
export function dealSubjectId(thread: Pick<DealThread, "kind" | "subject_ref" | "contract_id">): string | null {
  const ref = (thread.subject_ref || "").trim();
  switch (thread.kind) {
    case "service":
    case "demand": {
      const id = ref.split(":", 1)[0];
      return isDealId(id) ? id : null;
    }
    case "contract": {
      const id = (thread.contract_id || ref).trim();
      return isDealId(id) ? id : null;
    }
    case "handoff":
      return isDealId(ref) ? ref : null;
    default:
      return null;
  }
}

/** 主题信息：判断谁是卖家、头部显示主题名。取不到不报错，交给调用方按「不知道」处理。 */
export interface DealSubjectInfo {
  kind: "service" | "demand" | "contract" | "handoff" | "direct";
  id: string | null;
  title: string;
  ownerId: string | null;
  /** 需求详情的 `is_owner`（以查看者为准）；没有就是 null。 */
  viewerIsOwner: boolean | null;
  /** 合同详情的 `my_role`；没有就是 null。 */
  viewerRole: "buyer" | "seller" | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export async function fetchDealSubjectInfo(
  thread: Pick<DealThread, "kind" | "subject_ref" | "contract_id" | "title">,
): Promise<DealSubjectInfo> {
  const id = dealSubjectId(thread);
  const kind = (["service", "demand", "contract", "handoff"].includes(thread.kind) ? thread.kind : "direct") as DealSubjectInfo["kind"];
  const base: DealSubjectInfo = { kind, id, title: thread.title || "", ownerId: null, viewerIsOwner: null, viewerRole: null };
  if (!id) return base;
  try {
    if (kind === "service") {
      const row = record((await bayGet<{ service?: unknown }>(`/v1/talent/services/${enc(id)}`, { anonymous: true }))?.service);
      return { ...base, title: text(row?.title, 200) || base.title, ownerId: ownerIdOf(row, "seller") };
    }
    if (kind === "demand") {
      const row = record((await bayGet<{ demand?: unknown }>(`/v1/talent/demands/${enc(id)}`, { anonymous: true }))?.demand);
      return {
        ...base,
        title: text(row?.title, 200) || base.title,
        ownerId: ownerIdOf(row, "buyer", "author"),
        viewerIsOwner: typeof row?.is_owner === "boolean" ? row.is_owner : null,
      };
    }
    if (kind === "contract") {
      const row = record((await bayGet<{ contract?: unknown }>(`/v1/talent/contracts/${enc(id)}`))?.contract);
      const role = row?.my_role === "buyer" || row?.my_role === "seller" ? row.my_role : null;
      return { ...base, title: text(row?.title, 200) || base.title, viewerRole: role };
    }
  } catch {
    return base;
  }
  return base;
}

// ---- 按主题找或建会话 -------------------------------------------------------------

export interface DealSubject {
  kind: "service" | "demand" | "direct" | "handoff" | "contract";
  subjectRef?: string;
  userId?: string;
}

export class DealSubjectError extends Error {
  code: "invalid" | "no_thread";

  constructor(code: "invalid" | "no_thread", message: string) {
    super(message);
    this.name = "DealSubjectError";
    this.code = code;
  }
}

function ownerIdOf(row: unknown, ...keys: string[]): string | null {
  const obj = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
  if (!obj) return null;
  const direct = obj.user_id;
  if (typeof direct === "string" && direct) return direct;
  for (const key of keys) {
    const nested = obj[key];
    const id = nested && typeof nested === "object" ? (nested as { user_id?: unknown }).user_id : null;
    if (typeof id === "string" && id) return id;
  }
  return null;
}

/**
 * 主题 → 会话 id。合同：合同详情接口会确保合同会话并给出 `thread_id`；求助：接单后求助上带 `thread_id`；
 * 服务 / 需求 / 私聊：`POST /v1/talent/threads` 复用或新建（对方没传就从详情里取发布者）。
 */
export async function findOrCreateDealThread(subject: DealSubject): Promise<string> {
  const ref = (subject.subjectRef ?? "").trim();
  if (subject.kind === "contract") {
    if (!isDealId(ref)) throw new DealSubjectError("invalid", "缺少合同");
    const data = await bayGet<{ contract?: { thread_id?: unknown } }>(`/v1/talent/contracts/${enc(ref)}`);
    const id = data?.contract?.thread_id;
    if (!isDealId(id)) throw new DealSubjectError("no_thread", "这笔订单还没有会话");
    return id;
  }
  if (subject.kind === "handoff") {
    if (!isDealId(ref)) throw new DealSubjectError("invalid", "缺少求助");
    const data = await bayGet<{ handoff?: { thread_id?: unknown } }>(`/v1/talent/handoffs/${enc(ref)}`);
    const id = data?.handoff?.thread_id;
    if (!isDealId(id)) throw new DealSubjectError("no_thread", "这条求助还没有人接，暂时没有会话");
    return id;
  }
  if (subject.kind !== "direct" && !isDealId(ref)) throw new DealSubjectError("invalid", "缺少会话主题");
  let other = (subject.userId ?? "").trim();
  if (!other && subject.kind === "service") {
    const data = await bayGet<{ service?: unknown }>(`/v1/talent/services/${enc(ref)}`, { anonymous: true });
    other = ownerIdOf(data?.service, "seller", "profile") ?? "";
  } else if (!other && subject.kind === "demand") {
    const data = await bayGet<{ demand?: unknown }>(`/v1/talent/demands/${enc(ref)}`, { anonymous: true });
    other = ownerIdOf(data?.demand, "buyer", "author") ?? "";
  }
  if (!other) throw new DealSubjectError("invalid", "缺少对方用户");
  const body: Record<string, unknown> = { kind: subject.kind, counterparty_user_id: other };
  if (subject.kind !== "direct") body.subject_ref = ref;
  const data = await bayPost<{ thread?: { id?: unknown } }>("/v1/talent/threads", body);
  const id = data?.thread?.id;
  if (!isDealId(id)) throw new DealSubjectError("no_thread", "会话创建失败，请稍后重试");
  return id;
}
