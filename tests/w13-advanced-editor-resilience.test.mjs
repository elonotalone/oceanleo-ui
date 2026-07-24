import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import ts from "typescript";

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
  assert.match(route, /officeSource\.error && !editor\.dirty/);
  assert.match(route, /!editor\.loading && !editor\.sourceReady/);
  assert.match(route, /editor\.sourceReady[\s\S]*capture:/);
});

test("chart load failure hides and fences the sample fallback", async () => {
  const [hook, route] = await Promise.all([
    source("src/shell/chart-editor/use-chart-workbench.ts"),
    source("src/shell/advanced-routes/ChartRoute.tsx"),
  ]);

  assert.match(hook, /sourceReadyRef\.current = false;[\s\S]*setSourceReady\(false\);/);
  assert.match(
    hook,
    /if \(!sourceReadyRef\.current\) \{[\s\S]*已阻止修改示例回退内容/,
  );
  assert.match(
    hook,
    /if \(!sourceReadyRef\.current\) \{[\s\S]*已阻止保存示例回退内容/,
  );
  assert.match(route, /!editor\.loading && !editor\.sourceReady/);
  assert.match(
    route,
    /capture:\s*\(\) =>[\s\S]*editor\.sourceReady\s*\?\s*structuredClone\(editor\.document\)\s*:\s*null/,
  );
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

  const [workbench, preview] = await Promise.all([
    source("src/shell/media-editors/use-pdf-workbench.ts"),
    source("src/shell/media-editors/use-pdf-preview-render.ts"),
  ]);
  assert.match(workbench, /item\.source === "creation"/);
  assert.match(workbench, /allowBlank:\s*allowBlankSource/);
  assert.match(workbench, /catch \(caught\) \{[\s\S]*PDF 本地草稿恢复失败/);
  assert.match(
    preview,
    /if \(disposed\) \{\s*page\.cleanup\(\);\s*return;\s*\}/,
  );
});

test("audio failures preserve prior state and close partial browser resources", async () => {
  const [workbench, persistence] = await Promise.all([
    source("src/shell/media-editors/AudioWorkbench.tsx"),
    source("src/shell/media-editors/use-audio-persistence.ts"),
  ]);

  assert.match(workbench, /requiresExistingSource/);
  assert.match(workbench, /item\.source === "artifact"/);
  assert.match(workbench, /已阻止用静音占位替代/);
  assert.match(workbench, /wave\.on\("error"/);
  assert.match(workbench, /URL\.revokeObjectURL\(objectUrlRef\.current\)/);

  const importSource = workbench.slice(
    workbench.indexOf("const importSource"),
    workbench.indexOf("const editSelection"),
  );
  assert.ok(
    importSource.indexOf("await reloadWaveform(decoded);") <
      importSource.indexOf("bufferRef.current = decoded;"),
    "waveform must load before imported audio replaces the durable editor state",
  );
  assert.match(importSource, /let context: AudioContext \| null = null/);
  assert.match(importSource, /context\?\.close\(\)\.catch/);

  const restore = persistence.slice(
    persistence.indexOf("const restoreRecovery"),
    persistence.indexOf("return { save, captureRecovery, restoreRecovery }"),
  );
  assert.ok(
    restore.indexOf("await reloadWaveform(decoded);") <
      restore.indexOf("bufferRef.current = decoded;"),
    "failed recovery rendering must not replace the prior audio state",
  );
  assert.match(restore, /catch \(caught\) \{[\s\S]*return false;/);
  assert.match(restore, /context\?\.close\(\)\.catch/);
  assert.match(
    restore,
    /requiresExistingSource && !project\.sourceUrl\.trim\(\)[\s\S]*静音占位替代/,
  );
});

async function loadProbeWithRejectedUrlPolicy() {
  const path = resolve("src/shell/video-editor/media-probe.ts");
  const input = (await readFile(path, "utf8")).replace(
    'import { canvasSafeUrl } from "../../lib/media-proxy";',
    'const canvasSafeUrl = () => { throw new Error("blocked URL"); };',
  );
  const output = ts.transpileModule(input, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path,
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
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
    assert.equal(
      await probeMediaSource("javascript:blocked", "video"),
      null,
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
  assert.match(
    hook,
    /item\.source === "artifact" \|\| isDurableLibraryItem\(item\)/,
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
    /disabled:[\s\S]*editor\.loadingSource \|\| !editor\.sourceReady/,
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
    /capture:\s*\(\) =>[\s\S]*editor\.sourceReady\s*\?\s*structuredClone\(editor\.doc\)\s*:\s*null/,
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
