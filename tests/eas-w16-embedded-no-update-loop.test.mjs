// 网站编辑器宿主选页：iframe 每回一份新 revision 的 manifest，旧去重键会把宿主打转。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useLayoutEffect, useRef, useState } from "react";

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
  url: "https://website.oceanleo.com/workspace/corp-site",
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
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { embeddedPageDispatchKey } = await import(
  "../src/shell/plugin-chrome/plugin-page-registry.ts"
);

function oldRevisionKey(pageId, revision) {
  return `${pageId}::preview::${revision}`;
}

function ManifestPingPong({ keyFn }) {
  const [revision, setRevision] = useState(0);
  const lastKey = useRef(null);
  useLayoutEffect(() => {
    const key = keyFn("artifact", revision);
    if (lastKey.current === key) return;
    lastKey.current = key;
    setRevision((value) => value + 1);
  }, [keyFn, revision]);
  return React.createElement("div", {
    "data-revision": String(revision),
  });
}

async function mount(keyFn) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const mute = console.error;
  console.error = () => {};
  try {
    await act(async () => {
      root.render(React.createElement(ManifestPingPong, { keyFn }));
    });
  } finally {
    console.error = mute;
  }
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("改前：去重键含 revision 时 iframe 回写会抛 Maximum update depth", async () => {
  let thrown = null;
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const mute = console.error;
  console.error = () => {};
  try {
    await act(async () => {
      root.render(
        React.createElement(ManifestPingPong, { keyFn: oldRevisionKey }),
      );
    });
  } catch (error) {
    thrown = error;
  } finally {
    console.error = mute;
    await act(async () => root.unmount());
    container.remove();
  }
  assert.ok(thrown, "旧键应当把宿主打转");
  assert.match(String(thrown), /Maximum update depth/i);
});

test("改后：pending/ready 键在 revision 连涨时停住", async () => {
  const mounted = await mount((pageId, revision) =>
    embeddedPageDispatchKey(pageId, revision > 0),
  );
  try {
    const node = mounted.container.querySelector("[data-revision]");
    // pending 一次 + ready 一次，之后键不再变。
    assert.equal(node?.getAttribute("data-revision"), "2");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(
      mounted.container.querySelector("[data-revision]")?.getAttribute(
        "data-revision",
      ),
      "2",
    );
  } finally {
    await mounted.unmount();
  }
});

test("EmbeddedRoute 用新键，不再把 revision 编进去重", () => {
  const route = readFileSync(
    new URL("../src/shell/advanced-routes/EmbeddedRoute.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /embeddedPageDispatchKey\(pageId, manifestReady\)/);
  assert.match(route, /mergePluginAuxPages\(/);
  assert.doesNotMatch(
    route,
    /artifactViewId \?\? ""\}::\$\{projectManifest\?\.revision/,
  );
});
