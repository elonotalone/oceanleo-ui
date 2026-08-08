/**
 * 探索页的**按 artifact 类型分派的呈现模式**（本轮合同 §0 P2）。
 *
 * 探索页从「一屏混着可玩游戏与素材」改成两类分开呈现，而这个分类**不是站点配置**：
 * 站点侧仍然只交 `siteKey appId accent className` 四个属性
 * （`scripts/oceanleo-capability-parity-gate.sh` 的 C4 逐字锁死了这份清单，
 * `game/tests/shell-standard.test.ts` 里也有同一条断言）。分类只能由共享包按
 * **artifact 类型**自行推导，所以判据住在这里，而且是纯函数、无 React、可被
 * focused test 直接 import 断言。
 *
 * 两类：
 *   · `playable` —— artifact type `game`。可玩的东西不是「素材」，它的呈现模式是
 *     **竖向 feed（整屏逐条 + 滚动吸附）**，且**只有这一种**（P1：不做网格变体）。
 *   · `material` —— 其余 13 个 artifact type（图像 / 音频 / 3D / 矢量 …）。呈现模式是
 *     既有网格货架，预览 / 编辑 / 下载全部保留。
 *
 * 排序按**真实热度**，不按创建时间（G3）。AI 生成内容的发现难题就在这里：按创建
 * 时间倒排等于「最新的永远在最前」，一款没人玩过的新作会挡住 118 款里真正被玩的那些。
 */

import {
  ARTIFACT_TYPES,
  POPULARITY_ENVELOPE_KEYS,
  POPULARITY_METRIC_ALIASES,
  artifactIsVisible,
  popularityCount,
  type ArtifactType,
} from "./artifact-contract";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";
import { currentFamilySubsiteOrigin } from "../contracts/domain-family";

export type ExploreArtifactClass = "playable" | "material";

/** 呈现模式。`playable` 只有 feed 一种取值，这是 P1 的类型级落点。 */
export type ExploreRenderMode = "vertical-feed" | "grid";

/** 可玩那一类的 artifact type。第 14 类 `game` 是唯一成员。 */
export const EXPLORE_PLAYABLE_ARTIFACT_TYPES: readonly ArtifactType[] =
  Object.freeze(["game"] as const);

/** 素材那一类 = 其余全部类型，从 `ARTIFACT_TYPES` 推导，不维护第二份名单。 */
export const EXPLORE_MATERIAL_ARTIFACT_TYPES: readonly ArtifactType[] =
  Object.freeze(
    ARTIFACT_TYPES.filter(
      (type) => !EXPLORE_PLAYABLE_ARTIFACT_TYPES.includes(type),
    ),
  );

/**
 * 分类是**全覆盖**的：`ARTIFACT_TYPES` 的每个成员恰好落在 playable 或 material
 * 之一。第 15 / 16 类 `geo_map` / `interactive_doc` 归 material —— 它们不可玩，
 * 呈现模式是网格货架 —— 并且是经上面这条真名单进来的，**不是**靠
 * `exploreArtifactClassOf` 那条「认不出来就当素材」的 fail-open 兜底。
 * 这条不变量把两者的区别钉死：漏一类会在模块加载时炸，不会静默降级。
 */
if (
  EXPLORE_PLAYABLE_ARTIFACT_TYPES.length +
    EXPLORE_MATERIAL_ARTIFACT_TYPES.length !==
  ARTIFACT_TYPES.length
) {
  throw new Error(
    "Every artifact type must be classified as playable or material",
  );
}

/** 分区顺序：可玩游戏在前。这一站的主角是能玩的东西，素材是它的原料。 */
export const EXPLORE_ARTIFACT_CLASS_ORDER: readonly ExploreArtifactClass[] =
  Object.freeze(["playable", "material"] as const);

export const EXPLORE_CLASS_LABEL: Record<ExploreArtifactClass, string> = {
  playable: "可玩游戏",
  material: "游戏素材",
};

/**
 * 一种 artifact type 归哪一类。未知/空类型按 `material` 处理（fail-open 到网格）：
 * 认不出来的东西塞进整屏 feed 会得到一屏空白，而落进网格最多是一张普通卡。
 */
export function exploreArtifactClassOf(
  artifactType: ArtifactType | "" | null | undefined,
): ExploreArtifactClass {
  const type = String(artifactType || "").trim() as ArtifactType;
  return EXPLORE_PLAYABLE_ARTIFACT_TYPES.includes(type)
    ? "playable"
    : "material";
}

/** P1：可玩那一类只有竖向 feed 一种布局，没有网格变体可选。 */
export function exploreRenderModeFor(
  artifactClass: ExploreArtifactClass,
): ExploreRenderMode {
  return artifactClass === "playable" ? "vertical-feed" : "grid";
}

export function exploreClassArtifactTypes(
  artifactClass: ExploreArtifactClass,
): readonly ArtifactType[] {
  return artifactClass === "playable"
    ? EXPLORE_PLAYABLE_ARTIFACT_TYPES
    : EXPLORE_MATERIAL_ARTIFACT_TYPES;
}

// ── 热度字段契约 ─────────────────────────────────────────────────────────────

/**
 * 热度取值只认这些键，且**只认数字**。
 *
 * 为什么键名冻在共享包里：产出方不止一个。可玩侧的权威是
 * `ugc_game_stats`（migration `0111` 的 `plays` / `likes` / `remixes`，
 * 经 `UgcStats` 上线）；素材侧的权威是导入时保留的原站数值
 * （ambientCG `downloadCount`、Poly Haven `download_count`，本轮合同 §3.4）。
 * 两边都要落到同一个读取面，否则每加一个来源就多一处 `item.meta.xxx ?? 0`。
 *
 * **这份名单不是本模块自己的**：它与服务边界上的放行名单是同一份
 * （`artifact-contract.ts` 的 `POPULARITY_METRIC_ALIASES`）。取值层与放行层各写一份，
 * 就会出现「放行了 `play_count`、取值只认 `plays`」这种静默排错序的 bug——
 * 热度读不到不会报错，只是页面顺序悄悄退回创建时间序。
 */
export const EXPLORE_POPULARITY_KEYS = POPULARITY_METRIC_ALIASES;

/**
 * 可玩侧的加权。逐字镜像 `game/lib/ugc/models.ts::rankFeed` 的 `hot` 分子
 * （`likes * 3 + remixes * 8 + log1p(plays) * 2`）：二创是最强的质量信号，点赞
 * 次之，播放量取对数是为了不让一款被刷播放的作品把整条 feed 压住。
 *
 * 刻意**不带**那份实现里的 18 小时半衰期。两个理由：
 *   1) 半衰期把时间重新塞回排序，而本轮要根除的正是「按创建时间倒排」；
 *      零互动的新作在这个分子下恒为 0，不需要衰减也压不住老爆款。
 *   2) 探索页是服务端渲染的。带时钟的排序会让 SSR 与 hydration 各排一次、
 *      顺序不一致，React 当场报 mismatch。
 * 权重要改就改这三个常量，不要散到排序处。
 */
export const EXPLORE_HOT_WEIGHTS = Object.freeze({
  like: 3,
  remix: 8,
  playLog: 2,
});

export interface ExplorePopularity {
  plays: number;
  likes: number;
  remixes: number;
  downloads: number;
  /** 加权热度。`known` 为假时恒为 0。 */
  score: number;
  /** 至少读到一个真实数值。假 = 这一条压根没有热度数据。 */
  known: boolean;
  /** 读到值的那些字段名，供证据与门禁点名。 */
  fields: string[];
}

const EMPTY_POPULARITY: ExplorePopularity = Object.freeze({
  plays: 0,
  likes: 0,
  remixes: 0,
  downloads: 0,
  score: 0,
  known: false,
  fields: Object.freeze([]) as unknown as string[],
});

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 只接受有限非负数（判据与放行层同源，见 `popularity-fields.ts`）。 */
const count = popularityCount;

function readCount(
  sources: readonly Record<string, unknown>[],
  keys: readonly string[],
): { value: number; field: string } | null {
  for (const source of sources) {
    for (const key of keys) {
      const value = count(source[key]);
      if (value !== null) return { value, field: key };
    }
  }
  return null;
}

/**
 * 一条素材/作品的热度。读 `meta` 本层，外加 `meta.stats` 这类信封一层——
 * 刻意不做深递归：热度是排序键，从任意深度捞一个同名数字上来是安全事故的形状。
 */
export function explorePopularity(
  item: LibraryItem | null | undefined,
): ExplorePopularity {
  const meta = record(item?.meta);
  if (!meta) return EMPTY_POPULARITY;
  const sources = [meta];
  for (const key of POPULARITY_ENVELOPE_KEYS) {
    const envelope = record(meta[key]);
    if (envelope) sources.push(envelope);
  }
  const fields: string[] = [];
  const pick = (keys: readonly string[]): number => {
    const hit = readCount(sources, keys);
    if (!hit) return 0;
    fields.push(hit.field);
    return hit.value;
  };
  const plays = pick(EXPLORE_POPULARITY_KEYS.plays);
  const likes = pick(EXPLORE_POPULARITY_KEYS.likes);
  const remixes = pick(EXPLORE_POPULARITY_KEYS.remixes);
  const downloads = pick(EXPLORE_POPULARITY_KEYS.downloads);
  if (fields.length === 0) return EMPTY_POPULARITY;
  const artifactClass = exploreArtifactClassOf(item?.artifactType);
  const score =
    artifactClass === "playable"
      ? likes * EXPLORE_HOT_WEIGHTS.like +
        remixes * EXPLORE_HOT_WEIGHTS.remix +
        Math.log1p(plays) * EXPLORE_HOT_WEIGHTS.playLog
      : downloads;
  return { plays, likes, remixes, downloads, score, known: true, fields };
}

export function exploreEntryPopularity(
  entry: WorkspaceLibraryEntry | null | undefined,
): ExplorePopularity {
  return explorePopularity(entry?.libraryItem);
}

/**
 * 按真实热度降序。
 *
 * 三条刻意的规则：
 *   · 没有热度数据的条目**排在有数据的之后**，且彼此保持服务端给的原顺序。
 *     把它们当 0 分混排会让「没数据」与「热度为 0」不可区分。
 *   · 分数相同按标题再按 id，**不按创建时间**——tie-break 必须确定，否则 SSR 与
 *     hydration 排出两个顺序。
 *   · 稳定排序：同分同名的条目顺序不随实现细节变。
 */
export function sortByExplorePopularity(
  entries: readonly WorkspaceLibraryEntry[],
): WorkspaceLibraryEntry[] {
  return [...entries]
    .map((entry, index) => ({
      entry,
      index,
      popularity: exploreEntryPopularity(entry),
    }))
    .sort((left, right) => {
      if (left.popularity.known !== right.popularity.known) {
        return left.popularity.known ? -1 : 1;
      }
      if (!left.popularity.known) return left.index - right.index;
      if (right.popularity.score !== left.popularity.score) {
        return right.popularity.score - left.popularity.score;
      }
      const byTitle = String(left.entry.title || "").localeCompare(
        String(right.entry.title || ""),
      );
      if (byTitle !== 0) return byTitle;
      return String(left.entry.id || "").localeCompare(
        String(right.entry.id || ""),
      );
    })
    .map((row) => row.entry);
}

/** 这一批条目里有没有任何一条带着真实热度数值。 */
export function exploreHasPopularityEvidence(
  entries: readonly WorkspaceLibraryEntry[],
): boolean {
  return entries.some((entry) => exploreEntryPopularity(entry).known);
}

// ── 分类与分区轴 ─────────────────────────────────────────────────────────────

export interface ExploreClassPartition {
  playable: WorkspaceLibraryEntry[];
  material: WorkspaceLibraryEntry[];
}

/** 按 artifact 类型把一批条目分成两类，各自已按热度排好。 */
export function partitionExploreEntries(
  entries: readonly WorkspaceLibraryEntry[],
): ExploreClassPartition {
  const playable: WorkspaceLibraryEntry[] = [];
  const material: WorkspaceLibraryEntry[] = [];
  for (const entry of entries) {
    const bucket =
      exploreArtifactClassOf(entry.libraryItem?.artifactType) === "playable"
        ? playable
        : material;
    bucket.push(entry);
  }
  return {
    playable: sortByExplorePopularity(playable),
    material: sortByExplorePopularity(material),
  };
}

/** 只保留某一类，并按热度排序。网格货架用它把可玩那一类摘出去。 */
export function exploreEntriesOfClass(
  entries: readonly WorkspaceLibraryEntry[],
  artifactClass: ExploreArtifactClass,
): WorkspaceLibraryEntry[] {
  return sortByExplorePopularity(
    entries.filter(
      (entry) =>
        exploreArtifactClassOf(entry.libraryItem?.artifactType) ===
        artifactClass,
    ),
  );
}

export interface ExploreClassChip {
  id: ExploreArtifactClass;
  label: string;
  count: number;
  renderMode: ExploreRenderMode;
}

/**
 * 两类分区的 chips。
 *
 * **可玩那一格只有真的有可玩作品时才出现**：其余 35 站一份 `game` artifact 都没有，
 * 给它们挂一个恒空的「可玩游戏」分区就是凭空造能力差异。素材那一格恒在——探索页
 * 本来就是素材页，空货架有自己的空态文案（D5/D1）。
 */
export function exploreClassChips(input: {
  playableCount: number;
  materialCount: number;
}): ExploreClassChip[] {
  const counts: Record<ExploreArtifactClass, number> = {
    playable: Math.max(0, input.playableCount | 0),
    material: Math.max(0, input.materialCount | 0),
  };
  return EXPLORE_ARTIFACT_CLASS_ORDER.filter(
    (artifactClass) => artifactClass === "material" || counts[artifactClass] > 0,
  ).map((artifactClass) => ({
    id: artifactClass,
    label: EXPLORE_CLASS_LABEL[artifactClass],
    count: counts[artifactClass],
    renderMode: exploreRenderModeFor(artifactClass),
  }));
}

/**
 * 两类分区轴交给工具条的整包取值。
 *
 * 刻意是**一个对象而不是四个属性**：工具条被抽屉、工作台面板与探索页共用，探索页
 * 独有的东西必须能一次性缺席，而不是在四处各写一个 `undefined` 判断。
 */
export interface ExploreClassAxis {
  chips: readonly ExploreClassChip[];
  selected: ExploreArtifactClass;
  onSelect: (artifactClass: ExploreArtifactClass) => void;
  /** 可玩那一类只有一个 artifact type，次级类型筛选在那里没有意义。 */
  hideTypeFilter: boolean;
}

/**
 * 默认落在哪一类。有可玩作品就先给可玩那一类——这一站的主角是能玩的东西；
 * 一个都没有（其余 35 站的常态）就是今天的素材网格，形状一个字不变。
 */
export function defaultExploreClass(input: {
  playableCount: number;
}): ExploreArtifactClass {
  return input.playableCount > 0 ? "playable" : "material";
}

// ── 可玩条目与「开玩」落点 ───────────────────────────────────────────────────

/**
 * 一条 artifact 是不是**可玩**的。
 *
 * 判据里刻意**没有**「可编辑」：100 款 artifact 游戏在生产库里是 `view_only`
 * （附录 2 §6），要求它们可编辑等于要求它们不存在。反过来也不许把它们标成可编辑
 * 来蒙混过关——那会让编辑器派发在真实数据上抛「当前 revision 缺少可验证的编辑器
 * source。」。可玩与可编辑是两件正交的事，这个函数只回答前者。
 *
 * 仍然要求 durable + 可见：没有 artifact 坐标就算不出播放落点，不可见的东西
 * 不该出现在任何货架上。
 */
export function isPlayableGameLibraryItem(
  item: LibraryItem | null | undefined,
): boolean {
  if (!item) return false;
  return Boolean(
    isDurableLibraryItem(item) &&
      artifactIsVisible(item.artifact) &&
      exploreArtifactClassOf(item.artifactType) === "playable",
  );
}

export function isPlayableGameShelfEntry(
  entry: WorkspaceLibraryEntry | null | undefined,
): boolean {
  return isPlayableGameLibraryItem(entry?.libraryItem);
}

/** W7 的 artifact 播放路由前缀。落点形状变了只改这一处。 */
export const ARTIFACT_PLAY_ROUTE_PREFIX = "/play/artifact/";

/**
 * 允许的**绝对**播放落点 origin。
 *
 * 探索页跑在 36 个站上，而 artifact 播放路由只在 game 仓落地，所以 W9 的
 * `play_href` 需要能给绝对 URL。放行名单只有这一个 first-party host：
 * 用户产物本身住在 `*.oceanleo.app` 的沙箱里、由播放页 iframe 装载
 * （UC-1…UC-7），**顶层导航不许直奔沙箱 host**，否则就绕过了播放页那一层。
 *
 * 域名按**当前家族**拼（contracts/domain-family.ts）：`.com` 站解析出来的仍是
 * `https://game.oceanleo.com`（逐字不变）。境内 v1 没有 game 子站，于是这里是
 * **空串** —— 绝对播放地址一律不放行，回落到推导出来的站内路由，
 * 而不是把用户顶层导航到 `.com`。
 */
export const ARTIFACT_PLAY_ORIGIN: string =
  currentFamilySubsiteOrigin("game") ?? "";

/** 落库的播放地址读这两个键（后端下划线 / 前端驼峰各一份）。 */
const PLAY_HREF_META_KEYS = ["play_href", "playHref"] as const;

/**
 * 校验一个**外来**的播放地址。
 *
 * 这是注入面：`play_href` 是服务端数据，直接塞进 `href` 等于把跳转目标交给数据。
 * 只认两种形状，其余一律丢弃并回落到推导路由（fail-closed，不是 fail-open）：
 *   · 根相对路径 `/…`（但不含 `//` 开头的协议相对 URL——那是换 host 的写法）；
 *   · `ARTIFACT_PLAY_ORIGIN` 上的 https 绝对 URL。
 */
export function safeArtifactPlayHref(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw)) return "";
  if (raw.startsWith("//")) return "";
  if (raw.startsWith("/")) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.origin === ARTIFACT_PLAY_ORIGIN
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

/**
 * 「开玩」落到哪个地址。
 *
 * 优先用 W9 落库的 `play_href`（它知道跨站该给绝对 URL）；没有就按 artifact 坐标
 * 推导出 W7 的路由。**推导值恒为根相对路径**：跨站的绝对地址只能由目录给，
 * 前端猜 host 是安全事故的形状。
 *
 * 返回空串 = 这一条算不出可玩落点，调用方必须如实呈现，不许假装能玩。
 */
export function artifactPlayHref(
  item: LibraryItem | null | undefined,
): string {
  if (!item || !isPlayableGameLibraryItem(item)) return "";
  const meta = record(item.meta);
  for (const key of PLAY_HREF_META_KEYS) {
    const declared = safeArtifactPlayHref(meta?.[key]);
    if (declared) return declared;
  }
  const artifactId = String(item.artifactId || "").trim();
  if (!artifactId) return "";
  const revisionId = String(item.revisionId || "").trim();
  const path = `${ARTIFACT_PLAY_ROUTE_PREFIX}${encodeURIComponent(artifactId)}`;
  return revisionId
    ? `${path}?revision=${encodeURIComponent(revisionId)}`
    : path;
}

/**
 * 跳到播放落点。
 *
 * 只接受已经过 `safeArtifactPlayHref` / `artifactPlayHref` 的地址，自己再校一次——
 * 这是导航 sink，多一道不亏。SSR 下无 `window`，直接放弃（返回 `false`）。
 *
 * `navigate` 可注入，纯粹是为了让用例断言「跳到哪」而不必起浏览器。
 */
export function navigateToArtifactPlay(
  href: string,
  navigate?: (target: string) => void,
): boolean {
  const safe = safeArtifactPlayHref(href);
  if (!safe) return false;
  if (navigate) {
    navigate(safe);
    return true;
  }
  if (typeof window === "undefined") return false;
  window.location.assign(safe);
  return true;
}

/**
 * 「开玩」的整条**独立派发通路**：算落点 → 校验 → 跳转。
 *
 * 这是把「可玩」与「可编辑」彻底分开的那个函数。调用方（货架、feed）用它做前置
 * 分流：返回 `true` 表示这一条已经按可玩处理完了，**不要**再往
 * `isAdvancedEditableShelfItem` 那条编辑器路径上走——100 款游戏是 `view_only`，
 * 走过去必抛「当前 revision 缺少可验证的编辑器 source。」。
 *
 * 返回 `false` 表示这一条不是可玩游戏、或者算不出落点，调用方按自己的老路继续。
 */
export function openArtifactPlay(
  item: LibraryItem | null | undefined,
  navigate?: (target: string) => void,
): boolean {
  const href = artifactPlayHref(item);
  return href ? navigateToArtifactPlay(href, navigate) : false;
}

// ── 可玩探针的分页 ───────────────────────────────────────────────────────────

/**
 * 可玩探针的单页条数。
 *
 * 原来是 `limit: 60`，而 artifact 游戏有 100 款——第一页就装不下，
 * 「可玩游戏」那一格的计数会少 40 款，排在 60 名之后的游戏永远打不开。
 * 100 是 `artifact-client.ts` 的 `ARTIFACT_LIBRARY_MAX_LIMIT` 硬顶，
 * 所以**光把上限调大解决不了问题**，必须翻页，见下。
 */
export const EXPLORE_PLAYABLE_PAGE_LIMIT = 100;

/**
 * 可玩探针最多翻几页（100 × 5 = 500 款）。
 *
 * 有上限是刻意的：游标翻页是无界循环的形状，后端游标一旦不前进就会把浏览器
 * 打死。到顶时**如实告诉读者还有没载入的**（`truncated`），不静默截断。
 */
export const EXPLORE_PLAYABLE_MAX_PAGES = 5;

export function exploreClassSubtitle(
  artifactClass: ExploreArtifactClass,
  count: number,
): string {
  if (artifactClass === "playable") {
    return count > 0
      ? `${count} 款可玩作品，按真实热度（游玩 / 点赞 / 二创）排序。`
      : "本站还没有可玩作品。";
  }
  return count > 0
    ? `${count} 份素材，按原站热度排序，可预览 / 编辑 / 下载。`
    : "本站还没有已登记的素材。";
}
