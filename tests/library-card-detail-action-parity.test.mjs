import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
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
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__currentArtifactReads = [];
globalThis.__currentArtifactItems = {};
globalThis.__previewHrefCalls = [];

let fullscreenElement = null;
let fullscreenExitCount = 0;
Object.defineProperty(document, "fullscreenElement", {
  configurable: true,
  get: () => fullscreenElement,
});
Object.defineProperty(document, "exitFullscreen", {
  configurable: true,
  value: async () => {
    fullscreenExitCount += 1;
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

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, values) =>
      values?.title ? value.replace("{title}", values.title) : value;
  }
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
      mode: artifact?.access?.canExportSource ? "source" : "export",
    };
  }

  export async function prepareArtifactForAction(action, item) {
    globalThis.__libraryPreparedActions.push(action);
    if (globalThis.__libraryHeldAction === action) {
      await new Promise((resolvePromise) => {
        globalThis.__releaseLibraryAction = resolvePromise;
      });
    }
    return { ok: true, data: { ...item, preparedAction: action } };
  }

  export async function getArtifactDownload(item) {
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
    globalThis.__currentArtifactReads.push(artifactId);
    const resolved = globalThis.__currentArtifactItems[artifactId];
    return resolved
      ? { ok: true, data: resolved }
      : { ok: false, error: "取不到当前版本。", status: 404 };
  }
`);
// 「哪一类打得开」的唯一判据是 `editorCapabilityFor`。默认打得开；
// 个别用例要验「打不开的类型不出按钮」，把这个开关翻过去。
globalThis.__editorCapabilityAvailable = true;
const routesStubUrl = dataModule(`
  export function editorCapabilityFor() {
    return globalThis.__editorCapabilityAvailable
      ? { available: true, unavailableReason: "", route: { type: "image" } }
      : {
          available: false,
          unavailableReason:
            "此内容目前只有预览，没有通过 load → mutate → save → reopen 验证的编辑器。",
          route: { type: "none" },
        };
  }
`);
const actionModuleUrl = await compileModule(
  "src/shell/ArtifactActions.tsx",
  {
    "../i18n/ui/useUI": uiStubUrl,
    "./artifact-contract": contractStubUrl,
    "./artifact-client": clientStubUrl,
    "./library-data": libraryDataStubUrl,
    "./workbench-routes": routesStubUrl,
  },
);
const layoutStubUrl = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};
  export function LibraryToolbar(props) {
    return createElement("div", { "data-library-toolbar": "true" }, props.actions);
  }
  export function LibraryChips() {
    return null;
  }
`);
const modelStubUrl = dataModule(`
  export const WORKSPACE_KIND_LABELS = { image: "图片", file: "文件", game: "游戏" };
  export function filterWorkspaceLibraryEntries(entries) {
    return entries;
  }
  export function visibleWorkspaceLibraryCategories(categories) {
    return { visibleCategories: categories, overflowCategoryCount: 0 };
  }
  export function workspaceEntryFromLibraryItem(item) {
    return {
      id: item.key,
      title: item.title,
      libraryItem: item,
      linkUrl: item.meta?.asset_page_url || item.url,
    };
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
    globalThis.__previewHrefCalls.push({ appId, artifactId });
    return (
      "/workspace?tab=materials&item=" +
      encodeURIComponent(artifactId) +
      "&mode=preview&app=" +
      encodeURIComponent(appId)
    );
  }
`);
const viewStubUrl = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};
  export function WorkspaceCard(props) {
    return createElement(
      "button",
      {
        type: "button",
        "data-library-card": props.entry.title,
        onClick: props.onOpen,
      },
      props.entry.title,
    );
  }
  export const WorkspaceListRow = WorkspaceCard;
  export function WorkspaceLibraryEmpty() {
    return null;
  }
  // 真 WorkspaceLibraryEntryViewer 会把有本体的条目交给 LibraryItemViewer（渲染出
  // 真图），没有本体的才落到 WorkspaceLibraryEmpty（只有一个 svg 图标和两行字）。
  // 替身过去一律渲染空 div，与真件对不上；「全屏只在真有可放大内容时出现」这条判据
  // 正是看查看器里到底有没有可放大的元素，所以替身必须把这个差别复刻出来。
  export function WorkspaceLibraryEntryViewer(props) {
    const source =
      props.entry.libraryItem?.url ||
      props.entry.libraryItem?.previewUrl ||
      props.entry.externalUrl ||
      "";
    return createElement(
      "div",
      { "data-library-viewer": props.entry.title },
      source
        ? createElement("img", { src: source, alt: props.entry.title })
        : null,
    );
  }
`);
// 归属 app 入口本身是被测对象，所以这里编的是**真模块**，只把它的四个依赖换成 stub。
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
const WorkspaceLibrary = (
  await import(
    await compileModule("src/shell/WorkspaceLibrary.tsx", {
      "../i18n/ui/useUI": uiStubUrl,
      "./library-data": libraryDataStubUrl,
      "./LibraryLayout": layoutStubUrl,
      "./ArtifactActions": actionModuleUrl,
      "./library-detail-app-actions": detailAppActionsUrl,
      "./workspace-library-model": modelStubUrl,
      "./workspace-library-view": viewStubUrl,
    })
  )
).WorkspaceLibrary;

function libraryItem(title, access = {}) {
  const artifactId = `artifact-${title.toLowerCase().replaceAll(" ", "-")}`;
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
    meta: {
      asset_page_url:
        `https://asset.oceanleo.com/materials?artifactId=${artifactId}` +
        `&revisionId=${revisionId}`,
    },
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
        ...access,
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
  };
}

function entryFor(item) {
  return {
    id: item.key,
    title: item.title,
    kind: item.kind,
    libraryItem: item,
    externalUrl: item.url,
    linkUrl: item.meta.asset_page_url,
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
  assert.ok(target);
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 0));
  });
}

function action(container, label) {
  return [...container.querySelectorAll("button, a")].find(
    (node) => node.textContent.trim() === label,
  );
}

const expectedDetailActionOrder = ["编辑", "下载", "收藏", "全屏", "链接"];

test("Current App, More, and My Library cards share quiet detail actions and return", async () => {
  for (const shelf of ["Current App", "More", "My Library"]) {
    globalThis.__libraryPreparedActions = [];
    globalThis.__libraryHeldAction = "";
    globalThis.__releaseLibraryAction = null;
    fullscreenElement = null;
    fullscreenExitCount = 0;
    const item = libraryItem(`${shelf} item`);
    const opened = [];
    const mounted = await createMounted({
      entries: [entryFor(item)],
      onOpenItem: (prepared) => opened.push(prepared),
    });
    try {
      await click(
        mounted.container.querySelector(`[data-library-card="${item.title}"]`),
      );
      assert.equal(opened.length, 0, `${shelf} card must not open the editor`);
      assert.deepEqual(globalThis.__libraryPreparedActions, []);
      assert.ok(
        mounted.container.querySelector(`[data-library-viewer="${item.title}"]`),
      );

      const labels = [...mounted.container.querySelectorAll("button, a")]
        .map((node) => node.textContent.trim())
        .filter((label) => expectedDetailActionOrder.includes(label));
      assert.deepEqual(labels, expectedDetailActionOrder, shelf);
      assert.equal(
        action(mounted.container, "链接")?.getAttribute("href"),
        item.meta.asset_page_url,
      );

      await click(action(mounted.container, "收藏"));
      await settle();
      assert.equal(
        action(mounted.container, "已收藏")?.getAttribute("aria-pressed"),
        "true",
      );
      assert.match(mounted.container.textContent || "", /已收藏/);

      await click(action(mounted.container, "全屏"));
      await settle();
      assert.ok(fullscreenElement);
      assert.ok(
        fullscreenElement.querySelector(`[data-library-viewer="${item.title}"]`),
      );
      assert.match(mounted.container.textContent || "", /已进入全屏/);

      await click(
        mounted.container.querySelector('button[aria-label="返回列表"]'),
      );
      await settle();
      assert.equal(fullscreenExitCount, 1);
      assert.equal(fullscreenElement, null);
      assert.ok(
        mounted.container.querySelector(`[data-library-card="${item.title}"]`),
      );
      assert.equal(opened.length, 0);
    } finally {
      await mounted.unmount();
    }
  }
});

test("Edit reports editor opening/opened and never claims a user edit occurred", async () => {
  globalThis.__libraryPreparedActions = [];
  globalThis.__libraryHeldAction = "edit";
  globalThis.__releaseLibraryAction = null;
  const item = libraryItem("Truthful edit");
  const opened = [];
  const mounted = await createMounted({
    entries: [entryFor(item)],
    onOpenItem: (prepared) => opened.push(prepared),
  });
  try {
    await click(
      mounted.container.querySelector(`[data-library-card="${item.title}"]`),
    );
    await click(action(mounted.container, "编辑"));
    assert.match(mounted.container.textContent || "", /正在打开编辑器/);
    assert.doesNotMatch(
      mounted.container.textContent || "",
      /编辑中|编辑已执行/,
    );
    assert.equal(opened.length, 0);

    await act(async () => {
      globalThis.__releaseLibraryAction();
      await Promise.resolve();
    });
    await settle();
    assert.deepEqual(globalThis.__libraryPreparedActions, ["edit"]);
    assert.equal(opened.length, 1);
    assert.equal(opened[0].preparedAction, "edit");
    assert.match(mounted.container.textContent || "", /编辑器已打开/);
    assert.doesNotMatch(
      mounted.container.textContent || "",
      /编辑中|编辑已执行/,
    );
  } finally {
    globalThis.__libraryHeldAction = "";
    await mounted.unmount();
  }
});

test("disabled action evidence is identical on all three shelf details", async () => {
  for (const shelf of ["Current App", "More", "My Library"]) {
    const item = libraryItem(`${shelf} disabled`, {
      canEdit: false,
      canFork: false,
      canFavorite: false,
    });
    const mounted = await createMounted({
      entries: [entryFor(item)],
      onOpenItem: () => {
        throw new Error("disabled edit must not run");
      },
    });
    try {
      await click(
        mounted.container.querySelector(`[data-library-card="${item.title}"]`),
      );
      const edit = action(mounted.container, "编辑");
      const favorite = action(mounted.container, "收藏");
      assert.equal(edit?.disabled, true, shelf);
      assert.match(edit?.getAttribute("title") || "", /没有编辑原 root/);
      assert.equal(favorite?.disabled, true, shelf);
      assert.match(
        favorite?.getAttribute("title") || "",
        /没有收藏这个 artifact 的权限/,
      );
      assert.match(mounted.container.textContent || "", /编辑：当前主体没有编辑/);
    } finally {
      await mounted.unmount();
    }
  }
});

// ── W5：详情浮层的归属 app 编辑入口（合同 §3 W5 必做 2/3，口径 D3 §4）────────────

function materialItem(title, attributions, extraMeta = {}) {
  const item = libraryItem(title);
  item.meta = {
    ...item.meta,
    workspace_library_surface: "materials",
    material_app_bindings: attributions,
    ...extraMeta,
  };
  return item;
}

function attribution(appId, label, position) {
  return {
    appId,
    siteKey: "image",
    position,
    label: label || "",
    origin: position === 0,
    role: position === 0 ? "owner" : "binding",
  };
}

async function openDetail(mounted, item) {
  await click(
    mounted.container.querySelector(`[data-library-card="${item.title}"]`),
  );
  await settle();
}

/** 详情里的编辑入口节点，一颗也没有时返回 []。 */
function editEntries(container) {
  return [...container.querySelectorAll("[data-material-edit-app]")];
}

function previewHref(artifactId, appId) {
  return `/workspace?tab=materials&item=${encodeURIComponent(
    artifactId,
  )}&mode=preview&app=${appId}`;
}

test("跨 app 素材的浮层只出一颗编辑入口，不是一排", async () => {
  globalThis.__previewHrefCalls = [];
  const item = materialItem("Cross app material", [
    attribution("avatar-removebg", "人像去背", 0),
    attribution("inpaint", "局部重绘", 1),
  ]);
  const opened = [];
  const mounted = await createMounted({
    entries: [entryFor(item)],
    siteId: "image",
    appId: "expand",
    onOpenItem: (prepared) => opened.push(prepared),
  });
  try {
    await openDetail(mounted, item);

    // 归属名单照旧摆在明面上：按钮收成一颗之后，这一行是「它也在别的包里」的唯一出处。
    assert.equal(
      mounted.container
        .querySelector("[data-material-owning-apps]")
        ?.getAttribute("data-material-owning-apps"),
      "avatar-removebg,inpaint",
    );

    // 绑了两个 app，但入口只有一颗。这是操作员点名的那件事（「太杂了」）。
    const entries = editEntries(mounted.container);
    assert.equal(entries.length, 1, "一件素材只许有一颗编辑入口");
    // 当前锚定的 `expand` 不是这份素材的归属，所以落点退到主归属。
    assert.equal(
      entries[0].getAttribute("data-material-edit-app"),
      "avatar-removebg",
    );
    // 按钮上不再挂 app 名：落哪个 app 已由素材包答完，不需要用户再选一次。
    assert.equal(entries[0].textContent.trim(), "编辑");
    // 归属自己出入口时，不再另挂一颗不指名 app 的「编辑」。
    //
    // 这一档（宿主锚在 `expand`，素材归属 avatar-removebg/inpaint）是**跨 app**，
    // `40e191e`（2026-08-13）只改了同 app 那一档，跨 app 一字未动：仍是纯读深链。
    // 但同一笔提交把按钮上的 app 名去掉了，深链那一颗自己的文案从此就是「编辑」，
    // 于是旧写法 `assert.equal(action(container, "编辑"), undefined)` 变成了在要求
    // 「按文案取不到那颗唯一的编辑入口」——它取到的正是入口自己。按父 agent 本波裁定
    // 改判据（实现是对的、判据钉着「按钮挂 app 名」那个时代的形状）：比数量与标签名。
    const editLabelled = [
      ...mounted.container.querySelectorAll("button, a"),
    ].filter((node) => node.textContent.trim() === "编辑");
    assert.equal(editLabelled.length, 1, "「编辑」这个文案在浮层里只许出现一次");
    assert.equal(editLabelled[0].tagName, "A", "跨 app 那一颗是一次「去别处」");
    assert.equal(
      editLabelled[0].getAttribute("data-material-edit-single"),
      "true",
    );
    // 就地开插件那颗 <button> 只属于同 app 那一档（见本文件 706 行那条）。
    assert.equal(
      [...mounted.container.querySelectorAll("button")].filter(
        (node) => node.textContent.trim() === "编辑",
      ).length,
      0,
      "跨 app 不许出就地编辑那颗按钮",
    );
    // 另外四项照旧齐全。
    for (const label of ["下载", "收藏", "全屏", "链接"]) {
      assert.ok(action(mounted.container, label), label);
    }

    // 落点 = 那个 app 的工作台 + 它库里这份素材的**预览**。
    assert.equal(
      entries[0].getAttribute("href"),
      previewHref(item.artifactId, "avatar-removebg"),
    );
    // href 在 render 里算，重渲染会重复调用；断言看的是**问过哪些 app**。
    assert.deepEqual(
      [...new Set(globalThis.__previewHrefCalls.map((call) => call.appId))],
      ["avatar-removebg"],
    );
    assert.ok(
      globalThis.__previewHrefCalls.every(
        (call) => call.artifactId === item.artifactId,
      ),
    );
    assert.equal(opened.length, 0, "深链落点是那个 app 的库预览，不是就地开编辑器");
  } finally {
    await mounted.unmount();
  }
});

test("素材在哪个素材包里被点开，那一颗编辑就落哪个包的 app", async () => {
  globalThis.__previewHrefCalls = [];
  const item = materialItem("Packed material", [
    attribution("avatar-removebg", "人像去背", 0),
    attribution("inpaint", "局部重绘", 1),
  ]);
  const opened = [];
  const mounted = await createMounted({
    entries: [entryFor(item)],
    siteId: "image",
    appId: "expand",
    // W5 的素材包上下文：这张卡坐在「局部重绘」这个包里。
    packAppIdForEntry: () => "inpaint",
    onOpenItem: (prepared) => opened.push(prepared),
  });
  try {
    await openDetail(mounted, item);
    const entries = editEntries(mounted.container);
    assert.equal(entries.length, 1);
    // 主归属是 avatar-removebg，但包上下文优先：上下文自洽正是这条路的理由。
    assert.equal(entries[0].getAttribute("data-material-edit-app"), "inpaint");
    assert.equal(
      entries[0].getAttribute("href"),
      previewHref(item.artifactId, "inpaint"),
    );
    assert.equal(opened.length, 0);
  } finally {
    await mounted.unmount();
  }
});

test("包上下文给的 app 不是这份素材的归属时，落点退回主归属而不是送去空工作台", async () => {
  globalThis.__previewHrefCalls = [];
  const item = materialItem("Mismatched pack", [
    attribution("avatar-removebg", "人像去背", 0),
  ]);
  const mounted = await createMounted({
    entries: [entryFor(item)],
    siteId: "image",
    packAppIdForEntry: () => "not-an-owner",
  });
  try {
    await openDetail(mounted, item);
    const entries = editEntries(mounted.container);
    assert.equal(entries.length, 1);
    assert.equal(
      entries[0].getAttribute("data-material-edit-app"),
      "avatar-removebg",
    );
  } finally {
    await mounted.unmount();
  }
});

// ── W1：站内编辑要真的打开编辑插件 ─────────────────────────────────────────
//
// 操作员在 slide 站实拍：点「编辑」重复跳到同一个页面。因为这一档也走了深链，
// 而 `?app=<归属>` 指的正是用户此刻站着的那个 app —— 按钮点得动，什么都没发生。
// 「explore 页点编辑跳到各个 app 里、只能预览，这是对的；但在各个 app 里点编辑，
// 就应该打开编辑插件。」所以同 app 这一档改判：就地开插件，不深链。

test("素材就在当前 app 名下时，编辑就地打开编辑插件，不再深链回同一个页面", async () => {
  globalThis.__previewHrefCalls = [];
  globalThis.__libraryPreparedActions = [];
  const item = materialItem("Same app material", [
    attribution("inpaint", "局部重绘", 0),
  ]);
  const opened = [];
  const mounted = await createMounted({
    entries: [entryFor(item)],
    siteId: "image",
    appId: "inpaint",
    onOpenItem: (prepared) => opened.push(prepared),
  });
  try {
    await openDetail(mounted, item);
    // 单归属不摆归属名单。
    assert.equal(
      mounted.container.querySelector("[data-material-owning-apps]"),
      null,
    );
    // 归属就是当前 app：一颗深链入口都不许出现，那正是原地打转的那颗。
    assert.deepEqual(editEntries(mounted.container), []);
    assert.deepEqual(
      globalThis.__previewHrefCalls,
      [],
      "同 app 不许再算一次深链地址",
    );

    const edit = action(mounted.container, "编辑");
    assert.ok(edit, "同 app 且这一类打得开时，编辑必须在");
    assert.equal(edit.tagName, "BUTTON", "就地动作，不是一次「去别处」");
    assert.equal(edit.disabled, false);

    await click(edit);
    await settle();
    assert.deepEqual(globalThis.__libraryPreparedActions, ["edit"]);
    assert.equal(opened.length, 1, "点下去要真的把素材交给编辑插件");
    assert.equal(opened[0].preparedAction, "edit");
    assert.deepEqual(globalThis.__previewHrefCalls, []);
  } finally {
    await mounted.unmount();
  }
});

test("同 app 但这一类打不开时，编辑这颗按钮根本不出现", async () => {
  globalThis.__previewHrefCalls = [];
  globalThis.__libraryPreparedActions = [];
  globalThis.__editorCapabilityAvailable = false;
  const item = materialItem("Same app unopenable", [
    attribution("inpaint", "局部重绘", 0),
  ]);
  const opened = [];
  const mounted = await createMounted({
    entries: [entryFor(item)],
    siteId: "image",
    appId: "inpaint",
    onOpenItem: (prepared) => opened.push(prepared),
  });
  try {
    await openDetail(mounted, item);
    // 深链那颗是原地打转，就地那颗按下去只会吐一句技术理由。两颗都不出现：
    // 用户看不到入口，就没有需要被解释的失败。
    assert.deepEqual(editEntries(mounted.container), []);
    assert.equal(action(mounted.container, "编辑"), undefined);
    assert.deepEqual(globalThis.__previewHrefCalls, []);
    assert.doesNotMatch(
      mounted.container.textContent || "",
      /编辑：/,
      "按钮都不出现了，就不该再挂一条「为什么不能编辑」的理由",
    );
    // 其余动作一个不少：不能编辑不等于这份素材没用。
    for (const label of ["下载", "收藏", "链接"]) {
      assert.ok(action(mounted.container, label), label);
    }
    assert.equal(opened.length, 0);
  } finally {
    globalThis.__editorCapabilityAvailable = true;
    await mounted.unmount();
  }
});

test("我的库的作品不走归属深链：编辑仍然是就地 typed 编辑器", async () => {
  globalThis.__previewHrefCalls = [];
  globalThis.__libraryPreparedActions = [];
  // 同样带归属，但没有 materials 货架标记 —— 这就是我的库里的一条作品。
  const item = libraryItem("Owned work");
  item.meta = {
    ...item.meta,
    material_app_bindings: [attribution("avatar-removebg", "人像去背", 0)],
  };
  const opened = [];
  const mounted = await createMounted({
    entries: [entryFor(item)],
    onOpenItem: (prepared) => opened.push(prepared),
  });
  try {
    await openDetail(mounted, item);
    assert.equal(
      mounted.container.querySelector("[data-material-edit-app]"),
      null,
    );
    await click(action(mounted.container, "编辑"));
    await settle();
    assert.deepEqual(globalThis.__previewHrefCalls, []);
    assert.deepEqual(globalThis.__libraryPreparedActions, ["edit"]);
    assert.equal(opened.length, 1);
  } finally {
    await mounted.unmount();
  }
});

test("官方模板目录行先取回 durable 投影，五项动作才都是真的", async () => {
  globalThis.__currentArtifactReads = [];
  const durable = libraryItem("Official template");
  const catalogRow = {
    key: "template-material:tpl-1",
    source: "artifact",
    id: "template-material:tpl-1",
    title: "Official template",
    kind: "image",
    siteId: "image",
    url: "https://asset.test/preview.png",
    previewUrl: "https://asset.test/preview.png",
    favorite: false,
    meta: {
      workspace_library_surface: "materials",
      template_material_id: "tpl-1",
      template_material_site_key: "image",
      template_material_app_id: "avatar-removebg",
      template_material_artifact_id: durable.artifactId,
      material_app_bindings: [attribution("avatar-removebg", "人像去背", 0)],
    },
  };
  globalThis.__currentArtifactItems = { [durable.artifactId]: durable };
  const mounted = await createMounted({
    entries: [entryFor(catalogRow)],
    siteId: "image",
    appId: "avatar-removebg",
    onOpenItem: () => {},
  });
  try {
    await openDetail(mounted, catalogRow);
    assert.deepEqual(globalThis.__currentArtifactReads, [durable.artifactId]);
    const labels = [...mounted.container.querySelectorAll("button, a")]
      .map((node) => node.textContent.trim())
      .filter((label) => expectedDetailActionOrder.includes(label));
    assert.deepEqual(labels, expectedDetailActionOrder);
  } finally {
    globalThis.__currentArtifactItems = {};
    await mounted.unmount();
  }
});

// V1-2 改后验收在生产站撞见的一件事（`V1-2-verdict.md` §7.1）：详情已经按真实类型
// 分派过了——游戏摆的是开玩面板、PPT 摆的是翻页外壳——可右上角的类型标签三类都写
// 「图片」。因为目录行的 `kind` 是**刻意**钉死的 `image`（卡片必须是图，那是红线），
// 而详情标签一直照抄它。用户看到的是系统在自相矛盾。
test("详情的类型标签跟着真实类型走，不照抄卡片那枚刻意钉死的 image", async () => {
  globalThis.__currentArtifactReads = [];
  const durable = libraryItem("Playable game");
  durable.kind = "game";
  durable.artifactType = "game";
  const catalogRow = {
    key: "template-material:tpl-game",
    source: "artifact",
    id: "template-material:tpl-game",
    title: "Playable game",
    // 卡片这一侧仍然是图，且必须保持是图。
    kind: "image",
    siteId: "game",
    url: "https://asset.test/game-cover.png",
    previewUrl: "https://asset.test/game-cover.png",
    favorite: false,
    meta: {
      workspace_library_surface: "materials",
      template_material_id: "tpl-game",
      template_material_site_key: "game",
      template_material_app_id: "game-studio",
      template_material_artifact_id: durable.artifactId,
    },
  };
  globalThis.__currentArtifactItems = { [durable.artifactId]: durable };
  const mounted = await createMounted({
    entries: [entryFor(catalogRow)],
    siteId: "game",
    appId: "game-studio",
    onOpenItem: () => {},
  });
  try {
    await openDetail(mounted, catalogRow);
    const text = mounted.container.textContent;
    assert.match(text, /游戏/, "详情头上的类型标签应当是「游戏」");
    assert.doesNotMatch(
      text,
      /图片/,
      "详情里不该还挂着「图片」——那是卡片那一侧的口径",
    );
  } finally {
    globalThis.__currentArtifactItems = {};
    await mounted.unmount();
  }
});

test("我的库与素材库两处都不再有「更多素材」这一层入口", async () => {
  for (const relativePath of [
    "src/shell/WorkspaceLibrary.tsx",
    "src/shell/MyLibrary.tsx",
    "src/shell/ArtifactLibrary.tsx",
    "src/shell/LibraryMasterDetail.tsx",
    "src/shell/library-detail-app-actions.tsx",
    "src/shell/workspace-library-model.ts",
  ]) {
    const source = await readFile(resolve(relativePath), "utf8");
    assert.doesNotMatch(source, /更多素材/, relativePath);
    assert.doesNotMatch(source, /["']more["']/, relativePath);
  }
});

test("material Primary/More and My Library do not override card click into Edit", async () => {
  const materialSource = await readFile(
    resolve("src/shell/material-library-view.tsx"),
    "utf8",
  );
  const mineSource = await readFile(resolve("src/shell/MyLibrary.tsx"), "utf8");
  const materialCall = materialSource.slice(
    materialSource.lastIndexOf("<WorkspaceLibrary"),
  );
  const mineCall = mineSource.slice(mineSource.lastIndexOf("<WorkspaceLibrary"));

  assert.match(materialCall, /onOpenItem=\{openPreparedItem\}/);
  assert.doesNotMatch(materialCall, /onOpenEntry=/);
  assert.doesNotMatch(materialSource, /prepareAndOpenItem/);
  assert.doesNotMatch(materialSource, /prepareArtifactForAction/);
  assert.match(mineCall, /onOpenItem=\{onOpenItem \|\| setStandaloneEditorItem\}/);
  assert.doesNotMatch(mineCall, /onOpenEntry=/);
});
