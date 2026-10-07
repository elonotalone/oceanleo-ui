// Bay 设置「钱」的取数（逻辑照 talent 的 lib/talent/money.ts）：账本、月度汇总、
// 单笔对账单、收款账户状态、接单资格。全部是只读接口。
//
// 收款账户开户、刷新、后台登录链接都会调 Stripe Connect，本期界面不提供，这里也不导出
// （契约 §7：开发网关的 Stripe 是真钥匙）。
import { BayApiError, bayGet } from "./http";

export type BayLedgerDirection = "in" | "out";
export type BayLedgerEvent = "ordered" | "delivered" | "completed" | "cancelled" | "adjusted";

const LEDGER_EVENTS: readonly BayLedgerEvent[] = ["ordered", "delivered", "completed", "cancelled", "adjusted"];

/** 抽佣恒为 0。界面只说「不抽佣」，不把它算成百分比。 */
export const BAY_PLATFORM_FEE_BPS = 0;
export const BAY_NO_PLATFORM_FEE_NOTE = "本平台不抽佣：订单金额一分不扣，全部归接单方";

export const BAY_LEDGER_EVENT_LABELS: Readonly<Record<BayLedgerEvent, string>> = {
  ordered: "订单成立",
  delivered: "提交交付",
  completed: "验收完成",
  cancelled: "订单取消",
  adjusted: "账目调整",
};

/** 账本顶部那句话：收款没就绪时说清楚「记账不是钱」。 */
export function bayMoneyNotice(sellerReady: boolean): string {
  return sellerReady
    ? "订单款由 Stripe 托管，验收后直接转入你的 Stripe 收款账户；平台不抽佣。"
    : "下面的金额是记账，不是可动用的钱：平台目前不代收代付";
}

export interface BayLedgerCounterparty {
  user_id?: string;
  handle?: string;
  display_name?: string;
}

export interface BayLedgerEntry {
  id: string;
  counterparty_user_id: string | null;
  contract_id: string | null;
  direction: BayLedgerDirection;
  event: BayLedgerEvent;
  amount_fen: number;
  currency: string;
  note: string;
  created_at: string;
  counterparty: BayLedgerCounterparty | null;
}

export interface BayMonthlyTotal {
  month: string;
  in_fen: number;
  out_fen: number;
}

export interface BayLedgerPage {
  items: BayLedgerEntry[];
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
  total_in_fen: number;
  total_out_fen: number;
  monthly: BayMonthlyTotal[];
}

export interface BayLedgerSummary {
  currency: string;
  month: string;
  month_in_fen: number;
  lifetime_in_fen: number;
  ongoing_contract_amount_fen: number;
  ongoing_contract_count: number;
  monthly: BayMonthlyTotal[];
}

export interface BayStatement {
  contract_id: string;
  counterparty: BayLedgerCounterparty | null;
  title: string;
  status: string;
  engagement_kind: string;
  accepted_at: string | null;
  completed_at: string | null;
  tier: { title: string; price_fen: number; delivery_days: number } | null;
  addons: { title: string; price_fen: number }[];
  timeline: BayLedgerEntry[];
  amount_fen: number;
  currency: string;
  money_notice: string;
}

export interface BayPayoutAccount {
  edition: string;
  provider: string;
  state: string;
  verified_subject_kind: string | null;
  last_checked_at: string | null;
}

export interface BayPaidWorkEligibility {
  eligible: boolean;
  reason: string;
  blockers: string[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function int(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function counterpartyOf(value: unknown): BayLedgerCounterparty | null {
  const row = record(value);
  if (!row) return null;
  const out: BayLedgerCounterparty = {};
  if (str(row.user_id)) out.user_id = str(row.user_id);
  if (str(row.handle)) out.handle = str(row.handle);
  if (str(row.display_name)) out.display_name = str(row.display_name);
  return out;
}

function entryOf(value: unknown): BayLedgerEntry | null {
  const row = record(value);
  if (!row || !str(row.id)) return null;
  const event = LEDGER_EVENTS.includes(row.event as BayLedgerEvent) ? (row.event as BayLedgerEvent) : "adjusted";
  return {
    id: str(row.id),
    counterparty_user_id: strOrNull(row.counterparty_user_id),
    contract_id: strOrNull(row.contract_id),
    direction: row.direction === "out" ? "out" : "in",
    event,
    amount_fen: int(row.amount_fen),
    currency: str(row.currency) || "CNY",
    note: str(row.note),
    created_at: str(row.created_at),
    counterparty: counterpartyOf(row.counterparty),
  };
}

function entriesOf(value: unknown): BayLedgerEntry[] {
  return Array.isArray(value) ? value.map(entryOf).filter((item): item is BayLedgerEntry => item !== null) : [];
}

function monthlyOf(value: unknown): BayMonthlyTotal[] {
  if (!Array.isArray(value)) return [];
  const out: BayMonthlyTotal[] = [];
  for (const item of value) {
    const row = record(item);
    const month = str(row?.month);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    out.push({ month, in_fen: Math.max(0, int(row?.in_fen)), out_fen: Math.max(0, int(row?.out_fen)) });
  }
  return out.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

export function bayLedgerPath(filters: { direction?: BayLedgerDirection; event?: BayLedgerEvent; page?: number; limit?: number } = {}): string {
  const params = new URLSearchParams();
  if (filters.direction === "in" || filters.direction === "out") params.set("direction", filters.direction);
  if (filters.event && LEDGER_EVENTS.includes(filters.event)) params.set("event", filters.event);
  const page = Math.floor(Number(filters.page));
  if (Number.isFinite(page) && page > 1) params.set("page", String(Math.min(page, 10_000)));
  const limit = Math.floor(Number(filters.limit));
  if (Number.isFinite(limit) && limit > 0) params.set("limit", String(Math.min(limit, 100)));
  const query = params.toString();
  return `/v1/talent/ledger${query ? `?${query}` : ""}`;
}

export async function fetchBayLedger(
  filters: { direction?: BayLedgerDirection; event?: BayLedgerEvent; page?: number; limit?: number } = {},
): Promise<BayLedgerPage> {
  const data = record(await bayGet<unknown>(bayLedgerPath(filters)));
  return {
    items: entriesOf(data?.items),
    page: Math.max(1, int(data?.page) || 1),
    limit: Math.max(1, int(data?.limit) || 20),
    total: Math.max(0, int(data?.total)),
    has_more: data?.has_more === true,
    total_in_fen: Math.max(0, int(data?.total_in_fen)),
    total_out_fen: Math.max(0, int(data?.total_out_fen)),
    monthly: monthlyOf(data?.monthly),
  };
}

export async function fetchBayLedgerSummary(): Promise<BayLedgerSummary> {
  const data = record(await bayGet<unknown>("/v1/talent/ledger/summary"));
  return {
    currency: str(data?.currency) || "CNY",
    month: str(data?.month),
    month_in_fen: Math.max(0, int(data?.month_in_fen)),
    lifetime_in_fen: Math.max(0, int(data?.lifetime_in_fen)),
    ongoing_contract_amount_fen: Math.max(0, int(data?.ongoing_contract_amount_fen)),
    ongoing_contract_count: Math.max(0, int(data?.ongoing_contract_count)),
    monthly: monthlyOf(data?.monthly),
  };
}

export async function fetchBayStatement(contractId: string): Promise<BayStatement | null> {
  const id = typeof contractId === "string" ? contractId.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  const data = record(await bayGet<unknown>(`/v1/talent/ledger/statement?contract_id=${encodeURIComponent(id)}`));
  if (!data) return null;
  const terms = record(data.terms);
  const tier = record(data.tier);
  return {
    contract_id: str(data.contract_id) || id,
    counterparty: counterpartyOf(data.counterparty),
    title: str(terms?.title),
    status: str(terms?.status),
    engagement_kind: str(terms?.engagement_kind),
    accepted_at: strOrNull(terms?.accepted_at),
    completed_at: strOrNull(terms?.completed_at),
    tier: tier ? { title: str(tier.title), price_fen: Math.max(0, int(tier.price_fen)), delivery_days: Math.max(0, int(tier.delivery_days)) } : null,
    addons: Array.isArray(data.addons)
      ? data.addons
          .map(record)
          .filter((row): row is Record<string, unknown> => row !== null)
          .map((row) => ({ title: str(row.title), price_fen: Math.max(0, int(row.price_fen)) }))
      : [],
    timeline: entriesOf(data.timeline),
    amount_fen: Math.max(0, int(data.amount_fen)),
    currency: str(data.currency) || "CNY",
    money_notice: str(data.money_notice),
  };
}

function unavailable(error: unknown): boolean {
  return error instanceof BayApiError && (error.status === 404 || error.status === 503);
}

/** 收款账户状态（纯读）。通道未开（404/503）时返回 null，不报错。 */
export async function fetchBayPayoutAccount(): Promise<BayPayoutAccount | null> {
  try {
    const data = record(await bayGet<unknown>("/v1/talent/payout-account"));
    const account = record(data?.account) ?? data;
    if (!account || !str(account.state)) return null;
    return {
      edition: str(account.edition) || "intl",
      provider: str(account.provider) || "none",
      state: str(account.state),
      verified_subject_kind: strOrNull(account.verified_subject_kind),
      last_checked_at: strOrNull(account.last_checked_at),
    };
  } catch (error) {
    if (unavailable(error)) return null;
    throw error;
  }
}

/** 能不能接有偿订单、不能的话下一步是什么（中文原因由网关给）。 */
export async function fetchBayPaidWorkEligibility(): Promise<BayPaidWorkEligibility | null> {
  try {
    const data = record(await bayGet<unknown>("/v1/talent/paid-work-eligibility"));
    if (!data) return null;
    return {
      eligible: data.eligible === true,
      reason: str(data.reason),
      blockers: Array.isArray(data.blockers)
        ? data.blockers.filter((line): line is string => typeof line === "string" && Boolean(line.trim())).map((line) => line.trim())
        : [],
    };
  } catch (error) {
    if (unavailable(error)) return null;
    throw error;
  }
}

/** 平台没开放收款时，网关 blockers 里会出现的中文原句片段（不进词表、不往界面摊）。 */
const CLOSED_PAYOUT_ONBOARD_MARKERS = [
  "到收益页选择收款国家并开通收款账户",
  "由 Stripe 完成核验",
] as const;

const CLOSED_PAYOUT_COPY = {
  payout: "收款暂未开放",
  onboard: "开户暂未开放",
  withdraw: "提现暂未开放",
  rail: "放款通道尚未接入",
} as const;

/** 把网关 blocker 收成词表里已有的中文 key；对不上的原样留下，调用方再 tt()。 */
export function mapBayPayoutBlockerLine(line: string): string {
  const text = line.trim();
  if (!text) return "";
  if (CLOSED_PAYOUT_ONBOARD_MARKERS.some((marker) => text.includes(marker))) return CLOSED_PAYOUT_COPY.onboard;
  if (text.includes(CLOSED_PAYOUT_COPY.payout)) return CLOSED_PAYOUT_COPY.payout;
  if (text.includes("放款通道尚未接入") || text.includes("收款通道尚未接入")) return CLOSED_PAYOUT_COPY.rail;
  return text;
}

function uniqueLines(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/** 收款没就绪时卡片里的几行原因：关闭收款类网关原文映射到已翻译词条，其余原样留下。 */
export function bayPayoutBlockerLines(eligibility: BayPaidWorkEligibility | null, account: BayPayoutAccount | null): string[] {
  const raw =
    eligibility?.blockers.length ? eligibility.blockers
    : eligibility?.reason.trim() ? [eligibility.reason.trim()]
    : account && account.provider === "none" ? [CLOSED_PAYOUT_COPY.rail]
    : [];
  return uniqueLines(raw.map(mapBayPayoutBlockerLine));
}

/** 钱页收款卡已经写了「暂未开放」三句时，不要把映射后的同一句再画一遍。 */
export function bayVisiblePayoutBlockerLines(lines: string[], sellerReady: boolean): string[] {
  if (sellerReady) return lines;
  const alreadyOnCard = new Set<string>([CLOSED_PAYOUT_COPY.payout, CLOSED_PAYOUT_COPY.onboard, CLOSED_PAYOUT_COPY.withdraw]);
  return lines.filter((line) => !alreadyOnCard.has(line));
}

export const BAY_PAYOUT_ACCOUNT_STATE_LABELS: Readonly<Record<string, string>> = {
  none: "还没有收款账户",
  onboarding: "开户办理中",
  pending: "通道审核中",
  active: "可以收款",
  restricted: "收款受限",
  disabled: "已停用",
};

export function bayPayoutAccountStateLabel(state: string | null | undefined): string {
  return BAY_PAYOUT_ACCOUNT_STATE_LABELS[String(state || "none")] ?? "状态未知";
}

export function bayLedgerCounterpartyName(item: BayLedgerEntry): string {
  const profile = item.counterparty;
  if (profile?.display_name) return profile.display_name;
  if (profile?.handle) return `@${profile.handle}`;
  return "";
}

/** 金额（分）→ 「¥1,234.50」；币种不是人民币时用 Intl 的货币写法。 */
export function formatBayFen(fen: number, currency = "CNY", locale = "zh-CN"): string {
  const amount = (Number.isFinite(Number(fen)) ? Number(fen) : 0) / 100;
  const code = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "CNY";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

export function formatBayLedgerDate(value: string, locale = "zh-CN"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

function csvCell(value: unknown): string {
  let cell = String(value ?? "");
  // 以 = + - @ 开头的格子会被表格软件当公式执行。
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replaceAll('"', '""')}"`;
}

/** 账本导出成 CSV。表头由调用方按当前语言给。 */
export function bayLedgerCsv(
  items: BayLedgerEntry[],
  labels: { headers: string[]; event: (event: BayLedgerEvent) => string; direction: (direction: BayLedgerDirection) => string; recorded: string },
): string {
  const rows = items.map((item) => [
    formatBayLedgerDate(item.created_at),
    bayLedgerCounterpartyName(item),
    item.contract_id ?? "",
    labels.event(item.event),
    labels.direction(item.direction),
    (item.amount_fen / 100).toFixed(2),
    labels.recorded,
    item.note,
  ]);
  return [labels.headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function downloadBayLedgerCsv(csv: string, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") return;
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.replace(/[^\w.-]+/g, "-");
  anchor.click();
  URL.revokeObjectURL(url);
}
