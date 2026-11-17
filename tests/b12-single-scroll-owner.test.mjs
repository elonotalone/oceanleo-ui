import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../src/", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("设置窗 pane 页面不再创建第二个滚动容器", async () => {
  for (const file of ["pages/ApiPage.tsx", "pages/PluginsPage.tsx", "pages/DevicesPage.tsx"]) {
    const text = await source(file);
    // Devices compares variant directly; the other panes use a local boolean.
    assert.match(text, /(?:pane|variant === "pane") \? "min-h-0"/);
    assert.doesNotMatch(text, /(?:pane|variant === "pane") \? "[^"]*overflow-y-auto/);
  }
});

test("SplitWorkspace 左栏共用 body 是唯一滚动者", async () => {
  const text = await source("shell/SplitWorkspace.tsx");
  assert.match(text, /const bodyClass[\s\S]*overflow-y-auto/);
  assert.match(text, /const bodyClass[\s\S]*min-h-0/);
});

test("PDF 原生页栏只在舞台内独立滚动，不占共享左栏", async () => {
  const rail = await source("shell/media-editors/PdfControls.tsx");
  assert.match(rail, /<nav[\s\S]*?data-pdf-page-rail[\s\S]*?overflow-y-auto/);
  for (const file of ["shell/advanced-routes/PdfRoute.tsx", "shell/media-editors/PdfWorkbench.tsx"]) {
    const text = await source(file);
    assert.match(text, /<PdfControls[\s\S]*?<PdfStage/);
    assert.match(text, /min-h-0/);
    assert.doesNotMatch(text, /leftPanel=\{[\s\S]{0,100}<PdfControls/);
  }
});
