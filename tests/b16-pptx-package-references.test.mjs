import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { strFromU8, unzipSync } from "fflate";

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
            jsx: url.endsWith(".tsx") ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve,
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

const { buildDeckDraftPptxBytes, buildDeckPptxBlob } = await import(
  "../src/shell/doc-editors/use-deck-editor.ts",
);
const { normalizeDeckDocument, createDeckMaster, emptyDeckSlide } = await import(
  "../src/shell/doc-editors/deck-schema.ts",
);

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/b17-pptx-preview-zero-slides.json", import.meta.url), "utf8"),
);

function assertPackageReferences(bytes) {
  const archive = unzipSync(bytes);
  const normalize = (value) => {
    const parts = [];
    for (const segment of value.replace(/^\//, "").split("/")) {
      if (!segment || segment === ".") continue;
      if (segment === "..") parts.pop();
      else parts.push(segment);
    }
    return parts.join("/");
  };
  const contentTypes = strFromU8(archive["[Content_Types].xml"]);
  for (const match of contentTypes.matchAll(/<Override\b[^>]*\bPartName="([^"]+)"/g)) {
    assert.ok(archive[normalize(match[1])]?.length, `missing Override target ${match[1]}`);
  }
  for (const [path, bytesPart] of Object.entries(archive)) {
    if (!path.endsWith(".rels")) continue;
    const xml = strFromU8(bytesPart);
    for (const match of xml.matchAll(/<Relationship\b([^>]*?)\bTarget="([^"]+)"([^>]*)\/>/g)) {
      const attrs = `${match[1]} ${match[3]}`;
      if (/\bTargetMode="External"\b/i.test(attrs)) continue;
      const target = match[2].split("#", 1)[0];
      if (/^[a-z][a-z\d+.-]*:/i.test(target)) continue;
      const owner = path.startsWith("_rels/")
        ? ""
        : path.slice(0, -5).replace(/\/_rels\/[^/]+$/, "");
      assert.ok(archive[normalize(`${owner}/${target}`)]?.length, `${path} -> ${target}`);
    }
  }
}

test("B17 malformed shape is represented by the fixture and the writer emits a complete package", async () => {
  assert.equal(fixture.slides.length, 2);
  const fixtureProject = {
    schema: "oceanleo.deck.v1",
    version: 1,
    title: fixture.title,
    theme: { accent: "2563EB" },
    slides: fixture.slides.map((slide) => ({ layout: "title", title: slide.title, body: slide.body, bullets: [] })),
    attribution: { entries: [] },
  };
  const normalProject = {
    ...fixtureProject,
    title: "正常 deck",
    slides: [{ layout: "title", title: "首页标题", body: "正文", bullets: [] }],
  };
  for (const project of [fixtureProject, normalProject]) {
    const bytes = await buildDeckDraftPptxBytes(project, { timestamp: "2026-09-25T00:00:00Z" });
    assertPackageReferences(bytes);
  }
});

test("普通编辑保存多页 PPT：能存下来，清单里登记的母版都真在包里", async () => {
  const master = createDeckMaster("ocean", "默认母版", "master-default");
  for (const count of [1, 2, 8]) {
    const deck = normalizeDeckDocument({
      version: 2,
      title: `${count} 页`,
      aspect: "16:9",
      theme: "ocean",
      masters: [master],
      slides: Array.from({ length: count }, (_, index) => ({
        ...emptyDeckSlide(index === 0 ? "首页标题" : `第 ${index + 1} 页`),
        masterId: master.id,
      })),
    });
    const bytes = new Uint8Array(await (await buildDeckPptxBlob(deck)).arrayBuffer());
    assertPackageReferences(bytes);
    const slides = Object.keys(unzipSync(bytes)).filter((path) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(path),
    );
    assert.equal(slides.length, count);
  }
});
