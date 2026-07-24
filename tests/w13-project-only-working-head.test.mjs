import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function shelfAudioItem() {
  return {
    key: "artifact:audio-shelf",
    source: "artifact",
    id: "audio-shelf-1",
    title: "The Accident",
    kind: "audio",
    siteId: "asset",
    url: "https://cdn.oceanleo.com/shelf/the-accident.mp3",
    previewUrl: "https://cdn.oceanleo.com/shelf/the-accident.mp3",
    thumbUrl: "",
    favorite: false,
    artifactId: "art-audio-1",
    revisionId: "rev-audio-1",
    artifactType: "audio",
    meta: {
      artifact_id: "art-audio-1",
      revision_id: "rev-audio-1",
      artifact_type: "audio",
    },
  };
}

test("project-only save keys shelf audio by project URL instead of public source", async () => {
  let creation;
  const dependencies = {
    uploadFile: async (file) => ({
      ok: true,
      data: {
        ok: true,
        file: {
          url: "https://cdn.test/audio-edit.oceanleo-project.json",
          meta: { sha256: sha256(Buffer.from(await file.arrayBuffer())) },
        },
      },
    }),
    saveCreations: async (_site, items) => {
      creation = items[0];
      return {
        ok: true,
        data: {
          saved: 1,
          items: [
            {
              id: "creation-audio-1",
              url: items[0].url,
              title: items[0].title,
              media_type: items[0].media_type,
              kind: items[0].kind,
              meta: items[0].meta,
            },
          ],
        },
      };
    },
    createArtifactRevision: async () => ({
      ok: false,
      error: "not used",
    }),
    now: () => new Date("2026-07-24T15:00:00.000Z"),
  };

  const result = await saveFileToLibraryWithDependencies(
    {
      item: shelfAudioItem(),
      siteId: "asset",
      fallbackSite: "audio",
      title: "The Accident-编辑版",
      mediaType: "audio",
      kind: "audio",
      idempotencyKey: "audio:audio-shelf-1:1",
      workingHeadUrl: "https://cdn.oceanleo.com/shelf/the-accident.mp3",
      projectOnly: true,
      project: {
        schema: "oceanleo.audio-project.v1",
        data: {
          sourceUrl: "https://cdn.test/checkpoint.wav",
          operations: [],
        },
      },
      meta: {
        editor: "audio-v3",
      },
    },
    dependencies,
  );

  assert.equal(result.ok, true);
  assert.equal(
    creation.url,
    "https://cdn.test/audio-edit.oceanleo-project.json",
  );
  assert.notEqual(
    creation.url,
    "https://cdn.oceanleo.com/shelf/the-accident.mp3",
  );
  assert.equal(creation.meta.editor_working_head_uses_project_url, true);
  assert.equal(
    creation.meta.editor_working_head_url,
    "https://cdn.test/audio-edit.oceanleo-project.json",
  );
});

test("project-only save reuses prior editor working head after first success", async () => {
  let creation;
  const item = {
    ...shelfAudioItem(),
    url: "https://cdn.test/audio-edit.oceanleo-project.json",
    meta: {
      ...shelfAudioItem().meta,
      editor_project_url: "https://cdn.test/audio-edit.oceanleo-project.json",
      editor_working_head_url:
        "https://cdn.test/audio-edit.oceanleo-project.json",
      editor_working_head_uses_project_url: true,
    },
  };
  const dependencies = {
    uploadFile: async (file) => ({
      ok: true,
      data: {
        ok: true,
        file: {
          url: "https://cdn.test/audio-edit-r2.oceanleo-project.json",
          meta: { sha256: sha256(Buffer.from(await file.arrayBuffer())) },
        },
      },
    }),
    saveCreations: async (_site, items) => {
      creation = items[0];
      return {
        ok: true,
        data: {
          saved: 1,
          items: [
            {
              id: "creation-audio-1",
              url: items[0].url,
              title: items[0].title,
              media_type: items[0].media_type,
              kind: items[0].kind,
              meta: items[0].meta,
            },
          ],
        },
      };
    },
    createArtifactRevision: async () => ({
      ok: false,
      error: "not used",
    }),
    now: () => new Date("2026-07-24T15:00:00.000Z"),
  };

  const result = await saveFileToLibraryWithDependencies(
    {
      item,
      siteId: "asset",
      fallbackSite: "audio",
      title: "The Accident-编辑版",
      mediaType: "audio",
      kind: "audio",
      idempotencyKey: "audio:audio-shelf-1:2",
      workingHeadUrl: item.meta.editor_working_head_url,
      projectOnly: true,
      project: {
        schema: "oceanleo.audio-project.v1",
        data: {
          sourceUrl: "https://cdn.test/checkpoint.wav",
          operations: [{ type: "crop", start: 0, end: 21 }],
        },
      },
      meta: {
        editor: "audio-v3",
      },
    },
    dependencies,
  );

  assert.equal(result.ok, true);
  assert.equal(
    creation.url,
    "https://cdn.test/audio-edit.oceanleo-project.json",
  );
  assert.equal(
    creation.meta.editor_project_url,
    "https://cdn.test/audio-edit-r2.oceanleo-project.json",
  );
});
