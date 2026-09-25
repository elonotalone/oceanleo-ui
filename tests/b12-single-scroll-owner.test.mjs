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
    assert.match(text, /pane \? "min-h-0"/);
    assert.doesNotMatch(text, /pane \? "[^"]*overflow-y-auto/);
  }
});

test("SplitWorkspace 左栏共用 body 是唯一滚动者", async () => {
  const text = await source("shell/SplitWorkspace.tsx");
  assert.match(text, /const bodyClass[\s\S]*overflow-y-auto/);
  assert.match(text, /const bodyClass[\s\S]*min-h-0/);
});

test("各编辑器同位置左栏面板不再自建滚动、也不再撑满父栏", async () => {
  const files = [
    ["shell/doc-editors/DeckControls.tsx", "DeckDesignPanel"],
    ["shell/doc-editors/RichDocControls.tsx", "RichDocControls"],
    ["shell/image-editor/FabricImageControls.tsx", "FabricImageControls"],
    ["shell/image-editor/FabricImageControls.tsx", "FabricImageFilterPanel"],
    ["shell/chart-editor/ChartControls.tsx", "ChartControls"],
    ["shell/media-editors/PdfControls.tsx", "PdfControls"],
    ["shell/media-editors/Model3DControls.tsx", "Model3DControls"],
    ["shell/media-editors/AudioWorkbenchView.tsx", "AudioControls"],
    ["shell/video-editor/VideoTimelineControls.tsx", "VideoTimelineControls"],
  ];
  for (const [file, name] of files) {
    const text = await source(file);
    const start = text.indexOf(`export function ${name}`);
    assert.ok(start >= 0, `${file} 找不到 export function ${name}`);
    const slice = text.slice(start, start + 8000);
    const match = slice.match(/return \(\s*<(?:div|fieldset)([^>]*)>/);
    assert.ok(match, `${file} ${name} 的根节点不是 div/fieldset`);
    const attrs = match[1];
    assert.doesNotMatch(
      attrs,
      /min-h-full/,
      `${file} ${name} 根节点仍写 min-h-full：左栏滚不动`,
    );
    assert.doesNotMatch(
      attrs,
      /overflow-y-auto/,
      `${file} ${name} 根节点仍自建滚动：和左栏抢滚轮`,
    );
  }
});

