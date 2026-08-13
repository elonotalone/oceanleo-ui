// ============================================================================
// W1 · 站内点「编辑」要真的打开编辑插件
// ----------------------------------------------------------------------------
// 操作员在 slide 站实拍：素材货架上点「编辑」重复跳到同一个页面。根因是货架素材
// **一律**深链到归属 app 的只读预览，包括归属就是当前 app 的那一档 —— `?app=<归属>`
// 指的正是用户此刻站着的页面，按钮点得动，什么都没发生。
//
// 改后一条判据两个分支：
//   · 归属 app ≠ 当前 app ⇒ 深链过去、落在预览（这是对的，一字未改）；
//   · 归属 app = 当前 app ⇒ 不深链，就地打开这个类型的编辑插件；
//     这一类打不开时，「编辑」这颗按钮**不出现**，而不是出现一颗点了原地打转的。
//
// 这份用例量的是那条判据本身的两个出口：`useMaterialDetailAppPlan().editRoute`
// （落点）与 `artifactActionMatrix().edit.visible`（可见性的唯一出口）。
// 端到端那一层在 `library-card-detail-action-parity.test.mjs`，那份文件被
// agent-io-guard 隔离（磁盘），本机跑不动，所以判据在这里独立钉一遍。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// `data:` 桩没有包作用域，裸名进不去；桩里要用 React 就得钉到安装位置。
const reactUrl = pathToFileURL(
  createRequire(import.meta.url).resolve("react"),
).href;

const uiStubUrl = dataModule(`export function useUI(){ return (zh) => zh; }`);
const libraryDataStubUrl = dataModule(`
  export function isDurableLibraryItem(item) {
    return Boolean(
      item?.artifactId &&
      item?.revisionId &&
      item?.artifact?.artifactId === item.artifactId &&
      item?.artifact?.revisionId === item.revisionId
    );
  }
`);
const contractStubUrl = dataModule(`
  export function isEnsureableTransient(value) {
    return Boolean(value?.idempotencyKey && value?.resultId);
  }
`);
const clientStubUrl = dataModule(`
  export function artifactDownloadEvidence() {
    return { visible: true, available: true, reason: "", purpose: "full", mode: "export" };
  }
  export async function prepareArtifactForAction(action, item) {
    return { ok: true, data: { ...item, preparedAction: action } };
  }
  export async function getArtifactDownload() {
    return { ok: false, error: "本用例不下载。" };
  }
  export async function setArtifactFavorite() {
    return { ok: false, error: "本用例不收藏。" };
  }
  export async function getCurrentArtifactItem() {
    return { ok: false, error: "本用例只看货架原行。" };
  }
`);
// 「哪一类打得开」的唯一判据。默认打得开；验「打不开就不出按钮」时翻这个开关。
globalThis.__editorCapabilityAvailable = true;
const routesStubUrl = dataModule(`
  export function editorCapabilityFor() {
    return globalThis.__editorCapabilityAvailable
      ? { available: true, unavailableReason: "", route: { type: "deck" } }
      : {
          available: false,
          unavailableReason:
            "此内容目前只有预览，没有通过 load → mutate → save → reopen 验证的编辑器。",
          route: { type: "none" },
        };
  }
`);
const deckActionStubUrl = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};
  export function deckHtmlEvidence() {
    return { visible: false, available: false, reason: "", sourceUrl: "" };
  }
  export function DeckHtmlActionButton() {
    return createElement("span", null);
  }
`);
const materialScopeStubUrl = dataModule(`
  export function libraryItemStoredAppAttributions(item) {
    const stored = item?.meta?.material_app_bindings;
    return Array.isArray(stored) ? stored : [];
  }
`);
globalThis.__previewHrefCalls = [];
const catalogControllerStubUrl = dataModule(`
  export function workspaceTemplatePreviewHref(appId, artifactId) {
    globalThis.__previewHrefCalls.push({ appId, artifactId });
    return "/workspace?app=" + appId + "&libraryItem=" + artifactId + "&libraryMode=preview";
  }
`);
const modelStubUrl = dataModule(`
  export function materialDeepLinkArtifactId(item) {
    return String(item?.artifactId || "").trim();
  }
`);

const { artifactActionMatrix } = await import(
  await compileModule("src/shell/ArtifactActions.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
    "./artifact-contract": contractStubUrl,
    "./artifact-client": clientStubUrl,
    "./library-data": libraryDataStubUrl,
    "./workbench-routes": routesStubUrl,
    "./DeckHtmlAction": deckActionStubUrl,
  })
);

const { useMaterialDetailAppPlan, MaterialOwningAppEdit } = await import(
  await compileModule("src/shell/library-detail-app-actions.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
    "./artifact-client": clientStubUrl,
    "./library-data": libraryDataStubUrl,
    "./material-library-scope": materialScopeStubUrl,
    "./site-catalog-controller": catalogControllerStubUrl,
    "./workspace-library-model": modelStubUrl,
  })
);

// ── 夹具 ────────────────────────────────────────────────────────────────────

function attribution(appId, label, position) {
  return {
    appId,
    siteKey: "ppt",
    position,
    label,
    origin: position === 0,
    role: position === 0 ? "owner" : "binding",
  };
}

/** 素材货架上的一条 deck：durable、可编辑、带归属。 */
function shelfItem(bindings) {
  const artifactId = "artifact-deck-1";
  const revisionId = "revision-1";
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    artifactId,
    revisionId,
    artifactType: "deck",
    title: "近岸观测网年度汇报",
    kind: "deck",
    siteId: "ppt",
    favorite: false,
    meta: {
      workspace_library_surface: "materials",
      material_app_bindings: bindings,
    },
    artifact: {
      artifactId,
      revisionId,
      artifactType: "deck",
      editorCapability: "deck-editor",
      sourceFormat: "oceanleo.deck.v1",
      access: {
        canRead: true,
        canPreview: true,
        canEdit: true,
        canFork: true,
        canInsert: false,
        canReplace: false,
        canFavorite: true,
        canExportSource: true,
      },
      integrity: { ok: true, reason: "" },
      renditions: {
        preview: { purpose: "preview", revisionId, url: "https://signed.test/p.png" },
        full: { purpose: "full", revisionId, url: "https://signed.test/f.pptx" },
      },
    },
  };
}

/** 这份素材在这个页面上的落点。SSR 就够：落点只用到 useMemo，不依赖 effect。 */
function planFor(item, { appId = "", packAppId = "", siteKey = "ppt" } = {}) {
  let captured = null;
  function Probe() {
    captured = useMaterialDetailAppPlan({
      entry: { id: item.key, title: item.title, libraryItem: item },
      selectionKey: item.key,
      siteKey,
      appId,
      packAppId,
      onStatus: () => {},
    });
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  return captured;
}

/** 归属 app 的那颗深链入口渲不渲得出来。 */
function deepLinkMarkup(plan, item) {
  return renderToStaticMarkup(
    React.createElement(MaterialOwningAppEdit, { plan, item }),
  );
}

function editStateFor(item, plan) {
  return artifactActionMatrix(item, {
    hidePreview: true,
    canOpenPreview: false,
    canOpenEdit: true,
    materialEditRoute: plan.editRoute,
  }).edit;
}

// ── ① 同 app + 这一类打得开 ⇒ 就地开插件 ────────────────────────────────────

test("素材归属就是当前 app 时，落点是就地编辑插件，不再深链回同一个页面", () => {
  globalThis.__editorCapabilityAvailable = true;
  globalThis.__previewHrefCalls = [];
  const item = shelfItem([attribution("ppt-studio", "幻灯片工作台", 0)]);
  const plan = planFor(item, { appId: "ppt-studio" });

  assert.equal(plan.editRoute, "in-place");
  assert.equal(plan.routeEditByApp, false, "深链回同一个页面就是原地打转");
  assert.equal(deepLinkMarkup(plan, item), "", "同 app 不许渲出深链入口");
  assert.deepEqual(
    globalThis.__previewHrefCalls,
    [],
    "同 app 连深链地址都不该去算",
  );

  const edit = editStateFor(item, plan);
  assert.equal(edit.visible, true, "这一类打得开，编辑必须在");
  assert.equal(edit.available, true);
  assert.equal(edit.reason, "");
});

test("素材包上下文指到当前 app 时同样就地开插件（包 = app，上下文自洽）", () => {
  globalThis.__editorCapabilityAvailable = true;
  const item = shelfItem([
    attribution("deck-maker", "演示制作", 0),
    attribution("ppt-studio", "幻灯片工作台", 1),
  ]);
  // 主归属是 deck-maker，但这张卡是在 ppt-studio 这个包里、在 ppt-studio 页面上
  // 被点开的：落点就是脚下这个 app，没有别处可去。
  const plan = planFor(item, { appId: "ppt-studio", packAppId: "ppt-studio" });
  assert.equal(plan.editApp.appId, "ppt-studio");
  assert.equal(plan.editRoute, "in-place");
  assert.equal(editStateFor(item, plan).visible, true);
});

// ── ② 同 app + 这一类打不开 ⇒ 一颗按钮都不出现 ──────────────────────────────

test("同 app 但这一类打不开时，编辑这颗按钮根本不出现", () => {
  globalThis.__editorCapabilityAvailable = false;
  globalThis.__previewHrefCalls = [];
  const item = shelfItem([attribution("ppt-studio", "幻灯片工作台", 0)]);
  const plan = planFor(item, { appId: "ppt-studio" });

  assert.equal(plan.editRoute, "in-place");
  assert.equal(deepLinkMarkup(plan, item), "");
  assert.deepEqual(globalThis.__previewHrefCalls, []);

  // 深链那颗原地打转，就地那颗按下去只吐一句技术理由。两颗都不出现：
  // 用户看不到入口，就没有需要被解释的失败。
  const edit = editStateFor(item, plan);
  assert.equal(edit.visible, false);
  assert.equal(edit.available, false);
  globalThis.__editorCapabilityAvailable = true;
});

// ── ③ 跨 app ⇒ 深链过去、落在预览，一字未改 ─────────────────────────────────

test("素材归属别的 app 时，仍然深链过去落在只读预览", () => {
  globalThis.__editorCapabilityAvailable = true;
  globalThis.__previewHrefCalls = [];
  const item = shelfItem([attribution("deck-maker", "演示制作", 0)]);
  const plan = planFor(item, { appId: "ppt-studio" });

  assert.equal(plan.editRoute, "deep-link");
  assert.equal(plan.routeEditByApp, true);
  assert.equal(plan.editApp.appId, "deck-maker");

  const markup = deepLinkMarkup(plan, item);
  assert.match(markup, /data-material-edit-app="deck-maker"/);
  assert.match(markup, /libraryMode=preview/);
  assert.deepEqual(globalThis.__previewHrefCalls.at(-1), {
    appId: "deck-maker",
    artifactId: item.artifactId,
  });

  // 归属自己出入口时，动作条上那颗不指名 app 的「编辑」不再出现：
  // 同一个浮层里不许有两个说法不一样的编辑入口。
  assert.equal(editStateFor(item, plan).visible, false);
});

test("页面本身没锚定任何 app 时（explore）照旧深链到归属 app", () => {
  globalThis.__editorCapabilityAvailable = true;
  const item = shelfItem([attribution("deck-maker", "演示制作", 0)]);
  const plan = planFor(item, { appId: "" });
  assert.equal(plan.editRoute, "deep-link");
  assert.match(deepLinkMarkup(plan, item), /data-material-edit-app="deck-maker"/);
});

// ── ④ 不是货架的条目 ⇒ 既有行为一字不变 ─────────────────────────────────────

test("我的库里的作品不受这条判据管：编辑照旧就地开，打不开就灰着说明理由", () => {
  globalThis.__editorCapabilityAvailable = true;
  const item = shelfItem([attribution("deck-maker", "演示制作", 0)]);
  delete item.meta.workspace_library_surface;
  const plan = planFor(item, { appId: "ppt-studio" });
  assert.equal(plan.editRoute, "none");
  assert.equal(deepLinkMarkup(plan, item), "");
  assert.equal(editStateFor(item, plan).visible, true);

  // 打不开时仍是「留在原地 + 写清为什么」——这一档没有原地打转的问题，
  // 消失掉反而让读者看不出少了什么。
  globalThis.__editorCapabilityAvailable = false;
  const blocked = editStateFor(item, planFor(item, { appId: "ppt-studio" }));
  assert.equal(blocked.visible, true);
  assert.equal(blocked.available, false);
  assert.match(blocked.reason, /没有通过 load → mutate → save → reopen 验证的编辑器/);
  globalThis.__editorCapabilityAvailable = true;
});
