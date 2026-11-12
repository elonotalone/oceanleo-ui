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
      return {
        format: "builtin",
        source: "",
        shortCircuit: true,
      };
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

const { saveFileToLibraryWithDependencies } = await import(
  "../src/shell/doc-editors/doc-io.ts"
);
const { normalizeDeckDocument } = await import(
  "../src/shell/doc-editors/deck-schema.ts"
);
const {
  buildDeckPptxBlob,
  deckDeliveryUrlFor,
  deckSavedItemForHandoff,
  DECK_SOURCE_FORMAT,
  DECK_SOURCE_MEDIA_TYPE,
} = await import("../src/shell/doc-editors/use-deck-editor.ts");

const fixedNow = new Date("2026-07-23T12:34:56.000Z");

function deckDocument() {
  return normalizeDeckDocument({
    version: 2,
    title: "Quarterly Plan",
    aspect: "16:9",
    theme: "ocean",
    slides: [
      {
        id: "slide-delivery",
        title: "Delivery contract",
        layout: "blank",
        elements: [
          {
            id: "text-delivery",
            type: "text",
            x: 10,
            y: 15,
            width: 80,
            height: 20,
            rotation: 0,
            order: 1,
            text: "Editable source",
          },
        ],
      },
    ],
  });
}

function libraryItem(overrides = {}) {
  return {
    key: "creation:deck-original",
    source: "creation",
    id: "deck-original",
    title: "Quarterly Plan",
    kind: "ppt",
    siteId: "ppt",
    url: "https://cdn.test/original.pptx",
    previewUrl: "https://cdn.test/original-preview.png",
    thumbUrl: "https://cdn.test/original-thumb.png",
    favorite: false,
    meta: { root_asset_id: "deck-root" },
    ...overrides,
  };
}

async function digest(file) {
  return createHash("sha256")
    .update(Buffer.from(await file.arrayBuffer()))
    .digest("hex");
}

function producerDependencies({
  events,
  onSave,
  onPublish,
}) {
  let uploadSequence = 0;
  return {
    now: () => fixedNow,
    uploadFile: async (file, options) => {
      const role = /:project:/.test(options.idempotencyKey)
        ? "project"
        : /:preview:/.test(options.idempotencyKey)
          ? "preview"
          : "delivery";
      events.push(`upload:${role}`);
      uploadSequence += 1;
      const contentDigest = await digest(file);
      const url =
        role === "project"
          ? "https://cdn.test/quarterly.oceanleo-project.json"
          : role === "preview"
            ? "https://cdn.test/quarterly.preview.png"
            : "https://cdn.test/quarterly.pptx";
      return {
        ok: true,
        data: {
          file: {
            id: `upload-${uploadSequence}`,
            url,
            title: file.name,
            mime: file.type,
            artifact_id: `upload-artifact-${uploadSequence}`,
            revision_id: `upload-revision-${uploadSequence}`,
            meta: { content_digest: contentDigest },
          },
        },
      };
    },
    saveCreations: async (site, items) => {
      events.push("publish:creation");
      onSave?.(site, items);
      return {
        ok: true,
        data: {
          ok: true,
          saved: 1,
          durable: true,
          artifact_errors: [],
          items: [
            {
              id: "creation-deck-v2",
              site_id: site,
              ...items[0],
            },
          ],
        },
      };
    },
    createArtifactRevision: async (artifactId, commit) => {
      events.push("publish:revision");
      if (!onPublish) throw new Error("unexpected typed publish");
      return onPublish(artifactId, commit);
    },
  };
}

function saveInput(item, createFile, overrides = {}) {
  return {
    item,
    siteId: "ppt",
    fallbackSite: "ppt",
    createFile,
    sourceFormat: DECK_SOURCE_FORMAT,
    sourceMediaType: DECK_SOURCE_MEDIA_TYPE,
    title: "Quarterly Plan",
    mediaType: "ppt",
    kind: "deck",
    idempotencyKey: "deck:producer-contract:r1",
    workingHeadUrl: item.url,
    meta: {
      editor: "deck-editor",
      editor_capability: "deck-editor",
      deck_version: 2,
      slides: 1,
    },
    artifactRevision: {
      artifactType: "deck",
      provenance: { editorRevision: 1 },
    },
    ...overrides,
  };
}

const deliveryPromise = buildDeckPptxBlob(deckDocument());

test("deck creation uploads a PPTX without a structured project", async () => {
  const delivery = await deliveryPromise;
  const archive = unzipSync(new Uint8Array(await delivery.arrayBuffer()));
  assert.ok(archive["ppt/slides/slide1.xml"]);
  const events = [];
  let creation;
  const result = await saveFileToLibraryWithDependencies(saveInput(libraryItem(), async () => {
    events.push("build:delivery");
    return new File([delivery], "Quarterly Plan.pptx", { type: DECK_SOURCE_MEDIA_TYPE });
  }), producerDependencies({ events, onSave: (_site, items) => { creation = items[0]; } }));
  assert.equal(result.ok, true);
  assert.deepEqual(events, ["build:delivery", "upload:delivery", "publish:creation"]);
  assert.equal(creation.meta.source_format, "pptx");
  assert.equal(creation.meta.source_url, creation.url);
  assert.ok(!creation.meta.editor_project_url);
  assert.ok(!creation.meta.editor_manifest);
  const handoff = deckSavedItemForHandoff(libraryItem(), result);
  assert.equal(deckDeliveryUrlFor(handoff), result.url);
  assert.ok(!handoff.meta.editor_project_schema);
});

test("PPTX generation failure publishes nothing", async () => {
  const events = [];
  const result = await saveFileToLibraryWithDependencies(saveInput(libraryItem(), async () => {
    throw new Error("PPTX writer failed");
  }), producerDependencies({ events }));
  assert.equal(result.ok, false);
  assert.deepEqual(events, []);
});

test("deck delivery refuses JSON even when labelled as PPTX", () => {
  assert.equal(deckDeliveryUrlFor(libraryItem({ url: "https://cdn.test/source.json", meta: { source_format: "pptx" } })), "");
});

test("PPTX freeform positions survive export and re-import", async () => {
  const { importPptxDeck } = await import("../src/shell/doc-editors/pptx-deck-import.ts");
  const imported = await importPptxDeck(await (await deliveryPromise).arrayBuffer(), "Quarterly Plan");
  const text = imported.slides[0].elements.find((element) => element.text?.includes("Editable source"));
  assert.ok(text);
  assert.ok(Math.abs(text.x - 10) < 0.1);
  assert.ok(Math.abs(text.y - 15) < 0.1);
  assert.ok(Math.abs(text.width - 80) < 0.1);
});

test("PPTX handoff drops stale structured editor metadata", () => {
  const original = libraryItem({ meta: { editor_project_url: "https://cdn.test/old.json", editor_manifest_schema: "old", editor_working_head_url: "https://cdn.test/old.json", deck_asset_urls: {} } });
  const handoff = deckSavedItemForHandoff(original, { url: "https://cdn.test/new.pptx", versionId: "r2", projectUrl: "", projectSchema: "" });
  assert.equal(handoff.meta.editor_project_url, undefined);
  assert.equal(handoff.meta.editor_manifest_schema, undefined);
  assert.equal(handoff.meta.editor_working_head_url, undefined);
  assert.equal(handoff.meta.deck_asset_urls, undefined);
  assert.equal(deckDeliveryUrlFor(handoff), "https://cdn.test/new.pptx");
});
