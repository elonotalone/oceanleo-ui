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

function richItem() {
  return {
    key: "artifact:rich-1",
    source: "artifact",
    id: "rich-1",
    title: "Brief",
    kind: "document",
    siteId: "word",
    url: "https://cdn.oceanleo.com/shelf/brief.docx",
    previewUrl: "",
    thumbUrl: "",
    favorite: false,
    artifactId: "art-rich-1",
    revisionId: "rev-rich-1",
    artifactType: "document",
    meta: {
      artifact_id: "art-rich-1",
      revision_id: "rev-rich-1",
      artifact_type: "document",
    },
  };
}

test("project upload idempotency key binds content digest (avoids 409 on revision reuse)", async () => {
  const keys = [];
  const digests = [];
  let clock = 0;
  const dependencies = {
    uploadFile: async (file, options) => {
      keys.push(options.idempotencyKey);
      const digest = sha256(Buffer.from(await file.arrayBuffer()));
      digests.push(digest);
      return {
        ok: true,
        data: {
          ok: true,
          file: {
            url: `https://cdn.test/project-${keys.length}.json`,
            meta: { content_digest: digest },
          },
        },
      };
    },
    saveCreations: async (_site, items) => ({
      ok: true,
      data: {
        saved: 1,
        items: [
          {
            id: "creation-1",
            url: items[0].url,
            title: items[0].title,
            media_type: items[0].media_type,
            kind: items[0].kind,
            meta: items[0].meta,
          },
        ],
      },
    }),
    createArtifactRevision: async () => ({ ok: false, error: "not used" }),
    now: () => {
      clock += 1;
      return new Date(`2026-07-24T15:00:0${clock}.000Z`);
    },
  };

  const base = {
    item: richItem(),
    siteId: "word",
    fallbackSite: "word",
    title: "Brief-编辑版",
    mediaType: "doc",
    kind: "document",
    // Same local edit revision across calls — the V7 collision surface.
    idempotencyKey: "richdoc:rich-1:1",
    projectOnly: true,
    meta: { editor: "richdoc-v2" },
  };

  const first = await saveFileToLibraryWithDependencies(
    {
      ...base,
      project: {
        schema: "oceanleo.richdoc-project.v1",
        data: { type: "doc", content: [{ type: "paragraph", content: [] }] },
      },
    },
    dependencies,
  );
  const second = await saveFileToLibraryWithDependencies(
    {
      ...base,
      project: {
        schema: "oceanleo.richdoc-project.v1",
        data: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "V7-RICH-170536" }],
            },
          ],
        },
      },
    },
    dependencies,
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(keys.length, 2);
  assert.notEqual(digests[0], digests[1]);
  assert.match(keys[0], /^richdoc:rich-1:1:project:[0-9a-f]{24}$/);
  assert.match(keys[1], /^richdoc:rich-1:1:project:[0-9a-f]{24}$/);
  assert.notEqual(keys[0], keys[1]);
  assert.equal(keys[0], `richdoc:rich-1:1:project:${digests[0].slice(0, 24)}`);
  assert.equal(keys[1], `richdoc:rich-1:1:project:${digests[1].slice(0, 24)}`);
});

test("identical project bytes reuse the same upload idempotency key for CAS replay", async () => {
  const keys = [];
  let clock = 0;
  const dependencies = {
    uploadFile: async (file, options) => {
      keys.push(options.idempotencyKey);
      const digest = sha256(Buffer.from(await file.arrayBuffer()));
      return {
        ok: true,
        data: {
          ok: true,
          file: {
            url: "https://cdn.test/stable-project.json",
            meta: { content_digest: digest },
          },
        },
      };
    },
    saveCreations: async (_site, items) => ({
      ok: true,
      data: {
        saved: 1,
        items: [
          {
            id: "creation-1",
            url: items[0].url,
            title: items[0].title,
            media_type: items[0].media_type,
            kind: items[0].kind,
            meta: items[0].meta,
          },
        ],
      },
    }),
    createArtifactRevision: async () => ({ ok: false, error: "not used" }),
    // Wall clock advances, but callers that reuse preparedProject skip re-upload.
    now: () => {
      clock += 1;
      return new Date(`2026-07-24T16:00:0${clock}.000Z`);
    },
  };

  const project = {
    schema: "oceanleo.audio-project.v1",
    data: {
      sourceUrl: "https://cdn.test/checkpoint.wav",
      operations: [{ type: "crop", start: 0, end: 21 }],
    },
  };
  const first = await saveFileToLibraryWithDependencies(
    {
      item: {
        ...richItem(),
        id: "audio-1",
        kind: "audio",
        title: "Track",
        url: "https://cdn.oceanleo.com/shelf/track.mp3",
      },
      siteId: "audio",
      fallbackSite: "audio",
      title: "Track-编辑版",
      mediaType: "audio",
      kind: "audio",
      idempotencyKey: "audio:audio-1:1",
      projectOnly: true,
      project,
      meta: { editor: "audio-v3" },
    },
    dependencies,
  );
  assert.equal(first.ok, true);
  assert.ok(first.preparedProject);

  const second = await saveFileToLibraryWithDependencies(
    {
      item: {
        ...richItem(),
        id: "audio-1",
        kind: "audio",
        title: "Track",
        url: "https://cdn.oceanleo.com/shelf/track.mp3",
        meta: {
          ...richItem().meta,
          editor_project_url: first.projectUrl,
          editor_working_head_url: first.url,
          editor_working_head_uses_project_url: true,
        },
      },
      siteId: "audio",
      fallbackSite: "audio",
      title: "Track-编辑版",
      mediaType: "audio",
      kind: "audio",
      idempotencyKey: "audio:audio-1:1",
      projectOnly: true,
      project,
      preparedProject: first.preparedProject,
      meta: { editor: "audio-v3" },
    },
    dependencies,
  );

  assert.equal(second.ok, true);
  assert.equal(keys.length, 1, "preparedProject must skip a second upload");
  assert.match(keys[0], /^audio:audio-1:1:project:[0-9a-f]{24}$/);
});

test("delivery upload idempotency key also binds content digest", async () => {
  const keys = [];
  const dependencies = {
    uploadFile: async (file, options) => {
      keys.push(options.idempotencyKey);
      const digest = sha256(Buffer.from(await file.arrayBuffer()));
      return {
        ok: true,
        data: {
          ok: true,
          file: {
            url: `https://cdn.test/delivery-${keys.length}.bin`,
            meta: { content_digest: digest },
          },
        },
      };
    },
    saveCreations: async (_site, items) => ({
      ok: true,
      data: {
        saved: 1,
        items: [
          {
            id: "creation-1",
            url: items[0].url,
            title: items[0].title,
            media_type: items[0].media_type,
            kind: items[0].kind,
            meta: items[0].meta,
          },
        ],
      },
    }),
    createArtifactRevision: async () => ({ ok: false, error: "not used" }),
    now: () => new Date("2026-07-24T17:00:00.000Z"),
  };

  const deliveryA = new File([new Uint8Array([1, 2, 3])], "a.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const deliveryB = new File([new Uint8Array([9, 8, 7])], "b.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  for (const file of [deliveryA, deliveryB]) {
    const result = await saveFileToLibraryWithDependencies(
      {
        item: richItem(),
        siteId: "word",
        fallbackSite: "word",
        file,
        title: "Brief-编辑版",
        mediaType: "doc",
        kind: "document",
        sourceFormat: "docx",
        sourceMediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        idempotencyKey: "richdoc:rich-1:1",
        meta: { editor: "richdoc-v2" },
      },
      dependencies,
    );
    assert.equal(result.ok, true);
  }

  assert.equal(keys.length, 2);
  assert.match(keys[0], /^richdoc:rich-1:1:delivery:[0-9a-f]{24}$/);
  assert.match(keys[1], /^richdoc:rich-1:1:delivery:[0-9a-f]{24}$/);
  assert.notEqual(keys[0], keys[1]);
});
