// Run with agent-io-guard run-heavy; always restores the exact source bytes.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const sourcePath = new URL("../../src/shell/ResultCanvas.tsx", import.meta.url);
const vitestCli = process.argv[2];
assert.ok(vitestCli, "Pass the installed node_modules/.bin/vitest path");
const original = await readFile(sourcePath, "utf8");
const override = `? previewEntries.map((entry) =>
                entry.id === activeCanvasEntry.id ? activeCanvasEntry : entry,
              )`;
assert.equal(original.split(override).length, 2, "Locate exactly one active preview override");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const before = sha(original);
try {
  await writeFile(sourcePath, original.replace(override, "? previewEntries"));
  let output = "";
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--experimental-strip-types", "--experimental-loader", "./tests/ts-extension-loader.mjs",
      vitestCli, "run", "tests/w13/attachment-integration.test.mjs", "--maxWorkers", "1",
      "--no-file-parallelism", "--testNamePattern", "first viewer paint.*collision=true",
    ], { cwd: new URL("../../", import.meta.url), stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", resolve);
  });
  console.log(output.slice(-9000));
  assert.equal(exitCode, 1, "Removing the active override must turn Vitest red");
  assert.match(output, /1 failed/, "The same-id integration case must fail");
  assert.match(output, /AssertionError/, "Failure must be an assertion, not setup");
  assert.match(output, /stale-list-image\.png/, "The failure must identify the stale image");
  assert.match(output, /exact-attachment\.png/, "The assertion must require the attachment image");
  console.log("W13b MUTATION DETECTED: removing the activeCanvasEntry override displays the stale image.");
} finally {
  await writeFile(sourcePath, original);
  assert.equal(sha(await readFile(sourcePath)), before, "Restore the exact original source bytes");
  console.log(`W13b SOURCE RESTORED sha256=${before}`);
}
