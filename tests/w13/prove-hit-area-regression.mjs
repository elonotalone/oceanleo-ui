// Run through agent-io-guard run-heavy. Restore the exact source even on failure.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const source = new URL("../../src/lib/upload/upload-tile.tsx", import.meta.url);
const vitest = process.argv[2];
assert.ok(vitest, "Pass the installed node_modules/.bin/vitest path");
const original = await readFile(source, "utf8");
const offset = "style={{ right: -34, top: -34 }}";
assert.equal(original.split(offset).length, 2, "Find exactly one remove target");
const sha = data => createHash("sha256").update(data).digest("hex");
const before = sha(original);
try {
  await writeFile(source, original.replace(offset, "style={{ right: -14, top: -14 }}"));
  let output = "";
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--experimental-strip-types", "--experimental-loader", "./tests/ts-extension-loader.mjs",
      vitest, "run", "tests/w13/attachment-hit-area.test.mjs", "--maxWorkers", "1",
      "--no-file-parallelism", "--testNamePattern", "56px hover leaves image center clickable",
    ], {cwd:new URL("../../", import.meta.url),stdio:["ignore","pipe","pipe"]});
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {output += chunk;});
    child.on("error", reject); child.on("close", resolve);
  });
  console.log(output.slice(-7000));
  assert.equal(code, 1, "The original inward overlap must fail");
  assert.match(output, /1 failed/);
  assert.match(output, /AssertionError/);
  assert.match(output, /fixture\.png/);
  assert.match(output, /移除/);
  console.log("W13c MUTATION DETECTED: image center hits 移除 with right/top=-14.");
} finally {
  await writeFile(source, original);
  assert.equal(sha(await readFile(source)), before, "Restore exact source bytes");
  console.log(`W13c SOURCE RESTORED sha256=${before}`);
}
