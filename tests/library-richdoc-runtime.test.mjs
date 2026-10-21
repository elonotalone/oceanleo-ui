/**
 * Real native richdoc runtime regression for the screenshot's Markdown item.
 * The editor hook, Tiptap extensions, rich-doc loader/parser, review hook, and
 * stage are real. Only API/persistence/collaboration transports are isolated.
 */
import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const execFileAsync = promisify(execFile);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const [name, value] of Object.entries({
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  getSelection: window.getSelection.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  innerHeight: window.innerHeight,
  DOMRect: window.DOMRect,
  Range: window.Range,
  Event: window.Event,
  KeyboardEvent: window.KeyboardEvent,
  MouseEvent: window.MouseEvent,
  InputEvent: window.InputEvent,
})) {
  if (value) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
}

const ARTIFACT_ID = "21c1e4d9-0818-4bbe-ae33-b4d01a5beafd";
const REVISION_ID = "568afa53-b506-4492-9b07-bb2ac3729883";
const PREVIEW_ACCESS =
  "https://api.dev.oceanleo.com/v1/artifact-renditions/access/preview-token";
const MARKDOWN_BODY = [
  "# 需签字盖章页清单（只打第3页）",
  "",
  "按 2026 年 9 月已受理做法：备案系统上传 1 只需已签字盖章的自评报告。只打印第 3 页。",
  "",
  "| 文件 | 页码 | 要做什么 |",
  "| --- | --- | --- |",
  "| 打印签章页-第3页.pdf | 3 | 打印这一页。李一隆在算法安全负责人行签名旁手签。 |",
].join("\n");

function screenshotItem() {
  const sourceTree =
    `/v1/artifacts/${ARTIFACT_ID}/revisions/${REVISION_ID}/source-tree/@source`;
  return {
    id: ARTIFACT_ID,
    key: `artifact:${ARTIFACT_ID}:${REVISION_ID}`,
    source: "artifact",
    artifactId: ARTIFACT_ID,
    revisionId: REVISION_ID,
    artifactType: "document",
    title: "需签字盖章页清单（只打第3页）",
    kind: "document",
    siteId: "home",
    favorite: false,
    url: undefined,
    previewUrl: PREVIEW_ACCESS,
    meta: {
      filename: "需签字盖章页清单.md",
      source_format: "md",
      source_url: sourceTree,
    },
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId: ARTIFACT_ID,
      revisionId: REVISION_ID,
      artifactType: "document",
      sourceFormat: "md",
      renditions: {
        source: {
          url: sourceTree,
          mediaType: "text/markdown",
          purpose: "source",
          revisionId: REVISION_ID,
        },
        full: {
          url: sourceTree,
          mediaType: "text/markdown",
          purpose: "full",
          revisionId: REVISION_ID,
        },
        preview: {
          url: PREVIEW_ACCESS,
          mediaType: "text/markdown",
          purpose: "preview",
          revisionId: REVISION_ID,
        },
      },
    },
  };
}

const stubs = {
  "../../lib/database": dataModule(`
    export async function uploadFile() { throw new Error("unexpected uploadFile"); }
  `),
  "../artifact-client": dataModule(`
    export async function getArtifactItem() { return { ok: false, data: null }; }
    export async function refreshArtifactRendition() { return { ok: false, data: null }; }
  `),
  "../collab": dataModule(`
    export function useCollabReadOnly() { return false; }
  `),
  "../collab/adapters/richdoc": dataModule(`
    export const RICHDOC_COLLAB_FIELD = "richdoc";
    export function followRichDocExternalRevisions() { return () => {}; }
    export function renderRichDocCaret() { return null; }
    export function richDocCaretUser(value) { return value; }
    export function richDocCollabPhase({ room }) { return room ? "denied" : "off"; }
    export function richDocEditable() { return true; }
    export function richDocSelectionRender() { return null; }
    export async function saveRichDocWithRoom({ save }) { return { result: await save() }; }
    export function seedRichDoc() {}
  `),
  "./doc-io": dataModule(`
    export function downloadBlob() {}
    export function downloadText() {}
    export function urlExtension(value) {
      if (!value) return "";
      try {
        const pathname = new URL(value, "https://oceanleo.invalid").pathname.toLowerCase();
        return pathname.match(/\\.([a-z0-9]+)$/)?.[1] || "";
      } catch { return ""; }
    }
    export async function loadEditorProject() { throw new Error("unexpected project load"); }
    export async function saveFileToLibrary() {
      if (!globalThis.__richdocSaveReceipt) throw new Error("unexpected library save");
      return globalThis.__richdocSaveReceipt;
    }
  `),
  "./editor-preview-raster": dataModule(`
    export async function renderRichDocPreviewPng() { return null; }
  `),
  "./docx-export": dataModule(`
    export async function tiptapJsonToDocxBlob() { throw new Error("unexpected DOCX export"); }
  `),
  "../user-edit-session": dataModule(`
    export function userEditItemKey(item) { return item.artifactId || item.id || item.key || ""; }
    export function recordUserMutation(key) {
      globalThis.__richdocMutationKeys.push(key);
    }
  `),
  "./office-file": dataModule(`
    export function notifyOfficeAccessDenied() {}
    export function officePackageKindForItem() { return null; }
    export async function fetchValidatedOfficePackage() { throw new Error("unexpected office fetch"); }
    export function validateOfficePackageBlob() { throw new Error("unexpected office validation"); }
  `),
};

test("screenshot Markdown loads, edits and retains the canonical save receipt without a render loop", async () => {
  // module-bench resolves package imports through createRequire. Tiptap's
  // CommonJS PM wrappers intentionally expose only default/`__esModule`, so
  // run the real native modules under Node's import condition. Re-entering
  // this same test file keeps the outer suite command unchanged.
  if (process.env.OCEANLEO_RICHDOC_RUNTIME_CHILD !== "1") {
    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    childEnv.OCEANLEO_RICHDOC_RUNTIME_CHILD = "1";
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--conditions=import",
        "--import",
        "./tests/helpers/assert-dom-guard.mjs",
        "--experimental-strip-types",
        "--experimental-loader",
        "./tests/ts-extension-loader.mjs",
        "--test",
        fileURLToPath(import.meta.url),
      ],
      {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        env: childEnv,
        maxBuffer: 1_000_000,
      },
    );
    assert.match(stdout, /ok 1/);
    assert.match(stdout, /# pass 1/);
    return;
  }

  globalThis.__richdocMutationKeys = [];
  const hookUrl = await compileModule(
    "src/shell/doc-editors/use-rich-doc-editor.ts",
    stubs,
  );
  const stageUrl = await compileModule(
    "src/shell/doc-editors/RichDocStage.tsx",
    stubs,
  );
  const [{ useRichDocEditor }, { RichDocStage }] = await Promise.all([
    import(hookUrl),
    import(stageUrl),
  ]);

  const previousFetch = globalThis.fetch;
  const previousConsoleError = console.error;
  const fetchRequests = [];
  const reactErrors = [];
  const loopErrors = [];
  const container = document.createElement("div");
  document.body.append(container);
  let latest = null;
  let renderCount = 0;
  let root = null;

  globalThis.fetch = async (input) => {
    fetchRequests.push(String(input));
    return new Response(MARKDOWN_BODY, {
      status: 200,
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  };
  console.error = (...args) => {
    const message = args
      .map((value) =>
        value instanceof Error ? `${value.message}\n${value.stack || ""}` : String(value),
      )
      .join(" ");
    reactErrors.push(message);
    if (/Too many re-renders|Maximum update depth exceeded/i.test(message)) {
      loopErrors.push(message);
    }
    previousConsoleError(...args);
  };

  function Harness() {
    renderCount += 1;
    latest = useRichDocEditor(screenshotItem(), "home");
    return React.createElement(RichDocStage, { editor: latest });
  }

  try {
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Harness));
    });

    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      if (latest?.editor && latest.sourceReady && !latest.loading) {
        ready = true;
        break;
      }
      if (renderCount > 80) break;
    }

    assert.equal(ready, true, "the fixture should load into the native editor");
    assert.equal(latest.sourceReady, true);
    assert.equal(latest.source, "url-markdown");
    assert.equal(fetchRequests.length, 1, "only the source rendition is fetched");
    assert.match(fetchRequests[0], /preview-token/);
    assert.equal(
      container.querySelector(".ProseMirror")?.textContent?.includes("李一隆"),
      true,
      "the real stage should render the screenshot document body",
    );
    assert.ok(renderCount < 80, `initial load rendered ${renderCount} times`);
    assert.deepEqual(globalThis.__richdocMutationKeys, [], "loading the source must not authorize autosave");
    assert.deepEqual(loopErrors, []);

    const beforeSelection = renderCount;
    await act(async () => {
      latest.editor.commands.setTextSelection({ from: 2, to: 8 });
    });
    assert.equal(latest.review.hasSelection, true);
    assert.ok(
      renderCount - beforeSelection < 20,
      `selection transaction caused ${renderCount - beforeSelection} renders`,
    );

    const beforeEdit = renderCount;
    await act(async () => {
      latest.editor.commands.insertContentAt(1, "用例追加");
    });
    assert.equal(latest.dirty, true, "a native editor transaction marks dirty");
    assert.equal(globalThis.__richdocMutationKeys.at(-1), ARTIFACT_ID,
      "the edit generation uses the same stable artifact identity as the autosave controller, not a revision key");
    assert.equal(latest.editor.getText().includes("用例追加"), true);
    assert.ok(
      renderCount - beforeEdit < 20,
      `document transaction caused ${renderCount - beforeEdit} renders`,
    );
    assert.deepEqual(loopErrors, []);
    assert.equal(
      reactErrors.some((message) => /Too many re-renders|Maximum update depth exceeded/i.test(message)),
      false,
    );

    const committedItem = screenshotItem();
    committedItem.revisionId = "native-save-r2";
    committedItem.artifact = { ...committedItem.artifact, revisionId: "native-save-r2" };
    globalThis.__richdocSaveReceipt = {
      ok: true,
      url: "https://files.example/saved.md",
      projectUrl: "https://files.example/saved.richdoc.json",
      projectSchema: "oceanleo.richdoc.v1",
      versionId: "native-save-r2",
      revisionId: "native-save-r2",
      artifactId: ARTIFACT_ID,
      previousRevisionId: REVISION_ID,
      item: committedItem,
    };
    let saved;
    await act(async () => { saved = await latest.save(); });
    assert.equal(saved.item.revisionId, "native-save-r2");
    assert.equal(saved.item.artifact.revisionId, "native-save-r2",
      "the native save must retain the canonical returned artifact projection, not combine r2 scalar IDs with the old r1 projection");

    const beforeUnmount = renderCount;
    await act(async () => {
      root.unmount();
      root = null;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(renderCount, beforeUnmount, "unmount must stop React renders");
    assert.deepEqual(loopErrors, []);
  } finally {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    globalThis.fetch = previousFetch;
    delete globalThis.__richdocSaveReceipt;
    console.error = previousConsoleError;
    container.remove();
  }
});
