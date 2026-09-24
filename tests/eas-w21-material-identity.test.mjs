// W21：离开编辑器回到的必须是刚才那份素材。「当前素材」只有一个来源。
//
// 改前：库组件里的 handledNonceRef 随卸载清空，宿主仍攥着旧 envelope，
// 重挂载就会再调一次 onPreviewItem(B) / onOpenItem(B)。
// 改后：模块级 nonce 消费 + 地址栏跟着当前素材走。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

const ITEM_B = {
  id: "lib-b",
  artifactId: "artifact-B",
  kind: "document",
  title: "素材 B",
  revisionId: "rev-b",
  artifact: { artifactId: "artifact-B", revisionId: "rev-b", owner: { visibility: "public" }, roles: [] },
};
const ITEM_A = {
  id: "lib-a",
  artifactId: "artifact-A",
  kind: "document",
  title: "素材 A",
  revisionId: "rev-a",
  artifact: { artifactId: "artifact-A", revisionId: "rev-a", owner: { visibility: "public" }, roles: [] },
};
const ITEM_C = {
  id: "lib-c",
  artifactId: "artifact-C",
  kind: "document",
  title: "素材 C",
  revisionId: "rev-c",
  artifact: { artifactId: "artifact-C", revisionId: "rev-c", owner: { visibility: "public" }, roles: [] },
};

const artifactClientStub = dataModule(
  "export async function getCurrentArtifactItem(id){\n" +
    "  globalThis.__W21_FETCHED.push(id);\n" +
    "  const fail = globalThis.__W21_FAIL_IDS || [];\n" +
    "  if (fail.includes(id)) {\n" +
    "    return { ok: false, status: 503, error: '素材服务暂时不可用，请稍后重试。' };\n" +
    "  }\n" +
    "  const data = (globalThis.__W21_ITEMS || {})[id];\n" +
    "  if (!data) return { ok: false, status: 404, error: 'not found' };\n" +
    "  return { ok: true, status: 200, data: { ...data, artifactId: id } };\n" +
    "}\n" +
    "export async function getArtifactEditDecision(){ throw new Error('W21 不得走 fork'); }\n",
);

globalThis.__W21_FETCHED = [];
globalThis.__W21_FAIL_IDS = [];
globalThis.__W21_ITEMS = { "artifact-B": ITEM_B, "artifact-A": ITEM_A };

const OVERRIDES = { "./artifact-client": artifactClientStub };

const intentUrl = await compileModule("src/shell/library-edit-intent.ts", OVERRIDES);
const actionsUrl = await compileModule("src/shell/workspace-actions.ts", OVERRIDES);
const identityUrl = await compileModule("src/shell/library-current-identity.ts", OVERRIDES);
const slotUrl = await compileModule("src/shell/result-canvas-slot-state.ts", OVERRIDES);

const {
  useLibraryEditIntent,
  libraryPreviewIntentFromSearch,
} = await import(intentUrl);
const {
  consumeWorkspaceAction,
  isWorkspaceActionConsumed,
  resetWorkspaceActionConsumptionForTests,
  normalizeWorkspaceAction,
} = await import(actionsUrl);
const {
  LIBRARY_ENTRY_QUERY_KEY,
  libraryCurrentIdentityFromSearch,
  applyLibraryCurrentIdentityToSearch,
  replaceLibraryCurrentIdentity,
  resetLibraryCurrentIdentityForTests,
  rememberOpenedLibraryItem,
  libraryIdentityAction,
} = await import(identityUrl);
const { useWorkspaceSlotState } = await import(slotUrl);

async function withDom(url, run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    history: window.history,
    location: window.location,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  try {
    await run({ window, root });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    resetWorkspaceActionConsumptionForTests?.();
    resetLibraryCurrentIdentityForTests?.();
  }
}

function previewEnvelope(itemId = "artifact-B", nonce = "catalog-preview:app:artifact-B:1") {
  return {
    nonce,
    action: {
      version: 1,
      tab: "materials",
      itemId,
      intent: "open",
    },
  };
}

function editEnvelope(itemId = "artifact-B", nonce = "catalog-template:app:artifact-B:1") {
  return {
    nonce,
    action: {
      version: 1,
      tab: "mine",
      itemId,
      intent: "edit",
    },
  };
}

test("库卸载再挂载：旧 preview envelope 不重放 onPreviewItem(B)", async () => {
  globalThis.__W21_FETCHED = [];
  const preview = [];
  const editor = [];
  const envelope = previewEnvelope();

  await withDom(
    "https://law.oceanleo.com/workspace/app?tab=materials&item=artifact-B&mode=preview",
    async ({ root }) => {
      function Receiver() {
        useLibraryEditIntent({
          action: envelope,
          items: [],
          onOpenItem: (item) => editor.push(item),
          onPreviewItem: (item) => preview.push(item),
          onFailure: () => {},
        });
        return null;
      }
      await act(async () => root.render(React.createElement(Receiver)));
      await act(async () => {});
      assert.equal(preview.length, 1, "首次应打开 B 的预览");
      assert.equal(preview[0].artifactId, "artifact-B");

      await act(async () => root.render(React.createElement("div")));
      await act(async () => root.render(React.createElement(Receiver)));
      await act(async () => {});
    },
  );

  assert.equal(preview.length, 1, "重挂载不得再调 onPreviewItem(B)");
  assert.deepEqual(editor, []);
});

test("mode=edit 卸载再挂载：不得重新打开旧编辑器", async () => {
  globalThis.__W21_FETCHED = [];
  const preview = [];
  const editor = [];
  const envelope = editEnvelope();

  await withDom(
    "https://law.oceanleo.com/workspace/app?tab=mine&item=artifact-B",
    async ({ root }) => {
      function Receiver() {
        useLibraryEditIntent({
          action: envelope,
          items: [],
          onOpenItem: (item) => editor.push(item),
          onPreviewItem: (item) => preview.push(item),
          onFailure: () => {},
        });
        return null;
      }
      await act(async () => root.render(React.createElement(Receiver)));
      await act(async () => {});
      assert.equal(editor.length, 1, "首次应打开 B 的编辑器");

      await act(async () => root.render(React.createElement("div")));
      await act(async () => root.render(React.createElement(Receiver)));
      await act(async () => {});
    },
  );

  assert.equal(editor.length, 1, "重挂载不得再开旧编辑器");
  assert.deepEqual(preview, []);
});

test("打开 A 后地址栏变成 item=A，没有 mode=preview", async () => {
  await withDom(
    "https://law.oceanleo.com/workspace/app?tab=materials&item=artifact-B&mode=preview",
    async ({ window }) => {
      replaceLibraryCurrentIdentity({ artifactId: "artifact-A" });
      const href = window.location.pathname + window.location.search;
      assert.match(href, /item=artifact-A/);
      assert.doesNotMatch(href, /mode=preview/);
      assert.doesNotMatch(href, /item=artifact-B/);
      const identity = libraryCurrentIdentityFromSearch(window.location.search);
      assert.equal(identity.artifactId, "artifact-A");
      assert.equal(identity.entryId, "");
    },
  );
});

test("目录条目 entry= 与素材 item= 互不串", () => {
  const split = libraryCurrentIdentityFromSearch(
    "?tab=materials&item=artifact-A&entry=catalog-entry-X",
  );
  assert.equal(split.artifactId, "artifact-A");
  assert.equal(split.entryId, "catalog-entry-X");

  const preview = libraryPreviewIntentFromSearch(
    "?tab=materials&item=artifact-A&entry=catalog-entry-X&mode=preview",
  );
  assert.equal(preview.artifactId, "artifact-A");

  const old = libraryPreviewIntentFromSearch(
    "?tab=materials&item=catalog-entry-X&mode=preview",
  );
  assert.equal(old.artifactId, "catalog-entry-X", "旧链接仍读 item=");

  const next = applyLibraryCurrentIdentityToSearch(
    "?tab=materials&item=artifact-B&mode=preview",
    { artifactId: "artifact-A", entryId: "catalog-entry-X" },
  );
  const params = new URLSearchParams(next);
  assert.equal(params.get("item"), "artifact-A");
  assert.equal(params.get(LIBRARY_ENTRY_QUERY_KEY), "catalog-entry-X");
  assert.equal(params.get("mode"), null);

  const rewritten = libraryIdentityAction(
    previewEnvelope("artifact-A"),
    { nonce: "n", action: { version: 1, tab: "materials", itemId: "catalog-entry-X" } },
    "catalog-entry-X",
  );
  assert.equal(rewritten.action.itemId, "artifact-A");
  assert.equal(rewritten.action.entryId, "catalog-entry-X");
});

test("素材服务失败时不把列表里另一条当成当前素材", async () => {
  globalThis.__W21_FETCHED = [];
  globalThis.__W21_FAIL_IDS = ["artifact-A"];
  const preview = [];
  const failure = [];

  await withDom("https://law.oceanleo.com/workspace/app", async ({ root }) => {
    function Receiver() {
      useLibraryEditIntent({
        action: previewEnvelope("artifact-A", "catalog-preview:app:artifact-A:fail"),
        items: [ITEM_C],
        onOpenItem: () => {},
        onPreviewItem: (item) => preview.push(item),
        onFailure: (err) => failure.push(err),
      });
      return null;
    }
    await act(async () => root.render(React.createElement(Receiver)));
    await act(async () => {});
  });

  assert.deepEqual(
    preview.map((item) => item.artifactId),
    [],
    "失败时不得把 C 冒充成当前素材",
  );
  assert.equal(failure.length, 1);
  assert.match(failure[0].message, /没取到这份素材的最新版本/);
});

test("模块级 nonce 消费有上限，重复消费返回 false", () => {
  resetWorkspaceActionConsumptionForTests();
  assert.equal(consumeWorkspaceAction("n1", "library-edit-intent"), true);
  assert.equal(consumeWorkspaceAction("n1", "library-edit-intent"), false);
  assert.equal(consumeWorkspaceAction("n1", "workspace-library"), true);
  assert.equal(isWorkspaceActionConsumed("n1"), true);
  assert.equal(isWorkspaceActionConsumed("n1", "library-edit-intent"), true);
  for (let i = 0; i < 80; i += 1) {
    consumeWorkspaceAction(`cap-${i}`, "library-edit-intent");
  }
  assert.equal(isWorkspaceActionConsumed("n1", "library-edit-intent"), false);
  resetWorkspaceActionConsumptionForTests();
});

test("打开 A 后 actionFor 不再交出已消费的 B envelope", async () => {
  resetWorkspaceActionConsumptionForTests();
  await withDom(
    "https://law.oceanleo.com/workspace/app?tab=materials&item=artifact-B&mode=preview",
    async ({ window, root }) => {
      window.addEventListener("oceanleo:workspace-action", () => {});
      const seen = { materials: null };
      function Host() {
        const state = useWorkspaceSlotState({
          showTemplate: false,
          runtimeHydration: null,
          slotForId: (id) => (id === "mine" ? "mine" : "materials"),
          callerIdForSlot: () => null,
        });
        seen.materials = state.actionFor("materials");
        return null;
      }
      await act(async () => root.render(React.createElement(Host)));
      await act(async () => {
        window.dispatchEvent(
          new window.CustomEvent("oceanleo:workspace-action", {
            detail: previewEnvelope(),
          }),
        );
      });
      await act(async () => root.render(React.createElement(Host)));
      assert.equal(seen.materials?.action.itemId, "artifact-B");

      rememberOpenedLibraryItem(ITEM_A, previewEnvelope().nonce);
      await act(async () => root.render(React.createElement(Host)));
      assert.equal(seen.materials, null, "消费后宿主不得再把 B 的 envelope 往下传");
      assert.doesNotMatch(window.location.search, /mode=preview/);
      assert.match(window.location.search, /item=artifact-A/);
    },
  );
});

test("normalizeWorkspaceAction 只在有 entryId 时带上该字段", () => {
  const plain = normalizeWorkspaceAction({
    version: 1,
    tab: "materials",
    itemId: "artifact-A",
    intent: "open",
  });
  assert.equal("entryId" in plain, false);
  const withEntry = normalizeWorkspaceAction({
    version: 1,
    tab: "materials",
    itemId: "artifact-A",
    entryId: "catalog-entry-X",
    intent: "open",
  });
  assert.equal(withEntry.entryId, "catalog-entry-X");
});
