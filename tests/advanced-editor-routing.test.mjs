import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(
  new URL("../src/shell/workbench-routes.ts", import.meta.url),
  "utf8",
);
const routeFormats = readFileSync(
  new URL("../src/shell/workbench-route-formats.ts", import.meta.url),
  "utf8",
);
const registrySource = readFileSync(
  new URL(
    "../src/shell/workbench-capability-registry.ts",
    import.meta.url,
  ),
  "utf8",
);
const workbench = readFileSync(
  new URL("../src/shell/AdvancedContentWorkbench.tsx", import.meta.url),
  "utf8",
);
const {
  TRUSTED_EDITOR_REGISTRY,
  editorAdapterForArtifactCapability,
  editorCapabilityFor,
  editorRouteHintForArtifactCapability,
} = await import(
  "../src/shell/workbench-routes.ts"
);

test("advanced editor routing covers every durable material family", () => {
  // 清单里原来还有 `geo-map` 与 `interactive-doc` 两条，注明是「H 波新增的两条本地
  // 路由（可算文档、地图工程）」。那两条从未存在：`7bee5da`（2026-07-30 的保护性
  // 提交）提交了两个新工作台的契约，实现从未落地，`src/shell/advanced-routes/` 下
  // 没有它们的 Route。地图与交互文档当前**只有浏览侧**，是 view-only；
  // **编辑器落地时把这两条加回来**（`advanced-adapter-contract.test.mjs` 的缺席
  // 断言会先红出来提醒）。
  assert.deepEqual(
    Object.keys(TRUSTED_EDITOR_REGISTRY).sort(),
    [
      "audio",
      "chart-editor@1",
      "deck",
      "design-canvas",
      "game",
      "grid",
      "image",
      "office",
      "pdf",
      "richdoc",
      "threed",
      "video-canvas",
      "video-timeline",
      "website",
    ],
  );
  for (const entry of Object.values(TRUSTED_EDITOR_REGISTRY)) {
    if (!entry.routable) continue;
    assert.deepEqual(entry.roundTrip, ["load", "mutate", "save", "reopen"]);
  }
  // 三张扩展名表在一次重构里搬进了 `workbench-route-formats.ts`，判据跟着搬：
  // 要断言的是「这三张表存在且仍是路由的依据」，不是「它们写在哪个文件里」。
  assert.match(routeFormats, /WORD_EXT/);
  assert.match(routeFormats, /CELL_EXT/);
  assert.match(routeFormats, /SLIDE_EXT/);
  assert.match(routes, /NATIVE_DECK_EXT/);
  assert.match(
    routes,
    /if \(NATIVE_DECK_EXT\.has\(officeExt\)\) \{\s*return available\("deck"/,
  );
  assert.match(routes, /mime\.startsWith\("video\/"\)/);
  assert.match(routes, /mime\.startsWith\("audio\/"\)/);
  assert.match(routes, /mime\.startsWith\("image\/"\)/);
  assert.match(registrySource, /TRUSTED_EDITOR_REGISTRY/);
  assert.match(workbench, /editorRouteFor\(props\.item\)/);
  assert.doesNotMatch(workbench, /\bOfficeRoute\b|case "office"/);
  assert.doesNotMatch(registrySource, /routeType: "office"/);
});

test("legacy Office metadata remaps only typed sources and otherwise fails closed", () => {
  const metadataCases = [
    { advanced_editor_route: "office" },
    { editor: "office-editor" },
    { editor_project_schema: "office-file@1" },
  ];
  const typedCases = [
    ["docx", "richdoc"],
    ["xlsx", "grid"],
    ["pptx", "deck"],
  ];

  for (const meta of metadataCases) {
    for (const [extension, route] of typedCases) {
      const capability = editorCapabilityFor({
        id: `${Object.keys(meta)[0]}-${extension}`,
        title: `legacy.${extension}`,
        kind: "file",
        url: `https://files.test/legacy.${extension}`,
        meta,
      });
      assert.equal(capability.available, true);
      assert.equal(capability.adapter, route);
      assert.deepEqual(capability.route, { type: route });
    }

    const rejected = editorCapabilityFor({
      id: `untyped-${Object.keys(meta)[0]}`,
      title: "legacy.bin",
      kind: "file",
      url: "https://files.test/legacy.bin",
      meta,
    });
    assert.equal(rejected.available, false);
    assert.equal(rejected.adapter, "none");
    assert.deepEqual(rejected.route, { type: "none" });
    assert.equal(
      rejected.unavailableReason,
      "Legacy Office metadata requires a typed document, grid, or deck source.",
    );
  }

  for (const token of ["office", "office-editor", "office-file@1"]) {
    assert.equal(editorAdapterForArtifactCapability(token), null);
    assert.equal(editorRouteHintForArtifactCapability(token), "");
  }
});

test("opaque URLs and blob uploads still identify every PPTX as a native deck", () => {
  const byMime = editorCapabilityFor({
    id: "opaque-pptx",
    title: "季度复盘",
    kind: "file",
    url: "https://api.oceanleo.com/v1/media/object/opaque-id",
    meta: {
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
  });
  assert.deepEqual(byMime.route, { type: "deck" });

  const byFilename = editorCapabilityFor({
    id: "blob-pptx",
    title: "路演方案.pptx",
    kind: "file",
    url: "blob:https://ppt.oceanleo.com/opaque-id",
    meta: {},
  });
  assert.deepEqual(byFilename.route, { type: "deck" });
});

test("video canvas uses the typed node-canvas embed", () => {
  // C5 家族化：base 不再是写死字面量，而是写死的「子站标签 + 路径」按当前家族
  // 拼 origin。这里锁路由表条目形态，并用行为断言把默认家族（com）下拼出来的
  // 完整 base 逐字钉死 —— 与家族化前的旧字面量断言等价。
  assert.match(
    routes,
    /subsite: "video",\s*path: "\/canvas-board",\s*mediaType: "video_canvas"/,
  );
  const capability = editorCapabilityFor({
    id: "vc",
    title: "vc",
    kind: "video_canvas",
    meta: { advanced_editor_route: "embed" },
  });
  assert.deepEqual(capability.route, {
    type: "embed",
    base: "https://video.oceanleo.com/canvas-board",
    mediaType: "video_canvas",
  });
});
