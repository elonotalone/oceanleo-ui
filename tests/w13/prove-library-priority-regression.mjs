// Run under agent-io-guard run-heavy. Restores the owned source even on failure.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const sourcePath = new URL("../../src/shell/task-attachment-open.ts", import.meta.url);
const vitestCli = process.argv[2];
assert.ok(vitestCli, "Pass the installed node_modules/.bin/vitest path as the only argument");
const original = await readFile(sourcePath, "utf8");
const guard = "showLibraryRef.current && !isImageAttachment(taskOpenable(attachment))";
assert.equal(original.split(guard).length, 2, "Locate exactly one image-first guard");
const before = createHash("sha256").update(original).digest("hex");
let output = "";
try {
  await writeFile(sourcePath, original.replace(guard, "showLibraryRef.current"));
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--experimental-strip-types", "--experimental-loader", "./tests/ts-extension-loader.mjs",
      vitestCli, "run", "tests/w13/attachment-open.test.mjs", "--maxWorkers", "1",
      "--no-file-parallelism", "--testNamePattern", "upload completed|sent private reference",
    ], { cwd: new URL("../../", import.meta.url), stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", resolve);
  });
  console.log(output.slice(-12000));
  assert.notEqual(exitCode, 0, "Restoring Library-first routing must turn tests red");
  assert.match(output, /2 failed/, "Both uploaded and sent images must reject Library-first routing");
  assert.match(output, /AssertionError/, "Failure must come from an assertion, not setup");
  console.log("W13 MUTATION DETECTED: uploaded and sent image routing both failed as expected.");
} finally {
  await writeFile(sourcePath, original);
  const restored = createHash("sha256").update(await readFile(sourcePath)).digest("hex");
  assert.equal(restored, before, "Restore the exact original source bytes");
  console.log(`W13 SOURCE RESTORED sha256=${restored}`);
}
