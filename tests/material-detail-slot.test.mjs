// W1 判据：**卡片是图，详情是真东西**。
//
// 这份用例钉两件事，缺一条这活就白干：
//   1. 官方模板目录行产出的**卡片**条目一个字节没变（`kind: "image"` + 封面图）。
//      当初「游戏卡片一片空白」就是这么解决的，改回去即回归。
//   2. **详情**不再是那张封面图：目录行先解析成 durable 投影，再按 artifactType
//      分派——game 去「开玩」落点，deck 去 PPT 翻页，website 去沙箱页面预览；
//      解析不到本体时给中文人话，不许继续假装它是一张图。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  normalizeTemplateMaterial,
  templateMaterialLibraryItem,
} from "../src/shell/material-library-template-source.ts";

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
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://game.oceanleo.com/explore",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStubUrl = dataModule(`
  export function useUI() { return (value) => value; }
`);
// 唯一需要替身的协作者：这条是网络。返回什么由 globalThis.__slotResponse 决定。
const artifactClientStubUrl = dataModule(`
  export async function getCurrentArtifactItem(artifactId) {
    globalThis.__slotCalls.push(artifactId);
    return globalThis.__slotResponse;
  }
`);

const slotUrl = await compileModule("src/shell/material-detail-slot.tsx", {
  react: reactUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./artifact-client": artifactClientStubUrl,
});
const {
  GamePlayDetail,
  MaterialDetailUnavailable,
  gamePlayEmbedHref,
  isTemplateMaterialDetailItem,
  resetMaterialDetailCache,
  useMaterialDetailTarget,
} = await import(slotUrl);

function catalogRow(overrides = {}) {
  const material = normalizeTemplateMaterial({
    id: "game-match3-1",
    title: "霓虹潮汐 · 三消消除",
    summary: "七列棋盘的连锁消除",
    tags: ["三消"],
    previewUrl: "tpl-material/game-match3-1",
    artifactId: "ea5edb78-0af0-4307-8e59-af5ba169bfc7",
    artifactType: "game",
    siteKey: "game",
    appId: "match3",
    width: 640,
    height: 360,
    ...overrides,
  });
  assert.ok(material, "fixture 没通过目录行校验");
  return templateMaterialLibraryItem(material);
}

/** 服务端权威投影的最小可信形状：durable + 可见（`artifactIsVisible` 的六个条件）。 */
function durableItem(artifactType, kind) {
  const artifactId = "ea5edb78-0af0-4307-8e59-af5ba169bfc7";
  const revisionId = "4fc187a0-7b35-4784-8aa4-8b50bdc3c296";
  const artifact = {
    schema: "oceanleo.artifact.v1",
    artifactId,
    revisionId,
    artifactType,
    access: { canRead: true, canPreview: true, canExportSource: true },
    integrity: { ok: true },
    provenance: {
      id: "prov-1",
      sourceKind: "platform",
      licenseCode: "official-template",
    },
    renditions: {},
  };
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    title: "霓虹潮汐 · 三消消除",
    kind,
    siteId: "game",
    favorite: false,
    meta: {},
    artifactId,
    revisionId,
    artifactType,
    artifact,
    previewUrl: "https://api.oceanleo.test/preview.png",
    thumbUrl: "https://api.oceanleo.test/thumb.png",
  };
}

async function mount(element) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function Probe({ item, onTarget }) {
  const target = useMaterialDetailTarget(item);
  onTarget(target);
  return React.createElement("span", null, target.status);
}

test("卡片仍然是图：目录行产出的条目一个字节没变", () => {
  for (const artifactType of ["game", "deck", "website"]) {
    const item = catalogRow({ artifactType });
    assert.equal(
      item.kind,
      "image",
      `${artifactType} 卡片被改成了非图片 —— 这是既定产品决定，改了就作废`,
    );
    assert.ok(item.thumbUrl, "卡片没有封面图就会退回一片空白");
    assert.equal(item.url, item.previewUrl);
    // 类型只存在于 meta，不提升到条目上（否则 isDurableLibraryItem 会误判）。
    assert.equal(item.meta.template_material_artifact_type, artifactType);
    assert.equal(item.artifactType, undefined);
  }
});

test("只有官方模板目录行进详情解析，其余条目一步取数都不发", () => {
  assert.equal(isTemplateMaterialDetailItem(catalogRow()), true);
  assert.equal(isTemplateMaterialDetailItem(durableItem("game", "game")), false);
  assert.equal(
    isTemplateMaterialDetailItem({
      key: "creation:1",
      source: "creation",
      id: "1",
      title: "随手上传",
      kind: "image",
      siteId: "image",
      favorite: false,
      meta: {},
    }),
    false,
  );
});

test("详情解析成功后交出 durable 投影（游戏那条）", async () => {
  resetMaterialDetailCache();
  globalThis.__slotCalls = [];
  globalThis.__slotResponse = {
    ok: true,
    data: durableItem("game", "game"),
    status: 200,
  };
  const seen = [];
  const mounted = await mount(
    React.createElement(Probe, {
      item: catalogRow(),
      onTarget: (target) => seen.push(target),
    }),
  );
  try {
    const last = seen[seen.length - 1];
    assert.equal(last.status, "resolved");
    assert.equal(last.item.artifactType, "game");
    assert.equal(last.item.kind, "game");
    assert.deepEqual(globalThis.__slotCalls, [
      "ea5edb78-0af0-4307-8e59-af5ba169bfc7",
    ]);
    // 目录行自己的封面图不再是详情的内容来源。
    assert.notEqual(last.item.url, catalogRow().url);
  } finally {
    await mounted.unmount();
  }
});

test("读不到本体时给中文人话，不许继续假装它是一张图", async () => {
  resetMaterialDetailCache();
  globalThis.__slotCalls = [];
  globalThis.__slotResponse = {
    ok: false,
    error: "Failed to fetch",
    code: "unauthorized",
    status: 401,
  };
  const seen = [];
  const mounted = await mount(
    React.createElement(Probe, {
      item: catalogRow(),
      onTarget: (target) => seen.push(target),
    }),
  );
  try {
    const last = seen[seen.length - 1];
    assert.equal(last.status, "unavailable");
    assert.equal(last.needsSignIn, true);
    assert.equal(last.message, "登录后可预览完整内容。");
    // 浏览器/服务端英文原文不许穿透到用户面。
    assert.doesNotMatch(last.message, /[A-Za-z]{4,}/);
  } finally {
    await mounted.unmount();
  }
});

test("失败面把封面图说成封面图，并给得出重试", async () => {
  const mounted = await mount(
    React.createElement(MaterialDetailUnavailable, {
      item: catalogRow(),
      message: "暂时打不开这份素材的完整内容，请稍后重试。",
      needsSignIn: false,
      onRetry: () => {},
    }),
  );
  try {
    const text = mounted.container.textContent;
    assert.match(text, /以上只是这份素材的封面图/);
    assert.match(text, /暂时打不开这份素材的完整内容/);
    assert.match(text, /重新加载/);
  } finally {
    await mounted.unmount();
  }
});

test("游戏详情落到「开玩」通路，不落到图片查看器", async () => {
  const mounted = await mount(
    React.createElement(GamePlayDetail, { item: durableItem("game", "game") }),
  );
  try {
    const anchor = mounted.container.querySelector("a");
    assert.ok(anchor, "游戏详情必须给出可玩入口");
    assert.equal(anchor.textContent, "开始游玩");
    assert.equal(
      anchor.getAttribute("href"),
      "/play/artifact/ea5edb78-0af0-4307-8e59-af5ba169bfc7?revision=4fc187a0-7b35-4784-8aa4-8b50bdc3c296",
    );
  } finally {
    await mounted.unmount();
  }
});

// V1-2 改后验收在生产站实拍到的残留（`V1-2-verdict.md` §6 R3）：三类里只剩游戏详情
// 那颗「全屏」仍然亮着，而那一屏唯一能放大的是 640×360 的封面图——点下去还是
// 「把封面放大」，正是操作员点名的那一幕。真东西在隔离域的播放页上，不在这一屏。
test("游戏详情的封面不算可放大内容：全屏不许为了放大一张封面而亮", async () => {
  const mounted = await mount(
    React.createElement(GamePlayDetail, { item: durableItem("game", "game") }),
  );
  try {
    const cover = mounted.container.querySelector("img");
    assert.ok(cover, "这一屏确实摆着封面图，判据不是被架空的");
    assert.ok(
      cover.closest("[data-fullscreen-exempt]"),
      "封面图必须落在 data-fullscreen-exempt 子树里，动作条的 DOM 探针才不会把它算成可放大内容",
    );
  } finally {
    await mounted.unmount();
  }
});

test("算不出可玩落点就如实说，不假装能玩", async () => {
  const orphan = durableItem("game", "game");
  orphan.artifact.integrity = { ok: false };
  const mounted = await mount(
    React.createElement(GamePlayDetail, { item: orphan }),
  );
  try {
    assert.equal(mounted.container.querySelector("a"), null);
    assert.match(mounted.container.textContent, /暂时算不出可玩地址/);
  } finally {
    await mounted.unmount();
  }
});

test("就地内嵌只认 game 站的绝对地址，其余一律不嵌", () => {
  const embed = (value) =>
    gamePlayEmbedHref({ ...durableItem("game", "game"), meta: { play_embed_href: value } });
  assert.equal(
    embed("https://game.oceanleo.com/play/artifact/abc"),
    "https://game.oceanleo.com/play/artifact/abc",
  );
  // 根相对路径在其余 35 个站上指向本站自己，嵌进去只会 404。
  assert.equal(embed("/play/artifact/abc"), "");
  assert.equal(embed("https://game.oceanleo.app/play/artifact/abc"), "");
  assert.equal(embed("https://evil.test/play/artifact/abc"), "");
  assert.equal(embed("javascript:alert(1)"), "");
  assert.equal(embed(undefined), "");
});

// ── 分派本身（源码判据：运行时挂整棵查看器太贵，形状钉在这里） ──────────────
const viewerSource = readFileSync(
  new URL("../src/shell/library-viewers.tsx", import.meta.url),
  "utf8",
);

test("详情入口先过插槽，再进按 kind 的分派", () => {
  assert.match(viewerSource, /from "\.\/material-detail-slot"/);
  assert.match(viewerSource, /<LibraryItemDetailTarget item=\{item\}/);
  assert.match(viewerSource, /useMaterialDetailTarget\(item\)/);
  assert.match(viewerSource, /<MaterialDetailUnavailable/);
});

test("game 分支存在，且排在 image 兜底之前", () => {
  const gameBranch = viewerSource.indexOf('resolvedItem.kind === "game"');
  const imageBranch = viewerSource.indexOf('resolvedItem.kind === "image"');
  assert.ok(gameBranch > 0, "没有 game 分支，游戏详情会掉进兜底失败页");
  assert.ok(imageBranch > 0);
  assert.ok(
    gameBranch < imageBranch,
    "game 必须在 image 之前分派，否则游戏又变回一张图",
  );
  assert.match(viewerSource, /<GamePlayDetail item=\{resolvedItem\}/);
});
