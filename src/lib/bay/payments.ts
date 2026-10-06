// Bay 的付款就绪与发起付款（oceanleo-bay 契约 §4.3、§7）。
//
// 就绪只看网关 `GET /v1/talent/payments/config` 的 `buyer_ready` / `seller_ready`，
// 不看 `enabled`：开发网关 `enabled` 为 true 而 Stripe 是真钥匙，按 `enabled` 放出按钮
// 就会让人点到真实的绑卡、扣款。取不到配置一律按「没就绪」处理，不报错。
import { bayGet, bayPost } from "./http";

export interface BayPaymentConfig {
  enabled: boolean;
  buyer_ready: boolean;
  seller_ready: boolean;
  currency: string;
}

/** 通道费说明（Stripe 收单成本，平台不抽佣）。 */
export interface BayChannelFee {
  percent_bps: number;
  fixed_minor: number;
  note_zh: string;
}

export interface BayPaymentChannel extends BayPaymentConfig {
  edition: string;
  provider: string;
  channel_fee: BayChannelFee;
  payout_countries: string[];
}

export const BAY_CHANNEL_FEE_BPS = 390;
export const BAY_CHANNEL_FEE_FIXED_MINOR = 30;
const CHANNEL_FEE_NOTE = "支付通道费（覆盖 Stripe 收单成本，平台不以此盈利）";

const DISABLED_CHANNEL: BayPaymentChannel = Object.freeze({
  enabled: false,
  buyer_ready: false,
  seller_ready: false,
  currency: "USD",
  edition: "none",
  provider: "none",
  channel_fee: Object.freeze({
    percent_bps: BAY_CHANNEL_FEE_BPS,
    fixed_minor: BAY_CHANNEL_FEE_FIXED_MINOR,
    note_zh: CHANNEL_FEE_NOTE,
  }),
  payout_countries: Object.freeze([]) as unknown as string[],
}) as BayPaymentChannel;

const CONFIG_TTL_MS = 30_000;
const CONTRACT_ID = /^[A-Za-z0-9_-]{1,80}$/;

let cached: { at: number; value: BayPaymentChannel } | null = null;
let inflight: Promise<BayPaymentChannel> | null = null;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeChannel(raw: unknown): BayPaymentChannel {
  const row = record(raw);
  if (!row) return DISABLED_CHANNEL;
  const fee = record(row.channel_fee);
  const countries = Array.isArray(row.payout_countries)
    ? row.payout_countries
        .filter((code): code is string => typeof code === "string" && /^[A-Za-z]{2}$/.test(code.trim()))
        .map((code) => code.trim().toUpperCase())
    : [];
  return {
    enabled: row.enabled === true,
    buyer_ready: row.buyer_ready === true,
    seller_ready: row.seller_ready === true,
    currency: text(row.currency, "USD").toUpperCase(),
    edition: text(row.edition, "none"),
    provider: text(row.provider, "none"),
    channel_fee: {
      percent_bps: finite(fee?.percent_bps, BAY_CHANNEL_FEE_BPS),
      fixed_minor: finite(fee?.fixed_minor, BAY_CHANNEL_FEE_FIXED_MINOR),
      note_zh: text(fee?.note_zh, CHANNEL_FEE_NOTE),
    },
    payout_countries: countries,
  };
}

async function readChannel(fresh: boolean): Promise<BayPaymentChannel> {
  if (!fresh && cached && Date.now() - cached.at < CONFIG_TTL_MS) return cached.value;
  if (!fresh && inflight) return inflight;
  const request = bayGet<unknown>("/v1/talent/payments/config", { anonymous: true })
    .then((data) => {
      const value = normalizeChannel(data);
      cached = { at: Date.now(), value };
      return value;
    })
    .catch(() => DISABLED_CHANNEL);
  if (!fresh) {
    inflight = request.finally(() => {
      inflight = null;
    });
    return inflight;
  }
  return request;
}

/** 付款/收款就绪状态。接口失败、未开放时四项都是「没就绪」。 */
export async function fetchBayPaymentConfig(): Promise<BayPaymentConfig> {
  const channel = await readChannel(false);
  return {
    enabled: channel.enabled,
    buyer_ready: channel.buyer_ready,
    seller_ready: channel.seller_ready,
    currency: channel.currency,
  };
}

/** 设置「钱」里的费用说明与收款国家用；就绪判断仍以 `fetchBayPaymentConfig()` 为准。 */
export async function fetchBayPaymentChannel(): Promise<BayPaymentChannel> {
  return readChannel(false);
}

/** 登录状态变化、付款方式变化之后调，下次读取重新问网关。 */
export function invalidateBayPaymentConfig(): void {
  cached = null;
  inflight = null;
}

function safeRedirect(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * 为订单发起付款。只有网关此刻说 `enabled` 且 `buyer_ready` 时才请求
 * `POST /v1/talent/contracts/{id}/fund`（对已存卡托管扣款）；否则不发任何请求，直接
 * 返回 `{ redirect_url: null }`。网关拒绝时抛 `BayApiError`（`message` 是中文原因）。
 */
export async function startBayPayment(contractId: string): Promise<{ redirect_url: string | null }> {
  const id = typeof contractId === "string" ? contractId.trim() : "";
  if (!CONTRACT_ID.test(id)) return { redirect_url: null };
  const channel = await readChannel(true);
  if (!channel.enabled || !channel.buyer_ready) return { redirect_url: null };
  const data = record(await bayPost<unknown>(`/v1/talent/contracts/${encodeURIComponent(id)}/fund`));
  invalidateBayPaymentConfig();
  return { redirect_url: safeRedirect(data?.redirect_url) ?? safeRedirect(data?.url) };
}

/** 通道费（美分，向上取整）：金额 × 3.9% + 30。 */
export function bayChannelFeeMinor(amountMinor: number, fee: BayChannelFee = DISABLED_CHANNEL.channel_fee): number {
  const amount = Number(amountMinor);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil((amount * fee.percent_bps) / 10000) + fee.fixed_minor;
}

export const BAY_CONTRACT_PAYMENT_STATE_LABELS: Readonly<Record<string, string>> = {
  disabled: "未付款",
  unfunded: "未付款",
  escrow_held: "托管中",
  released: "已放款",
  refunded: "已退款",
  split: "部分放款部分退款",
};

export interface BayCardMethod {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  state: "none" | "ready" | "detached";
}

/**
 * 已绑的卡（只读）。只在 `buyer_ready` 为 true 时问网关；否则返回 null，不发请求。
 * 绑卡、换卡、解绑都会动 Stripe，本期界面不提供。
 */
export async function fetchBayCardMethod(): Promise<BayCardMethod | null> {
  const channel = await readChannel(false);
  if (!channel.enabled || !channel.buyer_ready) return null;
  try {
    const data = record(await bayGet<unknown>("/v1/talent/payment-method"));
    const method = record(data?.method);
    const last4 = typeof method?.last4 === "string" ? method.last4.replace(/\D/g, "").slice(-4) : "";
    if (!method || !last4) return null;
    const state = method.state === "ready" || method.state === "detached" ? method.state : "none";
    return {
      brand: text(method.brand, ""),
      last4,
      exp_month: finite(method.exp_month, 0),
      exp_year: finite(method.exp_year, 0),
      state,
    };
  } catch {
    return null;
  }
}
