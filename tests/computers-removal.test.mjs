import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve("src");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

test("retired computer display identifiers are absent from source", async () => {
  const files = await sourceFiles(root);
  const matches = [];
  for (const path of files) {
    const text = await readFile(path, "utf8");
    const forbidden = ["agentDialogWsUrl", ["agent", "dialog"].join("-")];
    if (forbidden.some((needle) => text.includes(needle))) matches.push(path);
  }
  assert.deepEqual(matches, []);
});

test("device route href helper uses computer and view query parameters", async () => {
  const source = await readFile(
    resolve("src/shell/cloud-computer/server-page/href.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /serverPageHref/);
  assert.doesNotMatch(source, /`\/computers\//);
});
