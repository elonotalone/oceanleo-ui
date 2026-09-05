/**
 * 产出即建档：无产物的 saveSnapshot 只写草稿，archive 空壳走 DELETE。
 *
 * 网关与草稿表都换成内存桩，断言真实请求而不是源码文本。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

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
  url: "https://word.oceanleo.com/workspace/proposal",
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
  sessionStorage: window.sessionStorage,
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

function resetGate() {
  globalThis.__oceanleoSessionGate = {
    requests: [],
    drafts: new Map(),
    cleared: [],
    sessionSeq: 0,
  };
}

resetGate();

const appSessionStub = dataModule(`
  function gate() {
    return globalThis.__oceanleoSessionGate;
  }
  export function isAppSessionApiUnavailableStatus(status) {
    return status === 404 || status === 405 || status === 501;
  }
  export async function listAppSessions() {
    gate().requests.push({ method: "GET", url: "/v1/agent/sessions" });
    return { ok: true, data: { items: [] } };
  }
  export async function getAppSession(id) {
    gate().requests.push({ method: "GET", url: "/v1/agent/sessions/" + id });
    return { ok: false, error: "missing", status: 404 };
  }
  export async function ensureAppSession(input) {
    gate().requests.push({
      method: "POST",
      url: "/v1/agent/sessions",
      snapshot: input.snapshot,
    });
    gate().sessionSeq += 1;
    return {
      ok: true,
      data: {
        id: "sess-" + gate().sessionSeq,
        site_id: input.siteId,
        app_id: input.appId,
        surface: input.surface || "app",
        status: "active",
        snapshot: input.snapshot,
        schema_version: input.schemaVersion ?? 1,
        revision: 1,
        created_at: "2026-09-05T00:00:00Z",
        last_activity_at: "2026-09-05T00:00:00Z",
        first_output_at: null,
      },
    };
  }
  export async function updateAppSession(id, input) {
    gate().requests.push({
      method: "PUT",
      url: "/v1/agent/sessions/" + id + "/snapshot",
      snapshot: input.snapshot,
    });
    return {
      ok: true,
      data: {
        id,
        site_id: "word",
        app_id: "proposal",
        status: "active",
        snapshot: input.snapshot,
        schema_version: input.schemaVersion,
        revision: (input.revision || 1) + 1,
        created_at: "2026-09-05T00:00:00Z",
        last_activity_at: "2026-09-05T00:00:00Z",
        first_output_at: null,
      },
    };
  }
  export async function archiveAppSession(id) {
    gate().requests.push({
      method: "POST",
      url: "/v1/agent/sessions/" + id + "/archive",
    });
    return { ok: true, data: { session_id: id, archived: true } };
  }
  export async function deleteAppSession(id) {
    gate().requests.push({
      method: "DELETE",
      url: "/v1/agent/sessions/" + id,
    });
    return { ok: true, data: { deleted: true, session_id: id } };
  }
`);

const draftStub = dataModule(`
  function gate() {
    return globalThis.__oceanleoSessionGate;
  }
  function key(site, app) {
    return site + ":" + app;
  }
  export async function loadConsoleDraft(site, app) {
    return gate().drafts.get(key(site, app)) || null;
  }
  export async function saveConsoleDraft(site, app, state) {
    gate().drafts.set(key(site, app), {
      site_id: site,
      app_id: app,
      state,
      updated_at: "2026-09-05T00:00:00Z",
    });
  }
  export async function clearConsoleDraft(site, app) {
    gate().cleared.push({ site, app });
    gate().drafts.delete(key(site, app));
  }
`);

const taskStub = dataModule(`
  export async function findLinkedAgentTaskId() {
    return undefined;
  }
`);

const providerUrl = await compileModule("src/shell/WorkspaceSession.tsx", {
  "../lib/app-session": appSessionStub,
  "../lib/console-draft": draftStub,
  "./workspace-session-task": taskStub,
});

const { WorkspaceSessionProvider } = await import(providerUrl);
const { useOptionalWorkspaceSession } = await import(
  "../src/shell/workspace-session-context.ts"
);

function sessionRecord(overrides = {}) {
  return {
    id: "sess-live",
    site_id: "word",
    app_id: "proposal",
    surface: "app",
    status: "active",
    snapshot: { topic: "draft" },
    schema_version: 1,
    revision: 1,
    created_at: "2026-09-05T00:00:00Z",
    last_activity_at: "2026-09-05T00:00:00Z",
    first_output_at: null,
    ...overrides,
  };
}

function postsToCreate() {
  return globalThis.__oceanleoSessionGate.requests.filter(
    (entry) => entry.method === "POST" && entry.url === "/v1/agent/sessions",
  );
}

function archivePosts() {
  return globalThis.__oceanleoSessionGate.requests.filter(
    (entry) =>
      entry.method === "POST" && String(entry.url).endsWith("/archive"),
  );
}

function deletes() {
  return globalThis.__oceanleoSessionGate.requests.filter(
    (entry) => entry.method === "DELETE",
  );
}

async function withWorkspace(props, run) {
  resetGate();
  let api = null;
  function Probe() {
    api = useOptionalWorkspaceSession();
    return null;
  }
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(
        WorkspaceSessionProvider,
        {
          siteId: "word",
          appId: "proposal",
          resumeLatest: false,
          ...props,
        },
        React.createElement(Probe),
      ),
    );
  });
  try {
    await run(api);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

test("无会话时 saveSnapshot 不传 intent 只写草稿、不建档", async () => {
  await withWorkspace({}, async (workspace) => {
    let result;
    await act(async () => {
      result = await workspace.saveSnapshot({ topic: "只换了页签" }, 1);
    });
    assert.deepEqual(
      { ok: result.ok, deferred: result.deferred },
      { ok: true, deferred: true },
    );
    assert.equal(postsToCreate().length, 0);
    assert.deepEqual(
      globalThis.__oceanleoSessionGate.drafts.get("word:proposal")?.state,
      { topic: "只换了页签" },
    );
  });
});

test("无会话时 saveSnapshot 带 intent output 会建会话", async () => {
  await withWorkspace({}, async (workspace) => {
    let result;
    await act(async () => {
      result = await workspace.saveSnapshot(
        { topic: "已生成" },
        1,
        { intent: "output" },
      );
    });
    assert.equal(result.ok, true);
    assert.equal(result.deferred, undefined);
    assert.equal(postsToCreate().length, 1);
    assert.equal(result.session?.id, "sess-1");
  });
});

test("建档时把草稿与本次快照合并并清掉草稿", async () => {
  await withWorkspace({}, async (workspace) => {
    globalThis.__oceanleoSessionGate.drafts.set("word:proposal", {
      site_id: "word",
      app_id: "proposal",
      state: { a: 1 },
      updated_at: "2026-09-05T00:00:00Z",
    });
    await act(async () => {
      await workspace.saveSnapshot({ b: 2 }, 1, { intent: "output" });
    });
    assert.deepEqual(postsToCreate()[0]?.snapshot, { a: 1, b: 2 });
    assert.deepEqual(globalThis.__oceanleoSessionGate.cleared, [
      { site: "word", app: "proposal" },
    ]);
  });
});

test("未产出会话 archive 走 DELETE 并返回 empty", async () => {
  await withWorkspace(
    { initialSession: sessionRecord({ first_output_at: null }) },
    async (workspace) => {
      let result;
      await act(async () => {
        result = await workspace.archive();
      });
      assert.equal(result, "empty");
      assert.equal(deletes().length, 1);
      assert.equal(archivePosts().length, 0);
    },
  );
});

test("已产出会话 archive 走 POST archive 并返回 archived", async () => {
  await withWorkspace(
    {
      initialSession: sessionRecord({
        first_output_at: "2026-09-05T01:00:00Z",
      }),
    },
    async (workspace) => {
      let result;
      await act(async () => {
        result = await workspace.archive();
      });
      assert.equal(result, "archived");
      assert.equal(archivePosts().length, 1);
      assert.equal(deletes().length, 0);
    },
  );
});
