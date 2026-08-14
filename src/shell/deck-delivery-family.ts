/**
 * 演示文稿的**交付家族**：同一个 `deck` artifact type 里，PPTX 文件与可在浏览器
 * 播放的自包含 HTML 是两件不同的交付物，分别计数、分别开
 * （`06-html-deck-closure-contract.md` 产品裁定 2/3）。
 *
 * 判据只认**受控字段**：artifact type、交付表示（`renditions.full` 的
 * `format` + `mediaType`）、source format 与 source media type。标签、标题、分类词
 * 里出现 "html" / "pptx" 一律不算证据——货架上那 275 件旧 PPTX 里就有标题带
 * 「网页版」的，认了标题等于凭空把它们搬进 HTML 板块。
 *
 * 三个刻意的 fail-closed：
 *   · 受控字段互相冲突（例如 `format=html` 配 pptx media type）→ `unknown`，
 *     不误归 HTML；
 *   · 一个受控字段都读不到 → `unknown`，同样不归 HTML；
 *   · HTML 成员资格**只能由交付表示给出**。声明一句 `deliveryFamily=html`、
 *     或者只有一份 HTML source，都不足以让一件素材长出「在隔离域播放」这个动作。
 *
 * 本模块是纯函数、无 React，货架与动作条共用它，聚焦测试可以直接 import 断言。
 */

import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import { DECK_IR_SCHEMA } from "./doc-editors/deck-ir";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

export type DeckDeliveryFamily = "pptx" | "html";

/**
 * `unknown` = 这是一件 deck，但受控字段冲突或缺失，判不出交付家族；
 * `none` = 根本不是 deck，不参与这条分组。两者必须区分得开：前者要留在货架上
 * 但不进任何一个演示板块，后者连问都不该问。
 */
export type DeckDeliveryClassification = DeckDeliveryFamily | "unknown" | "none";

export const DECK_DELIVERY_SECTION_LABEL: Record<DeckDeliveryFamily, string> = {
  pptx: "PPTX 演示",
  html: "HTML 网页版演示",
};

/** 板块顺序：PPTX 在前（它是货架上的绝大多数），HTML 紧随其后。 */
export const DECK_DELIVERY_ORDER: readonly DeckDeliveryFamily[] = Object.freeze([
  "pptx",
  "html",
]);

const PPTX_MEDIA_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  "application/vnd.ms-powerpoint",
]);

const PPTX_FORMATS = new Set(["pptx", "ppt", "pptm", "ppsx"]);
const HTML_FORMATS = new Set(["html", "htm", "xhtml"]);
const HTML_MEDIA_TYPES = new Set(["text/html", "application/xhtml+xml"]);

/** 受控 delivery family 的字面量键；只认这两个取值，其余（含空串）当没声明。 */
const DELIVERY_FAMILY_META_KEYS = [
  "delivery_family",
  "deliveryFamily",
] as const;

/**
 * 隔离域 runtime 地址落在 meta 的哪些键上。
 *
 * 键名多认几个是安全的：真正的闸是 `safeDeckHtmlRuntimeUrl()` 那条精确 host 判据，
 * 不是键名。少认一个键的后果反而严重——货架上的 HTML 件会静默失去「查看」。
 */
export const DECK_HTML_RUNTIME_META_KEYS = [
  "active_runtime_url",
  "activeRuntimeUrl",
  "runtime_url",
  "runtimeUrl",
  "deck_html_runtime_url",
  "deckHtmlRuntimeUrl",
] as const;

const RUNTIME_ENVELOPE_KEYS = ["active_runtime", "activeRuntime"] as const;
const RUNTIME_ENVELOPE_URL_KEYS = ["entryUrl", "entry_url", "url"] as const;

/** F9 计算出来的隔离域：`s-<32hex>.oceanleo.app`，逐字与 asset 侧同一条判据。 */
export const DECK_HTML_RUNTIME_HOST = /^s-[0-9a-f]{32}\.oceanleo\.app$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** media type 只取本体，丢掉 `;charset=utf-8` 这类参数。 */
function mediaTypeOf(value: unknown): string {
  return lower(value).split(";")[0].trim();
}

type Signal = DeckDeliveryFamily | "conflict" | "";

function mergeSignals(...signals: Signal[]): Signal {
  let seen: Signal = "";
  for (const signal of signals) {
    if (!signal) continue;
    if (signal === "conflict") return "conflict";
    if (!seen) seen = signal;
    else if (seen !== signal) return "conflict";
  }
  return seen;
}

function formatSignal(format: unknown): Signal {
  const value = lower(format);
  if (!value) return "";
  if (HTML_FORMATS.has(value)) return "html";
  if (PPTX_FORMATS.has(value)) return "pptx";
  return "";
}

function mediaSignal(mediaType: unknown): Signal {
  const value = mediaTypeOf(mediaType);
  if (!value) return "";
  if (HTML_MEDIA_TYPES.has(value)) return "html";
  if (PPTX_MEDIA_TYPES.has(value)) return "pptx";
  return "";
}

function renditionSignal(
  rendition: { format?: unknown; mediaType?: unknown } | null | undefined,
): Signal {
  if (!rendition) return "";
  return mergeSignals(
    formatSignal(rendition.format),
    mediaSignal(rendition.mediaType),
  );
}

/** 受控 delivery family 声明。只有这两个字面量算数，其余一律当没声明。 */
function declaredFamily(item: LibraryItem): DeckDeliveryFamily | "" {
  const meta = record(item.meta) || {};
  for (const key of DELIVERY_FAMILY_META_KEYS) {
    const value = lower(meta[key]);
    if (value === "html" || value === "pptx") return value;
  }
  return "";
}

function artifactTypeOf(item: LibraryItem): string {
  return lower(item.artifact?.artifactType || item.artifactType);
}

/**
 * 官方模板目录行（`GET /v1/template-materials`）的受控家族，三条同时成立才算数：
 *
 *   1. `meta.template_material_id` 存在——这个键只有
 *      `templateMaterialLibraryItem()` 铸得出来，认它等于认「这一行来自官方目录」，
 *      而不是认响应里的任何自由文本；
 *   2. `meta.template_material_artifact_type` 是 `deck`——目录行的类型不在条目本体上
 *      （提上去会让所有 `isDurableLibraryItem()` 调用者误判），所以在这里读；
 *   3. meta 里的受控家族是 `"html"` / `"pptx"` 字面量。
 *
 * 少一条就返回空串，落回下面那条既有判据——今天绝大多数官方 PPTX 老件取不到家族，
 * 它们照旧一个演示板块都不进，35 个站的货架布局逐字不动。
 */
function templateCatalogFamily(item: LibraryItem): DeckDeliveryFamily | "" {
  const meta = record(item.meta) || {};
  const catalogId =
    typeof meta.template_material_id === "string"
      ? meta.template_material_id.trim()
      : "";
  if (!catalogId) return "";
  if (lower(meta.template_material_artifact_type) !== "deck") return "";
  return declaredFamily(item);
}

/**
 * 这件素材属于哪个演示交付家族。
 *
 * 主证据是 `renditions.full` 这份**交付表示**：HTML 件的 full 是
 * `html` / `text/html`，PPTX 件的 full 是 `pptx` / `…presentationml.presentation`。
 * 旧件里有一部分只登记了 source（就是那份 .pptx 本体），所以 full 读不到时允许
 * 回落到 source 的表示——**但只回落到 PPTX**：HTML 成员资格必须由真正的 HTML
 * 交付物给出，否则「在隔离域播放」这个动作就会长在没有 runtime 的素材上。
 *
 * 官方模板目录行走前面那条**窄**分支，理由是证据强度而不是方便：目录行按设计
 * 拿不到 revision 身份，也就永远没有 `renditions`，用交付表示去问它等于问一个
 * 它答不了的问题（今天的结果是匿名那一屏 HTML 件恒为 0）。它能给的证据是**服务端
 * 对这一行 pinned revision 的声明**——那份声明就是服务端照着同一份交付物算出来的，
 * 与登录用户拿到的 `renditions.full` 同源、同强度，区别只在它是被转述的。
 * 这与「不许拿标题或 tag 猜家族」不矛盾：标题和 tag 是自由文本，谁都能写；
 * `deliveryFamily` 是受控字段，只有服务端出得了。
 */
export function deckDeliveryFamilyOf(
  item: LibraryItem | null | undefined,
): DeckDeliveryClassification {
  if (!item) return "none";
  // durable 行**一步都不走这条分支**：它们有真交付物，就必须由真交付物说话。
  if (!isDurableLibraryItem(item)) {
    const catalog = templateCatalogFamily(item);
    if (catalog) return catalog;
  }
  if (artifactTypeOf(item) !== "deck") return "none";
  if (!isDurableLibraryItem(item)) return "unknown";
  const artifact = item.artifact;
  const full = renditionSignal(artifact.renditions.full);
  if (full === "conflict") return "unknown";
  const declared = declaredFamily(item);
  if (declared && full && declared !== full) return "unknown";
  if (full) return full;

  const source = mergeSignals(
    renditionSignal(artifact.renditions.source),
    formatSignal(artifact.sourceFormat),
  );
  if (source === "pptx" && declared !== "html") return "pptx";
  return "unknown";
}

/**
 * 一个**外来**的 runtime 地址能不能交给「查看」。
 *
 * 这是导航 sink，判据逐条 fail-closed：只放行 https、精确
 * `s-<32hex>.oceanleo.app` 主机、路径恰为 `/` 或 `/embed`，并且**不许**带
 * userinfo、端口、query 或 fragment（这四样都能把用户送到另一个地方，或者把
 * 隔离域当成参数化入口用）。最后再要求原文与规范化结果逐字相同，
 * 大小写混写、协议相对写法、路径穿越都在这一步落地。
 */
export function safeDeckHtmlRuntimeUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || /[\u0000-\u001f\u007f\\\s]/.test(raw)) return "";
  if (!raw.startsWith("https://")) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (url.protocol !== "https:") return "";
  if (url.username || url.password) return "";
  if (url.port) return "";
  if (url.search || url.hash) return "";
  if (!DECK_HTML_RUNTIME_HOST.test(url.hostname)) return "";
  if (url.pathname !== "/" && url.pathname !== "/embed") return "";
  const canonical =
    url.pathname === "/embed"
      ? `https://${url.hostname}/embed`
      : `https://${url.hostname}`;
  return raw === canonical || raw === `${canonical}/` ? canonical : "";
}

/**
 * 这件 HTML 演示的隔离域播放地址。
 *
 * 只有 HTML 家族才有：给一件 PPTX 挂上 runtime 键也拿不到地址，
 * 否则「伪造一个字段就能让旧件多出一个播放入口」。
 */
export function deckHtmlRuntimeUrl(
  item: LibraryItem | null | undefined,
): string {
  if (!item || deckDeliveryFamilyOf(item) !== "html") return "";
  const meta = record(item.meta) || {};
  for (const key of DECK_HTML_RUNTIME_META_KEYS) {
    const url = safeDeckHtmlRuntimeUrl(meta[key]);
    if (url) return url;
  }
  for (const key of RUNTIME_ENVELOPE_KEYS) {
    const envelope = record(meta[key]);
    if (!envelope) continue;
    for (const urlKey of RUNTIME_ENVELOPE_URL_KEYS) {
      const url = safeDeckHtmlRuntimeUrl(envelope[urlKey]);
      if (url) return url;
    }
  }
  return "";
}

function declaresDeckIr(...hints: unknown[]): boolean {
  return hints.some((hint) => lower(hint) === DECK_IR_SCHEMA);
}

function httpUrl(value: unknown): string {
  const url = typeof value === "string" ? value.trim() : "";
  return /^https?:\/\//i.test(url) ? url : "";
}

/**
 * 这件素材的 `oceanleo.deck.v1` 结构稿在哪。
 *
 * 判据只认**声明出来的那个 schema 字面量**：pptx 交付物、渲染图、HTML 成品都不是
 * 稿子。认宽了就会拿一份 OOXML（或者一份 HTML）去喂 IR 解析器，然后炸在用户脸上。
 */
export function deckStructuredSourceUrl(
  item: LibraryItem | null | undefined,
): string {
  if (!item) return "";
  const artifact = item.artifact;
  const source = artifact?.renditions.source;
  const manifest = artifact?.renditions.editor_manifest;
  const meta = record(item.meta) || {};
  const editorManifestMeta = record(meta.editor_manifest);
  const editorManifestSource = record(editorManifestMeta?.source);
  const candidates: Array<{ url: unknown; declared: unknown[] }> = [
    { url: source?.url, declared: [source?.format, artifact?.sourceFormat] },
    { url: manifest?.url, declared: [manifest?.format] },
    {
      url: meta.editor_project_url || meta.editor_working_head_project_url,
      declared: [
        meta.editor_working_head_schema,
        meta.editor_project_schema,
        meta.project_schema,
      ],
    },
    { url: editorManifestSource?.url, declared: [editorManifestSource?.format] },
    { url: meta.source_url, declared: [meta.source_format] },
  ];
  for (const candidate of candidates) {
    const url = httpUrl(candidate.url);
    if (url && declaresDeckIr(...candidate.declared)) return url;
  }
  return "";
}

export interface DeckHtmlViewEvidence {
  visible: boolean;
  available: boolean;
  reason: string;
  /** 隔离域播放地址；`available` 为真时必非空。 */
  url: string;
}

export interface DeckHtmlEditEvidence {
  visible: boolean;
  available: boolean;
  reason: string;
  /** 交给 deck editor 的结构稿地址；`available` 为真时必非空。 */
  sourceUrl: string;
}

export interface DeckHtmlOpenPlan {
  family: DeckDeliveryClassification;
  view: DeckHtmlViewEvidence;
  edit: DeckHtmlEditEvidence;
}

const HIDDEN_VIEW: DeckHtmlViewEvidence = Object.freeze({
  visible: false,
  available: false,
  reason: "",
  url: "",
});

const HIDDEN_EDIT: DeckHtmlEditEvidence = Object.freeze({
  visible: false,
  available: false,
  reason: "",
  sourceUrl: "",
});

/**
 * 一件 HTML 演示的两个入口各自能不能出现。
 *
 * **两条链互不牵连**：runtime 不可信只让「查看」消失，结构稿缺失只让「编辑」消失。
 * 互相降级（拿 HTML 当编辑源，或者拿结构稿去"播放"）恰恰是这份合同要根除的东西。
 * 身份不可信（不可读 / 完整性未过）时两条一起隐藏——那一刻我们连这是哪一版都不知道。
 */
export function deckHtmlOpenPlan(
  item: LibraryItem | null | undefined,
): DeckHtmlOpenPlan {
  const family = deckDeliveryFamilyOf(item);
  if (!item || family !== "html") {
    return { family, view: HIDDEN_VIEW, edit: HIDDEN_EDIT };
  }
  // 官方模板目录行没有 revision projection，这道闸也就没有可问的对象：它问的是
  // 「这一版我们读得到吗、校验过吗」，而目录行的字节本来就是匿名公开的产品内容。
  // 缺 projection 时不拦也不放宽——两条链照旧各自按自己的证据决定（runtime 在不在、
  // 结构稿在不在），目录行没有结构稿，所以「编辑」自然不出现。
  const artifact = item.artifact;
  if (artifact && (!artifact.access.canRead || !artifact.integrity.ok)) {
    const reason = !artifact.access.canRead
      ? "当前主体没有读取这个 revision 的权限。"
      : artifact.integrity.reason || "当前 revision 未通过完整性校验。";
    return {
      family,
      view: { ...HIDDEN_VIEW, reason },
      edit: { ...HIDDEN_EDIT, reason },
    };
  }
  const url = deckHtmlRuntimeUrl(item);
  const sourceUrl = deckStructuredSourceUrl(item);
  return {
    family,
    view: url
      ? { visible: true, available: true, reason: "", url }
      : HIDDEN_VIEW,
    edit: sourceUrl
      ? { visible: true, available: true, reason: "", sourceUrl }
      : HIDDEN_EDIT,
  };
}

export interface DeckDeliveryCounts {
  pptx: number;
  html: number;
  /** 是 deck 但判不出家族的条目数。它们留在货架上，但不进任何一个演示板块。 */
  unknown: number;
}

export function deckDeliveryCounts(
  entries: readonly WorkspaceLibraryEntry[],
): DeckDeliveryCounts {
  const counts: DeckDeliveryCounts = { pptx: 0, html: 0, unknown: 0 };
  for (const entry of entries) {
    const family = deckDeliveryFamilyOf(entry.libraryItem);
    if (family === "none") continue;
    counts[family] += 1;
  }
  return counts;
}

export interface LibraryEntrySection {
  id: string;
  label: string;
  /** 真实件数 = 这一节实际渲染出来的卡片数，不是服务端总数。 */
  count: number;
  entries: WorkspaceLibraryEntry[];
}

const OTHER_SECTION_LABEL = "其它素材";

/**
 * 把一屏货架分成「PPTX 演示 / HTML 网页版演示 / 其它素材」三节。
 *
 * 返回 `null` = **不分节**，货架保持今天那一张平铺网格。触发条件只有一个：
 * 这一屏里真的有 HTML 交付。理由是产品性的——两个板块要解决的问题是「同一类演示
 * 有两种交付物」，在没有 HTML 件的站上（其余 35 站与今天的 slide 站）多挂一行
 * 「PPTX 演示」标题不增加任何信息，却改了所有非 slide 站的布局。
 */
export function deckDeliverySections(
  entries: readonly WorkspaceLibraryEntry[],
): LibraryEntrySection[] | null {
  const buckets: Record<DeckDeliveryFamily, WorkspaceLibraryEntry[]> = {
    pptx: [],
    html: [],
  };
  const other: WorkspaceLibraryEntry[] = [];
  for (const entry of entries) {
    const family = deckDeliveryFamilyOf(entry.libraryItem);
    if (family === "pptx" || family === "html") buckets[family].push(entry);
    else other.push(entry);
  }
  if (buckets.html.length === 0) return null;
  const sections: LibraryEntrySection[] = [];
  for (const family of DECK_DELIVERY_ORDER) {
    if (buckets[family].length === 0) continue;
    sections.push({
      id: `deck-${family}`,
      label: DECK_DELIVERY_SECTION_LABEL[family],
      count: buckets[family].length,
      entries: buckets[family],
    });
  }
  if (other.length > 0) {
    sections.push({
      id: "other",
      label: OTHER_SECTION_LABEL,
      count: other.length,
      entries: other,
    });
  }
  return sections;
}
