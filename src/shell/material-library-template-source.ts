/**
 * 官方模板素材目录（`GET /v1/template-materials`）。
 *
 * 「点预览&编辑跳进素材库，但素材库里根本没有那个素材」的根因就在这条链缺席：
 * 素材库以前只认 `/v1/library/*`，那些端点全带权限，所以 tab 跳对了、面板照样是空的。
 *
 * 为什么是这个端点而不是 `/v1/library/editable-shelf`：货架端点带权限（匿名 401），
 * 返回的是「**当前调用者**能编辑什么」。官方模板是产品内容，而从首页卡片跳进来的
 * 用户默认没有会话——拿货架当列表源，匿名态永远是空的。
 *
 * 这些行**不是 durable artifact**：目录端点刻意不下发 revision 身份，所以它们永远
 * 满足不了 `isDurableLibraryItem`。这正是想要的效果——条目可浏览、可预览，而每一条
 * 变更路径仍然要求一份真的 artifact projection。
 *
 * 独立成文件而不是并进 `material-library-controller.ts`：那个模块已经贴着 800 行
 * 硬顶（`material-library-scope.test.mjs`），而这里是一条自成一体的取数链。
 */

import { assetPreviewUrl, assetThumbUrl } from "../lib/asset-thumb";
import { ARTIFACT_TYPES, type ArtifactType } from "./artifact-contract";
import type { ArtifactApiResult } from "./artifact-client";
import {
  safeDeckHtmlRuntimeUrl,
  type DeckDeliveryFamily,
} from "./deck-delivery-family";
import type { LibraryItem } from "./library-data";
import { MATERIAL_TAXONOMY_LABEL } from "./material-library-controller";
import type { WorkspaceActionEnvelope } from "./workspace-actions";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";
import { currentDomainProfile } from "../contracts/domain-family";

// env 仍然优先；没给时按**当前家族**取网关（contracts/domain-family.ts）。
// `.com` 与本地开发解析出来的仍是 https://api.oceanleo.com（逐字不变）。
const GATEWAY =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_GATEWAY_URL)) ||
  currentDomainProfile().gatewayOrigin;
// ============================================================================

export interface TemplateMaterialListing {
  /** Stable catalog key, unique within its app (`<appId>-<n>`). */
  id: string;
  title: string;
  summary: string;
  tags: string[];
  /** Bare `<category>/<slug>` OSS key, or an absolute https URL. */
  previewKey: string;
  artifactId: string;
  artifactType: ArtifactType;
  siteKey: string;
  appId: string;
  /** Pinned-revision geometry; 0 when the catalog could not resolve it. */
  width: number;
  height: number;
  /**
   * 服务端为这一行 pinned revision 出具的交付家族；目录解析不出来时是空串。
   * 与 `width`/`height` 同一条纪律：补充项，永不成为前提。
   */
  deliveryFamily: DeckDeliveryFamily | "";
  /** 隔离域播放地址；缺席或形状不合格时是空串。 */
  activeRuntimeUrl: string;
}

export const TEMPLATE_MATERIAL_ENTRY_PREFIX = "template-material:";

const TEMPLATE_MATERIAL_TTL_MS = 5 * 60_000;
const BARE_PREVIEW_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const templateMaterialCache = new Map<
  string,
  { items: TemplateMaterialListing[]; storedAt: number }
>();
const templateMaterialPending = new Map<
  string,
  Promise<ArtifactApiResult<TemplateMaterialListing[]>>
>();

function templateText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function templateDimension(value: unknown): number {
  const size = typeof value === "number" ? value : Number(value);
  return Number.isFinite(size) && size > 0 ? Math.floor(size) : 0;
}

/**
 * 服务端出具的交付家族。只认 `"pptx"` / `"html"` 两个字面量（大小写与空白无所谓），
 * 其余取值、空串、缺失一律当没声明——这是分类器唯一肯采信的家族证据，
 * 放宽它等于把货架上的老件凭空搬进 HTML 板块。
 */
function templateDeliveryFamily(value: unknown): DeckDeliveryFamily | "" {
  const family = templateText(value).toLowerCase();
  return family === "pptx" || family === "html" ? family : "";
}

/**
 * `assetThumbUrl` passes absolute URLs straight through, so the preview key is
 * the one catalog field that can turn into an arbitrary image request. Accept
 * the bare OSS key the registry stores, or an absolute https URL, and nothing
 * else — no `http:`, no traversal.
 */
function safeTemplatePreviewKey(value: unknown): string {
  const raw = templateText(value);
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    try {
      const url = new URL(raw);
      return url.protocol === "https:" ? url.toString() : "";
    } catch {
      return "";
    }
  }
  return BARE_PREVIEW_KEY.test(raw) && !raw.includes("..") ? raw : "";
}

/**
 * 丢行原因。分类是给「货架少了几份」这个症状用的**分诊**，不是给单行看的：
 * `unsafe-preview-key` 指向注册表里的 key 形状（上一轮那 9 行冒号 key 就是这一类），
 * `unknown-artifact-type` 指向前后端类型枚举漂移，`missing-*` 指向目录行本身残缺。
 */
export type TemplateMaterialDropReason =
  | "not-an-object"
  | "missing-id"
  | "missing-artifact-id"
  | "unknown-artifact-type"
  | "unsafe-preview-key";

export interface TemplateMaterialDropTally {
  /** 看过的行数（含被丢掉的）。 */
  seen: number;
  dropped: number;
  reasons: Partial<Record<TemplateMaterialDropReason, number>>;
}

function templateMaterialDropReason(
  raw: Record<string, unknown>,
  previewKey: string,
): TemplateMaterialDropReason | null {
  if (!templateText(raw.id)) return "missing-id";
  if (!templateText(raw.artifactId)) return "missing-artifact-id";
  if (
    !(ARTIFACT_TYPES as readonly string[]).includes(templateText(raw.artifactType))
  ) {
    return "unknown-artifact-type";
  }
  return previewKey ? null : "unsafe-preview-key";
}

export function normalizeTemplateMaterial(
  value: unknown,
  tally?: TemplateMaterialDropTally,
): TemplateMaterialListing | null {
  if (tally) tally.seen += 1;
  const drop = (reason: TemplateMaterialDropReason): null => {
    if (tally) {
      tally.dropped += 1;
      tally.reasons[reason] = (tally.reasons[reason] || 0) + 1;
    }
    return null;
  };
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!raw) return drop("not-an-object");
  const previewKey = safeTemplatePreviewKey(raw.previewUrl);
  const reason = templateMaterialDropReason(raw, previewKey);
  if (reason) return drop(reason);
  const id = templateText(raw.id);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map(templateText).filter(Boolean)
    : [];
  return {
    id,
    title: templateText(raw.title) || id,
    summary: templateText(raw.summary),
    tags,
    previewKey,
    artifactId: templateText(raw.artifactId),
    artifactType: templateText(raw.artifactType) as ArtifactType,
    siteKey: templateText(raw.siteKey),
    appId: templateText(raw.appId),
    width: templateDimension(raw.width),
    height: templateDimension(raw.height),
    deliveryFamily: templateDeliveryFamily(raw.deliveryFamily),
    // URL 的形状不在这里判：`safeDeckHtmlRuntimeUrl()` 是唯一那道闸（精确
    // `s-<32hex>.oceanleo.app[/embed]`，不许 userinfo / 端口 / query / fragment）。
    // 这是导航 sink，判据只能有一处，多一处就会两处慢慢走偏。
    activeRuntimeUrl: safeDeckHtmlRuntimeUrl(raw.activeRuntimeUrl),
  };
}

export function templateMaterialEntryId(
  material: TemplateMaterialListing,
): string {
  return `${TEMPLATE_MATERIAL_ENTRY_PREFIX}${material.id}`;
}

/**
 * `artifactId` / `artifactType` stay in `meta` rather than on the item itself:
 * promoting them would make the row look durable to every `isDurableLibraryItem`
 * caller while the revision identity that gives those fields meaning is absent.
 */
export function templateMaterialLibraryItem(
  material: TemplateMaterialListing,
): LibraryItem {
  const key = templateMaterialEntryId(material);
  const preview = assetPreviewUrl(material.previewKey);
  return {
    key,
    source: "artifact",
    id: key,
    // The only bytes a signed-out visitor can read are the preview image, so
    // the viewer is the image viewer whatever the sample's own type is.
    kind: "image",
    title: material.title,
    siteId: material.siteKey,
    url: preview,
    previewUrl: preview,
    thumbUrl: assetThumbUrl(material.previewKey) || preview,
    favorite: false,
    meta: {
      workspace_library_surface: "materials",
      template_material_id: material.id,
      template_material_site_key: material.siteKey,
      template_material_app_id: material.appId,
      template_material_artifact_id: material.artifactId,
      template_material_artifact_type: material.artifactType,
      template_material_download_path: `/v1/template-materials/${material.id}/download`,
      // W1 的自适应主预览按真实宽高排版；解析不出来时留 0，由调用方退化。
      width: material.width,
      height: material.height,
      // 这两个键的名字是 `deck-delivery-family.ts` 已经在读的那两个
      // （`DELIVERY_FAMILY_META_KEYS` / `DECK_HTML_RUNTIME_META_KEYS`）。
      // 不够格就**整个键不出现**：分类器只在键真的在的时候才据它归类，
      // 一个空串会让「没声明」和「声明了空」混成一件事。
      ...(material.deliveryFamily
        ? { deliveryFamily: material.deliveryFamily }
        : {}),
      ...(material.activeRuntimeUrl
        ? { activeRuntimeUrl: material.activeRuntimeUrl }
        : {}),
    },
  };
}

export function templateMaterialEntry(
  material: TemplateMaterialListing,
): WorkspaceLibraryEntry {
  const item = templateMaterialLibraryItem(material);
  return {
    id: item.key,
    title: material.title,
    description: material.summary,
    category: MATERIAL_TAXONOMY_LABEL[material.artifactType] || "素材",
    keywords: [
      material.artifactType,
      material.id,
      material.artifactId,
      material.appId,
      ...material.tags,
    ].filter(Boolean),
    thumbUrl: item.thumbUrl,
    kind: item.kind,
    libraryItem: item,
    externalUrl: item.previewUrl,
  };
}

/**
 * Official template entries are not durable artifacts, so
 * `isTrustedEditableMaterialEntry` rejects them by construction. This is the
 * narrow, explicit exception the shelf makes for them — matched on the entry id
 * this module mints, never on anything the response controls.
 */
export function isOfficialTemplateMaterialEntry(
  entry: WorkspaceLibraryEntry,
): boolean {
  return (
    entry.id.startsWith(TEMPLATE_MATERIAL_ENTRY_PREFIX) &&
    typeof entry.libraryItem?.meta.template_material_id === "string" &&
    Boolean(entry.libraryItem.meta.template_material_id)
  );
}

/**
 * 接口 A 的消费端。W2 的深链把素材写成 `item=<...>`，而「那一份」在目录里同时有
 * 两个稳定身份（catalog key 与 artifactId），首页卡片用哪一个由 W2 敲定。两个都认，
 * 外加 durable 条目那套 `artifact:<artifactId>:<revisionId>` 写法，深链就不会因为
 * 命名口径分歧而落空。
 */
export function templateMaterialMatchesItemId(
  material: TemplateMaterialListing,
  itemId: string,
): boolean {
  const wanted = (itemId || "").trim();
  if (!wanted) return false;
  if (
    wanted === material.id ||
    wanted === material.artifactId ||
    wanted === templateMaterialEntryId(material)
  ) {
    return true;
  }
  const durable = /^artifact:([^:]+):[^:]+$/.exec(wanted);
  return durable ? durable[1] === material.artifactId : false;
}

/**
 * 深链改写：`WorkspaceLibrary` 按 `entry.id === itemId`（或 durable 条目的
 * artifactId）开卡。官方模板不是 durable artifact，entry id 是本模块铸的，所以
 * 「定位并打开那一份」要在这里把 `item=` 换成那个 id。
 *
 * `intent: "edit"` 一并去掉：官方模板没有可交给编辑器的 projection（匿名更没有），
 * 留着它 `WorkspaceLibrary` 会直接返回、什么都不开，用户还是「看不到那个素材」。
 * 安静预览是这条深链能兑现的落点。
 */
export function templateDeepLinkAction(
  action: WorkspaceActionEnvelope | null | undefined,
  entryId: string,
): WorkspaceActionEnvelope | null | undefined {
  if (!action || !entryId) return action;
  const { intent: _intent, ...rest } = action.action;
  return { ...action, action: { ...rest, itemId: entryId } };
}

export function filterTemplateMaterials(
  materials: readonly TemplateMaterialListing[],
  options: { appId?: string; types?: readonly ArtifactType[] } = {},
): TemplateMaterialListing[] {
  const appId = (options.appId || "").trim();
  const types = options.types || [];
  return materials.filter(
    (material) =>
      (!appId || material.appId === appId) &&
      (types.length === 0 || types.includes(material.artifactType)),
  );
}

export function templateMaterialRequestKey(
  siteKey: string,
  appId: string,
): string {
  return `${siteKey}\u0000${appId}`;
}

export function invalidateTemplateMaterialCache(): void {
  templateMaterialCache.clear();
  templateMaterialPending.clear();
}

/**
 * 丢行的可观测信号。
 *
 * 归一化以前是**静默**丢行的：一行不合格就消失，症状只剩「素材库里少了几份」，
 * 上一轮那 9 行冒号 key 是靠人拿生产 payload 逐行比对才发现的。
 *
 * 两条自我约束：
 * - **按原因聚合，不逐行打印**。逐行日志在 412 行的目录上是噪音，而且噪音会被静音，
 *   静音之后这条信号就等于不存在。一次响应最多一行，带上范围与原因计数。
 * - **只报不拦**。丢行仍然只影响那一行，货架照常渲染剩下的：可观测性不该变成新的失败模式。
 */
const templateMaterialDrops: TemplateMaterialDropTally = {
  seen: 0,
  dropped: 0,
  reasons: {},
};

export function templateMaterialDropStats(): TemplateMaterialDropTally {
  return {
    seen: templateMaterialDrops.seen,
    dropped: templateMaterialDrops.dropped,
    reasons: { ...templateMaterialDrops.reasons },
  };
}

export function resetTemplateMaterialDropStats(): void {
  templateMaterialDrops.seen = 0;
  templateMaterialDrops.dropped = 0;
  templateMaterialDrops.reasons = {};
}

export function formatTemplateMaterialDrops(
  siteKey: string,
  appId: string,
  tally: TemplateMaterialDropTally,
): string {
  const reasons = Object.entries(tally.reasons)
    .filter(([, count]) => count)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => `${reason}=${count}`)
    .join(" ");
  const scope = appId ? `${siteKey}/${appId}` : siteKey;
  return `[template-materials] ${scope}: dropped ${tally.dropped}/${tally.seen} rows — ${reasons}`;
}

function reportTemplateMaterialDrops(
  siteKey: string,
  appId: string,
  tally: TemplateMaterialDropTally,
): void {
  templateMaterialDrops.seen += tally.seen;
  templateMaterialDrops.dropped += tally.dropped;
  for (const [reason, count] of Object.entries(tally.reasons)) {
    const key = reason as TemplateMaterialDropReason;
    templateMaterialDrops.reasons[key] =
      (templateMaterialDrops.reasons[key] || 0) + (count || 0);
  }
  if (tally.dropped === 0) return;
  console.warn(formatTemplateMaterialDrops(siteKey, appId, tally));
}

async function fetchTemplateMaterials(
  siteKey: string,
  appId: string,
  signal?: AbortSignal,
): Promise<ArtifactApiResult<TemplateMaterialListing[]>> {
  const url = new URL(`${GATEWAY}/v1/template-materials`);
  url.searchParams.set("siteKey", siteKey);
  if (appId) url.searchParams.set("appId", appId);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      // Public product content: no cookie, no bearer. Sending credentials here
      // would be the only reason this request ever needed a credentialed CORS
      // origin, and it needs none.
      credentials: "omit",
      signal,
    });
  } catch {
    return {
      ok: false,
      error: "官方模板素材加载失败，请重试。",
      status: 0,
      retryable: true,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: "官方模板素材暂时无法加载。",
      status: response.status,
      retryable: response.status >= 500,
    };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      error: "官方模板素材响应不是合法 JSON。",
      code: "invalid-response",
      status: response.status,
    };
  }
  const rawItems = (payload as { items?: unknown } | null)?.items;
  if (!Array.isArray(rawItems)) {
    return {
      ok: false,
      error: "官方模板素材响应缺少 items 列表。",
      code: "invalid-response",
      status: response.status,
    };
  }
  const items: TemplateMaterialListing[] = [];
  const tally: TemplateMaterialDropTally = { seen: 0, dropped: 0, reasons: {} };
  for (const raw of rawItems) {
    const material = normalizeTemplateMaterial(raw, tally);
    if (material) items.push(material);
  }
  reportTemplateMaterialDrops(siteKey, appId, tally);
  return { ok: true, data: items, status: response.status };
}

/**
 * 匿名可读的官方模板列表。`siteKey` 必给（全站目录不是产品面）；`appId` 给了就按
 * 「此 app」范围取，深链回退时不给。
 */
export async function listTemplateMaterials(options: {
  siteKey: string;
  appId?: string;
  signal?: AbortSignal;
  forceRefresh?: boolean;
}): Promise<ArtifactApiResult<TemplateMaterialListing[]>> {
  const siteKey = (options.siteKey || "").trim();
  const appId = (options.appId || "").trim();
  if (!siteKey) return { ok: true, data: [] };
  const key = templateMaterialRequestKey(siteKey, appId);
  if (!options.forceRefresh) {
    const cached = templateMaterialCache.get(key);
    if (cached && Date.now() - cached.storedAt < TEMPLATE_MATERIAL_TTL_MS) {
      return { ok: true, data: cached.items };
    }
  }
  const inFlight = options.signal ? null : templateMaterialPending.get(key);
  if (inFlight) return inFlight;
  const request = fetchTemplateMaterials(siteKey, appId, options.signal).then(
    (result) => {
      if (result.ok && result.data) {
        templateMaterialCache.set(key, {
          items: result.data,
          storedAt: Date.now(),
        });
      }
      return result;
    },
  );
  if (!options.signal) templateMaterialPending.set(key, request);
  try {
    return await request;
  } finally {
    if (templateMaterialPending.get(key) === request) {
      templateMaterialPending.delete(key);
    }
  }
}
