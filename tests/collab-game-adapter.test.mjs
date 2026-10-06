import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { writeJsonStateRoot, readJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import {
  GAME_ROOT, GAME_MAIN_PAGE, gameTextName, gameToEntities, gameFromEntities, gameFromYDoc,
  gameFromRevisionJson, gameChangedLines, gameDescribeChange, gameToArtifactJson, gameInitialState,
} from "../src/shell/collab/adapters/game.ts";

// 用 W11 的真实现（collab/bind-json-state.ts）读写实体根：`writeJsonStateRoot` / `readJsonStateRoot`。
// 适配器自己的 `readEntityRoot`（鸭子类型）要和它读出同样的东西，下面各测试里都有对照。
const writeShape = (doc, root, shape, origin) => writeJsonStateRoot(doc, root, shape, origin);
const readShape = (doc, root) => readJsonStateRoot(doc, root);

function connect(a, b) {
  // 双向同步一次：各自把对方没有的更新发过去
  const ua = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const ub = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, ua);
  Y.applyUpdate(a, ub);
}

function seededPair(root, shape) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeShape(a, root, shape);
  connect(a, b);
  return [a, b];
}


const pages = () => ({ pages: [{ id: "main", label: "main" }, { id: "level2", label: "第二关" }], origin: "ai" });
const pair = (s) => seededPair(GAME_ROOT, gameToEntities(s));
const read = (d) => gameFromEntities(readShape(d, GAME_ROOT), null);

test("页表往返无损；文本名按页 id", () => {
  const x = pages();
  assert.deepEqual(gameFromEntities(gameToEntities(x), null), x);
  assert.equal(gameTextName("main"), "oceanleo:game:main");
  assert.deepEqual(gameInitialState("ai").pages, [{ id: GAME_MAIN_PAGE, label: "main" }]);
});

test("页的增删与顺序：两人同时加不同页、一人删页，收敛", () => {
  const [a, b] = pair(pages());
  const x = pages(); x.pages.push({ id: "boss", label: "Boss" });
  const y = pages(); y.pages = y.pages.filter((p) => p.id !== "level2"); y.pages.push({ id: "menu", label: "菜单" });
  writeShape(a, GAME_ROOT, gameToEntities(x));
  writeShape(b, GAME_ROOT, gameToEntities(y));
  connect(a, b);
  const ra = read(a), rb = read(b);
  assert.deepEqual(ra, rb);
  assert.deepEqual(ra.pages.map((p) => p.id).sort(), ["boss", "main", "menu"]);
});

test("代码逐字合并：两个人同一段里不同位置打字互不覆盖（Y.Text）", () => {
  const [a, b] = pair(pages());
  a.getText(gameTextName("main")).insert(0, "function a() {}\nfunction b() {}\n");
  connect(a, b);
  a.getText(gameTextName("main")).insert(15, " // A");
  b.getText(gameTextName("main")).insert(b.getText(gameTextName("main")).length, "// B 最后一行");
  connect(a, b);
  const text = a.getText(gameTextName("main")).toString();
  assert.equal(text, b.getText(gameTextName("main")).toString());
  assert.ok(text.includes("function a() {} // A"));
  assert.ok(text.endsWith("// B 最后一行"));
});

test("同一位置并发打字：两边的字都在，顺序两端一致", () => {
  const [a, b] = pair(pages());
  a.getText(gameTextName("main")).insert(0, "x");
  connect(a, b);
  a.getText(gameTextName("main")).insert(1, "AAA");
  b.getText(gameTextName("main")).insert(1, "BBB");
  connect(a, b);
  const text = a.getText(gameTextName("main")).toString();
  assert.equal(text, b.getText(gameTextName("main")).toString());
  assert.ok(text.includes("AAA") && text.includes("BBB") && text.startsWith("x"));
});

test("fromYDoc 带上每页代码，与 fromRevisionJson(信封) 等价", () => {
  const [a] = seededPair(GAME_ROOT, gameToEntities({ pages: [{ id: "main", label: "main" }], origin: "ai" }));
  a.getText(gameTextName("main")).insert(0, "<html></html>");
  const fromY = gameFromYDoc(a);
  const fromRev = gameFromRevisionJson({ source: "<html></html>", origin: "ai" });
  assert.deepEqual(fromY, fromRev);
  assert.equal(gameToArtifactJson(fromY).source, "<html></html>");
  assert.equal(gameToArtifactJson(fromY).origin, "ai");
});

test("改动的行号：插入一行不把后面所有行都算成改动", () => {
  const before = "a\nb\nc\nd";
  assert.deepEqual(gameChangedLines(before, "a\nb\nX\nc\nd"), [3]);
  assert.deepEqual(gameChangedLines(before, "a\nB\nc\nd"), [2]);
  assert.deepEqual(gameChangedLines(before, before), []);
  assert.deepEqual(gameChangedLines(undefined, "p\nq"), [1, 2]);
});

test("describeChange：几行代码、新增页、没变化", () => {
  const p = { pages: [{ id: "main", label: "main", code: "a\nb\nc" }] };
  const q = { pages: [{ id: "main", label: "main", code: "a\nb\nc\nd\ne" }] };
  assert.match(gameDescribeChange(p, q), /改了 2 行代码/);
  const r = { pages: [...p.pages, { id: "x", label: "x", code: "1" }] };
  assert.match(gameDescribeChange(p, r), /新增了 1 页/);
  assert.equal(gameDescribeChange(p, p), null);
});
