import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const mine = readFileSync(new URL("src/shell/MyLibrary.tsx", root), "utf8");
const sections = readFileSync(new URL("src/shell/library-sections.tsx", root), "utf8");
const cards = readFileSync(new URL("src/shell/workspace-library-view.tsx", root), "utf8");

test("unified Library has no section chips and omits source scoping", () => {
  assert.doesNotMatch(mine, /<LibrarySectionTabs/);
  assert.doesNotMatch(mine, /data-library-sections/);
  assert.match(mine, /listMyArtifacts\(\{\s*artifactType: "document"/);
  assert.doesNotMatch(mine, /listMyArtifacts\(\{\s*source:/);
});

test("card source labels use explicit metadata then server librarySource and are translated", () => {
  assert.match(sections, /library_source_label/);
  assert.match(sections, /item\.artifact\?\.librarySource/);
  assert.match(cards, /tt\(librarySourceLabel\(entry\.libraryItem/);
});

test("source captions cover creation, upload, LeoBay, LeoChat and link work", () => {
  for (const label of ["我的创作", "上传的", "来自 LeoBay", "来自 LeoChat"]) assert.match(sections, new RegExp(label));
  assert.match(mine, /link_work as \{ note\?: unknown \}/);
});

test("link note and filename are searchable in the shared entries", () => {
  assert.match(mine, /link_work as \{ note\?: unknown \}/);
  assert.match(mine, /chatFileLibraryItem\(file\)/);
  assert.match(mine, /title: file\.name/);
});

test("LeoChat files join the same list, load on demand, and never take over card clicks", () => {
  assert.match(mine, /await import\("\.\/library-chat-files"\)/, "the LeoChat client loads on demand (IM transport)");
  assert.doesNotMatch(mine, /^import \{[^}]*\} from "\.\/library-chat-files";/m, "no static runtime import");
  assert.match(mine, /library_source_label: "来自 LeoChat"/);
  assert.match(mine, /previewUrl: file\.url/, "a LeoChat file previews through the normal detail");
  assert.doesNotMatch(mine, /onOpenEntry=/, "My Library never overrides the card click (other cards would stop opening)");
});

test("uploaded actions retain item targeting without changing section", () => {
  assert.match(mine, /Uploaded actions still resolve by itemId/);
  assert.doesNotMatch(mine, /action\.action\?\.filter === "uploaded"\) changeSection/);
});
