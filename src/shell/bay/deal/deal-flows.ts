// 交易会话里的几个动作流程：发消息、发报价、接受 / 拒绝 / 撤回报价、上传文件。
// 条款：服务端写操作前要求签当前版本条款（403 `talent_terms_required`）。买家接受报价前、卖家发报价前先走 W09 的
// `ensureBayTerms`；其余写操作遇到这个错误时弹同一个条款窗，同意后重试一次，关掉就什么都不做。
// 付款：这里没有任何付款调用（契约 §7）——接受报价只生成草稿订单，付款在 Bay 的订单页里由 W07 处理。

import {
  actOnDealOffer,
  cleanAttachments,
  createDealOffer,
  sendDealMessage,
  type DealAttachment,
  type DealOfferAction,
  type DealOfferInput,
} from "../../../lib/bay/threads";
import { ensureBayTerms } from "../settings";

export const TERMS_REQUIRED_CODE = "talent_terms_required";

export type TermsScope = "buyer" | "seller";

export interface DealFlowDeps {
  ensureTerms: (scope: TermsScope) => Promise<boolean>;
  act: typeof actOnDealOffer;
  create: typeof createDealOffer;
  send: typeof sendDealMessage;
}

export const defaultDealFlowDeps: DealFlowDeps = {
  ensureTerms: ensureBayTerms,
  act: actOnDealOffer,
  create: createDealOffer,
  send: sendDealMessage,
};

export function isTermsRequired(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === TERMS_REQUIRED_CODE);
}

/** 跑一次写操作；服务端要求先签条款时弹条款窗，同意后重试一次。用户关掉条款窗返回 null。 */
export async function withTerms<T>(
  scope: TermsScope,
  run: () => Promise<T>,
  ensureTerms: DealFlowDeps["ensureTerms"] = ensureBayTerms,
): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if (!isTermsRequired(error)) throw error;
    if (!(await ensureTerms(scope))) return null;
    return run();
  }
}

export interface AcceptResult {
  accepted: boolean;
  contractId: string | null;
}

/** 买家接受报价：先过买家条款，再接受；生成的是草稿订单，不发起付款。 */
export async function acceptDealOffer(offerId: string, deps: DealFlowDeps = defaultDealFlowDeps): Promise<AcceptResult> {
  if (!(await deps.ensureTerms("buyer"))) return { accepted: false, contractId: null };
  const result = await withTerms("buyer", () => deps.act(offerId, "accept"), deps.ensureTerms);
  if (!result) return { accepted: false, contractId: null };
  return { accepted: true, contractId: result.contract_id ?? result.offer?.contract_id ?? null };
}

/** 拒绝（买家）、撤回（卖家）：不需要先签条款。 */
export async function settleDealOffer(
  offerId: string,
  action: Exclude<DealOfferAction, "accept">,
  deps: DealFlowDeps = defaultDealFlowDeps,
): Promise<void> {
  await deps.act(offerId, action);
}

/** 卖家发新报价：先过卖家条款。服务端会把之前没处理的报价自动撤回。 */
export async function sendDealOffer(
  threadId: string,
  input: DealOfferInput,
  deps: DealFlowDeps = defaultDealFlowDeps,
): Promise<boolean> {
  if (!(await deps.ensureTerms("seller"))) return false;
  const result = await withTerms("seller", () => deps.create(threadId, input), deps.ensureTerms);
  return result !== null;
}

/** 发消息（文字 + 文件）。返回是否真的发出去了（关掉条款窗算没发）。 */
export async function sendDealText(
  threadId: string,
  body: string,
  attachments: ReadonlyArray<Partial<DealAttachment>>,
  scope: TermsScope,
  deps: DealFlowDeps = defaultDealFlowDeps,
): Promise<boolean> {
  const text = body.trim();
  const files = cleanAttachments(attachments);
  if (!text && files.length === 0) return false;
  const result = await withTerms(scope, () => deps.send(threadId, text, files), deps.ensureTerms);
  return result !== null;
}
