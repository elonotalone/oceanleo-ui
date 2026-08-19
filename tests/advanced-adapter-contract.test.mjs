import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DOC_FAMILY_DOWNLOAD_FORMATS } from "../src/shell/doc-editors/doc-family-formats.ts";
import { TRUSTED_EDITOR_REGISTRY } from "../src/shell/workbench-routes.ts";

const source = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

// 已发货的适配器实得 14 条：13 个可路由适配器 + `office` 拒收哨兵。
//
// 这两个数原来钉的是 16 / 15，多出来的那两条是 `geo-map` 与 `interactive-doc`：
// `7bee5da`（2026-07-30 的保护性提交「13 份载体契约的编辑器与 geo-map/interactive-doc
// 工作台」）连同「两个新工作台」的说法一起提交了这份契约，**实现从未落地** ——
// `src/shell/advanced-routes/` 下没有它们的 Route，运行时注册表也从来只有 14 条。
// 地图与交互文档当前只有浏览侧（viewer、封面、板块 tab、类型标签、explore 分派都齐），
// 是 view-only。判据在此陈述已发货的真相，而不是继续替一个不存在的工作台背书。
//
// **编辑器落地时把 14 / 13 翻回 16 / 15**：下面那条缺席断言会先红出来提醒。
test("every trusted editor declares project, viewport, toolbar and persistence ownership", () => {
  assert.equal(Object.keys(TRUSTED_EDITOR_REGISTRY).length, 14);
  for (const unshipped of ["geo-map", "interactive-doc"]) {
    assert.equal(
      Object.hasOwn(TRUSTED_EDITOR_REGISTRY, unshipped),
      false,
      `${unshipped} 有注册项了，说明编辑器落地：本组判据要翻回 16 / 15`,
    );
  }
  assert.deepEqual(TRUSTED_EDITOR_REGISTRY.office, {
    routeType: "none",
    artifactCapabilities: [],
    featureId: null,
    routable: false,
    roundTrip: [],
    projectSchema: "office-file@1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  });
  assert.equal(
    Object.values(TRUSTED_EDITOR_REGISTRY).filter((entry) => entry.routable)
      .length,
    13,
  );
  for (const [id, contract] of Object.entries(TRUSTED_EDITOR_REGISTRY)) {
    if (!contract.routable) continue;
    assert.deepEqual(
      [...contract.roundTrip],
      ["load", "mutate", "save", "reopen"],
      id,
    );
    assert.match(contract.projectSchema, /^[a-z0-9.-]+(?:@|\.v)\d+$/i, id);
    assert.ok(["content", "native"].includes(contract.viewportOwnership), id);
    assert.ok(["shared", "native"].includes(contract.toolbarOwnership), id);
    assert.ok(["project", "native-callback"].includes(contract.persistence), id);
  }
});

test("all route components use the single typed adapter prop", () => {
  const routes = [
    "ImageRoute",
    "VideoTimelineRoute",
    "AudioRoute",
    "PdfRoute",
    "Model3DRoute",
    "ChartRoute",
    "GridRoute",
    "RichDocRoute",
    "DeckRoute",
    "EmbeddedRoute",
    "GameRoute",
    "UnsupportedRoute",
  ];
  for (const route of routes) {
    const text = source(`../src/shell/advanced-routes/${route}.tsx`);
    assert.match(text, /adapter=\{\{/, route);
    assert.doesNotMatch(
      text,
      /editor(?:Toolbox|Drawers|ContextualToolbar|HeaderActions|Viewport|Stage|Dirty)=/,
      route,
    );
  }
  const contract = source("../src/shell/advanced-editor-adapter.ts");
  assert.match(contract, /interface AdvancedEditorAdapter/);
  assert.match(contract, /persistence\?: AdvancedEditorPersistenceAdapter/);
  assert.match(contract, /editRevision: string \| number/);
});

test("shell geometry never scales editor chrome and every legacy toolbox gets a launcher", () => {
  const shell =
    source("../src/shell/InlineAdvancedWorkbenchShell.tsx") +
    source("../src/shell/FloatingContextToolbar.tsx");
  const stage = source("../src/shell/AdvancedWorkbenchStage.tsx");
  assert.match(shell, /data-advanced-context-row/);
  assert.match(shell, /data-advanced-viewport-row/);
  assert.match(shell, /drawerById/);
  assert.match(shell, /const showWorkspaceDetail = workspacePane\?\.showDetail/);
  assert.match(shell, /adapter\.nativeChrome\?\.viewport/);
  assert.doesNotMatch(stage, /stageScale|data-advanced-scaled-panel/);
  assert.doesNotMatch(shell, /editorContextualToolbarAnchor/);
});

test("fixed workspace row owns semantic actions outside the object edit bar", () => {
  const contract = source("../src/shell/advanced-workbench-chrome.ts");
  const header =
    source("../src/shell/InlineAdvancedWorkbenchShell.tsx") +
    source("../src/shell/InlineAdvancedWorkbenchHeader.tsx") +
    source("../src/shell/FloatingContextToolbar.tsx");
  const actions = source("../src/shell/AdvancedWorkspaceActionBar.tsx");
  assert.match(contract, /interface AdvancedWorkbenchAction/);
  assert.match(contract, /variant\?: "default" \| "primary" \| "danger" \| "icon"/);
  assert.match(header, /<AdvancedWorkspaceActionBar/);
  assert.match(actions, /const actions = adapter\.actions \|\| \[\]/);
  assert.match(actions, /standaloneActions\.map\(\(action\)/);
  assert.match(actions, /adapter\.directDownload/);
  assert.match(contract, /group\?: "download"/);
  assert.match(actions, /action\.group === "download"/);
  assert.match(actions, /data-workspace-download-launcher/);
  assert.match(actions, /data-workspace-download-menu/);
  assert.match(actions, /data-advanced-workspace-actions/);
  assert.match(header, /data-advanced-context-row/);
  assert.match(header, /action\.panelId/);
  assert.doesNotMatch(header, /absolute left-2 right-2 top-2/);
});

// 2026-08-19（W2）：下载菜单从 `DOC_FAMILY_DOWNLOAD_FORMATS` 一张表派生，条目 id 统一成
// `richdoc-export-<落地后缀>`，源码里不再有逐字的 id 文本（Markdown 那条因此从
// `richdoc-export-markdown` 变成 `richdoc-export-md`，与其余三条路由同一套命名）。
// 判据随之从「在源码里逐字找三个 id」换成「从同一张表算出全部六条 id 并逐条钉死」。
// 这是换判据不是松判据：条目丢失照样红（旧判据只盯 3 条，新判据盯全部 6 条，
// 顺序、后缀、条数任一变动都红），另外还多钉了两条旧判据管不到的事——
// 路由必须真的按这张表派生（而不是另抄一份），且除主交付物外不许再手写任何导出 id。
test("RichDoc groups DOCX Markdown HTML and JSON behind one download contract", () => {
  const route = source("../src/shell/advanced-routes/RichDocRoute.tsx");
  assert.deepEqual(
    DOC_FAMILY_DOWNLOAD_FORMATS.richdoc.map(
      (format) => `richdoc-export-${format.extension}`,
    ),
    [
      "richdoc-export-docx",
      "richdoc-export-md",
      "richdoc-export-html",
      "richdoc-export-pdf",
      "richdoc-export-txt",
      "richdoc-export-json",
    ],
  );
  assert.match(
    route,
    /directDownload:\s*\{[\s\S]*?id:\s*"richdoc-export-docx"/,
  );
  assert.match(
    route,
    /DOC_FAMILY_DOWNLOAD_FORMATS\.richdoc\.slice\(1\)[\s\S]{0,120}?id: `richdoc-export-\$\{format\.extension\}`[\s\S]{0,160}?group: "download" as const/,
  );
  assert.deepEqual(
    [...route.matchAll(/id: "(richdoc-export-[a-z0-9]+)"/g)].map(
      (match) => match[1],
    ),
    ["richdoc-export-docx"],
  );
  const retry = route.match(
    /id: "richdoc-refresh-office-source"[\s\S]*?\}/,
  )?.[0];
  assert.ok(retry);
  assert.doesNotMatch(retry, /group:\s*"download"/);
});

test("mutable native editors keep an independent local recovery log", () => {
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const store = source("../src/shell/advanced-recovery-store.ts");
  assert.match(shell, /useAdvancedRecovery/);
  assert.match(store, /indexedDB\.open/);
  assert.match(store, /mutationQueues/);
  assert.match(store, /MAX_DRAFT_AGE_MS/);
  for (const route of [
    "AudioRoute",
    "ChartRoute",
    "DeckRoute",
    "GridRoute",
    "Model3DRoute",
    "PdfRoute",
    "RichDocRoute",
    "VideoTimelineRoute",
  ]) {
    assert.match(
      source(`../src/shell/advanced-routes/${route}.tsx`),
      /recovery: \{/,
      route,
    );
  }
  const image = source(
    "../src/shell/image-editor/editor-persistence.ts",
  );
  assert.match(image, /LOCAL_DRAFT_PREFIX/);
  assert.match(image, /saveLocalImageDraft/);
});
