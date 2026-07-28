// 热度数值的**放行链**：库检索响应 → artifact 投影 → `LibraryItem.meta` → 探索页取值。
//
// 这条链上原本有两处会把热度吃掉：`normalizeArtifactProjection` 重建对象、丢弃未知键；
// `artifactProjectionToLibraryItem` 的 `meta` 是白名单。两处都不报错，症状只是排序悄悄
// 退回服务端给的创建时间序——所以放行必须有断言看着，不能靠肉眼。
//
// 判据：
//   ① 放行与取值共用**同一份**键名与信封名单（两份名单是这条链最容易埋的 bug）；
//   ② 对产出方的命名**不硬依赖**：`plays` / `play_count`、顶层 / `stats` / `ugc_stats`
//      都接得上（后端那一半由 W9 落地，字段名此刻未知）；
//   ③ 数据缺席时 `known: false` 且 `meta` 里连键都没有 —— `data-explore-popularity-ready`
//      必须还能翻回 `false`，绝不静默退回创建时间序；
//   ④ 非数字、负数、空信封一律不放行（热度是排序键，读错一次整页顺序就错）；
//   ⑤ 排序里没有时钟（SSR 与 hydration 必须同序）。
//
// 全程纯函数，不起浏览器（本轮未批准浏览器验证）。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeArtifactProjection,
  POPULARITY_ENVELOPE_KEYS,
  POPULARITY_META_KEY,
  POPULARITY_METRIC_ALIASES,
  popularityMetricsFromWire,
} from "../src/shell/artifact-contract.ts";
import {
  EXPLORE_POPULARITY_KEYS,
  explorePopularity,
  exploreHasPopularityEvidence,
  sortByExplorePopularity,
} from "../src/shell/explore-artifact-class.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";

/** 一行真实形状的 `/v1/library/search` 响应项；`extra` 是产出方额外挂上的键。 */
function wireRow(extra = {}, { artifactType = "game", id = "a1" } = {}) {
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: id,
    revision_id: "r1",
    artifact_type: artifactType,
    roles: ["template"],
    title: `作品 ${id}`,
    favorite: false,
    owner: {
      principal_id: "user-1",
      visibility: "public",
      origin_site_key: "game",
      origin_app_id: "leoplay",
    },
    access: {
      can_read: true,
      can_preview: true,
      can_edit: true,
      can_fork: true,
      can_insert: true,
      can_replace: true,
      can_favorite: true,
      can_bind: true,
      can_export_source: true,
    },
    editability: "bounded",
    // 逐字照 `ADVANCED_FEATURE_CONTRACTS` 的 game 行：产物是 `oceanleo.game-bundle.v1`
    // JSON 信封，不是裸 text/html。写错这两个字段投影会被判 source-format-mismatch，
    // 那时测的就不是热度放行了。
    editor_capability: artifactType === "game" ? "game-editor" : "image-editor",
    source_format:
      artifactType === "game" ? "oceanleo.game-bundle.v1" : "png",
    renditions: {
      preview: {
        purpose: "preview",
        revision_id: "r1",
        url: `https://signed.test/${id}.png`,
        format: "png",
        media_type: "image/png",
      },
      source: {
        purpose: "source",
        revision_id: "r1",
        url:
          artifactType === "game"
            ? `https://signed.test/${id}.json`
            : `https://signed.test/${id}-source.png`,
        format:
          artifactType === "game" ? "oceanleo.game-bundle.v1" : "png",
        media_type:
          artifactType === "game" ? "application/json" : "image/png",
        digest: `sha256:${id}`,
      },
    },
    provenance: { id: `prov-${id}`, source_kind: "owned", license_code: "owned" },
    integrity: { ok: true, code: "ok", reason: "" },
    context_bindings: [],
    created_at: "2026-07-01T00:00:00Z",
    ...extra,
  };
}

/** 走完整条链：wire 行 → 投影 → LibraryItem。 */
function itemFromWire(extra, options) {
  const projection = normalizeArtifactProjection(wireRow(extra, options));
  assert.ok(projection, "投影没通过归一化，放行链的前提就不成立");
  return artifactProjectionToLibraryItem(projection);
}

// ── ① 一份名单 ──────────────────────────────────────────────────────────────

test("放行与取值共用同一份名单：不许出现「放行了 play_count、取值只认 plays」", () => {
  // 同一个对象引用，不是「内容恰好相等」——复制一份出来就会随时间漂移。
  assert.equal(EXPLORE_POPULARITY_KEYS, POPULARITY_METRIC_ALIASES);
  assert.deepEqual(Object.keys(POPULARITY_METRIC_ALIASES), [
    "plays",
    "likes",
    "remixes",
    "downloads",
  ]);
  // 放行层写进 meta 的信封键，取值层必须认得。
  assert.ok(POPULARITY_ENVELOPE_KEYS.includes(POPULARITY_META_KEY));
  // 取值层不许再自带一份信封名单（那正是本次要根除的重复）。
  const source = readFileSync(
    new URL("../src/shell/explore-artifact-class.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /"ugc_stats"/);
  assert.doesNotMatch(source, /"play_count"/);
  // 放行层也不许把名单抄一份到别处：整个 src 里只有契约那一个文件写这些字面量。
  assert.equal(
    readFileSync(
      new URL("../src/shell/library-data.ts", import.meta.url),
      "utf8",
    ).includes('"download_count"'),
    false,
  );
});

// ── ② 不硬依赖产出方的命名 ──────────────────────────────────────────────────

test("W9 用什么字段名都接得上：plays / play_count、顶层 / stats / ugc_stats", () => {
  for (const [label, extra, expected] of [
    ["顶层规范名", { plays: 120, likes: 4, remixes: 1 }, { plays: 120, likes: 4 }],
    [
      "顶层 _count 后缀",
      { play_count: 30, like_count: 2 },
      { plays: 30, likes: 2 },
    ],
    [
      "stats 信封",
      { stats: { plays: 9, likes: 3, remixes: 2 } },
      { plays: 9, likes: 3 },
    ],
    [
      "ugc_stats 信封（migration 0111 的表名）",
      { ugc_stats: { playCount: 7, likeCount: 1 } },
      { plays: 7, likes: 1 },
    ],
    [
      "meta 下的信封",
      { meta: { ugcStats: { plays: 5, remixes: 4 } } },
      { plays: 5, remixes: 4 },
    ],
  ]) {
    const item = itemFromWire(extra);
    const popularity = explorePopularity(item);
    assert.equal(popularity.known, true, `${label}：热度没放行过来`);
    for (const [metric, value] of Object.entries(expected)) {
      assert.equal(popularity[metric], value, `${label}：${metric} 读错了`);
    }
    // 放行下来的键名保留产出方的原始写法，供证据点名。
    assert.ok(
      item.meta[POPULARITY_META_KEY] &&
        Object.keys(item.meta[POPULARITY_META_KEY]).length > 0,
      `${label}：meta 上没有热度信封`,
    );
  }
});

test("素材侧走同一条链：ambientCG downloadCount 与 Poly Haven download_count", () => {
  const ambient = explorePopularity(
    itemFromWire(
      { downloadCount: 900 },
      { artifactType: "single_file_image", id: "m1" },
    ),
  );
  assert.equal(ambient.known, true);
  // 素材侧的热度就是下载量本身，不套可玩侧的加权。
  assert.equal(ambient.score, 900);
  const polyhaven = explorePopularity(
    itemFromWire(
      { meta: { stats: { download_count: 40 } } },
      { artifactType: "model_3d", id: "m2" },
    ),
  );
  assert.equal(polyhaven.score, 40);
});

// ── ③ 缺席时如实标记 ────────────────────────────────────────────────────────

test("热度缺席：meta 里连键都没有，known 仍是 false", () => {
  const item = itemFromWire({});
  assert.equal(
    Object.prototype.hasOwnProperty.call(item.meta, POPULARITY_META_KEY),
    false,
    "没有热度数据时不许写一个空信封：空对象会让 ready 标记再也翻不回 false",
  );
  assert.equal(explorePopularity(item).known, false);
  assert.equal(
    exploreHasPopularityEvidence([
      { id: "a1", title: "甲", libraryItem: item },
    ]),
    false,
  );
});

test("放行链通了之后 ready 标记必须真的能翻成 true", () => {
  const withStats = {
    id: "hot",
    title: "有数据",
    libraryItem: itemFromWire({ ugc_stats: { plays: 3, likes: 1 } }),
  };
  const withoutStats = {
    id: "cold",
    title: "无数据",
    libraryItem: itemFromWire({}, { id: "a2" }),
  };
  assert.equal(exploreHasPopularityEvidence([withStats]), true);
  assert.equal(exploreHasPopularityEvidence([withoutStats]), false);
  // 混在一起时只要有一条有数据就算就绪（呈现层据此标 ready="true"）。
  assert.equal(exploreHasPopularityEvidence([withoutStats, withStats]), true);
});

// ── ④ 边界：只放行有限非负数 ────────────────────────────────────────────────

test("非数字 / 负数 / 空信封一律不放行", () => {
  for (const extra of [
    { plays: "999" },
    { plays: -5 },
    { plays: Number.NaN },
    { plays: Number.POSITIVE_INFINITY },
    { stats: {} },
    { stats: { plays: null } },
    { stats: [{ plays: 3 }] },
    { plays: { value: 3 } },
  ]) {
    const item = itemFromWire(extra);
    assert.equal(
      Object.prototype.hasOwnProperty.call(item.meta, POPULARITY_META_KEY),
      false,
      `${JSON.stringify(extra)} 不该被当成热度放行`,
    );
    assert.equal(explorePopularity(item).known, false);
  }
});

test("扫描面有界：不从任意深度捞同名数字（一条 provenance 就能改排序）", () => {
  assert.equal(
    popularityMetricsFromWire({ a: { b: { c: { plays: 999 } } } }),
    null,
  );
  // 本层、meta 本层、以及这两层下各一层信封 —— 就这些。
  assert.deepEqual(popularityMetricsFromWire({ plays: 1 }), { plays: 1 });
  assert.deepEqual(popularityMetricsFromWire({ meta: { plays: 2 } }), {
    plays: 2,
  });
  assert.deepEqual(popularityMetricsFromWire({ stats: { plays: 3 } }), {
    plays: 3,
  });
  assert.deepEqual(
    popularityMetricsFromWire({ meta: { popularity: { plays: 4 } } }),
    { plays: 4 },
  );
  assert.equal(popularityMetricsFromWire(null), null);
  assert.equal(popularityMetricsFromWire([{ plays: 5 }]), null);
});

test("别名优先级确定：同时出现时取名单里靠前的那个", () => {
  assert.deepEqual(
    popularityMetricsFromWire({ plays: 10, play_count: 99 }),
    { plays: 10 },
  );
  // 顶层优先于信封：同名冲突时的取值必须确定，否则 SSR 与 hydration 排不出同一序。
  assert.deepEqual(
    popularityMetricsFromWire({ plays: 10, stats: { plays: 99 } }),
    { plays: 10 },
  );
});

// ── ⑤ 放行之后的排序仍然无时钟 ──────────────────────────────────────────────

test("放行后的真实数据排序仍按热度、且不看创建时间", () => {
  const entries = [
    // 服务端按创建时间倒排递过来：最新的在最前，一次都没被玩过。
    {
      id: "newest",
      title: "刚生成的",
      libraryItem: itemFromWire(
        { plays: 0, likes: 0, created_at: "2026-07-28T10:00:00Z" },
        { id: "newest" },
      ),
    },
    {
      id: "old-hit",
      title: "被玩烂的",
      libraryItem: itemFromWire(
        {
          ugc_stats: { plays: 5000, likes: 300, remixes: 40 },
          created_at: "2026-01-01T00:00:00Z",
        },
        { id: "old-hit" },
      ),
    },
  ];
  assert.deepEqual(
    sortByExplorePopularity(entries).map((entry) => entry.id),
    ["old-hit", "newest"],
  );
  // 连跑两次同序（排序里没有时钟，也没有半衰期）。
  assert.deepEqual(
    sortByExplorePopularity(entries).map((entry) => entry.id),
    sortByExplorePopularity(entries).map((entry) => entry.id),
  );
});

test("热度不参与完整性判定：缺热度的投影照样可预览可编辑", () => {
  const projection = normalizeArtifactProjection(wireRow({}));
  assert.equal(projection.popularity, null);
  assert.equal(projection.integrity.ok, true, projection.integrity.reason);
  // 有热度与没热度，完整性判定必须逐字相同：热度读不到只影响排序，不该让一个
  // artifact 变成不可预览/不可编辑。
  assert.deepEqual(
    normalizeArtifactProjection(wireRow({ plays: 12 })).integrity,
    projection.integrity,
  );
  const item = artifactProjectionToLibraryItem(projection);
  // 白名单里原有的键一个都没被挤掉。
  assert.equal(item.meta.artifact_type, "game");
  assert.equal(item.meta.editor_capability, "game-editor");
  assert.equal(item.meta.source_format, "oceanleo.game-bundle.v1");
  assert.ok(item.meta.access);
});
