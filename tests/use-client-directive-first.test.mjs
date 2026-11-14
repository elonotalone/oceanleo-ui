// Next.js only honours "use client" when it is the first statement of the module. An import placed above it compiles
// in tsc and node tests but breaks the whole LeoDev/portal build (wave 2026-11-15: editor-preview-raster.ts → HTTP 500).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function* sources(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name)) yield path;
  }
}

function firstStatement(text) {
  const withoutComments = text.replace(/^﻿/, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return withoutComments.split("\n").map((line) => line.trim()).find(Boolean) || "";
}

test('"use client" is the first statement wherever it appears', () => {
  const misplaced = [];
  for (const file of sources("src")) {
    const text = readFileSync(file, "utf8");
    if (!/^\s*["']use client["'];?\s*$/m.test(text)) continue;
    if (!/^["']use client["'];?$/.test(firstStatement(text))) misplaced.push(file);
  }
  assert.deepEqual(misplaced, []);
});
