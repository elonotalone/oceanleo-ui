import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = new URL("../src/shell/", import.meta.url);
const contentPaths = [
  "doc-editors",
  "media-editors",
  "image-editor",
  "video-editor",
  "chart-editor",
  "AdvancedWorkbenchStage.tsx",
  "library-viewers.tsx",
  "cloud-computer/TerminalPanel.tsx",
  "advanced-routes",
  "site-catalog-deeplink.tsx",
];

async function sourceFiles(relative) {
  const url = new URL(relative, root);
  if (relative.endsWith(".tsx")) return [relative];
  const entries = await readdir(url, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const child = path.posix.join(relative, entry.name);
    return entry.isDirectory() || entry.name.endsWith(".tsx")
      ? sourceFiles(child)
      : [];
  }));
  return nested.flat();
}

test("pane content stays below edit chrome; only verified page notices and chrome exceed it", async () => {
  const files = (await Promise.all(contentPaths.map(sourceFiles))).flat();
  const violations = [];
  for (const file of files) {
    const source = await readFile(new URL(file, root), "utf8");
    const lines = source.split("\n");
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      for (const match of line.matchAll(/(?<![\w-])z-(?:\[(\d+)\]|(\d+))(?![\w-])/g)) {
        const layer = Number(match[1] ?? match[2]);
        if (layer <= 30 || layer >= 2_147_483_000) continue;
        const pageNotice = file === "site-catalog-deeplink.tsx"
          && layer === 50
          && line.includes("fixed inset-x-0 bottom-6");
        if (!pageNotice) violations.push(`${file}:${index + 1} z-${layer}`);
      }
      const inline = line.match(/zIndex:\s*(2_147_483_\d+|\d[\d_]*)/);
      if (inline) {
        const layer = Number(inline[1].replaceAll("_", ""));
        if (layer > 30 && layer < 2_147_483_000) {
          violations.push(`${file}:${index + 1} zIndex ${layer}`);
        }
      }
    }
  }
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("local content order survives the lower layer band", async () => {
  const deck = await readFile(new URL("doc-editors/DeckStage.tsx", root), "utf8");
  const ink = await readFile(new URL("doc-editors/DeckInkOverlay.tsx", root), "utf8");
  const presenter = await readFile(new URL("doc-editors/DeckPresenterView.tsx", root), "utf8");
  const workbench = await readFile(new URL("AdvancedWorkbenchStage.tsx", root), "utf8");
  assert.match(deck, /top-\[-72px\] z-20/);
  assert.match(deck, /data-deck-edit-text[\s\S]{0,400}z-\[25\]/);
  assert.match(ink, /absolute inset-0 z-30/);
  assert.match(presenter, /data-deck-presenter-ink[\s\S]{0,100}z-20/);
  assert.match(presenter, /data-deck-presenter-blackout[\s\S]{0,150}z-\[25\]/);
  assert.match(workbench, /absolute inset-3 z-\[28\]/);
  assert.match(workbench, /absolute bottom-5 left-1\/2 z-\[29\]/);
});
