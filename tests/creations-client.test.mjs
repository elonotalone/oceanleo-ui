import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";


function loadDatabase({ token = "token", fetchImpl }) {
  const filename = fileURLToPath(
    new URL("../src/lib/database.ts", import.meta.url),
  );
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const moduleRecord = { exports: {} };
  const sandbox = {
    URLSearchParams,
    console,
    exports: moduleRecord.exports,
    fetch: fetchImpl,
    module: moduleRecord,
    require: (specifier) => {
      if (specifier === "./auth/client") {
        return { accessToken: async () => token };
      }
      if (specifier === "./auth/config") {
        return { GATEWAY_BASE: "https://api.oceanleo.test" };
      }
      throw new Error(`unexpected import: ${specifier}`);
    },
  };
  vm.runInNewContext(output, sandbox, { filename });
  return moduleRecord.exports;
}


test("legacy works names are direct aliases of the canonical creations API", () => {
  const database = loadDatabase({
    fetchImpl: async () => {
      throw new Error("not called");
    },
  });

  assert.equal(database.listWorks, database.listCreations);
  assert.equal(database.saveWorks, database.saveCreations);
  assert.equal(database.deleteWork, database.deleteCreation);
});


test("list and delete use only the canonical creations routes", async () => {
  const requests = [];
  const database = loadDatabase({
    fetchImpl: async (input, init = {}) => {
      requests.push({ input, init });
      return {
        ok: true,
        status: 200,
        json: async () =>
          init.method === "DELETE"
            ? { ok: true, id: "creation/one" }
            : { items: [] },
      };
    },
  });

  await database.listCreations({
    siteId: "video",
    mediaType: "video",
    limit: 60,
  });
  await database.deleteCreation("creation/one");

  assert.equal(
    requests[0].input,
    "https://api.oceanleo.test/v1/creations?site_id=video&media_type=video&limit=60",
  );
  assert.equal(
    requests[1].input,
    "https://api.oceanleo.test/v1/creations/creation%2Fone",
  );
  assert.equal(requests[1].init.method, "DELETE");
});


test("saveCreations preserves mixed-success identity evidence", async () => {
  let request;
  const response = {
    ok: true,
    saved: 1,
    items: [
      {
        id: "creation-one",
        url: "https://cdn.test/one.mp4",
        meta: { generation_result_id: "job:0" },
      },
    ],
    artifact_errors: [
      { result_id: "job:1", detail: "artifact write failed" },
    ],
    request_id: "request-one",
    durable: false,
  };
  const database = loadDatabase({
    fetchImpl: async (input, init) => {
      request = { input, init };
      return { ok: true, status: 200, json: async () => response };
    },
  });

  const result = await database.saveCreations("video", [
    {
      url: "https://cdn.test/one.mp4",
      media_type: "video",
      meta: { generation_result_id: "job:0" },
    },
    {
      url: "https://cdn.test/two.mp4",
      media_type: "video",
      meta: { generation_result_id: "job:1" },
    },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)), response);
  assert.equal(request.input, "https://api.oceanleo.test/v1/creations");
  const body = JSON.parse(request.init.body);
  assert.equal(body.site_id, "video");
  assert.deepEqual(
    body.items.map((item) => item.meta.generation_result_id),
    ["job:0", "job:1"],
  );
});


test("canonical creations failures stay in the authenticated result envelope", async () => {
  const database = loadDatabase({
    fetchImpl: async () => ({
      ok: false,
      status: 502,
      json: async () => ({ detail: "all artifact writes failed" }),
    }),
  });

  const result = await database.saveCreations("video", [
    { url: "https://cdn.test/failed.mp4", media_type: "video" },
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: false,
    error: "all artifact writes failed",
    status: 502,
  });
});
