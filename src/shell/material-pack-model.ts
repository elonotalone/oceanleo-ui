/**
 * 探索页的素材包三层模型：**分类 → 素材包 → 包内分区**（`tasks/W5-pack-model.md`）。
 *
 * 为什么要有这一层：一件素材可以绑好几个 app（image 站单件最多绑到 4 个）。两层结构
 * 里它只能合成一张卡，于是「这件素材属于哪个 app」这个问题被推迟到详情浮层，变成一排
 * 编辑按钮让用户自己选。加一层素材包、并规定 **一个包 = 一个 app** 之后，这个问题在
 * 素材进包的那一刻就回答完了：卡片所在的包就是它的 app，详情里只需要一颗按钮。
 *
 * 同一件素材出现在**不同包**里是操作员明确要的，不是缺陷；**同一个包里出现两次**才是。
 * 前者由 `materialAppDedupeKey`（`(artifact, app)` 语义）天然允许，后者由同一个键在包内
 * 去重挡掉——两件事同一个键，这正是那个键预留给这个面的用途。
 *
 * 独立成文件而不是并进 `material-library-controller.ts` / `material-library-view.tsx`：
 * 那两个模块分别是 712 / 795 行，贴着 800 行硬顶（`material-library-scope.test.mjs` 在管）。
 */

import type { ArtifactType } from "./artifact-contract";
import { MATERIAL_TAXONOMY_LABEL } from "./material-library-controller";
import {
  materialAppDedupeKey,
  materialArtifactDedupeKey,
  materialEntryAppAttributions,
} from "./material-library-dedupe";
import {
  MATERIAL_SCENE_ALL_ID,
  MATERIAL_SCENE_OTHER_ID,
  MATERIAL_SCENE_OTHER_LABEL,
  MATERIAL_SITE_APP_OTHER_LABEL,
  materialEntryArtifactType,
  sceneCardTitle,
  type SceneSelection,
  type SiteAppDirectory,
} from "./material-scene-axis";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

/** 包内分区的分法。同一个包内只会用一种，取值规则见 `packSections`。 */
export type MaterialPackSectionBasis = "origin" | "artifact-type" | "single";

export const MATERIAL_PACK_ORIGIN_SECTION_ID = "origin";
export const MATERIAL_PACK_SHARED_SECTION_ID = "shared";
export const MATERIAL_PACK_SINGLE_SECTION_ID = "all";
export const MATERIAL_PACK_ORIGIN_SECTION_LABEL = "本 app 出品";
export const MATERIAL_PACK_SHARED_SECTION_LABEL = "其他 app 共享";

export interface MaterialPackCard {
  entry: WorkspaceLibraryEntry;
  /** `materialAppDedupeKey`。**包内唯一**，跨包会重复（那是允许的）。 */
  key: string;
  /** 同一份 artifact 的键。跨包比对同一件素材用这个。 */
  artifactKey: string;
  /** 本卡所属包的 app id。**详情里那一颗编辑按钮就落这个 app。** */
  appId: string;
  appName: string;
  /** true = 原生属于本包的 app；false = 从别的 app 共享进来。 */
  native: boolean;
  /** 这件素材一共进了几个包（≥1）。 */
  packCount: number;
  artifactType: ArtifactType | "";
}

export interface MaterialPackSection {
  /** 包内唯一：`origin` | `shared` | `type:<artifactType>` | `all`。 */
  id: string;
  label: string;
  basis: MaterialPackSectionBasis;
  cards: MaterialPackCard[];
}

export interface MaterialPack {
  /** `pack:<siteKey>:<appId>`。 */
  id: string;
  appId: string;
  appName: string;
  /** 这个包挂在哪些分类下；空数组 = 只在「其它」里出现。 */
  scenes: string[];
  /** 至少一个分区，永不为空数组。 */
  sections: MaterialPackSection[];
  total: number;
  /** app 在站点目录里的声明顺序。 */
  position: number;
}

export interface MaterialPackCategory {
  id: string;
  label: string;
  packs: MaterialPack[];
  packCount: number;
}

export interface MaterialPackView {
  categories: MaterialPackCategory[];
  /** 当前选中分类下的包，已排序。呈现层渲染这个。 */
  packs: MaterialPack[];
  /** 去重后本站一共多少件素材（不是卡片数）。 */
  artifactTotal: number;
  /** 卡片总数 = Σ 各包 total；跨包重复会被数多次。 */
  cardTotal: number;
  /** 进了不止一个包的素材件数。诊断用，不上界面。 */
  crossPackArtifacts: number;
}

export interface MaterialPackViewInput {
  entries: readonly WorkspaceLibraryEntry[];
  siteKey: string;
  directory: SiteAppDirectory | null;
  /** `null` = 全部；`""` = 其它；其余是场景词。 */
  scene: SceneSelection;
  /** `?app=` 锚点：只留这一个包。 */
  anchoredAppId?: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function metaText(entry: WorkspaceLibraryEntry, key: string): string {
  return text(entry.libraryItem?.meta?.[key]);
}

/**
 * 这件素材原生属于 `appId` 这个包吗。
 *
 * 两条判据，第一条有结论就不看第二条：
 *   1. durable 条目：归属里 `origin === true`，即 `owner.originAppId` 就是本包 app。
 *   2. 官方模板目录行：目录键的形状是「在本 app 名下铸的」——
 *      `material-library-template-source.ts` 自述 catalog key `unique within its app`，
 *      线上实际形状是 `<siteKey>-<appId>-<n>`，共享行是另一套前缀。判据只认「以本 app
 *      名下的前缀开头」，不依赖共享行那边叫什么。
 *
 * 都判不出来就算共享（判严不判松）：宁可把一件原生素材摆进「其他 app 共享」，也不要
 * 反过来声称某件素材是这个 app 的作品。
 */
function isNativeToApp(
  entry: WorkspaceLibraryEntry,
  appId: string,
  siteKey: string,
): boolean {
  if (!appId) return false;
  const attribution = materialEntryAppAttributions(entry, siteKey).find(
    (candidate) => candidate.appId === appId,
  );
  if (attribution?.origin) return true;
  const catalogId = metaText(entry, "template_material_id");
  if (!catalogId) return false;
  const site = siteKey || metaText(entry, "template_material_site_key");
  return (
    (Boolean(site) && catalogId.startsWith(`${site}-${appId}-`)) ||
    catalogId.startsWith(`${appId}-`)
  );
}

function appLabel(
  appId: string,
  fallback: string,
  directory: SiteAppDirectory | null,
): string {
  if (!appId) return MATERIAL_SITE_APP_OTHER_LABEL;
  return (
    directory?.apps.find((app) => app.appId === appId)?.name ||
    text(fallback) ||
    appId
  );
}

/**
 * 包内分区的三级阶梯，第一个能分出 ≥2 个非空分区的胜出。
 *
 * 为什么第一级是「原生 / 共享」而不是素材类型：类型这个维度在真实数据上几乎是退化的
 * （image 站 29 个包里 26 个只有一种 artifactType，design 站 22 个包里 17 个），按它分
 * 等于没有第三层；而「原生 / 共享」恰恰是素材包这个模型自己造出来的差别——一件素材能
 * 进多个包，用户站在包里就得看得出哪些是这个 app 真正的作品。image 站 29 个包里 28 个
 * 这两边都非空。读数与复现见 `tasks/W5-pack-model.md` §6。
 */
function packSections(
  cards: readonly MaterialPackCard[],
): MaterialPackSection[] {
  const native = cards.filter((card) => card.native);
  const shared = cards.filter((card) => !card.native);
  if (native.length > 0 && shared.length > 0) {
    return [
      {
        id: MATERIAL_PACK_ORIGIN_SECTION_ID,
        label: MATERIAL_PACK_ORIGIN_SECTION_LABEL,
        basis: "origin",
        cards: native,
      },
      {
        id: MATERIAL_PACK_SHARED_SECTION_ID,
        label: MATERIAL_PACK_SHARED_SECTION_LABEL,
        basis: "origin",
        cards: shared,
      },
    ];
  }
  const byType = new Map<string, MaterialPackCard[]>();
  for (const card of cards) {
    const type = card.artifactType || "";
    const bucket = byType.get(type);
    if (bucket) bucket.push(card);
    else byType.set(type, [card]);
  }
  if (byType.size > 1) {
    return [...byType.entries()].map(([type, bucket]) => ({
      id: `type:${type}`,
      label: type
        ? MATERIAL_TAXONOMY_LABEL[type as ArtifactType] || type
        : "其他形态",
      basis: "artifact-type" as const,
      cards: bucket,
    }));
  }
  return [
    {
      id: MATERIAL_PACK_SINGLE_SECTION_ID,
      label: "全部",
      basis: "single",
      cards: [...cards],
    },
  ];
}

interface PackDraft {
  appId: string;
  cards: MaterialPackCard[];
  keys: Set<string>;
}

/**
 * 三层的唯一取值入口：按 artifact 去重 → 展开到每个归属 app → 成包 → 包内分区 → 分类。
 *
 * 顺序是刻意的。先按 artifact 去重，保证同一份素材在同一个包里只被考虑一次；再按归属
 * **展开**（而不是像分区轴那样挑一个赢家），跨包重复才出得来。
 */
export function materialPackView(
  input: MaterialPackViewInput,
): MaterialPackView {
  const siteKey = text(input.siteKey);
  const directory = input.directory;
  const anchored = text(input.anchoredAppId);
  const seenArtifacts = new Set<string>();
  const drafts = new Map<string, PackDraft>();
  const order: string[] = [];
  let artifactTotal = 0;
  let crossPackArtifacts = 0;

  for (const entry of input.entries) {
    const artifactKey = materialArtifactDedupeKey(entry);
    if (!artifactKey || seenArtifacts.has(artifactKey)) continue;
    seenArtifacts.add(artifactKey);
    artifactTotal += 1;
    const attributions = materialEntryAppAttributions(entry, siteKey);
    // 归属解析不出来的素材不许消失：它落进 appId 为 "" 的兜底包。
    const targets = attributions.length > 0 ? attributions : [null];
    if (targets.length > 1) crossPackArtifacts += 1;
    const artifactType = materialEntryArtifactType(entry);
    for (const attribution of targets) {
      const appId = attribution?.appId || "";
      const key = materialAppDedupeKey(entry, appId);
      let draft = drafts.get(appId);
      if (!draft) {
        draft = { appId, cards: [], keys: new Set() };
        drafts.set(appId, draft);
        order.push(appId);
      }
      // G2：包内去重。`(artifact, app)` 键相同就是同一格里的同一件素材，不许并排两张。
      if (draft.keys.has(key)) continue;
      draft.keys.add(key);
      const appName = appLabel(appId, attribution?.label || "", directory);
      draft.cards.push({
        entry: {
          ...entry,
          title: sceneCardTitle(entry.title, appName),
          category: appName,
        },
        key,
        artifactKey,
        appId,
        appName,
        native: isNativeToApp(entry, appId, siteKey),
        packCount: targets.length,
        artifactType,
      });
    }
  }

  const allPacks: MaterialPack[] = order
    .map((appId) => {
      const draft = drafts.get(appId)!;
      const app = directory?.apps.find(
        (candidate) => candidate.appId === appId,
      );
      return {
        id: `pack:${siteKey}:${appId}`,
        appId,
        appName: appLabel(appId, draft.cards[0]?.appName || "", directory),
        scenes: app?.scenes ? [...app.scenes] : [],
        sections: packSections(draft.cards),
        total: draft.cards.length,
        // 目录里没有这个 app（兜底包、目录还没注册）时排到最后，而不是插到最前。
        position: app ? app.position : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.position - b.position || a.appId.localeCompare(b.appId));

  const otherPacks = allPacks.filter((pack) => pack.scenes.length === 0);
  const categories: MaterialPackCategory[] = [
    {
      id: MATERIAL_SCENE_ALL_ID,
      label: "全部",
      packs: allPacks,
      packCount: allPacks.length,
    },
  ];
  for (const scene of directory?.scenes || []) {
    const packs = allPacks.filter((pack) => pack.scenes.includes(scene));
    categories.push({ id: scene, label: scene, packs, packCount: packs.length });
  }
  if (directory && (directory.hasUnscopedApps || otherPacks.length > 0)) {
    categories.push({
      id: MATERIAL_SCENE_OTHER_ID,
      label: MATERIAL_SCENE_OTHER_LABEL,
      packs: otherPacks,
      packCount: otherPacks.length,
    });
  }

  const scene = input.scene;
  const packs = anchored
    ? allPacks.filter((pack) => pack.appId === anchored)
    : scene === null
      ? allPacks
      : scene === ""
        ? otherPacks
        : allPacks.filter((pack) => pack.scenes.includes(scene));

  return {
    categories,
    packs,
    artifactTotal,
    cardTotal: allPacks.reduce((sum, pack) => sum + pack.total, 0),
    crossPackArtifacts,
  };
}

/** 一个包里的全部卡片，按分区顺序摊平。 */
export function materialPackCards(pack: MaterialPack): MaterialPackCard[] {
  return pack.sections.flatMap((section) => section.cards);
}

/**
 * 这件素材在本视图里进了哪些包。详情浮层要说明「它在别的包里也有」时用这个；
 * **不要拿它去重**——跨包重复是操作员明确要的。
 */
export function materialPacksOfArtifact(
  view: MaterialPackView,
  artifactKey: string,
): MaterialPack[] {
  if (!artifactKey) return [];
  return view.categories[0]?.packs.filter((pack) =>
    pack.sections.some((section) =>
      section.cards.some((card) => card.artifactKey === artifactKey),
    ),
  ) || [];
}
