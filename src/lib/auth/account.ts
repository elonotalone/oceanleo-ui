"use client";

import { accessToken } from "./client";
import { GATEWAY_BASE } from "./config";
import type {
  CapabilitySelection,
  ModelTierId,
  ModelTierSelection,
} from "../model-tier";
export type {
  CapabilitySelection,
  ModelTierId,
  ModelTierSelection,
} from "../model-tier";

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
  capabilities: string[];
  capability_labels: string[];
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

export interface CatalogCapability {
  id: string;
  label: string;
  description: string;
  providers: CatalogProviderBlock[];
  model_count: number;
  default_selection: string[];
}

export interface CatalogGroup {
  id: string;
  label: string;
  providers: CatalogProviderBlock[];
  capabilities: CatalogCapability[];
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
  capability_default_selection: Record<string, Record<string, string[]>>;
  tier_selection: ModelTierSelection;
  default_tier: ModelTierId;
  capability_schema_version: string;
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
    capabilities: Array.isArray(x.capabilities) ? x.capabilities : [],
    capability_labels: Array.isArray(x.capability_labels) ? x.capability_labels : [],
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
      capabilities: (Array.isArray(g?.capabilities) ? g.capabilities : []).map((cap) => ({
        id: cap?.id || "",
        label: cap?.label || cap?.id || "",
        description: cap?.description || "",
        providers: (Array.isArray(cap?.providers) ? cap.providers : []).map((pb) => ({
          id: pb?.id || "",
          label: pb?.label || pb?.id || "",
          updated_at: pb?.updated_at || "",
          source_url: pb?.source_url || "",
          models: (Array.isArray(pb?.models) ? pb.models : []).map((m) =>
            normalizeModel(m, g?.id || ""),
          ),
        })),
        model_count: num(cap?.model_count),
        default_selection: Array.isArray(cap?.default_selection) ? cap.default_selection : [],
      })),
      model_count: num(g?.model_count),
      default_selection: Array.isArray(g?.default_selection) ? g.default_selection : [],
    })),
    default_selection:
      r.default_selection && typeof r.default_selection === "object"
        ? r.default_selection
        : {},
    capability_default_selection:
      r.capability_default_selection && typeof r.capability_default_selection === "object"
        ? r.capability_default_selection
        : {},
    tier_selection:
      r.tier_selection && typeof r.tier_selection === "object"
        ? r.tier_selection
        : ({ lite: {}, pro: {}, max: {} } as ModelTierSelection),
    default_tier:
      r.default_tier === "lite" || r.default_tier === "max"
        ? r.default_tier
        : "pro",
    capability_schema_version: r.capability_schema_version || "0",
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
const CATALOG_CACHE_KEY = "oceanleo_model_catalog_v3";

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

export interface ModelSelectionPayload {
  selection: Record<string, string[]>;
  capability_selection: CapabilitySelection;
  active_group_key?: string;
}

export function getModelSelection() {
  return authed<ModelSelectionPayload>("/v1/models/selection");
}

export async function setModelSelection(
  category: string,
  capability: string,
  model_ids: string[],
) {
  const result = await authed<{ ok: boolean } & ModelSelectionPayload>(
    "/v1/models/selection",
    { method: "PUT", body: JSON.stringify({ category, capability, model_ids }) },
  );
  if (result.ok) invalidateSelectedModelsCache();
  return result;
}

export async function setModelTier(tier: ModelTierId) {
  const result = await authed<
    { ok: boolean; tier: ModelTierId } & ModelSelectionPayload
  >("/v1/models/selection/tier", {
    method: "PUT",
    body: JSON.stringify({ tier }),
  });
  if (result.ok) invalidateSelectedModelsCache();
  return result;
}

export type ModelGroupKind = "preset" | "custom";

export interface ModelGroup {
  key: string;
  id: string;
  kind: ModelGroupKind;
  name: string;
  editable: boolean;
  selection: CapabilitySelection;
  created_at?: string;
  updated_at?: string;
}

export interface ModelGroupsPayload extends ModelSelectionPayload {
  groups: ModelGroup[];
  active_group_key: string;
  default_group_key: string;
}

export const MODEL_GROUP_CHANGED_EVENT = "oceanleo:model-group-changed";

function announceModelGroupChange(data: ModelGroupsPayload) {
  invalidateSelectedModelsCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<ModelGroupsPayload>(MODEL_GROUP_CHANGED_EVENT, {
        detail: data,
      }),
    );
  }
}

export function getModelGroups() {
  return authed<ModelGroupsPayload>("/v1/models/groups");
}

export async function createModelGroup(name: string, cloneFrom = "") {
  const result = await authed<
    { ok: boolean; group: ModelGroup } & ModelGroupsPayload
  >("/v1/models/groups", {
    method: "POST",
    body: JSON.stringify({ name, clone_from: cloneFrom }),
  });
  if (result.ok && result.data) announceModelGroupChange(result.data);
  return result;
}

export async function updateModelGroup(
  groupId: string,
  patch: { name?: string; selection?: CapabilitySelection },
) {
  const result = await authed<
    { ok: boolean; group: ModelGroup } & ModelGroupsPayload
  >(`/v1/models/groups/${encodeURIComponent(groupId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (result.ok && result.data) announceModelGroupChange(result.data);
  return result;
}

export async function deleteModelGroup(groupId: string) {
  const result = await authed<{ ok: boolean } & ModelGroupsPayload>(
    `/v1/models/groups/${encodeURIComponent(groupId)}`,
    { method: "DELETE" },
  );
  if (result.ok && result.data) announceModelGroupChange(result.data);
  return result;
}

export async function setActiveModelGroup(groupKey: string) {
  const result = await authed<{ ok: boolean } & ModelGroupsPayload>(
    "/v1/models/groups/active",
    {
      method: "PUT",
      body: JSON.stringify({ group_key: groupKey }),
    },
  );
  if (result.ok && result.data) announceModelGroupChange(result.data);
  return result;
}

export interface SelectedCapability {
  id: string;
  label: string;
  description: string;
  models: CatalogModel[];
}

export interface SelectedModels {
  platform: string;
  groups: {
    id: string;
    label: string;
    models: CatalogModel[];
    capabilities: SelectedCapability[];
  }[];
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
      capabilities: (Array.isArray(g?.capabilities) ? g.capabilities : []).map((cap) => ({
        id: cap?.id || "",
        label: cap?.label || cap?.id || "",
        description: cap?.description || "",
        models: (Array.isArray(cap?.models) ? cap.models : []).map((m) =>
          normalizeModel(m, g?.id || ""),
        ),
      })),
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
  capabilities: string[];
  capability_labels: string[];
}

// 各类目的兜底（未登录 / 无选择 / 拉取失败）。值与后端 _PREFERRED_DEFAULTS 各类目
// 首项保持一致（用户目录里 5 个类目：text/image/video/threed/audio；没有 music
// 类目——音乐站走独立 provider，不在用户可选目录内）。
const CATEGORY_FALLBACK: Record<string, PreferredModel> = {
  text: { key: "bailian:qwen3.5-plus", id: "qwen3.5-plus", provider: "bailian", provider_label: "阿里云百炼", label: "Qwen 3.5 Plus", category: "text", capabilities: ["general"], capability_labels: ["通用对话"] },
  image: { key: "bailian:qwen-image-2.0-pro", id: "qwen-image-2.0-pro", provider: "bailian", provider_label: "阿里云百炼", label: "Qwen Image 2.0 Pro", category: "image", capabilities: ["text_to_image"], capability_labels: ["文生图"] },
  video: { key: "bailian:wan2.7-t2v", id: "wan2.7-t2v", provider: "bailian", provider_label: "阿里云百炼", label: "万相 2.7 文生视频", category: "video", capabilities: ["text_to_video"], capability_labels: ["文生视频"] },
  threed: { key: "bailian:Tripo/Tripo-H3.1", id: "Tripo/Tripo-H3.1", provider: "bailian", provider_label: "阿里云百炼", label: "Tripo H3.1", category: "threed", capabilities: ["general_3d"], capability_labels: ["通用 3D 生成"] },
  audio: { key: "bailian:qwen3-tts-flash", id: "qwen3-tts-flash", provider: "bailian", provider_label: "阿里云百炼", label: "Qwen3 TTS Flash", category: "audio", capabilities: ["text_to_speech"], capability_labels: ["文本转语音"] },
};

function capabilityFallback(
  category: string,
  capability: string,
  label: string,
  key: string,
  modelLabel: string,
): PreferredModel {
  const [provider, ...idParts] = key.split(":");
  return {
    key,
    id: idParts.join(":"),
    provider,
    provider_label:
      provider === "bailian"
        ? "阿里云百炼"
        : provider === "volcano"
          ? "火山方舟"
          : "OpenRouter",
    label: modelLabel,
    category,
    capabilities: [capability],
    capability_labels: [label],
  };
}

const CAPABILITY_FALLBACK: Record<string, PreferredModel> = {
  "text:general": CATEGORY_FALLBACK.text,
  "text:reasoning": capabilityFallback("text", "reasoning", "深度推理", "bailian:qwen3-next-80b-a3b-thinking", "Qwen3 Next 80B Thinking"),
  "text:coding": capabilityFallback("text", "coding", "代码编程", "bailian:qwen3-coder-plus", "Qwen3 Coder Plus"),
  "text:vision": capabilityFallback("text", "vision", "视觉理解", "bailian:qwen3-vl-plus", "Qwen3 VL Plus"),
  "text:audio_understanding": capabilityFallback("text", "audio_understanding", "音频理解", "bailian:qwen3.5-omni-plus", "Qwen 3.5 Omni Plus"),
  "text:translation": capabilityFallback("text", "translation", "翻译", "bailian:qwen-mt-plus", "Qwen MT Plus"),
  "text:document_research": capabilityFallback("text", "document_research", "文档与研究", "bailian:qwen-long", "Qwen Long"),
  "image:text_to_image": CATEGORY_FALLBACK.image,
  "image:image_to_image": capabilityFallback("image", "image_to_image", "图生图", "bailian:qwen-image-edit-max", "Qwen Image Edit Max"),
  "image:local_editing": capabilityFallback("image", "local_editing", "局部编辑与扩图", "bailian:wanx-x-painting", "万相局部重绘"),
  "image:background_segmentation": capabilityFallback("image", "background_segmentation", "背景与抠图", "bailian:wanx-background-generation-v2", "万相背景生成"),
  "image:portrait_product": capabilityFallback("image", "portrait_product", "人像与商品图", "bailian:wanx-style-repaint-v1", "万相人像风格重绘"),
  "image:design": capabilityFallback("image", "design", "海报与创意设计", "bailian:wanx-poster-generation-v1", "万相创意海报"),
  "image:image_translation": capabilityFallback("image", "image_translation", "图片翻译", "bailian:qwen-mt-image", "Qwen 图片翻译"),
  "image:general_image": capabilityFallback("image", "general_image", "通用图片生成", "volcano:doubao-seedream-4.5", "Doubao Seedream 4.5"),
  "video:text_to_video": CATEGORY_FALLBACK.video,
  "video:image_to_video": capabilityFallback("video", "image_to_video", "图生视频", "bailian:wan2.7-i2v", "万相 2.7 图生视频"),
  "video:keyframe_to_video": capabilityFallback("video", "keyframe_to_video", "首尾帧生视频", "bailian:wan2.2-kf2v-flash", "万相 2.2 首尾帧"),
  "video:reference_to_video": capabilityFallback("video", "reference_to_video", "参考生视频", "bailian:wan2.7-r2v", "万相 2.7 参考生视频"),
  "video:video_editing": capabilityFallback("video", "video_editing", "视频编辑", "bailian:wan2.7-videoedit", "万相 2.7 视频编辑"),
  "video:avatar_motion": capabilityFallback("video", "avatar_motion", "人物与动作", "bailian:wan2.2-animate-move", "万相图生动作"),
  "video:general_video": capabilityFallback("video", "general_video", "通用视频生成", "bailian:kling/kling-v3-omni-video-generation", "Kling V3 Omni"),
  "threed:general_3d": CATEGORY_FALLBACK.threed,
  "audio:text_to_speech": CATEGORY_FALLBACK.audio,
  "audio:speech_to_text": capabilityFallback("audio", "speech_to_text", "语音识别", "bailian:paraformer-v2", "Paraformer V2"),
  "audio:speech_translation": capabilityFallback("audio", "speech_translation", "语音翻译", "bailian:qwen3.5-livetranslate-flash-realtime", "Qwen 3.5 LiveTranslate"),
  "audio:music_generation": capabilityFallback("audio", "music_generation", "音乐生成", "bailian:fun-music-v1", "Fun Music V1"),
  "audio:audio_dialogue": capabilityFallback("audio", "audio_dialogue", "语音对话", "openrouter:openai/gpt-audio", "OpenAI GPT Audio"),
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
    capabilities: m.capabilities,
    capability_labels: m.capability_labels,
  }));
  if (models.length > 0) return models;
  const fb = CATEGORY_FALLBACK[category];
  return fb ? [fb] : [];
}

/** 某能力小类下用户已选的模型；空时回落到大类的安全默认。 */
export async function getSelectedModelsByCapability(
  category: string,
  capability: string,
): Promise<PreferredModel[]> {
  const data = await _loadSelected();
  const group = data?.groups.find((g) => g.id === category);
  const capabilityGroup = group?.capabilities.find((item) => item.id === capability);
  const models = (capabilityGroup?.models || []).map((m) => ({
    key: m.key,
    id: m.id,
    provider: m.provider,
    provider_label: m.provider_label,
    label: m.label,
    category,
    capabilities: m.capabilities,
    capability_labels: m.capability_labels,
  }));
  if (models.length > 0) return models;
  const fallback = CAPABILITY_FALLBACK[`${category}:${capability}`];
  return fallback ? [fallback] : [];
}

/** 某大类或能力小类的首选模型，用于直接驱动一次生成调用。 */
export async function getPreferredModel(
  category: string,
  capability = "",
): Promise<PreferredModel> {
  const list = capability
    ? await getSelectedModelsByCapability(category, capability)
    : await getSelectedModelsByCategory(category);
  return (
    list[0]
    || (capability ? CAPABILITY_FALLBACK[`${category}:${capability}`] : undefined)
    || CATEGORY_FALLBACK[category]
    || CATEGORY_FALLBACK.text
  );
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
