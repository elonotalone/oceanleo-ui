import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";

import { bindTextarea, transformIndex } from "../src/shell/collab/bind-textarea.ts";

/** 最小的 textarea 替身：value、选区、事件、readOnly。 */
function fakeTextarea(value = "") {
  const handlers = new Map();
  const el = {
    _value: value,
    selectionStart: value.length,
    selectionEnd: value.length,
    readOnly: false,
    get value() {
      return this._value;
    },
    set value(v) {
      this._value = v;
      // 浏览器：程序设置 value 后光标跳到末尾
      this.selectionStart = this.selectionEnd = v.length;
    },
    setSelectionRange(a, b) {
      this.selectionStart = a;
      this.selectionEnd = b;
    },
    addEventListener(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
    },
    removeEventListener(name, fn) {
      handlers.get(name)?.delete(fn);
    },
    fire(name) {
      for (const fn of Array.from(handlers.get(name) ?? [])) fn({ type: name });
    },
    listenerCount() {
      return Array.from(handlers.values()).reduce((n, s) => n + s.size, 0);
    },
    /** 模拟用户键入：在 pos 处插入 text 并移动光标。 */
    type(text, pos = this.selectionStart) {
      this._value = this._value.slice(0, pos) + text + this._value.slice(pos);
      this.selectionStart = this.selectionEnd = pos + text.length;
      this.fire("input");
    },
    /** 模拟用户删除 [from, to)。 */
    erase(from, to) {
      this._value = this._value.slice(0, from) + this._value.slice(to);
      this.selectionStart = this.selectionEnd = from;
      this.fire("input");
    },
  };
  return el;
}

function makeRoom(doc, extra = {}) {
  const subs = new Set();
  return {
    doc,
    role: "editor",
    self: { id: "me" },
    lock: null,
    needsSeed: false,
    seeded: [],
    completeSeed(roots) {
      this.seeded.push(roots);
      this.needsSeed = false;
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    notify() {
      for (const cb of subs) cb();
    },
    ...extra,
  };
}

function link(a, b) {
  a.on("update", (u, o) => o !== "net" && Y.applyUpdate(b, u, "net"));
  b.on("update", (u, o) => o !== "net" && Y.applyUpdate(a, u, "net"));
}

test("transformIndex：前面插入后移、前面删除前移、右边的改动不影响", () => {
  assert.equal(transformIndex(5, [{ insert: "ab" }]), 7);
  assert.equal(transformIndex(5, [{ retain: 2 }, { insert: "xyz" }]), 8);
  assert.equal(transformIndex(5, [{ retain: 5 }, { insert: "xyz" }]), 5, "恰好在光标处插入：光标留在前面");
  assert.equal(transformIndex(5, [{ retain: 6 }, { insert: "xyz" }]), 5);
  assert.equal(transformIndex(5, [{ retain: 1 }, { delete: 2 }]), 3);
  assert.equal(transformIndex(5, [{ retain: 3 }, { delete: 10 }]), 3, "光标落在被删区间里：贴到删除起点");
});

test("绑定：needsSeed 且 textarea 有内容 → 写入文档并 completeSeed", () => {
  const doc = new Y.Doc();
  const room = makeRoom(doc, { needsSeed: true });
  const el = fakeTextarea("console.log(1)");
  const b = bindTextarea(room, "oceanleo:game", el);
  assert.equal(doc.getText("oceanleo:game").toString(), "console.log(1)");
  assert.deepEqual(room.seeded, [["oceanleo:game"]]);
  b.destroy();
});

test("绑定：文档里已有内容 → 画进 textarea；没内容也不 needsSeed → 不动 textarea", () => {
  const doc = new Y.Doc();
  doc.getText("t").insert(0, "别人写的");
  const el = fakeTextarea("本地的");
  bindTextarea(makeRoom(doc), "t", el);
  assert.equal(el.value, "别人写的");

  const el2 = fakeTextarea("本地的");
  bindTextarea(makeRoom(new Y.Doc()), "t", el2);
  assert.equal(el2.value, "本地的");
});

test("本地键入与删除写进 Y.Text，对端收到", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  link(a, b);
  const elA = fakeTextarea("hello world");
  const roomA = makeRoom(a, { needsSeed: true });
  bindTextarea(roomA, "t", elA);
  const elB = fakeTextarea("");
  bindTextarea(makeRoom(b), "t", elB);
  assert.equal(elB.value, "hello world");

  elA.type(", dear", 5);
  assert.equal(b.getText("t").toString(), "hello, dear world");
  assert.equal(elB.value, "hello, dear world");
  elA.erase(0, 7);
  assert.equal(elB.value, "dear world");
});

test("两人同一段里同时打字互不覆盖，各自光标留在原处", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  // 先建立共同起点，再断开同步各自打字，最后互相合并
  const elA = fakeTextarea("0123456789");
  bindTextarea(makeRoom(a, { needsSeed: true }), "t", elA);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), "net");
  const elB = fakeTextarea("");
  bindTextarea(makeRoom(b), "t", elB);
  assert.equal(elB.value, "0123456789");

  elA.selectionStart = elA.selectionEnd = 3;
  elA.type("AAA"); // A：012AAA3456789，光标在 6
  elB.selectionStart = elB.selectionEnd = 8;
  elB.type("BBB"); // B：01234567BBB89，光标在 11

  const ua = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const ub = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, ua, "net");
  Y.applyUpdate(a, ub, "net");

  const expected = "012AAA34567BBB89";
  assert.equal(a.getText("t").toString(), expected);
  assert.equal(b.getText("t").toString(), expected);
  assert.equal(elA.value, expected);
  assert.equal(elB.value, expected);
  assert.equal(elA.selectionStart, 6, "A 的光标仍在自己刚打的 AAA 后面");
  assert.equal(elB.selectionStart, 14, "B 的光标被 A 的插入推后，仍在 BBB 后面");
});

test("只读：viewer 强行输入会被还原；变回 editor 恢复可写；destroy 还原 readOnly 并摘掉监听", () => {
  const doc = new Y.Doc();
  doc.getText("t").insert(0, "原文");
  const room = makeRoom(doc, { role: "viewer" });
  const el = fakeTextarea("");
  const b = bindTextarea(room, "t", el);
  assert.equal(el.readOnly, true);
  el.type("乱改");
  assert.equal(el.value, "原文");
  assert.equal(doc.getText("t").toString(), "原文");
  room.role = "editor";
  room.notify();
  assert.equal(el.readOnly, false);
  el.type("好", 2);
  assert.equal(doc.getText("t").toString(), "原文好");
  room.lock = { holder: { id: "other" } };
  room.notify();
  assert.equal(el.readOnly, true, "专业模式锁在别人手里 → 只读");
  b.destroy();
  assert.equal(el.readOnly, false);
  assert.equal(el.listenerCount(), 0);
});

test("输入法组字期间的远端更新先攒着，组字结束后再回填", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  link(a, b);
  const elA = fakeTextarea("abc");
  bindTextarea(makeRoom(a, { needsSeed: true }), "t", elA);
  const elB = fakeTextarea("");
  bindTextarea(makeRoom(b), "t", elB);

  elB.fire("compositionstart");
  a.transact(() => a.getText("t").insert(0, "X"), "other");
  assert.equal(elB.value, "abc", "组字中不回填");
  elB.fire("compositionend");
  assert.equal(elB.value, "Xabc");
});

test("组字期间既有本地输入又有远端更新：两边都保留，远端内容不会被本地删掉", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  link(a, b);
  const elA = fakeTextarea("abc");
  bindTextarea(makeRoom(a, { needsSeed: true }), "t", elA);
  const elB = fakeTextarea("");
  bindTextarea(makeRoom(b), "t", elB);

  elB.fire("compositionstart");
  elB.selectionStart = elB.selectionEnd = 3;
  elB.type("你好"); // 组字中间态，不写文档
  assert.equal(b.getText("t").toString(), "abc");
  a.transact(() => a.getText("t").insert(0, "X"), "other"); // 远端在开头插入
  assert.equal(elB.value, "abc你好");
  elB.fire("compositionend");
  assert.equal(a.getText("t").toString(), "Xabc你好");
  assert.equal(b.getText("t").toString(), "Xabc你好");
  assert.equal(elB.value, "Xabc你好");
  assert.equal(elB.selectionStart, 6, "光标跟着远端插入后移，仍在「你好」后面");
});

test("表情符号不会被劈成两半", () => {
  const doc = new Y.Doc();
  const el = fakeTextarea("");
  bindTextarea(makeRoom(doc, { needsSeed: true }), "t", el);
  el.type("a🙂b");
  el.erase(1, 3); // 删掉整个 🙂（两个 UTF-16 单元）
  assert.equal(doc.getText("t").toString(), "ab");
  el.type("🚀", 1);
  assert.equal(doc.getText("t").toString(), "a🚀b");
  el.erase(1, 3);
  el.type("🙂", 1);
  assert.equal(doc.getText("t").toString(), "a🙂b");
});
