import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(fabricRequire.resolve("jsdom"));
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const designCanvas = "/root/projects/design/packages/gallery-editor/src/editor/EditorCanvas.tsx";
const websiteExplorer = "/root/projects/website/front/packages/gallery-editor/src/WebsiteExplorerPanel.tsx";
const galleryGame = "/opt/cursor-workspaces/oceandino/plugin-gallery/components/GalleryGamePreviewHost.tsx";
const galleryHost = "/opt/cursor-workspaces/oceandino/plugin-gallery/components/PluginHost.tsx";
const galleryWorkbench = "/opt/cursor-workspaces/oceandino/plugin-gallery/components/PluginWorkbench.tsx";
const galleryCss = "/opt/cursor-workspaces/oceandino/plugin-gallery/styles/gallery-host.css";
const websiteCode = "/root/projects/website/front/packages/gallery-editor/src/WebsiteCodeStage.tsx";
const advancedPages = new URL("../src/shell/AdvancedFeaturePages.tsx", import.meta.url);
const workbenchLoading = new URL("../src/shell/advanced-routes/WorkbenchRouteLoading.tsx", import.meta.url);
const gallerySeed = "/opt/cursor-workspaces/oceandino/plugin-gallery/tests/i18n/seed-gaps.json";

async function source(path) {
  return readFile(path, "utf8");
}

function wheelableColumn({ rows = 40, height = 645 } = {}) {
  const dom = new JSDOM("<!doctype html><body></body>", {
    pretendToBeVisual: true,
  });
  const { document, WheelEvent } = dom.window;
  const aside = document.createElement("aside");
  const header = document.createElement("div");
  const scrollOwner = document.createElement("div");
  scrollOwner.dataset.scrollOwner = "left-panel-body";
  const rowList = document.createElement("div");
  rowList.dataset.rowCount = String(rows);
  rowList.style.height = `${height}px`;
  for (let index = 0; index < rows; index += 1) {
    const row = document.createElement("button");
    row.textContent = `真实列表项 ${index + 1}`;
    rowList.append(row);
  }
  scrollOwner.append(rowList);
  aside.append(header, scrollOwner);
  document.body.append(aside);

  let scrollTop = 0;
  Object.defineProperties(scrollOwner, {
    clientHeight: { configurable: true, value: height },
    scrollHeight: { configurable: true, value: rows * 32 },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value) => {
        scrollTop = Math.max(0, Math.min(rows * 32 - height, Number(value)));
      },
    },
  });
  scrollOwner.addEventListener("wheel", (event) => {
    scrollOwner.scrollTop += event.deltaY;
  });
  scrollOwner.dispatchEvent(
    new WheelEvent("wheel", { bubbles: true, deltaY: 600, deltaMode: 0 }),
  );
  return { dom, aside, scrollOwner, rowList };
}

test("真实 1440×700 各编辑插件左栏长列表收到 wheel 后只有 body 改变 scrollTop", () => {
  for (const [surface, rows] of [
    ["design", 40],
    ["website-source-tree", 80],
    ["plugin-gallery", 52],
  ]) {
    const { aside, scrollOwner } = wheelableColumn({ rows });
    assert.equal(
      aside.querySelectorAll("[data-scroll-owner]").length,
      1,
      `${surface} 应只有一个滚动者`,
    );
    assert.equal(scrollOwner.scrollTop, 600, `${surface} wheel 未推进列表`);
    assert.equal(aside.scrollTop, 0, `${surface} 外层不应抢 wheel`);
  }
});

test("插件加载态是舞台内 spinner + 短文案，不保留通栏旧文案", async () => {
  const design = await source(designCanvas);
  const game = await source(galleryGame);
  const host = await source(galleryHost);
  const workbench = await source(galleryWorkbench);
  const css = await source(galleryCss);
  const website = await source(websiteCode);
  const advanced = await source(advancedPages);
  const routeLoading = await source(workbenchLoading);
  const seed = JSON.parse(await source(gallerySeed));
  assert.match(design, /data-editor-loading/);
  assert.match(design, /animate-spin/);
  assert.doesNotMatch(design, /加载编辑器中/);
  assert.match(game, /gallery-loading-indicator/);
  assert.match(game, />正在打开</);
  assert.doesNotMatch(game, /正在打开游戏预览…/);
  assert.doesNotMatch(host, /正在打开编辑器…/);
  assert.doesNotMatch(workbench, /正在打开编辑器…|正在打开文档…/);
  assert.match(workbench, /gallery-loading-indicator/);
  assert.match(website, /animate-spin/);
  assert.doesNotMatch(website, /正在打开编辑器…/);
  assert.doesNotMatch(advanced, /编辑器已打开|正在打开编辑器|正在加载编辑器/);
  assert.doesNotMatch(routeLoading, /正在加载编辑器|正在打开编辑器/);
  assert.doesNotMatch(css, /\.gallery-banner/);
  assert.equal(
    seed.entries.some((entry) => entry.text === "正在打开编辑器…"),
    false,
  );
});

test("网站资源树以填满外壳的单一列表滚动者承接真实长列表", async () => {
  const website = await source(websiteExplorer);
  assert.match(website, /className="flex h-full min-h-0 flex-col"/);
  assert.match(website, /className="min-h-0 flex-1 overflow-auto py-1"/);
  const { scrollOwner, rowList } = wheelableColumn({ rows: 80 });
  assert.equal(rowList.dataset.rowCount, "80");
  assert.ok(scrollOwner.scrollHeight > scrollOwner.clientHeight);
  assert.ok(scrollOwner.scrollTop > 0);
});
