import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const UI_ROOT = "/root/projects/oceanleo-ui";
const APP_ROOT = "/root/projects/oceanleo-app";
function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === "coverage"
    ) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

test("AGPL PPTist and other hosted cores stay out of oceanleo-ui source", () => {
  const files = walk(join(UI_ROOT, "src")).filter((path) =>
    /\.(ts|tsx|js|mjs|vue)$/.test(path),
  );
  for (const file of files) {
    if (file.includes("/tests/")) continue;
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /GNU Affero General Public License/);
  }
  const pkg = readFileSync(join(UI_ROOT, "package.json"), "utf8");
  assert.doesNotMatch(pkg, /pptist/);
  assert.doesNotMatch(pkg, /@umoteam\/editor/);
});

test("editor-cores in oceanleo-app holds manifests only, never AGPL source or dist", () => {
  const root = join(APP_ROOT, "editor-cores");
  assert.equal(statSync(root).isDirectory(), true);
  const files = walk(root);
  for (const file of files) {
    assert.equal(file.endsWith(".vue"), false, file);
    assert.doesNotMatch(file, /\/dist\//);
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /<template>/);
  }
  const lock = JSON.parse(readFileSync(join(root, "lock.json"), "utf8"));
  assert.equal(lock.cores.pptist.agpl, true);
  assert.match(lock.cacheRoot, /\/root\/\.cache\/oceanleo-react-rebuild\/hosted-cores/);
  assert.equal(lock.cacheRoot.includes("/oceanleo-app/"), false);
  assert.equal(lock.cacheRoot.includes("/oceanleo-ui/"), false);
});
