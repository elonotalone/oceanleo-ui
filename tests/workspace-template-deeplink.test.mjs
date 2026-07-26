// W4 — 「编辑模板」深链、编辑派发与「下载」前端链（合同 §0.3 / §3）。
//
// 上一轮验收 RR-4 的洞：`?open=advanced` 只知道「该 app 的默认产物类型」，进去是一个
// **空编辑器**，进不了某一份具体模板素材。本轮 W3 给 `TemplateMaterial` 加了
// `artifactId`，这套用例钉死的就是「深链 → 指名 artifact → typed 编辑器」这一整条链，
// 以及它不得回归 `?fill=preset` 的既有行为。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CATALOG_LIBRARY_KIND_CATEGORY,
  CATALOG_OPEN_QUERY_KEY,
  CATALOG_OPEN_TEMPLATE_VALUE,
  CATALOG_TEMPLATE_QUERY_KEY,
  TEMPLATE_DOWNLOAD_PATH,
  catalogCanonicalRedirect,
  catalogTemplateOpenPlan,
  resolveCatalogDeepLinkIntent,
  resolveSiteCatalogRoute,
  searchWithoutCatalogDeepLinkIntent,
  templateDownloadHref,
  workspaceAppFillHref,
  workspaceTemplateEditHref,
} from "../src/shell/site-catalog-controller.ts";
import { normalizeWorkspaceAction } from "../src/shell/workspace-actions.ts";
import { libraryKindForArtifactType } from "../src/shell/library-data.ts";
import { ARTIFACT_TYPES } from "../src/shell/artifact-contract.ts";
import { libraryEditIntentArtifactId } from "../src/shell/library-edit-intent.ts";

const controllerSource = await readFile(
  new URL("../src/shell/site-catalog-controller.ts", import.meta.url),
  "utf8",
);
const deepLinkSource = await readFile(
  new URL("../src/shell/site-catalog-deeplink.tsx", import.meta.url),
  "utf8",
);
const myLibrarySource = await readFile(
  new URL("../src/shell/MyLibrary.tsx", import.meta.url),
  "utf8",
);
const workspaceLibrarySource = await readFile(
  new URL("../src/shell/WorkspaceLibrary.tsx", import.meta.url),
  "utf8",
);
const editIntentSource = await readFile(
  new URL("../src/shell/library-edit-intent.ts", import.meta.url),
  "utf8",
);

const GATEWAY = "https://api.oceanleo.com";

/** 一份合规的 TemplateMaterial（W3 契约）。 */
function material(overrides = {}) {
  return {
    id: "tpl-1",
    title: "极简海报",
    previewUrl: "tpl-material/image-poster-1.webp",
    artifactId: "art_0001",
    artifactType: "single_file_image",
    ...overrides,
  };
}

function appWith(templates, overrides = {}) {
  return { id: "poster", name: "海报", scenes: [], templates, ...overrides };
}

// ── workspaceTemplateEditHref ────────────────────────────────────────────────

test("编辑模板深链指向该 app 的 canonical 地址并带上 open=template + template=", () => {
  assert.equal(
    workspaceTemplateEditHref("poster", "tpl-1"),
    "/workspace/poster?open=template&template=tpl-1",
  );
});

test("appId 与 templateId 都经过编码，特殊字符不会撑破 URL", () => {
  assert.equal(
    workspaceTemplateEditHref("a b/c?d", "t&t=1"),
    "/workspace/a%20b%2Fc%3Fd?open=template&template=t%26t%3D1",
  );
});

test("缺 app 退回目录，缺 template 退回该 app，绝不产出半截深链", () => {
  for (const bad of ["", "   ", "\n", "bad\u0000id", undefined, null, 42]) {
    assert.equal(workspaceTemplateEditHref(bad, "tpl-1"), "/workspace");
    // app 有效但 template 无效：进 app，但不带一个解析不出来的意图。
    assert.equal(workspaceTemplateEditHref("poster", bad), "/workspace/poster");
  }
});

test("编辑模板深链尊重站点自定义 canonicalBasePath", () => {
  const route = {
    canonicalBasePath: "/console",
    historyBasePath: "/history",
    legacyQueryKeys: ["fn", "mode"],
  };
  assert.equal(
    workspaceTemplateEditHref("poster", "tpl-1", route),
    "/console/poster?open=template&template=tpl-1",
  );
  assert.equal(workspaceTemplateEditHref("", "tpl-1", route), "/console");
});

test("「编辑模板」绝不夹带 ?fill=preset（那是「生成类似」的按钮）", () => {
  // 两个按钮在大卡片上并排。混在一条链接里，用户点「编辑模板」时输入框会被莫名填满。
  const href = workspaceTemplateEditHref("poster", "tpl-1");
  assert.doesNotMatch(href, /fill=preset/);
  const intent = resolveCatalogDeepLinkIntent(href.slice(href.indexOf("?")));
  assert.equal(intent.fillPreset, false);
  assert.equal(intent.openAdvanced, false);
  assert.equal(intent.openTemplateId, "tpl-1");
  // 反向：既有的「生成类似」链接也不得沾上模板意图。
  const fillIntent = resolveCatalogDeepLinkIntent(
    workspaceAppFillHref("poster").slice(
      workspaceAppFillHref("poster").indexOf("?"),
    ),
  );
  assert.equal(fillIntent.fillPreset, true);
  assert.equal(fillIntent.openTemplateId, "");
});

// ── 深链参数解析 ─────────────────────────────────────────────────────────────

test("open=template 缺 template= 时不退化成「打开默认产物类型的空编辑器」", () => {
  // 这正是本轮要修掉的老行为：宁可什么都不做，也不能假装成功。
  const intent = resolveCatalogDeepLinkIntent("?open=template");
  assert.equal(intent.openTemplateId, "");
  assert.equal(intent.openAdvanced, false);
  assert.equal(intent.fillPreset, false);
});

test("template= 只在 open=template 时生效，不会被别的意图顺手捡走", () => {
  const intent = resolveCatalogDeepLinkIntent("?open=advanced&template=tpl-1");
  assert.equal(intent.openAdvanced, true);
  assert.equal(intent.openTemplateId, "");
});

test("意图消费后三个 key 都抹掉，其它 query 参数必须原样保留", () => {
  assert.equal(
    searchWithoutCatalogDeepLinkIntent(
      "?open=template&template=tpl-1&keep=1&utm_source=card",
    ),
    "keep=1&utm_source=card",
  );
  assert.equal(
    searchWithoutCatalogDeepLinkIntent("?template=tpl-1"),
    "",
  );
});

test("legacy ?fn= 收敛到 canonical path 时模板意图仍在地址栏", () => {
  const search = "?fn=old-poster&open=template&template=tpl-1&keep=1";
  const route = resolveSiteCatalogRoute({
    pathname: "/workspace",
    search,
    aliases: { "old-poster": "poster" },
    knownAppIds: new Set(["poster"]),
  });
  assert.equal(route.activeAppId, "poster");
  const href = catalogCanonicalRedirect(route, "/workspace", search);
  assert.equal(
    href,
    "/workspace/poster?open=template&template=tpl-1&keep=1",
  );
  assert.equal(
    resolveCatalogDeepLinkIntent(href.slice(href.indexOf("?"))).openTemplateId,
    "tpl-1",
  );
});

// ── catalogTemplateOpenPlan：指名一份具体 artifact ───────────────────────────

test("命中模板时 envelope 指名 artifact id 并带 intent=edit", () => {
  const plan = catalogTemplateOpenPlan(appWith([material()]), "tpl-1", "image");
  assert.equal(plan.degraded, false);
  assert.equal(plan.notice, "");
  assert.equal(plan.template.id, "tpl-1");
  assert.deepEqual(plan.action, {
    version: 1,
    tab: "mine",
    query: undefined,
    category: "图片",
    itemId: "art_0001",
    url: undefined,
    browserSessionId: undefined,
    intent: "edit",
  });
  // 载荷已过 normalizeWorkspaceAction；重复归一化幂等且不产生新字段。
  assert.deepEqual(normalizeWorkspaceAction(plan.action), plan.action);
});

test("库分类跟着这一份素材的 artifactType 走，不是该 app 的默认产物类型", () => {
  // app id 是 poster（词元 → image），但这份素材是 deck。深链必须听素材的，
  // 否则右栏会按错分类过滤，这一份根本不出现。
  const plan = catalogTemplateOpenPlan(
    appWith([material({ artifactType: "deck" })]),
    "tpl-1",
    "image",
  );
  assert.equal(plan.action.category, "PPT");
  assert.equal(plan.action.itemId, "art_0001");
});

test("13 个 artifactType 全部能解析出库分类，且与 library-data 同一张表", () => {
  for (const artifactType of ARTIFACT_TYPES) {
    const plan = catalogTemplateOpenPlan(
      appWith([material({ artifactType })]),
      "tpl-1",
    );
    assert.equal(plan.degraded, false, `${artifactType} 应能派发`);
    assert.equal(plan.action.intent, "edit");
    // 逐条比对：深链给的库分类必须等于「我的库」自己对同一份 artifact 的分类。
    // 只许有一张 artifactType → LibraryKind 的表，抄第二份必然漂移。
    assert.equal(
      plan.action.category,
      CATALOG_LIBRARY_KIND_CATEGORY[libraryKindForArtifactType(artifactType)],
      `${artifactType} 的库分类与 library-data 不一致`,
    );
  }
  assert.match(controllerSource, /libraryKindForArtifactType\(/);
});

test("同一个 app 下多份模板各自指向自己的 artifact", () => {
  const app = appWith([
    material({ id: "tpl-1", artifactId: "art_0001" }),
    material({ id: "tpl-2", artifactId: "art_0002", artifactType: "website" }),
  ]);
  assert.equal(
    catalogTemplateOpenPlan(app, "tpl-1").action.itemId,
    "art_0001",
  );
  const second = catalogTemplateOpenPlan(app, "tpl-2");
  assert.equal(second.action.itemId, "art_0002");
  assert.equal(second.action.category, "网站");
});

// ── 未知 / 脏数据：可见退化，不白屏不抛错 ───────────────────────────────────

test("未知 templateId 退化为打开我的库 + 可见提示，不抛错不白屏", () => {
  const plan = catalogTemplateOpenPlan(appWith([material()]), "ghost", "image");
  assert.equal(plan.template, null);
  assert.equal(plan.degraded, true);
  assert.ok(plan.notice.length > 0);
  // 退化落点与 `?open=advanced` 的老路径完全一致：打开我的库，绝不指名错 artifact。
  assert.equal(plan.action.tab, "mine");
  assert.equal(plan.action.itemId, undefined);
  assert.equal(plan.action.intent, undefined);
});

test("app 没有 templates、或 app 本身为空时同样安全退化", () => {
  for (const app of [appWith([]), appWith(undefined), null, undefined]) {
    const plan = catalogTemplateOpenPlan(app, "tpl-1", "chat");
    assert.equal(plan.template, null);
    assert.equal(plan.degraded, true);
    assert.equal(plan.action.tab, "mine");
    assert.ok(plan.notice.length > 0);
  }
});

test("脏模板条目（缺 artifactId / 缺 id）不得被派发", () => {
  // W3 的 appTemplates 已剔脏；这里钉死深链层确实走它，而不是自己 find。
  const dirty = appWith([
    { id: "tpl-1", title: "无 artifact", previewUrl: "p.webp" },
    material({ id: "tpl-2", artifactId: "" }),
  ]);
  for (const wanted of ["tpl-1", "tpl-2"]) {
    const plan = catalogTemplateOpenPlan(dirty, wanted);
    assert.equal(plan.degraded, true);
    assert.equal(plan.action.itemId, undefined);
  }
  assert.match(controllerSource, /appTemplates\(app\)\s*\.find\(/);
});

test("超长 artifact id 宁可退化，也不派发被截断到 300 字的错 id", () => {
  const plan = catalogTemplateOpenPlan(
    appWith([material({ artifactId: "a".repeat(400) })]),
    "tpl-1",
  );
  assert.equal(plan.degraded, true);
  assert.equal(plan.action.itemId, undefined);
});

test("任何模板载荷都不越过协议硬上限", () => {
  const plan = catalogTemplateOpenPlan(
    appWith([material({ id: "t".repeat(1_000), artifactId: "art_1" })]),
    "t".repeat(1_000),
  );
  assert.ok((plan.action.category || "").length <= 100);
  assert.ok((plan.action.itemId || "").length <= 300);
  assert.deepEqual(normalizeWorkspaceAction(plan.action), plan.action);
});

test("intent 只认 open / edit，未知值不得静默变成一次编辑器启动", () => {
  assert.equal(
    normalizeWorkspaceAction({ version: 1, tab: "mine", intent: "launch" })
      .intent,
    undefined,
  );
  assert.equal(
    normalizeWorkspaceAction({ version: 1, tab: "mine", intent: "edit" })
      .intent,
    "edit",
  );
  // 本字段出现之前写下的 receipt 必须归一化成一模一样的对象（不得凭空多出 intent）。
  assert.deepEqual(normalizeWorkspaceAction({ version: 1, tab: "mine" }), {
    version: 1,
    tab: "mine",
    query: undefined,
    category: undefined,
    itemId: undefined,
    url: undefined,
    browserSessionId: undefined,
  });
});

// ── templateDownloadHref（前端链；端点由 W7 提供）───────────────────────────

test("默认走 W7 的下载端点，并按 artifact id 定位素材", () => {
  assert.equal(
    templateDownloadHref(material()),
    `${GATEWAY}${TEMPLATE_DOWNLOAD_PATH}/art_0001/download`,
  );
  // 只给字符串时按 artifact id 处理（templateId 只在 app 内唯一，全站会重名）。
  assert.equal(
    templateDownloadHref("art_0001"),
    `${GATEWAY}${TEMPLATE_DOWNLOAD_PATH}/art_0001/download`,
  );
  assert.equal(
    templateDownloadHref(material({ artifactId: "a b/c" })),
    `${GATEWAY}${TEMPLATE_DOWNLOAD_PATH}/a%20b%2Fc/download`,
  );
});

test("素材自带 https 直链时优先用它", () => {
  assert.equal(
    templateDownloadHref(
      material({ downloadUrl: "https://cdn.oceanleo.com/tpl/poster.zip" }),
    ),
    "https://cdn.oceanleo.com/tpl/poster.zip",
  );
});

test("非 https 直链一律不信任，回落到端点", () => {
  for (const bad of [
    "http://cdn.oceanleo.com/x.zip",
    "javascript:alert(1)",
    "data:text/html,<script>",
    "  ",
    "not a url",
  ]) {
    assert.equal(
      templateDownloadHref(material({ downloadUrl: bad })),
      `${GATEWAY}${TEMPLATE_DOWNLOAD_PATH}/art_0001/download`,
      `${bad} 不得成为下载链接`,
    );
  }
});

test("定位不到素材时返回空串，让 W2 隐藏按钮，而不是给一条点了就 404 的链接", () => {
  for (const bad of [null, undefined, "", "   ", {}, material({ artifactId: "" })]) {
    assert.equal(templateDownloadHref(bad), "");
  }
});

test("website 站的源码包不在前端分叉：34 站共用同一条下载链接", () => {
  // 合同 §0.5「website 站下载的是源码包」由端点按 artifactType 决定打包形态。
  // 前端若在这里 if (siteKey === "website")，30 站的按钮就会各写一套。
  const websiteMaterial = material({ artifactType: "website" });
  assert.equal(
    templateDownloadHref(websiteMaterial),
    `${GATEWAY}${TEMPLATE_DOWNLOAD_PATH}/art_0001/download`,
  );
  assert.doesNotMatch(controllerSource, /siteKey === "website"/);
});

// ── 派发接线与显式 ready 信号 ───────────────────────────────────────────────

test("模板意图确实被锁存并派发，且派发后从地址栏抹掉", () => {
  assert.match(deepLinkSource, /catalogTemplateOpenPlan\(app, templateId, siteKey\)/);
  assert.match(deepLinkSource, /nonce: `catalog-template:/);
  assert.match(deepLinkSource, /openTemplateId: ""/);
  assert.match(deepLinkSource, /clearDeepLinkQuery\(\);/);
});

test("整条模板深链上没有任何定时器（就绪必须是显式信号，不许赌时序）", () => {
  for (const [name, source] of [
    ["controller", controllerSource],
    ["deeplink", deepLinkSource],
  ]) {
    assert.doesNotMatch(
      source,
      /setTimeout|setInterval|requestAnimationFrame/,
      `${name} 里出现了定时器`,
    );
  }
});

// ── 消费端：intent=edit 必须真的进 typed 编辑器 ─────────────────────────────

test("只有 intent=edit 的 envelope 才要求直达编辑器", () => {
  assert.equal(
    libraryEditIntentArtifactId({
      nonce: "n1",
      action: { version: 1, tab: "mine", itemId: "art_1", intent: "edit" },
    }),
    "art_1",
  );
  // 老 receipt（无 intent）、别的 intent、以及没指名 artifact 的，一律不归这条链管。
  for (const action of [
    { version: 1, tab: "mine", itemId: "art_1" },
    { version: 1, tab: "mine", itemId: "art_1", intent: "open" },
    { version: 1, tab: "mine", intent: "edit" },
  ]) {
    assert.equal(libraryEditIntentArtifactId({ nonce: "n1", action }), "");
  }
  assert.equal(libraryEditIntentArtifactId(null), "");
  // 没有 nonce 就没有「这一次」，不得触发。
  assert.equal(
    libraryEditIntentArtifactId({
      nonce: "",
      action: { version: 1, tab: "mine", itemId: "art_1", intent: "edit" },
    }),
    "",
  );
});

test("intent=edit 直接交给 typed 编辑器，不落在安静预览详情", () => {
  assert.match(myLibrarySource, /useLibraryEditIntent\(\{/);
  assert.match(
    myLibrarySource,
    /onOpenItem: onOpenItem \|\| setStandaloneEditorItem/,
  );
});

test("官方模板不在本人库里，所以按 artifact id 直接取一次（这就是补的那个洞）", () => {
  // 列表查找只是快路径；等它出现在「我的库」正是这条链以前静默失败的方式。
  assert.match(editIntentSource, /getCurrentArtifactItem\(/);
  assert.match(editIntentSource, /isDurableLibraryItem\(item\)/);
  // 取不到时给可见失败态，不是空白面板。
  assert.match(editIntentSource, /onFailure\(\{/);
  assert.match(myLibrarySource, /setFailed\(true\);/);
});

test("编辑意图以 nonce 去重：重渲染不重复取数，晚到的列表不在背后再开一次", () => {
  assert.match(editIntentSource, /handledNonceRef\.current === nonce/);
  assert.match(editIntentSource, /\}, \[nonce, artifactId\]\);/);
  assert.doesNotMatch(
    editIntentSource,
    /setTimeout|setInterval|requestAnimationFrame/,
  );
});

test("不带 intent 的既有 action 语义不变，仍是安静预览", () => {
  assert.match(
    workspaceLibrarySource,
    /if \(byId \|\| byUrl\) openEntry\(\(byId \|\| byUrl\)!\);/,
  );
});

test("合同 §3 的模板 helper 名称与形状不得漂移（W2 按这个签名调用）", () => {
  assert.equal(typeof workspaceTemplateEditHref, "function");
  assert.equal(typeof templateDownloadHref, "function");
  assert.equal(CATALOG_OPEN_TEMPLATE_VALUE, "template");
  assert.equal(CATALOG_TEMPLATE_QUERY_KEY, "template");
  assert.equal(CATALOG_OPEN_QUERY_KEY, "open");
});
