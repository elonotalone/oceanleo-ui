import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function sourceFiles(path) {
  const files = [];
  const collect = (target) => {
    for (const entry of readdirSync(target)) {
      const child = join(target, entry);
      if (statSync(child).isDirectory()) collect(child);
      else if (/\.[cm]?[jt]sx?$/.test(entry)) files.push(child);
    }
  };
  collect(fileURLToPath(new URL(path, ROOT)));
  return files;
}

const officeClient = await import("../src/lib/office-client.ts");

test("Office families select native document, grid and deck routes", () => {
  const {
    lightweightOfficeRouteForExtension,
    officeExtensionOf,
    officeKindForExtension,
  } = officeClient;

  assert.equal(lightweightOfficeRouteForExtension("report.docx"), "richdoc");
  assert.equal(lightweightOfficeRouteForExtension(".xlsx"), "grid");
  assert.equal(
    lightweightOfficeRouteForExtension(
      "https://files.test/presentation.pptx?signature=one",
    ),
    "deck",
  );
  assert.equal(lightweightOfficeRouteForExtension("preview.png"), null);
  assert.equal(officeExtensionOf("https://files.test/BUDGET.XLSX?q=1"), "xlsx");
  assert.equal(officeKindForExtension("docx"), "document");
  assert.equal(officeKindForExtension("xlsx"), "sheet");
  assert.equal(officeKindForExtension("pptx"), "ppt");
});

test("reachable lightweight Office code has no embedded-editor runtime", () => {
  const files = [
    new URL("../src/lib/office-client.ts", import.meta.url),
    new URL("../src/shell/advanced-routes/GridRoute.tsx", import.meta.url),
    new URL("../src/shell/advanced-routes/RichDocRoute.tsx", import.meta.url),
    new URL("../src/shell/advanced-routes/DeckRoute.tsx", import.meta.url),
    ...sourceFiles("src/shell/office-editor"),
    ...sourceFiles("src/shell/doc-editors"),
  ];
  const forbidden =
    /\bDocsAPI\b|\bloadOfficeScript\b|\bfetchOfficeConfig\b|onlyoffice|\/web-apps\/apps\/api\/documents\/api\.js|new\s+[A-Za-z0-9_.]*DocEditor\s*\(|createElement\s*\(\s*["']iframe["']|<iframe\b|\bnativeChrome\b/i;

  for (const file of files) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      forbidden,
      `embedded editor reference in ${file.pathname}`,
    );
  }
});

test("OnlyOffice route, components, transport API, and public export stay retired", () => {
  const workbench = source("../src/shell/AdvancedContentWorkbench.tsx");
  const officeExports = source("../src/shell/office-editor/index.ts");
  const publicLib = source("../src/lib/index.ts");

  assert.equal(
    existsSync(
      fileURLToPath(
        new URL(
          "../src/shell/advanced-routes/OfficeRoute.tsx",
          import.meta.url,
        ),
      ),
    ),
    false,
  );
  assert.equal(
    existsSync(
      fileURLToPath(
        new URL(
          "../src/shell/office-editor/OfficeWorkbench.tsx",
          import.meta.url,
        ),
      ),
    ),
    false,
  );
  assert.doesNotMatch(workbench, /\bOfficeRoute\b|case "office"/);
  assert.doesNotMatch(officeExports, /OfficeWorkbench|LightweightOffice/);
  assert.doesNotMatch(publicLib, /office-client/);
  assert.doesNotMatch(
    source("../src/lib/office-client.ts"),
    /\/v1\/office|office\.oceanleo\.com|DocsAPI|documentServerUrl/i,
  );
});

test("native Office editors keep compact top actions and durable receipts", () => {
  const actionBar = source("../src/shell/AdvancedWorkspaceActionBar.tsx");
  assert.match(actionBar, /role="toolbar"/);
  assert.match(actionBar, /aria-label=\{tt\("工作区操作"\)\}/);
  assert.match(actionBar, /className="flex h-8/);
  assert.match(actionBar, /autoSaveState === "saving"/);
  assert.match(actionBar, /adapter\.directDownload/);

  for (const routeName of ["RichDocRoute", "GridRoute", "DeckRoute"]) {
    const route = source(
      `../src/shell/advanced-routes/${routeName}.tsx`,
    );
    assert.match(route, /<AdvancedWorkbenchShell/, routeName);
    assert.match(route, /directDownload:/, routeName);
    assert.match(route, /persistence:/, routeName);
    assert.match(route, /advancedSavedItem/, routeName);
    assert.match(route, /versionId: saved\.versionId/, routeName);
  }
});

test("document, grid and deck chains expose load-edit-save-export without globals", () => {
  const rich = source("../src/shell/doc-editors/use-rich-doc-editor.ts");
  const grid = source("../src/shell/doc-editors/use-grid-editor.ts");
  const deck = source("../src/shell/doc-editors/use-deck-editor.ts");

  assert.match(rich, /loadRichDocHtml/);
  assert.match(rich, /setDirty\(true\)/);
  assert.match(rich, /saveFileToLibrary/);
  assert.match(rich, /tiptapJsonToDocxBlob/);
  assert.match(rich, /projectUrl: result\.projectUrl/);

  assert.match(grid, /loadGridSheets/);
  assert.match(grid, /setDirty\(true\)/);
  assert.match(grid, /saveFileToLibrary/);
  assert.match(grid, /buildGridWorkbookBlob/);
  assert.match(grid, /projectUrl: result\.projectUrl/);

  assert.match(deck, /importPptxDeck/);
  assert.match(deck, /setDirty\(true\)/);
  assert.match(deck, /saveFileToLibrary/);
  assert.match(deck, /buildDeckPptxBlob/);
  assert.match(deck, /projectUrl: result\.projectUrl/);
});

test("lightweight stages announce loading, error and empty states accessibly", () => {
  const richStage = source("../src/shell/doc-editors/RichDocStage.tsx");
  const richHook = source("../src/shell/doc-editors/use-rich-doc-editor.ts");
  const richModel = source("../src/shell/doc-editors/rich-doc-model.ts");
  const gridStage = source("../src/shell/doc-editors/GridStage.tsx");
  const deckStage = source("../src/shell/doc-editors/DeckStage.tsx");
  const deckHook = source("../src/shell/doc-editors/use-deck-editor.ts");
  const deckShortcuts = source(
    "../src/shell/doc-editors/use-deck-stage-shortcuts.ts",
  );

  for (const stage of [richStage, gridStage, deckStage]) {
    assert.match(stage, /aria-busy=\{editor\.loading\}/);
    assert.match(stage, /role="status"/);
    assert.match(stage, /role="alert"/);
  }
  assert.match(richStage, /空白文档/);
  assert.match(richHook, /"aria-multiline": "true"/);
  assert.match(richModel, /请转换为 DOCX 后重试/);
  assert.match(gridStage, /空白工作簿/);
  assert.match(gridStage, /event\.key === "Tab"/);
  assert.match(deckStage, /空白演示文稿/);
  assert.match(deckStage, /tabIndex=\{0\}/);
  assert.match(deckHook, /请转换为 PPTX 后重试/);
  assert.match(deckShortcuts, /scopeRef\.current\.contains\(target\)/);
});
