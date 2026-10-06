// 交易会话的纯逻辑：消息排序合并、我是谁、主题 id、交易卡显示什么、签约后输入框换不换成提示条。
// 没有 React、没有网络，便于单测；界面文案在组件里按这里给的 key 用 `tt("字面量")` 翻译。

import type {
  DealContractSummary,
  DealMessage,
  DealOffer,
  DealSubjectInfo,
  DealThread,
} from "../../../lib/bay/threads";

function ms(value: string | null | undefined): number {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 接口给的是新的在前；界面要按时间升序。 */
export function sortAscending(rows: ReadonlyArray<DealMessage>): DealMessage[] {
  return [...rows].sort((a, b) => ms(a.created_at) - ms(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 新到的并进已有列表：按 id 去重（新的替换旧的，审核隐藏会更新），保持升序。 */
export function mergeMessages(current: ReadonlyArray<DealMessage>, incoming: ReadonlyArray<DealMessage>): DealMessage[] {
  const byId = new Map<string, DealMessage>();
  for (const row of current) byId.set(row.id, row);
  for (const row of incoming) byId.set(row.id, row);
  return sortAscending([...byId.values()]);
}

/** 我是谁：登录信息优先；拿不到时用「对方之外的那个人」推断（与已提交的交易会话视图同一口径）。 */
export function resolveViewerId(
  signedInId: string | null,
  peerId: string | null,
  messages: ReadonlyArray<DealMessage>,
  offers: ReadonlyArray<DealOffer>,
): string | null {
  if (signedInId) return signedInId;
  for (const offer of offers) {
    const other = [offer.from_user_id, offer.to_user_id].find((id) => id && id !== peerId);
    if (other) return other;
  }
  for (const message of messages) {
    if (message.kind !== "system" && message.user_id && message.user_id !== peerId) return message.user_id;
  }
  return null;
}

export function latestOffer(offers: ReadonlyArray<DealOffer>): DealOffer | null {
  let best: DealOffer | null = null;
  for (const offer of offers) {
    if (!best || ms(offer.created_at) > ms(best.created_at)) best = offer;
  }
  return best;
}

/** 签约后、合同还在做的这几个状态里，会话改到项目群；取消或完成后恢复输入框。 */
export const SIGNED_STATUSES: ReadonlySet<string> = new Set(["active", "delivered", "disputed"]);

export interface ComposerLock {
  locked: boolean;
  /** 项目群在消息窗里的会话 id；锁定时一定有。 */
  conversationId: string | null;
}

/** 只有项目群真的存在时才换成提示条——不然双方无处可聊。 */
export function composerLock(summary: DealContractSummary | null): ComposerLock {
  const conversationId = summary?.im_conversation_id ?? null;
  if (!summary || !conversationId || conversationId.startsWith("talent:")) return { locked: false, conversationId: null };
  return SIGNED_STATUSES.has(summary.status) ? { locked: true, conversationId } : { locked: false, conversationId };
}

export type DealRole = "buyer" | "seller" | "either" | "unknown";

/** 我在这笔交易里是买家还是卖家：服务发布者、需求的非发布方、合同卖家是卖家；私聊两边都可以发报价。 */
export function dealRole(
  thread: Pick<DealThread, "kind">,
  subject: DealSubjectInfo | null,
  viewerId: string | null,
  offers: ReadonlyArray<DealOffer>,
): DealRole {
  if (viewerId) {
    const last = latestOffer(offers);
    if (last?.from_user_id === viewerId) return "seller";
    if (last?.to_user_id === viewerId) return "buyer";
  }
  switch (thread.kind) {
    case "service": {
      if (!subject?.ownerId || !viewerId) return "unknown";
      return subject.ownerId === viewerId ? "seller" : "buyer";
    }
    case "demand": {
      const owner = subject?.viewerIsOwner ?? (subject?.ownerId && viewerId ? subject.ownerId === viewerId : null);
      if (owner === null || owner === undefined) return "unknown";
      return owner ? "buyer" : "seller";
    }
    case "contract":
      return subject?.viewerRole ?? "unknown";
    case "direct":
      return "either";
    default:
      return "unknown";
  }
}

export function canOffer(thread: Pick<DealThread, "kind">, role: DealRole, lock: ComposerLock): boolean {
  if (lock.locked) return false;
  if (thread.kind === "handoff") return false;
  return role === "seller" || role === "either";
}

export type DealStatusKey =
  | "talking"
  | "offer_pending"
  | "offer_declined"
  | "offer_withdrawn"
  | "offer_expired"
  | "draft"
  | "negotiating"
  | "active"
  | "delivered"
  | "completed"
  | "cancelled"
  | "disputed"
  | "help";

export type DealNextKey =
  | "pay"
  | "pay_unavailable"
  | "deliver"
  | "accept"
  | "review"
  | "reply_offer"
  | "wait_offer_reply"
  | "send_offer"
  | "wait_offer"
  | "open_order"
  | "wait_other"
  | "finished"
  | "cancelled"
  | "dispute"
  | "none";

export interface DealCardModel {
  title: string;
  amount: { fen: number; currency: string } | null;
  status: DealStatusKey;
  next: DealNextKey;
  paymentState: "held" | "released" | "refunded" | "split" | null;
  contractId: string | null;
}

const CONTRACT_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "negotiating",
  "active",
  "delivered",
  "completed",
  "cancelled",
  "disputed",
]);

function paymentStateKey(raw: string | null | undefined): DealCardModel["paymentState"] {
  if (raw === "held" || raw === "escrow_held") return "held";
  if (raw === "released") return "released";
  if (raw === "refunded") return "refunded";
  if (raw === "split") return "split";
  return null;
}

/**
 * 交易卡：买的是什么、多少钱、现在什么状态、下一步该谁做什么。
 * 付款这一步只看 `paymentReady`（W09 的 `buyer_ready`）：没就绪写「付款暂未开放」，不出现能点的付款按钮。
 */
export function dealCardModel(input: {
  thread: Pick<DealThread, "kind" | "title" | "contract_id">;
  summary: DealContractSummary | null;
  offers: ReadonlyArray<DealOffer>;
  viewerId: string | null;
  role: DealRole;
  subjectTitle?: string | null;
  paymentReady: boolean;
}): DealCardModel {
  const { thread, summary, offers, viewerId, role, paymentReady } = input;
  const offer = latestOffer(offers);
  const baseTitle = summary?.title || offer?.title || input.subjectTitle || thread.title || "";
  if (summary) {
    const status = (CONTRACT_STATUSES.has(summary.status) ? summary.status : "draft") as DealStatusKey;
    let next: DealNextKey;
    switch (summary.next_action) {
      case "pay":
        next = paymentReady ? "pay" : "pay_unavailable";
        break;
      case "deliver":
        next = "deliver";
        break;
      case "accept":
        next = "accept";
        break;
      case "review":
        next = "review";
        break;
      default:
        next =
          status === "completed"
            ? "finished"
            : status === "cancelled"
              ? "cancelled"
              : status === "disputed"
                ? "dispute"
                : "wait_other";
    }
    return {
      title: baseTitle,
      amount: { fen: summary.total_fen, currency: summary.currency },
      status,
      next,
      paymentState: paymentStateKey(summary.payment_state),
      contractId: summary.id,
    };
  }
  if (offer && offer.state === "accepted" && offer.contract_id) {
    return {
      title: baseTitle,
      amount: { fen: offer.price_fen, currency: offer.currency || "usd" },
      status: "draft",
      next: "open_order",
      paymentState: null,
      contractId: offer.contract_id,
    };
  }
  if (thread.kind === "handoff") {
    return { title: baseTitle, amount: null, status: "help", next: "none", paymentState: null, contractId: thread.contract_id };
  }
  if (offer) {
    const amount = { fen: offer.price_fen, currency: offer.currency || "usd" };
    if (offer.state === "pending") {
      const next: DealNextKey =
        viewerId && offer.to_user_id === viewerId ? "reply_offer" : viewerId && offer.from_user_id === viewerId ? "wait_offer_reply" : "none";
      return { title: baseTitle, amount, status: "offer_pending", next, paymentState: null, contractId: null };
    }
    const status: DealStatusKey =
      offer.state === "declined" ? "offer_declined" : offer.state === "withdrawn" ? "offer_withdrawn" : "offer_expired";
    return {
      title: baseTitle,
      amount,
      status,
      next: role === "seller" || role === "either" ? "send_offer" : role === "buyer" ? "wait_offer" : "none",
      paymentState: null,
      contractId: null,
    };
  }
  return {
    title: baseTitle,
    amount: null,
    status: "talking",
    next: role === "seller" || role === "either" ? "send_offer" : role === "buyer" ? "wait_offer" : "none",
    paymentState: null,
    contractId: thread.contract_id,
  };
}

/** 金额：分 → 本地货币写法；货币代码不认识时退回「12.34 USD」。 */
export function formatDealAmount(fen: number, currency: string, locale?: string): string {
  const amount = (Number.isFinite(fen) ? fen : 0) / 100;
  const code = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

/** 报价表单里填的金额（元 / 美元）→ 分；不合法返回 null。 */
export function parseAmountToFen(raw: string): number | null {
  const text = raw.trim().replace(/,/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  const fen = Math.round(Number(text) * 100);
  return Number.isFinite(fen) && fen >= 0 ? fen : null;
}

export type OfferFormProblem = "title" | "amount" | "days" | "revisions" | null;

export function checkOfferForm(form: { title: string; amount: string; days: string; revisions: string }): OfferFormProblem {
  if (!form.title.trim()) return "title";
  if (parseAmountToFen(form.amount) === null) return "amount";
  const days = Number(form.days);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return "days";
  const revisions = Number(form.revisions);
  if (!Number.isInteger(revisions) || revisions < -1 || revisions > 100) return "revisions";
  return null;
}
