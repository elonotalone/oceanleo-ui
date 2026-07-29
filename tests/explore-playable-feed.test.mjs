// 探索页两类分区 + 可玩游戏竖向 feed + 真实热度排序（本轮合同 §0 P1/P2、缺口 G3）。
//
// 判据：
//   ① 分类只按 **artifact 类型** 推导，站点侧一个开关都没有（C4 锁死四属性）；
//   ② 可玩那一类**只有一种布局**：整屏逐条 + 滚动吸附，没有网格变体（P1）；
//   ③ 排序按真实热度（游玩 / 点赞 / 二创；素材侧用原站下载量），**不按创建时间**；
//   ④ 没有热度数据时如实标记 `data-explore-popularity-ready="false"`，不静默退回创建时间序；
//   ⑤ 可玩那一格只在真的有可玩作品时出现——其余 35 站不许凭空多一个恒空分区。
//
// 全程纯函数 + 服务端渲染字符串，不起浏览器（本轮未批准浏览器验证）。

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { ARTIFACT_TYPES } from "../src/shell/artifact-contract.ts";
import {
  EXPLORE_HOT_WEIGHTS,
  EXPLORE_MATERIAL_ARTIFACT_TYPES,
  EXPLORE_PLAYABLE_ARTIFACT_TYPES,
  defaultExploreClass,
  exploreArtifactClassOf,
  exploreClassChips,
  exploreEntriesOfClass,
  exploreHasPopularityEvidence,
  explorePopularity,
  exploreRenderModeFor,
  partitionExploreEntries,
  sortByExplorePopularity,
} from "../src/shell/explore-artifact-class.ts";

// ── 待测组件的编译（与 explore-sections.test.mjs 同法；封面渲染器用桩件）──────
const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const compiledDir = mkdtempSync(join(tmpdir(), "oceanleo-explore-feed-"));
process.on("exit", () => rmSync(compiledDir, { recursive: true, force: true }));
const compiled = new Map();
let seq = 0;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function resolveRelative(fromPath, specifier) {
  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = resolve(dirname(fromPath), specifier + suffix);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function compileModule(relativePath, overrides) {
  const sourcePath = resolve(relativePath);
  const cached = compiled.get(sourcePath);
  if (cached) return cached;
  let output = ts.transpileModule(await readFile(sourcePath, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  for (const specifier of new Set(
    [...output.matchAll(/from\s+"([^"]+)"/g)].map(([, spec]) => spec),
  )) {
    let replacement = overrides[specifier];
    if (!replacement && specifier === "react") replacement = reactUrl;
    if (!replacement && specifier === "react/jsx-runtime") {
      replacement = jsxRuntimeUrl;
    }
    if (!replacement && specifier.startsWith(".")) {
      const target = resolveRelative(sourcePath, specifier);
      assert.ok(target, `${relativePath} 里解析不到 ${specifier}`);
      replacement = await compileModule(
        relative(process.cwd(), target),
        overrides,
      );
    }
    assert.ok(replacement, `${relativePath} 依赖了无法解析的 ${specifier}`);
    output = output.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
  }
  seq += 1;
  const file = join(
    compiledDir,
    `${String(seq).padStart(3, "0")}-${basename(relativePath).replace(/\.tsx?$/, "")}.mjs`,
  );
  writeFileSync(file, output);
  const url = pathToFileURL(file).href;
  compiled.set(sourcePath, url);
  return url;
}

const { ExplorePlayableFeed, EXPLORE_FEED_ITEM_CLASS, EXPLORE_FEED_SCROLLER_CLASS } =
  await import(
    await compileModule("src/shell/ExplorePlayableFeed.tsx", {
      "../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
      // 封面渲染器是另一条链（A1–A8 判据），feed 只需要证明它把 plan 交出去了。
      "./workspace-library-cover": dataModule(`
        import { createElement } from ${JSON.stringify(reactUrl)};
        export function workspaceCoverPlan({ url }) {
          return url
            ? { renderer: "image", url, mediaType: "image/webp", format: "webp", fit: "cover", sourceAspectRatio: null }
            : { renderer: "unavailable", url: "", mediaType: "", format: "", fit: "contain", sourceAspectRatio: null, failureReason: "这个条目没有可显示的真实封面。" };
        }
        export function WorkspaceCoverResource({ plan, alt }) {
          return createElement("img", { "data-cover-renderer": plan.renderer, src: plan.url, alt });
        }
      `),
    })
  );

// ── 夹具 ─────────────────────────────────────────────────────────────────────

function gameEntry(id, title, stats, extra = {}) {
  return {
    id,
    title,
    thumbUrl: `https://asset.oceanleo.com/cover/${id}.webp`,
    libraryItem: {
      key: `artifact:${id}:r1`,
      source: "artifact",
      id,
      artifactId: id,
      revisionId: "r1",
      artifactType: "game",
      kind: "game",
      title,
      siteId: "game",
      favorite: false,
      createdAt: extra.createdAt,
      meta: { workspace_library_surface: "materials", ...stats },
    },
  };
}

function materialEntry(id, title, meta) {
  return {
    id,
    title,
    libraryItem: {
      key: `artifact:${id}:r1`,
      source: "artifact",
      id,
      artifactId: id,
      revisionId: "r1",
      artifactType: "single_file_image",
      kind: "image",
      title,
      siteId: "game",
      favorite: false,
      meta: { workspace_library_surface: "materials", ...meta },
    },
  };
}

function markup(props) {
  return renderToStaticMarkup(createElement(ExplorePlayableFeed, props));
}

function feedItemIds(html) {
  return [...html.matchAll(/data-explore-feed-item="([^"]+)"/g)].map(([, id]) => id);
}

// ── ① 分类按 artifact 类型 ───────────────────────────────────────────────────

test("分类只按 artifact 类型：game 是可玩，其余 13 类全是素材", () => {
  assert.deepEqual([...EXPLORE_PLAYABLE_ARTIFACT_TYPES], ["game"]);
  assert.equal(exploreArtifactClassOf("game"), "playable");
  for (const type of ARTIFACT_TYPES) {
    if (type === "game") continue;
    assert.equal(exploreArtifactClassOf(type), "material", `${type} 归错了类`);
  }
  // 两类之和恰好是全部 artifact type，共享包里不许有第二份名单。
  assert.equal(
    EXPLORE_MATERIAL_ARTIFACT_TYPES.length + EXPLORE_PLAYABLE_ARTIFACT_TYPES.length,
    ARTIFACT_TYPES.length,
  );
  assert.ok(!EXPLORE_MATERIAL_ARTIFACT_TYPES.includes("game"));
  // 认不出来的类型落进网格，不落进整屏 feed（那会得到一屏空白）。
  assert.equal(exploreArtifactClassOf(""), "material");
  assert.equal(exploreArtifactClassOf(undefined), "material");
  assert.equal(exploreArtifactClassOf("not-a-type"), "material");
});

test("P1：可玩那一类只有竖向 feed 一种呈现模式，没有网格变体", () => {
  assert.equal(exploreRenderModeFor("playable"), "vertical-feed");
  assert.equal(exploreRenderModeFor("material"), "grid");
  const source = readFileSync(
    new URL("../src/shell/ExplorePlayableFeed.tsx", import.meta.url),
    "utf8",
  );
  // feed 组件不接受任何 layout/variant 开关——「只做竖向」在接口层就成立。
  for (const variant of [/layout\?:/, /variant\?:/, /grid\?:/, /mode\?:/]) {
    assert.doesNotMatch(source, variant, "可玩 feed 出现了布局开关");
  }
});

// ── ② 吸附与整屏 ─────────────────────────────────────────────────────────────

test("竖向 feed 是整屏逐条 + 滚动吸附（W4 反转断言就盯这几个类名）", () => {
  const html = markup({
    entries: [gameEntry("g1", "霓虹长蛇", { plays: 10 })],
    onPlay: () => {},
  });
  assert.match(html, /data-explore-feed="vertical"/);
  assert.match(html, /data-explore-render-mode="vertical-feed"/);
  // 容器：竖向吸附 + 强制吸附点。
  for (const cls of ["snap-y", "snap-mandatory", "overflow-y-auto", "overscroll-y-contain"]) {
    assert.ok(
      EXPLORE_FEED_SCROLLER_CLASS.includes(cls),
      `吸附容器少了 ${cls}`,
    );
  }
  // 逐条：吸附到顶端，且一条撑满内容视口。
  for (const cls of ["snap-start", "snap-always", "h-full"]) {
    assert.ok(EXPLORE_FEED_ITEM_CLASS.includes(cls), `feed 逐条少了 ${cls}`);
  }
  assert.ok(html.includes("snap-y"), "渲染结果里没有吸附容器类名");
  assert.ok(html.includes("snap-start"), "渲染结果里没有逐条吸附类名");
  // 键盘可达：吸附容器只能滚轮/触摸操作的话，键盘用户拿不到 feed。
  assert.match(html, /role="feed"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-posinset="1"/);
  assert.match(html, /aria-setsize="1"/);
});

// ── ③ 排序按真实热度，不按创建时间 ──────────────────────────────────────────

test("热度取值：只认数字，认得 UgcStats 信封与原站下载量字段", () => {
  const bare = explorePopularity(
    gameEntry("g1", "甲", { plays: 120, likes: 4, remixes: 1 }).libraryItem,
  );
  assert.equal(bare.known, true);
  assert.deepEqual(
    [bare.plays, bare.likes, bare.remixes],
    [120, 4, 1],
  );
  assert.equal(
    bare.score,
    4 * EXPLORE_HOT_WEIGHTS.like +
      1 * EXPLORE_HOT_WEIGHTS.remix +
      Math.log1p(120) * EXPLORE_HOT_WEIGHTS.playLog,
  );
  // `UgcStats` 整份挂在 meta.stats / meta.ugc_stats 上也要读得到。
  const enveloped = explorePopularity(
    gameEntry("g2", "乙", { ugc_stats: { plays: 5, likes: 2, remixes: 0 } })
      .libraryItem,
  );
  assert.deepEqual([enveloped.plays, enveloped.likes], [5, 2]);
  // 素材侧：ambientCG `downloadCount` 与 Poly Haven `download_count` 都是权威字段。
  assert.equal(
    explorePopularity(materialEntry("m1", "砖墙", { downloadCount: 900 }).libraryItem)
      .score,
    900,
  );
  assert.equal(
    explorePopularity(materialEntry("m2", "草地", { download_count: 40 }).libraryItem)
      .score,
    40,
  );
  // 字符串与负数不是热度：读错一次就是整页顺序错，该在产出侧修。
  assert.equal(
    explorePopularity(gameEntry("g3", "丙", { plays: "999" }).libraryItem).known,
    false,
  );
  assert.equal(
    explorePopularity(gameEntry("g4", "丁", { plays: -5 }).libraryItem).known,
    false,
  );
  assert.equal(explorePopularity(undefined).known, false);
});

test("排序按热度而不是创建时间：最新的零互动作品不许挡在前面", () => {
  const entries = [
    // 服务端按创建时间倒排递给我们：最新的在最前，却一次都没被玩过。
    gameEntry("newest", "刚生成的", { plays: 0, likes: 0 }, { createdAt: "2026-07-28T10:00:00Z" }),
    gameEntry("old-hit", "被玩烂的", { plays: 5000, likes: 300, remixes: 40 }, { createdAt: "2026-01-01T00:00:00Z" }),
    gameEntry("mid", "有人玩的", { plays: 300, likes: 12, remixes: 1 }, { createdAt: "2026-05-01T00:00:00Z" }),
  ];
  assert.deepEqual(
    sortByExplorePopularity(entries).map((entry) => entry.id),
    ["old-hit", "mid", "newest"],
  );
  // feed 渲染的顺序就是交进去的顺序（排序是纯函数的事，呈现层不再排第二遍）。
  assert.deepEqual(
    feedItemIds(markup({ entries: sortByExplorePopularity(entries) })),
    ["old-hit", "mid", "newest"],
  );
});

test("没有热度数据的条目排在最后，且彼此保持服务端原顺序", () => {
  const entries = [
    gameEntry("unknown-a", "无数据甲", {}),
    gameEntry("hot", "有数据", { plays: 10, likes: 1 }),
    gameEntry("unknown-b", "无数据乙", {}),
  ];
  assert.deepEqual(
    sortByExplorePopularity(entries).map((entry) => entry.id),
    ["hot", "unknown-a", "unknown-b"],
  );
  // 「没数据」与「热度为 0」必须区分得开。
  assert.equal(explorePopularity(entries[0].libraryItem).known, false);
  assert.equal(
    explorePopularity(gameEntry("zero", "零热度", { plays: 0 }).libraryItem).known,
    true,
  );
});

test("同分 tie-break 确定：按标题再按 id，绝不看创建时间（SSR 与 hydration 必须同序）", () => {
  const entries = [
    gameEntry("b", "同名", { plays: 7 }, { createdAt: "2026-07-01T00:00:00Z" }),
    gameEntry("a", "同名", { plays: 7 }, { createdAt: "2026-01-01T00:00:00Z" }),
    gameEntry("c", "另一个", { plays: 7 }),
  ];
  assert.deepEqual(
    sortByExplorePopularity(entries).map((entry) => entry.id),
    ["c", "a", "b"],
  );
  const source = readFileSync(
    new URL("../src/shell/explore-artifact-class.ts", import.meta.url),
    "utf8",
  );
  // 排序里不许出现任何时间取值，否则 SSR 与 hydration 会排出两个顺序。
  assert.doesNotMatch(source, /createdAt/);
  assert.doesNotMatch(source, /Date\.(now|parse)/);
});

// ── ④ 热度缺失如实标记 ──────────────────────────────────────────────────────

test("热度数据未就绪时如实标记，不静默退回创建时间序", () => {
  const withoutStats = [gameEntry("g1", "甲", {}), gameEntry("g2", "乙", {})];
  assert.equal(exploreHasPopularityEvidence(withoutStats), false);
  const html = markup({ entries: withoutStats });
  assert.match(html, /data-explore-popularity-ready="false"/);
  assert.match(html, /data-explore-popularity-order="hot"/);
  assert.match(html, /data-explore-feed-metric="none"/);
  assert.match(html, /这一条还没有热度数据。/);

  const withStats = [gameEntry("g3", "丙", { plays: 3, likes: 1 })];
  assert.equal(exploreHasPopularityEvidence(withStats), true);
  const ready = markup({ entries: withStats });
  assert.match(ready, /data-explore-popularity-ready="true"/);
  assert.match(ready, /data-explore-feed-metric="plays"/);
});

// ── ⑤ 两类分区轴 ────────────────────────────────────────────────────────────

test("可玩那一格只在真的有可玩作品时出现（其余 35 站不多一个空分区）", () => {
  const onlyMaterials = exploreClassChips({ playableCount: 0, materialCount: 42 });
  assert.deepEqual(onlyMaterials.map((chip) => chip.id), ["material"]);
  assert.equal(defaultExploreClass({ playableCount: 0 }), "material");

  const both = exploreClassChips({ playableCount: 118, materialCount: 3200 });
  assert.deepEqual(both.map((chip) => chip.id), ["playable", "material"]);
  assert.deepEqual(
    both.map((chip) => chip.renderMode),
    ["vertical-feed", "grid"],
  );
  assert.deepEqual(both.map((chip) => chip.label), ["可玩游戏", "游戏素材"]);
  // 有可玩作品时默认落在可玩那一类：这一站的主角是能玩的东西。
  assert.equal(defaultExploreClass({ playableCount: 118 }), "playable");
});

test("两类分开：可玩进 feed，素材留在网格，各自按自己的热度排序", () => {
  const mixed = [
    materialEntry("m-low", "低下载", { download_count: 10 }),
    gameEntry("g-cold", "冷门游戏", { plays: 1 }),
    materialEntry("m-high", "高下载", { download_count: 9000 }),
    gameEntry("g-hot", "热门游戏", { plays: 900, likes: 50 }),
  ];
  const split = partitionExploreEntries(mixed);
  assert.deepEqual(split.playable.map((entry) => entry.id), ["g-hot", "g-cold"]);
  assert.deepEqual(split.material.map((entry) => entry.id), ["m-high", "m-low"]);
  // 网格那一侧看不到可玩作品（不再是「混在一屏」）。
  assert.deepEqual(
    exploreEntriesOfClass(mixed, "material").map((entry) => entry.id),
    ["m-high", "m-low"],
  );
  assert.deepEqual(
    exploreEntriesOfClass(mixed, "playable").map((entry) => entry.id),
    ["g-hot", "g-cold"],
  );
});

// ── 站点侧零配置不被破坏 ────────────────────────────────────────────────────

test("能力配置一律在共享包内推导：站点侧 props 与分派开关无关", () => {
  const explore = readFileSync(
    new URL("../src/shell/ExplorePage.tsx", import.meta.url),
    "utf8",
  );
  // 站点交上来的还是那四个属性；分类开关是共享包自己造的，不是新的 prop。
  assert.doesNotMatch(explore, /artifactClass\?:/);
  assert.doesNotMatch(explore, /exploreClass\?:/);
  assert.match(explore, /exploreClassDispatch=\{classDispatch\}/);
  // 深链键 `?class=` 与既有 `?scene=` / `?types=` 同一套做法。
  assert.match(explore, /params\.get\(CLASS_QUERY_KEY\)/);

  const dispatchSource = readFileSync(
    new URL("../src/shell/explore-shelf-dispatch.tsx", import.meta.url),
    "utf8",
  );
  // 分派判据里不许出现任何站点 key：那就是「game 站的站内特例」的形状。
  assert.doesNotMatch(dispatchSource, /siteKey === "/);
  assert.doesNotMatch(dispatchSource, /"game"\s*===/);
  // 可玩探针必须按 generated_output 搜：promoted games 的 roles 不可变，没有 template。
  assert.match(dispatchSource, /role:\s*EXPLORE_PLAYABLE_LIBRARY_ROLE/);
  assert.match(dispatchSource, /generated_output/);
});

test("素材那一类的预览 / 编辑 / 下载没有被动过", () => {
  const view = readFileSync(
    new URL("../src/shell/material-library-view.tsx", import.meta.url),
    "utf8",
  );
  // 网格仍然是 WorkspaceLibrary，仍然把 onOpenItem 接在准备好的条目上。
  assert.match(view, /<WorkspaceLibrary/);
  assert.match(view, /onOpenItem=\{openPreparedItem\}/);
  // 可玩那一类的整块呈现只有一个返回分支，且只在 feed 模式下走。
  assert.match(view, /dispatch\.renderMode === "vertical-feed"/);
  assert.match(view, /<ExplorePlayableSurface/);
});
