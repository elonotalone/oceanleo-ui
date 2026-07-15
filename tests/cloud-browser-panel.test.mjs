import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const panelSource = readFileSync(
  new URL("../src/shell/CloudBrowserPanel.tsx", import.meta.url),
  "utf8",
);
const liveSource = readFileSync(
  new URL("../src/shell/cloud-browser-live.ts", import.meta.url),
  "utf8",
);
const source = `${panelSource}\n${liveSource}`;
const tree = ts.createSourceFile(
  "CloudBrowserPanel.tsx",
  panelSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const liveTree = ts.createSourceFile(
  "cloud-browser-live.ts",
  liveSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

function findFunction(name) {
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(liveTree);
  assert.ok(found, `missing ${name}`);
  return found;
}

function loadContainedPointMapper() {
  const printer = ts.createPrinter();
  const declaration = printer
    .printNode(
      ts.EmitHint.Unspecified,
      findFunction("pointInContainedFrame"),
      liveTree,
    )
    .replace(/^export\s+/, "");
  const javascript = ts.transpileModule(declaration, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  return Function(`${javascript}; return pointInContainedFrame;`)();
}

test("object-contain coordinates reject letterbox and preserve all four corners", () => {
  const point = loadContainedPointMapper();
  const bounds = { left: 10, top: 20, width: 1000, height: 1000 };
  const frame = { width: 1280, height: 800 };

  assert.equal(point(510, 100, bounds, frame), null);
  assert.deepEqual(point(10, 207.5, bounds, frame), { nx: 0, ny: 0 });
  assert.deepEqual(point(1010, 832.5, bounds, frame), { nx: 1, ny: 1 });
  assert.deepEqual(point(510, 520, bounds, frame), { nx: 0.5, ny: 0.5 });
});

test("live frames are painted imperatively without frame React state", () => {
  const stateNames = [];
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isArrayBindingPattern(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(tree) === "useState"
    ) {
      stateNames.push(node.name.elements[0]?.getText(tree));
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);

  assert.ok(!stateNames.includes("frame"));
  assert.doesNotMatch(source, /\bsetFrame\b/);
  assert.match(source, /<canvas[\s\S]*?ref=\{canvasRef\}/);
  assert.match(source, /context\.drawImage\(/);
  assert.match(source, /frameDecodeGenerationRef/);
  assert.match(source, /pendingBlobFrameRef/);
  assert.match(source, /await createImageBitmap\(pending\.blob\)/);
  assert.match(source, /while \(pendingBlobFrameRef\.current\)/);
  assert.doesNotMatch(
    source,
    /drawBlobFrame[\s\S]{0,500}URL\.createObjectURL/,
  );
});

test("takeover uses explicit controls, bounded reconnects, and no input replay queue", () => {
  assert.doesNotMatch(source, /Control\+L/);
  assert.match(source, /send\(\{ t: "goto", url \}\)/);
  assert.match(source, /onPointerDown=\{handlePointerDown\}/);
  assert.match(source, /onWheel=\{handleWheel\}/);
  assert.match(source, /onKeyDown=\{handleCanvasKeyDown\}/);
  assert.match(source, /MAX_LIVE_RECONNECTS = 3/);
  assert.match(source, /Never queue or[\s\S]*?replay clicks\/keys/);
  assert.doesNotMatch(source, /inputQueue|pendingInputs|replayInput/);
});

test("session and event polling stop for the complete requested-live window", () => {
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*if \(liveRequested\) return;\s*void reload\(\)/,
  );
  assert.match(
    source,
    /if \(!selectedId \|\| liveRequested\) return;[\s\S]*?setInterval\(refreshEvents/,
  );
});
