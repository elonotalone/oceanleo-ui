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
  popularityCount,
  type ArtifactType,
} from "./artifact-contract";
import type { LibraryItem } from "./library-data";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

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
