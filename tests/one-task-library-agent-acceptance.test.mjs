import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { installOneTaskLibrarySourceLoader } from "./helpers/one-task-library-source-loader.mjs";

const require = createRequire(import.meta.url);
const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://dev.example.test/library",
});
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLButtonElement", "Element", "Node", "Event", "MouseEvent", "CustomEvent", "localStorage"]) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === "window" ? dom.window : dom.window[name] });
}
for (const name of ["innerHeight", "innerWidth", "scrollY", "scrollX", "pageYOffset", "pageXOffset"]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: dom.window[name] || (name.includes("Height") ? 768 : name.includes("Width") ? 1024 : 0),
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.Range = dom.window.Range;
globalThis.InputEvent = dom.window.InputEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.FileReader = dom.window.FileReader;
globalThis.DOMRect = class DOMRect {
  constructor(x = 0, y = 0, width = 1, height = 1) {
    Object.assign(this, { x, y, width, height, top: y, right: x + width, bottom: y + height, left: x });
  }
  toJSON() { return { x: this.x, y: this.y, width: this.width, height: this.height }; }
};
globalThis.NodeFilter = dom.window.NodeFilter;
globalThis.getSelection = dom.window.getSelection.bind(dom.window);
globalThis.matchMedia = dom.window.matchMedia?.bind(dom.window) || (() => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
}));
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
dom.window.HTMLElement.prototype.scrollIntoView ??= function scrollIntoView() {};
dom.window.HTMLElement.prototype.scrollTo ??= function scrollTo() {};
dom.window.scrollBy = function scrollBy() {};
dom.window.scrollTo = function scrollTo() {};
dom.window.HTMLElement.prototype.getClientRects ??= function getClientRects() { return []; };
dom.window.HTMLElement.prototype.getBoundingClientRect ??= function getBoundingClientRect() { return new globalThis.DOMRect(0, 0, 1, 1); };
dom.window.Range.prototype.getClientRects ??= function getClientRects() { return []; };
dom.window.Range.prototype.getBoundingClientRect ??= function getBoundingClientRect() { return new globalThis.DOMRect(0, 0, 1, 1); };
// JSDOM has no native canvas in this container. Keep the actual production
// document preview renderer but provide its primitive drawing surface and a
// deterministic valid PNG receipt; the editor/project JSON remains real.
const previewCanvasContext = new Proxy({
  measureText(text) { return { width: String(text || "").length * 7 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
}, {
  get(target, key) {
    return key in target ? target[key] : () => {};
  },
});
dom.window.HTMLCanvasElement.prototype.getContext = function getContext() {
  return previewCanvasContext;
};
dom.window.HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
  callback(new Blob([Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
    0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 240,
    31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ])], { type: "image/png" }));
};

// Keep the production SplitWorkspace implementation and its React contexts.
// Only presentation-only icons and the unrelated edit-bar portal host are
// replaced, so this test exercises the same pane DOM/lifecycle as Library.
const splitUrl = await compileModule("src/shell/SplitWorkspace.tsx", {
  "../i18n/ui/useUI": dataModule(`export function useUI(){ return value=>value; }`),
  "./icons": dataModule(`export function IconLibrary(){return null;}`),
  "./AdvancedEditorIcon": dataModule(`export function AdvancedEditorIcon(){return null;}`),
  "./EditBarDockHost": dataModule(`export function EditBarDockHost(){return null;}`),
});
const { SplitWorkspace } = await import(splitUrl);
const { createRoot } = await import("react-dom/client");

async function mount(component) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(component));
  return {
    container,
    async destroy() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function click(button) {
  assert.ok(button, "expected an accessible pane action");
  await act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

async function waitFor(mounted, selector, label, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs;
  let match = mounted.container.querySelector(selector);
  while (!match && Date.now() < deadline) {
    const renderError = mounted.container.querySelector("[data-render-error]");
    if (renderError) {
      const stack = mounted.container.querySelector("[data-render-component-stack]")?.textContent || "";
      assert.fail(`render boundary caught while waiting for ${label}: ${renderError.textContent}\n${stack}`);
    }
    await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 40)));
    match = mounted.container.querySelector(selector);
  }
  assert.ok(match, `timed out waiting for ${label} (${selector}); visible text=${(mounted.container.textContent || "").slice(0, 700)}; requests=${JSON.stringify(trackedRequests.map(({ method, path }) => `${method} ${path}`))}`);
  return match;
}

class OneTaskLibraryRenderErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, componentStack: "" };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ componentStack: info?.componentStack || "" });
    this.props.onError?.(error, info);
  }
  render() {
    if (this.state.error) {
      return React.createElement(React.Fragment, null,
        React.createElement("pre", { "data-render-error": true }, String(this.state.error.message || this.state.error)),
        React.createElement("pre", { "data-render-component-stack": true }, this.state.componentStack),
      );
    }
    return this.props.children;
  }
}

test("Library right-pane close slides out accessibly without unmounting the editor", async () => {
  function Host() {
    const [open, setOpen] = React.useState(true);
    return React.createElement(SplitWorkspace, {
      left: React.createElement("div", { "data-real-agent-pane": true }, "Agent conversation"),
      right: React.createElement("input", { "data-real-editor": true, defaultValue: "unsaved draft" }),
      library: { open, onOpenChange: setOpen },
      fillParent: true,
    });
  }

  const mounted = await mount(React.createElement(Host));
  try {
    const pane = mounted.container.querySelector('[data-workspace-pane="main"]');
    const editor = mounted.container.querySelector("[data-real-editor]");
    assert.ok(pane);
    assert.ok(editor);
    editor.value = "changed draft";
    assert.equal(pane.getAttribute("data-workspace-pane-state"), "open");
    assert.equal(pane.hasAttribute("inert"), false);
    assert.equal(pane.getAttribute("aria-hidden"), null);
    assert.match(pane.className, /transition-\[flex-basis,opacity,margin\]/);
    assert.match(pane.className, /motion-reduce:transition-none/);

    await click(mounted.container.querySelector('[aria-label="关闭右侧面板"]'));
    assert.equal(mounted.container.querySelector('[data-workspace-pane="main"]'), pane, "close keeps the editor pane mounted during/after the slide");
    assert.equal(pane.getAttribute("data-workspace-pane-state"), "closed");
    assert.equal(pane.hasAttribute("inert"), true, "a closed pane cannot receive focus or interaction");
    assert.equal(pane.getAttribute("aria-hidden"), "true", "a closed pane is absent from the accessibility tree");
    assert.equal(mounted.container.querySelector("[data-real-editor]"), editor);
    assert.equal(editor.value, "changed draft", "closing the pane preserves the unsaved draft");

    await click(mounted.container.querySelector('[aria-label="展开"]'));
    assert.equal(mounted.container.querySelector('[data-workspace-pane="main"]'), pane);
    assert.equal(pane.getAttribute("data-workspace-pane-state"), "open");
    assert.equal(pane.hasAttribute("inert"), false);
    assert.equal(pane.getAttribute("aria-hidden"), null);
    assert.equal(mounted.container.querySelector("[data-real-editor]"), editor);
    assert.equal(editor.value, "changed draft");
  } finally {
    await mounted.destroy();
  }
});

const artifactPage = JSON.parse(
  readFileSync(new URL("./fixtures/oceanleo-artifact-library-pages.json", import.meta.url), "utf8"),
);
const activeImageProjection = structuredClone(artifactPage.publicPage.items[0]);
activeImageProjection.artifact_id = "one-task-library-image";
activeImageProjection.revision_id = "one-task-library-image-r1";
activeImageProjection.artifact_type = "single_file_image";
activeImageProjection.title = "Library acceptance image";
activeImageProjection.favorite = false;
activeImageProjection.owner = {
  principal_id: "one-task-library-owner",
  visibility: "private",
  origin_site_key: "image",
};
activeImageProjection.access.can_edit = true;
activeImageProjection.access.can_fork = false;
activeImageProjection.editor_capability = "image-editor";
activeImageProjection.renditions.preview.revision_id = "one-task-library-image-r1";
activeImageProjection.renditions.preview.url = "https://signed.one-task-library.test/image-preview.png";
activeImageProjection.renditions.source.revision_id = "one-task-library-image-r1";
activeImageProjection.renditions.source.url = "https://signed.one-task-library.test/image-source.png";
activeImageProjection.renditions.source.digest = "sha256:one-task-library-image-r1";
const activeDocumentProjection = structuredClone(artifactPage.mineOwnerAPage.items[0]);
activeDocumentProjection.artifact_id = "one-task-library-document";
activeDocumentProjection.revision_id = "one-task-library-document-r1";
activeDocumentProjection.title = "Library acceptance document";
activeDocumentProjection.owner = {
  principal_id: "one-task-library-owner",
  visibility: "private",
  origin_site_key: "word",
};
activeDocumentProjection.renditions.preview.revision_id = "one-task-library-document-r1";
activeDocumentProjection.renditions.preview.url = "https://signed.one-task-library.test/document-preview.html";
activeDocumentProjection.renditions.source.revision_id = "one-task-library-document-r1";
activeDocumentProjection.renditions.source.url = "https://signed.one-task-library.test/document-source.json";
activeDocumentProjection.renditions.source.digest = "sha256:one-task-library-document-r1";
const secondDocumentProjection = structuredClone(activeDocumentProjection);
secondDocumentProjection.artifact_id = "one-task-library-second-document";
secondDocumentProjection.revision_id = "one-task-library-second-document-r1";
secondDocumentProjection.title = "Second canonical Library document";
secondDocumentProjection.favorite = false;
secondDocumentProjection.renditions.preview.revision_id = "one-task-library-second-document-r1";
secondDocumentProjection.renditions.preview.url = "https://signed.one-task-library.test/second-document-preview.html";
secondDocumentProjection.renditions.source.revision_id = "one-task-library-second-document-r1";
secondDocumentProjection.renditions.source.url = "https://signed.one-task-library.test/second-document-source.json";
secondDocumentProjection.renditions.source.digest = "sha256:one-task-library-second-document-r1";

const trackedRequests = [];
const createdTaskRequests = [];
const followUpTaskRequests = [];
const existingTaskFollowups = [];
let historyBackendFetchCount = 0;
let activeProjection = activeImageProjection;
let includeSecondLibraryItem = false;
let actualArtifactLibraryComponent;
let nextSessionRevision = 1;
let sessionSnapshot = {};
let sessionTaskId = null;
let existingTaskSessionSnapshot = {};
let existingTaskSessionRevision = 1;
let holdExistingTaskFollowup = false;
let pendingExistingTaskFollowup = null;
let existingTaskCommandResponseReady = false;
let commandResponseEnabled = false;
let taskMessageStage = 0;
const persistedInlineEditorTaskIds = [];
const uploadedLibraryFiles = [];
const artifactRevisionCommits = [];
let nextLibraryUploadId = 1;
let r2ProjectUrl = null;
function persistedInlineEditorHead(rootId = "one-task-library-document") {
  return Object.values(sessionSnapshot.oceanleo_inline_editor?.heads || {})
    .map((entry) => entry?.head)
    .find((head) => head?.item?.artifactId === rootId || head?.item?.id === rootId);
}

function sessionReceipt() {
  return {
    id: "one-task-library-session",
    site_id: "oceanleo",
    app_id: "library",
    surface: "app",
    status: "active",
    title: "Library acceptance task",
    schema_version: 1,
    revision: nextSessionRevision,
    snapshot: sessionSnapshot,
    task_id: sessionTaskId,
    first_output_at: null,
    created_at: "2026-10-21T00:00:00.000Z",
    last_activity_at: "2026-10-21T00:00:00.000Z",
  };
}
function existingTaskSessionReceipt() {
  return {
    id: "one-task-library-existing-session",
    site_id: "oceanleo",
    app_id: "oceanleo",
    surface: "app",
    status: "active",
    title: "Existing Library Task",
    schema_version: 1,
    revision: existingTaskSessionRevision,
    snapshot: existingTaskSessionSnapshot,
    task_id: "one-task-library-existing-task",
    first_output_at: "2026-10-21T00:00:00.000Z",
    created_at: "2026-10-21T00:00:00.000Z",
    last_activity_at: "2026-10-21T00:00:00.000Z",
  };
}
function existingTaskDetail() {
  return {
    task: {
      id: "one-task-library-existing-task",
      task_id: "one-task-library-existing-task",
      status: "completed",
      mode: "agent",
      site_id: "oceanleo",
      title: "Existing Library Task",
      session_id: "one-task-library-existing-session",
    },
    messages: [
      { id: 1201, role: "user", kind: "text", content: "之前请你帮我处理一份文档。" },
      { id: 1202, role: "assistant", kind: "text", content: "好的，我会继续在当前任务里协助你。" },
      ...(existingTaskCommandResponseReady ? [{
        id: 1203,
        role: "assistant",
        kind: "text",
        content: "现在把标记写到当前文档。\n\n```oceanleo-editor-command\n{\"id\":\"richdoc.insert-paragraph\",\"params\":{\"text\":\"STALE RESPONSE MUST NOT APPLY\"}}\n```",
      }] : []),
    ],
    artifacts: [],
  };
}
function emptyMineEnvelope() {
  return {
    schema: "oceanleo.library.v1",
    scope: "mine",
    ownerPrincipalId: "one-task-library-owner",
    items: [],
    total: 0,
    nextCursor: null,
    invalidCount: 0,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const acceptancePng = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 240,
  31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

function pixelPngResponse() {
  return new Response(acceptancePng, { headers: { "content-type": "image/png" } });
}

function uploadedMediaType(filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

async function libraryFetch(input, init = {}) {
  const url = new URL(typeof input === "string" ? input : input.url, "https://gateway.one-task-library.test");
  const method = String(init.method || (typeof input === "object" ? input.method : "GET") || "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  trackedRequests.push({
    url: url.href,
    path: `${url.pathname}${url.search}`,
    method,
    body,
    headers: Object.fromEntries(new Headers(init.headers || {}).entries()),
  });
  if (
    window.location.pathname.startsWith("/history/") &&
    (url.pathname.startsWith("/v1/agent/sessions") || url.pathname.startsWith("/v1/agent/tasks"))
  ) {
    historyBackendFetchCount += 1;
    if (historyBackendFetchCount > 300) {
      return Promise.resolve(jsonResponse({ error: "History detail fixture stopped a repeated session/task fetch loop after 300 calls." }, 508));
    }
  }
  if (url.pathname === "/v1/library/mine") {
    const requestedType = url.searchParams.get("artifactType");
    const projections = [activeProjection, ...(includeSecondLibraryItem ? [secondDocumentProjection] : [])];
    const items = projections.filter((item) => !requestedType || requestedType === item.artifact_type);
    return Promise.resolve(jsonResponse({
      schema: "oceanleo.library.v1",
      scope: "mine",
      ownerPrincipalId: "one-task-library-owner",
      items,
      total: items.length,
      nextCursor: null,
      invalidCount: 0,
    }));
  }
  if (url.pathname === "/v1/library/favorites") {
    return Promise.resolve(jsonResponse(emptyMineEnvelope()));
  }
  const libraryItem = [activeProjection, secondDocumentProjection]
    .find((item) => url.pathname === `/v1/library/items/${item.artifact_id}`);
  if (libraryItem) {
    return Promise.resolve(jsonResponse(libraryItem));
  }
  const editCapabilityItem = [activeProjection, secondDocumentProjection]
    .find((item) => url.pathname === `/v1/artifacts/${item.artifact_id}/edit-capability`);
  if (editCapabilityItem) {
    return Promise.resolve(jsonResponse({
      available: true,
      editor_capability: editCapabilityItem.editor_capability,
      item: editCapabilityItem,
    }));
  }
  if (url.pathname === "/v1/agent/sessions" && method === "POST") {
    nextSessionRevision += 1;
    return Promise.resolve(jsonResponse(sessionReceipt()));
  }
  if (url.pathname === "/v1/agent/sessions/one-task-library-session" && method === "GET") {
    return Promise.resolve(jsonResponse(sessionReceipt()));
  }
  if (url.pathname === "/v1/agent/sessions/one-task-library-existing-session" && method === "GET") {
    return Promise.resolve(jsonResponse(existingTaskSessionReceipt()));
  }
  if (url.pathname === "/v1/agent/tasks" && method === "GET") {
    return Promise.resolve(jsonResponse({ items: [] }));
  }
  if (url.pathname === "/v1/agent/tasks" && method === "POST") {
    createdTaskRequests.push(JSON.parse(body));
    commandResponseEnabled = true;
    taskMessageStage = 1;
    return Promise.resolve(jsonResponse({
      task_id: "one-task-library-created-task",
      status: "running",
      mode: "agent",
      session_id: "one-task-library-session",
    }));
  }
  if (url.pathname === "/v1/agent/tasks/one-task-library-created-task") {
    const messages = commandResponseEnabled
      ? [
          {
            id: 901,
            role: "assistant",
            kind: "text",
            content: "我会在文档末尾添加你要求的验收标记。\n\n```oceanleo-editor-command\n{\"id\":\"richdoc.insert-paragraph\",\"params\":{\"text\":\"Agent accepted marker\"}}\n```",
          },
          ...(taskMessageStage >= 2
            ? [{
                id: 902,
                role: "assistant",
                kind: "text",
                content: "我会把当前文档保存为同一 Library 文件的新版本。\n\n```oceanleo-editor-command\n{\"id\":\"richdoc.save\",\"params\":{}}\n```",
              }]
            : []),
        ]
      : [];
    return Promise.resolve(jsonResponse({
      task: {
        id: "one-task-library-created-task",
        task_id: "one-task-library-created-task",
        status: "completed",
        site_id: "oceanleo",
        title: "Library acceptance task",
      },
      messages,
      artifacts: [],
    }));
  }
  if (url.pathname === "/v1/agent/tasks/one-task-library-existing-task" && method === "GET") {
    return Promise.resolve(jsonResponse(existingTaskDetail()));
  }
  if (url.pathname === "/v1/agent/tasks/one-task-library-existing-task/messages" && method === "POST") {
    const message = JSON.parse(body);
    if (typeof message.prompt === "string" && !message.prompt.startsWith("〔")) {
      existingTaskFollowups.push(message);
      if (holdExistingTaskFollowup) {
        return new Promise((resolveResponse) => {
          pendingExistingTaskFollowup = () => {
            pendingExistingTaskFollowup = null;
            resolveResponse(jsonResponse({ ok: true }));
          };
        });
      }
    }
    return Promise.resolve(jsonResponse({ ok: true }));
  }
  if (url.pathname === "/v1/agent/tasks/one-task-library-created-task/messages" && method === "POST") {
    const message = JSON.parse(body);
    if (typeof message.prompt === "string" && !message.prompt.startsWith("〔")) {
      followUpTaskRequests.push(message);
      taskMessageStage = 2;
    }
    return Promise.resolve(jsonResponse({ ok: true }));
  }
  if (url.pathname === "/v1/database/upload" && method === "POST") {
    const file = init.body?.get?.("file");
    const filename = String(file?.name || "unknown-upload");
    const content = file && typeof file.text === "function" ? await file.text() : "";
    const bytes = file && typeof file.arrayBuffer === "function"
      ? new Uint8Array(await file.arrayBuffer())
      : new TextEncoder().encode(content);
    const uploadId = `one-task-upload-${nextLibraryUploadId++}`;
    const fileUrl = `https://signed.one-task-library.test/${encodeURIComponent(filename)}?uploadId=${uploadId}`;
    uploadedLibraryFiles.push({ filename, content, bytes, url: fileUrl });
    return jsonResponse({
      ok: true,
      file: {
        url: fileUrl,
        meta: {},
      },
    });
  }
  const revisionMatch = url.pathname.match(/^\/v1\/artifacts\/([^/]+)\/revisions$/);
  if (revisionMatch && method === "POST") {
    const commit = JSON.parse(body);
    artifactRevisionCommits.push({ artifactId: decodeURIComponent(revisionMatch[1]), commit, headers: Object.fromEntries(new Headers(init.headers || {}).entries()) });
    const revisionId = "one-task-library-document-r2";
    const next = structuredClone(activeProjection);
    next.revision_id = revisionId;
    next.source_format = commit.source?.format;
    next.renditions.source = {
      purpose: "source",
      revision_id: revisionId,
      url: commit.source?.url,
      format: commit.source?.format,
      digest: commit.source?.digest,
      media_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    for (const rendition of commit.renditions || []) {
      next.renditions[rendition.purpose] = {
        purpose: rendition.purpose,
        revision_id: revisionId,
        url: rendition.url,
        digest: rendition.digest,
        format: rendition.purpose === "preview" ? "png" : "json",
        media_type: rendition.purpose === "preview" ? "image/png" : "application/json",
      };
    }
    next.provenance = { ...(next.provenance || {}), previous_revision_id: commit.expected_revision_id };
    activeProjection = next;
    return jsonResponse(next);
  }
  if (url.pathname === "/v1/agent/sessions/one-task-library-session/snapshot" && method === "PUT") {
    const update = JSON.parse(body);
    sessionSnapshot = update.snapshot || {};
    const historyHeads = sessionSnapshot.oceanleo_inline_editor?.heads || {};
    const inlineTaskId = Object.values(historyHeads)
      .map((entry) => entry?.head?.task_id)
      .find((taskId) => typeof taskId === "string" && taskId);
    sessionTaskId = sessionSnapshot.task_id || inlineTaskId || sessionTaskId;
    if (inlineTaskId) persistedInlineEditorTaskIds.push(inlineTaskId);
    nextSessionRevision += 1;
    return Promise.resolve(jsonResponse(sessionReceipt()));
  }
  if (url.pathname === "/v1/agent/sessions/one-task-library-existing-session/snapshot" && method === "PUT") {
    const update = JSON.parse(body);
    existingTaskSessionSnapshot = update.snapshot || {};
    existingTaskSessionRevision += 1;
    return Promise.resolve(jsonResponse(existingTaskSessionReceipt()));
  }
  if (url.pathname === "/v1/media/proxy") {
    const target = new URL(url.searchParams.get("url") || "https://signed.one-task-library.test/unknown");
    const uploaded = uploadedLibraryFiles.find((file) => file.url === target.href);
    if (uploaded) {
      return new Response(uploaded.bytes, {
        headers: { "content-type": uploadedMediaType(uploaded.filename) },
      });
    }
    if (target.pathname === "/document-source.json") {
      return Promise.resolve(jsonResponse({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Initial real content" }] }],
      }));
    }
    if (target.pathname === "/second-document-source.json") {
      return Promise.resolve(jsonResponse({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Second canonical file content" }] }],
      }));
    }
    if (target.pathname === "/document-preview.html") {
      return Promise.resolve(new Response("<p>Read-only preview</p>", { headers: { "content-type": "text/html" } }));
    }
    return Promise.resolve(pixelPngResponse());
  }
  if (url.hostname === "signed.one-task-library.test") {
    const filename = decodeURIComponent(url.pathname.slice(1));
    const uploaded = uploadedLibraryFiles.find((upload) => upload.url === url.href);
    if (uploaded) {
      if (uploadedMediaType(filename) === "application/json") {
        return Promise.resolve(jsonResponse(JSON.parse(uploaded.content)));
      }
      return Promise.resolve(new Response(uploaded.bytes, {
        headers: { "content-type": uploadedMediaType(filename) },
      }));
    }
    if (url.pathname === "/document-source.json") {
      return Promise.resolve(jsonResponse({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Initial real content" }] }],
      }));
    }
    if (url.pathname === "/second-document-source.json") {
      return Promise.resolve(jsonResponse({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Second canonical file content" }] }],
      }));
    }
    // A valid 1×1 PNG keeps the real image workbench on its native browser path.
    return Promise.resolve(pixelPngResponse());
  }
  return Promise.resolve(jsonResponse({ error: `unhandled test request ${method} ${url.pathname}` }, 404));
}

test("real Library→MyLibrary→MaterialStandaloneEditor composition renders without a task render loop", { timeout: 35000 }, async () => {
  const projectRoot = resolve(new URL("..", import.meta.url).pathname);
  installOneTaskLibrarySourceLoader({
    replacements: {
      "next/dynamic": "tests/helpers/one-task-library-next-dynamic.mjs",
      "next/navigation": "tests/helpers/one-task-library-next-navigation.mjs",
      "react-markdown": "tests/helpers/one-task-library-markdown-renderer.mjs",
    },
    fileReplacements: {
      "src/lib/auth/client.ts": "tests/helpers/one-task-library-auth-client.mjs",
    },
  });
  globalThis.__oneTaskLibraryNavigationCalls = [];
  globalThis.fetch = libraryFetch;
  window.history.replaceState(null, "", "/library?item=one-task-library-image");

  let ArtifactLibrary;
  try {
    // Use the actual production Library composition. The only substitutions are
    // Next's chunk/navigation boundary, identity auth, and gateway/signed-file
    // transport; AgentChat, MyLibrary, SplitWorkspace and editor routes remain real.
    ({ ArtifactLibrary } = await import(pathToFileURL(resolve(projectRoot, "src/shell/ArtifactLibrary.tsx")).href));
    actualArtifactLibraryComponent = ArtifactLibrary;
  } catch (error) {
    assert.fail(`actual Library source graph failed to load: ${error?.stack || error}`);
  }

  const renderErrors = [];
  const mounted = await mount(React.createElement(
    OneTaskLibraryRenderErrorBoundary,
    { onError: (error, info) => renderErrors.push({ error, componentStack: info?.componentStack || "" }) },
    React.createElement(ArtifactLibrary, { accent: "#0ea5e9" }),
  ));
  try {
    // A bounded flush allows real library fetch, direct read-only detail restore,
    // and lazy native image route to settle. React's too-many-renders is captured
    // instead of hanging the test process if this full graph regresses.
    await act(async () => {
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    });
    assert.deepEqual(renderErrors, [], renderErrors.map((error) => error.stack || error.message).join("\n"));
    assert.equal(mounted.container.querySelector("[data-render-error]"), null);
    assert.ok(mounted.container.querySelector('[data-library-layout="collection"]'), "a bare item URL restores read-only Library detail, not an editor/task");
    assert.equal(mounted.container.querySelector("[data-library-editor-host]"), null);
    assert.equal(trackedRequests.some((request) => request.path.startsWith("/v1/agent/tasks")), false, "opening Library detail must not create a Task");
  } finally {
    await mounted.destroy();
    delete globalThis.__oneTaskLibraryNavigationCalls;
  }
});

test("real Library Edit keeps Task chat closed until the edit-bar agent action and sends live file context exactly once", { timeout: 35000 }, async () => {
  assert.ok(actualArtifactLibraryComponent, "first composition test imports the production Library graph");
  activeProjection = activeDocumentProjection;
  trackedRequests.length = 0;
  historyBackendFetchCount = 0;
  createdTaskRequests.length = 0;
  followUpTaskRequests.length = 0;
  nextSessionRevision = 1;
  sessionSnapshot = {};
  sessionTaskId = null;
  commandResponseEnabled = false;
  taskMessageStage = 0;
  persistedInlineEditorTaskIds.length = 0;
  uploadedLibraryFiles.length = 0;
  artifactRevisionCommits.length = 0;
  r2ProjectUrl = null;
  window.history.replaceState(null, "", "/library?item=one-task-library-document");

  const renderErrors = [];
  const mounted = await mount(React.createElement(
    OneTaskLibraryRenderErrorBoundary,
    { onError: (error, info) => renderErrors.push({ error, componentStack: info?.componentStack || "" }) },
    React.createElement(actualArtifactLibraryComponent, { accent: "#0ea5e9" }),
  ));
  try {
    const edit = await waitFor(mounted, '[data-artifact-action="edit"]', "real Library detail Edit action");
    assert.equal(createdTaskRequests.length, 0, "opening the read-only item detail creates no Task");
    assert.equal(mounted.container.querySelector("[data-library-editor-host]"), null);
    assert.equal(edit.disabled, false, "the owner document has a real available typed-edit action");

    await click(edit);
    const editorHost = await waitFor(mounted, '[data-library-editor-host="agent-workspace"]', "standalone Task-shaped editor host");
    const split = await waitFor(mounted, "[data-workspace-split]", "real shared split workspace");
    const leftPane = await waitFor(mounted, '[data-workspace-pane="left"]', "hidden Task conversation pane");
    assert.equal(leftPane.dataset.workspacePaneState, "closed", "opening a standalone Library file keeps its Task conversation closed");
    assert.equal(leftPane.getAttribute("aria-hidden"), "true", "the unopened conversation is inaccessible until explicitly requested");
    const editBarAgent = await waitFor(mounted, '[data-edit-bar-agent]', "explicit edit-bar agent action");
    await click(editBarAgent);
    const agentHeader = await waitFor(mounted, "[data-agent-chat-header]", "normal Agent Task header");
    const workbenchHeader = await waitFor(mounted, "[data-advanced-workbench-header]", "real AdvancedContentWorkbench header");
    const rightPane = mounted.container.querySelector('[data-workspace-pane="main"]');
    assert.ok(rightPane && leftPane, "the real Task chat and file editor occupy the two shared panes");
    assert.equal(leftPane.dataset.workspacePaneState, "open", "the explicit edit-bar action reveals the existing Task conversation");
    assert.equal(mounted.container.querySelectorAll("[data-workspace-split]").length, 1, "no nested/fallback split is mounted");
    assert.equal(mounted.container.querySelectorAll('[data-workspace-pane="main"]').length, 1);
    assert.equal(mounted.container.querySelectorAll('[data-workspace-pane="left"]').length, 1);
    assert.equal(createdTaskRequests.length, 0, "opening the chat pane itself does not create a Task");

    const documentEditor = await waitFor(
      mounted,
      '[data-workspace-pane="main"] [aria-label="文档编辑区"] .ProseMirror',
      "native Tiptap editor for the selected document",
      12000,
    );
    assert.match(documentEditor.textContent || "", /Initial real content/);
    const composer = await waitFor(
      mounted,
      '[data-workspace-pane="left"] [contenteditable="true"].oc-slot-editor',
      "real AgentChat composer",
    );
    const send = mounted.container.querySelector('[data-workspace-pane="left"] [aria-label="发送"]');
    assert.ok(send, "normal Task composer exposes its send action");
    assert.ok(editorHost.contains(rightPane) && split.contains(agentHeader) && split.contains(workbenchHeader));

    const prompt = "请在右侧文档末尾添加验收标记。";
    await act(async () => {
      composer.focus();
      const paragraph = composer.querySelector("p");
      if (paragraph) paragraph.textContent = prompt;
      else composer.innerHTML = `<p>${prompt}</p>`;
      composer.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: prompt,
      }));
    });
    assert.equal(send.disabled, false, "real composer enables Send for the typed prompt");
    await click(send);
    const deadline = Date.now() + 12000;
    while (createdTaskRequests.length === 0 && Date.now() < deadline) {
      await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 50)));
    }
    assert.equal(createdTaskRequests.length, 1, `first Library chat creates exactly one new Task; visible text=${(mounted.container.textContent || "").slice(0, 700)}; requests=${JSON.stringify(trackedRequests.map(({ method, path, body }) => `${method} ${path}${body ? ` ${body.slice(0, 200)}` : ""}`))}`);
    const taskRequest = createdTaskRequests[0];
    assert.equal(taskRequest.prompt, prompt);
    assert.match(taskRequest.hidden_context || "", /〔右侧 Library 文件：以下是当前编辑器中的实时内容/);
    assert.match(taskRequest.hidden_context || "", /artifactId=one-task-library-document/);
    assert.match(taskRequest.hidden_context || "", /revisionId=one-task-library-document-r1/);
    assert.match(taskRequest.hidden_context || "", /type=document/);
    assert.match(taskRequest.hidden_context || "", /Initial real content/);
    assert.equal(mounted.container.querySelector('[data-library-editor-host="agent-workspace"]'), editorHost, "creating the Task does not remount the Library editor host");
    assert.equal(mounted.container.querySelector('[data-workspace-pane="main"] [aria-label="文档编辑区"] .ProseMirror'), documentEditor, "Task creation retains the exact same live editor node");
    assert.match(documentEditor.textContent || "", /Initial real content/);
    assert.equal(window.location.pathname, "/library", "creating the Task stays on the Library route");
    assert.equal(window.location.search, "?item=one-task-library-document");
    const reviewAccept = await waitFor(
      mounted,
      '[data-agent-review-action="accept"]',
      "real agent command routed into the native review gate",
      12000,
    );
    assert.doesNotMatch(documentEditor.textContent || "", /Agent accepted marker/, "mutating agent command is not applied before review acceptance");
    await click(reviewAccept);
    const acceptedDeadline = Date.now() + 12000;
    while (!(documentEditor.textContent || "").includes("Agent accepted marker") && Date.now() < acceptedDeadline) {
      await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 40)));
    }
    assert.match(documentEditor.textContent || "", /Agent accepted marker/, "accepting the real review applies the native Tiptap command to the same open Library file");
    assert.equal(mounted.container.querySelector('[data-library-editor-host="agent-workspace"]'), editorHost);
    assert.equal(mounted.container.querySelector('[data-workspace-pane="main"] [aria-label="文档编辑区"] .ProseMirror'), documentEditor);

    const followUp = "请把这份修改保存成原文件的新版本。";
    await act(async () => {
      composer.focus();
      const paragraph = composer.querySelector("p");
      if (paragraph) paragraph.textContent = followUp;
      else composer.innerHTML = `<p>${followUp}</p>`;
      composer.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: followUp,
      }));
    });
    const followUpSend = mounted.container.querySelector('[data-workspace-pane="left"] [aria-label="发送"]');
    assert.ok(followUpSend, "the existing Task composer remains available for follow-up");
    assert.equal(followUpSend.disabled, false, "the follow-up prompt enables the real composer send action");
    await click(followUpSend);
    const followUpDeadline = Date.now() + 10000;
    while (followUpTaskRequests.length === 0 && Date.now() < followUpDeadline) {
      await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 40)));
    }
    assert.equal(followUpTaskRequests.length, 1, `the existing Task receives the next user turn through its follow-up endpoint; requests=${JSON.stringify(trackedRequests.map(({ method, path, body }) => `${method} ${path}${body ? ` ${body.slice(0, 160)}` : ""}`))}; composer=${composer.textContent}; sendDisabled=${followUpSend.disabled}`);
    assert.equal(createdTaskRequests.length, 1, "an existing Library Task is never duplicated by a follow-up turn");
    assert.equal(followUpTaskRequests[0].prompt, followUp);
    assert.match(followUpTaskRequests[0].hidden_context || "", /Agent accepted marker/, "the follow-up pins the currently edited file contents");
    const saveAccept = await waitFor(
      mounted,
      '[data-agent-review-action="accept"]',
      "real review gate for the Library revision-save command",
      12000,
    );
    await click(saveAccept);
    const commitDeadline = Date.now() + 10000;
    while (artifactRevisionCommits.length === 0 && Date.now() < commitDeadline) {
      await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 50)));
    }
    assert.equal(artifactRevisionCommits.length, 1, `accepted agent content is committed through the existing typed artifact revision producer; uploads=${JSON.stringify(uploadedLibraryFiles.map(({ filename, content }) => ({ filename, content: content.slice(0, 220) })))}; requests=${JSON.stringify(trackedRequests.map(({ method, path, body }) => `${method} ${path}${body ? ` ${body.slice(0, 180)}` : ""}`))}; ui=${(mounted.container.textContent || "").slice(-600)}`);
    const revisionCommit = artifactRevisionCommits[0];
    assert.equal(revisionCommit.artifactId, "one-task-library-document");
    assert.equal(revisionCommit.commit.expected_revision_id, "one-task-library-document-r1", "revision commit uses the exact opened Library revision as its CAS base");
    assert.equal(revisionCommit.headers["if-match"], "one-task-library-document-r1");
    assert.equal(activeProjection.revision_id, "one-task-library-document-r2", "the accepted edit returns a new revision of the same artifact root");
    const projectRendition = revisionCommit.commit.renditions?.find((rendition) => rendition.purpose === "editor_manifest");
    assert.ok(projectRendition?.url, "the r2 revision must point at its exact editor-project rendition");
    const projectUpload = uploadedLibraryFiles.find((upload) => upload.url === projectRendition.url);
    assert.ok(projectUpload, `the editor-project bytes referenced by r2 were uploaded; uploads=${JSON.stringify(uploadedLibraryFiles.map(({ filename, content, url }) => ({ filename, url, hasAcceptedMarker: content.includes("Agent accepted marker") })))}; r2 project URL=${projectRendition.url}`);
    assert.match(projectUpload.content, /Agent accepted marker/, `the editor project referenced by r2 contains the accepted text; uploads=${JSON.stringify(uploadedLibraryFiles.map(({ filename, content }) => ({ filename, hasAcceptedMarker: content.includes("Agent accepted marker") })))}; r2 project URL=${projectRendition.url}`);
    r2ProjectUrl = projectRendition.url;
    assert.equal(sessionTaskId, "one-task-library-created-task", "the real Workbench snapshot remains linked to the newly created Task");
    assert.ok(persistedInlineEditorTaskIds.includes("one-task-library-created-task"), "the task-linked file head was written through the real WorkspaceSession snapshot API");
    const historyDeadline = Date.now() + 7000;
    while (persistedInlineEditorHead()?.item?.revisionId !== "one-task-library-document-r2" && Date.now() < historyDeadline) {
      await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 40)));
    }
    const persistedHead = persistedInlineEditorHead();
    assert.ok(persistedHead, `the same Library artifact remains reopenable from the current Task snapshot; snapshot=${JSON.stringify(sessionSnapshot)}; requests=${JSON.stringify(trackedRequests.map(({ method, path, body }) => `${method} ${path}${body ? ` ${body.slice(0, 240)}` : ""}`))}; ui=${(mounted.container.textContent || "").slice(-900)}`);
    assert.equal(persistedHead?.task_id, "one-task-library-created-task");
    assert.equal(
      persistedHead?.item?.revisionId,
      "one-task-library-document-r2",
      `the Task snapshot advances to the revision returned by the accepted save command; snapshot=${JSON.stringify(sessionSnapshot)}; requests=${JSON.stringify(trackedRequests.map(({ method, path, body }) => `${method} ${path}${body ? ` ${body.slice(0, 320)}` : ""}`))}; uploads=${JSON.stringify(uploadedLibraryFiles.map(({ filename, url, content }) => ({ filename, url, hasAcceptedMarker: content.includes("Agent accepted marker") })))}; UI=${(mounted.container.textContent || "").slice(-1200)}`,
    );
    assert.equal(persistedHead?.item?.meta?.editor_project_url, projectRendition.url);
    assert.deepEqual(renderErrors, [], renderErrors.map((error) => error.stack || error.message).join("\n"));
    assert.equal(mounted.container.querySelector("[data-render-error]"), null);
  } finally {
    await mounted.destroy();
    const saver = await import(pathToFileURL(resolve(projectRoot, "src/shell/advanced-background-saver.ts")).href);
    const reviewInstall = await import(pathToFileURL(resolve(projectRoot, "src/shell/agent-review/install.ts")).href);
    const reviewInbox = await import(pathToFileURL(resolve(projectRoot, "src/shell/agent-review/inbox.ts")).href);
    await act(async () => {
      saver.resetBackgroundSaverForTests();
      reviewInstall.uninstallAgentReviewGate();
      reviewInstall.uninstallSelectionBridge();
      reviewInbox.resetAgentReviewInbox();
    });
  }
});

test("real Task history reopens the saved Library revision and follows up on that same Task", { timeout: 35000 }, async () => {
  assert.equal(activeProjection.revision_id, "one-task-library-document-r2", "the prior test must have received the committed revision receipt");
  const savedHead = persistedInlineEditorHead();
  assert.equal(savedHead?.task_id, "one-task-library-created-task");
  assert.equal(savedHead?.item?.revisionId, "one-task-library-document-r2");
  const uploadCountBeforeHistoryOpen = uploadedLibraryFiles.length;
  const revisionCommitCountBeforeHistoryOpen = artifactRevisionCommits.length;
  commandResponseEnabled = false;
  taskMessageStage = 0;
  followUpTaskRequests.length = 0;
  const createdBeforeHistoryTurn = createdTaskRequests.length;
  trackedRequests.length = 0;
  historyBackendFetchCount = 0;
  window.history.replaceState(null, "", "/history/one-task-library-session");
  globalThis.__oneTaskLibraryNavigationCalls = [];

  const projectRoot = resolve(new URL("..", import.meta.url).pathname);
  let HistoryDetail;
  let WorkspaceSelectionProvider;
  try {
    ({ HistoryDetail } = await import(pathToFileURL(resolve(projectRoot, "src/shell/HistoryMasterDetail.tsx")).href));
    ({ WorkspaceSelectionProvider } = await import(pathToFileURL(resolve(projectRoot, "src/shell/WorkspaceSelection.tsx")).href));
  } catch (error) {
    assert.fail(`real HistoryDetail/selection graph failed to load: ${error?.stack || error}`);
  }

  const renderErrors = [];
  const mounted = await mount(React.createElement(
    OneTaskLibraryRenderErrorBoundary,
    { onError: (error, info) => renderErrors.push({ error, componentStack: info?.componentStack || "" }) },
    React.createElement(
      WorkspaceSelectionProvider,
      null,
      React.createElement(HistoryDetail, { siteId: "oceanleo", accent: "#0ea5e9" }),
    ),
  ));
  try {
    assert.equal(trackedRequests.some((request) => request.method === "GET" && request.path.startsWith("/v1/agent/sessions/one-task-library-session")), true, "HistoryDetail reloads the original app session through the real session API");
    const split = await waitFor(mounted, "[data-workspace-split]", "real shared split restored from Task history");
    const agentHeader = await waitFor(mounted, "[data-agent-chat-header]", "original Task chat restored from history");
    await waitFor(mounted, "[data-advanced-workbench-header]", "same native file workbench restored from Task history");
    const editor = await waitFor(
      mounted,
      '[data-workspace-pane="main"] [aria-label="文档编辑区"] .ProseMirror',
      "native Tiptap editor restored from the saved inline Library head",
      12000,
    );
    assert.ok(split.contains(agentHeader));
    assert.match(editor.textContent || "", /Initial real content/);
    assert.match(editor.textContent || "", /Agent accepted marker/, "history reopens the uploaded saved project JSON, not the original r1 source");
    assert.equal((editor.textContent.match(/Agent accepted marker/g) || []).length, 1, "history restores the saved marker exactly once rather than replaying a command");
    assert.ok(r2ProjectUrl, "the prior r2 save identifies the exact uploaded editor-project URL");
    assert.ok(trackedRequests.some((request) => request.method === "GET" && request.url === r2ProjectUrl), "history actually fetches the exact project rendition referenced by the r2 revision");
    assert.equal(mounted.container.querySelector("[data-agent-review-action]"), null, "History does not replay the prior assistant command into a new review card");
    assert.equal(uploadedLibraryFiles.length, uploadCountBeforeHistoryOpen, "reopening History does not upload another copy of the document");
    assert.equal(artifactRevisionCommits.length, revisionCommitCountBeforeHistoryOpen, "reopening History does not commit another Library revision");
    assert.ok(historyBackendFetchCount <= 300, "the History detail uses a bounded number of real session/task reload requests");
    assert.equal(mounted.container.querySelectorAll("[data-workspace-split]").length, 1);
    assert.equal(createdTaskRequests.length, createdBeforeHistoryTurn);

    const composer = await waitFor(mounted, '[data-workspace-pane="left"] [contenteditable="true"].oc-slot-editor', "real history Task composer");
    const send = mounted.container.querySelector('[data-workspace-pane="left"] [aria-label="发送"]');
    assert.ok(send);
    const prompt = "请继续检查刚保存的文档内容。";
    await act(async () => {
      composer.focus();
      const paragraph = composer.querySelector("p");
      if (paragraph) paragraph.textContent = prompt;
      else composer.innerHTML = `<p>${prompt}</p>`;
      composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
    });
    const activeSend = mounted.container.querySelector('[data-workspace-pane="left"] [aria-label="发送"]');
    assert.ok(activeSend && !activeSend.disabled, "history restores an enabled composer on the existing Task");
    await click(activeSend);
    const followUpDeadline = Date.now() + 10000;
    while (followUpTaskRequests.length === 0 && Date.now() < followUpDeadline) {
      await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 40)));
    }
    assert.equal(followUpTaskRequests.length, 1, "history sends the next user turn through the existing Task follow-up endpoint");
    assert.equal(followUpTaskRequests[0].prompt, prompt);
    assert.match(followUpTaskRequests[0].hidden_context || "", /artifactId=one-task-library-document/);
    assert.match(followUpTaskRequests[0].hidden_context || "", /revisionId=one-task-library-document-r2/);
    assert.match(followUpTaskRequests[0].hidden_context || "", /Agent accepted marker/);
    assert.equal(createdTaskRequests.length, createdBeforeHistoryTurn, "reopening and sending from Task history never creates another Task");
    assert.deepEqual(renderErrors, [], renderErrors.map((error) => error.stack || error.message).join("\n"));
    assert.equal(mounted.container.querySelector("[data-render-error]"), null);
  } finally {
    await mounted.destroy();
    const saver = await import(pathToFileURL(resolve(projectRoot, "src/shell/advanced-background-saver.ts")).href);
    const reviewInstall = await import(pathToFileURL(resolve(projectRoot, "src/shell/agent-review/install.ts")).href);
    const reviewInbox = await import(pathToFileURL(resolve(projectRoot, "src/shell/agent-review/inbox.ts")).href);
    await act(async () => {
      saver.resetBackgroundSaverForTests();
      reviewInstall.uninstallAgentReviewGate();
      reviewInstall.uninstallSelectionBridge();
      reviewInbox.resetAgentReviewInbox();
    });
    delete globalThis.__oneTaskLibraryNavigationCalls;
  }
});

test("an existing Task keeps its original chat when ResultCanvas My Library opens and edits a file", { timeout: 35000 }, async () => {
  // Exercise the committed Library revision through the real Task → ResultCanvas
  // → MyLibrary → Edit branch; this must resolve the saved native project, not
  // silently fall back to the original delivery document.
  activeProjection = structuredClone(activeProjection);
  assert.equal(activeProjection.revision_id, "one-task-library-document-r2");
  assert.ok(actualArtifactLibraryComponent, "the real Library module graph has been loaded by the route acceptance");
  trackedRequests.length = 0;
  createdTaskRequests.length = 0;
  existingTaskFollowups.length = 0;
  existingTaskSessionSnapshot = {};
  existingTaskSessionRevision = 1;
  existingTaskCommandResponseReady = false;
  holdExistingTaskFollowup = false;
  pendingExistingTaskFollowup = null;
  window.history.replaceState(null, "", "/tasks/one-task-library-existing-task");

  const projectRoot = resolve(new URL("..", import.meta.url).pathname);
  const [{ AgentChat }, { WorkspaceSessionProvider }] = await Promise.all([
    import(pathToFileURL(resolve(projectRoot, "src/shell/AgentChat.tsx")).href),
    import(pathToFileURL(resolve(projectRoot, "src/shell/WorkspaceSession.tsx")).href),
  ]);
  const { resetLibraryCurrentIdentityForTests } = await import(pathToFileURL(resolve(projectRoot, "src/shell/library-current-identity.ts")).href);
  resetLibraryCurrentIdentityForTests();
  const session = existingTaskSessionReceipt();
  const renderErrors = [];
  const mounted = await mount(React.createElement(
    OneTaskLibraryRenderErrorBoundary,
    { onError: (error, info) => renderErrors.push({ error, componentStack: info?.componentStack || "" }) },
    React.createElement(
      WorkspaceSessionProvider,
      { siteId: "oceanleo", appId: "oceanleo", initialSession: session, mode: "history", resumeLatest: false },
      React.createElement(AgentChat, {
        siteId: "oceanleo",
        taskId: "one-task-library-existing-task",
        accent: "#0ea5e9",
      }),
    ),
  ));
  try {
    const agentHeader = await waitFor(mounted, "[data-agent-chat-header]", "the existing Task's real AgentChat header");
    const split = await waitFor(mounted, "[data-workspace-split]", "the existing Task's shared SplitWorkspace");
    assert.equal(mounted.container.querySelectorAll("[data-workspace-split]").length, 1);
    await click(mounted.container.querySelector('[aria-label="展开"]'));
    const libraryCard = await waitFor(mounted, '[data-workspace-card="mine"]', "the real ResultCanvas My Library slot");
    await click(libraryCard);
    await waitFor(mounted, '[data-workspace-slot-panel="mine"] [data-collection-card-grid]', "the existing Task's actual MyLibrary shelf");
    const itemCard = await waitFor(mounted, 'button[aria-label="预览「Library acceptance document」"]', "the current saved Library document card");
    await click(itemCard);
    const edit = await waitFor(mounted, '[data-artifact-action="edit"]', "the actual MyLibrary detail Edit action");
    assert.equal(createdTaskRequests.length, 0, "opening My Library and its read-only detail creates no task");
    await click(edit);

    const editor = await waitFor(
      mounted,
      '[data-workspace-pane="main"] [aria-label="文档编辑区"] .ProseMirror',
      "the native editor opened by ResultCanvas → MyLibrary → Edit",
      12000,
    );
    const workbenchHeader = await waitFor(mounted, "[data-advanced-workbench-header]", "the native workbench header in the existing Task pane");
    assert.ok(split.contains(agentHeader), "the original AgentChat remains the left pane ancestor");
    assert.ok(split.contains(workbenchHeader));
    assert.match(editor.textContent || "", /Initial real content/);
    assert.match(editor.textContent || "", /Agent accepted marker/, "My Library Edit reopens the current saved native project");
    assert.equal(mounted.container.querySelectorAll("[data-workspace-split]").length, 1, "Edit does not introduce a nested chat or split shell");
    assert.equal(mounted.container.querySelector('[data-workspace-pane="left"] [data-agent-chat-header]'), agentHeader, "the existing Task chat header node is retained across Edit");
    assert.equal(createdTaskRequests.length, 0, "editing a file inside an existing Task never creates another task");

    const composer = await waitFor(mounted, '[data-workspace-pane="left"] [contenteditable="true"].oc-slot-editor', "the existing Task composer");
    const prompt = "请基于右侧当前文档继续检查保存的标记。";
    await act(async () => {
      composer.focus();
      const paragraph = composer.querySelector("p");
      if (paragraph) paragraph.textContent = prompt;
      else composer.innerHTML = `<p>${prompt}</p>`;
      composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
    });
    const send = mounted.container.querySelector('[data-workspace-pane="left"] [aria-label="发送"]');
    assert.ok(send && !send.disabled);
    await click(send);
    const followupDeadline = Date.now() + 10000;
    while (existingTaskFollowups.length === 0 && Date.now() < followupDeadline) {
      await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 40)));
    }
    assert.equal(existingTaskFollowups.length, 1, "the next message is delivered to the original Task follow-up route");
    assert.equal(existingTaskFollowups[0].prompt, prompt);
    assert.match(existingTaskFollowups[0].hidden_context || "", /artifactId=one-task-library-document/);
    assert.match(existingTaskFollowups[0].hidden_context || "", /revisionId=one-task-library-document-r2/);
    assert.match(existingTaskFollowups[0].hidden_context || "", /Agent accepted marker/);
    assert.equal(trackedRequests.some((request) => request.method === "POST" && request.path === "/v1/agent/tasks"), false);
    assert.equal(createdTaskRequests.length, 0);
    assert.deepEqual(renderErrors, [], renderErrors.map((error) => error.stack || error.message).join("\n"));
  } finally {
    await mounted.destroy();
    const saver = await import(pathToFileURL(resolve(projectRoot, "src/shell/advanced-background-saver.ts")).href);
    const reviewInstall = await import(pathToFileURL(resolve(projectRoot, "src/shell/agent-review/install.ts")).href);
    const reviewInbox = await import(pathToFileURL(resolve(projectRoot, "src/shell/agent-review/inbox.ts")).href);
    await act(async () => {
      saver.resetBackgroundSaverForTests();
      reviewInstall.uninstallAgentReviewGate();
      reviewInstall.uninstallSelectionBridge();
      reviewInbox.resetAgentReviewInbox();
    });
  }
});

test("MaterialStandaloneEditor existingPane retains the Task chat and rejects a stale in-flight reply", { timeout: 35000 }, async () => {
  activeProjection = structuredClone(activeProjection);
  assert.equal(activeProjection.revision_id, "one-task-library-document-r2");
  assert.ok(actualArtifactLibraryComponent);
  trackedRequests.length = 0;
  createdTaskRequests.length = 0;
  existingTaskFollowups.length = 0;
  existingTaskSessionSnapshot = {};
  existingTaskSessionRevision = 1;
  existingTaskCommandResponseReady = false;
  holdExistingTaskFollowup = false;
  pendingExistingTaskFollowup = null;
  window.history.replaceState(null, "", "/library?item=one-task-library-document");

  const projectRoot = resolve(new URL("..", import.meta.url).pathname);
  const [{ AgentChat }, { WorkspaceSessionProvider }] = await Promise.all([
    import(pathToFileURL(resolve(projectRoot, "src/shell/AgentChat.tsx")).href),
    import(pathToFileURL(resolve(projectRoot, "src/shell/WorkspaceSession.tsx")).href),
  ]);
  const { resetLibraryCurrentIdentityForTests } = await import(pathToFileURL(resolve(projectRoot, "src/shell/library-current-identity.ts")).href);
  resetLibraryCurrentIdentityForTests();
  const session = existingTaskSessionReceipt();
  const renderErrors = [];
  const mounted = await mount(React.createElement(
    OneTaskLibraryRenderErrorBoundary,
    { onError: (error, info) => renderErrors.push({ error, componentStack: info?.componentStack || "" }) },
    React.createElement(
      WorkspaceSessionProvider,
      { siteId: "oceanleo", appId: "oceanleo", initialSession: session, mode: "history", resumeLatest: false },
      React.createElement(AgentChat, {
        siteId: "oceanleo",
        taskId: "one-task-library-existing-task",
        accent: "#0ea5e9",
        workspaceContent: React.createElement(actualArtifactLibraryComponent, { accent: "#0ea5e9" }),
      }),
    ),
  ));
  try {
    const agentHeader = await waitFor(mounted, "[data-agent-chat-header]", "the existing Task's original AgentChat header");
    const split = await waitFor(mounted, "[data-workspace-split]", "the original Task SplitWorkspace");
    assert.equal(mounted.container.querySelectorAll("[data-workspace-split]").length, 1);
    await click(mounted.container.querySelector('[aria-label="展开"]'));
    const edit = await waitFor(mounted, '[data-artifact-action="edit"]', "the actual deep-linked Library detail Edit action");
    assert.equal(createdTaskRequests.length, 0, "the Library preview is read-only and does not create a Task");
    await click(edit);
    const editorHost = await waitFor(mounted, '[data-library-editor-host="existing-workspace"]', "MaterialStandaloneEditor's existingPane host");
    const editor = await waitFor(
      mounted,
      '[data-workspace-pane="main"] [aria-label="文档编辑区"] .ProseMirror',
      "the native editor retained in the existing Task's right pane",
      12000,
    );
    const workbenchHeader = await waitFor(mounted, "[data-advanced-workbench-header]", "the native existingPane editor header");
    assert.ok(editorHost.contains(editor), "MaterialStandaloneEditor's existingPane host contains the actual native editor");
    assert.ok(split.contains(workbenchHeader), "the native editor header is mounted by the ancestor SplitWorkspace chrome");
    assert.ok(split.contains(agentHeader));
    assert.equal(mounted.container.querySelectorAll("[data-workspace-split]").length, 1, "existingPane must not mount a second AgentChat/SplitWorkspace");
    assert.equal(mounted.container.querySelector('[data-workspace-pane="left"] [data-agent-chat-header]'), agentHeader, "the original Task conversation is the left pane beside the Library file");
    assert.match(editor.textContent || "", /Initial real content/);
    assert.match(editor.textContent || "", /Agent accepted marker/);
    assert.equal(createdTaskRequests.length, 0);

    const composer = await waitFor(mounted, '[data-workspace-pane="left"] [contenteditable="true"].oc-slot-editor', "the existing Task composer");
    const fillComposer = async (prompt) => {
      await act(async () => {
        composer.focus();
        const paragraph = composer.querySelector("p");
        if (paragraph) paragraph.textContent = prompt;
        else composer.innerHTML = `<p>${prompt}</p>`;
        composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
      });
      const send = mounted.container.querySelector('[data-workspace-pane="left"] [aria-label="发送"]');
      assert.ok(send && !send.disabled, `real existing-task composer is enabled for “${prompt}”`);
      await click(send);
    };
    await fillComposer("请继续检查右侧文档。");
    const firstFollowupDeadline = Date.now() + 10000;
    while (existingTaskFollowups.length < 1 && Date.now() < firstFollowupDeadline) {
      await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 40)));
    }
    assert.equal(existingTaskFollowups.length, 1, "the existing Task accepts a normal follow-up before the stale-response case");
    assert.match(existingTaskFollowups[0].hidden_context || "", /artifactId=one-task-library-document/);
    assert.match(existingTaskFollowups[0].hidden_context || "", /revisionId=one-task-library-document-r2/);
    assert.match(existingTaskFollowups[0].hidden_context || "", /Agent accepted marker/);
    assert.equal(createdTaskRequests.length, 0);

    holdExistingTaskFollowup = true;
    await fillComposer("我正在本地修改；请不要把早先生成的旧回复套到新内容上。");
    const pendingDeadline = Date.now() + 10000;
    while (existingTaskFollowups.length < 2 && Date.now() < pendingDeadline) {
      await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 40)));
    }
    assert.equal(existingTaskFollowups.length, 2, "the second actual follow-up is in flight and its transport is held");
    assert.equal(typeof pendingExistingTaskFollowup, "function");

    const editorView = editor.editor?.view;
    assert.ok(editorView?.state?.tr, "the mounted EditorContent exposes its real Tiptap Editor and ProseMirror view");
    const operatorEdit = "Operator changed while response pending";
    await act(async () => {
      const selection = editorView.state.selection;
      editorView.dispatch(editorView.state.tr.insertText(operatorEdit, selection.from, selection.to));
    });
    assert.match(editor.textContent || "", /Operator changed while response pending/, "the native Tiptap/ProseMirror document changes before the agent response returns");
    existingTaskCommandResponseReady = true;
    await act(async () => pendingExistingTaskFollowup?.());

    const staleText = "右侧 Library 文件在你发出这轮消息后已切换；这条旧回复不会作用于新文件。";
    const staleDeadline = Date.now() + 12000;
    while (!(mounted.container.querySelector("[data-editor-command-notes]")?.textContent || "").includes(staleText) && Date.now() < staleDeadline) {
      await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 40)));
    }
    assert.match(mounted.container.querySelector("[data-editor-command-notes]")?.textContent || "", new RegExp(staleText));
    assert.match(editor.textContent || "", /Operator changed while response pending/);
    assert.doesNotMatch(editor.textContent || "", /STALE RESPONSE MUST NOT APPLY/, "a command from the old turn cannot mutate the file after the native edit changes its pin");
    assert.equal(mounted.container.querySelector('[data-agent-review-action="accept"]'), null, "a stale command is rejected before opening the review/confirm gate");
    const staleReceipt = trackedRequests
      .filter((request) => request.method === "POST" && request.path === "/v1/agent/tasks/one-task-library-existing-task/messages")
      .map((request) => { try { return JSON.parse(request.body); } catch { return null; } })
      .find((request) => request?.prompt?.startsWith("〔编辑器〕") && request?.hidden_context?.includes('"staleTarget":true'));
    assert.ok(staleReceipt, "the real editor-command bridge reports stale-target rejection against the existing Task");
    assert.equal(createdTaskRequests.length, 0, "neither follow-up nor stale response creates a replacement Task");
    assert.deepEqual(renderErrors, [], renderErrors.map((error) => error.stack || error.message).join("\n"));
  } finally {
    holdExistingTaskFollowup = false;
    pendingExistingTaskFollowup?.();
    pendingExistingTaskFollowup = null;
    await mounted.destroy();
    const saver = await import(pathToFileURL(resolve(projectRoot, "src/shell/advanced-background-saver.ts")).href);
    const reviewInstall = await import(pathToFileURL(resolve(projectRoot, "src/shell/agent-review/install.ts")).href);
    const reviewInbox = await import(pathToFileURL(resolve(projectRoot, "src/shell/agent-review/inbox.ts")).href);
    await act(async () => {
      saver.resetBackgroundSaverForTests();
      reviewInstall.uninstallAgentReviewGate();
      reviewInstall.uninstallSelectionBridge();
      reviewInbox.resetAgentReviewInbox();
    });
  }
});

test("switching an existing Task's native workbench to another Library root rejects the old reply", { timeout: 35000 }, async () => {
  activeProjection = structuredClone(activeProjection);
  assert.equal(activeProjection.revision_id, "one-task-library-document-r2");
  includeSecondLibraryItem = true;
  trackedRequests.length = 0;
  createdTaskRequests.length = 0;
  existingTaskFollowups.length = 0;
  existingTaskSessionSnapshot = {};
  existingTaskSessionRevision = 1;
  existingTaskCommandResponseReady = false;
  holdExistingTaskFollowup = false;
  pendingExistingTaskFollowup = null;
  window.history.replaceState(null, "", "/library?item=one-task-library-document");

  const projectRoot = resolve(new URL("..", import.meta.url).pathname);
  const [{ AgentChat }, { WorkspaceSessionProvider }] = await Promise.all([
    import(pathToFileURL(resolve(projectRoot, "src/shell/AgentChat.tsx")).href),
    import(pathToFileURL(resolve(projectRoot, "src/shell/WorkspaceSession.tsx")).href),
  ]);
  const { resetLibraryCurrentIdentityForTests } = await import(pathToFileURL(resolve(projectRoot, "src/shell/library-current-identity.ts")).href);
  resetLibraryCurrentIdentityForTests();
  const session = existingTaskSessionReceipt();
  const renderErrors = [];
  const mounted = await mount(React.createElement(
    OneTaskLibraryRenderErrorBoundary,
    { onError: (error, info) => renderErrors.push({ error, componentStack: info?.componentStack || "" }) },
    React.createElement(
      WorkspaceSessionProvider,
      { siteId: "oceanleo", appId: "oceanleo", initialSession: session, mode: "history", resumeLatest: false },
      React.createElement(AgentChat, {
        siteId: "oceanleo",
        taskId: "one-task-library-existing-task",
        accent: "#0ea5e9",
        workspaceContent: React.createElement(actualArtifactLibraryComponent, { accent: "#0ea5e9" }),
      }),
    ),
  ));
  try {
    const agentHeader = await waitFor(mounted, "[data-agent-chat-header]", "the original Task AgentChat header");
    const split = await waitFor(mounted, "[data-workspace-split]", "the original Task split workspace");
    await click(mounted.container.querySelector('[aria-label="展开"]'));
    const edit = await waitFor(mounted, '[data-artifact-action="edit"]', "the real current Library detail Edit action");
    assert.equal(createdTaskRequests.length, 0, "the current Library deep link remains read-only until Edit");
    await click(edit);
    const firstHost = await waitFor(mounted, '[data-library-standalone-editor="one-task-library-document"]', "the first canonical Library editor opened through MyLibrary");
    const originalEditor = await waitFor(
      mounted,
      '[data-workspace-pane="main"] [aria-label="文档编辑区"] .ProseMirror',
      "the current Library revision's real native Tiptap editor",
      12000,
    );
    const host = await waitFor(mounted, '[data-library-editor-host="existing-workspace"]', "MaterialStandaloneEditor's real existing-workspace host");
    assert.match(originalEditor.textContent || "", /Agent accepted marker/);
    assert.ok(firstHost.contains(originalEditor) && host.contains(originalEditor));
    assert.equal(mounted.container.querySelectorAll("[data-workspace-split]").length, 1);

    const composer = await waitFor(mounted, '[data-workspace-pane="left"] [contenteditable="true"].oc-slot-editor', "the existing Task composer");
    holdExistingTaskFollowup = true;
    const prompt = "请在当前文档末尾加一段说明。";
    await act(async () => {
      composer.focus();
      const paragraph = composer.querySelector("p");
      if (paragraph) paragraph.textContent = prompt;
      else composer.innerHTML = `<p>${prompt}</p>`;
      composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
    });
    const send = mounted.container.querySelector('[data-workspace-pane="left"] [aria-label="发送"]');
    assert.ok(send && !send.disabled);
    await click(send);
    const pendingDeadline = Date.now() + 10000;
    while (existingTaskFollowups.length < 1 && Date.now() < pendingDeadline) {
      await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 40)));
    }
    assert.equal(existingTaskFollowups.length, 1, "the original Task has a real follow-up in flight against the first file");
    assert.match(existingTaskFollowups[0].hidden_context || "", /artifactId=one-task-library-document/);
    assert.match(existingTaskFollowups[0].hidden_context || "", /revisionId=one-task-library-document-r2/);
    assert.match(existingTaskFollowups[0].hidden_context || "", /Agent accepted marker/);
    assert.equal(typeof pendingExistingTaskFollowup, "function");

    // Leave the actual inline Library editor, return through the real shelf, and
    // open a second canonical Library artifact in that same existing Task pane.
    await click(mounted.container.querySelector('[aria-label="返回库"]'));
    await waitFor(mounted, '[data-artifact-action="edit"]', "the first Library detail after leaving the editor");
    await click(await waitFor(mounted, '[aria-label="返回列表"]', "the Library detail's real back-to-list action"));
    const secondCard = await waitFor(mounted, 'button[aria-label="预览「Second canonical Library document」"]', "the second distinct canonical Library artifact");
    await click(secondCard);
    await click(await waitFor(mounted, '[data-artifact-action="edit"]', "the second Library artifact's real Edit action"));
    const secondHost = await waitFor(mounted, '[data-library-standalone-editor="one-task-library-second-document"]', "the second standalone Library editor root");
    const nextEditor = await waitFor(
      mounted,
      '[data-workspace-pane="main"] [aria-label="文档编辑区"] .ProseMirror',
      "the second canonical Library root loaded by the real AdvancedContentWorkbench",
      12000,
    );
    const secondEditorHost = await waitFor(mounted, '[data-library-editor-host="existing-workspace"]', "MaterialStandaloneEditor's existingPane host for the second artifact");
    assert.notEqual(nextEditor, originalEditor, "switching roots mounts a fresh native document editor");
    assert.match(nextEditor.textContent || "", /Second canonical file content/);
    assert.doesNotMatch(nextEditor.textContent || "", /Agent accepted marker/);
    assert.ok(!firstHost.isConnected, "switching to a second artifact exits the previous MyLibrary editor root");
    assert.ok(secondHost.contains(nextEditor) && secondEditorHost.contains(nextEditor), "the new canonical file is inside a fresh real existingPane workbench");
    assert.equal(mounted.container.querySelector('[data-workspace-pane="left"] [data-agent-chat-header]'), agentHeader, "the original Task chat remains mounted while the editor target changes");
    assert.ok(split.contains(nextEditor));
    assert.equal(mounted.container.querySelectorAll("[data-workspace-split]").length, 1);

    const uploadCountBeforeStaleReply = uploadedLibraryFiles.length;
    const commitCountBeforeStaleReply = artifactRevisionCommits.length;
    existingTaskCommandResponseReady = true;
    await act(async () => pendingExistingTaskFollowup?.());
    const staleText = "右侧 Library 文件在你发出这轮消息后已切换；这条旧回复不会作用于新文件。";
    const staleDeadline = Date.now() + 12000;
    while (!(mounted.container.querySelector("[data-editor-command-notes]")?.textContent || "").includes(staleText) && Date.now() < staleDeadline) {
      await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 40)));
    }
    assert.match(mounted.container.querySelector("[data-editor-command-notes]")?.textContent || "", new RegExp(staleText));
    assert.doesNotMatch(nextEditor.textContent || "", /STALE RESPONSE MUST NOT APPLY/);
    assert.equal(mounted.container.querySelector("[data-agent-review-action]") , null, "a response pinned to the first file is rejected before review on the second file");
    const staleReceipt = trackedRequests
      .filter((request) => request.method === "POST" && request.path === "/v1/agent/tasks/one-task-library-existing-task/messages")
      .map((request) => { try { return JSON.parse(request.body); } catch { return null; } })
      .find((request) => request?.prompt?.startsWith("〔编辑器〕") && request?.hidden_context?.includes('"staleTarget":true'));
    assert.ok(staleReceipt, "the native editor-command bridge reports the root switch as a stale target");
    assert.equal(createdTaskRequests.length, 0, "switching roots and rejecting the old reply never creates a replacement Task");
    assert.equal(uploadedLibraryFiles.length, uploadCountBeforeStaleReply, "the rejected reply causes no upload for either file");
    assert.equal(artifactRevisionCommits.length, commitCountBeforeStaleReply, "the rejected reply creates no artifact revision");
    assert.deepEqual(renderErrors, [], renderErrors.map((error) => error.stack || error.message).join("\n"));
  } finally {
    holdExistingTaskFollowup = false;
    pendingExistingTaskFollowup?.();
    pendingExistingTaskFollowup = null;
    existingTaskCommandResponseReady = false;
    await mounted.destroy();
    const saver = await import(pathToFileURL(resolve(projectRoot, "src/shell/advanced-background-saver.ts")).href);
    const reviewInstall = await import(pathToFileURL(resolve(projectRoot, "src/shell/agent-review/install.ts")).href);
    const reviewInbox = await import(pathToFileURL(resolve(projectRoot, "src/shell/agent-review/inbox.ts")).href);
    await act(async () => {
      saver.resetBackgroundSaverForTests();
      reviewInstall.uninstallAgentReviewGate();
      reviewInstall.uninstallSelectionBridge();
      reviewInbox.resetAgentReviewInbox();
    });
    includeSecondLibraryItem = false;
  }
});
