// 素材库三段式作用域（合同 2026-07-27 §0.6 / §3.2）的契约。
// 守三件事：
//   ① `MaterialLibraryLevel` 是 primary｜site｜more 三层，且既有两层调用点
//      （工作台、库、material-catalog）的缓存 key 与请求参数**逐字不变**；
//   ② 发给 `/v1/library/search` 的新参数名逐字是 §3.2 锁定的
//      `artifactTypes` / `originSiteKey` / `originAppId`；
//   ③ 后端还没认这三个参数时会降级，既不空列表也不崩。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MATERIAL_LIBRARY_LEVELS,
  MATERIAL_SCOPE_PARAM_NAMES,
  applyMaterialScope,
  libraryItemMatchesOriginScope,
  materialLibrarySearchParams,
  materialLibrarySearchQuery,
  materialScopeTypes,
  materialTypesFromCsv,
} from "../src/shell/material-library-scope.ts";
import { materialLibraryRequestKey } from "../src/shell/material-library-controller.ts";

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
} = {}) {
  return {
    key: `artifact:${id}:r1`,
    id,
    artifactId: id,
    revisionId: "r1",
    artifactType,
    artifact: {
      artifactId: id,
      revisionId: "r1",
      artifactType,
      owner: { originSiteKey, originAppId, visibility: "public" },
      bindings,
    },
  };
}

test("三层分区就位，两层调用点的缓存 key 逐字不变", () => {
  assert.deepEqual([...MATERIAL_LIBRARY_LEVELS], ["primary", "site", "more"]);

  const legacy = (level, context) => ({
    level,
    context,
    query: "",
    taxonomy: "",
  });
  // 工作台/库今天传的就是这两层，key 的 JSON 形状必须原样保留。
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
  assert.equal(
    materialLibraryRequestKey(legacy("more", IMAGE_CONTEXT)),
    JSON.stringify({
      level: "more",
      context: "global",
      query: "",
      taxonomy: "",
      cursor: "",
    }),
  );
  // 本站层按 siteKey 分桶，不会和全平台层撞 key。
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
      ...legacy("more", IMAGE_CONTEXT),
      types: ["single_file_image"],
    }),
    /"types"/,
  );
  assert.match(
    materialLibraryRequestKey({
      ...legacy("more", IMAGE_CONTEXT),
      types: ["single_file_image", "model_3d"],
    }),
    /"types":"single_file_image,model_3d"/,
  );
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

test("没用多选 chips 的老站，请求参数与今天逐字一致", () => {
  const legacy = materialLibrarySearchParams({
    level: "more",
    query: "poster",
    role: "template",
    siteKey: "image",
    appId: "poster",
    types: ["single_file_image"],
    legacyTaxonomyOnly: true,
  });
  assert.equal(legacy.artifactType, "single_file_image");
  assert.equal(legacy.artifactTypes, "");
  assert.equal(legacy.originSiteKey, "");
  assert.equal(legacy.originAppId, "");
  assert.equal(
    materialLibrarySearchQuery(legacy).toString(),
    new URLSearchParams({
      q: "poster",
      artifactType: "single_file_image",
      role: "template",
    }).toString(),
  );
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

test("后端不认新参数时降级：先收窄，收窄成空就退回全局，绝不空列表", () => {
  const mine = durableItem({ id: "mine", originSiteKey: "image" });
  const theirs = durableItem({ id: "theirs", originSiteKey: "word" });

  const narrowed = applyMaterialScope([mine, theirs], {
    siteKey: "image",
    types: [],
  });
  assert.deepEqual(narrowed.items.map((item) => item.id), ["mine"]);
  assert.equal(narrowed.degraded, true);
  assert.equal(narrowed.showedUnscoped, false);

  const nothingMatches = applyMaterialScope([theirs], {
    siteKey: "image",
    types: [],
  });
  assert.deepEqual(nothingMatches.items.map((item) => item.id), ["theirs"]);
  assert.equal(nothingMatches.degraded, true);
  assert.equal(nothingMatches.showedUnscoped, true);

  // 后端确实应用了作用域时不报降级，也不重复过滤。
  const honored = applyMaterialScope([mine], { siteKey: "image", types: [] });
  assert.equal(honored.degraded, false);
  assert.equal(honored.showedUnscoped, false);

  // 多选类型同理：老后端返回全类型，浏览器侧按 chips 收窄。
  const mixed = applyMaterialScope(
    [mine, durableItem({ id: "deck", artifactType: "deck" })],
    { types: ["single_file_image", "chart"] },
  );
  assert.deepEqual(mixed.items.map((item) => item.id), ["mine"]);
  assert.equal(mixed.degraded, true);
});

test("素材库文件全部守住 800 行硬顶", () => {
  for (const path of [
    "../src/shell/material-library-controller.ts",
    "../src/shell/material-library-scope.ts",
    "../src/shell/material-library-view.tsx",
    "../src/shell/material-library-presentation.ts",
    "../src/shell/material-library-effects.ts",
    "../src/shell/ExplorePage.tsx",
  ]) {
    const lines = readFileSync(new URL(path, import.meta.url), "utf8").split(
      "\n",
    ).length;
    assert.ok(lines <= 800, `${path} 有 ${lines} 行，超过 800 行硬顶`);
  }
});
