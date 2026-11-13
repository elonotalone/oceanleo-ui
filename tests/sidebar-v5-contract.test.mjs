import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const navSource = readFileSync(
  new URL("../src/shell/nav-source/index.ts", import.meta.url),
  "utf8",
);
const artifactLibrary = readFileSync(
  new URL("../src/shell/ArtifactLibrary.tsx", import.meta.url),
  "utf8",
);
const fileLibrary = readFileSync(
  new URL("../src/shell/FileLibrary.tsx", import.meta.url),
  "utf8",
);

test("file categories and legacy tabs always render in the main page", () => {
  assert.match(artifactLibrary, /\{!hideChips && \(\s*<CollectionFilterRow>\s*<CollectionFilterSelect/);
  assert.match(artifactLibrary, /name="type"[\s\S]*?onChange=\{\(id\) => setFilter/);
  assert.doesNotMatch(
    artifactLibrary,
    /controlledFilter === undefined && \(\s*<(?:LibraryChips|CollectionFilterRow)/,
  );
  assert.match(fileLibrary, /<div className="flex gap-1 rounded-xl bg-stone-100 p-1">/);
  assert.doesNotMatch(
    fileLibrary,
    /!hideHeader && \(\s*<div className="flex gap-1 rounded-xl bg-stone-100 p-1">/,
  );
});

test("every FileLibrary panel offers a retry action in its error state", () => {
  assert.equal(
    fileLibrary.split("onRetry={").length - 1,
    4,
    "FilesPanel, WorksPanel, AssetsPanel and KnowledgePanel each wire onRetry",
  );
  assert.match(fileLibrary, /onRetry\?: \(\) => void/);
  assert.match(fileLibrary, /\{tt\("重试"\)\}/);
});
