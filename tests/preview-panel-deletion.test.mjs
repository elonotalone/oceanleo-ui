import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const shell = path.join(root, "src", "shell");

test("all file details use WorkspaceLibrary", () => {
  assert.equal(fs.existsSync(path.join(shell, "WorkspaceEntryCanvas.tsx")), false);

  const sourceFiles = fs
    .readdirSync(shell)
    .filter((name) => /\.(tsx|ts)$/.test(name))
    .map((name) => fs.readFileSync(path.join(shell, name), "utf8"));
  const source = sourceFiles.join("\n");
  assert.doesNotMatch(source, /WorkspaceEntryCanvas|PreviewPanel|data-attachment-preview/);

  const library = fs.readFileSync(path.join(shell, "WorkspaceLibrary.tsx"), "utf8");
  assert.match(library, /<header[\s\S]*selected\.title/);
  assert.match(library, /openEntryId\?: string \| null/);
  for (const name of ["AttachmentStrip.tsx", "ResultCanvas.tsx"]) {
    const file = fs.readFileSync(path.join(shell, name), "utf8");
    assert.doesNotMatch(file, /<header/);
  }
});
