// 素材库消费官方模板目录（`GET /v1/template-materials`）的契约。
//
// 守住的用户可见行为是「点预览&编辑跳进素材库，素材库里有那份素材」。以前这条链
// 断在最前面：素材库只认带权限的 `/v1/library/*`，匿名用户拿到 401、面板全空。
//
// 因此这里钉四件事：
//   ① 列表源是 template-materials，且请求不带任何凭据 —— 匿名可读是产品状态，
//      不是降级；
//   ② 深链 `item=` 无论写 catalog key 还是 artifactId 都能命中那一份；
//   ③ site / app 过滤按目录字段走，不靠标题猜；
//   ④ 目录行**不冒充 durable artifact**：它进得了货架，但过不了 durable 判定，
//      所以任何变更路径都还是要求一份真的 artifact projection。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TEMPLATE_MATERIAL_ENTRY_PREFIX,
  filterTemplateMaterials,
  invalidateTemplateMaterialCache,
  isOfficialTemplateMaterialEntry,
  listTemplateMaterials,
  normalizeTemplateMaterial,
  resetTemplateMaterialDropStats,
  templateDeepLinkAction,
  templateMaterialDropStats,
  templateMaterialEntry,
  templateMaterialEntryId,
  templateMaterialMatchesItemId,
} from "../src/shell/material-library-template-source.ts";
import { isDurableLibraryItem } from "../src/shell/library-data.ts";
import { isTrustedEditableMaterialEntry } from "../src/shell/material-library-presentation.ts";

const ARTIFACT_ID = "11111111-1111-4111-8111-111111111111";

function wireRow(overrides = {}) {
  return {
    id: "study-homework-1",
    title: "作业批改示例",
    summary: "官方样例",
    tags: ["作业", "批改"],
    previewUrl: "tpl-material/study-homework-1",
    artifactId: ARTIFACT_ID,
    artifactType: "document",
    downloadUrl: "/v1/template-materials/study-homework-1/download",
    siteKey: "study",
    appId: "homework",
    width: 1240,
    height: 1754,
    ...overrides,
  };
}

function stubFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return handler(String(url), init || {});
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test("匿名可读：列表源是 template-materials，且请求不带任何凭据", async () => {
  invalidateTemplateMaterialCache();
  const fetchStub = stubFetch(() =>
    jsonResponse({ items: [wireRow(), wireRow({ id: "study-homework-2" })] }),
  );
  try {
    const result = await listTemplateMaterials({
      siteKey: "study",
      appId: "homework",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.data.map((material) => material.id),
      ["study-homework-1", "study-homework-2"],
    );

    assert.equal(fetchStub.calls.length, 1);
    const { url, init } = fetchStub.calls[0];
    const requested = new URL(url);
    assert.equal(requested.pathname, "/v1/template-materials");
    assert.equal(requested.searchParams.get("siteKey"), "study");
    assert.equal(requested.searchParams.get("appId"), "homework");

    // 匿名是这条链的默认态：带上 cookie 就等于要求一个可携带凭据的 CORS 源，
    // 而这个端点不需要，也不许因此放宽。
    assert.equal(init.credentials, "omit");
    assert.equal(
      Object.keys(init.headers || {}).some(
        (name) => name.toLowerCase() === "authorization",
      ),
      false,
    );

    // 带权限的货架端点（匿名 401）不是列表源。
    assert.equal(url.includes("editable-shelf"), false);
  } finally {
    fetchStub.restore();
    invalidateTemplateMaterialCache();
  }
});

test("列表响应透出 artifact 的 width/height，供自适应主预览排版", async () => {
  invalidateTemplateMaterialCache();
  const fetchStub = stubFetch(() => jsonResponse({ items: [wireRow()] }));
  try {
    const result = await listTemplateMaterials({ siteKey: "study" });
    const [material] = result.data;
    assert.equal(material.width, 1240);
    assert.equal(material.height, 1754);

    const entry = templateMaterialEntry(material);
    assert.equal(entry.libraryItem.meta.width, 1240);
    assert.equal(entry.libraryItem.meta.height, 1754);
  } finally {
    fetchStub.restore();
    invalidateTemplateMaterialCache();
  }
});

test("拿不到宽高时按 0 落地，不臆造一个比例", () => {
  const material = normalizeTemplateMaterial(
    wireRow({ width: undefined, height: "not-a-number" }),
  );
  assert.equal(material.width, 0);
  assert.equal(material.height, 0);
});

test("深链 item= 命中那一份：catalog key、artifactId、durable 写法都认", () => {
  const material = normalizeTemplateMaterial(wireRow());
  for (const itemId of [
    "study-homework-1",
    ARTIFACT_ID,
    `artifact:${ARTIFACT_ID}:22222222-2222-4222-8222-222222222222`,
    templateMaterialEntryId(material),
  ]) {
    assert.equal(
      templateMaterialMatchesItemId(material, itemId),
      true,
      `should match ${itemId}`,
    );
  }
  for (const itemId of [
    "",
    "study-homework-2",
    "33333333-3333-4333-8333-333333333333",
    "artifact:33333333-3333-4333-8333-333333333333:r1",
  ]) {
    assert.equal(
      templateMaterialMatchesItemId(material, itemId),
      false,
      `should not match ${itemId}`,
    );
  }
});

test("site / app 过滤按目录字段走", async () => {
  invalidateTemplateMaterialCache();
  const fetchStub = stubFetch((url) => {
    const requested = new URL(url);
    const appId = requested.searchParams.get("appId");
    const rows = [
      wireRow(),
      wireRow({ id: "study-essay-1", appId: "essay", artifactType: "deck" }),
    ].filter((row) => !appId || row.appId === appId);
    return jsonResponse({ items: rows });
  });
  try {
    const scoped = await listTemplateMaterials({
      siteKey: "study",
      appId: "homework",
    });
    assert.deepEqual(
      scoped.data.map((material) => material.id),
      ["study-homework-1"],
    );

    const site = await listTemplateMaterials({ siteKey: "study" });
    assert.equal(site.data.length, 2);
    assert.deepEqual(
      filterTemplateMaterials(site.data, { appId: "essay" }).map(
        (material) => material.id,
      ),
      ["study-essay-1"],
    );
    assert.deepEqual(
      filterTemplateMaterials(site.data, { types: ["deck"] }).map(
        (material) => material.id,
      ),
      ["study-essay-1"],
    );
    assert.equal(filterTemplateMaterials(site.data, {}).length, 2);
  } finally {
    fetchStub.restore();
    invalidateTemplateMaterialCache();
  }
});

test("目录行不冒充 durable artifact：进得了货架，过不了 durable 判定", () => {
  const material = normalizeTemplateMaterial(wireRow());
  const entry = templateMaterialEntry(material);

  assert.equal(entry.id, `${TEMPLATE_MATERIAL_ENTRY_PREFIX}${material.id}`);
  assert.equal(isOfficialTemplateMaterialEntry(entry), true);
  // 目录端点刻意不下发 revision 身份，所以这里也不许把它伪造出来。
  assert.equal(isDurableLibraryItem(entry.libraryItem), false);
  assert.equal(isTrustedEditableMaterialEntry(entry), false);
  assert.equal(entry.libraryItem.artifactId, undefined);
  assert.equal(entry.libraryItem.revisionId, undefined);
  assert.equal(
    entry.libraryItem.meta.template_material_artifact_id,
    ARTIFACT_ID,
  );

  // 普通条目不得被这条例外放进来。
  assert.equal(
    isOfficialTemplateMaterialEntry({ id: "artifact:a:b", title: "x" }),
    false,
  );
});

test("坏行与坏预览键被丢掉，不进货架", () => {
  assert.equal(normalizeTemplateMaterial(null), null);
  assert.equal(normalizeTemplateMaterial(wireRow({ id: "" })), null);
  assert.equal(normalizeTemplateMaterial(wireRow({ artifactId: "" })), null);
  assert.equal(
    normalizeTemplateMaterial(wireRow({ artifactType: "hologram" })),
    null,
  );
  for (const previewUrl of [
    "",
    "http://example.com/x.webp",
    "javascript:alert(1)",
    "../../etc/passwd",
    "tpl-material/../../secret",
  ]) {
    assert.equal(
      normalizeTemplateMaterial(wireRow({ previewUrl })),
      null,
      `should reject ${previewUrl}`,
    );
  }
  assert.equal(
    normalizeTemplateMaterial(
      wireRow({ previewUrl: "https://asset.oceanleo.com/a.webp" }),
    ).previewKey,
    "https://asset.oceanleo.com/a.webp",
  );
});

test("丢行不再是静默的：按原因计数，且原因分得动", () => {
  const tally = { seen: 0, dropped: 0, reasons: {} };
  normalizeTemplateMaterial(null, tally);
  normalizeTemplateMaterial(wireRow({ id: "" }), tally);
  normalizeTemplateMaterial(wireRow({ artifactId: "" }), tally);
  normalizeTemplateMaterial(wireRow({ artifactType: "hologram" }), tally);
  normalizeTemplateMaterial(wireRow({ previewUrl: "a:b/c" }), tally);
  normalizeTemplateMaterial(wireRow({ previewUrl: "../../etc/passwd" }), tally);
  normalizeTemplateMaterial(wireRow(), tally);

  assert.equal(tally.seen, 7);
  assert.equal(tally.dropped, 6);
  // 分类是分诊用的：key 形状（上一轮那 9 行冒号 key）与类型枚举漂移必须分得开，
  // 否则「少了几份」只能靠人肉逐行比对定位。
  assert.deepEqual(tally.reasons, {
    "not-an-object": 1,
    "missing-id": 1,
    "missing-artifact-id": 1,
    "unknown-artifact-type": 1,
    "unsafe-preview-key": 2,
  });

  // 不传 tally 的老调用点（V1 探针等）行为逐字不变。
  assert.equal(normalizeTemplateMaterial(wireRow({ id: "" })), null);
  assert.equal(normalizeTemplateMaterial(wireRow()).id, "study-homework-1");
});

test("信号按原因聚合成一行，不逐行刷屏；全绿时一声不吭", async () => {
  invalidateTemplateMaterialCache();
  resetTemplateMaterialDropStats();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  const fetchStub = stubFetch(() =>
    jsonResponse({
      items: [
        wireRow(),
        wireRow({ id: "study-homework-2", previewUrl: "javascript:alert(1)" }),
        wireRow({ id: "study-homework-3", previewUrl: "http://x/y.webp" }),
        wireRow({ id: "", previewUrl: "tpl-material/x" }),
      ],
    }),
  );
  try {
    const result = await listTemplateMaterials({
      siteKey: "study",
      appId: "homework",
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.length, 1);

    // 3 行坏数据 → 1 条日志。逐行打印在 412 行的目录上是噪音，噪音会被静音，
    // 静音之后这条信号等于不存在。
    assert.equal(warnings.length, 1);
    assert.equal(
      warnings[0],
      "[template-materials] study/homework: dropped 3/4 rows — unsafe-preview-key=2 missing-id=1",
    );

    const stats = templateMaterialDropStats();
    assert.equal(stats.seen, 4);
    assert.equal(stats.dropped, 3);
    assert.deepEqual(stats.reasons, {
      "unsafe-preview-key": 2,
      "missing-id": 1,
    });
  } finally {
    fetchStub.restore();
    invalidateTemplateMaterialCache();
  }

  // 一行都没丢的正常响应不得留下任何日志。
  const clean = stubFetch(() => jsonResponse({ items: [wireRow()] }));
  try {
    warnings.length = 0;
    const result = await listTemplateMaterials({
      siteKey: "study",
      appId: "quiz",
    });
    assert.equal(result.ok, true);
    assert.equal(warnings.length, 0);
    // 累计计数仍然记录看过多少行，好让「丢弃率」有分母。
    assert.equal(templateMaterialDropStats().seen, 5);
  } finally {
    clean.restore();
    console.warn = originalWarn;
    invalidateTemplateMaterialCache();
    resetTemplateMaterialDropStats();
  }
});

test("响应形状不对时报错而不是把坏数据摊到面板上", async () => {
  invalidateTemplateMaterialCache();
  const fetchStub = stubFetch(() => jsonResponse({ rows: [] }));
  try {
    const result = await listTemplateMaterials({ siteKey: "study" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid-response");
  } finally {
    fetchStub.restore();
    invalidateTemplateMaterialCache();
  }

  invalidateTemplateMaterialCache();
  const failing = stubFetch(() => jsonResponse({ items: [] }, 503));
  try {
    const result = await listTemplateMaterials({ siteKey: "study" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.retryable, true);
  } finally {
    failing.restore();
    invalidateTemplateMaterialCache();
  }
});

test("没有 siteKey 就不发请求", async () => {
  invalidateTemplateMaterialCache();
  const fetchStub = stubFetch(() => jsonResponse({ items: [wireRow()] }));
  try {
    const result = await listTemplateMaterials({ siteKey: "  " });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, []);
    assert.equal(fetchStub.calls.length, 0);
  } finally {
    fetchStub.restore();
    invalidateTemplateMaterialCache();
  }
});

test("深链会被改写成官方模板的 entry id，WorkspaceLibrary 才开得了那张卡", () => {
  const envelope = {
    nonce: "n1",
    action: { version: 1, tab: "materials", itemId: ARTIFACT_ID, intent: "edit" },
  };
  const rewritten = templateDeepLinkAction(envelope, "template-material:x-1");
  assert.equal(rewritten.action.itemId, "template-material:x-1");
  // 官方模板没有可交给编辑器的 projection，留着 edit 意图会让面板什么都不开。
  assert.equal("intent" in rewritten.action, false);
  assert.equal(rewritten.action.tab, "materials");
  assert.equal(rewritten.nonce, "n1");

  // 目录里没有那一份时不得改写别人的深链。
  assert.equal(templateDeepLinkAction(envelope, ""), envelope);
  assert.equal(templateDeepLinkAction(null, "template-material:x-1"), null);
});

test("宿主兜底的 app id 不当过滤条件用，否则货架又是空的", () => {
  const effects = readFileSync(
    new URL("../src/shell/material-library-effects.ts", import.meta.url),
    "utf8",
  );
  // `runtimeAppId` 在没有 app 会话时是 `"default"`，目录里没有这个 app_id：
  // 拿它去过滤等于把整个官方货架过滤空。
  assert.match(effects, /options\.appId === "default" \? "" : options\.appId/);
});

test("接口 A：注册了只读落点，且目录已认领时不再重复取数", () => {
  const effects = readFileSync(
    new URL("../src/shell/material-library-effects.ts", import.meta.url),
    "utf8",
  );
  // `onPreviewItem` 缺席时 W2 的 hook 会退回「只在已加载列表里找」，
  // 而官方模板本来就不在用户库里——那正是这条链以前静默失败的方式。
  assert.match(effects, /useLibraryEditIntent\(\{/);
  assert.match(effects, /onPreviewItem:\s*\(item\)\s*=>/);
  assert.match(effects, /onFailure:\s*\(failure\)\s*=>/);

  const view = readFileSync(
    new URL("../src/shell/material-library-view.tsx", import.meta.url),
    "utf8",
  );
  assert.match(view, /useMaterialLibraryPreviewIntent\(\{/);
  // 目录自己认领了这条深链就不必再按 artifact id 取一次。
  assert.match(
    view,
    /action:\s*templateShelf\.deepLinkEntryId\s*\?\s*null\s*:\s*action/,
  );
});

test("面板确实接上了这条链（wiring，不靠 DOM 断言）", () => {
  const view = readFileSync(
    new URL("../src/shell/material-library-view.tsx", import.meta.url),
    "utf8",
  );
  // 缺任何一条，货架都会退回「面板是空的」那个缺陷。
  assert.match(view, /useOfficialTemplateMaterials/);
  assert.match(view, /officialTemplates: templateShelf\.entries/);
  assert.match(view, /templateDeepLinkAction\(action, templateShelf\./);

  const shelf = readFileSync(
    new URL("../src/shell/material-library-presentation.ts", import.meta.url),
    "utf8",
  );
  assert.match(shelf, /isOfficialTemplateMaterialEntry\(entry\)/);

  const source = readFileSync(
    new URL(
      "../src/shell/material-library-template-source.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /\/v1\/template-materials/);
  // 带权限的货架端点（匿名 401）没有被借来当官方模板的列表源；文件里提到它，
  // 只是在注释里解释为什么不用它。
  assert.equal(source.includes("listEditableShelfArtifacts"), false);
});
