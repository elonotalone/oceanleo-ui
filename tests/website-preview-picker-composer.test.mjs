import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useLayoutEffect, useRef, useState } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { insertPreviewReferenceWhenReady, PREVIEW_REFERENCE_TIMEOUT_MS } from "../src/shell/website-platform/website-preview-reference.ts";

// UC-NONE: tests exercise the host composer bridge, never a real preview,
// screenshot, browser session, origin permission or message from untrusted code.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const splitUrl = await compileModule("src/shell/SplitWorkspace.tsx", {
  "../i18n/ui/useUI": dataModule("export function useUI(){return s=>s;}"),
  "./icons": dataModule("export function IconLibrary(){return null;}"),
  "./AdvancedEditorIcon": dataModule("export function AdvancedEditorIcon(){return null;}"),
  "./EditBarDockHost": dataModule("export function EditBarDockHost(){return null;}"),
});
const layoutUrl = await compileModule("src/shell/advanced-layout-context.tsx");
const { AdvancedLayoutContext } = await import(layoutUrl);
const { SplitWorkspace, useConsoleAgentFocus } = await import(splitUrl);
const { WebsitePreviewPicker } = await import(await compileModule("src/shell/website-platform/WebsitePreviewPicker.tsx", {
  "../SplitWorkspace": splitUrl,
  "../advanced-layout-context": layoutUrl,
  "./website-preview-i18n": dataModule("export function useWebsiteUI(){return s=>s;}"),
}));
const { createRoot } = await import("react-dom/client");
const h = React.createElement;
const reference = { projectId: "site-picked", url: "https://p-fixture.ws.oceanleo.app/about", x: 42, y: 55, width: 390, height: 700 };

function Composer({ record, ready = true }) {
  const host = useRef(null), input = useRef(null);
  useLayoutEffect(() => {
    host.current.getClientRects = () => [{}]; // jsdom has no layout engine.
    if (ready) {
      input.current.__ocGetText = () => record.draft;
      input.current.__ocSetText = text => { record.draft = text; record.writes++; };
    }
  }, [ready, record]);
  return h("div", { ref: host, "data-oceanleo-leo-entry-root": "" }, h("div", { ref: input, "data-oc-slot-editor": "" }));
}
function PickerInLayout({ record, frame, layout = true }) {
  const consoleAgent = useConsoleAgentFocus();
  const picker = h(WebsitePreviewPicker, { projectId: reference.projectId, url: reference.url, frame, onClose: () => record.closed++ });
  return layout ? h(AdvancedLayoutContext.Provider, { value: {
    openDrawer(id) {
      record.drawers.push(id);
      // Calibration: simulate the original defect without changing product code.
      if (process.env.F5_TEST_DISABLE_OPEN !== "1") consoleAgent.focusAgent();
    },
  } }, picker) : picker;
}
function Workbench({ record, initiallyOpen = false, ready = true, layout = true }) {
  const [open, setOpen] = useState(initiallyOpen);
  // Deliberately no accessible DOM in the preview: use the coordinate fallback.
  const frame = { current: {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 390, height: 700 }),
    contentDocument: { elementFromPoint() { throw new Error("cross-origin"); } },
  } };
  return h(SplitWorkspace, {
    left: h(Composer, { record, ready }),
    right: h(PickerInLayout, { record, frame, layout }),
    leftHidden: !open,
    onAgentFocus() { record.opened++; setOpen(true); },
    onAgentClose() { setOpen(false); },
    fillParent: true,
  });
}
async function mount(props = {}) {
  const record = { draft: "Keep my draft", writes: 0, closed: 0, opened: 0, drawers: [] };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(h(Workbench, { record, ...props })));
  return { record, host, root, async destroy() { await act(async () => root.unmount()); host.remove(); } };
}
async function pick(m) {
  await act(async () => m.host.querySelector('[aria-label="点选元素"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: 52, clientY: 75 })));
}
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 70)); }); }
function assertReference(record) {
  assert.match(record.draft, /^Keep my draft\n\[Website preview reference\]/);
  const payload = JSON.parse(record.draft.split("[Website preview reference]\n")[1]);
  assert.equal(payload.project_id, reference.projectId);
  assert.equal(payload.url, reference.url);
  assert.deepEqual(payload.point, { x: 42, y: 55 });
  assert.deepEqual(payload.viewport, { width: 390, height: 700 });
  assert.equal(payload.dom, "unavailable_cross_origin");
  assert.equal(record.writes, 1);
  assert.equal(record.closed, 1);
}

test("closed website conversation opens through the public layout API then receives the picked reference", async () => {
  const m = await mount();
  try {
    await pick(m);
    assert.deepEqual(m.record.drawers, ["agent"]);
    assert.equal(m.record.opened, 1);
    assert.equal(m.host.querySelector('[data-workspace-pane="left"]').getAttribute("aria-hidden"), null);
    await settle();
    assertReference(m.record);
  } finally { await m.destroy(); }
});

test("already open website conversation receives a reference directly without reopening", async () => {
  const m = await mount({ initiallyOpen: true });
  try { await pick(m); assertReference(m.record); assert.equal(m.record.opened, 0); assert.deepEqual(m.record.drawers, []); }
  finally { await m.destroy(); }
});

test("focus API opens the current workspace when no advanced layout is present", async () => {
  const m = await mount({ layout: false });
  try { await pick(m); await settle(); assertReference(m.record); assert.equal(m.record.opened, 1); }
  finally { await m.destroy(); }
});

test("unready editor times out visibly and retry inserts the retained reference", async t => {
  const m = await mount({ ready: false });
  try {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    await pick(m);
    assert.match(m.host.textContent, /正在打开 agent 对话并等待输入框/);
    assert.equal(m.host.querySelector('[aria-label="点选元素"]').disabled, true);
    await act(async () => t.mock.timers.tick(PREVIEW_REFERENCE_TIMEOUT_MS + 1));
    assert.match(m.host.querySelector('[role="alert"]').textContent, /等待 agent 对话输入框超时，引用已保留/);
    assert.equal(m.record.closed, 0); assert.equal(m.record.writes, 0);
    t.mock.timers.reset();
    const input = m.host.querySelector("[data-oc-slot-editor]");
    input.__ocGetText = () => m.record.draft;
    input.__ocSetText = text => { m.record.draft = text; m.record.writes++; };
    await act(async () => [...m.host.querySelectorAll("button")].find(b => b.textContent === "重试插入").click());
    assertReference(m.record);
  } finally { t.mock.timers.reset(); await m.destroy(); }
});

test("closing the picker cancels its pending write even if the bridge becomes ready", async () => {
  const m = await mount({ ready: false });
  try {
    await pick(m);
    await act(async () => [...m.host.querySelectorAll("button")].find(b => b.textContent === "取消点选").click());
    const input = m.host.querySelector("[data-oc-slot-editor]");
    input.__ocGetText = () => m.record.draft;
    input.__ocSetText = text => { m.record.draft = text; m.record.writes++; };
    await settle();
    assert.equal(m.record.writes, 0); assert.equal(m.record.closed, 1);
  } finally { await m.destroy(); }
});

test("another workspace's ready composer cannot receive this website reference", async () => {
  const other = await mount({ initiallyOpen: true });
  const m = await mount();
  try {
    await pick(m); await settle();
    assertReference(m.record); assert.equal(other.record.draft, "Keep my draft"); assert.equal(other.record.writes, 0);
  } finally { await m.destroy(); await other.destroy(); }
});

test("editor bridge installed after reveal is detected without a DOM mutation", async () => {
  const m = await mount({ ready: false });
  try {
    await pick(m); await settle(); assert.equal(m.record.writes, 0);
    const input = m.host.querySelector("[data-oc-slot-editor]");
    input.__ocGetText = () => m.record.draft;
    input.__ocSetText = text => { m.record.draft = text; m.record.writes++; };
    await settle(); assertReference(m.record);
  } finally { await m.destroy(); }
});

test("no conversation host reports unavailable instead of writing into a global composer", async () => {
  const controller = new AbortController();
  assert.equal(await insertPreviewReferenceWhenReady(reference, { root: () => null, openConversation: () => false, signal: controller.signal }), "unavailable");
});

test("unmount aborts pending insertion without changing the previous draft", async () => {
  const m = await mount({ ready: false });
  await pick(m); await m.destroy(); await settle();
  assert.equal(m.record.writes, 0); assert.equal(m.record.closed, 0);
});

test("standalone editor uses its local agent drawer and waits for a newly mounted composer", async () => {
  const record = { draft: "Keep my draft", writes: 0, closed: 0, drawers: [] };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  function Standalone() {
    const [open, setOpen] = useState(false);
    return h(AdvancedLayoutContext.Provider, { value: { openDrawer(id) { record.drawers.push(id); setOpen(true); } } },
      h("div", { "data-inline-editor": "" },
        open && h(Composer, { record }),
        h(WebsitePreviewPicker, {
          projectId: reference.projectId, url: reference.url,
          frame: { current: { getBoundingClientRect: () => ({ left: 10, top: 20, width: 390, height: 700 }), contentDocument: null } },
          onClose: () => record.closed++,
        })));
  }
  try {
    await act(async () => root.render(h(Standalone)));
    await pick({ host }); await settle();
    assert.deepEqual(record.drawers, ["agent"]); assertReference(record);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test("pending reference retains DOM metadata and screenshot for the existing paste intake", async () => {
  const root = document.createElement("div");
  const host = document.createElement("div"); host.setAttribute("data-oceanleo-leo-entry-root", ""); host.getClientRects = () => [{}];
  const input = document.createElement("div"); input.setAttribute("data-oc-slot-editor", ""); host.append(input); root.append(host);
  let draft = "Keep my draft", opened = 0, pasted;
  const oldTransfer = globalThis.DataTransfer, oldClipboard = globalThis.ClipboardEvent;
  class Transfer { items = { add: file => { this.file = file; } }; }
  class Paste extends window.Event { constructor(type, init) { super(type, init); this.clipboardData = init.clipboardData; } }
  globalThis.DataTransfer = Transfer; globalThis.ClipboardEvent = Paste;
  const screenshot = new File(["fixture pixels"], "website-preview.png", { type: "image/png" });
  host.addEventListener("paste", event => { pasted = event.clipboardData.file; });
  try {
    const result = await insertPreviewReferenceWhenReady({ ...reference, tag: "button", text: "Buy", className: "primary", selector: "#buy", screenshot }, {
      root: () => root, signal: new AbortController().signal,
      openConversation() {
        opened++;
        input.__ocGetText = () => draft;
        input.__ocSetText = value => { draft = value; };
        return true;
      },
    });
    assert.equal(result, "inserted"); assert.equal(opened, 1); assert.equal(pasted, screenshot);
    const payload = JSON.parse(draft.split("[Website preview reference]\n")[1]);
    assert.equal(payload.text, "Buy"); assert.equal(payload.class, "primary"); assert.equal(payload.selector, "#buy");
    assert.deepEqual(payload.point, { x: 42, y: 55 });
  } finally { globalThis.DataTransfer = oldTransfer; globalThis.ClipboardEvent = oldClipboard; }
});
