// 交易会话里的灰字行（契约 §0 第 13 条、§3.8、§3.10；仲裁 #4）：`talent_messages.kind = "system"` 的 `meta.event`
// → 一句大白话 + 需要时一个动作。会话里实际有两套名字：
//   1. W02 新写的通知事件名（`DEAL_EVENTS`，`app/notifications.py` 的 33 个 key + `contract.moved_to_project`）
//   2. 合同 / 报价 / 求助沿用的旧名字（`contracts.py` `_system_line`、`threads.post_offer_event`、handoffs 公告）
// 双方都会看到同一行，所以文案不写「你」「对方」这类视角词。
// 文案一律直接写成 tt 的字面量参数（覆盖率闸静态扫描）；动作只指向 Bay 内的目标或项目群，没有任何 talent 站链接。
// 认不出的事件：有服务端中文兜底就用兜底（正文里若带 talent 站地址则换成通用灰字）；没有就显示通用灰字。不崩。

import type { UITranslate } from "../../../i18n/ui/useUI";

/** `app/notifications.py` 的 `TALENT_NOTIFICATION_EVENTS` 全部 33 个 key，加签约后的 `contract.moved_to_project`。 */
export const DEAL_EVENTS = [
  "order.new",
  "order.updated",
  "order.started",
  "delivery.submitted",
  "revision.requested",
  "acceptance.completed",
  "acceptance.auto",
  "order.cancelled",
  "dispute.opened",
  "dispute.withdrawn",
  "dispute.assessed",
  "dispute.responded",
  "dispute.escalated",
  "dispute.resolved",
  "proposal.new",
  "proposal.invited",
  "proposal.accepted",
  "proposal.rejected",
  "message.new",
  "quote.new",
  "quote.accepted",
  "review.visible",
  "review.reply",
  "level.changed",
  "handoff.invited",
  "handoff.claimed",
  "handoff.cancelled",
  "vetting.rejected",
  "vetting.credential_expired",
  "payment.failed",
  "payment.held",
  "payment.released",
  "payment.refunded",
  "contract.moved_to_project",
] as const;

export type DealEvent = (typeof DEAL_EVENTS)[number];

/** talent 现有的报价系统行（`threads.post_offer_event`）：`meta.event` 是不带点的三个词。 */
export const OFFER_EVENTS = ["accepted", "declined", "withdrawn"] as const;
export type OfferEvent = (typeof OFFER_EVENTS)[number];

/**
 * 合同旧行（`contracts.py` `_system_line` / `create_contract` 的 created、`consults.py` 的 consult_booked）。
 * 不含同名碰撞的 accepted / cancelled —— 那两个按 meta 里的 id 区分。
 */
export const LEGACY_CONTRACT_EVENTS = [
  "created",
  "ordered",
  "updated",
  "milestone.submitted",
  "milestone.approved",
  "delivered",
  "revision_requested",
  "review_extended",
  "time_recorded",
  "time_disputed",
  "time_withdrawn",
  "completed",
  "disputed",
  "consult_booked",
] as const;

export type LegacyContractEvent = (typeof LEGACY_CONTRACT_EVENTS)[number];

/** 求助旧行（`handoffs.py`）：claimed / context_revoked；续班单写的 revoked 在代码里是 context_revoked。 */
export const LEGACY_HANDOFF_EVENTS = ["claimed", "context_revoked", "revoked"] as const;
export type LegacyHandoffEvent = (typeof LEGACY_HANDOFF_EVENTS)[number];

export const UNKNOWN_DEAL_LINE_TEXT = "交易有了新进展。";

export type DealLineActionKind = "order" | "demand" | "help" | "project" | "settings-profile" | "settings-vetting";

export type DealLineFamily = "notify" | "offer" | "contract" | "handoff" | "unknown";

export interface ClassifiedDealLine {
  family: DealLineFamily;
  /** 用来查文案与动作的稳定键；handoff 的 revoked 归一成 context_revoked。 */
  key: string;
  raw: string | null;
}

/** 每个通知 / 报价事件带哪个动作；null = 不带（会话里本来就看得到，比如新报价卡、新消息）。 */
export const DEAL_LINE_ACTIONS: Record<DealEvent | OfferEvent, DealLineActionKind | null> = {
  "order.new": "order",
  "order.updated": "order",
  "order.started": "order",
  "delivery.submitted": "order",
  "revision.requested": "order",
  "acceptance.completed": "order",
  "acceptance.auto": "order",
  "order.cancelled": "order",
  "dispute.opened": "order",
  "dispute.withdrawn": "order",
  "dispute.assessed": "order",
  "dispute.responded": "order",
  "dispute.escalated": "order",
  "dispute.resolved": "order",
  "proposal.new": "demand",
  "proposal.invited": "demand",
  "proposal.accepted": "demand",
  "proposal.rejected": "demand",
  "message.new": null,
  "quote.new": null,
  "quote.accepted": "order",
  "review.visible": "order",
  "review.reply": "order",
  "level.changed": "settings-profile",
  "handoff.invited": "help",
  "handoff.claimed": "help",
  "handoff.cancelled": "help",
  "vetting.rejected": "settings-vetting",
  "vetting.credential_expired": "settings-vetting",
  "payment.failed": "order",
  "payment.held": "order",
  "payment.released": "order",
  "payment.refunded": "order",
  "contract.moved_to_project": "project",
  accepted: "order",
  declined: null,
  withdrawn: null,
};

const NOTIFY = new Set<string>(DEAL_EVENTS);
const OFFER = new Set<string>(OFFER_EVENTS);
const LEGACY_CONTRACT = new Set<string>(LEGACY_CONTRACT_EVENTS);
const LEGACY_HANDOFF = new Set<string>(LEGACY_HANDOFF_EVENTS);
const KNOWN = new Set<string>([...DEAL_EVENTS, ...OFFER_EVENTS]);

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const CONVERSATION_ID = /^[A-Za-z0-9:_-]{1,200}$/;

function metaId(meta: Record<string, unknown>, key: string, pattern = ID): string | null {
  const value = meta[key];
  return typeof value === "string" && pattern.test(value) ? value : null;
}

export function isKnownDealEvent(event: unknown): event is DealEvent | OfferEvent {
  return typeof event === "string" && KNOWN.has(event);
}

/**
 * 两套事件名 → 同一套文案键。同名不同义：
 * `accepted` 有 offer_id 是报价被接受，否则是合同生效；
 * `cancelled` 有 handoff_id 是求助取消，否则是合同取消。
 */
export function classifyDealLine(event: string | null, meta: Record<string, unknown> = {}): ClassifiedDealLine {
  if (!event) return { family: "unknown", key: "", raw: event };
  if (NOTIFY.has(event)) return { family: "notify", key: event, raw: event };
  if (event === "accepted" && metaId(meta, "offer_id")) return { family: "offer", key: "accepted", raw: event };
  if (event === "declined" || event === "withdrawn") return { family: "offer", key: event, raw: event };
  if (event === "cancelled" && metaId(meta, "handoff_id")) return { family: "handoff", key: "cancelled", raw: event };
  if (event === "accepted") return { family: "contract", key: "accepted", raw: event };
  if (event === "cancelled") return { family: "contract", key: "cancelled", raw: event };
  if (LEGACY_CONTRACT.has(event)) return { family: "contract", key: event, raw: event };
  if (LEGACY_HANDOFF.has(event)) {
    return { family: "handoff", key: event === "revoked" ? "context_revoked" : event, raw: event };
  }
  return { family: "unknown", key: event, raw: event };
}

function notifyOrOfferText(tt: UITranslate, event: string): string | null {
  switch (event) {
    case "order.new":
      return tt("新订单已生成，请核对订单条款。");
    case "order.updated":
      return tt("订单条款有改动，请重新核对并确认。");
    case "order.started":
      return tt("合同已签署生效，可以开始交付。");
    case "delivery.submitted":
      return tt("卖家提交了交付，等买家验收或提出修改。");
    case "revision.requested":
      return tt("买家提出了修改，等卖家更新交付。");
    case "acceptance.completed":
      return tt("买家已验收，订单完成。");
    case "acceptance.auto":
      return tt("验收期限已到，订单已自动验收完成。");
    case "order.cancelled":
      return tt("订单已取消。");
    case "dispute.opened":
      return tt("订单进入争议处理，双方可以补充证据。");
    case "dispute.withdrawn":
      return tt("争议已撤回。");
    case "dispute.assessed":
      return tt("争议有了初步评估，仅供参考，双方仍可请平台裁定。");
    case "dispute.responded":
      return tt("争议收到了答辩，双方的说法都已列出。");
    case "dispute.escalated":
      return tt("争议已交给平台裁定。");
    case "dispute.resolved":
      return tt("平台已给出争议的裁定结果。");
    case "proposal.new":
      return tt("需求收到了一份新方案。");
    case "proposal.invited":
      return tt("需求发布者邀请提交方案。");
    case "proposal.accepted":
      return tt("方案已被选中，接下来确认订单条款。");
    case "proposal.rejected":
      return tt("这次的方案没有被选中。");
    case "message.new":
      return tt("有新消息。");
    case "quote.new":
      return tt("卖家发来了一份新报价。");
    case "quote.accepted":
      return tt("报价已被接受，订单已生成。");
    case "review.visible":
      return tt("双方的评价已公开。");
    case "review.reply":
      return tt("评价收到了回复。");
    case "level.changed":
      return tt("卖家等级已更新。");
    case "handoff.invited":
      return tt("收到一条指名求助。");
    case "handoff.claimed":
      return tt("求助已有人接，接单的人已进入会话。");
    case "handoff.cancelled":
      return tt("求助已取消，之前给出的内容已收回。");
    case "vetting.rejected":
      return tt("这条服务没有通过资质核验，可以查看理由并申诉一次。");
    case "vetting.credential_expired":
      return tt("资质核验已到期，相关服务已转回草稿。");
    case "payment.failed":
      return tt("付款没有成功。");
    case "payment.held":
      return tt("买家已付款，钱由平台托管，可以开工。");
    case "payment.released":
      return tt("托管的钱已打给卖家。");
    case "payment.refunded":
      return tt("托管的钱已退回买家。");
    case "contract.moved_to_project":
      return tt("已签约，之后在项目群里沟通。");
    case "accepted":
      return tt("买家接受了报价，订单已生成。");
    case "declined":
      return tt("买家拒绝了这份报价。");
    case "withdrawn":
      return tt("卖家撤回了这份报价。");
    default:
      return null;
  }
}

function contractLegacyText(tt: UITranslate, key: string): string | null {
  switch (key) {
    case "created":
      return tt("买家发起了一份合同。");
    case "ordered":
      return tt("买家已下单，可以开始交付。");
    case "updated":
      return tt("对方修改了合同条款，请重新确认。");
    case "accepted":
      return tt("合同已签署生效，双方进入交付阶段。");
    case "milestone.submitted":
      return tt("卖家提交了一个里程碑。");
    case "milestone.approved":
      return tt("一个里程碑已通过验收。");
    case "delivered":
      return tt("卖家提交了一轮交付。");
    case "revision_requested":
      return tt("买家提出了改稿。");
    case "review_extended":
      return tt("验收期已延长。");
    case "time_recorded":
      return tt("卖家登记了工时。");
    case "time_disputed":
      return tt("买家对登记的工时提出了异议。");
    case "time_withdrawn":
      return tt("登记的工时已撤回。");
    case "completed":
      return tt("订单已经完成。");
    case "cancelled":
      return tt("合同已取消。");
    case "disputed":
      return tt("订单进入争议处理。");
    case "consult_booked":
      return tt("答疑已预约，交付物就是这段对话。");
    default:
      return null;
  }
}

function handoffLegacyText(tt: UITranslate, key: string): string | null {
  switch (key) {
    case "claimed":
      return tt("求助已有人接，约定内容已交给接单方。");
    case "context_revoked":
      return tt("发起人收回了已交接的内容，接单方即刻起不再可见。");
    case "cancelled":
      return tt("发起人取消了这次求助，交接的内容已全部收回。");
    default:
      return null;
  }
}

/**
 * 一行灰字的文案。没见过的事件返回 null，由调用方退回服务端的中文兜底或通用灰字。
 * 只传事件名（不传 meta）时：`accepted` / `declined` / `withdrawn` 仍按报价旧口径，兼容按事件名取文案的单测。
 */
export function dealLineText(tt: UITranslate, event: string, meta?: Record<string, unknown>): string | null {
  if (meta === undefined) {
    return (
      notifyOrOfferText(tt, event) ??
      contractLegacyText(tt, event) ??
      handoffLegacyText(tt, event === "revoked" ? "context_revoked" : event)
    );
  }
  const classified = classifyDealLine(event, meta);
  if (classified.family === "notify" || classified.family === "offer") {
    return notifyOrOfferText(tt, classified.key);
  }
  if (classified.family === "contract") return contractLegacyText(tt, classified.key);
  if (classified.family === "handoff") return handoffLegacyText(tt, classified.key);
  return null;
}

export function dealActionLabel(tt: UITranslate, kind: DealLineActionKind): string {
  switch (kind) {
    case "order":
      return tt("查看订单");
    case "demand":
      return tt("查看需求");
    case "help":
      return tt("查看求助");
    case "project":
      return tt("打开项目群");
    case "settings-profile":
      return tt("查看卖家资料");
    case "settings-vetting":
      return tt("查看资质核验");
  }
}

function actionKindOf(classified: ClassifiedDealLine): DealLineActionKind | null {
  if (classified.family === "notify" || classified.family === "offer") {
    return DEAL_LINE_ACTIONS[classified.key as DealEvent | OfferEvent] ?? null;
  }
  if (classified.family === "contract") return "order";
  if (classified.family === "handoff") return "help";
  return null;
}

export type DealLineTarget =
  | { kind: "order"; id: string }
  | { kind: "demand"; id: string }
  | { kind: "help"; id: string }
  | { kind: "project"; conversationId: string }
  | { kind: "settings"; pane: "profile" | "vetting" };

export interface ResolvedDealLine {
  event: string | null;
  /** 已翻译的文案；没见过的事件是服务端的中文兜底，再没有就是通用灰字。 */
  text: string;
  action: { kind: DealLineActionKind; label: string; target: DealLineTarget } | null;
}

function targetFor(
  kind: DealLineActionKind,
  meta: Record<string, unknown>,
  fallbackContractId: string | null,
): DealLineTarget | null {
  switch (kind) {
    case "order": {
      const id = metaId(meta, "contract_id") ?? fallbackContractId;
      return id ? { kind: "order", id } : null;
    }
    case "demand": {
      const id = metaId(meta, "demand_id");
      return id ? { kind: "demand", id } : null;
    }
    case "help": {
      const id = metaId(meta, "handoff_id");
      return id ? { kind: "help", id } : null;
    }
    case "project": {
      const id = metaId(meta, "im_conversation_id", CONVERSATION_ID);
      return id && !id.startsWith("talent:") ? { kind: "project", conversationId: id } : null;
    }
    case "settings-profile":
      return { kind: "settings", pane: "profile" };
    case "settings-vetting":
      return { kind: "settings", pane: "vetting" };
  }
}

function looksLikeTalentLink(text: string): boolean {
  const bannedOpen = ["在 ", "talent", " 打开"].join("");
  return /talent\.oceanleo\.com/i.test(text) || text.includes(bannedOpen);
}

function fallbackBody(tt: UITranslate, body: string): string {
  const trimmed = body.trim();
  if (!trimmed || looksLikeTalentLink(trimmed)) return tt(UNKNOWN_DEAL_LINE_TEXT);
  return trimmed;
}

/** 测试与文案表用：两套事件名里每一条要映射的用例（含同名碰撞的拆分）。 */
export function legacyDealLineCases(): {
  event: string;
  meta: Record<string, unknown>;
  family: Exclude<DealLineFamily, "unknown" | "notify">;
  action: DealLineActionKind | null;
}[] {
  return [
    { event: "created", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "ordered", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "updated", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "accepted", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "milestone.submitted", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "milestone.approved", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "delivered", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "revision_requested", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "review_extended", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "time_recorded", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "time_disputed", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "time_withdrawn", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "completed", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "cancelled", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "disputed", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "consult_booked", meta: { contract_id: "c1" }, family: "contract", action: "order" },
    { event: "accepted", meta: { offer_id: "o1" }, family: "offer", action: "order" },
    { event: "declined", meta: { offer_id: "o1" }, family: "offer", action: null },
    { event: "withdrawn", meta: { offer_id: "o1" }, family: "offer", action: null },
    { event: "claimed", meta: { handoff_id: "h1" }, family: "handoff", action: "help" },
    { event: "cancelled", meta: { handoff_id: "h1" }, family: "handoff", action: "help" },
    { event: "context_revoked", meta: { handoff_id: "h1" }, family: "handoff", action: "help" },
    { event: "revoked", meta: { handoff_id: "h1" }, family: "handoff", action: "help" },
  ];
}

/**
 * 一条系统消息 → 显示什么。`fallbackContractId` 是会话关联的合同（`thread.contract_id` 或合同摘要），
 * 事件行自己没带 `contract_id` 时「查看订单」用它；两边都没有就不画动作。
 */
export function resolveDealLine(
  tt: UITranslate,
  message: { body?: string | null; meta?: Record<string, unknown> | null },
  fallbackContractId: string | null = null,
): ResolvedDealLine {
  const meta = message.meta && typeof message.meta === "object" ? message.meta : {};
  const event = typeof meta.event === "string" ? meta.event : null;
  const classified = classifyDealLine(event, meta);
  const mapped = classified.family === "unknown" ? null : dealLineText(tt, classified.raw || classified.key, meta);
  const text = mapped || fallbackBody(tt, message.body ?? "");
  const kind = actionKindOf(classified);
  const target = kind ? targetFor(kind, meta, fallbackContractId) : null;
  return {
    event,
    text,
    action: kind && target ? { kind, label: dealActionLabel(tt, kind), target } : null,
  };
}
