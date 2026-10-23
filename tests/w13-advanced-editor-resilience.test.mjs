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
  assert.match(route, /officeSource\.error && !editor\.dirty/);
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
  assert.match(workbench, /catch \(caught\) \{[\s\S]*PDF 本地草稿恢复失败/);
  // 缩略图：卸掉的那一张不再落图，object URL 随之释放。
  assert.match(rail, /if \(!alive\) return;\s*objectUrl = URL\.createObjectURL\(blob\)/);
  assert.match(rail, /alive = false;\s*if \(objectUrl\) URL\.revokeObjectURL\(objectUrl\)/);
});

test("audio failures preserve prior state and close partial browser resources", async () => {
  const [workbenchCore, waveLoader, persistence, importer] = await Promise.all([
    source("src/shell/media-editors/AudioWorkbench.tsx"),
    source("src/shell/media-editors/use-audio-wave-loader.ts"),
    source("src/shell/media-editors/use-audio-persistence.ts"),
    source("src/shell/media-editors/audio-source-import.ts"),
  ]);
  const workbench = workbenchCore + waveLoader;

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
  assert.match(importSource, /await importAudioSource\(file, item\.id, siteId, tt\)/);
  assert.match(importer, /const context = new AudioContext\(\)/);
  assert.match(importer, /finally \{\s*await context\.close\(\)\.catch/);

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

// 2026-08-05（W25）：这一格原来还读
// `/opt/cursor-workspaces/oceandino/scratch/advanced-editors-hardening-2026-07-24/V7-advanced/live_acceptance.py`
// 并对它断言四条（`arg=value`、`arg=str(expected).lower()`、`arg=before + 1`、
// `data-pdf-page-count`）。那个 scratch 目录已不存在（`ce7e3bf`，2026-07-24 加的行），
// 于是整份文件 `ENOENT`（`verdicts/W22-red-list.md` 第 10 条）。
//
// 判断结果是**删掉那四条，不搬进仓**，理由逐条：
//   · `data-pdf-page-count` —— 同一个 test 里下面就直接对 `PdfStage.tsx` 断言了两遍，
//     真正罩着产品行为的是那两条，读 harness 只是绕道抄了一遍；
//   · 另外三条判的是那个 Python 验收脚本自己怎么传参，罩的是 harness 的内部形状，
//     在本仓里没有对应物，搬进来也只是把一份死脚本供起来；
//   · 它本来的用法是真浏览器验收，而红线 §2.6 已明令禁止浏览器验证，这条路不会再走。
// 下面五条对仓内源码的断言是这一格的实际价值，原样保留。
test("W13 V7 product gates: PDF page count, audio project key, mute chrome, richdoc source", async () => {
  const [pdfRail, pdfWorkbench, audio, toolbar, richdoc] =
    await Promise.all([
      source("src/shell/media-editors/PdfControls.tsx"),
      source("src/shell/media-editors/use-pdf-workbench.ts"),
      source("src/shell/media-editors/AudioWorkbench.tsx"),
      source("src/shell/video-editor/video-edit-bar.ts"),
      source("src/shell/doc-editors/rich-doc-model.ts"),
    ]);

  // 10-23 D4：页数由左侧页面栏体现（每页一张缩略图），没有页数就没有缩略图。
  assert.match(pdfRail, /Array\.from\(\{ length: pageCount \}/);
  assert.match(pdfWorkbench, /item\.meta\.editor_source_url/);
  assert.match(
    audio,
    /workingHeadUrlRef = useRef\(\s*String\(item\.meta\.editor_working_head_url \|\| ""\)/,
  );
  assert.match(toolbar, /id:\s*"muted"[^\n]*value:\s*clip\.muted === true/);
  assert.match(toolbar, /case "muted":[\s\S]*?patchClip\(clip\.id, \{ muted: value === true \}\)/);
  assert.match(richdoc, /function richDocSourceUrl/);
  assert.match(richdoc, /item\.meta\.editor_source_url \|\| ""\)\.trim\(\)/);
  assert.match(richdoc, /item\.artifact\?\.renditions\.source\?\.url/);
});
