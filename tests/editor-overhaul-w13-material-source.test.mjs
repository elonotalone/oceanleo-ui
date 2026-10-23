import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { assertBlobSource } from "../src/shell/media-editors/source-integrity.mjs";
import { isModel3DSourceItem } from "../src/shell/media-editors/model3d-workbench-defaults.ts";

// Execute the actual route's adapter factory (not a copied implementation),
// supplying only its network/editor boundaries. This avoids changing source
// solely to obtain a test seam during the final browser acceptance window.
const route = readFileSync(new URL("../src/shell/advanced-routes/Model3DRoute.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("Model3DRoute.tsx", route, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let factory;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "materialAdapter") factory = node.initializer.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(factory, "route material adapter must exist");
const compiled = ts.transpileModule(`return (${factory})();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const make = new Function("editor", "collabReadOnly", "fetchMediaBlob", "assertBlobSource", "isModel3DSourceItem", compiled);
const material = (format = "glb", extra = {}) => ({ title: "Replacement", url: "https://models/replacement", meta: { format }, ...extra });
function glb() {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, scenes: [{ nodes: [0] }], nodes: [{ name: "Replacement" }] }).padEnd(120, " "));
  const header = Buffer.alloc(20); header.write("glTF"); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + json.length, 8);
  header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  return new Blob([header, json], { type: "model/gltf-binary" });
}

test("typed shelf replacement validates actual GLB bytes and reuses its private immutable identity without reupload", async () => {
  const imports = [];
  const opened = [];
  const source = glb();
  const adapter = make({ importModel: async (file) => imports.push(file), openModelUrl: (...args) => opened.push(args) }, false, async () => source, assertBlobSource, isModel3DSourceItem);
  assert.deepEqual(adapter.actions, ["replace"]);
  assert.equal(adapter.accepts(material()), true);
  const item = material("glb", { artifactId: "private-fixture", revisionId: "immutable-r1", artifact: { renditions: { source: { digest: "sha256:private" } } } });
  await adapter.mutate("replace", item);
  assert.equal(imports.length, 0, "must not reupload private shelf bytes through legacy uploadFile");
  assert.deepEqual(opened, [[item.url, "glb", { artifactId: "private-fixture", revisionId: "immutable-r1", sourceDigest: "sha256:private" }]]);
  assert.match(route, /withEditorHistoryCommand\(materialAdapter,/);
});

test("genuine glTF keeps its authenticated remote closure and immutable source identity", async () => {
  const opened = [];
  const adapter = make({ openModelUrl: (...args) => opened.push(args), importModel: () => assert.fail("must not sever remote dependencies") }, false,
    async () => new Blob([JSON.stringify({ asset: { version: "2.0" }, buffers: [{ byteLength: 4, uri: "model.bin" }] })]), assertBlobSource, isModel3DSourceItem);
  const item = material("gltf", { artifactId: "fixture", revisionId: "r1", artifact: { renditions: { source: { digest: "sha256:fixture" } } } });
  await adapter.mutate("replace", item);
  assert.deepEqual(opened, [[item.url, "gltf", { artifactId: "fixture", revisionId: "r1", sourceDigest: "sha256:fixture" }]]);
});

test("HDRI, textures, readonly and disguised non-model bytes cannot replace a scene", async () => {
  const adapter = make({ importModel: () => assert.fail("unsafe source imported") }, false, async () => new Blob(["not a model"], { type: "model/gltf-binary" }), assertBlobSource, isModel3DSourceItem);
  for (const subtype of ["hdri", "texture"]) assert.equal(adapter.accepts(material("glb", { meta: { subtype, format: "glb" } })), false);
  assert.equal(make({}, true, () => {}, assertBlobSource, isModel3DSourceItem).accepts(material()), false);
  await assert.rejects(() => adapter.mutate("replace", material()), /源格式不匹配/);
});
