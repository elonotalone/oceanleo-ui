// 「这张卡坐在哪个素材包里」→ 详情那一颗编辑按钮的落点（`material-pack-landing.ts`）。
// 守四件事：
//   ① **同一件素材在不同素材包里被点开，落点不同** —— 这是操作员选这条路的全部理由
//      （上下文自洽），也是这条链子过去空转时唯一看不出来的差别；
//   ② 说不清用户点的是哪个包时**回空串**，交回兜底顺序，不猜；
//   ③ 拿不到包视图时回 `undefined`，货架不传这个 prop，详情行为与今天逐字相同；
//   ④ 兜底包（`appId: ""`，「其他素材」）不是落点。

import assert from "node:assert/strict";
import test from "node:test";

import {
  materialPackAppIdResolver,
  materialPackMembership,
} from "../src/shell/material-pack-landing.ts";
import { materialPackView } from "../src/shell/material-pack-model.ts";
import { mergeMaterialEntries } from "../src/shell/material-library-dedupe.ts";
import {
  materialSceneView,
  registerSiteAppDirectory,
  resetSiteAppDirectories,
} from "../src/shell/material-scene-axis.ts";

/** image 站真实目录的一段（`/root/projects/image/lib/app-catalog.ts`）。 */
const IMAGE_APPS = [
  { id: "poster", name: "海报生成", scenes: ["营销物料"] },
  { id: "banner", name: "活动 Banner", scenes: ["营销物料", "电商带货"] },
  { id: "inpaint", name: "局部重绘", scenes: ["设计素材", "电商带货"] },
];

function templateEntry({ catalogId, artifactId, appId, siteKey = "image" }) {
  const key = `template-material:${catalogId}`;
  return {
    id: key,
    title: "素材",
    libraryItem: {
      key,
      id: key,
      meta: {
        template_material_id: catalogId,
        template_material_site_key: siteKey,
        template_material_app_id: appId,
        template_material_artifact_id: artifactId,
        template_material_artifact_type: "composite_image",
      },
    },
  };
}

function imageDirectory() {
  resetSiteAppDirectories();
  return registerSiteAppDirectory("image", IMAGE_APPS);
}

/**
 * 货架此刻的两份视图：分区轴（真正渲染的卡）与包视图（三层）。两者同源同筛选，
 * 产品代码里也是这样并排算出来的（`material-library-view.tsx:555-569`）。
 */
function shelf(entries, { scene = null, anchoredAppId = "" } = {}) {
  const directory = imageDirectory();
  const input = { entries, siteKey: "image", directory, scene, anchoredAppId };
  return {
    packView: materialPackView(input),
    sceneView: materialSceneView(input),
  };
}

/** a1 同时绑 poster 与 inpaint；a2 只在 banner 名下。 */
function crossPackEntries() {
  return mergeMaterialEntries(
    [
      [
        templateEntry({
          catalogId: "image-poster-1",
          artifactId: "a1",
          appId: "poster",
        }),
        templateEntry({
          catalogId: "reuse-image-inpaint-p5",
          artifactId: "a1",
          appId: "inpaint",
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
}

/** 这件素材在货架上的那张卡（分区轴已按 artifact 去重，一件一张）。 */
function cardEntry(sceneView, artifactId) {
  const card = sceneView.cards.find(
    (candidate) => candidate.artifactKey === `artifact:${artifactId}`,
  );
  return card?.entry;
}

test("同一件素材在两个不同素材包里被点开，落点是两个不同的 app", () => {
  const entries = crossPackEntries();

  // 用户此刻站在「海报生成」这个包里（`?app=poster`）。
  const inPoster = shelf(entries, { anchoredAppId: "poster" });
  const fromPoster = materialPackAppIdResolver(
    inPoster.packView,
    inPoster.sceneView,
  );
  assert.equal(fromPoster(cardEntry(inPoster.sceneView, "a1")), "poster");

  // 同一件素材 a1，换成站在「局部重绘」这个包里。
  const inInpaint = shelf(entries, { anchoredAppId: "inpaint" });
  const fromInpaint = materialPackAppIdResolver(
    inInpaint.packView,
    inInpaint.sceneView,
  );
  assert.equal(fromInpaint(cardEntry(inInpaint.sceneView, "a1")), "inpaint");

  // 这就是整条链子要证的那一句：素材没变，包变了，落点跟着变。
  assert.notEqual(
    fromPoster(cardEntry(inPoster.sceneView, "a1")),
    fromInpaint(cardEntry(inInpaint.sceneView, "a1")),
  );
});

test("按分类进来时，落点是这件素材在该分类下所属的那个包", () => {
  const entries = crossPackEntries();
  // 「设计素材」下只有 inpaint 一个 app，a1 在这里只能属于 inpaint 那个包。
  const design = shelf(entries, { scene: "设计素材" });
  const resolve = materialPackAppIdResolver(design.packView, design.sceneView);
  assert.equal(resolve(cardEntry(design.sceneView, "a1")), "inpaint");

  // 「营销物料」下 a1 归 poster —— 同一件素材，另一个分类，另一个包。
  const marketing = shelf(entries, { scene: "营销物料" });
  const resolveMarketing = materialPackAppIdResolver(
    marketing.packView,
    marketing.sceneView,
  );
  assert.equal(resolveMarketing(cardEntry(marketing.sceneView, "a1")), "poster");
});

test("一件素材只进了一个包时，没有第二种可能，直接用那个包", () => {
  const entries = crossPackEntries();
  const all = shelf(entries);
  // 连分区轴都不给（渲染侧还没算出来），a2 仍然判得出：它只在 banner 一个包里。
  const resolve = materialPackAppIdResolver(all.packView, null);
  assert.equal(resolve(cardEntry(all.sceneView, "a2")), "banner");
});

test("进了多个包又说不清用户点的是哪一个时，回空串走兜底，不猜", () => {
  const entries = crossPackEntries();
  const all = shelf(entries);
  // a1 在 poster 与 inpaint 两个包里，而分区轴缺席 → 判不出，绝不随手挑一个。
  const resolve = materialPackAppIdResolver(all.packView, null);
  assert.deepEqual(
    materialPackMembership(all.packView).get("artifact:a1"),
    ["poster", "inpaint"],
  );
  assert.equal(resolve(cardEntry(all.sceneView, "a1")), "");
});

test("没有包视图就回 undefined —— 货架不传这个 prop，详情行为与今天逐字相同", () => {
  assert.equal(materialPackAppIdResolver(null, null), undefined);
  // 包视图存在但一个包都没有（本站还没素材）同样不算包上下文。
  const empty = shelf([]);
  assert.equal(materialPackAppIdResolver(empty.packView, empty.sceneView), undefined);
});

test("兜底包（其他素材）不是落点：宁可回空串，也不把用户送去一个没有 app 的工作台", () => {
  const loose = {
    id: "loose-1",
    title: "无归属素材",
    libraryItem: { key: "loose-1", id: "loose-1", meta: {} },
  };
  const view = shelf([loose]);
  // 兜底包确实存在（素材不许消失），但它进不了 membership。
  assert.equal(
    view.packView.packs.some((pack) => pack.appId === ""),
    true,
  );
  assert.equal(materialPackMembership(view.packView).size, 0);
  assert.equal(materialPackAppIdResolver(view.packView, view.sceneView), undefined);
});

test("包视图里没有这件素材时回空串（深链带进来的素材不在当前分类下）", () => {
  const entries = crossPackEntries();
  const design = shelf(entries, { scene: "设计素材" });
  const resolve = materialPackAppIdResolver(design.packView, design.sceneView);
  // a2 归 banner，banner 不在「设计素材」分类下 → 当前没有它的包。
  const stranger = templateEntry({
    catalogId: "image-banner-1",
    artifactId: "a2",
    appId: "banner",
  });
  assert.equal(resolve(stranger), "");
  assert.equal(resolve(undefined), "");
});
