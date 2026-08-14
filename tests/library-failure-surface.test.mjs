// ============================================================================
// 失败面与操作入口（explore 就地预览 · W4）
// ----------------------------------------------------------------------------
// 守三件在 2026-08-06 亲手复现过的事（读数见
// docs/work-logs/2026-08/explore-inplace-preview/signals/W4-journal.md）：
//
//   ① 浏览器对任何 fetch 传输层失败都抛 `TypeError: Failed to fetch`（拒连 / DNS /
//      CORS 一字不差）。那句英文过去被 `artifact-client` 原样透传，最后摆在用户脸上。
//   ② 那一次失败会把详情里的「下载」与「收藏」**整个抹掉**——不是禁用，是消失，
//      而且页面上没有任何重试入口。
//   ③ 「全屏」的可见性只看宿主传没传回调，于是对任何素材恒亮，点了只是把整个详情
//      面板（含工具条）交给原生全屏。
//
// 另外守一条同源的独立性：过去整排按钮共用一个 `pending`，「下载」在跑的时候
// 「收藏」是死的。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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
  url: "https://image.oceanleo.com/workspace",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  MutationObserver: window.MutationObserver,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let fullscreenElement = null;
Object.defineProperty(document, "fullscreenElement", {
  configurable: true,
  get: () => fullscreenElement,
});
Object.defineProperty(document, "exitFullscreen", {
  configurable: true,
  value: async () => {
    fullscreenElement = null;
  },
});
Object.defineProperty(window.HTMLElement.prototype, "requestFullscreen", {
  configurable: true,
  value: async function requestFullscreen() {
    fullscreenElement = this;
  },
});

const reactUrl = pathToFileURL(require.resolve("react")).href;

// ── ① 传输层失败：真 artifact-client + 浏览器实测的异常形状 ────────────────────

test("浏览器的 Failed to fetch 不许透传给用户，原文只进 diagnostic", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    // Chromium 实测：拒连 / DNS 失败 / CORS 被拦三种成因的异常一字不差都是这一句。
    throw new TypeError("Failed to fetch");
  };
  try {
    const client = await import(
      await compileModule("src/shell/artifact-client.ts", {
        "../lib/auth/client": dataModule(
          `export async function accessToken(){ return "token"; }`,
        ),
        "../lib/auth/config": dataModule(
          `export const GATEWAY_BASE = "https://api.oceanleo.com";`,
        ),
      })
    );
    const result = await client.getCurrentArtifactItem("artifact-1");
    assert.equal(result.ok, false);
    assert.equal(result.code, "network-error");
    assert.doesNotMatch(
      result.error || "",
      /Failed to fetch|TypeError/,
      "用户看到的那句话里不许有浏览器英文原文",
    );
    assert.match(result.error || "", /连不上素材服务/);
    assert.match(result.error || "", /重试/, "失败文案必须说清下一步");
    assert.match(
      result.diagnostic || "",
      /TypeError: Failed to fetch/,
      "技术原文要留给控制台，不许丢",
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("HTTP 失败在响应体没有 message 时也说人话，不摆 HTTP 404", async () => {
  const previousFetch = globalThis.fetch;
  const statuses = [401, 403, 404, 429, 500];
  const seen = [];
  try {
    for (const status of statuses) {
      globalThis.fetch = async () => ({
        ok: false,
        status,
        json: async () => ({}),
      });
      const client = await import(
        await compileModule("src/shell/artifact-client.ts", {
          "../lib/auth/client": dataModule(
            `export async function accessToken(){ return "token"; }`,
          ),
          "../lib/auth/config": dataModule(
            `export const GATEWAY_BASE = "https://api.oceanleo.com";`,
          ),
        })
      );
      const result = await client.getCurrentArtifactItem("artifact-1");
      seen.push(result.error || "");
      assert.doesNotMatch(
        result.error || "",
        /^HTTP \d+$/,
        `HTTP ${status} 不该原样摆给用户`,
      );
      assert.match(result.error || "", /[\u4e00-\u9fa5]/, `HTTP ${status}`);
    }
    assert.equal(new Set(seen).size, statuses.length, "每种成因各说各的");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("网关自己那句英文 message 也不许摆给用户", async () => {
  // 2026-08-06 curl 实测的真实错误体：网关**给得出** message，而那句 message 是
  // 英文技术原文。上一轮只换掉了「给不出 message」时的兜底，于是这一条照旧漏出去。
  const bodies = [
    {
      status: 404,
      body: {
        code: "not-found",
        message: "invalid artifact identity",
        details: {},
        requestId: "9c53c4b9",
      },
      expect: /已经不在了/,
    },
    {
      status: 401,
      body: { code: "unauthorized", message: "missing bearer token" },
      expect: /登录/,
    },
    // 服务端如果说的是人话，就照用——这一层不是要盖掉服务端，是要挡技术原文。
    {
      status: 409,
      body: { message: "这份素材刚被别人改过，请刷新后再试。" },
      expect: /刚被别人改过/,
    },
  ];
  const previousFetch = globalThis.fetch;
  try {
    for (const { status, body, expect } of bodies) {
      globalThis.fetch = async () => ({
        ok: false,
        status,
        json: async () => body,
      });
      const client = await import(
        await compileModule("src/shell/artifact-client.ts", {
          "../lib/auth/client": dataModule(
            `export async function accessToken(){ return "token"; }`,
          ),
          "../lib/auth/config": dataModule(
            `export const GATEWAY_BASE = "https://api.oceanleo.com";`,
          ),
        })
      );
      const result = await client.getCurrentArtifactItem("artifact-1");
      assert.equal(result.ok, false);
      assert.match(result.error || "", expect, `HTTP ${status} 的文案`);
      assert.doesNotMatch(
        result.error || "",
        /invalid artifact identity|missing bearer token/,
        `HTTP ${status}：网关英文原文不许出现在用户面前`,
      );
      if (!/[\u4e00-\u9fa5]/.test(String(body.message))) {
        assert.match(
          result.diagnostic || "",
          new RegExp(String(body.message)),
          `HTTP ${status}：原文要留给控制台，不许丢`,
        );
      }
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

// ── ②③ 详情动作条 ────────────────────────────────────────────────────────────

const uiStubUrl = dataModule(`
  export function useUI() { return (value) => value; }
`);
const contractStubUrl = dataModule(`
  export function isEnsureableTransient(value) {
    return Boolean(value?.idempotencyKey && value?.resultId);
  }
`);
const libraryDataStubUrl = dataModule(`
  export function isDurableLibraryItem(item) {
    return Boolean(
      item?.artifactId &&
      item?.revisionId &&
      item?.artifactType &&
      item?.artifact?.artifactId === item.artifactId &&
      item?.artifact?.revisionId === item.revisionId
    );
  }
  // 动作条要问「这一行是不是官方模板目录行」——「查看」不欠耐久身份。判据与
  // library-data 同源，替身只是把同一句话说一遍。
  export function templateMaterialArtifactId(item) {
    const id = item?.meta?.template_material_id;
    if (typeof id !== "string" || !id.trim()) return "";
    const artifactId = item?.meta?.template_material_artifact_id;
    return typeof artifactId === "string" ? artifactId.trim() : "";
  }
  export function isTemplateMaterialDetailItem(item) {
    return Boolean(templateMaterialArtifactId(item)) && !isDurableLibraryItem(item);
  }
`);
/**
 * 网络那几条换成替身。**「异常 → 给人看的一句话」不在这份替身里**：它住在
 * `src/shell/human-error-message.ts`，没有依赖也就没人给它做替身，编译台会自动
 * 解析成真件——这一层正是「不许把英文技术原文摆给用户」的判据落点，抄一份到
 * 替身里等于自己考自己。
 */
const realClientUrl = await compileModule("src/shell/artifact-client.ts", {
  "../lib/auth/client": dataModule(
    `export async function accessToken(){ return "token"; }`,
  ),
  "../lib/auth/config": dataModule(
    `export const GATEWAY_BASE = "https://api.oceanleo.com";`,
  ),
});
const clientStubUrl = dataModule(`
  export function artifactDownloadEvidence(item) {
    const artifact = item?.artifact;
    const visible = Boolean(
      item?.artifactId &&
      item?.revisionId &&
      artifact?.artifactId === item.artifactId &&
      artifact?.revisionId === item.revisionId &&
      artifact?.access?.canRead
    );
    const rendition =
      artifact?.renditions?.source ||
      artifact?.renditions?.full ||
      artifact?.renditions?.preview;
    const available = Boolean(visible && artifact?.integrity?.ok && rendition);
    return {
      visible,
      available,
      reason: available ? "" : "当前 revision 没有可下载 rendition。",
      purpose: rendition?.purpose || null,
      mode: "export",
    };
  }
  export async function prepareArtifactForAction(action, item) {
    return { ok: true, data: { ...item, preparedAction: action } };
  }
  export async function getArtifactDownload(item) {
    if (globalThis.__holdDownload) {
      await new Promise((done) => { globalThis.__releaseDownload = done; });
    }
    return {
      ok: true,
      data: {
        artifactId: item.artifactId,
        revisionId: item.revisionId,
        url: "https://signed.test/download",
        filename: "artifact.png",
        mediaType: "image/png",
      },
    };
  }
  export async function setArtifactFavorite(item, favorite) {
    return { ok: true, data: { ...item, favorite } };
  }
  export async function getCurrentArtifactItem(artifactId) {
    globalThis.__identityReads.push(artifactId);
    const resolved = globalThis.__identityResolutions[artifactId];
    return resolved
      ? { ok: true, data: resolved }
      : { ok: false, error: "连不上素材服务，请检查网络后重试。", status: 0 };
  }
`);
const routesStubUrl = dataModule(`
  export function editorCapabilityFor() {
    return { available: true, unavailableReason: "", route: { type: "image" } };
  }
`);
const layoutStubUrl = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};
  export function LibraryToolbar(props) {
    return createElement("div", null, props.actions);
  }
  export function LibraryChips() { return null; }
`);
const modelStubUrl = dataModule(`
  export const WORKSPACE_KIND_LABELS = { image: "图片", file: "文件" };
  export function filterWorkspaceLibraryEntries(entries) { return entries; }
  export function visibleWorkspaceLibraryCategories(categories) {
    return { visibleCategories: categories, overflowCategoryCount: 0 };
  }
  export function workspaceEntryFromLibraryItem(item) {
    return { id: item.key, title: item.title, libraryItem: item };
  }
  export function workspaceLibraryCategories() {
    return [{ id: "all", label: "全部" }];
  }
  export function materialDeepLinkArtifactId(item) {
    return (
      String(item?.artifactId || "").trim() ||
      String(item?.meta?.template_material_artifact_id || "").trim()
    );
  }
`);
const materialScopeStubUrl = dataModule(`
  export function libraryItemStoredAppAttributions(item) {
    const stored = item?.meta?.material_app_bindings;
    return Array.isArray(stored) ? stored : [];
  }
`);
const catalogControllerStubUrl = dataModule(`
  export function workspaceTemplatePreviewHref(appId, artifactId) {
    return "/workspace?app=" + appId + "&item=" + artifactId;
  }
`);
// 替身要复刻真件的关键差别：有本体的条目渲染真图，没有的只落一个空态图标。
// 「全屏只在真有可放大内容时出现」这条判据就是看这个差别。
const viewStubUrl = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};
  export function WorkspaceCard(props) {
    return createElement(
      "button",
      { type: "button", "data-library-card": props.entry.title, onClick: props.onOpen },
      props.entry.title,
    );
  }
  export const WorkspaceListRow = WorkspaceCard;
  export function WorkspaceLibraryEmpty() { return null; }
  export function WorkspaceLibraryEntryViewer(props) {
    const source =
      props.entry.libraryItem?.url ||
      props.entry.libraryItem?.previewUrl ||
      props.entry.externalUrl ||
      "";
    // 标题带 "exempt" 的复刻「这张图不是素材本身」那一档：游戏详情摆的是封面加
    // 一颗「开始游玩」，真东西在隔离域的播放页上，放大封面没有意义。
    const image = source
      ? createElement("img", { src: source, alt: props.entry.title })
      : createElement("svg", { "data-empty-icon": "true" });
    return createElement(
      "div",
      { "data-library-viewer": props.entry.title },
      props.entry.title.includes("exempt")
        ? createElement("div", { "data-fullscreen-exempt": "" }, image)
        : image,
    );
  }
`);
const actionModuleUrl = await compileModule("src/shell/ArtifactActions.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "./artifact-contract": contractStubUrl,
  "./artifact-client": clientStubUrl,
  "./library-data": libraryDataStubUrl,
  "./workbench-routes": routesStubUrl,
});
const detailAppActionsUrl = await compileModule(
  "src/shell/library-detail-app-actions.tsx",
  {
    "../i18n/ui/useUI": uiStubUrl,
    "./artifact-client": clientStubUrl,
    "./library-data": libraryDataStubUrl,
    "./material-library-scope": materialScopeStubUrl,
    "./site-catalog-controller": catalogControllerStubUrl,
    "./workspace-library-model": modelStubUrl,
  },
);
const { WorkspaceLibrary } = await import(
  await compileModule("src/shell/WorkspaceLibrary.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
    "./artifact-client": clientStubUrl,
    "./library-data": libraryDataStubUrl,
    "./LibraryLayout": layoutStubUrl,
    "./ArtifactActions": actionModuleUrl,
    "./library-detail-app-actions": detailAppActionsUrl,
    "./workspace-library-model": modelStubUrl,
    "./workspace-library-view": viewStubUrl,
  })
);

function durableItem(title, overrides = {}) {
  const artifactId = `artifact-${title}`;
  const revisionId = "revision-1";
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    artifactId,
    revisionId,
    artifactType: "single_file_image",
    title,
    kind: "image",
    siteId: "image",
    url: `https://signed.test/${artifactId}.png`,
    previewUrl: `https://signed.test/${artifactId}.png`,
    favorite: false,
    meta: {},
    artifact: {
      artifactId,
      revisionId,
      artifactType: "single_file_image",
      editorCapability: "image-editor",
      access: {
        canRead: true,
        canPreview: true,
        canEdit: true,
        canFork: false,
        canInsert: true,
        canReplace: true,
        canFavorite: true,
        canExportSource: true,
      },
      integrity: { ok: true, reason: "" },
      renditions: {
        preview: {
          purpose: "preview",
          revisionId,
          url: `https://signed.test/${artifactId}.png`,
        },
        source: {
          purpose: "source",
          revisionId,
          url: `https://signed.test/${artifactId}-source.png`,
        },
      },
    },
    ...overrides,
  };
}

/** 货架上的官方模板目录行：没有 revision 身份，下载与收藏都要先取一次当前版本。 */
function catalogRow(title, artifactId) {
  return {
    key: `template-material:${title}`,
    source: "artifact",
    id: `template-material:${title}`,
    title,
    kind: "image",
    siteId: "game",
    url: `https://asset.oceanleo.com/tpl-material/${title}`,
    previewUrl: `https://asset.oceanleo.com/tpl-material/${title}`,
    favorite: false,
    meta: {
      workspace_library_surface: "materials",
      template_material_id: title,
      template_material_site_key: "game",
      template_material_app_id: "game-studio",
      template_material_artifact_id: artifactId,
    },
  };
}

function entryFor(item) {
  return {
    id: item.key,
    title: item.title,
    kind: item.kind,
    libraryItem: item,
    externalUrl: item.url,
  };
}

async function createMounted(props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(WorkspaceLibrary, props));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function click(target) {
  assert.ok(target, "按钮不存在");
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

async function settle() {
  await act(async () => {
    await new Promise((done) => window.setTimeout(done, 0));
  });
}

function action(container, label) {
  return [...container.querySelectorAll("button, a")].find(
    (node) => node.textContent.trim() === label,
  );
}

async function openDetail(mounted, item) {
  await click(
    mounted.container.querySelector(`[data-library-card="${item.title}"]`),
  );
  await settle();
}

test("取当前版本失败时下载与收藏留在原地并说清原因，重试一次就回来", async () => {
  globalThis.__identityReads = [];
  globalThis.__identityResolutions = {};
  const durable = durableItem("Resolvable");
  const row = catalogRow("Space runner", durable.artifactId);
  const mounted = await createMounted({
    entries: [entryFor(row)],
    siteId: "game",
    appId: "game-studio",
    onOpenItem: () => {},
  });
  try {
    await openDetail(mounted, row);

    // 改前：两颗按钮整个消失，页面上没有任何出口。
    const download = action(mounted.container, "下载");
    const favorite = action(mounted.container, "收藏");
    assert.ok(download, "下载不许因为一次取数失败就消失");
    assert.ok(favorite, "收藏不许因为一次取数失败就消失");
    assert.equal(download.disabled, true);
    assert.equal(favorite.disabled, true);
    assert.match(download.getAttribute("title") || "", /没取到.*当前版本/);
    assert.match(favorite.getAttribute("title") || "", /没取到.*当前版本/);

    // 失败横幅说的是人话，不是浏览器英文原文。
    const banner = mounted.container.textContent || "";
    assert.doesNotMatch(banner, /Failed to fetch/);
    assert.match(banner, /连不上素材服务/);

    // 重试就地可用，不必刷新整页。
    const retry = action(mounted.container, "重试");
    assert.ok(retry, "失败时必须给一个就地重试的出口");
    globalThis.__identityResolutions[durable.artifactId] = durable;
    await click(retry);
    await settle();
    assert.deepEqual(globalThis.__identityReads, [
      durable.artifactId,
      durable.artifactId,
    ]);
    assert.equal(action(mounted.container, "下载")?.disabled, false);
    assert.equal(action(mounted.container, "收藏")?.disabled, false);
    assert.equal(action(mounted.container, "重试"), undefined);
  } finally {
    globalThis.__identityResolutions = {};
    await mounted.unmount();
  }
});

test("下载在跑的时候收藏仍然按得动：两个入口各自独立", async () => {
  globalThis.__identityReads = [];
  globalThis.__identityResolutions = {};
  globalThis.__holdDownload = true;
  globalThis.__releaseDownload = null;
  const item = durableItem("Independent");
  const mounted = await createMounted({
    entries: [entryFor(item)],
    onOpenItem: () => {},
  });
  try {
    await openDetail(mounted, item);
    await click(action(mounted.container, "下载"));
    assert.equal(
      action(mounted.container, "处理中…")?.disabled,
      true,
      "下载自己在忙",
    );

    // 改前：整排按钮共用一个 pending，这一刻收藏是死的。
    const favorite = action(mounted.container, "收藏");
    assert.ok(favorite);
    assert.equal(favorite.disabled, false, "下载在跑不该把收藏一起按死");
    await click(favorite);
    await settle();
    assert.equal(
      action(mounted.container, "已收藏")?.getAttribute("aria-pressed"),
      "true",
    );
  } finally {
    globalThis.__holdDownload = false;
    await act(async () => {
      globalThis.__releaseDownload?.();
      await Promise.resolve();
    });
    await settle();
    await mounted.unmount();
  }
});

test("全屏只在详情里真有可放大内容时出现，不许恒亮", async () => {
  globalThis.__identityReads = [];
  globalThis.__identityResolutions = {};
  const withContent = durableItem("With content");
  const withMounted = await createMounted({
    entries: [entryFor(withContent)],
    onOpenItem: () => {},
  });
  try {
    await openDetail(withMounted, withContent);
    assert.ok(
      action(withMounted.container, "全屏"),
      "有图可放大时全屏照常出现",
    );
  } finally {
    await withMounted.unmount();
  }

  // 同一条通路，唯一的差别是这份素材没有任何可显示的本体：查看器只落一个空态图标。
  const withoutContent = durableItem("Without content");
  withoutContent.url = "";
  withoutContent.previewUrl = "";
  withoutContent.artifact.renditions = {};
  const withoutMounted = await createMounted({
    entries: [{ ...entryFor(withoutContent), externalUrl: "" }],
    onOpenItem: () => {},
  });
  try {
    await openDetail(withoutMounted, withoutContent);
    assert.equal(
      action(withoutMounted.container, "全屏"),
      undefined,
      "没有可放大的内容时全屏不许亮着",
    );
  } finally {
    await withoutMounted.unmount();
  }
});

// V1-2 改后验收在生产站实拍到的残留（`V1-2-verdict.md` §6 R3）：PPT、网站、失败态
// 三处全屏都不亮了，只剩游戏详情那一处还亮着——那一屏摆的是封面加一颗「开始游玩」，
// 真东西在隔离域的播放页上。查看器因此需要一个反向开口，声明「这张图不是素材本身」。
test("查看器声明 exempt 的图不算可放大内容：全屏不为一张站位封面而亮", async () => {
  globalThis.__identityReads = [];
  globalThis.__identityResolutions = {};
  const exempt = durableItem("Cover exempt stand-in");
  const mounted = await createMounted({
    entries: [entryFor(exempt)],
    onOpenItem: () => {},
  });
  try {
    await openDetail(mounted, exempt);
    // 防判据被架空：这一态查看器**确实**渲染了一张图，全屏的消失才是规则在起作用。
    assert.ok(
      mounted.container.querySelector("[data-library-viewer] img"),
      "这一态查看器仍然摆着图，判据不是被架空的",
    );
    assert.equal(
      action(mounted.container, "全屏"),
      undefined,
      "标了 exempt 的站位封面不许把全屏点亮",
    );
  } finally {
    await mounted.unmount();
  }
});

// 2026-08-06 在实时预览站上实拍到的一幕（`W4-evidence/preview-law-02-detail-offline.png`）：
// 取当前版本失败时，查看器仍会摆一张封面图垫着（并自己写明「以上只是这份素材的封面图」）。
// 上一版判据只问「这块 DOM 里有没有 img」，于是那张垫底的封面把全屏又点亮了，
// 点下去放大的正是封面——正是操作员点名的那一幕，绕了一圈回到原点。
test("只剩一张垫底封面时全屏也不许亮：那不是这份素材本身", async () => {
  globalThis.__identityReads = [];
  globalThis.__identityResolutions = {};
  const durable = durableItem("Cover only");
  const row = catalogRow("Cover fallback", durable.artifactId);
  const mounted = await createMounted({
    entries: [entryFor(row)],
    siteId: "game",
    appId: "game-studio",
    onOpenItem: () => {},
  });
  try {
    await openDetail(mounted, row);
    // 这条断言防的是「判据被架空」：查看器**确实**渲染了一张图，
    // 全屏的消失才是判据在起作用，而不是这一态压根没图。
    assert.ok(
      mounted.container.querySelector("[data-library-viewer] img"),
      "这一态查看器仍然摆着封面图，判据不是被架空的",
    );
    assert.equal(
      action(mounted.container, "全屏"),
      undefined,
      "只剩封面垫底时全屏不许亮着",
    );

    // 取回当前版本之后，屏幕上是这份素材本身了，全屏照常回来。
    globalThis.__identityResolutions[durable.artifactId] = durable;
    await click(action(mounted.container, "重试"));
    await settle();
    assert.ok(
      action(mounted.container, "全屏"),
      "取回本体之后全屏要回来，不能一刀切",
    );
  } finally {
    globalThis.__identityResolutions = {};
    await mounted.unmount();
  }
});

test("全屏被浏览器拒掉时说人话，不摆 Permissions check failed", async () => {
  // `requestFullscreen()` 被拒时抛的是 Chromium 的英文原话：嵌在没开
  // `allowfullscreen` 的 iframe 里、或手势判定没过时每次都是这一句。动作条那一排
  // `catch` 过去直接 `report(error.message)`，于是它和 `Failed to fetch` 一样
  // 摆到用户面前。
  globalThis.__identityReads = [];
  globalThis.__identityResolutions = {};
  const item = durableItem("Fullscreen denied");
  const previous = window.HTMLElement.prototype.requestFullscreen;
  Object.defineProperty(window.HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: async function requestFullscreen() {
      throw new TypeError("Permissions check failed");
    },
  });
  const mounted = await createMounted({
    entries: [entryFor(item)],
    onOpenItem: () => {},
  });
  try {
    await openDetail(mounted, item);
    await click(action(mounted.container, "全屏"));
    await settle();
    const banner = mounted.container.textContent || "";
    assert.doesNotMatch(
      banner,
      /Permissions check failed|TypeError/,
      "浏览器的英文原文不许摆给用户",
    );
    assert.match(banner, /浏览器没有允许进入全屏/);
    assert.match(banner, /整页浏览/, "失败文案要说清下一步");
  } finally {
    Object.defineProperty(window.HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: previous,
    });
    await mounted.unmount();
  }
});

test("宿主抛的英文运行时异常不许进状态条，我们自己的中文照旧透传", async () => {
  // `applyMaterialAction` 会把宿主编辑器抛的任何东西写进状态条。宿主抛的可能是
  // 一句写好的中文，也可能是 `Cannot read properties of undefined` 这种运行时噪声。
  // 状态条最后落在动作条自己那句上（宿主先写一句，`run()` 的 catch 再覆盖一次）。
  // 两句都必须是人话：认不出来的异常退回「插入失败，请重试。」，
  // 宿主写好的中文则原样透传——不能为了挡英文把有用的话一起挡掉。
  const item = durableItem("Host throws");
  for (const [thrown, expected, forbidden] of [
    [
      new TypeError("Cannot read properties of undefined (reading 'id')"),
      /插入失败，请重试/,
      /Cannot read properties/,
    ],
    [
      new Error("这个编辑器暂时不支持替换背景图。"),
      /暂时不支持替换背景图/,
      /Cannot read properties/,
    ],
  ]) {
    globalThis.__identityReads = [];
    globalThis.__identityResolutions = {};
    const mounted = await createMounted({
      entries: [entryFor(item)],
      onOpenItem: () => {},
      materialActions: ["insert"],
      onMaterialAction: async () => {
        throw thrown;
      },
    });
    try {
      await openDetail(mounted, item);
      const insert = action(mounted.container, "插入");
      assert.ok(insert, "插入入口要在");
      await click(insert);
      await settle();
      const banner = mounted.container.textContent || "";
      assert.match(banner, expected);
      assert.doesNotMatch(banner, forbidden);
    } finally {
      await mounted.unmount();
    }
  }
});
