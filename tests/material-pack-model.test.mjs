// 探索页素材包三层模型（`tasks/W5-pack-model.md`）的契约。
// 守四件事：
//   ① **一个素材包 = 一个 app**：包里每一张卡的 appId 都等于包的 appId；
//   ② **G2 包内不重复**：同一件素材在同一个包里只出一张卡——哪怕数据层给了两条；
//   ③ **跨包重复是允许的**：一件绑 4 个 app 的素材在 4 个包里各出一张，
//      artifactKey 相同、包内键不同。两件事必须分得开，这正是 G2 要证的那条；
//   ④ 三层齐全：分类 → 包 → 包内分区，分区永不为空，且按阶梯降级。

import assert from "node:assert/strict";
import test from "node:test";

import {
  MATERIAL_PACK_ORIGIN_SECTION_ID,
  MATERIAL_PACK_SHARED_SECTION_ID,
  MATERIAL_PACK_SINGLE_SECTION_ID,
  materialPackCards,
  materialPackView,
  materialPacksOfArtifact,
} from "../src/shell/material-pack-model.ts";
import { mergeMaterialEntries } from "../src/shell/material-library-dedupe.ts";
import {
  MATERIAL_SCENE_ALL_ID,
  MATERIAL_SCENE_OTHER_ID,
  registerSiteAppDirectory,
  resetSiteAppDirectories,
} from "../src/shell/material-scene-axis.ts";

/** image 站真实目录的一段（`/root/projects/image/lib/app-catalog.ts`）。 */
const IMAGE_APPS = [
  { id: "poster", name: "海报生成", scenes: ["营销物料"] },
  { id: "banner", name: "活动 Banner", scenes: ["营销物料", "电商带货"] },
  { id: "inpaint", name: "局部重绘", scenes: ["设计素材", "电商带货"] },
  { id: "expand", name: "扩图", scenes: ["设计素材", "电商带货"] },
  { id: "orphan-app", name: "没素材的 app", scenes: ["营销物料"] },
];

/** 官方模板目录行：不是 durable，artifact 身份与 app 归属都只在 meta 里。 */
function templateEntry({
  catalogId,
  artifactId,
  appId,
  siteKey = "image",
  title = "素材",
  artifactType = "composite_image",
}) {
  const key = `template-material:${catalogId}`;
  return {
    id: key,
    title,
    libraryItem: {
      key,
      id: key,
      meta: {
        template_material_id: catalogId,
        template_material_site_key: siteKey,
        template_material_app_id: appId,
        template_material_artifact_id: artifactId,
        template_material_artifact_type: artifactType,
      },
    },
  };
}

function durableEntry({
  artifactId,
  originAppId,
  siteKey = "image",
  bindings = [],
  artifactType = "single_file_image",
  title = "素材",
}) {
  const key = `artifact:${artifactId}:r1`;
  return {
    id: key,
    title,
    libraryItem: {
      key,
      id: artifactId,
      artifactId,
      revisionId: "r1",
      artifactType,
      meta: {},
      artifact: {
        artifactId,
        revisionId: "r1",
        artifactType,
        owner: { originSiteKey: siteKey, originAppId, visibility: "public" },
        bindings,
      },
    },
  };
}

function imageDirectory() {
  resetSiteAppDirectories();
  return registerSiteAppDirectory("image", IMAGE_APPS);
}

function viewOf(entries, overrides = {}) {
  return materialPackView({
    entries,
    siteKey: "image",
    directory: imageDirectory(),
    scene: null,
    ...overrides,
  });
}

test("一个素材包 = 一个 app：包里每张卡的 appId 都是包的 appId", () => {
  const view = viewOf(
    mergeMaterialEntries(
      [
        [
          templateEntry({
            catalogId: "image-poster-1",
            artifactId: "a1",
            appId: "poster",
          }),
          templateEntry({
            catalogId: "reuse-image-banner-p4",
            artifactId: "a1",
            appId: "banner",
          }),
          templateEntry({
            catalogId: "image-banner-1",
            artifactId: "a2",
            appId: "banner",
          }),
        ],
      ],
      { siteKey: "image" },
    ),
  );
  assert.deepEqual(
    view.packs.map((pack) => pack.appId),
    ["poster", "banner"],
  );
  for (const pack of view.packs) {
    for (const card of materialPackCards(pack)) {
      assert.equal(card.appId, pack.appId);
      assert.equal(card.appName, pack.appName);
    }
  }
  // 目录里有、但名下一件素材都没有的 app 不出包。
  assert.equal(
    view.packs.some((pack) => pack.appId === "orphan-app"),
    false,
  );
});

test("G2 ①：同一件素材在同一个包内只出一张卡（数据层给两条也一样）", () => {
  // 同一个 artifact 在同一个 app 下有两行目录记录——归并前是两条 entry。
  const entries = mergeMaterialEntries(
    [
      [
        templateEntry({
          catalogId: "image-poster-1",
          artifactId: "a1",
          appId: "poster",
        }),
        templateEntry({
          catalogId: "image-poster-1-dup",
          artifactId: "a1",
          appId: "poster",
        }),
      ],
    ],
    { siteKey: "image" },
  );
  const view = viewOf(entries);
  const poster = view.packs.find((pack) => pack.appId === "poster");
  assert.equal(poster.total, 1);
  assert.equal(materialPackCards(poster).length, 1);
  // 归并没跑到（深链、站点自备条目）也不许在包内出两张：模型自己再去一次重。
  const unmerged = viewOf([
    templateEntry({
      catalogId: "image-poster-1",
      artifactId: "a1",
      appId: "poster",
    }),
    templateEntry({
      catalogId: "image-poster-1-dup",
      artifactId: "a1",
      appId: "poster",
    }),
  ]);
  assert.equal(
    unmerged.packs.find((pack) => pack.appId === "poster").total,
    1,
  );
});

test("G2 ②：跨包重复是允许的——一件素材绑 4 个 app 就进 4 个包", () => {
  // image 站真实形状：`image-avatar-removebg-1` 这一件同时绑 4 个 app。
  const entries = mergeMaterialEntries(
    [
      [
        templateEntry({
          catalogId: "image-poster-1",
          artifactId: "a1",
          appId: "poster",
        }),
        templateEntry({
          catalogId: "reuse-image-banner-p4",
          artifactId: "a1",
          appId: "banner",
        }),
        templateEntry({
          catalogId: "reuse-image-inpaint-p5",
          artifactId: "a1",
          appId: "inpaint",
        }),
        templateEntry({
          catalogId: "reuse-image-expand-p6",
          artifactId: "a1",
          appId: "expand",
        }),
      ],
    ],
    { siteKey: "image" },
  );
  const view = viewOf(entries);
  assert.equal(view.artifactTotal, 1);
  assert.equal(view.cardTotal, 4);
  assert.equal(view.crossPackArtifacts, 1);
  assert.equal(view.packs.length, 4);

  const cards = view.packs.flatMap(materialPackCards);
  // 同一件素材：artifactKey 全同。
  assert.equal(new Set(cards.map((card) => card.artifactKey)).size, 1);
  // 不同的格：包内键全不同，所以没有任何一个包里会并排出现两张。
  assert.equal(new Set(cards.map((card) => card.key)).size, 4);
  for (const card of cards) assert.equal(card.packCount, 4);
  assert.deepEqual(
    materialPacksOfArtifact(view, cards[0].artifactKey).map(
      (pack) => pack.appId,
    ),
    ["poster", "banner", "inpaint", "expand"],
  );
});

test("包内分区阶梯：origin 优先，退化到形态，再退化到单区", () => {
  const directory = imageDirectory();
  const packOf = (entries, appId) =>
    materialPackView({
      entries,
      siteKey: "image",
      directory,
      scene: null,
    }).packs.find((pack) => pack.appId === appId);

  // ① 原生 + 共享都非空 → 按归属分两区。
  const mixed = packOf(
    mergeMaterialEntries(
      [
        [
          templateEntry({
            catalogId: "image-poster-1",
            artifactId: "a1",
            appId: "poster",
          }),
          templateEntry({
            catalogId: "reuse-image-poster-p4",
            artifactId: "a2",
            appId: "poster",
          }),
        ],
      ],
      { siteKey: "image" },
    ),
    "poster",
  );
  assert.deepEqual(
    mixed.sections.map((section) => section.id),
    [MATERIAL_PACK_ORIGIN_SECTION_ID, MATERIAL_PACK_SHARED_SECTION_ID],
  );
  assert.deepEqual(
    mixed.sections.map((section) => section.basis),
    ["origin", "origin"],
  );
  assert.equal(mixed.sections[0].cards[0].native, true);
  assert.equal(mixed.sections[1].cards[0].native, false);

  // ② 全是共享、但形态混杂 → 按 artifactType 分区。
  const byType = packOf(
    mergeMaterialEntries(
      [
        [
          templateEntry({
            catalogId: "reuse-image-poster-p4",
            artifactId: "a1",
            appId: "poster",
            artifactType: "composite_image",
          }),
          templateEntry({
            catalogId: "reuse-image-poster-p5",
            artifactId: "a2",
            appId: "poster",
            artifactType: "vector_image",
          }),
        ],
      ],
      { siteKey: "image" },
    ),
    "poster",
  );
  assert.deepEqual(
    byType.sections.map((section) => section.id),
    ["type:composite_image", "type:vector_image"],
  );
  assert.deepEqual(
    byType.sections.map((section) => section.label),
    ["复合图片", "矢量图片"],
  );

  // ③ 单一形态、且一边为空 → 单区，呈现层据此不画分区 chips。
  const single = packOf(
    mergeMaterialEntries(
      [
        [
          templateEntry({
            catalogId: "image-poster-1",
            artifactId: "a1",
            appId: "poster",
          }),
          templateEntry({
            catalogId: "image-poster-2",
            artifactId: "a2",
            appId: "poster",
          }),
        ],
      ],
      { siteKey: "image" },
    ),
    "poster",
  );
  assert.deepEqual(
    single.sections.map((section) => section.id),
    [MATERIAL_PACK_SINGLE_SECTION_ID],
  );
  assert.equal(single.sections[0].basis, "single");
  // 分区永不为空数组，且卡片一张都不会在分区之间丢掉。
  for (const pack of [mixed, byType, single]) {
    assert.ok(pack.sections.length >= 1);
    assert.equal(materialPackCards(pack).length, pack.total);
  }
});

test("durable 条目的原生判据走 owner.originAppId，不看目录键", () => {
  const view = viewOf(
    mergeMaterialEntries(
      [
        [
          durableEntry({
            artifactId: "d1",
            originAppId: "poster",
            bindings: [
              { contextId: "olctx:v1:image:app:banner", rank: 2, role: "ref" },
            ],
          }),
        ],
      ],
      { siteKey: "image" },
    ),
  );
  const poster = view.packs.find((pack) => pack.appId === "poster");
  const banner = view.packs.find((pack) => pack.appId === "banner");
  assert.equal(materialPackCards(poster)[0].native, true);
  assert.equal(materialPackCards(banner)[0].native, false);
});

test("分类 → 包：一个 app 有两个场景词就在两个分类下各出现一次", () => {
  const view = viewOf(
    mergeMaterialEntries(
      [
        [
          templateEntry({
            catalogId: "image-banner-1",
            artifactId: "a1",
            appId: "banner",
          }),
          templateEntry({
            catalogId: "image-poster-1",
            artifactId: "a2",
            appId: "poster",
          }),
        ],
      ],
      { siteKey: "image" },
    ),
  );
  const byId = new Map(
    view.categories.map((category) => [category.id, category]),
  );
  assert.equal(byId.get(MATERIAL_SCENE_ALL_ID).packCount, 2);
  assert.deepEqual(
    byId.get("营销物料").packs.map((pack) => pack.appId),
    ["poster", "banner"],
  );
  assert.deepEqual(
    byId.get("电商带货").packs.map((pack) => pack.appId),
    ["banner"],
  );
  // 同一个包对象出现在两个分类下，不是两份拷贝。
  assert.equal(
    byId.get("营销物料").packs.find((pack) => pack.appId === "banner"),
    byId.get("电商带货").packs[0],
  );
  // 选中分类时只留该分类的包。
  assert.deepEqual(
    viewOf(
      mergeMaterialEntries(
        [
          [
            templateEntry({
              catalogId: "image-banner-1",
              artifactId: "a1",
              appId: "banner",
            }),
            templateEntry({
              catalogId: "image-poster-1",
              artifactId: "a2",
              appId: "poster",
            }),
          ],
        ],
        { siteKey: "image" },
      ),
      { scene: "电商带货" },
    ).packs.map((pack) => pack.appId),
    ["banner"],
  );
});

test("归属解析不出来的素材落进兜底包，不许消失", () => {
  const view = viewOf([
    {
      id: "loose-1",
      title: "无归属素材",
      libraryItem: { key: "loose-1", id: "loose-1", meta: {} },
    },
  ]);
  assert.equal(view.artifactTotal, 1);
  assert.equal(view.cardTotal, 1);
  const fallback = view.packs.find((pack) => pack.appId === "");
  assert.equal(fallback.appName, "其他素材");
  assert.deepEqual(fallback.scenes, []);
  // 没有场景词 → 落「其它」分类。
  const other = view.categories.find(
    (category) => category.id === MATERIAL_SCENE_OTHER_ID,
  );
  assert.equal(other.packCount, 1);
});

test("?app= 锚点只留那一个包", () => {
  const entries = mergeMaterialEntries(
    [
      [
        templateEntry({
          catalogId: "image-poster-1",
          artifactId: "a1",
          appId: "poster",
        }),
        templateEntry({
          catalogId: "image-banner-1",
          artifactId: "a2",
          appId: "banner",
        }),
      ],
    ],
    { siteKey: "image" },
  );
  const view = viewOf(entries, { anchoredAppId: "banner" });
  assert.deepEqual(
    view.packs.map((pack) => pack.appId),
    ["banner"],
  );
  // 「全部」分类仍然列全，锚点只影响当前渲染的那一组。
  assert.equal(view.categories[0].packCount, 2);
});
