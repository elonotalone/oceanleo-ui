import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CATALOG_LIBRARY_KIND_CATEGORY,
  createOpsFillBus,
  catalogAdvancedOpenPlan,
  catalogAppProductKind,
  catalogCanonicalRedirect,
  catalogPresetFill,
  catalogRepresentativePrompt,
  resolveCatalogDeepLinkIntent,
  resolveSiteCatalogRoute,
  searchWithoutCatalogDeepLinkIntent,
  workspaceAppAdvancedHref,
  workspaceAppFillHref,
} from "../src/shell/site-catalog-controller.ts";
import { normalizeWorkspaceAction } from "../src/shell/workspace-actions.ts";

const controllerSource = await readFile(
  new URL("../src/shell/site-catalog-controller.ts", import.meta.url),
  "utf8",
);

const consoleSource = await readFile(
  new URL("../src/shell/SiteCatalogConsole.tsx", import.meta.url),
  "utf8",
);
const guideSource = await readFile(
  new URL("../src/shell/guide-context.tsx", import.meta.url),
  "utf8",
);
const helperSource = await readFile(
  new URL("../src/shell/site-catalog-view-helpers.tsx", import.meta.url),
  "utf8",
);
// 深链编排层独立成文件（V1 §6.2：不让 SiteCatalogConsole.tsx 继续膨胀）。
const deepLinkSource = await readFile(
  new URL("../src/shell/site-catalog-deeplink.tsx", import.meta.url),
  "utf8",
);
const workspaceLibrarySource = await readFile(
  new URL("../src/shell/WorkspaceLibrary.tsx", import.meta.url),
  "utf8",
);
const myLibrarySource = await readFile(
  new URL("../src/shell/MyLibrary.tsx", import.meta.url),
  "utf8",
);

// ── 深链参数解析 ─────────────────────────────────────────────────────────────

test("只有精确取值才算深链意图，未知取值不猜测", () => {
  assert.deepEqual(resolveCatalogDeepLinkIntent("?fill=preset"), {
    fillPreset: true,
    openAdvanced: false,
    openTemplateId: "",
  });
  assert.deepEqual(
    resolveCatalogDeepLinkIntent("?fill=preset&open=advanced"),
    { fillPreset: true, openAdvanced: true, openTemplateId: "" },
  );
  assert.deepEqual(resolveCatalogDeepLinkIntent(""), {
    fillPreset: false,
    openAdvanced: false,
    openTemplateId: "",
  });
  assert.deepEqual(resolveCatalogDeepLinkIntent("?fill=1&open=editor"), {
    fillPreset: false,
    openAdvanced: false,
    openTemplateId: "",
  });
  assert.deepEqual(
    resolveCatalogDeepLinkIntent(new URLSearchParams("open=advanced")),
    { fillPreset: false, openAdvanced: true, openTemplateId: "" },
  );
});

test("意图消费后只抹掉自己的两个 key，其余 query 原样保留", () => {
  assert.equal(
    searchWithoutCatalogDeepLinkIntent("?fill=preset&open=advanced&keep=1"),
    "keep=1",
  );
  assert.equal(searchWithoutCatalogDeepLinkIntent("?fill=preset"), "");
  assert.equal(searchWithoutCatalogDeepLinkIntent("?embed=1"), "embed=1");
});

// ── 规范化 redirect 保留深链参数 ─────────────────────────────────────────────

test("legacy ?fn= 收敛到 canonical path 时 fill/open 仍在地址栏", () => {
  const search = "?fn=old-report&fill=preset&open=advanced&keep=1";
  const route = resolveSiteCatalogRoute({
    pathname: "/workspace",
    search,
    aliases: { "old-report": "report" },
    knownAppIds: new Set(["report"]),
  });
  assert.equal(route.activeAppId, "report");
  const href = catalogCanonicalRedirect(route, "/workspace", search);
  assert.equal(href, "/workspace/report?fill=preset&open=advanced&keep=1");
  assert.deepEqual(
    resolveCatalogDeepLinkIntent(href.slice(href.indexOf("?"))),
    { fillPreset: true, openAdvanced: true, openTemplateId: "" },
  );
});

test("未知 appId 不因新参数绕过「App 不存在」路径", () => {
  const search = "?fill=preset&open=advanced";
  const route = resolveSiteCatalogRoute({
    pathname: "/workspace/ghost",
    search,
    knownAppIds: new Set(["report"]),
  });
  assert.equal(route.invalidAppId, "ghost");
  assert.equal(route.activeAppId, "");
  assert.equal(
    catalogCanonicalRedirect(route, "/workspace/ghost", search),
    null,
  );
  // 所有深链副作用都以 activeAppId 为前置条件；invalid 时 activeAppId 为空串。
  assert.match(
    deepLinkSource,
    /!activeAppId \|\|\s*\(!intent\.fillPreset && !intent\.openAdvanced && !intent\.openTemplateId\)/,
  );
  assert.match(consoleSource, /这个 App 不存在或已下线/);
});

// ── 合同 §3 的两个 href helper ───────────────────────────────────────────────

test("href helper 产出 canonical 深链并对 appId 做 encodeURIComponent", () => {
  assert.equal(workspaceAppFillHref("poster"), "/workspace/poster?fill=preset");
  assert.equal(
    workspaceAppAdvancedHref("poster"),
    "/workspace/poster?fill=preset&open=advanced",
  );
  assert.equal(
    workspaceAppFillHref("a b/c?d"),
    "/workspace/a%20b%2Fc%3Fd?fill=preset",
  );
});

test("空或非法 appId 退回 /workspace，不产出半截深链", () => {
  for (const bad of ["", "   ", "\n", "bad\u0000id", undefined, null, 42]) {
    assert.equal(workspaceAppFillHref(bad), "/workspace");
    assert.equal(workspaceAppAdvancedHref(bad), "/workspace");
  }
});

test("href helper 尊重站点自定义 canonicalBasePath", () => {
  const route = {
    canonicalBasePath: "/console",
    historyBasePath: "/history",
    legacyQueryKeys: ["fn", "mode"],
  };
  assert.equal(
    workspaceAppFillHref("poster", route),
    "/console/poster?fill=preset",
  );
  assert.equal(workspaceAppFillHref("", route), "/console");
});

// ── 代表 prompt ──────────────────────────────────────────────────────────────

test("代表 prompt 取 preset 优先、灵感示例回退、两者皆空不灌", () => {
  assert.equal(
    catalogRepresentativePrompt({
      id: "a",
      name: "A",
      scenes: [],
      preset: { prompt: "P" },
      guideSections: [{ title: "s", examples: [{ label: "e", prompt: "E" }] }],
    }),
    "P",
  );
  assert.equal(
    catalogRepresentativePrompt({
      id: "a",
      name: "A",
      scenes: [],
      guideSections: [{ title: "s", examples: [{ label: "e", prompt: "E" }] }],
    }),
    "E",
  );
  assert.equal(
    catalogRepresentativePrompt({ id: "a", name: "A", scenes: [] }),
    "",
  );
  assert.equal(
    catalogRepresentativePrompt({
      id: "a",
      name: "A",
      scenes: [],
      preset: { prompt: "   " },
    }),
    "",
  );
  assert.equal(catalogPresetFill({ id: "a", name: "A", scenes: [] }), null);
  assert.deepEqual(
    catalogPresetFill({
      id: "a",
      name: "A",
      scenes: [],
      preset: { prompt: "P", set: { ratio: "16:9" } },
    }),
    { prompt: "P", set: { ratio: "16:9" } },
  );
  // 代表 prompt 来自示例卡时，示例自己的 set 叠在 preset.set 上（与点导航卡一致）。
  assert.deepEqual(
    catalogPresetFill({
      id: "a",
      name: "A",
      scenes: [],
      preset: { set: { ratio: "16:9", words: 800 } },
      guideSections: [
        {
          title: "s",
          examples: [{ label: "e", prompt: "E", set: { words: 1200 } }],
        },
      ],
    }),
    { prompt: "E", set: { ratio: "16:9", words: 1200 } },
  );
});

test("代表 prompt 取值规则只有 app-catalog 一份，深链层不得再实现一遍", () => {
  assert.match(controllerSource, /representativeFill\(app\)/);
  assert.match(controllerSource, /representativePrompt\(app\)/);
  assert.doesNotMatch(
    controllerSource,
    /guideSections\?\.\[0\]\?\.examples/,
    "深链层复制了代表 prompt 的取值链，会与首页卡片灌的内容漂移",
  );
});

test("合同 §3 的两个 href helper 已从 @oceanleo/ui/shell 公开导出", async () => {
  const barrel = await readFile(
    new URL("../src/shell/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(barrel, /\bworkspaceAppFillHref\b/);
  assert.match(barrel, /\bworkspaceAppAdvancedHref\b/);
  assert.match(barrel, /from "\.\/site-catalog-controller"/);
});

// ── 填充总线：显式 ready、晚注册、一次性、切 app 丢弃 ────────────────────────

test("填充器已就绪时 one-shot 当场灌入，且只灌一次", () => {
  const bus = createOpsFillBus();
  bus.setScope("poster");
  const calls = [];
  bus.register((text, opts) => calls.push([text, opts]));
  assert.equal(bus.ready(), true);
  assert.equal(
    bus.request({ scope: "poster", text: "P", opts: { set: { a: 1 } } }),
    true,
  );
  assert.deepEqual(calls, [["P", { set: { a: 1 } }]]);
  // 队列已清空：再没有任何隐藏的待填会被后续注册重放。
  bus.register(null);
  bus.register((text) => calls.push([text]));
  assert.equal(calls.length, 1);
});

test("填充器晚注册时 one-shot 排队，注册那一刻立即执行（不靠定时器）", () => {
  const bus = createOpsFillBus();
  bus.setScope("poster");
  assert.equal(bus.ready(), false);
  assert.equal(
    bus.request({ scope: "poster", text: "P", opts: { set: { a: 1 } } }),
    false,
  );
  const calls = [];
  const readySignals = [];
  bus.subscribe(() => readySignals.push(bus.ready()));
  bus.register((text, opts) => calls.push([text, opts]));
  assert.deepEqual(calls, [["P", { set: { a: 1 } }]]);
  assert.deepEqual(readySignals, [true]);
});

test("切 app 时排队的 one-shot 与上一个 app 的填充器一起被丢弃", () => {
  const bus = createOpsFillBus();
  bus.setScope("poster");
  bus.request({ scope: "poster", text: "POSTER" });
  bus.setScope("banner");
  assert.equal(bus.ready(), false);
  const calls = [];
  bus.register((text) => calls.push(text));
  assert.deepEqual(calls, []);
  assert.equal(bus.request({ scope: "poster", text: "STALE" }), false);
  assert.deepEqual(calls, []);
  assert.equal(bus.request({ scope: "banner", text: "BANNER" }), true);
  assert.deepEqual(calls, ["BANNER"]);
});

test("离开再回到同一个 app，上一次排队的 one-shot 不得复活", () => {
  // 只靠「冲刷时比对 scope」是不够的：回到原 app 后 scope 又相等了，待填必须在切走的
  // 那一刻就真的被丢掉，否则用户往返一次就会被回灌。
  const bus = createOpsFillBus();
  bus.setScope("poster");
  assert.equal(bus.request({ scope: "poster", text: "POSTER" }), false);
  bus.setScope("banner");
  bus.setScope("poster");
  const calls = [];
  bus.register((text) => calls.push(text));
  assert.deepEqual(calls, []);
  assert.equal(bus.ready(), true);
});

test("上一个 app 的填充器不会接到新 app 的点击填充", () => {
  const bus = createOpsFillBus();
  bus.setScope("poster");
  const calls = [];
  bus.register((text) => calls.push(text));
  bus.setScope("banner");
  assert.equal(bus.fill("X"), false);
  assert.deepEqual(calls, []);
});

test("空 prompt 永远不进总线（禁止灌空串）", () => {
  const bus = createOpsFillBus();
  bus.setScope("poster");
  const calls = [];
  bus.register((text) => calls.push(text));
  assert.equal(bus.request({ scope: "poster", text: "" }), false);
  assert.equal(bus.request({ scope: "poster", text: "   " }), false);
  assert.deepEqual(calls, []);
});

// ── ?open=advanced 的派发载荷 ────────────────────────────────────────────────

test("默认产物类型解析：显式声明 > app id 词元 > 站点默认", () => {
  assert.equal(
    catalogAppProductKind(
      {
        id: "anything",
        name: "A",
        scenes: [],
        preset: { set: { artifactType: "deck" } },
      },
      "image",
    ),
    "ppt",
  );
  assert.equal(
    catalogAppProductKind({ id: "website-landing", name: "A", scenes: [] }, "word"),
    "website",
  );
  assert.equal(
    catalogAppProductKind({ id: "poster", name: "A", scenes: [] }, "word"),
    "image",
  );
  // 词元互相矛盾时不赌，落站点默认。
  assert.equal(
    catalogAppProductKind({ id: "video-poster", name: "A", scenes: [] }, "ppt"),
    "ppt",
  );
  assert.equal(
    catalogAppProductKind({ id: "zzz", name: "A", scenes: [] }, "chat"),
    null,
  );
});

test("open=advanced 派发合规的 v1 envelope 并落在我的库标签", () => {
  const plan = catalogAdvancedOpenPlan(
    { id: "report", name: "报告", scenes: [] },
    "ppt",
  );
  assert.equal(plan.kind, "ppt");
  assert.equal(plan.degraded, false);
  assert.equal(plan.notice, "");
  assert.deepEqual(plan.action, {
    version: 1,
    tab: "mine",
    query: undefined,
    category: "PPT",
    itemId: undefined,
    url: undefined,
    browserSessionId: undefined,
  });
  // 载荷已经过 normalizeWorkspaceAction，重复归一化必须幂等且不产生新字段。
  assert.deepEqual(normalizeWorkspaceAction(plan.action), plan.action);
  assert.ok(plan.action.category.length <= 100);
  assert.equal(plan.action.query, undefined);
  assert.equal(plan.action.itemId, undefined);
});

test("任何 app 的 advanced 载荷都不越过协议硬上限", () => {
  const longSet = { artifactType: "x".repeat(5_000) };
  for (const app of [
    { id: "a".repeat(4_000), name: "A", scenes: [] },
    { id: "poster", name: "A", scenes: [], preset: { set: longSet } },
    { id: "sheet", name: "A", scenes: [] },
  ]) {
    const { action } = catalogAdvancedOpenPlan(app, "excel");
    assert.equal(action.version, 1);
    assert.equal(action.tab, "mine");
    assert.ok((action.query || "").length <= 200);
    assert.ok((action.category || "").length <= 100);
    assert.ok((action.itemId || "").length <= 300);
    assert.deepEqual(normalizeWorkspaceAction(action), action);
  }
});

test("没有可编辑产物类型时退化为打开我的库并给出可见提示", () => {
  const plan = catalogAdvancedOpenPlan(
    { id: "ask", name: "问答", scenes: [] },
    "chat",
  );
  assert.equal(plan.kind, null);
  assert.equal(plan.degraded, true);
  assert.ok(plan.notice.length > 0);
  assert.equal(plan.action.tab, "mine");
  assert.equal(plan.action.category, undefined);
  // 提示必须真的渲染出来，不能只是返回一个没人用的字符串。
  assert.match(deepLinkSource, /setNotice\(plan\.notice\)/);
  assert.match(
    deepLinkSource,
    /<CatalogDeepLinkNotice[\s\S]*?message=\{state\.notice\}/,
  );
  assert.match(deepLinkSource, /function CatalogDeepLinkNotice/);
});

test("我的库分类词典与 MyLibrary 的 KIND_CATEGORY 逐条一致", () => {
  const block = myLibrarySource.slice(
    myLibrarySource.indexOf("const KIND_CATEGORY"),
  );
  const body = block.slice(block.indexOf("{"), block.indexOf("};") + 1);
  for (const [kind, label] of Object.entries(CATALOG_LIBRARY_KIND_CATEGORY)) {
    assert.match(
      body,
      new RegExp(`\\b${kind}:\\s*"${label}"`),
      `${kind} → ${label} 与 MyLibrary 不一致`,
    );
  }
});

// ── 时序：显式 ready 信号，不许赌 setTimeout ────────────────────────────────

test("填充就绪是显式信号，填充链上没有任何定时器", () => {
  assert.doesNotMatch(guideSource, /setTimeout|requestAnimationFrame/);
  assert.doesNotMatch(helperSource, /setTimeout|requestAnimationFrame/);
  assert.doesNotMatch(deepLinkSource, /setTimeout|requestAnimationFrame/);
  assert.doesNotMatch(controllerSource, /setTimeout|requestAnimationFrame/);
  assert.match(controllerSource, /export function createOpsFillBus/);
  assert.match(guideSource, /export function useOpsFillerReady/);
  assert.match(guideSource, /useSyncExternalStore/);
});

test("切 app 的清空发生在 render 阶段而不是 effect（子先父后会清掉新注册）", () => {
  assert.match(guideSource, /bus\.setScope\(activeKey\);/);
  assert.doesNotMatch(
    guideSource,
    /useEffect\(\(\) => \{\s*fillerRef\.current = null;\s*\}, \[activeKey\]\);/,
  );
});

test("深链预填经 context 下发给操作台，并在灌入后消费掉 URL 意图", () => {
  assert.match(helperSource, /useRequestOneShotFill\(\)/);
  assert.match(helperSource, /scope: app\.id/);
  assert.match(helperSource, /if \(requestedRef\.current === app\.id\) return;/);
  assert.match(
    consoleSource,
    /<CatalogDeepLinkBoundary state=\{deepLink\} accent=\{accent\}>/,
  );
  assert.match(deepLinkSource, /searchWithoutCatalogDeepLinkIntent\(/);
});

// ── 抽出独立文件后，SiteCatalogConsole.tsx 只剩接线 ──────────────────────────

test("深链编排住在 site-catalog-deeplink.tsx，SiteCatalogConsole 不再持有这套逻辑", () => {
  // 锁存 / 消费 / 派发三件事都不许留在 console 里，否则那个文件会继续膨胀。
  for (const moved of [
    /deepLinkLatchRef/,
    /catalogPresetFill\(/,
    /catalogAdvancedOpenPlan\(/,
    /dispatchWorkspaceAction\(/,
    /resolveCatalogDeepLinkIntent\(/,
  ]) {
    assert.doesNotMatch(consoleSource, moved, `${moved} 应已移出 console`);
    assert.match(deepLinkSource, moved, `${moved} 应落在 deeplink 模块`);
  }
  // console 侧只剩「调 hook + 包一层」两处接线。
  assert.match(consoleSource, /const deepLink = useCatalogDeepLink\(\{/);
  assert.match(deepLinkSource, /export function useCatalogDeepLink/);
});

// ── open=advanced 的口径边界（V1 RR-4 / §8 第 8 条残余风险）────────────────

test("open=advanced 的口径仍是「默认产物类型的库分类」，不指名任何一件产物", () => {
  // 合同 §0 第 8 条只要求「进入该 app 默认产物类型的高级编辑」；这条链上没有具体产物
  // 可指，所以 envelope 里不带 itemId，也不带 intent。指名一份具体素材是 `?open=template`
  // 那条链的事（见 workspace-template-deeplink.test.mjs），两者不得互相污染。
  const plan = catalogAdvancedOpenPlan(
    { id: "ppt", name: "PPT", scenes: [] },
    "ppt",
  );
  assert.equal(plan.action.itemId, undefined);
  assert.equal(plan.action.intent, undefined);
  assert.ok(plan.action.category);

  // 不带 intent 的 action 落点仍是 openEntry（安静预览），不是 onOpenItem（编辑器）：
  // `openAdvancedOnSelect` 只是「详情页头部可以给 Edit」的开关。这条老语义不得被
  // 「编辑模板」的新分支顺手改掉。
  assert.match(
    workspaceLibrarySource,
    /preview-detail header may offer Edit into the advanced workbench/,
  );
  assert.match(
    workspaceLibrarySource,
    /if \(byId \|\| byUrl\) openEntry\(\(byId \|\| byUrl\)!\);/,
  );
});
