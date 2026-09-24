/**
 * W17 交接合同：`editor-handoff.ts` 的解析优先级、进专业面抓内存稿、
 * 专业面保存回写、flush 必须等确认。
 *
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/eas-w17-handoff-contract.test.mjs
 */

import { strict as assert } from "node:assert";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const handoffUrl = await compileModule(
  "src/shell/advanced-routes/editor-handoff.ts",
  {
    "../office-editor/useOfficeArtifactSource": dataModule(`
      export function useOfficeArtifactSource(item) {
        return {
          item,
          url: item && item.url ? item.url : "",
          purpose: null,
          loading: false,
          error: "",
          version: 0,
          retry() {},
          resourceFailed() {},
        };
      }
    `),
  },
);

const {
  bindNormalFaceHandoff,
  captureBeforeEnterPro,
  inferHandoffFormat,
  libraryItemFromProSave,
  materializeHandoffJson,
  openHostedSaveGate,
  peekProSavedRevision,
  reportProSaved,
  resetEditorHandoffForTests,
  resolveEditorHandoffFromItem,
  slideCountOf,
} = await import(handoffUrl);

function item(overrides = {}) {
  return {
    key: "deck-1",
    source: "artifact",
    id: "deck-1",
    title: "季度汇报",
    kind: "ppt",
    siteId: "website",
    favorite: false,
    ...overrides,
    meta: { ...(overrides.meta || {}) },
  };
}

test.afterEach(() => {
  resetEditorHandoffForTests();
});

test("解析优先级：inline > working head > project > 与快速面同一条源 URL", () => {
  const inline = item({
    content: JSON.stringify({ slides: [{ id: "mem" }] }),
    url: "https://files.oceanleo.com/old.pptx",
    meta: {
      editor_working_head_url: "https://files.oceanleo.com/head.json",
      editor_project_url: "https://files.oceanleo.com/project.json",
    },
  });
  const fromInline = resolveEditorHandoffFromItem(inline);
  assert.equal(fromInline.kind, "inline");
  assert.equal(fromInline.json.slides[0].id, "mem");

  const working = item({
    url: "https://files.oceanleo.com/old.pptx",
    meta: {
      editor_working_head_url: "https://files.oceanleo.com/head.json",
      editor_project_url: "https://files.oceanleo.com/project.json",
    },
  });
  const fromWorking = resolveEditorHandoffFromItem(working);
  assert.equal(fromWorking.kind, "url");
  assert.equal(fromWorking.url, "https://files.oceanleo.com/head.json");

  const project = item({
    url: "https://files.oceanleo.com/old.pptx",
    meta: { editor_project_url: "https://files.oceanleo.com/project.json" },
  });
  const fromProject = resolveEditorHandoffFromItem(project);
  assert.equal(fromProject.kind, "url");
  assert.equal(fromProject.url, "https://files.oceanleo.com/project.json");

  const office = item({ url: "https://files.oceanleo.com/only.pptx" });
  const fromOffice = resolveEditorHandoffFromItem(office, {
    officeUrl: "https://files.oceanleo.com/rendition.pptx",
  });
  assert.equal(fromOffice.kind, "url");
  assert.equal(fromOffice.url, "https://files.oceanleo.com/rendition.pptx");
  assert.equal(fromOffice.format, "pptx");
});

test("进专业面必须拿到快速面内存里还没保存的那一处", async () => {
  bindNormalFaceHandoff("deck-1", {
    getHandoff: () => ({
      kind: "inline",
      json: { slides: [{ id: "s1", elements: [{ text: "未保存的改动" }] }] },
      revision: "3",
    }),
  });
  const result = await captureBeforeEnterPro(item());
  assert.equal(result.ok, true);
  assert.equal(result.handoff.kind, "inline");
  assert.match(JSON.stringify(result.handoff.json), /未保存的改动/);
});

test("只有 .pptx 的素材解析成 url/pptx，导入后页数大于 0", async () => {
  const source = resolveEditorHandoffFromItem(
    item({
      url: "https://files.oceanleo.com/imported.pptx",
      meta: { source_format: "pptx" },
    }),
  );
  assert.equal(source.kind, "url");
  assert.equal(source.format, "pptx");
  const loaded = await materializeHandoffJson(source, {
    fetchBytes: async () => new ArrayBuffer(8),
    importPptx: async () => ({
      slides: [{ id: "p1" }, { id: "p2" }],
    }),
  });
  assert.equal(loaded.ok, true);
  assert.ok(loaded.slideCount > 0);
});

test("专业面保存回写后，快速面按新 revision 能再解析到同一份", () => {
  const saved = libraryItemFromProSave(item(), {
    deck: { slides: [{ id: "after-pro", title: "专业面改过" }] },
    revision: "rev-pro-1",
  });
  reportProSaved("deck-1", saved);
  const again = peekProSavedRevision("deck-1");
  assert.ok(again);
  assert.equal(again.revisionId, "rev-pro-1");
  const resolved = resolveEditorHandoffFromItem(again);
  assert.equal(resolved.kind, "inline");
  assert.equal(resolved.json.slides[0].id, "after-pro");
  assert.equal(slideCountOf(resolved.json) > 0, true);
});

test("flush 在没有 save-result 时超时返回 ok: false", async () => {
  const gate = openHostedSaveGate({ timeoutMs: 40, saveId: "save-timeout" });
  const result = await gate.wait();
  assert.equal(result.ok, false);
  assert.match(result.error, /超时|确认/);
});

test("收到 snapshot 并确认 save-result 之后 flush 才算成功", async () => {
  const gate = openHostedSaveGate({ timeoutMs: 200, saveId: "save-ok" });
  gate.acceptSnapshot({ slides: [{ id: "live" }] });
  queueMicrotask(() => gate.acceptSaveResult());
  const result = await gate.wait();
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.slides[0].id, "live");
});

test(".pptx URL 的 format 推断", () => {
  assert.equal(
    inferHandoffFormat(
      item({ meta: { source_format: "pptx" } }),
      "https://files.oceanleo.com/a.bin",
    ),
    "pptx",
  );
});
