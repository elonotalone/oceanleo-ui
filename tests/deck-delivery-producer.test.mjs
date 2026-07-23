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
  deckProjectUrlFor,
  deckSavedItemForHandoff,
  DECK_PROJECT_SCHEMA,
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
      const project = options.idempotencyKey.endsWith(":project");
      events.push(project ? "upload:project" : "upload:delivery");
      uploadSequence += 1;
      const contentDigest = await digest(file);
      const url = project
        ? "https://cdn.test/quarterly.oceanleo-project.json"
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
    project: {
      schema: DECK_PROJECT_SCHEMA,
      data: deckDocument(),
    },
    editorManifest: {
      id: "deck-editor",
      format: DECK_PROJECT_SCHEMA,
    },
    artifactRevision: {
      artifactType: "deck",
      provenance: { editorRevision: 1 },
    },
    ...overrides,
  };
}

const deliveryPromise = buildDeckPptxBlob(deckDocument());

test("deck creation publishes PPTX source and a separate structured editor head", async () => {
  const delivery = await deliveryPromise;
  const archive = unzipSync(new Uint8Array(await delivery.arrayBuffer()));
  assert.ok(archive["[Content_Types].xml"]);
  assert.ok(archive["ppt/presentation.xml"]);
  assert.ok(archive["ppt/slides/slide1.xml"]);

  const events = [];
  let creation;
  const dependencies = producerDependencies({
    events,
    onSave: (_site, items) => {
      creation = items[0];
    },
  });
  const result = await saveFileToLibraryWithDependencies(
    saveInput(libraryItem(), async () => {
      events.push("build:delivery");
      return new File([delivery], "Quarterly Plan.pptx", {
        type: DECK_SOURCE_MEDIA_TYPE,
      });
    }),
    dependencies,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(events, [
    "upload:project",
    "build:delivery",
    "upload:delivery",
    "publish:creation",
  ]);
  assert.equal(creation.url, "https://cdn.test/quarterly.pptx");
  assert.equal(creation.title, "Quarterly Plan");
  assert.equal(creation.media_type, "ppt");
  assert.equal(creation.kind, "deck");
  assert.equal(creation.meta.source_format, "pptx");
  assert.equal(creation.meta.source_media_type, DECK_SOURCE_MEDIA_TYPE);
  assert.equal(creation.meta.source_url, creation.url);
  assert.equal(
    creation.meta.editor_project_url,
    "https://cdn.test/quarterly.oceanleo-project.json",
  );
  assert.notEqual(creation.meta.editor_project_url, creation.meta.source_url);
  assert.equal(
    creation.meta.editor_manifest.source.url,
    creation.meta.editor_project_url,
  );
  assert.equal(
    creation.meta.editor_manifest.source.format,
    DECK_PROJECT_SCHEMA,
  );
  assert.equal(
    creation.meta.editor_working_head_url,
    creation.meta.editor_project_url,
  );
  assert.equal(creation.meta.root_asset_id, "deck-root");
  assert.equal(result.versionId, "creation-deck-v2");
  assert.equal(result.item.title, "Quarterly Plan");
  assert.equal(result.item.meta.source_format, "pptx");
});

test("failed PPTX generation keeps one reusable project upload and publishes nothing", async () => {
  const delivery = await deliveryPromise;
  const events = [];
  let saveCalls = 0;
  const dependencies = producerDependencies({
    events,
    onSave: () => {
      saveCalls += 1;
    },
  });
  const item = libraryItem();
  const failed = await saveFileToLibraryWithDependencies(
    saveInput(item, async () => {
      events.push("build:failed");
      throw new Error("pptx renderer failed");
    }),
    dependencies,
  );

  assert.equal(failed.ok, false);
  assert.match(failed.error, /pptx renderer failed/);
  assert.equal(
    failed.projectUrl,
    "https://cdn.test/quarterly.oceanleo-project.json",
  );
  assert.ok(failed.preparedProject);
  assert.equal(failed.preparedDelivery, undefined);
  assert.equal(saveCalls, 0);
  assert.deepEqual(events, ["upload:project", "build:failed"]);

  const retried = await saveFileToLibraryWithDependencies(
    saveInput(
      item,
      async () => {
        events.push("build:retry");
        return new File([delivery], "Quarterly Plan.pptx", {
          type: DECK_SOURCE_MEDIA_TYPE,
        });
      },
      { preparedProject: failed.preparedProject },
    ),
    dependencies,
  );

  assert.equal(retried.ok, true);
  assert.equal(
    events.filter((event) => event === "upload:project").length,
    1,
  );
  assert.equal(
    events.filter((event) => event === "upload:delivery").length,
    1,
  );
  assert.equal(saveCalls, 1);
});

test("typed deck save CAS-publishes same-root source and manifest, then hands off reopen/download metadata", async () => {
  const delivery = await deliveryPromise;
  const events = [];
  let capturedCommit;
  const item = libraryItem({
    key: "artifact:deck-artifact:r7",
    source: "artifact",
    id: "deck-artifact",
    artifactId: "deck-artifact",
    revisionId: "r7",
    artifactType: "deck",
    meta: {
      artifact_id: "deck-artifact",
      revision_id: "r7",
      artifact_type: "deck",
    },
  });
  const dependencies = producerDependencies({
    events,
    onSave: () => {
      throw new Error("typed save must not publish a legacy creation");
    },
    onPublish: (artifactId, commit) => {
      capturedCommit = commit;
      assert.equal(artifactId, "deck-artifact");
      const source = {
        purpose: "source",
        revisionId: "r8",
        url: "https://signed.test/deck-r8.pptx",
        format: "pptx",
        mediaType: DECK_SOURCE_MEDIA_TYPE,
        digest: `sha256:${commit.source.digest}`,
      };
      const editorManifest = {
        purpose: "editor_manifest",
        revisionId: "r8",
        url: "https://signed.test/deck-r8.project.json",
        format: DECK_PROJECT_SCHEMA,
        mediaType: "application/json",
        digest: `sha256:${commit.renditions[0].digest}`,
      };
      return {
        ok: true,
        data: {
          key: "artifact:deck-artifact:r8",
          source: "artifact",
          id: "deck-artifact",
          artifactId: "deck-artifact",
          revisionId: "r8",
          artifactType: "deck",
          title: "Quarterly Plan",
          kind: "ppt",
          siteId: "ppt",
          url: source.url,
          favorite: false,
          meta: {
            artifact_id: "deck-artifact",
            revision_id: "r8",
            artifact_type: "deck",
          },
          artifact: {
            artifactId: "deck-artifact",
            revisionId: "r8",
            artifactType: "deck",
            sourceFormat: "pptx",
            integrity: { ok: true, code: "ok", reason: "" },
            renditions: {
              source,
              editor_manifest: editorManifest,
            },
          },
        },
      };
    },
  });

  const result = await saveFileToLibraryWithDependencies(
    saveInput(item, async () => {
      events.push("build:delivery");
      return new File([delivery], "Quarterly Plan.pptx", {
        type: DECK_SOURCE_MEDIA_TYPE,
      });
    }),
    dependencies,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(events, [
    "upload:project",
    "build:delivery",
    "upload:delivery",
    "publish:revision",
  ]);
  assert.equal(capturedCommit.expectedRevisionId, "r7");
  assert.equal(capturedCommit.source.format, "pptx");
  assert.equal(capturedCommit.renditions[0].purpose, "editor_manifest");
  assert.notEqual(
    capturedCommit.source.url,
    capturedCommit.renditions[0].url,
  );
  assert.equal(result.artifactId, "deck-artifact");
  assert.equal(result.revisionId, "r8");
  assert.equal(result.previousRevisionId, "r7");

  const handoff = deckSavedItemForHandoff(item, result);
  assert.equal(deckDeliveryUrlFor(handoff), "https://signed.test/deck-r8.pptx");
  assert.equal(
    deckProjectUrlFor(handoff),
    "https://cdn.test/quarterly.oceanleo-project.json",
  );
  assert.equal(handoff.meta.source_format, "pptx");
  assert.equal(handoff.meta.source_media_type, DECK_SOURCE_MEDIA_TYPE);
  assert.equal(
    handoff.meta.editor_project_url,
    "https://cdn.test/quarterly.oceanleo-project.json",
  );
  assert.equal(handoff.meta.previous_revision_id, "r7");
  assert.equal(handoff.title, "Quarterly Plan");
  assert.equal(handoff.meta.editor_manifest.source.format, DECK_PROJECT_SCHEMA);
  assert.equal(
    handoff.meta.editor_manifest.source.url,
    handoff.meta.editor_project_url,
  );
  assert.notEqual(deckDeliveryUrlFor(handoff), deckProjectUrlFor(handoff));
});

test("legacy oceanleo.deck.v1 source is editor head, never delivery", () => {
  const legacy = libraryItem({
    key: "artifact:deck-legacy:r1",
    source: "artifact",
    id: "deck-legacy",
    artifactId: "deck-legacy",
    revisionId: "r1",
    artifactType: "deck",
    url: "https://cdn.test/legacy-deck.json",
    meta: {
      artifact_id: "deck-legacy",
      revision_id: "r1",
      artifact_type: "deck",
      source_format: DECK_PROJECT_SCHEMA,
      source_media_type: "application/vnd.oceanleo.deck+json",
    },
    artifact: {
      artifactId: "deck-legacy",
      revisionId: "r1",
      artifactType: "deck",
      sourceFormat: DECK_PROJECT_SCHEMA,
      integrity: { ok: true, code: "ok", reason: "" },
      renditions: {
        source: {
          purpose: "source",
          revisionId: "r1",
          url: "https://cdn.test/legacy-deck.json",
          format: DECK_PROJECT_SCHEMA,
          mediaType: "application/vnd.oceanleo.deck+json",
          digest: "sha256:abc",
        },
      },
    },
  });

  assert.equal(deckProjectUrlFor(legacy), "https://cdn.test/legacy-deck.json");
  assert.equal(deckDeliveryUrlFor(legacy), "");
});

test("doc-io rejects editor JSON masquerading as delivery source", async () => {
  const events = [];
  const dependencies = producerDependencies({
    events,
    onSave: () => {
      throw new Error("must not publish");
    },
  });
  const failed = await saveFileToLibraryWithDependencies(
    saveInput(libraryItem(), async () => {
      throw new Error("should not build delivery");
    }, {
      sourceFormat: DECK_PROJECT_SCHEMA,
      sourceMediaType: "application/vnd.oceanleo.deck+json",
    }),
    dependencies,
  );
  assert.equal(failed.ok, false);
  assert.match(failed.error, /交付 source 不能是 editor JSON/);
  assert.deepEqual(events, []);
});
