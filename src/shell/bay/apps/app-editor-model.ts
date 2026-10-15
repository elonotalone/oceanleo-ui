import type { HostedSite } from "../../../api/hosted-sites";
import { deadlineFromRow, deadlineToPayload } from "../form/bay-deadline";
import type { BayAppMine, BayAppPatchInput } from "../../../lib/bay/apps";
import {
  audienceDone,
  audienceMemberIds,
  emptyAudience,
  normalizeAudience,
  type BayAudience,
} from "../form/bay-audience";
import { BAY_GALLERY_MAX, cleanGalleryUrls, galleryCoverUrl } from "../form/bay-gallery";

export type AppPriceModel = "free" | "one_time" | "subscription";

export type AppDraft = {
  title: string;
  summary: string;
  description: string;
  coverUrl: string;
  galleryUrls: string[];
  category: string;
  embedMode: "embed" | "link";
  url: string;
  endpointId: string;
  customTerms: string;
  audience: BayAudience;
  deadlineAt: string;
  priceModel: AppPriceModel;
  price: string;
};

const TITLE_LIMIT = 80;
const SUMMARY_LIMIT = 200;
const DESCRIPTION_LIMIT = 4000;

function priceInputFromFen(fen: number): string {
  if (!Number.isFinite(fen) || fen <= 0) return "";
  const yuan = fen / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

export function parseAppPriceFen(text: string | undefined): number | null {
  const raw = String(text ?? "").trim();
  if (!raw) return 0;
  if (raw.includes("-")) return null;
  const value = Number(raw.replace(/[,，\s]/g, ""));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function priceModelOf(value: string | null | undefined): AppPriceModel {
  if (value === "subscription" || value === "one_time") return value;
  return "free";
}

function audienceFromApp(app: Pick<BayAppMine, "audience_mode" | "audience_handle" | "audience_member_ids">): BayAudience {
  return normalizeAudience({
    mode: app.audience_mode || "public",
    handle: app.audience_handle || "",
    members: (app.audience_member_ids || []).map((userId) => ({ userId, name: userId })),
  });
}

export function draftFromApp(app: BayAppMine): AppDraft {
  return {
    title: app.title || "",
    summary: app.summary || "",
    description: app.description || "",
    coverUrl: galleryCoverUrl(cleanGalleryUrls(app.gallery_urls, app.cover_url)),
    galleryUrls: cleanGalleryUrls(app.gallery_urls, app.cover_url),
    category: app.category || "",
    embedMode: app.embed_mode === "link" ? "link" : "embed",
    url: app.url || "",
    endpointId: app.endpoint_id || "",
    customTerms: typeof app.custom_terms === "string" ? app.custom_terms : "",
    audience: audienceFromApp(app),
    deadlineAt: deadlineFromRow(app.deadline_at),
    priceModel: priceModelOf(app.price_model),
    price: priceInputFromFen(app.price_fen || 0),
  };
}

/** 选定来源建草稿后留在本页：已填的名称等不要被网关空字段盖掉。 */
export function mergeCreatedDraft(row: BayAppMine, current: AppDraft): AppDraft {
  const fromRow = draftFromApp(row);
  return {
    ...fromRow,
    title: current.title || fromRow.title,
    summary: current.summary || fromRow.summary,
    description: current.description || fromRow.description,
    coverUrl: current.coverUrl || fromRow.coverUrl,
    galleryUrls: current.galleryUrls?.length ? current.galleryUrls : fromRow.galleryUrls,
    category: current.category || fromRow.category,
    embedMode: current.embedMode || fromRow.embedMode,
    url: fromRow.url || current.url,
    endpointId: fromRow.endpointId || current.endpointId,
    customTerms: current.customTerms || fromRow.customTerms,
    audience: current.audience ?? fromRow.audience,
    deadlineAt: current.deadlineAt || fromRow.deadlineAt,
    priceModel: current.priceModel || fromRow.priceModel,
    price: current.price || fromRow.price,
  };
}

export function pricingFromDraft(
  draft: AppDraft,
  app: Pick<BayAppMine, "price_model" | "price_fen" | "trial_days">,
): { price_model: AppPriceModel; price_fen: number; trial_days: number } | null {
  const priceModel = priceModelOf(draft.priceModel);
  const fen = parseAppPriceFen(draft.price);
  if (priceModel !== "free" && (fen === null || fen <= 0)) return null;
  const priceFen = priceModel === "free" ? 0 : fen || 0;
  const trialDays = priceModel === "free" ? 0 : app.trial_days || 0;
  if (priceModel === priceModelOf(app.price_model) && priceFen === (app.price_fen || 0) && trialDays === (app.trial_days || 0)) {
    return null;
  }
  return { price_model: priceModel, price_fen: priceFen, trial_days: trialDays };
}

export function patchFromDraft(draft: AppDraft, app: BayAppMine): BayAppPatchInput {
  const patch: BayAppPatchInput = {};
  if (draft.title !== (app.title || "")) patch.title = draft.title;
  if (draft.summary !== (app.summary || "")) patch.summary = draft.summary;
  if (draft.description !== (app.description || "")) patch.description = draft.description;
  const gallery = cleanGalleryUrls(draft.galleryUrls, draft.coverUrl).slice(0, BAY_GALLERY_MAX);
  const prevGallery = cleanGalleryUrls(app.gallery_urls, app.cover_url);
  const nextCover = galleryCoverUrl(gallery) || null;
  if (nextCover !== (app.cover_url || null)) patch.cover_url = nextCover;
  if (gallery.join("\0") !== prevGallery.join("\0")) patch.gallery_urls = gallery;
  if (draft.category !== (app.category || "")) patch.category = draft.category;
  if (app.source_kind === "external" && draft.url !== (app.url || "")) patch.url = draft.url;
  if (app.source_kind === "computer" && draft.endpointId && draft.endpointId !== (app.endpoint_id || "")) {
    patch.endpoint_id = draft.endpointId;
  }
  const nextTerms = (draft.customTerms || "").trim();
  const prevTerms = typeof app.custom_terms === "string" ? app.custom_terms : "";
  if (nextTerms !== prevTerms) patch.custom_terms = nextTerms || null;
  const audience = draft.audience ?? emptyAudience();
  const prevMode = app.audience_mode || "public";
  const prevHandle = app.audience_handle || "";
  const prevMembers = [...new Set(app.audience_member_ids || [])].filter(Boolean);
  const nextHandle = audience.mode === "invited" ? audience.handle.trim() || audience.members[0]?.name || "" : "";
  const nextMembers = audience.mode === "invited" || audience.mode === "group" ? audienceMemberIds(audience) : [];
  if (audience.mode !== prevMode) patch.audience_mode = audience.mode;
  if (nextHandle !== prevHandle) patch.audience_handle = nextHandle || null;
  if (nextMembers.join("\0") !== prevMembers.join("\0")) patch.audience_member_ids = nextMembers;
  const nextDeadline = draft.deadlineAt || "";
  const prevDeadline = deadlineFromRow(app.deadline_at);
  if (nextDeadline !== prevDeadline) patch.deadline_at = deadlineToPayload(nextDeadline);
  return patch;
}

export function draftProblems(draft: AppDraft): string[] {
  const problems: string[] = [];
  if (!draft.title.trim()) problems.push("请填写标题");
  else if (draft.title.length > TITLE_LIMIT) problems.push("标题不能超过 80 个字");
  if (draft.summary.length > SUMMARY_LIMIT) problems.push("一句话简介不能超过 200 个字");
  if (draft.description.length > DESCRIPTION_LIMIT) problems.push("详细介绍不能超过 4000 个字");
  const gallery = cleanGalleryUrls(draft.galleryUrls, draft.coverUrl);
  if (!gallery.length) {
    problems.push(draft.coverUrl.trim() ? "封面图需要是 https 开头的图片地址" : "至少一张预览图");
  }
  if (!draft.category.trim()) problems.push("请选择一个站点类目");
  const priceModel = priceModelOf(draft.priceModel);
  if (priceModel !== "free" && draft.price.trim()) {
    const fen = parseAppPriceFen(draft.price);
    if (fen === null || fen < 0) problems.push("价格不是合法金额");
  }
  const audience = draft.audience ?? emptyAudience();
  if (!audienceDone(audience)) problems.push("请选择要给谁看");
  return problems;
}

export function statusLabel(app: Pick<BayAppMine, "status" | "moderation_hidden">): string {
  if (app.moderation_hidden) return "已被平台隐藏";
  if (app.status === "published") return "已上架";
  if (app.status === "offline") return "已下架";
  return "草稿";
}

export function embedNote(app: Pick<BayAppMine, "embed_ok">): string {
  if (app.embed_ok === true) return "这个网站可以在页内窗口里显示";
  if (app.embed_ok === false) return '这个网站不允许被嵌入，访客会看到"打开网站"按钮';
  return "还没检测";
}

export function liveHostedSites(items: HostedSite[]): HostedSite[] {
  return items.filter((item) => item.status === "live");
}
