import assert from "node:assert/strict";
import { File } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import mammoth from "mammoth";
import ts from "typescript";

function javascriptModuleFormat(url) {
  if (url.endsWith(".mjs")) return "module";
  if (url.endsWith(".cjs")) return "commonjs";
  let directory = dirname(fileURLToPath(url));
  while (true) {
    const packageJson = `${directory}/package.json`;
    if (existsSync(packageJson)) {
      try {
        return JSON.parse(readFileSync(packageJson, "utf8")).type === "module"
          ? "module"
          : "commonjs";
      } catch {
        return "commonjs";
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return "commonjs";
    directory = parent;
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL) {
      const unresolved = new URL(specifier, context.parentURL);
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(`${unresolved.href}${extension}`);
        if (existsSync(fileURLToPath(candidate))) {
          return { url: candidate.href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".tsx") || url.endsWith(".ts")) {
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: {
            jsx: url.endsWith(".tsx")
              ? ts.JsxEmit.ReactJSX
              : ts.JsxEmit.Preserve,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    if (url.startsWith("node:")) {
      return { format: "builtin", source: "", shortCircuit: true };
    }
    if (url.startsWith("file:") && !url.endsWith(".node")) {
      const format =
        url.endsWith(".js") ||
        url.endsWith(".mjs") ||
        url.endsWith(".cjs")
          ? javascriptModuleFormat(url)
          : context.format || (url.endsWith(".json") ? "json" : "module");
      return {
        format,
        source: readFileSync(fileURLToPath(url)),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const {
  fetchValidatedOfficePackage,
  officeRenditionPurposes,
  validateOfficePackageBlob,
  validateOfficePackageBytes,
  validateSpreadsheetParserBytes,
} = await import("../src/shell/doc-editors/office-file.ts");
const { buildDeckPptxBlob } = await import(
  "../src/shell/doc-editors/use-deck-editor.ts"
);
const { importPptxDeck } = await import(
  "../src/shell/doc-editors/pptx-deck-import.ts"
);
const { normalizeDeckDocument } = await import(
  "../src/shell/doc-editors/deck-schema.ts"
);
const { buildGridWorkbookBlob, loadGridFile } = await import(
  "../src/shell/doc-editors/grid-model.ts"
);
const { tiptapJsonToDocxBlob } = await import(
  "../src/shell/doc-editors/docx-export.ts"
);

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function tiptapDocumentFromMammoth(html) {
  const content = [];
  const blockPattern = /<(h([1-6])|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(blockPattern)) {
    const text = match[3]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    content.push({
      type: match[1].startsWith("h") ? "heading" : "paragraph",
      ...(match[2] ? { attrs: { level: Number(match[2]) } } : {}),
      content: text ? [{ type: "text", text }] : [],
    });
  }
  return { type: "doc", content };
}

test("Office rendition selection excludes PNG preview and signed 403 requests refresh", async () => {
  const item = {
    kind: "ppt",
    meta: { format: "pptx" },
    artifact: {
      sourceFormat: "pptx",
      renditions: {
        preview: {
          purpose: "preview",
          url: "https://signed.test/deck.png",
          mediaType: "image/png",
        },
        full: {
          purpose: "full",
          url: "https://signed.test/deck-full.pptx",
          mediaType: PPTX_MIME,
        },
        source: {
          purpose: "source",
          url: "https://signed.test/deck-source.pptx",
          mediaType: PPTX_MIME,
        },
      },
    },
  };
  assert.deepEqual(officeRenditionPurposes(item), ["source", "full"]);
  assert.deepEqual(
    officeRenditionPurposes({
      ...item,
      artifact: {
        ...item.artifact,
        renditions: {
          ...item.artifact.renditions,
          source: {
            purpose: "source",
            url: "https://signed.test/not-a-deck.png",
            mediaType: "image/png",
          },
        },
      },
    }),
    ["full", "source"],
  );

  const originalFetch = globalThis.fetch;
  let refreshes = 0;
  let requestCache = "";
  globalThis.fetch = async (_input, init) => {
    requestCache = init?.cache || "";
    return new Response("", { status: 403 });
  };
  try {
    await assert.rejects(
      fetchValidatedOfficePackage("blob:expired-office-source", "pptx", {
        onAccessDenied: () => {
          refreshes += 1;
        },
      }),
      /安全地址已失效.*刷新同一 revision/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(refreshes, 1);
  assert.equal(requestCache, "no-store");
});

test("preview and native Office routes consume only refreshable source/full inputs", () => {
  const source = (path) =>
    readFileSync(new URL(path, import.meta.url), "utf8");
  const viewer = source("../src/shell/library-viewers.tsx");
  const officeSource = source(
    "../src/shell/office-editor/useOfficeArtifactSource.ts",
  );
  const workbench = source("../src/shell/AdvancedContentWorkbench.tsx");
  assert.match(
    viewer,
    /useArtifactRendition\(\s*item,\s*officeViewerRenditionPurposes\(item\)/,
  );
  assert.match(viewer, /fetchValidatedOfficePackage/);
  assert.match(viewer, /fetchValidatedSpreadsheetSource/);
  assert.match(officeSource, /officeRenditionPurposes\(item\)/);
  assert.match(officeSource, /rendition\.purpose === "source"/);
  assert.match(officeSource, /rendition\.purpose === "full"/);
  assert.doesNotMatch(workbench, /\bOfficeRoute\b|case "office"/);
  for (const route of ["DeckRoute", "GridRoute", "RichDocRoute"]) {
    const contents = source(`../src/shell/advanced-routes/${route}.tsx`);
    assert.match(
      contents,
      /useOfficeArtifactSource\((?:item|openedItemRef\.current)\)/,
      route,
    );
    assert.match(contents, /resourceFailed/, route);
    assert.match(contents, /刷新 source\/full 后重试/, route);
  }
});

test("Content-Type, magic and OOXML parts reject PNG before every Office parser", async () => {
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const kind of ["pptx", "xlsx", "docx"]) {
    assert.throws(
      () => validateOfficePackageBytes(png, kind, "image/png"),
      /已阻止送入解析器|已阻止把图片/,
      kind,
    );
    assert.throws(
      () =>
        validateOfficePackageBytes(
          png,
          kind,
          "application/octet-stream",
        ),
      /魔数校验失败/,
      kind,
    );
  }
  assert.throws(
    () => validateSpreadsheetParserBytes(png, "application/octet-stream"),
    /已阻止送入 XLSX 解析器/,
  );
});

test("real PPTX load, mutate, save and reopen preserves slide layout and body", async () => {
  const fixture = normalizeDeckDocument({
    version: 2,
    title: "真实演示",
    aspect: "16:9",
    theme: "paper",
    slides: [
      {
        id: "slide-roundtrip",
        title: "第一页",
        body: "",
        bullets: [],
        notes: "版式证据",
        layout: "blank",
        background: "#f8fafc",
        elements: [
          {
            id: "text-roundtrip",
            type: "text",
            x: 12,
            y: 18,
            width: 62,
            height: 22,
            rotation: 0,
            order: 0,
            text: "载入正文",
            fontSize: 28,
            color: "#123456",
            bold: true,
          },
        ],
      },
    ],
  });
  const initial = await buildDeckPptxBlob(fixture);
  assert.equal(initial.type, PPTX_MIME);
  const initialBytes = await validateOfficePackageBlob(initial, "pptx");
  const loaded = await importPptxDeck(initialBytes, fixture.title);
  const loadedText = loaded.slides[0].elements.find((element) =>
    String(element.text || "").includes("载入正文"),
  );
  assert.ok(loadedText, JSON.stringify(loaded.slides[0].elements));
  loadedText.text = "真实 PPTX 往返正文";
  loadedText.x = 21;

  const saved = await buildDeckPptxBlob(loaded);
  assert.equal(saved.type, PPTX_MIME);
  const bytes = await validateOfficePackageBlob(saved, "pptx");
  const reopened = await importPptxDeck(bytes, loaded.title);
  const text = reopened.slides[0].elements.find((element) =>
    String(element.text || "").includes("真实 PPTX 往返正文"),
  );
  assert.equal(reopened.slides.length, 1);
  assert.equal(reopened.aspect, "16:9");
  assert.match(
    text?.text || "",
    /真实 PPTX 往返正文/,
    JSON.stringify(reopened.slides[0].elements),
  );
  assert.ok(Math.abs((text?.x || 0) - 21) < 1, `x=${text?.x}`);
});

test("real XLSX load, mutate, save and reopen preserves sheets, formula and format", async () => {
  const fixture = [
    {
      id: "budget",
      name: "预算",
      rows: [
        ["项目", "金额", "含税"],
        ["收入", "120", "=B2*1.13"],
      ],
      formats: {
        "0:0": { bold: true, background: "#e0e7ff" },
        "1:1": { type: "currency", decimals: 2, color: "#166534" },
      },
      merges: [],
      conditionalFormats: [],
    },
    {
      id: "notes",
      name: "说明",
      rows: [["正文"], ["载入后正文"]],
      formats: {},
      merges: [],
      conditionalFormats: [],
    },
  ];
  const initial = await buildGridWorkbookBlob(fixture);
  assert.equal(initial.type, XLSX_MIME);
  await validateOfficePackageBlob(initial, "xlsx");
  const sheets = await loadGridFile(
    new File([initial], "loaded.xlsx", { type: XLSX_MIME }),
  );
  assert.equal(sheets[0].rows[1][2], "=B2*1.13");
  sheets[0].rows[1][1] = "168";
  sheets[1].rows[1][0] = "真实 XLSX 往返正文";

  const saved = await buildGridWorkbookBlob(sheets);
  assert.equal(saved.type, XLSX_MIME);
  await validateOfficePackageBlob(saved, "xlsx");
  const reopened = await loadGridFile(
    new File([saved], "roundtrip.xlsx", { type: XLSX_MIME }),
  );
  assert.deepEqual(
    reopened.map((sheet) => sheet.name),
    ["预算", "说明"],
  );
  assert.equal(reopened[0].rows[1][1], "168");
  assert.equal(reopened[0].rows[1][2], "=B2*1.13");
  assert.equal(reopened[0].formats["1:1"].type, "currency");
  assert.equal(reopened[1].rows[1][0], "真实 XLSX 往返正文");
});

test("real DOCX load, mutate, save and reopen preserves document body", async () => {
  const fixture = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, textAlign: "center" },
        content: [{ type: "text", text: "原始标题" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "载入正文" }],
      },
    ],
  };
  const initial = await tiptapJsonToDocxBlob("载入文档", fixture);
  assert.equal(initial.type, DOCX_MIME);
  const initialBytes = await validateOfficePackageBlob(initial, "docx");
  const firstOpen = await mammoth.convertToHtml({
    buffer: Buffer.from(initialBytes),
  });
  const document = tiptapDocumentFromMammoth(firstOpen.value);
  assert.equal(document.content[0]?.type, "heading");
  assert.equal(document.content[0]?.content[0]?.text, "原始标题");
  assert.equal(document.content[1]?.content[0]?.text, "载入正文");
  document.content[0].content[0].text = "真实 DOCX 往返标题";
  document.content[1].content[0].text = "真实 DOCX 往返正文";

  const saved = await tiptapJsonToDocxBlob("真实文档", document);
  assert.equal(saved.type, DOCX_MIME);
  const bytes = await validateOfficePackageBlob(saved, "docx");
  const reopened = await mammoth.convertToHtml({
    buffer: Buffer.from(bytes),
  });
  assert.match(reopened.value, /真实 DOCX 往返标题/);
  assert.match(reopened.value, /真实 DOCX 往返正文/);
});
