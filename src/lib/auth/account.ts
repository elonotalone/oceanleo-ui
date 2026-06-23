"use client";

import { accessToken } from "./client";
import { GATEWAY_BASE } from "./config";

// Account-center API client (shared across all *.oceanleo.com sites).
//   - wallet balance (CNY) + per-call charge history
//   - per-site usage (tokens + CNY spent)
//   - model catalog (Bailian models grouped by category, with prices)
//   - per-user model selection (the API page)
//   - BYOK key management (bring your own provider key → free usage)
//   - per-call audit (the exact content sent to / returned by the model API)
// 2026-06-23: ZERO service fee — the price a user pays IS the provider's exact
// token market cost (markup 0). BYOK is back: a user's own key runs for free.
// Every call is auditable (full request/response, 24h retention, owner-only).

// 后端返回的数值字段可能缺失 / 为 null / 是字符串（不同部署阶段的网关行为不一致）。
// 前端直接 `.toFixed()` 会抛 "Cannot read properties of undefined/null"，整页崩成 500。
// 这里统一把任意输入安全地转成 number，缺省回落到 fallback。
function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function authed<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "未登录", status: 401 };
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "网络错误：无法连接到 AI 网关。", status: 0 };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: (data as { detail?: string } | null)?.detail || `HTTP ${res.status}`,
      status: res.status,
    };
  }
  return { ok: true, data: data as T };
}

// Public GET (no auth) — used to browse the model catalog before login.
// Uses the browser HTTP cache (the gateway sets Cache-Control on /catalog) so
// repeat visits don't re-download/rebuild the ~700-model catalog.
async function publicGet<T>(
  path: string,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_BASE}${path}`, { cache: "default" });
    const data = await res.json().catch(() => null);
    if (!res.ok)
      return { ok: false, error: (data as { detail?: string })?.detail || `HTTP ${res.status}` };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "网络错误：无法连接到 AI 网关。" };
  }
}

// --- Wallet (CNY) ----------------------------------------------------------

export interface PricingMeta {
  markup_pct: number;
  source: string;
  source_url?: string;
  source_file?: string;
  generated_at?: string;
  model_count?: number;
  currency: string;
  library: string;
}

// URL of a provider's downloadable pricing artifact served by the gateway:
//   provider ∈ {bailian, volcano, openrouter}
//   kind: "source" → official doc · "pdf" → rendered table · "html" → view inline
export function pricingDocUrl(
  provider: string,
  kind: "source" | "pdf" | "html",
): string {
  return `${GATEWAY_BASE}/v1/models/pricing-doc/${provider}/${kind}`;
}

export interface WalletInfo {
  balance_yuan: number;
  balance_fen: number;
  currency: string;
  signup_grant_yuan: number;
  markup_pct: number;
  pricing: PricingMeta;
}

function normalizeWallet(raw: Partial<WalletInfo> | null | undefined): WalletInfo {
  const r = raw || {};
  const p = r.pricing || ({} as Partial<PricingMeta>);
  return {
    balance_yuan: num(r.balance_yuan),
    balance_fen: num(r.balance_fen),
    currency: r.currency || "CNY",
    signup_grant_yuan: num(r.signup_grant_yuan),
    markup_pct: num(r.markup_pct, 0),
    pricing: {
      markup_pct: num(p.markup_pct, num(r.markup_pct, 0)),
      source: p.source || "",
      currency: p.currency || "CNY",
      library: p.library || "",
    },
  };
}

export async function getCredits() {
  const r = await authed<Partial<WalletInfo>>("/v1/credits");
  if (!r.ok) return r as { ok: false; error?: string; status?: number };
  return { ok: true as const, data: normalizeWallet(r.data) };
}

export interface CreditEvent {
  kind: string;
  amount: number; // fen (negative = spend)
  amount_yuan: number;
  site_id: string;
  endpoint: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export function getCreditHistory(limit = 50) {
  return authed<{ events: CreditEvent[] }>(`/v1/credits/history?limit=${limit}`);
}

// --- Per-site usage --------------------------------------------------------

export interface SiteUsage {
  site_id: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  spent_yuan: number;
}

export interface UsageTotal extends SiteUsage {
  tokens: number;
  spent_fen: number;
}

export function getUsageBySite(days = 30) {
  return authed<{ sites: SiteUsage[]; total: UsageTotal; days: number }>(
    `/v1/usage/by-site?days=${days}`,
  );
}

// --- Model catalog + selection (the API page) ------------------------------

export interface ModelPrice {
  billing: "token" | "job";
  markup_pct: number;
  unit: string;
  // token billing — RAW provider cost (NOT marked up):
  input_cny_per_m?: number;
  output_cny_per_m?: number;
  // job/media billing — RAW provider cost per 张/秒/万字符/次:
  price_cny_per_unit?: number;
  // raw cell text from the official doc (audit/debug):
  raw_input?: string;
  raw_output?: string;
}

export interface CatalogModel {
  key: string; // composite "<provider>:<model>" — the selection key
  id: string;
  provider: string;
  provider_label: string;
  label: string;
  note: string;
  family: string;
  category: string;
  unpriced: boolean;
  price: ModelPrice;
}

// One provider's models within a category (the picker groups by provider so a
// user picks BOTH a 厂商 and a model — same model name from two providers stays
// distinct via the composite key).
export interface CatalogProviderBlock {
  id: string;
  label: string;
  updated_at: string;
  source_url: string;
  models: CatalogModel[];
}

export interface CatalogGroup {
  id: string;
  label: string;
  providers: CatalogProviderBlock[];
  model_count: number;
  default_selection: string[];
}

export interface ProviderMeta {
  id: string;
  label: string;
  source_url: string;
  source_kind: string;
  generated_at: string;
  model_count: number;
}

export interface ModelCatalog {
  platform: string;
  providers: ProviderMeta[];
  groups: CatalogGroup[];
  default_selection: Record<string, string[]>;
  pricing: PricingMeta;
  updated_at: string;
  model_count: number;
}

function normalizePrice(raw: Partial<ModelPrice> | null | undefined): ModelPrice {
  const p = raw || {};
  return {
    billing: p.billing === "job" ? "job" : "token",
    markup_pct: num(p.markup_pct, 0),
    unit: p.unit || "",
    input_cny_per_m: num(p.input_cny_per_m),
    output_cny_per_m: num(p.output_cny_per_m),
    price_cny_per_unit: num(p.price_cny_per_unit),
    raw_input: p.raw_input || "",
    raw_output: p.raw_output || "",
  };
}

function normalizeModel(m: Partial<CatalogModel> | null | undefined, fallbackCat = ""): CatalogModel {
  const x = m || {};
  const provider = x.provider || "";
  const id = x.id || "";
  return {
    key: x.key || (provider && id ? `${provider}:${id}` : id),
    id,
    provider,
    provider_label: x.provider_label || provider,
    label: x.label || id,
    note: x.note || "",
    family: x.family || x.note || "",
    category: x.category || fallbackCat,
    unpriced: Boolean(x.unpriced),
    price: normalizePrice(x.price),
  };
}

function normalizeCatalog(raw: Partial<ModelCatalog> | null | undefined): ModelCatalog {
  const r = raw || {};
  const groups = Array.isArray(r.groups) ? r.groups : [];
  return {
    platform: r.platform || "阿里云百炼 · 火山方舟 · OpenRouter",
    providers: (Array.isArray(r.providers) ? r.providers : []).map((p) => ({
      id: p?.id || "",
      label: p?.label || p?.id || "",
      source_url: p?.source_url || "",
      source_kind: p?.source_kind || "",
      generated_at: p?.generated_at || "",
      model_count: num(p?.model_count),
    })),
    groups: groups.map((g) => ({
      id: g?.id || "",
      label: g?.label || "",
      providers: (Array.isArray(g?.providers) ? g.providers : []).map((pb) => ({
        id: pb?.id || "",
        label: pb?.label || pb?.id || "",
        updated_at: pb?.updated_at || "",
        source_url: pb?.source_url || "",
        models: (Array.isArray(pb?.models) ? pb.models : []).map((m) =>
          normalizeModel(m, g?.id || ""),
        ),
      })),
      model_count: num(g?.model_count),
      default_selection: Array.isArray(g?.default_selection) ? g.default_selection : [],
    })),
    default_selection:
      r.default_selection && typeof r.default_selection === "object"
        ? r.default_selection
        : {},
    pricing: {
      markup_pct: num(r.pricing?.markup_pct, 0),
      source: r.pricing?.source || "",
      source_url: r.pricing?.source_url || "",
      source_file: r.pricing?.source_file || "",
      generated_at: r.pricing?.generated_at || "",
      model_count: num(r.pricing?.model_count),
      currency: r.pricing?.currency || "CNY",
      library: r.pricing?.library || "",
    },
    updated_at: r.updated_at || r.pricing?.generated_at || "",
    model_count: num(r.model_count, num(r.pricing?.model_count)),
  };
}

// sessionStorage key for the catalog snapshot (instant render on repeat loads
// within a tab session). The HTTP layer already caches the network response;
// this avoids even the re-parse/normalize on quick back-and-forth navigation.
const CATALOG_CACHE_KEY = "oceanleo_model_catalog_v1";

function readCachedCatalog(): ModelCatalog | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    return normalizeCatalog(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeCachedCatalog(raw: unknown) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(raw));
  } catch {
    /* quota / private mode — ignore */
  }
}

export async function getModelCatalog() {
  const r = await publicGet<Partial<ModelCatalog>>("/v1/models/catalog");
  if (!r.ok) {
    // Network/gateway hiccup — fall back to the last good snapshot so the page
    // still renders the model list instead of an empty loading state.
    const cached = readCachedCatalog();
    if (cached) return { ok: true as const, data: cached };
    return r as { ok: false; error?: string };
  }
  writeCachedCatalog(r.data);
  return { ok: true as const, data: normalizeCatalog(r.data) };
}

export function getModelSelection() {
  return authed<{ selection: Record<string, string[]> }>("/v1/models/selection");
}

export function setModelSelection(category: string, model_ids: string[]) {
  return authed<{ ok: boolean; selection: Record<string, string[]> }>(
    "/v1/models/selection",
    { method: "PUT", body: JSON.stringify({ category, model_ids }) },
  );
}

interface SelectedModels {
  platform: string;
  groups: { id: string; label: string; models: CatalogModel[] }[];
}

export async function getSelectedModels() {
  const r = await authed<Partial<SelectedModels>>("/v1/models/selected");
  if (!r.ok) return r as { ok: false; error?: string; status?: number };
  const raw = r.data || {};
  const data: SelectedModels = {
    platform: raw.platform || "阿里云百炼",
    groups: (Array.isArray(raw.groups) ? raw.groups : []).map((g) => ({
      id: g?.id || "",
      label: g?.label || "",
      models: (Array.isArray(g?.models) ? g.models : []).map((m) =>
        normalizeModel(m, g?.id || ""),
      ),
    })),
  };
  return { ok: true as const, data };
}

// ---------------------------------------------------------------------------
// 全家桶统一模型选择 — getPreferredModel / getSelectedModelsByCategory
// ---------------------------------------------------------------------------
// 用户在「账户 → API」页按类目(text/image/video/audio/threed/music)选好模型，
// 这两个 helper 让**任何** *.oceanleo.com 站把那份选择直接接进自己的生成调用：
//   - getSelectedModelsByCategory(cat)  → 该类目的全部已选模型（渲染下拉用）
//   - getPreferredModel(cat)            → 该类目的首选模型（直接驱动一次调用）
// 调一次缓存进内存（每标签页），避免每次生成都打一发 /v1/models/selected。

export interface PreferredModel {
  key: string;       // 复合 "<provider>:<model>"
  id: string;        // 透传给网关的 model
  provider: string;  // 网关 provider（bailian / volcano / openrouter / tripo / stability …）
  provider_label: string;
  label: string;
  category: string;
}

// 各类目的兜底（未登录 / 无选择 / 拉取失败）。值与后端 _PREFERRED_DEFAULTS 各类目
// 首项保持一致（用户目录里 5 个类目：text/image/video/threed/audio；没有 music
// 类目——音乐站走独立 provider，不在用户可选目录内）。
const CATEGORY_FALLBACK: Record<string, PreferredModel> = {
  text: { key: "bailian:qwen-plus", id: "qwen-plus", provider: "bailian", provider_label: "阿里云百炼", label: "通义千问 Plus", category: "text" },
  image: { key: "bailian:qwen-image", id: "qwen-image", provider: "bailian", provider_label: "阿里云百炼", label: "通义万相 文生图", category: "image" },
  video: { key: "bailian:wan2.6-t2v", id: "wan2.6-t2v", provider: "bailian", provider_label: "阿里云百炼", label: "万相 2.6 文生视频", category: "video" },
  threed: { key: "bailian:Tripo/Tripo-H3.1", id: "Tripo/Tripo-H3.1", provider: "bailian", provider_label: "阿里云百炼", label: "Tripo H3.1", category: "threed" },
  audio: { key: "bailian:qwen-tts-flash", id: "qwen-tts-flash", provider: "bailian", provider_label: "阿里云百炼", label: "Qwen TTS Flash", category: "audio" },
};

let _selectedCache: { at: number; data: SelectedModels } | null = null;
const _SELECTED_TTL = 60_000; // 60s — 选择不常变；切站/重载会自然重取

async function _loadSelected(): Promise<SelectedModels | null> {
  const now = Date.now();
  if (_selectedCache && now - _selectedCache.at < _SELECTED_TTL) {
    return _selectedCache.data;
  }
  const r = await getSelectedModels();
  if (!r.ok || !r.data) return _selectedCache?.data || null;
  _selectedCache = { at: now, data: r.data };
  return r.data;
}

/** 清掉内存缓存——用户在 API 页改了选择后调用，让下次生成立刻拿到新选择。 */
export function invalidateSelectedModelsCache() {
  _selectedCache = null;
}

/** 某类目下用户已选的全部模型（渲染站内模型下拉用）。空则返回该类目兜底单项。 */
export async function getSelectedModelsByCategory(
  category: string,
): Promise<PreferredModel[]> {
  const data = await _loadSelected();
  const group = data?.groups.find((g) => g.id === category);
  const models = (group?.models || []).map((m) => ({
    key: m.key,
    id: m.id,
    provider: m.provider,
    provider_label: m.provider_label,
    label: m.label,
    category,
  }));
  if (models.length > 0) return models;
  const fb = CATEGORY_FALLBACK[category];
  return fb ? [fb] : [];
}

/** 某类目的首选模型（已选列表第一项），用于直接驱动一次生成调用。 */
export async function getPreferredModel(
  category: string,
): Promise<PreferredModel> {
  const list = await getSelectedModelsByCategory(category);
  return list[0] || CATEGORY_FALLBACK[category] || CATEGORY_FALLBACK.text;
}

// ---------------------------------------------------------------------------
// BYOK — 自带 API key（厂商元数据 + key 增删查）
// ---------------------------------------------------------------------------
// 用户在「账户 → API」页填自己的厂商 key，即可免费使用全家桶服务（用自己的 key、
// 自己的成本）。明文 key 经 AES-256-GCM 加密存储，前端只拿得到指纹（sk-…ab3f），
// 绝不回显明文。一个厂商一把 active key。

export interface ProviderMetaBYOK {
  id: string;
  name: string;
  needs_base_url: boolean;
  default_model: string;
  protocol: string;
  capabilities: string[]; // text / image / video / audio / threed
  key_help_url: string;
  key_prefix: string;
}

export function getKeyProviders() {
  return publicGet<{ providers: ProviderMetaBYOK[] }>("/v1/keys/providers");
}

export interface UserKey {
  id: string;
  provider: string;
  label: string;
  fingerprint: string; // 安全展示用：sk-…ab3f
  base_url: string | null;
  is_active: boolean;
  created_at: string;
}

export function listUserKeys() {
  return authed<{ keys: UserKey[] }>("/v1/keys");
}

export function addUserKey(input: {
  provider: string;
  api_key: string;
  label?: string;
  base_url?: string;
}) {
  return authed<{ key: UserKey }>("/v1/keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteUserKey(keyId: string) {
  return authed<{ ok: boolean }>(`/v1/keys/${keyId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// 审计 — 每次调用「发给 API / 从 API 得到」的完整内容（仅保留 24 小时，仅本人可读）
// ---------------------------------------------------------------------------

export interface AuditMedia {
  src: string;
  snapshot: string; // 转存后的 24h URL；空则用 src（可能已过期）
}

export interface AuditRecord {
  request_id: string;
  site_id: string;
  endpoint: string;
  provider: string;
  model: string;
  key_mode: string; // platform | byok
  request_json: Record<string, unknown>;
  response_json: Record<string, unknown>;
  price_cny: number;
  prompt_tokens: number;
  completion_tokens: number;
  created_at: string;
}

export function getAudit(requestId: string) {
  return authed<AuditRecord>(`/v1/audit/${requestId}`);
}
