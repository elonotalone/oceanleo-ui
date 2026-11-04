import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const ui = dataModule("export function useUI(){ return (text) => text; }");
const nil = (name) => dataModule(`export function ${name}(){ return null; }`);
const attachmentUrl = await compileModule("src/lib/attachment-url.ts", {
  "./auth/client": dataModule('export async function accessToken(){ return "owner-token"; } export function cachedAccessToken(){ return "owner-token"; }'),
  "./auth/config": dataModule('export const GATEWAY_BASE = "https://gateway.test";'),
});
const upload = await compileModule("src/shell/composer-upload.ts", {
  "../lib/database": dataModule('export async function uploadFile(){ throw new Error("unexpected upload"); } export async function normalizeUploadIdempotencyKey(parts){ return parts.join(":"); }'),
  "../lib/attachment-url": attachmentUrl,
  "./artifact-contract": dataModule("export function normalizeArtifactProjectionResult(){ return { ok: false }; } export function artifactIsVisible(){ return true; }"),
  "./library-data": dataModule("export function artifactProjectionToLibraryItem(item){ return item; }"),
});
const pickerUrl = await compileModule("src/shell/ComposerLibraryPicker.tsx", {
  "../i18n/ui/useUI": ui,
  "./composer-upload": upload,
  "./artifact-client": dataModule("export async function listMyArtifacts(options){ return globalThis.__pickerLoad(options); }"),
});
const { ComposerLibraryPicker, loadComposerLibraryFiles } = await import(pickerUrl);
const popoverUrl = await compileModule("src/shell/anchored-popover.tsx", {
  "./plugin-theme": dataModule("export function pluginWorkbenchStyle(){ return {}; } export function usePluginTheme(){ return {}; } export function usePluginThemePortal(){ return null; }"),
});
const composerUrl = await compileModule("src/shell/LeoComposer.tsx", {
  "../i18n/ui/useUI": ui,
  "./LeoEntryButton": nil("LeoEntryButton"),
  "./PromptHighlightArea": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export const TemplateFillArea = React.forwardRef(function Editor(props, ref){
      return React.createElement("textarea", { value: props.value, readOnly: true });
    });
  `),
  "./guide-context": dataModule("export function useFillNonce(){ return 0; } export function useFillTemplate(){ return null; }"),
  "./mobile-native-actions": dataModule(`
    export function useNativeAttachActions(){ return globalThis.__pickerNativeActions || []; }
    export function useNativeHandoffEntry(){ return { action: null, panel: null }; }
    export function useNativeTaskNotifications(){}
    export function requestTaskNotificationsOnce(){}
  `),
  "../lib/attachment-url": attachmentUrl,
  "./AttachmentStrip": nil("AttachmentStrip"),
  "../lib/upload/use-attachment-intake": dataModule(`
    export function useAttachmentIntake(onFiles){ return { emit: onFiles, emitOriginal(){}, pending: [], inFlight: [], compressing: false, removePending(){}, handlePaste(){} }; }
  `),
  "./workspace-runtime-hydration": dataModule("export function useWorkspaceRuntimeHydration(){ return null; }"),
  "./ModelPicker": nil("ModelGroupPicker"),
  "./PluginsPopover": nil("PluginsPopover"),
  "./PayerSelector": nil("PayerSelector"),
  "./mcp-apps": nil("ComposerAppsBar"),
  "./cloud-computer/ComputerDock": nil("ComputerDock"),
  "./composer-draft": dataModule("export function useComposerDraft(props){ return { attachFiles: props.onAttachFiles, markSubmitted(){} }; }"),
  "./composer-max-height": dataModule("export function useComposerMaxHeight(height){ return height; }"),
  "./ComposerLibraryPicker": pickerUrl,
  "./anchored-popover": popoverUrl,
  "./composer-skill-slash": dataModule("export function composerSlashAdapter(){} export function useComposerSkillSlash(){ return { onKeyDown(){ return false; }, popover: null }; }"),
});
const { LeoComposer } = await import(composerUrl);
const { HomeIntro } = await import(await compileModule("src/shell/HomeIntro.tsx", {
  "./LeoComposer": composerUrl,
  "./HomeCards": nil("HomePromptCards"),
  "./HomeAppCards": dataModule("export const HOME_APP_FEATURED_LIMIT=6; export function HomeAppCards(){ return null; }"),
  "./useAttachments": dataModule(`
    export function useAttachments(){ return {
      handleAttachFiles(){}, addComposerAttachments: globalThis.__homePrivateAdd,
      composerAttachments: [], removeAttachment(){}, retryAttachment(){},
    }; }
  `),
  "../i18n/ui/useUI": ui,
}));

async function flush() {
  for (let index = 0; index < 4; index++) await act(async () => {});
}
async function waitFor(check) {
  const until = Date.now() + 3_000;
  while (!check() && Date.now() < until) await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  assert.ok(check(), "expected asynchronous picker state");
}
async function mount(component, props) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(component, props)));
  await flush();
  const scopes = () => {
    const nodes = [container];
    for (let index = 0; index < nodes.length; index++) {
      for (const trigger of nodes[index].querySelectorAll("[aria-controls]")) {
        const panel = document.getElementById(trigger.getAttribute("aria-controls"));
        if (panel && !panel.hidden && !nodes.includes(panel)) nodes.push(panel);
      }
    }
    return nodes;
  };
  return {
    container,
    q: (selector) => scopes().map((node) => node.matches(selector) ? node : node.querySelector(selector)).find(Boolean) ?? null,
    qa: (selector) => [...new Set(scopes().flatMap((node) => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]))],
    async click(node) {
      assert.ok(node, "expected control");
      await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      await flush();
    },
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}
const composerProps = (extra = {}) => ({
  value: "", onChange() {}, onAttachFiles() {}, onAddAttachments() {},
  showComputerDock: false, showModelPicker: false, showPlugins: false,
  showPayerSelector: false, showAppsBar: false, ...extra,
});
const help = [{ id: "get-help", label: "找人帮忙", onClick() {} }];
const sourceMenu = (view) => view.q("[data-composer-attachment-sources]") ?? view.q('[aria-label="添加附件"]').parentElement.querySelector(".v-fade-up");
const labels = (view) => [...sourceMenu(view).querySelectorAll(":scope > button, :scope > div.relative > button")].map((button) => button.textContent.trim());
const button = (view, label) => view.qa("button").find((node) => node.textContent.trim() === label);

test.beforeEach(() => {
  globalThis.__pickerLoad = async () => ({ ok: true, data: { items: [] } });
  globalThis.__pickerNativeActions = [];
});
test.afterEach(() => {
  delete globalThis.__pickerLoad;
  delete globalThis.__pickerNativeActions;
});

test("Home and Task expose the same complete Local / Library / Recent attachment menu", async () => {
  const home = await mount(LeoComposer, composerProps({ recentFiles: [], onPickRecent() {} }));
  const task = await mount(LeoComposer, composerProps({ contextActions: help }));
  try {
    await home.click(home.q('[aria-label="添加附件"]'));
    await task.click(task.q('[aria-label="添加附件"]'));
    assert.deepEqual(labels(home), ["从本地添加文件", "从资料库添加文件", "最近文件"]);
    assert.deepEqual(labels(task), labels(home), "task help belongs in the toolbar; the file choices must match Home");
  } finally { await home.unmount(); await task.unmount(); }
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function item(number = 1, extra = {}) {
  const artifactId = `${String(number).padStart(8, "0")}-2222-4333-8444-555555555555`;
  const revisionId = `${String(number).padStart(8, "0")}-7777-4888-9999-aaaaaaaaaaaa`;
  return {
    key: `artifact:${artifactId}`, source: "artifact", id: artifactId,
    artifactId, revisionId, title: `photo-${number}.png`, kind: "image", meta: {},
    artifact: { artifactId, revisionId, renditions: { source: { mediaType: "image/png" } } },
    ...extra,
  };
}
const result = (items) => ({ ok: true, data: { items } });
const rows = (view) => view.qa("[data-composer-library-item]");
async function openRecent(view) {
  await view.click(view.q('[aria-label="添加附件"]'));
  await view.click(button(view, "最近文件"));
}

test("context actions are labeled toolbar buttons, invoke their action, and stay out of the attachment menu", async () => {
  let calls = 0;
  const view = await mount(LeoComposer, composerProps({ contextActions: [{ ...help[0], onClick: () => calls++ }] }));
  try {
    const action = view.q('[data-composer-context-action="get-help"]');
    assert.equal(action.textContent, "找人帮忙");
    assert.ok(action.closest("[data-composer-bottom-toolbar]"));
    await view.click(action);
    assert.equal(calls, 1);
    await view.click(view.q('[aria-label="添加附件"]'));
    assert.deepEqual(labels(view), ["从本地添加文件", "从资料库添加文件", "最近文件"]);
    assert.equal(action.closest(".v-fade-up"), null);
  } finally { await view.unmount(); }
});

test("disabled/read-only composers cannot invoke contextual actions; Home gets no invented help action", async () => {
  let calls = 0;
  const view = await mount(LeoComposer, composerProps({ disabled: true, contextActions: [{ ...help[0], onClick: () => calls++ }] }));
  const home = await mount(LeoComposer, composerProps());
  try {
    const action = view.q('[data-composer-context-action="get-help"]');
    assert.equal(action.disabled, true);
    await view.click(action);
    assert.equal(calls, 0);
    assert.equal(home.q("[data-composer-context-action]"), null);
  } finally { await view.unmount(); await home.unmount(); }
});

test("context-only hosts do not acquire an attachment menu", async () => {
  const view = await mount(LeoComposer, composerProps({ onAttachFiles: undefined, onAddAttachments: undefined, contextActions: help }));
  try {
    assert.ok(view.q('[data-composer-context-action="get-help"]'));
    assert.equal(view.q('[aria-label="添加附件"]'), null);
  } finally { await view.unmount(); }
});

for (const host of ["Home", "Leo Task", "native Task"]) {
  test(`${host}: canonical Recent loads privately without host recent callbacks and hands reference attachments to onAddAttachments`, async () => {
    const calls = [], picks = [];
    const file = item(1, { posterUrl: "https://store.supabase.co/storage/v1/object/sign/private/secret?token=secret" });
    globalThis.__pickerLoad = async (options) => { calls.push(options); return result([file]); };
    const view = await mount(LeoComposer, composerProps({
      onAddAttachments: (files) => picks.push(files),
      ...(host === "native Task" ? { conversation: { kind: "native", program: "codex" } } : {}),
    }));
    try {
      assert.equal(calls.length, 0, "listing is lazy until a private file source is opened");
      await openRecent(view);
      assert.equal(view.q('[data-composer-file-source="recent"]') !== null, true);
      await waitFor(() => calls.length === 1 && rows(view).length === 1);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].limit, 100);
      assert.ok(calls[0].signal instanceof AbortSignal);
      assert.deepEqual(rows(view).map((row) => row.getAttribute("data-composer-library-item")), [file.artifactId]);
      await view.click(rows(view)[0]);
      assert.equal(picks.length, 1);
      const picked = picks[0][0];
      assert.equal(picked.artifactId, file.artifactId);
      assert.equal(picked.revisionId, file.revisionId);
      assert.equal(picked.libraryItem, file);
      assert.equal(picked.mime, "image/png");
      assert.equal(picked.url, undefined);
      assert.equal(picked.previewUrl, undefined, "raw signed storage paths never become preview URLs");
      assert.equal(view.q("[data-composer-library-picker]"), null, "a successful pick closes the menu");
      assert.equal(view.q('[aria-label="添加附件"]').getAttribute("aria-expanded"), "false");
    } finally { await view.unmount(); }
  });
}

test("canonical Recent takes precedence over legacy host files and callbacks", async () => {
  const picked = [], legacy = [];
  globalThis.__pickerLoad = async () => result([item(1)]);
  const view = await mount(LeoComposer, composerProps({
    recentFiles: [{ id: "legacy-file", name: "old-public.txt" }],
    onPickRecent: (file) => legacy.push(file), recentLoading: true,
    onAddAttachments: (files) => picked.push(...files),
  }));
  try {
    await openRecent(view);
    await waitFor(() => rows(view).length === 1);
    assert.doesNotMatch(view.q("[data-composer-library-picker]").textContent, /old-public/);
    await view.click(rows(view)[0]);
    assert.equal(picked.length, 1);
    assert.deepEqual(legacy, []);
  } finally { await view.unmount(); }
});

test("the real shared HomeIntro uses the common private Recent picker without its old listFiles plumbing", async () => {
  const picks = [];
  globalThis.__homePrivateAdd = (files) => picks.push(...files);
  globalThis.__pickerLoad = async () => result([item(1)]);
  const view = await mount(HomeIntro, { siteName: "Test", siteId: "test", enableInputTools: true });
  try {
    await openRecent(view);
    await waitFor(() => rows(view).length === 1);
    await view.click(rows(view)[0]);
    assert.equal(picks[0].artifactId, item(1).artifactId);
    assert.equal(picks[0].revisionId, item(1).revisionId);
    assert.equal(picks[0].url, undefined);
  } finally { await view.unmount(); delete globalThis.__homePrivateAdd; }
});

test("Recent shows loading then its empty state; a returned failure and a thrown request show an error", async () => {
  const pending = deferred();
  globalThis.__pickerLoad = () => pending.promise;
  const view = await mount(LeoComposer, composerProps());
  try {
    await openRecent(view);
    assert.match(view.q("[data-composer-library-picker]").textContent, /加载中…/);
    await act(async () => pending.resolve(result([])));
    await waitFor(() => view.q("[data-composer-library-picker]").textContent.includes("还没有最近文件"));
    assert.match(view.q("[data-composer-library-picker]").textContent, /还没有最近文件/);
    assert.equal(view.q('[role="alert"]'), null);
  } finally { await view.unmount(); }
  for (const failure of [async () => ({ ok: false }), async () => { throw new Error("private library offline"); }]) {
    globalThis.__pickerLoad = failure;
    const failed = await mount(LeoComposer, composerProps());
    try {
      await openRecent(failed);
      await waitFor(() => failed.q('[role="alert"]'));
      assert.match(failed.q('[role="alert"]').textContent, /资料库加载失败/);
      assert.equal(rows(failed).length, 0);
      await failed.click(failed.q('[aria-label="返回"]'));
      assert.deepEqual(labels(failed), ["从本地添加文件", "从资料库添加文件", "最近文件"]);
      globalThis.__pickerLoad = async () => result([item(2)]);
      await failed.click(button(failed, "最近文件"));
      await waitFor(() => rows(failed).length === 1);
      assert.equal(rows(failed).length, 1, "back and reopen retries instead of retaining the old failure");
    } finally { await failed.unmount(); }
  }
});

test("Recent filters and deduplicates before limiting to twelve in private Library recency order", async () => {
  const privateFiles = Array.from({ length: 15 }, (_, index) => item(index + 1));
  const unattachable = { title: "no private reference", kind: "image" };
  const duplicate = { ...privateFiles[0], title: "older duplicate" };
  const response = result([unattachable, privateFiles[0], duplicate, ...privateFiles.slice(1)]);
  const filtered = await loadComposerLibraryFiles(new AbortController().signal, async () => response);
  assert.equal(filtered.length, 15);
  const view = await mount(ComposerLibraryPicker, { mode: "recent", onBack() {}, onPick() {}, load: async () => response });
  try {
    await waitFor(() => rows(view).length === 12);
    assert.deepEqual(rows(view).map((row) => row.getAttribute("data-composer-library-item")), privateFiles.slice(0, 12).map((file) => file.artifactId));
    assert.match(rows(view)[0].textContent, /photo-1.png/);
    assert.doesNotMatch(view.q("[data-composer-library-picker]").textContent, /older duplicate/);
  } finally { await view.unmount(); }
});

test("Recent disables already-attached ids and Library hands back the same private reference shape", async () => {
  const file = item(1), picks = [];
  globalThis.__pickerLoad = async () => result([file, item(2)]);
  const view = await mount(LeoComposer, composerProps({ attachments: [{ id: file.artifactId }], onAddAttachments: (files) => picks.push(...files) }));
  try {
    await openRecent(view);
    await waitFor(() => rows(view).length === 2);
    assert.equal(rows(view)[0].disabled, true);
    assert.match(rows(view)[0].textContent, /已添加/);
    await view.click(rows(view)[0]);
    assert.equal(picks.length, 0);
    await view.click(rows(view)[1]);
    await view.click(view.q('[aria-label="添加附件"]'));
    await view.click(button(view, "从资料库添加文件"));
    await waitFor(() => rows(view).length === 2);
    assert.ok(view.q('[data-composer-file-source="library"]'));
    await view.click(rows(view)[1]);
    assert.deepEqual(picks[0], picks[1]);
  } finally { await view.unmount(); }
});

for (const cancel of ["back", "trigger", "outside"]) {
  test(`Recent ${cancel} cancels its private request; a late result cannot restore it`, async () => {
    const loads = [], pending = deferred(), picks = [];
    globalThis.__pickerLoad = (options) => { loads.push(options); return pending.promise; };
    const view = await mount(LeoComposer, composerProps({ onAddAttachments: (files) => picks.push(...files) }));
    try {
      await openRecent(view);
      await waitFor(() => loads.length === 1);
      assert.equal(loads[0].signal.aborted, false);
      if (cancel === "back") await view.click(view.q('[aria-label="返回"]'));
      else if (cancel === "trigger") await view.click(view.q('[aria-label="添加附件"]'));
      else await act(async () => document.body.dispatchEvent(new window.Event("pointerdown", { bubbles: true })));
      assert.equal(loads[0].signal.aborted, true);
      await act(async () => pending.resolve(result([item(1)])));
      await flush();
      assert.equal(view.q("[data-composer-library-picker]"), null);
      assert.equal(rows(view).length, 0);
      assert.deepEqual(picks, []);
      if (cancel === "back") assert.deepEqual(labels(view), ["从本地添加文件", "从资料库添加文件", "最近文件"]);
      else assert.equal(view.q('[aria-label="添加附件"]').getAttribute("aria-expanded"), "false");
    } finally { await view.unmount(); }
  });
}

test("native mobile sources retain their local actions, followed by Library and Recent", async () => {
  let calls = 0;
  globalThis.__pickerNativeActions = [
    { id: "camera", label: "拍照", onClick: () => calls++ },
    { id: "photos", label: "从相册选择", onClick() {} },
    { id: "files", label: "选择文件", onClick() {} },
  ];
  const view = await mount(LeoComposer, composerProps());
  try {
    await view.click(view.q('[aria-label="添加附件"]'));
    assert.deepEqual(labels(view), ["拍照", "从相册选择", "选择文件", "从资料库添加文件", "最近文件"]);
    await view.click(button(view, "拍照"));
    assert.equal(calls, 1);
    assert.equal(view.q('[aria-label="添加附件"]').getAttribute("aria-expanded"), "false");
  } finally { await view.unmount(); }
});

test("viewport: tall file pickers stay visible at Home, task-bottom, scroll and narrow resize positions", async () => {
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  const originalHeight = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "scrollHeight");
  const originalWidth = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "scrollWidth");
  const originalViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const originalObserver = globalThis.ResizeObserver;
  const viewport = new window.EventTarget();
  Object.assign(viewport, { width: 1440, height: 1000, offsetLeft: 0, offsetTop: 0 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  let anchor = { left: 506, top: 241, width: 28, height: 28 };
  const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, x: left, y: top, width, height, toJSON() { return this; } });
  const panel = (node) => node.hasAttribute("data-composer-attachment-menu") || (node.classList.contains("v-fade-up") && node.querySelector("[data-composer-library-picker]"));
  const natural = (node) => ({ width: node.querySelector("[data-composer-library-picker]") ? 288 : 224, height: node.querySelector("[data-composer-library-picker]") ? 312 : 124 });
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.getAttribute("aria-label") === "添加附件") return rect(anchor.left, anchor.top, anchor.width, anchor.height);
    if (panel(this)) {
      const size = natural(this);
      if (this.style.position !== "fixed") return rect(anchor.left, anchor.top - 8 - size.height, size.width, size.height);
      return rect(parseFloat(this.style.left) || 0, parseFloat(this.style.top) || 0,
        Math.min(size.width, parseFloat(this.style.maxWidth) || size.width), Math.min(size.height, parseFloat(this.style.maxHeight) || size.height));
    }
    if (this.getAttribute("aria-label") === "返回") {
      const outer = this.closest("[data-anchored-popover], .v-fade-up");
      const box = outer.getBoundingClientRect(); return rect(box.left + 6, box.top + 6, 28, 28);
    }
    return originalRect.call(this);
  };
  Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", { configurable: true, get() { return panel(this) ? natural(this).height : 0; } });
  Object.defineProperty(window.HTMLElement.prototype, "scrollWidth", { configurable: true, get() { return panel(this) ? natural(this).width : 0; } });
  class LayoutObserver {
    static all = new Set();
    constructor(callback) { this.callback = callback; LayoutObserver.all.add(this); }
    observe() {}
    disconnect() { LayoutObserver.all.delete(this); }
    static flush() { for (const observer of LayoutObserver.all) observer.callback([]); }
  }
  globalThis.ResizeObserver = LayoutObserver;
  globalThis.__pickerLoad = async () => result(Array.from({ length: 15 }, (_, index) => item(index + 1)));
  let view;
  const visiblePanel = () => view.q("[data-composer-attachment-menu]") ?? view.q(".v-fade-up");
  const withinViewport = (label) => {
    const box = visiblePanel().getBoundingClientRect();
    const back = view.q('[aria-label="返回"]').getBoundingClientRect();
    assert.ok(box.top >= viewport.offsetTop + 8, `${label}: picker must not extend above the viewport`);
    assert.ok(box.bottom <= viewport.offsetTop + viewport.height - 8, `${label}: picker must not extend below the viewport`);
    assert.ok(box.left >= viewport.offsetLeft + 8 && box.right <= viewport.offsetLeft + viewport.width - 8, `${label}: no horizontal overflow`);
    assert.ok(back.top >= viewport.offsetTop + 8 && back.bottom <= viewport.offsetTop + viewport.height - 8, `${label}: Back must remain reachable`);
    assert.equal(visiblePanel().style.position, "fixed", "the picker escapes clipping ancestors through the shared portal");
    assert.equal(visiblePanel().parentElement, document.body);
  };
  try {
    view = await mount(LeoComposer, composerProps());
    await openRecent(view); await waitFor(() => rows(view).length === 12);
    await act(async () => LayoutObserver.flush());
    withinViewport("Home tall Recent");
    assert.equal(visiblePanel().getAttribute("data-anchored-placement"), "below", "Home's short menu can open above, then the taller list chooses below");
    await view.click(view.q('[aria-label="返回"]'));
    assert.deepEqual(labels(view), ["从本地添加文件", "从资料库添加文件", "最近文件"]);
    await view.click(button(view, "从资料库添加文件")); await waitFor(() => rows(view).length === 15);
    await act(async () => LayoutObserver.flush()); withinViewport("Home Library");
    anchor = { left: 506, top: 940, width: 28, height: 28 };
    await act(async () => window.dispatchEvent(new window.Event("scroll")));
    withinViewport("task-bottom Library");
    assert.equal(visiblePanel().getAttribute("data-anchored-placement"), "above");
    Object.assign(viewport, { width: 220, height: 240 });
    anchor = { left: 180, top: 110, width: 28, height: 28 };
    await act(async () => viewport.dispatchEvent(new window.Event("resize")));
    withinViewport("narrow resize");
    assert.ok(parseFloat(visiblePanel().style.maxHeight) < 312, "the available height caps a scrolling list");
    await view.click(view.q('[aria-label="返回"]'));
    await view.click(button(view, "最近文件")); await waitFor(() => rows(view).length === 12);
    await act(async () => LayoutObserver.flush()); withinViewport("narrow Recent");
    await view.click(view.q('[aria-label="返回"]'));
    assert.deepEqual(labels(view), ["从本地添加文件", "从资料库添加文件", "最近文件"]);
  } finally {
    if (view) await view.unmount();
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
    if (originalHeight) Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", originalHeight); else delete window.HTMLElement.prototype.scrollHeight;
    if (originalWidth) Object.defineProperty(window.HTMLElement.prototype, "scrollWidth", originalWidth); else delete window.HTMLElement.prototype.scrollWidth;
    if (originalViewport) Object.defineProperty(window, "visualViewport", originalViewport); else delete window.visualViewport;
    if (originalObserver) globalThis.ResizeObserver = originalObserver; else delete globalThis.ResizeObserver;
  }
});

test("legacy hosts without private-add retain their Recent callback and custom attachment menu entries", async () => {
  const recent = { id: "legacy", name: "legacy.txt" }, picks = [], custom = [];
  globalThis.__pickerLoad = () => { throw new Error("legacy hosts do not fetch private Library files"); };
  const view = await mount(LeoComposer, composerProps({
    onAddAttachments: undefined, recentFiles: [recent], onPickRecent: (file) => picks.push(file),
    attachMenuExtra: [{ id: "custom", label: "Custom host action", onClick: () => custom.push(true) }],
  }));
  try {
    await openRecent(view);
    await view.click(button(view, "legacy.txt"));
    assert.deepEqual(picks, [recent]);
    await view.click(view.q('[aria-label="添加附件"]'));
    await view.click(button(view, "Custom host action"));
    assert.deepEqual(custom, [true]);
    assert.equal(view.q("[data-composer-context-action]"), null, "legacy extras keep their menu semantics");
  } finally { await view.unmount(); }
});
