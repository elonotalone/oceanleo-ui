import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

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
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    if (url.startsWith("file:") && !url.endsWith(".node")) {
      let format = context.format;
      if (!format && (url.endsWith(".js") || url.endsWith(".mjs") || url.endsWith(".cjs"))) {
        let directory = dirname(fileURLToPath(url));
        while (true) {
          const packageUrl = new URL("package.json", `file://${directory}/`);
          if (existsSync(fileURLToPath(packageUrl))) {
            try {
              format = JSON.parse(readFileSync(fileURLToPath(packageUrl), "utf8")).type === "module" ? "module" : "commonjs";
            } catch {
              format = "commonjs";
            }
            break;
          }
          const parent = dirname(directory);
          if (parent === directory) break;
          directory = parent;
        }
      }
      return {
        format: format || (url.endsWith(".json") ? "json" : "module"),
        source: readFileSync(fileURLToPath(url)),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { deckDocumentToPptist } = await import(
  "../src/shell/doc-editors/deck-pptist-carrier.ts"
);
const { deckDeliveryUrlFor } = await import(
  "../src/shell/doc-editors/use-deck-editor.ts"
);
const { normalizeDeckDocument } = await import(
  "../src/shell/doc-editors/deck-schema.ts"
);
const { materializeHandoffJson } = await import(
  "../src/shell/advanced-routes/editor-handoff.ts"
);

const OLD_URL = "https://files.test/deck-old.pptx";
const NEW_URL = "https://files.test/deck-new.pptx";
const SIGNED_AT = Date.parse("2026-09-25T00:00:00.000Z");
const EXPIRES_AT = SIGNED_AT + 300_000;

function itemWithUrl(url) {
  return {
    id: "deck-g4",
    key: "deck-g4",
    title: "运营部月度工作汇报",
    kind: "ppt",
    artifactId: "artifact-g4",
    revisionId: "revision-g4",
    url,
    meta: { source_format: "pptx" },
    artifact: {
      artifactType: "deck",
      sourceFormat: "pptx",
      renditions: {
        source: {
          url: OLD_URL,
          format: "pptx",
          mediaType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          expiresAt: new Date(EXPIRES_AT).toISOString(),
        },
      },
    },
  };
}

const sourceDeck = normalizeDeckDocument({
  version: 2,
  title: "运营部月度工作汇报",
  slides: Array.from({ length: 8 }, (_, index) => ({
    id: `slide-${index + 1}`,
    title: index === 0 ? "月度工作汇报" : `第 ${index + 1} 页`,
    body: `正文 ${index + 1}`,
    bullets: [],
    elements: [],
  })),
});

function fakePptxImport() {
  return deckDocumentToPptist(sourceDeck);
}

test("G4: old signed URL expires at 300s, refreshed URL preserves every page through pro and back", async () => {
  const originalNow = Date.now;
  let now = SIGNED_AT;
  const calls = [];
  Date.now = () => now;
  try {
    const initialItem = itemWithUrl(OLD_URL);
    assert.equal(deckDeliveryUrlFor(initialItem), OLD_URL);

    const fetchDeck = async (item) => {
      const url = deckDeliveryUrlFor(item);
      calls.push({ url, now });
      if (url === OLD_URL && now >= EXPIRES_AT) {
        throw new Error("源文件读取失败（HTTP 410）");
      }
      return sourceDeck;
    };

    const normalBeforeExpiry = await fetchDeck(initialItem);
    assert.equal(normalBeforeExpiry.slides.length, 8);
    assert.equal(normalBeforeExpiry.slides[0].title, "月度工作汇报");

    now = EXPIRES_AT + 1_000;
    await assert.rejects(() => fetchDeck(initialItem), /HTTP 410/);

    // This is the rendition refresh the shell performs after the 410. The
    // embedded artifact URL intentionally stays old; only item.url changes.
    const refreshedItem = itemWithUrl(NEW_URL);
    const normalAfterRefresh = await fetchDeck(refreshedItem);
    assert.equal(normalAfterRefresh.slides.length, 8);
    assert.equal(normalAfterRefresh.slides[7].title, "第 8 页");

    const pro = await materializeHandoffJson({
      kind: "inline",
      json: fakePptxImport(),
      revision: "revision-g4",
    });
    assert.equal(pro.ok, true);
    assert.equal(pro.slideCount, 8);
    assert.match(pro.json.slides[0].elements[0].content, /月度工作汇报/);

    const normalAfterReturning = await fetchDeck(refreshedItem);
    assert.equal(normalAfterReturning.slides.length, 8);
    assert.equal(normalAfterReturning.slides[0].body, "正文 1");
    assert.deepEqual(
      calls.map(({ url }) => url),
      [OLD_URL, OLD_URL, NEW_URL, NEW_URL],
    );
  } finally {
    Date.now = originalNow;
  }
});
