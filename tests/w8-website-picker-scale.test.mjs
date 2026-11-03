import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// UC-NONE: docs/architecture/oceanleo-untrusted-content-isolation.md.
// A mocked inaccessible frame verifies coordinate conversion; no DOM, screenshot or messages come from a real preview.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { WebsitePreviewPicker } = await import(await compileModule("src/shell/website-platform/WebsitePreviewPicker.tsx", {
  "./website-preview-i18n": dataModule("export function useWebsiteUI(){return s=>s;}"),
  "../advanced-layout-context": dataModule("export function useAdvancedLayout(){return null;}"),
  "../SplitWorkspace": dataModule("export function useConsoleAgentFocus(){return null;}"),
  "./website-preview-reference": dataModule("export async function insertPreviewReferenceWhenReady(ref){globalThis.__w8PickedReference=ref;return 'inserted';}"),
}));
const { createRoot } = await import("react-dom/client");

// UC-NONE: coordinate scaling is a presentation regression.
// This case checks geometry sent through the existing picker bridge; it does not change origin or message authorization.
test("scaled desktop selection reports original page coordinates and viewport dimensions to the agent", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  let closed = 0;
  const frame = { current: { clientWidth: 1440, clientHeight: 900,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 360, height: 225 }),
    get contentDocument() { throw new Error("cross-origin"); },
  } };
  try {
    await act(async () => root.render(React.createElement(WebsitePreviewPicker, {
      projectId: "p-8", url: "https://p-8.ws.oceanleo.app/", frame, onClose: () => closed++,
    })));
    await act(async () => host.querySelector('[aria-label="点选元素"]').dispatchEvent(new window.MouseEvent("click", {
      bubbles: true, clientX: 100, clientY: 65,
    })));
    const ref = globalThis.__w8PickedReference;
    assert.deepEqual({ x: ref.x, y: ref.y, width: ref.width, height: ref.height }, { x: 360, y: 180, width: 1440, height: 900 });
    assert.equal(ref.projectId, "p-8"); assert.equal(ref.tag, undefined); assert.equal(closed, 1);
  } finally { await act(async () => root.unmount()); host.remove(); delete globalThis.__w8PickedReference; }
});
