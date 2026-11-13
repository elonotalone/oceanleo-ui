import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act, useRef, useState } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { siblingRepoUrl } from "./helpers/sibling-repo-url.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent"]) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "window" ? dom.window : dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reactUrl = pathToFileURL(require.resolve("react")).href;
const menuUrl = await compileModule("src/ui/menu/FloatingMenu.tsx", {
  "../../shell/anchored-popover": dataModule(`
    import React, { useEffect } from ${JSON.stringify(reactUrl)};
    export function AnchoredPopover({open, onClose, children, ...props}) {
      useEffect(() => { if (!open) return; const esc = e => e.key === 'Escape' && onClose(); const outside = e => { if (!e.target.closest('[data-test-anchor]') && !e.target.closest('[role=menu]')) onClose(); }; document.addEventListener('keydown', esc); document.addEventListener('pointerdown', outside); return () => { document.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', outside); }; }, [open, onClose]);
      return open ? React.createElement('div', { role: props.role, 'aria-label': props.ariaLabel }, children) : null;
    }
  `),
});
const { FloatingMenu, FloatingMenuItem } = await import(menuUrl);
const { createRoot } = await import("react-dom/client");

function Harness() {
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  return React.createElement("div", null,
    React.createElement("button", { "data-test-anchor": true, ref: anchor, onClick: () => setOpen(true) }, "上传"),
    React.createElement(FloatingMenu, { open, anchorRef: anchor, onClose: () => setOpen(false), ariaLabel: "上传" },
      React.createElement(FloatingMenuItem, { label: "上传文件", onSelect: () => setOpen(false) }),
      React.createElement(FloatingMenuItem, { label: "上传文件夹", onSelect: () => setOpen(false) }),
    ),
  );
}

test("upload menu opens with two keyboard-accessible items and closes on Escape/outside", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Harness)));
  await act(async () => host.querySelector("[data-test-anchor]").click());
  assert.equal(host.querySelectorAll('[role="menuitem"]').length, 2);
  assert.match(host.textContent, /上传文件/);
  assert.match(host.textContent, /上传文件夹/);
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(host.querySelector('[role="menu"]'), null);
  await act(async () => host.querySelector("[data-test-anchor]").click());
  await act(async () => document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
  assert.equal(host.querySelector('[role="menu"]'), null);
  await act(async () => root.unmount()); host.remove();
});

test("Library header uses shared menu and portal delegates once to ArtifactLibrary", () => {
  const mine = readFileSync(new URL("../src/shell/MyLibrary.tsx", import.meta.url), "utf8");
  const page = readFileSync(siblingRepoUrl("oceanleo", "app/library/page.tsx"), "utf8");
  assert.match(mine, /FloatingMenu/);
  assert.match(mine, /data-library-upload-menu/);
  assert.equal((page.match(/<ArtifactLibrary\b/g) || []).length, 1);
  assert.equal((page.match(/<CloneShell\b/g) || []).length, 1);
  assert.doesNotMatch(page, /<TaskWorkspaceShell\b/);
});
