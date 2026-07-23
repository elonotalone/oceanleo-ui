import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

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
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compileModule(relativePath, replacements) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries({
    react: reactUrl,
    ...replacements,
  })) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    })
    .outputText.replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return `${dataModule(compiled)}#${encodeURIComponent(relativePath)}`;
}

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
`);
const routesStubUrl = dataModule(`
  export function editorCapabilityFor() {
    return {
      available: true,
      unavailableReason: "",
      route: { type: "image" },
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
  export const WORKSPACE_KIND_LABELS = { image: "图片", file: "文件" };
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
  export function WorkspaceLibraryEntryViewer(props) {
    return createElement("div", {
      "data-library-viewer": props.entry.title,
    });
  }
`);
const WorkspaceLibrary = (
  await import(
    await compileModule("src/shell/WorkspaceLibrary.tsx", {
      "../i18n/ui/useUI": uiStubUrl,
      "./library-data": libraryDataStubUrl,
      "./LibraryLayout": layoutStubUrl,
      "./ArtifactActions": actionModuleUrl,
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
