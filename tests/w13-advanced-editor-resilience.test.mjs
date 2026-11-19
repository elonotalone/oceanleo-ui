import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import ts from "typescript";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const source = (path) => readFile(resolve(path), "utf8");

function assertTranspiles(path, input) {
  const result = ts.transpileModule(input, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.deepEqual(
    errors.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    ),
    [],
  );
}

test("rich-doc source failures cannot become saveable blank documents", async () => {
  const [{ loadRichDocHtml }, model, hook, route] = await Promise.all([
    import("../src/shell/doc-editors/rich-doc-model.ts"),
    source("src/shell/doc-editors/rich-doc-model.ts"),
    source("src/shell/doc-editors/use-rich-doc-editor.ts"),
    source("src/shell/advanced-routes/RichDocRoute.tsx"),
  ]);

  const missingArtifact = await loadRichDocHtml({
    id: "missing-rich-document",
    title: "Missing rich document",
    source: "artifact",
    kind: "doc",
    meta: {},
  });
  assert.equal(missingArtifact.source, "empty");
  assert.match(missingArtifact.error, /缺少可验证的 source\/full 内容/);

  assert.match(
    model,
    /item\.source === "artifact"[\s\S]*缺少可验证的 source\/full 内容/,
  );
  assert.match(model, /looksLikeTextRichDoc/);
  assert.match(model, /richDocSourceUrl/);
  assert.match(hook, /if \(result\.error\) \{[\s\S]*setLoading\(false\);[\s\S]*return;/);
  assert.doesNotMatch(
    hook,
    /setLoaded\(\{\s*html:\s*"<p><\/p>",\s*source:\s*"empty"/,
  );
  assert.match(
    hook,
    /if \(!sourceReadyRef\.current\) \{[\s\S]*已阻止|if \(!sourceReadyRef\.current\) \{[\s\S]*尚未成功载入/,
  );
  assert.match(hook, /onUpdate:[\s\S]*已阻止修改空白回退内容/);
  assert.match(hook, /sourceReadyRef\.current = true;[\s\S]*setSourceReady\(true\);/);
  assert.match(route, /<EditorSourceFailurePanel[\s\S]*?onReload=\{editor\.reload\}/);
  assert.match(route, /!editor\.loading && !editor\.sourceReady/);
  assert.match(route, /editor\.sourceReady[\s\S]*capture:/);
});

test("PDF blank creation is explicit and disposed page loads release resources", async () => {
  const { loadInitialPdfSource } = await import(
    "../src/shell/media-editors/pdf-source.ts"
  );
  const input = {
    source: "",
    siteId: "pdf",
    title: "fixture",
    signal: new AbortController().signal,
  };
  await assert.rejects(
    () => loadInitialPdfSource({ ...input, allowBlank: false }),
    /缺少可验证的源文件.*空白页替代/,
  );
  const blank = await loadInitialPdfSource({ ...input, allowBlank: true });
  assert.equal(blank.blank, true);
  assert.equal(blank.pageCount, 1);
  assert.ok(blank.bytes.byteLength > 0);

  // 10-23 D4：单实例 hook（旧核 collab / preview-render 已删）。
  const [workbench, rail] = await Promise.all([
    source("src/shell/media-editors/use-pdf-workbench.ts"),
    source("src/shell/media-editors/PdfControls.tsx"),
  ]);
  assert.match(workbench, /item\.source === "creation"/);
  assert.match(workbench, /loadInitialPdfSource\(\{[\s\S]*?allowBlank,/);
  assert.match(workbench, /decodePdfRecovery\(payload\)/);
  assert.match(workbench, /bridge\.replaceDocument\(await buildPdfWorkingCopy\(doc, source\)\)/);
  assert.match(workbench, /bridge\.adoptWorkingCopyMedia\(doc\)/);
  // 缩略图：卸掉的那一张不再落图，object URL 随之释放。
  assert.match(rail, /if \(!alive\) return;\s*objectUrl = URL\.createObjectURL\(blob\)/);
  assert.match(rail, /alive = false;\s*if \(objectUrl\) URL\.revokeObjectURL\(objectUrl\)/);
});

async function loadProbeWithRejectedUrlPolicy() {
  return import(
    await compileModule("src/shell/video-editor/media-probe.ts", {
      "../../lib/media-proxy": dataModule(
        'export function canvasSafeUrl(){ throw new Error("blocked URL"); }',
      ),
    })
  );
}

test("timeline rejects unavailable sources without unhandled probes or leaked media", async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  let sourceRemoved = false;
  let loadCalls = 0;
  globalThis.document = {
    createElement() {
      return {
        onloadedmetadata: null,
        onerror: null,
        removeAttribute(name) {
          if (name === "src") sourceRemoved = true;
        },
        load() {
          loadCalls += 1;
        },
      };
    },
  };
  globalThis.window = { setTimeout, clearTimeout };
  try {
    const { probeMediaSource } = await loadProbeWithRejectedUrlPolicy();
    assert.deepEqual(
      await probeMediaSource("javascript:blocked", "video"),
      { ok: false, reason: "error" },
    );
    assert.equal(sourceRemoved, true);
    assert.equal(loadCalls, 1);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }

  const [hook, preview, route, controls] = await Promise.all([
    source("src/shell/video-editor/use-video-timeline.ts"),
    source("src/shell/video-editor/preview-engine.ts"),
    source("src/shell/advanced-routes/VideoTimelineRoute.tsx"),
    source("src/shell/video-editor/VideoTimelineControls.tsx"),
  ]);
  assertTranspiles("use-video-timeline.ts", hook);
  assertTranspiles("VideoTimelineRoute.tsx", route);
  assertTranspiles("VideoTimelineControls.tsx", controls);
  const fileImport = hook.slice(
    hook.indexOf("const addMediaFile"),
    hook.indexOf("const addMediaUrl"),
  );
  assert.match(fileImport, /catch \(caught\) \{[\s\S]*素材导入失败/);
  // 存量素材没有可用地址时要失败，而不是悄悄变成空白工程（判定已搬进 video-timeline-source.ts）。
  assert.match(
    await source("src/shell/video-editor/video-timeline-source.ts"),
    /item\.source === "artifact" \|\|\s*isDurableLibraryItem\(item as LibraryItem\) \|\|\s*item\.artifactId[\s\S]*?error: VIDEO_TIMELINE_MISSING_MEDIA/,
  );
  assert.match(hook, /sourceReadyRef\.current/);
  assert.match(
    hook,
    /const requireSourceReady[\s\S]*已阻止修改空回退内容/,
  );
  assert.match(
    hook,
    /const applyEdit[\s\S]*!sourceReadyRef\.current && !verifiedSourceRecovery[\s\S]*requireSourceReady\(\);[\s\S]*return false;/,
  );
  assert.match(
    hook,
    /verifiedSourceRecovery = false[\s\S]*verifiedSourceRecovery && !sourceReadyRef\.current[\s\S]*undoStack\.current = \[\]/,
  );
  assert.match(
    hook,
    /const appended = applyEdit\([\s\S]*true,\s*\);[\s\S]*markSourceReady\(true\)/,
  );
  assert.match(hook, /已阻止保存空回退工程/);
  assert.match(hook, /已阻止导出空回退工程/);
  assert.match(hook, /if \(!mountedRef\.current\) return;/);
  assert.match(
    hook,
    /restoreRecovery[\s\S]*markSourceReady\(true\);[\s\S]*setError\(""\)/,
  );
  assert.match(
    route,
    /const sourceStopped = !editor\.loadingSource && !editor\.sourceReady/,
  );
  assert.match(
    route,
    /useExportDownloads\(\{[\s\S]*disabled: busy \|\| !editor\.sourceReady \|\| editor\.loadingSource/,
  );
  assert.match(
    route,
    /stage: sourcePending \?[\s\S]*sourceStopped \?[\s\S]*VideoTimelineStage/,
  );
  assert.match(
    route,
    /upload: editor\.loadingSource[\s\S]*onFiles: addLocalMedia/,
  );
  assert.match(
    route,
    /capture:\s*\(\) =>[\s\S]*editor\.sourceReady\s*\?\s*structuredClone\(timelineDocForStorage\(editor\.doc\)\)\s*:\s*null/,
  );
  assert.match(
    controls,
    /label=\{tt\("添加文字"\)\}[\s\S]*disabled=\{!state\.sourceReady\}/,
  );
  assert.match(
    preview,
    /const image = entry\.el as HTMLImageElement;[\s\S]*image\.removeAttribute\("src"\)/,
  );
});
