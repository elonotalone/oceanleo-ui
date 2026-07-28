// 素材库作用域（合同 2026-07-27 §0.6 / §3.2，2026-07-28 D1 / D3 / D5）的契约。
// 守五件事：
//   ① `MaterialLibraryLevel` 只剩 primary｜site 两层——「更多素材」整层下线（D1），
//      且既有调用点的缓存 key 与请求参数**逐字不变**；
//   ② 发给 `/v1/library/search` 的新参数名逐字是 §3.2 锁定的
//      `artifactTypes` / `originSiteKey` / `originAppId`；
//   ③ 缺 `originSiteKey` 时 **fail-closed**：不发请求、更不退化成全平台搜索；
//   ④ 去重是 `(artifact, app)` 语义：一个 artifact 一张卡，多归属可枚举（D3）；
//   ⑤ 首帧 `settled` 可被呈现层区分（D5）。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MATERIAL_LIBRARY_LEVELS,
  MATERIAL_SCOPE_PARAM_NAMES,
  MATERIAL_SCOPE_UNENFORCEABLE_CODE,
  applyMaterialScope,
  libraryItemAppAttributions,
  libraryItemMatchesOriginScope,
  materialLibrarySearchParams,
  materialLibrarySearchQuery,
  materialScopeTypes,
  materialScopeViolation,
  materialTypesFromCsv,
} from "../src/shell/material-library-scope.ts";
import {
  MATERIAL_TAXONOMY_LABEL,
  materialLibraryRequestKey,
  queryMaterialLibrary,
} from "../src/shell/material-library-controller.ts";
import {
  materialAppDedupeKey,
  materialArtifactDedupeKey,
  materialEntryAppAttributions,
  materialEntryAppForScope,
  materialEntryPrimaryAppId,
  mergeMaterialEntries,
} from "../src/shell/material-library-dedupe.ts";
import { materialShelfSettleNext } from "../src/shell/material-library-effects.ts";

const IMAGE_CONTEXT = {
  contextId: "olctx:v1:image:app:poster",
  siteKey: "image",
  appId: "poster",
};

function durableItem({
  id = "artifact-1",
  artifactType = "single_file_image",
  originSiteKey = "image",
  originAppId = "poster",
  bindings = [],
  revisionId = "r1",
  meta = {},
} = {}) {
  return {
    key: `artifact:${id}:${revisionId}`,
    id,
    artifactId: id,
    revisionId,
    artifactType,
    meta,
    artifact: {
      artifactId: id,
      revisionId,
      artifactType,
      owner: { originSiteKey, originAppId, visibility: "public" },
      bindings,
    },
  };
}

/** 官方模板目录行：不是 durable，artifact 身份只在 meta 里。 */
function templateItem({ catalogId, artifactId, appId, siteKey = "image" }) {
  return {
    key: `template-material:${catalogId}`,
    id: `template-material:${catalogId}`,
    meta: {
      template_material_id: catalogId,
      template_material_site_key: siteKey,
      template_material_app_id: appId,
      template_material_artifact_id: artifactId,
    },
  };
}

const entryOf = (libraryItem) => ({ id: libraryItem.id, libraryItem });

test("「更多素材」整层下线，既有两层的缓存 key 逐字不变", () => {
  assert.deepEqual([...MATERIAL_LIBRARY_LEVELS], ["primary", "site"]);

  const legacy = (level, context) => ({
    level,
    context,
    query: "",
    taxonomy: "",
  });
  // 工作台/库今天传的就是 primary 层，key 的 JSON 形状必须原样保留。
  assert.equal(
    materialLibraryRequestKey(legacy("primary", IMAGE_CONTEXT)),
    JSON.stringify({
      level: "primary",
      context: "olctx:v1:image:app:poster::image::poster::",
      query: "",
      taxonomy: "",
      cursor: "",
    }),
  );
  // 本站层按 siteKey 分桶，换站不会撞 key。
  const siteKey = materialLibraryRequestKey(legacy("site", IMAGE_CONTEXT));
  assert.match(siteKey, /"context":"site:image"/);
  assert.notEqual(
    siteKey,
    materialLibraryRequestKey(
      legacy("site", { ...IMAGE_CONTEXT, siteKey: "word" }),
    ),
  );
  // 多选才进 key，单选沿用老 key（不作废现有缓存）。
  assert.doesNotMatch(
    materialLibraryRequestKey({
      ...legacy("site", IMAGE_CONTEXT),
      types: ["single_file_image"],
    }),
    /"types"/,
  );
  assert.match(
    materialLibraryRequestKey({
      ...legacy("site", IMAGE_CONTEXT),
      types: ["single_file_image", "model_3d"],
    }),
    /"types":"single_file_image,model_3d"/,
  );
});

test("数据层不再有任何「更多素材」/全平台快照的残留（D1）", () => {
  const read = (path) =>
    readFileSync(new URL(path, import.meta.url), "utf8");
  const controller = read("../src/shell/material-library-controller.ts");
  const scope = read("../src/shell/material-library-scope.ts");
  // 全平台快照那条路径连同它的 import 一并清掉。
  assert.doesNotMatch(controller, /listEditableShelfArtifacts/);
  // `level === "more"` 这个分支不复存在。
  assert.doesNotMatch(controller, /=== "more"/);
  assert.doesNotMatch(scope, /"more"/);
  // 第 14 类 game 的标签由 W9 声明、本 owner 落地。
  assert.equal(MATERIAL_TAXONOMY_LABEL.game, "游戏");
});

test("后端参数名逐字锁定在合同 §3.2", () => {
  assert.deepEqual({ ...MATERIAL_SCOPE_PARAM_NAMES }, {
    types: "artifactTypes",
    siteKey: "originSiteKey",
    appId: "originAppId",
  });

  const site = materialLibrarySearchParams({
    level: "site",
    query: " 海报 ",
    role: "template",
    siteKey: "image",
    appId: "poster",
    types: ["single_file_image", "model_3d"],
  });
  assert.equal(site.originSiteKey, "image");
  assert.equal(site.originAppId, "");
  assert.equal(site.artifactTypes, "single_file_image,model_3d");
  // 两个类型无法用老的单值参数表达，就不发它，避免后端二次收窄。
  assert.equal(site.artifactType, "");
  assert.equal(
    materialLibrarySearchQuery(site).toString(),
    new URLSearchParams({
      q: "海报",
      artifactTypes: "single_file_image,model_3d",
      originSiteKey: "image",
      role: "template",
    }).toString(),
  );

  const app = materialLibrarySearchParams({
    level: "primary",
    siteKey: "image",
    appId: "poster",
    types: ["single_file_image"],
  });
  assert.equal(app.originAppId, "poster");
  assert.equal(app.originSiteKey, "image");
  // 单选时两个参数一起发：老后端照样精确过滤，新后端结论一致。
  assert.equal(app.artifactType, "single_file_image");
  assert.equal(app.artifactTypes, "single_file_image");
});

test("没用多选 chips 的老站，类型参数退回单值，但作用域照发", () => {
  const legacy = materialLibrarySearchParams({
    level: "site",
    query: "poster",
    role: "template",
    siteKey: "image",
    appId: "poster",
    types: ["single_file_image"],
    legacyTaxonomyOnly: true,
  });
  assert.equal(legacy.artifactType, "single_file_image");
  assert.equal(legacy.artifactTypes, "");
  // D1 之后没有无作用域的那一层了：站点身份任何时候都要发出去。
  assert.equal(legacy.originSiteKey, "image");
  assert.equal(legacy.originAppId, "");
  assert.equal(
    materialLibrarySearchQuery(legacy).toString(),
    new URLSearchParams({
      q: "poster",
      artifactType: "single_file_image",
      originSiteKey: "image",
      role: "template",
    }).toString(),
  );
});

test("缺 originSiteKey 一律 fail-closed，不退化成全平台搜索", async () => {
  assert.equal(materialScopeViolation({ level: "site", siteKey: "image" }), "");
  assert.equal(
    materialScopeViolation({
      level: "primary",
      siteKey: "image",
      appId: "poster",
    }),
    "",
  );
  for (const scope of [
    { level: "site" },
    { level: "site", siteKey: "   " },
    { level: "primary", appId: "poster" },
  ]) {
    assert.match(materialScopeViolation(scope), /originSiteKey/);
  }
  // primary 层还额外要求 app 身份。
  assert.match(
    materialScopeViolation({ level: "primary", siteKey: "image" }),
    /originAppId/,
  );

  // 请求压根不该发出去：把 fetch 换成会抛的桩，跑通就说明没走网络。
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("fail-closed 之后不该再发请求");
  };
  try {
    const blocked = await queryMaterialLibrary({
      level: "site",
      context: { contextId: "", siteKey: "", appId: "" },
      query: "",
      taxonomy: "",
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.retryable, false);
    assert.match(blocked.scopeViolation, /originSiteKey/);
    assert.equal(MATERIAL_SCOPE_UNENFORCEABLE_CODE, "scope-unenforceable");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("多选 chips 与单值 curatedType 的取值优先级", () => {
  assert.deepEqual(
    materialScopeTypes({ types: ["model_3d", "model_3d"], taxonomy: "chart" }),
    ["model_3d"],
  );
  assert.deepEqual(materialScopeTypes({ types: [], taxonomy: "chart" }), [
    "chart",
  ]);
  assert.deepEqual(materialScopeTypes({ taxonomy: "" }), []);
  assert.deepEqual(materialTypesFromCsv("chart, model_3d ,nope"), [
    "chart",
    "model_3d",
  ]);
});

test("站级归属既认 owner.originSiteKey 也认 catalog context 绑定", () => {
  assert.equal(
    libraryItemMatchesOriginScope(durableItem(), { siteKey: "image" }),
    true,
  );
  assert.equal(
    libraryItemMatchesOriginScope(durableItem(), { siteKey: "word" }),
    false,
  );
  // 从 asset 站搬来的素材 owner 仍是 asset，靠绑定进本站 app context 归属本站。
  const relocated = durableItem({
    originSiteKey: "asset",
    originAppId: null,
    bindings: [{ contextId: "olctx:v1:image:app:poster", role: "primary" }],
  });
  assert.equal(
    libraryItemMatchesOriginScope(relocated, { siteKey: "image" }),
    true,
  );
  assert.equal(
    libraryItemMatchesOriginScope(relocated, {
      siteKey: "image",
      appId: "poster",
    }),
    true,
  );
  assert.equal(
    libraryItemMatchesOriginScope(relocated, {
      siteKey: "image",
      appId: "banner",
    }),
    false,
  );
});

test("后端不认新参数时浏览器侧收窄，收窄成空就是空（D1）", () => {
  const mine = durableItem({ id: "mine", originSiteKey: "image" });
  const theirs = durableItem({ id: "theirs", originSiteKey: "word" });

  const narrowed = applyMaterialScope([mine, theirs], {
    siteKey: "image",
    types: [],
  });
  assert.deepEqual(narrowed.items.map((item) => item.id), ["mine"]);
  assert.equal(narrowed.degraded, true);

  // 旧行为是「收窄成空就退回整页」，会把别站素材摆到本站货架上。已删除。
  const nothingMatches = applyMaterialScope([theirs], {
    siteKey: "image",
    types: [],
  });
  assert.deepEqual(nothingMatches.items, []);
  assert.equal(nothingMatches.degraded, true);
  assert.equal("showedUnscoped" in nothingMatches, false);

  // 后端确实应用了作用域时不报降级，也不重复过滤。
  const honored = applyMaterialScope([mine], { siteKey: "image", types: [] });
  assert.equal(honored.degraded, false);

  // 多选类型同理：老后端返回全类型，浏览器侧按 chips 收窄。
  const mixed = applyMaterialScope(
    [mine, durableItem({ id: "deck", artifactType: "deck" })],
    { types: ["single_file_image", "chart"] },
  );
  assert.deepEqual(mixed.items.map((item) => item.id), ["mine"]);
  assert.equal(mixed.degraded, true);
});

test("跨 app 素材：一个 artifact 一张卡，归属仍然可枚举（D3）", () => {
  // image 站的真实形态：同一个 artifact_id 被两个 app 的目录行各引一次。
  const removebg = entryOf(
    templateItem({
      catalogId: "avatar-removebg-1",
      artifactId: "art-portrait",
      appId: "avatar-removebg",
    }),
  );
  const inpaint = entryOf(
    templateItem({
      catalogId: "inpaint-3",
      artifactId: "art-portrait",
      appId: "inpaint",
    }),
  );
  const other = entryOf(
    templateItem({
      catalogId: "expand-2",
      artifactId: "art-expand",
      appId: "expand",
    }),
  );

  // 旧键（catalog key）会留下两条一模一样的卡；新键按 artifact 归并。
  assert.equal(
    materialArtifactDedupeKey(removebg),
    materialArtifactDedupeKey(inpaint),
  );
  assert.notEqual(
    materialAppDedupeKey(removebg, "avatar-removebg"),
    materialAppDedupeKey(inpaint, "inpaint"),
  );

  const merged = mergeMaterialEntries([[removebg, inpaint], [other]], {
    siteKey: "image",
  });
  assert.equal(merged.length, 2);
  assert.deepEqual(
    materialEntryAppAttributions(merged[0]).map((app) => app.appId),
    ["avatar-removebg", "inpaint"],
  );
  // 「全部」视图取主 app；选中某个场景分区时取该分区下的那个（D3.3）。
  assert.equal(materialEntryPrimaryAppId(merged[0]), "avatar-removebg");
  assert.equal(
    materialEntryAppForScope(merged[0], ["inpaint", "expand"])?.appId,
    "inpaint",
  );
  assert.equal(
    materialEntryAppForScope(merged[0], ["nowhere"])?.appId,
    "avatar-removebg",
  );

  // 同一 artifact 的两个 revision 同场时也是一份素材，一张卡。
  const twoRevisions = mergeMaterialEntries([
    [
      entryOf(durableItem({ id: "art-1", revisionId: "r1" })),
      entryOf(durableItem({ id: "art-1", revisionId: "r2" })),
    ],
  ]);
  assert.equal(twoRevisions.length, 1);
});

test("归属解析：owner、目录行、binding 三个来源合流并排序", () => {
  const relocated = durableItem({
    id: "art-2",
    originSiteKey: "asset",
    originAppId: "",
    bindings: [
      { contextId: "olctx:v1:image:app:banner", role: "primary", rank: 2 },
      { contextId: "olctx:v1:image:app:avatar", role: "reference", rank: 1 },
      { contextId: "olctx:v1:word:app:resume", role: "primary", rank: 0 },
    ],
  });
  // 传 siteKey 就只收该站的绑定；word 站那条不该进 image 站的货架。
  assert.deepEqual(
    libraryItemAppAttributions(relocated, "image").map((app) => app.appId),
    ["avatar", "banner"],
  );
  assert.deepEqual(
    libraryItemAppAttributions(relocated).map((app) => app.appId),
    ["resume", "avatar", "banner"],
  );
  // 铸造地是这份素材的老家，没有自己的 binding rank 时排在最前。
  const minted = durableItem({
    id: "art-3",
    originSiteKey: "image",
    originAppId: "poster",
    bindings: [
      { contextId: "olctx:v1:image:app:zzz", role: "primary", rank: 5 },
    ],
  });
  const mintedApps = libraryItemAppAttributions(minted, "image");
  assert.deepEqual(mintedApps.map((app) => app.appId), ["poster", "zzz"]);
  assert.equal(mintedApps[0].origin, true);
  assert.equal(mintedApps[0].role, "owner");
  // 一条都解析不出来时返回空数组，由呈现层兜底，而不是编一个 app 出来。
  assert.deepEqual(libraryItemAppAttributions(null), []);
  assert.deepEqual(
    libraryItemAppAttributions({ key: "k", id: "k", meta: {} }),
    [],
  );
});

test("首帧 settled 可被呈现层区分（D5）", () => {
  const first = { settled: false, scopeKey: "site:image" };
  // 结论到达前一直是未 settle：呈现层只画骨架，不许出「暂无」。
  assert.equal(first.settled, false);
  const settled = materialShelfSettleNext(first, {
    scopeKey: "site:image",
    kind: "resolved",
  });
  assert.equal(settled.settled, true);

  // 换 scope（换层/换类型/换站）回到未 settle。
  const switched = materialShelfSettleNext(settled, {
    scopeKey: "site:word",
    kind: "scope-changed",
  });
  assert.deepEqual(switched, { settled: false, scopeKey: "site:word" });

  // 背景刷新不会把 settled 打回去——骨架只在首帧出现。
  assert.equal(
    materialShelfSettleNext(settled, {
      scopeKey: "site:image",
      kind: "scope-changed",
    }).settled,
    true,
  );
  // 迟到的旧 scope 的结论不许把新 scope 点亮（防竞态）。
  assert.equal(
    materialShelfSettleNext(switched, {
      scopeKey: "site:image",
      kind: "resolved",
    }).settled,
    false,
  );
});

test("素材库文件全部守住 800 行硬顶", () => {
  for (const path of [
    "../src/shell/material-library-controller.ts",
    "../src/shell/material-library-scope.ts",
    "../src/shell/material-library-dedupe.ts",
    "../src/shell/material-library-view.tsx",
    "../src/shell/material-library-presentation.ts",
    "../src/shell/material-library-effects.ts",
    "../src/shell/material-library-template-source.ts",
    "../src/shell/ExplorePage.tsx",
  ]) {
    const lines = readFileSync(new URL(path, import.meta.url), "utf8").split(
      "\n",
    ).length;
    assert.ok(lines <= 800, `${path} 有 ${lines} 行，超过 800 行硬顶`);
  }
});
