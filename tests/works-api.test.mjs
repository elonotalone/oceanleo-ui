import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const model = await import("../src/shell/works/model.ts");
const apiModule = await import(await compileModule("src/lib/works-api.ts", {
  "./auth/client": dataModule("export async function accessToken(){ return 'test-token'; }"),
  "./auth/config": dataModule("export function gatewayBase(){ return 'https://api.test'; }"),
}));

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

test("works API lists and creates server works with bearer auth and encoded ids", async () => {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).endsWith("/v1/works")) return response({ items: [{
      id: "cloud-1", title: "Landing", kind: "website", home: { type: "cloud", project_id: "p1" },
      preview: { available: true }, links: [], status: "published", updated_at: "2026-11-09T00:00:00Z",
    }] });
    return response({ work: {
      id: "server-1", title: "Local site", kind: "website", home: { type: "server", computer_id: "cc/1", computer_name: "Dev", path: "/srv/site" },
      preview: { available: true }, links: [], status: "draft", updated_at: "2026-11-09T00:00:00Z",
    } });
  };
  try {
    const listed = await apiModule.worksApi.list();
    assert.equal(listed[0].id, "cloud-1");
    const created = await apiModule.worksApi.createServer({ computer_id: "cc/1", path: "/srv/site", kind: "website", port: 3000 });
    assert.equal(created.home.type, "server");
    assert.equal(calls[0].init.headers.Authorization, "Bearer test-token");
    assert.equal(calls[1].url, "https://api.test/v1/works/server");
    assert.ok(calls[1].init.body.includes('"computer_id":"cc/1"'));
  } finally {
    globalThis.fetch = previous;
  }
});

test("works API exposes unsupported gateways as a feature-detection error", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => response({ detail: { code: "missing_route" } }, 404);
  try {
    await assert.rejects(apiModule.worksApi.list(), (error) => {
      assert.equal(error.constructor.name, "WorksApiError");
      assert.equal(error.unsupported, true);
      assert.equal(error.code, "missing_route");
      return true;
    });
  } finally {
    globalThis.fetch = previous;
  }
});

test("works API wires move-to-server, save-to-cloud, and stop to their exact C6 routes", async () => {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).endsWith("/move-to-server")) return response({ work: {
      id: "server-2", title: "Moved", kind: "website", home: { type: "server", computer_id: "cc1", computer_name: "Office", path: "/srv/moved" },
      preview: { available: true }, links: [], status: "draft", updated_at: "2026-11-09T00:00:00Z",
    } });
    if (String(url).includes("/save-to-cloud")) return response({ project: { id: "project-1" }, work_id: "server-1" });
    return response({ ok: true });
  };
  try {
    const moved = await apiModule.worksApi.moveToServer({ artifact_id: "artifact-1", computer_id: "cc1", path: "/srv/moved", title: "Moved" });
    assert.equal(moved.home.type, "server");
    const saved = await apiModule.worksApi.saveToCloud("server-1", { title: "Cloud copy", slug: "cloud-copy" });
    assert.equal(saved.work_id, "server-1");
    const stopped = await apiModule.worksApi.stop("server-1");
    assert.equal(stopped.ok, true);
    assert.equal(calls[0].url, "https://api.test/v1/works/move-to-server");
    assert.match(calls[0].init.body, /"artifact_id":"artifact-1"/);
    assert.equal(calls[1].url, "https://api.test/v1/works/server-1/save-to-cloud");
    assert.match(calls[1].init.body, /"slug":"cloud-copy"/);
    assert.equal(calls[2].url, "https://api.test/v1/works/server-1/stop");
  } finally {
    globalThis.fetch = previous;
  }
});

test("works API preserves structured action errors for UI copy", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => response({ detail: { code: "destination_not_empty", message: "destination folder is not empty" } }, 409);
  try {
    await assert.rejects(apiModule.worksApi.moveToServer({ artifact_id: "a1", computer_id: "cc1", path: "/srv/existing" }), (error) => {
      assert.equal(error.code, "destination_not_empty");
      assert.equal(error.detailMessage, "destination folder is not empty");
      return true;
    });
  } finally {
    globalThis.fetch = previous;
  }
});

test("work normalization keeps server locations and rejects unsafe preview urls", () => {
  const work = model.normalizeWork({
    id: "w1", title: "Server app", kind: "app",
    home: { type: "server", computer_id: "cc1", computer_name: "Office", path: "C:\\site" },
    preview: { available: true, url: "https://evil.example/preview" }, links: [{ label: "safe", url: "https://example.test" }, { label: "bad", url: "javascript:alert(1)" }], status: "running", updated_at: "2026-11-09T00:00:00Z",
  });
  assert.equal(work.home.type, "server");
  assert.equal(work.preview.url, undefined);
  assert.deepEqual(work.links.map((link) => link.label), ["safe"]);
  assert.equal(model.workLocationLabel(work), "Office · C:\\site");
  assert.deepEqual(model.workDraftForPath("/projects/game-demo"), { kind: "game", start_command: "npm run dev", port: 3000 });
});
