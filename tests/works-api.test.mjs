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

test("works API lists server works with bearer auth", async () => {
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
    assert.equal(calls[0].init.headers.Authorization, "Bearer test-token");
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

test("works API wires preview, stop, and remove to their exact routes", async () => {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).includes("/preview")) return response({ status: "ready", url: "https://w-abc.ws.oceanleo.app", stage: "ready" });
    return response({ ok: true });
  };
  try {
    const preview = await apiModule.worksApi.preview("server/1");
    assert.equal(preview.status, "ready");
    const stopped = await apiModule.worksApi.stop("server-1");
    assert.equal(stopped.ok, true);
    await apiModule.worksApi.remove("server/1");
    assert.equal(calls[0].url, "https://api.test/v1/works/server%2F1/preview");
    assert.equal(calls[1].url, "https://api.test/v1/works/server-1/stop");
    assert.equal(calls[2].url, "https://api.test/v1/works/server%2F1");
  } finally {
    globalThis.fetch = previous;
  }
});

test("works API preserves structured preview errors for UI copy", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => response({ detail: { code: "destination_not_empty", message: "destination folder is not empty" } }, 409);
  try {
    await assert.rejects(apiModule.worksApi.preview("server/1"), (error) => {
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

test("works API no longer exposes removed server transfer methods", () => {
  assert.equal("createServer" in apiModule.worksApi, false);
  assert.equal("moveToServer" in apiModule.worksApi, false);
  assert.equal("saveToCloud" in apiModule.worksApi, false);
});
