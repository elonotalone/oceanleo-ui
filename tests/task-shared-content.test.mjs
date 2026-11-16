import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const TASK = "10000000-0000-4000-8000-000000000001";
const ART = "20000000-0000-4000-8000-000000000002";
const REV = "30000000-0000-4000-8000-000000000003";
const pathModule = await import(await compileModule("src/lib/task-content-path.ts"));
const { taskAttachmentPath, taskAttachmentRoute, hasTaskAttachmentPath, parseTaskAttachmentPath } = pathModule;
const route = (kind = "messages", rowId = 8) => taskAttachmentRoute({ taskId: TASK, kind, rowId, artifactId: ART, revisionId: REV });
const authStub = dataModule("export async function accessToken(){ return globalThis.__taskContentToken || null; }");
const configStub = dataModule('export const GATEWAY_BASE = "https://gateway.test";');
const aliases = {
  "../../lib/auth/client": authStub,
  "../../lib/auth/config": configStub,
  "../../i18n/ui/useUI": dataModule("export function useUI(){ return value => value; }"),
};
const clientUrl = await compileModule("src/shell/access/task-content-client.ts", aliases);
const { createTaskContentClient, TaskContentError } = await import(clientUrl);
const display = await import(await compileModule("src/lib/attachment-url.ts", {
  "./auth/client": authStub, "./auth/config": configStub,
  "../shell/access/task-content-client": clientUrl,
}));
const attachments = await import(await compileModule("src/shell/task-attachment-open.ts", {
  "../lib/attachment-url": await compileModule("src/lib/attachment-url.ts", { "./auth/client": authStub, "./auth/config": configStub, "../shell/access/task-content-client": clientUrl }),
  "./access/task-content-client": clientUrl,
  "./SplitWorkspace": dataModule("export function SplitWorkspace(){return null;} export function useRightPaneSlot(){return null;}"),
  "./ResultCanvas": dataModule("export function ResultCanvas(){return null;}"),
  "./WorkspaceSession": dataModule("export function WorkspaceSessionProvider(p){return p.children;}"),
  "./workspace-session-context": dataModule("export function useOptionalWorkspaceSession(){return null;}"),
}));
const archived = await import(await compileModule("src/shell/native-thread/NativeArchivedImage.tsx", { "../access/task-content-client": clientUrl }));
const { createMockTaskContentClient } = await import(await compileModule("tests/helpers/task-content-mock.ts"));
const { TaskContentPanel } = await import(await compileModule("src/shell/access/TaskContentPanel.tsx", { ...aliases, "./task-content-client": clientUrl }));

const never = () => { throw new Error("must not use caller Library or legacy archive routes"); };

test("pure task paths only accept exact native/ACP attachment routes and revision references", () => {
  assert.equal(taskAttachmentPath({ url: route() }), route());
  assert.equal(parseTaskAttachmentPath(route("frames", 12)).kind, "frames");
  assert.equal(taskAttachmentPath({ taskScopedUrl: route(), url: "blob:thumbnail" }), route());
  assert.equal(taskAttachmentRoute({ taskId: TASK, kind: "frames", rowId: 9, artifactId: ART }), null);
  for (const bad of [
    `https://evil.test${route()}`, `https://gateway.test${route()}`, `//evil.test${route()}`,
    route().replace("/messages/8/", "/messages/0/"), route().replace("/messages/8/", "/messages/9007199254740993/"),
    route().replace(TASK, "../elsewhere"), route().replace(REV, "..%2fsecret"), `${route()}&download=1`, `${route()}#fragment`,
    route().replace(`revision_id=${REV}`, `revision_id=${REV}&revision_id=${REV}`), route().replace(`revision_id=${REV}`, "revision_id="),
  ]) {
    assert.equal(taskAttachmentPath(bad), null, bad);
    assert.equal(hasTaskAttachmentPath(bad), true, bad);
  }
  assert.equal(hasTaskAttachmentPath({ artifact_id: ART, revision_id: REV }), false);
});

test("task byte reads use optional auth only on the exact gateway route, including public anonymous reads", async () => {
  for (const token of [null, "reader-token"]) {
    const calls = [];
    const client = createTaskContentClient({ tokenImpl: async () => token, baseUrl: "https://gateway.test", fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response("file bytes", { headers: { "Content-Type": "application/pdf" } });
    } });
    const blob = await client.attachment(route());
    assert.equal(await blob.text(), "file bytes");
    assert.equal(blob.type, "application/pdf");
    assert.equal(calls[0].url, `https://gateway.test${route()}`);
    assert.equal(calls[0].init.headers.Authorization, token ? `Bearer ${token}` : undefined);
    assert.equal(calls[0].init.redirect, "error", "a redirect must not forward task-reader credentials");
    assert.equal(calls[0].init.cache, "no-store");
    await assert.rejects(client.attachment(`https://evil.test${route()}`), error => error instanceof TaskContentError && error.status === 400);
    assert.equal(calls.length, 1, "malformed paths never reach fetch");
  }
});

test("scoped byte reads cap streaming bytes and do not follow a generic rendition fallback", async () => {
  const client = createTaskContentClient({ tokenImpl: async () => null, fetchImpl: async () => new Response("too many bytes") });
  await assert.rejects(client.attachment(route(), { maxBytes: 3 }), error => error.status === 413);
  const denied = createTaskContentClient({ tokenImpl: async () => "reader", fetchImpl: async () => new Response(null, { status: 404 }) });
  await assert.rejects(denied.attachment(route()), error => error.status === 404);
});

test("shared sent files open a read-only local sidebar item without caller Library identity or actions", async () => {
  for (const kind of ["messages", "frames"]) {
    const calls = [];
    const att = { url: route(kind), artifact_id: ART, revision_id: REV, name: "report.pdf", mime: "application/pdf" };
    assert.equal(attachments.immediateTaskAttachment(att), null);
    assert.equal(attachments.taskAttachmentLibraryAction(att), null);
    const target = await attachments.resolveTaskAttachment(att, "oceanleo", {
      loadLibraryItem: never, resolveUrl: never, loadNativeArchive: never,
      async loadTaskAttachment(path, mime) { calls.push([path, mime]); return "blob:scoped-file"; },
    });
    assert.deepEqual(calls, [[route(kind), "application/pdf"]]);
    assert.equal(target.mode, "preview");
    assert.equal(target.item.url, "blob:scoped-file");
    assert.equal(target.item.meta.task_scoped_attachment, true);
    assert.equal(target.item.artifactId, undefined);
    assert.equal(target.item.revisionId, undefined);
    assert.equal(target.item.source, "creation");
  }
  const bad = { url: `${route()}&bad=true`, artifact_id: ART, revision_id: REV, name: "report.pdf" };
  assert.equal(await attachments.resolveTaskAttachment(bad, "oceanleo", { loadLibraryItem: never, resolveUrl: never, loadTaskAttachment: never }), null);
  assert.equal(display.attachmentDisplayUrl(bad), undefined);
  assert.equal(await display.resolveAttachmentDisplayUrl(bad), undefined);
});

async function withObjectUrls(run) {
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const blobs = [], revoked = [];
  URL.createObjectURL = blob => { blobs.push(blob); return `blob:task-content-${blobs.length}`; };
  URL.revokeObjectURL = url => revoked.push(url);
  try { await run(blobs, revoked); } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
}
async function mount(Component, props) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const render = async next => { await act(async () => { root.render(React.createElement(Component, next)); await new Promise(resolve => setTimeout(resolve, 0)); }); };
  await render(props);
  return { host, render, async close() { await act(async () => root.unmount()); host.remove(); } };
}

test("shared thumbnails use identity-checked scoped bytes and revoke local URLs on path change/unmount", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.__taskContentToken = null;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response("png bytes", { headers: { "Content-Type": "image/png" } }); };
  try { await withObjectUrls(async (blobs, revoked) => {
    function Picture({ path }) {
      const url = display.useAttachmentDisplayUrl({ url: path, artifact_id: ART, revision_id: REV, mime: "image/png" });
      return url ? React.createElement("img", { src: url, alt: "Shared file" }) : null;
    }
    const view = await mount(Picture, { path: route() });
    try {
      assert.equal(view.host.querySelector("img").getAttribute("src"), "blob:task-content-1");
      assert.equal(calls[0].url, `https://gateway.test${route()}`);
      assert.equal(calls[0].init.headers.Authorization, undefined);
      globalThis.__taskContentToken = "accepted-reader";
      await view.render({ path: route("frames", 19) });
      assert.ok(revoked.includes("blob:task-content-1"));
      assert.equal(calls[1].init.headers.Authorization, "Bearer accepted-reader");
      assert.equal(view.host.querySelector("img").getAttribute("src"), "blob:task-content-2");
      assert.equal(blobs[0].type, "image/png");
    } finally { await view.close(); }
    assert.ok(revoked.includes("blob:task-content-2"));
    assert.equal(archived.archivedImageEligible("image/png", 100, route("frames")), true);
    assert.equal(archived.archivedImageEligible("image/png", 100, `${route()}&bad=1`), false);
    assert.equal(await archived.loadArchivedThumb(route("frames"), "image/png", never), "blob:task-content-3");
  }); } finally { globalThis.fetch = realFetch; delete globalThis.__taskContentToken; }
});

test("safe artifact client and panel expose escaped inline content, never arbitrary artifact URLs or HTML", async () => {
  const client = createTaskContentClient({ tokenImpl: async () => null, fetchImpl: async url => Response.json(url.endsWith("/artifacts")
    ? { items: [{ id: "output", kind: "html", title: "<img src=x onerror=alert(1)>", content: "<script>steal()</script>", url: "https://evil.test/execute" }] }
    : { artifact: { id: "output", title: "Output", content: "Visible text" } }) });
  const items = await client.artifacts(TASK);
  assert.equal("url" in items[0], false);
  assert.equal((await client.artifact(TASK, "output")).content, "Visible text");
  const view = await mount(TaskContentPanel, { taskId: TASK, client });
  try {
    assert.match(view.host.textContent, /<script>steal\(\)<\/script>/);
    assert.equal(view.host.querySelector("script, img, iframe, a"), null);
    assert.match(view.host.innerHTML, /&lt;script&gt;/);
  } finally { await view.close(); }
});

test("role/removal changes discard old artifact content and stale in-flight reads", async () => {
  let resolveOld;
  let first = true;
  const client = createMockTaskContentClient({ artifacts() {
    if (first) { first = false; return new Promise(resolve => { resolveOld = resolve; }); }
    return Promise.resolve([{ id: "retained", kind: "document", title: "Retained", content: "before removal only" }]);
  } });
  const view = await mount(TaskContentPanel, { taskId: TASK, accessKey: "member", client });
  try {
    await view.render({ taskId: TASK, accessKey: "removed:8", client });
    await act(async () => resolveOld([{ id: "new", title: "Hidden", content: "after removal secret" }]));
    assert.match(view.host.textContent, /before removal only/);
    assert.doesNotMatch(view.host.textContent, /after removal secret/);
  } finally { await view.close(); }
});
