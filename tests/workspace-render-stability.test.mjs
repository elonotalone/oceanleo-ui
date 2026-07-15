import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const appShell = source("../src/shell/AppShell.tsx");
const splitWorkspace = source("../src/shell/SplitWorkspace.tsx");
const operatorConsole = source("../src/shell/OperatorConsole.tsx");
const runtimeBoundary = source(
  "../src/shell/workspace-runtime-hydration.tsx",
);

test("canonical route updates keep the AppShell DOM surface mounted", () => {
  assert.equal(
    (appShell.match(/data-oceanleo-route-surface/g) || []).length,
    2,
  );
  assert.doesNotMatch(appShell, /key=\{pathname\}/);
  assert.doesNotMatch(appShell, /className="v-page contents"/);
});

test("one app-level owner controls entrance animation without nested remounts", () => {
  assert.equal(
    (operatorConsole.match(/className="v-page contents"/g) || []).length,
    1,
  );
  assert.match(operatorConsole, /<div key=\{pageKey\} className="v-page contents">/);
  assert.doesNotMatch(operatorConsole, /<div key=\{active\?\.id\} className="h-full">/);
});

test("configured library visibility never swaps out the left runtime tree", () => {
  assert.match(splitWorkspace, /if \(!hasRight && !library\)/);
  assert.match(
    splitWorkspace,
    /!hasRight \|\| maxed === "left" \? "hidden" : "flex"/,
  );
  assert.match(splitWorkspace, /<div className=\{bodyClass\}>\{left\}<\/div>/);
});

test("remembered split ratio is restored before paint with SSR-stable markup", () => {
  const start = splitWorkspace.indexOf(
    "Restore the remembered ratio during hydration's layout phase",
  );
  const end = splitWorkspace.indexOf(
    "// Agent result cards",
    start,
  );
  assert.ok(start >= 0 && end > start);
  const restoreBlock = splitWorkspace.slice(start, end);
  assert.match(restoreBlock, /useLayoutEffect\(\(\) =>/);
  assert.match(restoreBlock, /window\.localStorage\.getItem\(storageKey\)/);
  assert.match(restoreBlock, /setRatio\(nextRatio\)/);
  assert.doesNotMatch(restoreBlock, /\buseEffect\(\(\) =>/);
});

test("runtime hydration hides but never conditionally unmounts its child", () => {
  const child = runtimeBoundary.indexOf(
    '<div className={ready ? "h-full" : "invisible h-full"}>',
  );
  const fallback = runtimeBoundary.indexOf("{!ready && (", child);
  assert.ok(child >= 0 && fallback > child);
  assert.match(
    runtimeBoundary.slice(child, fallback),
    /\{children\}/,
  );
});
