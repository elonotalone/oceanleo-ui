// 来电卡片的纯逻辑（任务书 P3/P4；合同 §1 A2、§3.1 RING_TIMEOUT=45s）。tests/call-chat-incoming.test.mjs 直接跑。
//
// 卡片有两个来源：
//   ring — 引擎 `useCall().incoming`（实时 `call_ring` 事件）；接听 = acceptIncoming，拒绝 = declineIncoming；
//   link — 推送点开的深链 `/leochat?c=<cid>&call=<call_id>`，页面是新开的、没收到 call_ring：
//          W08 自己 `GET …/call` 核实这通还在进行，接听 = join(callId)，拒绝 = POST /calls/{id}/decline。
// 45 秒后卡片消失（以先到者为准：本地 45 秒上限 / 服务端 expires_at），铃声随之停。
export const RING_TIMEOUT_MS = 45_000;
/** 服务端到期时间就算因时钟偏差已经过了，卡片也至少留这么久，免得一闪而过。 */
export const MIN_VISIBLE_MS = 3_000;

export type IncomingSource = "ring" | "link";

export interface IncomingCardModel {
  source: IncomingSource;
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string;
  /** 卡片自动消失的时刻（ms）。 */
  deadline: number;
}

export interface EngineIncomingLike {
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string;
  expiresAt: string;
}

export interface LinkIncomingLike {
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string;
  /** 核实通话仍在进行的时刻（ms）。 */
  seenAt: number;
}

/** ring 来源的消失时刻：本地首见 + 45 秒为上限，服务端 expires_at 更早就用它，但至少再留 3 秒。 */
export function ringDeadline(expiresAtIso: string | null | undefined, firstSeenAt: number): number {
  const cap = firstSeenAt + RING_TIMEOUT_MS;
  const parsed = typeof expiresAtIso === "string" ? Date.parse(expiresAtIso) : Number.NaN;
  if (!Number.isFinite(parsed)) return cap;
  return Math.max(firstSeenAt + MIN_VISIBLE_MS, Math.min(parsed, cap));
}

/**
 * 现在该显示哪张卡片：引擎的实时来电优先；已处理（接听 / 拒绝 / 到期）过的不再显示；
 * 已经在这通通话里了也不显示。
 */
export function pickIncoming(input: {
  engine: EngineIncomingLike | null;
  engineFirstSeenAt: number | null;
  link: LinkIncomingLike | null;
  handled: ReadonlySet<string>;
  /** 引擎当前所在的通话（在场才算）。 */
  liveCallId: string | null;
  now: number;
}): IncomingCardModel | null {
  const { engine, link, handled, liveCallId, now } = input;
  if (engine && engine.callId && !handled.has(engine.callId) && engine.callId !== liveCallId) {
    const deadline = ringDeadline(engine.expiresAt, input.engineFirstSeenAt ?? now);
    if (now < deadline) {
      return {
        source: "ring",
        callId: engine.callId,
        conversationId: engine.conversationId,
        callerId: engine.callerId,
        callerName: engine.callerName,
        deadline,
      };
    }
  }
  if (link && link.callId && !handled.has(link.callId) && link.callId !== liveCallId) {
    const deadline = link.seenAt + RING_TIMEOUT_MS;
    if (now < deadline) {
      return {
        source: "link",
        callId: link.callId,
        conversationId: link.conversationId,
        callerId: link.callerId,
        callerName: link.callerName,
        deadline,
      };
    }
  }
  return null;
}

/** 已处理集合只留最近这么多条（同一页面一天也接不了几通）。 */
export const HANDLED_MAX = 50;

export function withHandled(handled: ReadonlySet<string>, callId: string): Set<string> {
  const next = new Set(handled);
  next.delete(callId);
  next.add(callId);
  while (next.size > HANDLED_MAX) {
    const oldest = next.values().next().value;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  return next;
}

export interface IncomingActions {
  acceptRing(): Promise<void>;
  declineRing(): Promise<void>;
  joinLink(card: IncomingCardModel): Promise<void>;
  declineLink(callId: string): Promise<unknown>;
}

/** 接听：按来源分派。失败原样抛出（界面给提示）。 */
export async function acceptIncomingCard(actions: IncomingActions, card: IncomingCardModel): Promise<void> {
  if (card.source === "ring") await actions.acceptRing();
  else await actions.joinLink(card);
}

/** 拒绝：按来源分派。拒绝失败不提示（卡片照样收起，对方 45 秒后看到「未接通」）。 */
export async function declineIncomingCard(actions: IncomingActions, card: IncomingCardModel): Promise<void> {
  try {
    if (card.source === "ring") await actions.declineRing();
    else await actions.declineLink(card.callId);
  } catch {
    /* 见上 */
  }
}
