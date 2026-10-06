import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";

import {
  bindJsonState,
  readJsonStateRoot,
  writeJsonStateRoot,
  hasJsonStateRoot,
} from "../src/shell/collab/bind-json-state.ts";

const ROOT = "oceanleo:grid";

// 编辑器自己的状态：{ cells: [{id, text, bold}], title }
const toEntities = (state) => ({
  order: state.cells.map((c) => c.id),
  entities: Object.fromEntries(state.cells.map((c) => [c.id, { text: c.text, bold: c.bold }])),
  meta: { title: state.title },
});
const fromEntities = ({ order, entities, meta }) => ({
  cells: order.map((id) => ({ id, ...entities[id] })),
  title: meta.title,
});

function makeRoom(doc, extra = {}) {
  const listeners = new Set();
  const room = {
    roomKey: "artifact:test",
    doc,
    role: "editor",
    status: "synced",
    self: { id: "u1", name: "甲", color: "hsl(1, 70%, 45%)", avatar_url: null },
    needsSeed: false,
    lock: null,
    seeded: [],
    completeSeed(roots) {
      this.seeded.push(roots);
      this.needsSeed = false;
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    ...extra,
  };
  return room;
}

/** 两个文档互相同步：A 的每次事务更新原样应用到 B，反之亦然（origin 标成 "net"）。 */
function link(a, b, { paused = () => false } = {}) {
  const queue = { ab: [], ba: [] };
  a.on("update", (u, origin) => {
    if (origin !== "net") queue.ab.push(u);
  });
  b.on("update", (u, origin) => {
    if (origin !== "net") queue.ba.push(u);
  });
  return {
    flush() {
      while (queue.ab.length || queue.ba.length) {
        for (const u of queue.ab.splice(0)) Y.applyUpdate(b, u, "net");
        for (const u of queue.ba.splice(0)) Y.applyUpdate(a, u, "net");
      }
    },
  };
}

const cell = (id, text, bold = false) => ({ id, text, bold });

function pair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const net = link(a, b);
  const roomA = makeRoom(a, { needsSeed: true });
  const roomB = makeRoom(b, { self: { id: "u2", name: "乙", color: "hsl(2, 70%, 45%)", avatar_url: null } });
  const bindA = bindJsonState({ room: roomA, rootName: ROOT, toEntities, fromEntities });
  const bindB = bindJsonState({ room: roomB, rootName: ROOT, toEntities, fromEntities });
  const seedState = { cells: [cell("c1", "一"), cell("c2", "二"), cell("c3", "三")], title: "表" };
  bindA.seed(seedState);
  net.flush();
  return { a, b, net, roomA, roomB, bindA, bindB, seedState };
}

test("seed 只在 needsSeed 时写并 completeSeed；对方同步后读到同一份", () => {
  const { roomA, roomB, bindB, seedState, a, b } = pair();
  assert.deepEqual(roomA.seeded, [[ROOT]]);
  assert.equal(roomB.seeded.length, 0);
  assert.deepEqual(bindB.read(), seedState);
  assert.ok(hasJsonStateRoot(a, ROOT) && hasJsonStateRoot(b, ROOT));
  // 已经种过：再 seed 是空操作（needsSeed 已清）
  const before = Y.encodeStateAsUpdate(a).length;
  const bind = bindJsonState({ room: roomA, rootName: ROOT, toEntities, fromEntities });
  bind.seed({ cells: [cell("zz", "不该出现")], title: "x" });
  assert.equal(Y.encodeStateAsUpdate(a).length, before);
});

test("同一实体不同字段并发修改：两个都保留", () => {
  const { net, bindA, bindB, a, b } = pair();
  // 断开期间（不 flush）各改 c1 的不同字段
  bindA.push({ cells: [cell("c1", "改过的字", false), cell("c2", "二"), cell("c3", "三")], title: "表" });
  bindB.push({ cells: [cell("c1", "一", true), cell("c2", "二"), cell("c3", "三")], title: "表" });
  net.flush();
  const state = bindA.read();
  assert.deepEqual(state.cells[0], { id: "c1", text: "改过的字", bold: true });
  assert.deepEqual(readJsonStateRoot(a, ROOT), readJsonStateRoot(b, ROOT));
});

test("同一字段并发修改：后写者胜（两边收敛到同一个值）", () => {
  const { net, bindA, bindB, a, b } = pair();
  bindA.push({ cells: [cell("c1", "甲写的"), cell("c2", "二"), cell("c3", "三")], title: "表" });
  bindB.push({ cells: [cell("c1", "乙写的"), cell("c2", "二"), cell("c3", "三")], title: "表" });
  net.flush();
  const ra = readJsonStateRoot(a, ROOT);
  const rb = readJsonStateRoot(b, ROOT);
  assert.deepEqual(ra, rb);
  assert.ok(["甲写的", "乙写的"].includes(ra.entities.c1.text));
  assert.equal(ra.entities.c1.bold, false);
});

test("先后写同一字段：晚的覆盖早的", () => {
  const { net, bindA, bindB } = pair();
  bindA.push({ cells: [cell("c1", "第一次"), cell("c2", "二"), cell("c3", "三")], title: "表" });
  net.flush();
  bindB.push({ cells: [cell("c1", "第二次"), cell("c2", "二"), cell("c3", "三")], title: "表" });
  net.flush();
  assert.equal(bindA.read().cells[0].text, "第二次");
});

test("两人同时新增：各自保留；一人删除、一人改别的实体互不影响", () => {
  const { net, bindA, bindB } = pair();
  bindA.push({ cells: [cell("c1", "一"), cell("c2", "二"), cell("c3", "三"), cell("a1", "甲加的")], title: "表" });
  bindB.push({ cells: [cell("c1", "一"), cell("c2", "二"), cell("c3", "三"), cell("b1", "乙加的")], title: "表" });
  net.flush();
  const ids = bindA.read().cells.map((c) => c.id);
  assert.equal(ids.length, 5);
  assert.ok(ids.includes("a1") && ids.includes("b1"));
  assert.deepEqual(bindA.read(), bindB.read());

  // A 删 c2；B 同时改 c3
  const now = bindA.read();
  bindA.push({ ...now, cells: now.cells.filter((c) => c.id !== "c2") });
  bindB.push({ ...now, cells: now.cells.map((c) => (c.id === "c3" ? { ...c, text: "三改" } : c)) });
  net.flush();
  const merged = bindA.read();
  assert.ok(!merged.cells.some((c) => c.id === "c2"));
  assert.equal(merged.cells.find((c) => c.id === "c3").text, "三改");
  assert.deepEqual(bindA.read(), bindB.read());
});

test("排序与删除：本地 push 之后对端按新顺序读到", () => {
  const { net, bindA, bindB } = pair();
  bindA.push({ cells: [cell("c3", "三"), cell("c1", "一"), cell("c2", "二")], title: "表" });
  net.flush();
  assert.deepEqual(bindB.read().cells.map((c) => c.id), ["c3", "c1", "c2"]);
  bindB.push({ cells: [cell("c1", "一"), cell("c3", "三")], title: "表" });
  net.flush();
  assert.deepEqual(bindA.read().cells.map((c) => c.id), ["c1", "c3"]);
  // 大乱序也能还原成目标顺序
  const ids = ["c9", "c4", "c1", "c8", "c2", "c7", "c3", "c6", "c5"];
  bindA.push({ cells: ids.map((id) => cell(id, id)), title: "表" });
  net.flush();
  assert.deepEqual(bindB.read().cells.map((c) => c.id), ids);
  const shuffled = [...ids].reverse();
  bindB.push({ cells: shuffled.map((id) => cell(id, id)), title: "表" });
  net.flush();
  assert.deepEqual(bindA.read().cells.map((c) => c.id), shuffled);
});

test("push 只写变化的字段：没改的字段不产生新的更新", () => {
  const { bindA, a } = pair();
  const sv = Y.encodeStateVector(a);
  bindA.push({ cells: [cell("c1", "一"), cell("c2", "二"), cell("c3", "三")], title: "表" });
  assert.equal(Y.encodeStateAsUpdate(a, sv).length <= 2, true, "无变化时更新为空");
  const sv2 = Y.encodeStateVector(a);
  bindA.push({ cells: [cell("c1", "一"), cell("c2", "二改"), cell("c3", "三")], title: "表" });
  const diff = Y.decodeUpdate(Y.encodeStateAsUpdate(a, sv2));
  assert.equal(diff.structs.length, 1, "只多一条结构：c2.text 的新值");
});

test("onRemote 只回调远端来源；本地 push 与 seed 不回调", () => {
  const { net, bindA, bindB } = pair();
  const gotA = [];
  const gotB = [];
  bindA.onRemote((s) => gotA.push(s));
  const off = bindB.onRemote((s) => gotB.push(s));
  bindA.push({ cells: [cell("c1", "一"), cell("c2", "二"), cell("c3", "三")], title: "新标题" });
  net.flush();
  assert.equal(gotA.length, 0);
  assert.equal(gotB.length, 1);
  assert.equal(gotB[0].title, "新标题");
  off();
  bindA.push({ cells: [cell("c1", "再改"), cell("c2", "二"), cell("c3", "三")], title: "新标题" });
  net.flush();
  assert.equal(gotB.length, 1, "取消订阅后不再回调");
});

test("fromEntities 收到上一次的状态作为 prev", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const net = link(a, b);
  const roomA = makeRoom(a, { needsSeed: true });
  const prevs = [];
  const bindA = bindJsonState({ room: roomA, rootName: ROOT, toEntities, fromEntities });
  const bindB = bindJsonState({
    room: makeRoom(b),
    rootName: ROOT,
    toEntities,
    fromEntities: (input, prev) => {
      prevs.push(prev);
      return fromEntities(input);
    },
  });
  bindB.onRemote(() => {});
  bindA.seed({ cells: [cell("c1", "一")], title: "表" });
  net.flush();
  bindA.push({ cells: [cell("c1", "二")], title: "表" });
  net.flush();
  assert.equal(prevs[0], null);
  assert.equal(prevs.at(-1).cells[0].text, "一");
});

test("只读（viewer、锁在别人手里）时 push 不写文档", () => {
  const { bindA, roomA, a } = pair();
  const before = readJsonStateRoot(a, ROOT);
  roomA.role = "viewer";
  bindA.push({ cells: [cell("c1", "偷改")], title: "x" });
  assert.deepEqual(readJsonStateRoot(a, ROOT), before);
  roomA.role = "editor";
  roomA.lock = { holder: { id: "someone-else" }, mode: "pro", expires_at: "" };
  bindA.push({ cells: [cell("c1", "偷改")], title: "x" });
  assert.deepEqual(readJsonStateRoot(a, ROOT), before);
  roomA.lock = { holder: { id: "u1" }, mode: "pro", expires_at: "" };
  bindA.push({ cells: [cell("c1", "自己持锁可以写")], title: "x" });
  assert.equal(readJsonStateRoot(a, ROOT).entities.c1.text, "自己持锁可以写");
});

test("没种过的文档 read() 返回 null；readJsonStateRoot 对空文档给空结构", () => {
  const d = new Y.Doc();
  const bind = bindJsonState({ room: makeRoom(d), rootName: ROOT, toEntities, fromEntities });
  assert.equal(bind.read(), null);
  assert.deepEqual(readJsonStateRoot(new Y.Doc(), ROOT), { order: [], entities: {}, meta: {} });
});

test("并发移动同一项产生的重复 id 与孤立 id：读出时去重并丢弃", () => {
  const d = new Y.Doc();
  writeJsonStateRoot(d, ROOT, { order: ["a", "b"], entities: { a: { v: 1 }, b: { v: 2 } } });
  d.transact(() => {
    const order = d.getMap(ROOT).get("order");
    order.push(["a", "ghost"]);
  });
  const snap = readJsonStateRoot(d, ROOT);
  assert.deepEqual(snap.order, ["a", "b"]);
});

test("writeJsonStateRoot 的值被深拷贝：之后原地修改源对象不影响文档", () => {
  const d = new Y.Doc();
  const nested = { list: [1, 2] };
  writeJsonStateRoot(d, ROOT, { order: ["a"], entities: { a: { nested } } });
  nested.list.push(3);
  assert.deepEqual(readJsonStateRoot(d, ROOT).entities.a.nested.list, [1, 2]);
});
