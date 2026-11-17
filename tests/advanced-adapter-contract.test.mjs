import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DOC_FAMILY_DOWNLOAD_FORMATS } from "../src/shell/doc-editors/doc-family-formats.ts";
import { TRUSTED_EDITOR_REGISTRY } from "../src/shell/workbench-routes.ts";

const source = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

/**
 * grid 只剩 Univer 一条路（core-swap:delete grid，2026-09-07）：路由文件只做
 * `dynamic()` 懒加载，adapter / recovery 长在懒加载叶子 `GridUniverStage.tsx` 里。
 */
const ROUTE_LEAF = {
  GridRoute: "../src/shell/doc-editors/GridUniverStage.tsx",
};
const routeSource = (route) =>
  source(ROUTE_LEAF[route] || `../src/shell/advanced-routes/${route}.tsx`);

// 已发货的适配器实得 13 条：12 个可路由适配器 + `office` 拒收哨兵（图表墓碑 2026-10-22 已删）。
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
  assert.equal(Object.keys(TRUSTED_EDITOR_REGISTRY).length, 6);
  for (const unshipped of ["geo-map", "interactive-doc"]) {
    assert.equal(
      Object.hasOwn(TRUSTED_EDITOR_REGISTRY, unshipped),
      false,
      `${unshipped} 有注册项了，说明编辑器落地：本组判据要翻回 16 / 15`,
    );
  }
  assert.equal(TRUSTED_EDITOR_REGISTRY.office, undefined);
  assert.equal(
    Object.values(TRUSTED_EDITOR_REGISTRY).filter((entry) => entry.routable)
      .length,
    6,
  );
  for (const [id, contract] of Object.entries(TRUSTED_EDITOR_REGISTRY)) {
    if (!contract.routable) continue;
    assert.deepEqual(
      [...contract.roundTrip],
      ["load", "mutate", "save", "reopen"],
      id,
    );
    // Native-file editors (deck: pptx, 2026-11-12) name the file format itself; structured editors keep a versioned id.
    assert.match(contract.projectSchema, /^[a-z0-9.-]+(?:(?:@|\.v)\d+)?$/i, id);
    assert.ok(["content", "native"].includes(contract.viewportOwnership), id);
    assert.ok(["shared", "native"].includes(contract.toolbarOwnership), id);
    assert.ok(["project", "native-callback"].includes(contract.persistence), id);
  }
});

test("all route components use the single typed adapter prop", () => {
  const routes = [
    "ImageRoute",
    "VideoTimelineRoute",
    "PdfRoute",
    "GridRoute",
    "RichDocRoute",
    "DeckRoute",
    "UnsupportedRoute",
  ];
  for (const route of routes) {
    const text = routeSource(route);
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
  // 抽屉查表（drawerById）已随左侧面板拆进 use-inline-advanced-panels，
  // 这三份合起来才是共享外壳。
  const shell =
    source("../src/shell/InlineAdvancedWorkbenchShell.tsx") +
    source("../src/shell/use-inline-advanced-panels.tsx") +
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

test("fixed workspace row owns download only; semantic actions live in the edit bar", () => {
  const contract = source("../src/shell/advanced-workbench-chrome.ts");
  const header = source("../src/shell/InlineAdvancedWorkbenchHeader.tsx");
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const actions = source("../src/shell/AdvancedWorkspaceActionBar.tsx");
  const editBar = source("../src/shell/plugin-chrome/EditBarDocumentSegment.tsx");
  const more = source("../src/shell/plugin-chrome/PluginMoreMenu.tsx");
  assert.match(contract, /interface AdvancedWorkbenchAction/);
  assert.match(contract, /variant\?: "default" \| "primary" \| "danger" \| "icon"/);
  assert.match(header, /<PluginGlobalRow/);
  // D1（2026-10-23）：顶栏一行；第二行页签行删除，下载进 `···` 的「下载 ▸」子菜单。
  assert.doesNotMatch(header, /<PluginPageRow/);
  assert.match(actions, /const actions = adapter\.actions \|\| \[\]/);
  assert.doesNotMatch(actions, /standaloneActions\.map\(\(action\)/);
  assert.match(actions, /adapter\.directDownload/);
  assert.match(contract, /group\?: "download"/);
  assert.match(actions, /action\.group === "download"/);
  assert.match(more, /data-workspace-download-launcher/);
  assert.match(more, /data-workspace-download-menu/);
  assert.match(actions, /data-advanced-workspace-actions/);
  assert.match(actions, /data-global-row-slot="more"/);
  assert.match(actions, /<PluginMoreMenu/);
  assert.doesNotMatch(actions, /data-global-row-slot="download"/);
  assert.match(shell, /EditBarDocumentSegment/);
  assert.match(shell, /action\.group !== "download"/);
  assert.match(editBar, /action\.panelId/);
  assert.match(editBar, /editBarDocumentTools/);
  assert.doesNotMatch(editBar, /<Button|<button/);
  assert.match(source("../src/shell/SelectionToolbarButtonControl.tsx"), /data-workspace-action-id/);
  assert.doesNotMatch(header, /absolute left-2 right-2 top-2/);
});

// Per-editor download/save rendering is exercised in leobay-export-menu.test.mjs.
// This contract only checks the offline generators; server formats come from capabilities.
test("RichDoc local targets are unique and source formats remain editable", () => {
  const targets=DOC_FAMILY_DOWNLOAD_FORMATS.richdoc.map(format=>format.extension);
  assert.deepEqual(targets,["docx","md","html","txt"]);
  assert.equal(new Set(targets).size,targets.length);
});

test("mutable native editors capture server working copies without a local recovery layer", () => {
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const saver = source("../src/shell/use-advanced-autosave.ts");
  assert.doesNotMatch(shell, /useAdvancedRecovery/);
  assert.match(saver, /WorkingCopySaver/);
  assert.match(saver, /source\.current\.recovery\?\.capture\(\)/);
  assert.doesNotMatch(saver, /indexedDB|debounceMs/);
  for (const route of [
    "DeckRoute",
    "GridRoute",
    "PdfRoute",
    "RichDocRoute",
    "VideoTimelineRoute",
  ]) {
    assert.match(routeSource(route), /recovery: \{/, route);
  }
  const image = source(
    "../src/shell/image-editor/editor-persistence.ts",
  );
  assert.doesNotMatch(image, /LOCAL_DRAFT_PREFIX/);
  assert.doesNotMatch(image, /saveLocalImageDraft/);
  assert.match(image, /createFabricImageWorkingCopy/);
});
