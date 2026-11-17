// W1 的自测：指令面（合同 §3.1）与空件挂载（§3.2）。
//
// 两件事放一份文件，是因为 W1 在本波只有这一份自测文件；文件下半段用 JSDOM 真渲染
// 空框，走的是「拖进来 → 判型 → 上传 → 落成素材 → 交给工作台挂编辑器」那条真链，
// 不是文本断言。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { currentEditorContext, registerEditorContext, resetEditorContext, subscribeEditorContext } from "../src/shell/plugin-command/registry.ts";

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
  url: "https://word.oceanleo.com/",
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
  MouseEvent: window.MouseEvent,
  File: window.File,
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

globalThis.__blankStageCalls = {
  uploads: [],
  canonical: 0,
  legacy: 0,
  ensure: 0,
  uploadResponse: null,
};

const { AdvancedWorkbenchBlankStage } = await import(
  await compileModule("src/shell/AdvancedWorkbenchStage.tsx", {
    "../i18n/ui/useUI": dataModule(`
      export function useUI() {
        return (text, vars) =>
          vars
            ? String(text).replace(/\\{(\\w+)\\}/g, (match, key) =>
                key in vars ? String(vars[key]) : match,
              )
            : text;
      }
    `),
    "./AdvancedEditorIcon": dataModule(
      `export function AdvancedEditorIcon() { return null; }`,
    ),
    "./library-viewers": dataModule(
      `export function LibraryItemViewer() { return null; }`,
    ),
    "./workbench-material-provider": dataModule(
      `export const WORKBENCH_MATERIAL_MIME = "application/x-oceanleo-material";`,
    ),
    "../lib/database": dataModule(`
      export async function uploadFile(file, options) {
        globalThis.__blankStageCalls.uploads.push({
          name: file.name,
          options,
        });
        return globalThis.__blankStageCalls.uploadResponse;
      }
    `),
    "./MyLibrary": dataModule(`
      export function canonicalUploadLibraryItem(record) {
        globalThis.__blankStageCalls.canonical += 1;
        return {
          ok: true,
          item: { id: "canonical", artifactId: record.artifact_id, title: "已上传" },
        };
      }
      export function legacyUploadTransient(record, file) {
        globalThis.__blankStageCalls.legacy += 1;
        return { ok: true, transient: { resultId: record.id, name: file.name } };
      }
    `),
    "./artifact-client": dataModule(`
      export async function ensureArtifact(transient) {
        globalThis.__blankStageCalls.ensure += 1;
        return {
          ok: true,
          data: { id: "ensured", title: transient.name },
        };
      }
    `),
  })
);

const { createRoot } = await import("react-dom/client");

function mountBlankStage() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const received = [];
  act(() => {
    root.render(
      React.createElement(AdvancedWorkbenchBlankStage, {
        siteId: "word",
        onItemReady: (item) => received.push(item),
      }),
    );
  });
  return {
    host,
    received,
    unmount: () => act(() => root.unmount()),
  };
}

/**
 * 上传链里有 `await import()`（`MyLibrary` / `artifact-client` 都是用到才加载），
 * 它比 act 的微任务刷新晚若干个 tick 才落地。转起来直到落定，不然断言会看到
 * 一个还没走完的中间态——而那一步的结果会掉进**下一条**用例里，红得莫名其妙。
 */
async function settle(done) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (done()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
  }
}

async function dropFile(host, name, bytes = "hello") {
  const input = host.querySelector('input[type="file"]');
  assert.ok(input, "空框必须有一个上传入口");
  const file = new window.File([bytes], name, { type: "" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await settle(
    () =>
      Boolean(host.querySelector('[role="alert"]')) ||
      globalThis.__blankStageCalls.canonical > 0 ||
      globalThis.__blankStageCalls.ensure > 0,
  );
}

test.beforeEach(() => {
  globalThis.__blankStageCalls = {
    uploads: [],
    canonical: 0,
    legacy: 0,
    ensure: 0,
    uploadResponse: null,
  };
});

test("空框先给提示与上传入口，不需要任何素材就能挂出来", () => {
  const mounted = mountBlankStage();
  assert.match(mounted.host.textContent, /把文件拖进来，或点上传/);
  assert.ok(mounted.host.querySelector("[data-workbench-blank-stage]"));
  assert.ok(mounted.host.querySelector('input[type="file"]'));
  mounted.unmount();
});

test("认不出的后缀在上传之前就被挡住，并写清后缀与支持范围", async () => {
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "怪东西.xyz");
  const alert = mounted.host.querySelector('[role="alert"]');
  assert.ok(alert, "认不出类型必须有话说，不许静默不动");
  assert.match(alert.textContent, /XYZ/);
  assert.match(alert.textContent, /文档|表格|图片/);
  assert.equal(globalThis.__blankStageCalls.uploads.length, 0);
  assert.deepEqual(mounted.received, []);
  mounted.unmount();
});

test("网关直接给 canonical artifact 时，第一件素材落成并交回工作台", async () => {
  globalThis.__blankStageCalls.uploadResponse = {
    ok: true,
    data: {
      file: {
        id: "file-1",
        url: "https://cdn.invalid/a.docx",
        artifact_id: "artifact-1",
        revision_id: "revision-1",
        artifact: {},
      },
    },
  };
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "季度报告.docx");
  assert.equal(globalThis.__blankStageCalls.uploads.length, 1);
  assert.equal(globalThis.__blankStageCalls.uploads[0].options.siteId, "word");
  assert.equal(globalThis.__blankStageCalls.canonical, 1);
  assert.equal(globalThis.__blankStageCalls.ensure, 0);
  assert.deepEqual(mounted.received, [
    { id: "canonical", artifactId: "artifact-1", title: "已上传" },
  ]);
  mounted.unmount();
});

test("旧网关只给文件行时走 ensure 入库，同样落成真素材", async () => {
  globalThis.__blankStageCalls.uploadResponse = {
    ok: true,
    data: {
      file: { id: "file-2", url: "https://cdn.invalid/b.png", meta: {} },
    },
  };
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "封面.png");
  assert.equal(globalThis.__blankStageCalls.canonical, 0);
  assert.equal(globalThis.__blankStageCalls.legacy, 1);
  assert.equal(globalThis.__blankStageCalls.ensure, 1);
  assert.deepEqual(mounted.received, [{ id: "ensured", title: "封面.png" }]);
  mounted.unmount();
});

test("要先转一道的后缀（tiff）照样收下，不当成不支持", async () => {
  globalThis.__blankStageCalls.uploadResponse = {
    ok: true,
    data: { file: { id: "file-3", url: "https://cdn.invalid/c.tiff", meta: {} } },
  };
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "扫描件.tiff");
  assert.equal(mounted.host.querySelector('[role="alert"]'), null);
  assert.equal(globalThis.__blankStageCalls.uploads.length, 1);
  assert.equal(mounted.received.length, 1);
  mounted.unmount();
});

// W10 交付 §5 落盘后判型表按它的结论补：obj/stl 收下（走 `/v1/convert/model3d` 转 glb），
// fbx 不收（它会被 415 拒）。落盘之前这里断言的是「obj 也明说打不开」，
// 依据是同一句任务书——「能不能真转由 W10 决定」。
test("3D 的 obj 收下，并在开始等之前就说清贴图材质不会带过来", async () => {
  let release = () => {};
  globalThis.__blankStageCalls.uploadResponse = new Promise((resolve) => {
    release = () => resolve({ ok: false, error: "先停在这里。" });
  });
  const mounted = mountBlankStage();
  const input = mounted.host.querySelector('input[type="file"]');
  const file = new window.File(["x"], "模型.obj", { type: "" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

  assert.equal(mounted.host.querySelector('[role="alert"]'), null, "obj 被当成打不开的格式");
  assert.equal(globalThis.__blankStageCalls.uploads.length, 1);
  const status = mounted.host.querySelector('[role="status"]');
  assert.ok(status, "转 3D 的时候没有任何提示");
  assert.match(
    status.textContent,
    /贴图和材质不会带过来/,
    "转完才告诉用户丢了贴图材质，那时他已经等完一整趟上传了",
  );

  release();
  await settle(() => Boolean(mounted.host.querySelector('[role="alert"]')));
  mounted.unmount();
});

test("3D 的 fbx 明说收不了，并告诉用户导出成 GLB", async () => {
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "角色.fbx");
  const alert = mounted.host.querySelector('[role="alert"]');
  assert.ok(alert);
  assert.match(alert.textContent, /FBX/);
  assert.match(alert.textContent, /GLB/, "只说不行、不说怎么办，等于没说");
  assert.equal(
    globalThis.__blankStageCalls.uploads.length,
    0,
    "后端会 415 拒掉 fbx，不该让用户先白传一趟",
  );
  mounted.unmount();
});

// W2 交付 §5 的原话：「请 W1 从 `DOC_FAMILY_IMPORT_PLANS` 取，不要再手抄一份，
// 否则两边又会各说一套」。判型表是纯查表层，从编辑器模块反向 import 会把整条文档族
// 拖进来（还可能成环），所以这里换成**把「各说一套」钉成红**：W2 那边加一个后缀而
// 判型表没跟上，这条就红，不会等到用户拖进来才发现空框说「打不开」。
test("文档族四条路由收的后缀，空框判型表一个不漏", async () => {
  const [{ DOC_FAMILY_IMPORT_PLANS }, formats] = await Promise.all([
    import("../src/shell/doc-editors/doc-family-formats.ts"),
    import("../src/shell/workbench-route-formats.ts"),
  ]);
  const missing = [];
  for (const plan of DOC_FAMILY_IMPORT_PLANS) {
    const wanted = [
      ...plan.accept,
      ...plan.rules.flatMap((rule) => rule.from),
    ];
    for (const extension of wanted) {
      const judged = formats.uploadEditorTargetForExtension(extension);
      if (!judged.target) missing.push(`${plan.editorId}:${extension}`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `这些后缀文档族路由收得下，但拖进空框会被判成「打不开」：${missing.join("、")}`,
  );
});

test("空框给出「把整个项目搬上来」这条路，点开就是导入面板", async () => {
  const mounted = mountBlankStage();
  const entry = [...mounted.host.querySelectorAll("button")].find((node) =>
    /整个项目/.test(node.textContent || ""),
  );
  assert.ok(entry, "空框里找不到「把整个项目搬上来」的入口");
  await act(async () => {
    entry.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(
    [...mounted.host.querySelectorAll("button")].some((node) =>
      /整个项目/.test(node.textContent || ""),
    ),
    false,
    "点开之后入口还在原地，说明没切到导入面板",
  );
  mounted.unmount();
});

test("手机照片（heic）给的是能照做的一句话，不是那串通用清单", async () => {
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "IMG_0421.heic");
  const alert = mounted.host.querySelector('[role="alert"]');
  assert.ok(alert, "heic 必须有话说");
  assert.match(alert.textContent, /HEIC/);
  assert.match(alert.textContent, /JPG/, "只说打不开、不说怎么办，等于没说");
  assert.doesNotMatch(
    alert.textContent,
    /现在支持：/,
    "手机照片掉进那串通用后缀清单里了，用户读完还是不知道下一步干什么",
  );
  assert.equal(
    globalThis.__blankStageCalls.uploads.length,
    0,
    "明知这台服务器转不了 heic，还是让用户白传了一趟",
  );
  mounted.unmount();
});

test("要转一道的文件在传的过程中有进度提示，不是一个不动的界面", async () => {
  let release = () => {};
  globalThis.__blankStageCalls.uploadResponse = new Promise((resolve) => {
    release = () => resolve({ ok: false, error: "先停在这里。" });
  });
  const mounted = mountBlankStage();
  const input = mounted.host.querySelector('input[type="file"]');
  const file = new window.File(["x"], "扫描件.tiff", { type: "" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

  const status = mounted.host.querySelector('[role="status"]');
  assert.ok(status, "要转格式的文件在传的时候一句提示都没有，用户只能盯着不动的界面");
  assert.match(status.textContent, /转成能编辑的格式|正在上传/);

  release();
  await settle(() => Boolean(mounted.host.querySelector('[role="alert"]')));
  assert.equal(
    mounted.host.querySelector('[role="status"]'),
    null,
    "已经出结果了，进度提示还挂在那里",
  );
  mounted.unmount();
});

test("上传失败时把原因摆出来，不静默吞掉", async () => {
  globalThis.__blankStageCalls.uploadResponse = {
    ok: false,
    error: "存储空间暂时不可用。",
  };
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "季度报告.docx");
  const alert = mounted.host.querySelector('[role="alert"]');
  assert.ok(alert);
  assert.match(alert.textContent, /存储空间暂时不可用/);
  assert.deepEqual(mounted.received, []);
  mounted.unmount();
});
