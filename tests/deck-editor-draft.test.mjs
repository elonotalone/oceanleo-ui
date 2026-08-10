import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { unzipSync } from "fflate";
import ts from "typescript";

if (!globalThis.File) globalThis.File = NodeFile;

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

const { buildDeckPptx } = await import(
  "../src/shell/doc-editors/deck-ooxml-package.ts"
);
const { validateDeckIr } = await import(
  "../src/shell/doc-editors/deck-ir.ts"
);
const { normalizeDeckDocument } = await import(
  "../src/shell/doc-editors/deck-schema.ts"
);
const { importPptxDeck } = await import(
  "../src/shell/doc-editors/pptx-deck-import.ts"
);
const {
  DeckDraftAssetError,
  applyDeckDocumentToDraft,
  buildDeckDraftPptxBytes,
  buildDeckPptxBlob,
  deckDocumentFromDraft,
  deckDraftFrom,
  resolveDeckDraftAssets,
} = await import("../src/shell/doc-editors/use-deck-editor.ts");

const FIXED_TIMESTAMP = "2026-08-10T00:00:00Z";
const IMAGE_URL = "https://assets.test/editor-draft.png";
const ORIGINAL_TEXT = "编辑产线保留原稿";
const EDITED_TEXT = "编辑产线保留原貌";
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function productionDraft(overrides = {}) {
  return {
    schema: "oceanleo.deck.v1",
    version: 1,
    title: "OceanLeo 编辑器稿子往返验证",
    theme: {
      accent: "2563EB",
      accent2: "C47323",
      fontMajor: "Aptos Display",
      fontMinor: "Aptos",
      fontEastAsian: "Microsoft YaHei",
    },
    slides: [
      {
        layout: "image-left",
        title: "只改一个字",
        bullets: [ORIGINAL_TEXT, "其余结构与媒体字节应保持原样"],
        images: [
          {
            assetId: "asset-hero",
            alt: "用于验证稿子往返的蓝色样例图片",
            fit: "cover",
          },
        ],
      },
    ],
    assets: [
      {
        id: "asset-hero",
        sha256: sha256(PNG_BYTES),
        mediaType: "image/png",
        byteSize: PNG_BYTES.byteLength,
        width: 1,
        height: 1,
        licenseCode: "test-fixture",
      },
    ],
    attribution: {
      entries: [
        {
          text: "OceanLeo test fixture",
          licenseCode: "test-fixture",
          licenseUrl: "https://oceanleo.test/licenses/test-fixture",
          assetId: "asset-hero",
        },
      ],
    },
    ...overrides,
  };
}

function draftExportOptions() {
  return {
    timestamp: FIXED_TIMESTAMP,
    assetUrls: { "asset-hero": IMAGE_URL },
    loadAsset: async (asset, url) => {
      assert.equal(asset.id, "asset-hero");
      assert.equal(url, IMAGE_URL);
      return PNG_BYTES;
    },
  };
}

function zipPartDifferences(leftBytes, rightBytes) {
  const left = unzipSync(leftBytes);
  const right = unzipSync(rightBytes);
  const paths = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return paths.filter((path) => {
    if (!left[path] || !right[path]) return true;
    return !Buffer.from(left[path]).equals(Buffer.from(right[path]));
  });
}

test("production draft survives an untouched editor round-trip byte for byte", async () => {
  const input = productionDraft();
  const project = deckDraftFrom(JSON.parse(JSON.stringify(input)));
  assert.ok(project, "the production IR must be recognized by shape");

  const deck = deckDocumentFromDraft(project, { "asset-hero": IMAGE_URL });
  const roundTrippedProject = applyDeckDocumentToDraft(project, deck);
  const direct = buildDeckPptx(project, {
    timestamp: FIXED_TIMESTAMP,
    assets: [
      {
        id: "asset-hero",
        bytes: PNG_BYTES,
        width: 1,
        height: 1,
      },
    ],
  }).bytes;
  const throughEditor = await buildDeckDraftPptxBytes(
    roundTrippedProject,
    draftExportOptions(),
  );

  const directSha256 = sha256(direct);
  const editorSha256 = sha256(throughEditor);
  assert.equal(editorSha256, directSha256);
  assert.deepEqual(throughEditor, direct);
  console.log(`direct_sha256=${directSha256}`);
  console.log(`editor_roundtrip_sha256=${editorSha256}`);
});

test("editing one character changes only that text in its slide OOXML part", async () => {
  const project = productionDraft();
  const deck = deckDocumentFromDraft(project, { "asset-hero": IMAGE_URL });
  const editable = deck.slides[0].elements.find(
    (element) => element.text === ORIGINAL_TEXT,
  );
  assert.ok(editable, "the source text must be addressable on the editor stage");
  editable.text = EDITED_TEXT;

  const unchanged = await buildDeckDraftPptxBytes(
    project,
    draftExportOptions(),
  );
  const changed = await buildDeckDraftPptxBytes(
    applyDeckDocumentToDraft(project, deck),
    draftExportOptions(),
  );
  const differingParts = zipPartDifferences(unchanged, changed);
  assert.deepEqual(differingParts, ["ppt/slides/slide1.xml"]);

  const beforeSlide = new TextDecoder().decode(
    unzipSync(unchanged)["ppt/slides/slide1.xml"],
  );
  const afterSlide = new TextDecoder().decode(
    unzipSync(changed)["ppt/slides/slide1.xml"],
  );
  assert.match(beforeSlide, new RegExp(ORIGINAL_TEXT));
  assert.match(afterSlide, new RegExp(EDITED_TEXT));
  assert.equal(afterSlide.replace(EDITED_TEXT, ORIGINAL_TEXT), beforeSlide);
  console.log(`one_character_changed_parts=${differingParts.join(",")}`);
  console.log(`edited_sha256=${sha256(changed)}`);
});

test("a PPTX without a production draft still uses the import and pptxgenjs route", async () => {
  const legacyDeck = normalizeDeckDocument({
    version: 2,
    title: "Legacy PPTX route",
    aspect: "16:9",
    theme: "paper",
    slides: [
      {
        id: "legacy-slide",
        title: "Legacy PPTX route",
        layout: "blank",
        elements: [
          {
            id: "legacy-text",
            type: "text",
            x: 12,
            y: 18,
            width: 70,
            height: 18,
            rotation: 0,
            order: 0,
            text: "没有稿子的素材继续走 pptxgenjs",
            fontSize: 28,
            color: "#123456",
            bold: true,
          },
        ],
      },
    ],
  });
  const source = await buildDeckPptxBlob(legacyDeck);
  const imported = await importPptxDeck(
    await source.arrayBuffer(),
    legacyDeck.title,
  );
  const importedText = imported.slides[0].elements.find((element) =>
    String(element.text || "").includes("没有稿子的素材继续走 pptxgenjs"),
  );
  assert.ok(importedText, JSON.stringify(imported.slides[0].elements));
  importedText.text = "没有稿子的素材继续走 pptxgenjs 老路";

  const delivery = await buildDeckPptxBlob(imported);
  const reopened = await importPptxDeck(
    await delivery.arrayBuffer(),
    imported.title,
  );
  assert.equal(reopened.slides.length, 1);
  assert.ok(
    reopened.slides[0].elements.some((element) =>
      String(element.text || "").includes("没有稿子的素材继续走 pptxgenjs 老路"),
    ),
    JSON.stringify(reopened.slides[0].elements),
  );
});

test("missing draft images abort with DeckDraftAssetError instead of an empty frame", async () => {
  const project = productionDraft();
  let failure;
  await assert.rejects(
    resolveDeckDraftAssets(project, {
      assetUrls: {},
      loadAsset: async () => {
        throw new Error("the loader must not run without an address");
      },
    }),
    (caught) => {
      failure = caught;
      return (
        caught instanceof DeckDraftAssetError &&
        caught.code === "deck-draft-assets-missing" &&
        assert.deepEqual(caught.assetIds, ["asset-hero"]) === undefined &&
        /asset-hero.*没有可用的图片地址/.test(caught.message)
      );
    },
  );
  assert.ok(failure);
  console.log(`missing_asset_failure=${failure.name}: ${failure.message}`);
});

test("packId remains enumerable and valid after JSON persistence", () => {
  const persisted = JSON.parse(
    JSON.stringify(
      productionDraft({
        packId: "paper-cut-amber",
      }),
    ),
  );
  assert.equal(persisted.packId, "paper-cut-amber");
  assert.ok(Object.keys(persisted).includes("packId"));
  const validation = validateDeckIr(persisted);
  assert.equal(
    validation.ok,
    true,
    validation.ok ? "" : JSON.stringify(validation.errors),
  );
  assert.equal(deckDraftFrom(persisted)?.packId, "paper-cut-amber");
});
