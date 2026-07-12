import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildLibraryItems,
  inferLibraryKind,
} from "../src/shell/library-data.ts";

test("viewer kind prefers explicit metadata and recognizes real Office files", () => {
  assert.equal(
    inferLibraryKind({
      meta: { library_kind: "video_canvas" },
      mediaType: "video",
      url: "https://cdn.test/output.mp4",
    }),
    "video_canvas",
  );
  assert.equal(
    inferLibraryKind({ kind: "file", url: "https://cdn.test/board.xlsx?x=1" }),
    "sheet",
  );
  assert.equal(
    inferLibraryKind({ kind: "file", url: "https://cdn.test/deck.pptx" }),
    "ppt",
  );
  assert.equal(
    inferLibraryKind({
      mediaType: "other",
      kind: "preview",
      url: "https://p123.website.oceanleo.com",
    }),
    "website",
  );
});

test("works and task artifacts with the same URL merge into one rich item", () => {
  const items = buildLibraryItems(
    [
      {
        id: "creation-1",
        url: "https://cdn.test/deck.pptx?token=stable",
        title: "产品发布会",
        media_type: "ppt",
        site_id: "ppt",
        meta: { slides: [{ title: "封面" }] },
      },
    ],
    [
      {
        id: "artifact-1",
        url: "https://cdn.test/deck.pptx",
        title: "PPT",
        kind: "file",
        favorite: true,
        created_at: "2026-07-13T00:00:00Z",
      },
    ],
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "ppt");
  assert.equal(items[0].title, "产品发布会");
  assert.equal(items[0].favorite, true);
  assert.deepEqual(items[0].meta.slides, [{ title: "封面" }]);
});

test("registry exposes every requested content module including Excel and canvases", () => {
  const source = readFileSync(
    new URL("../src/shell/library-registry.tsx", import.meta.url),
    "utf8",
  );
  for (const id of [
    "lib_websites",
    "lib_canvas",
    "lib_slides",
    "lib_sheets",
    "lib_documents",
    "lib_images",
    "lib_videos",
    "lib_video_canvas",
    "lib_audio",
    "lib_xhs",
    "lib_threed",
  ]) {
    assert.match(source, new RegExp(`\"${id}\"`));
  }
  assert.doesNotMatch(source, /ArtifactLibrary/);
});

test("plus/minus control stays outside the scrollable site-tab lane", () => {
  const source = readFileSync(
    new URL("../src/shell/ResultCanvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /overflow-x-auto rounded-xl bg-stone-100/);
  assert.match(source, /grid h-7 w-7 shrink-0/);
  assert.match(source, /expanded \? "−" : "\+"/);
});
