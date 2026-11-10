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
  url: "https://example.test/projects/example",
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
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}


// Mount both real shell components; only the canvas data/editor boundary is replaced.
const reactUrl = pathToFileURL(require.resolve("react")).href;
const { TaskWorkspaceShell, useTaskWorkspaceState } = await import(
  await compileModule("src/shell/TaskWorkspaceShell.tsx", {
    "../i18n/ui/useUI": dataModule(`export function useUI(){ return value => value; }`),
    "./icons": dataModule(`export function IconLibrary(){ return null; }`),
    "./EditBarDockHost": dataModule(`export function EditBarDockHost(){ return null; }`),
    "./ResultCanvas": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function ResultCanvas(){
        const [loaded, setLoaded] = React.useState(false);
        React.useEffect(() => { globalThis.__ls2Loads++; globalThis.__ls2FinishLoad = () => setLoaded(true); }, []);
        return React.createElement('article', {'data-canvas':true, style:{height:'2400px'}}, loaded ? 'Loaded material' : 'Loading');
      }
    `),
    "./WorkspaceSession": dataModule(`export function WorkspaceSessionProvider({children}){return children;}`),
    "./workspace-session-context": dataModule(`export function useOptionalWorkspaceSession(){return null;}`),
    "./workbench-routes": dataModule(`export function editorCapabilityFor(){return {available:false};}`),
  }),
);
const { createRoot } = await import('react-dom/client');

for (const plainWhenClosed of [true, false]) {
  test(`closed sidebar has no height and retains its runtime (plain=${plainWhenClosed})`, async () => {
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args.map(String).join(' '));
    globalThis.__ls2Loads = 0;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    function Harness() {
      const state = useTaskWorkspaceState();
      return React.createElement(TaskWorkspaceShell, {
        state, tabs: [], lazyRight: true, plainWhenClosed,
        left: React.createElement('button', {onClick:() => state.setRightOpen(true), 'data-open':true}, 'Open'),
      });
    }
    const pane = () => host.querySelector('[data-workspace-pane="main"]');
    const click = async node => { assert.ok(node); await act(async () => node.click()); };
    const checkClosed = () => {
      assert.equal(pane().dataset.workspacePaneState, 'closed');
      assert.equal(pane().style.height, '0px');
      assert.match(pane().style.maxHeight, /^0(?:px)?$/);
      assert.equal(pane().style.alignSelf, 'flex-start');
      assert.ok(pane().classList.contains('mt-0'));
      assert.equal(pane().classList.contains('mt-1.5'), false);
      assert.equal(pane().style.flexGrow, '0');
      assert.equal(pane().style.flexShrink, '0');
      assert.ok(pane().classList.contains('overflow-hidden'));
      assert.equal(pane().getAttribute('aria-hidden'), 'true');
      assert.ok(pane().hasAttribute('inert'));
    };
    const checkOpen = () => {
      assert.equal(pane().dataset.workspacePaneState, 'open');
      for (const property of ['height', 'maxHeight', 'alignSelf']) assert.equal(pane().style[property], '', property);
      assert.equal(pane().hasAttribute('inert'), false);
      assert.ok(pane().classList.contains('mt-1.5'));
      assert.equal(pane().classList.contains('mt-0'), false);
    };
    try {
      await act(async () => root.render(React.createElement(Harness)));
      checkClosed();
      assert.equal(host.querySelector('[data-canvas]'), null, 'lazy canvas has not loaded');
      await click(host.querySelector('[data-open]'));
      checkOpen();
      const content = host.querySelector('[data-canvas]');
      assert.equal(content.textContent, 'Loading');
      await act(async () => globalThis.__ls2FinishLoad());
      assert.equal(content.textContent, 'Loaded material');
      assert.equal(globalThis.__ls2Loads, 1);
      await click(host.querySelector('[aria-label="关闭右侧面板"]'));
      checkClosed();
      assert.equal(host.querySelector('[data-canvas]'), content);
      await click(host.querySelector('[data-open]'));
      checkOpen();
      assert.equal(host.querySelector('[data-canvas]'), content);
      assert.equal(globalThis.__ls2Loads, 1, 'reopening does not reload the material');
      await click(host.querySelector('[aria-label="右侧全屏"]'));
      assert.equal(host.querySelector('[data-workspace-maximized]').dataset.workspaceMaximized, 'library');
      assert.equal(pane().style.flexBasis, '100%');
      await click(host.querySelector('[aria-label="关闭右侧面板"]'));
      checkClosed();
      await click(host.querySelector('[data-open]'));
      checkOpen();
      assert.equal(host.querySelector('[data-canvas]'), content);
      assert.equal(globalThis.__ls2Loads, 1);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      console.error = originalError;
    }
    assert.deepEqual(errors, [], 'React must not report render/hook errors');
  });
}
