/**
 * 「换美术风格」这条快捷动作能引用的素材来源（判据 3）。
 *
 * ## 为什么这张表只收 CC0，而且是**一个字面量许可**
 *
 * 作者点「换美术风格」时，agent 会把这些来源写进提示词，作者会照着去取图，
 * 而取回来的图**会随他的作品一起发布**。所以这张表的许可栏不是元数据，是承诺：
 * 写错一行，作者的作品就带着一份他没有权利分发的素材上线了。
 *
 * CC0-1.0 是唯一收的许可（`_COMMON.md` 本波红线：Kenney.nl / OpenGameArt 素材要 CC0）。
 * 不收 CC-BY —— 它要求署名，而署名位在游戏画面里没有位置，作者也不会知道自己欠一句。
 * 「宽松到不用管」和「宽松但有一个必须做的动作」对作者是两回事。
 *
 * ## ⚠️ OpenGameArt 是混许可站，这是本文件最要紧的一行
 *
 * Kenney 整站是 CC0，给个首页就行。**OpenGameArt 不是**：站上同时有 CC-BY、
 * CC-BY-SA、GPL 与 CC0，默认搜索结果混在一起。所以这里给的**必须**是带 CC0 过滤参数
 * 的搜索地址，而不是站点首页 —— 给首页等于让作者在混许可结果里自己挑，
 * 而他挑错的那次没有任何东西会告诉他。`requiresLicenseFilter` 就是这条事实的落点，
 * 提示词渲染时会把它变成一句给作者看的硬提醒。
 */

/** 本表唯一接受的许可标识符（SPDX）。 */
export const CC0_LICENSE_ID = "CC0-1.0";

export interface Cc0ArtSource {
  id: string;
  /** 站点名，写给作者看的。 */
  label: string;
  /** 必须逐字等于 `CC0_LICENSE_ID`。 */
  license: typeof CC0_LICENSE_ID;
  /**
   * 作者该点开的那个地址。混许可站必须是**已带 CC0 过滤**的地址，
   * 不是站点首页。
   */
  url: string;
  /** 这个站适合取什么。一句话，不写营销话术。 */
  suits: string;
  /**
   * 该站是否混许可、因而依赖 URL 里的过滤条件。
   * `true` 时提示词里会附一句「只取标着 CC0 的那些」。
   */
  requiresLicenseFilter: boolean;
}

/**
 * 素材来源表。**加一行之前先问许可**：这张表进的是作者的发布物，不是我们的文档。
 */
export const CC0_ART_SOURCES: readonly Cc0ArtSource[] = Object.freeze([
  {
    id: "kenney",
    label: "Kenney.nl",
    license: CC0_LICENSE_ID,
    url: "https://kenney.nl/assets",
    suits: "成套的 2D 精灵、UI 图标、音效，同一套里风格统一，换风格最省事",
    requiresLicenseFilter: false,
  },
  {
    id: "opengameart-cc0",
    label: "OpenGameArt（CC0 过滤）",
    license: CC0_LICENSE_ID,
    // 站上混着 CC-BY / CC-BY-SA / GPL，这个查询参数就是 CC0 那一档。
    url: "https://opengameart.org/art-search-advanced?field_art_licenses_tid%5B%5D=4",
    suits: "单件素材与音乐量大，找特定题材（像素飞船、手绘树）比成套站更容易命中",
    requiresLicenseFilter: true,
  },
] as const);

/** 这一条来源合规吗。许可不是 CC0、或混许可站却给了不带过滤的地址，都不合规。 */
export function isCc0ArtSource(source: Cc0ArtSource): boolean {
  if (source.license !== CC0_LICENSE_ID) return false;
  if (!source.id || !source.label || !source.suits) return false;
  let parsed: URL;
  try {
    parsed = new URL(source.url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  // 混许可站给站点首页 = 让作者在混许可结果里自己挑，这正是本文件要挡的事。
  if (source.requiresLicenseFilter && !parsed.search) return false;
  return true;
}

/** 整张表合规吗。模块加载时就跑一次（见文件末尾）。 */
export function cc0ArtSourcesAreValid(
  sources: readonly Cc0ArtSource[] = CC0_ART_SOURCES,
): boolean {
  if (sources.length === 0) return false;
  const ids = new Set<string>();
  for (const source of sources) {
    if (!isCc0ArtSource(source)) return false;
    if (ids.has(source.id)) return false;
    ids.add(source.id);
  }
  return true;
}

/**
 * 把来源表渲染成提示词里的那几行。
 *
 * 混许可站那一行**必须**带上「只取标着 CC0 的」这句：agent 转述时会丢掉 URL 里的
 * 查询参数（作者也会手改地址），所以这条约束不能只活在 URL 里。
 */
export function renderCc0ArtSourceLines(
  sources: readonly Cc0ArtSource[] = CC0_ART_SOURCES,
): string[] {
  return sources.map((source) => {
    const filter = source.requiresLicenseFilter
      ? "（该站混许可，**只取标着 CC0 的那些**）"
      : "（整站 CC0）";
    return `${source.label} ${source.url} ${filter} —— ${source.suits}`;
  });
}

/**
 * 模块加载即自检：一条许可写错的来源与一条不存在的来源，对作者是一样的
 * （他都会去取图），但对我们差别很大 —— 前者今天就该炸在这里。
 */
if (!cc0ArtSourcesAreValid()) {
  throw new Error(
    "CC0_ART_SOURCES 里有不合规的来源（许可不是 CC0-1.0，或混许可站没带 CC0 过滤参数）。",
  );
}
