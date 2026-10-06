// F05：PDF 按批注多人同改的对齐器（字节层 + 三方合并）。两个模拟客户端共用一份 Yjs 文档，
// 字节是真的 pdf-lib 文档，批注是真的标准批注字典。不联网、不开浏览器。
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { PDFDocument } from "pdf-lib";
import { readJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import {
  PDF_ROOT,
  pdfFromEntities,
  pdfSyncApply,
  pdfSyncDiff,
  pdfSyncReconcile,
  pdfToEntities,
} from "../src/shell/collab/adapters/pdf.ts";
import {
  addPdfHighlightAnnotation,
  addPdfTextAnnotationAt,
  deletePdfAnnotation,
  listPdfAnnotations,
  updatePdfAnnotation,
} from "../src/shell/media-editors/pdf-annotation-operations.ts";
import { applyPdfSyncOps, ensurePdfCollabIds, readPdfCollabShape } from "../src/shell/media-editors/pdf-collab-bytes.ts";
import { createPdfCollabSync, PDF_COLLAB_ROOT } from "../src/shell/media-editors/pdf-collab-sync.ts";
import { deletePdfPage, movePdfPage, rotatePdfPage } from "../src/shell/media-editors/pdf-operations.ts";

assert.equal(PDF_COLLAB_ROOT, PDF_ROOT, "对齐器与适配器用同一个根名");

async function blankPdf(pages = 6) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([612, 792]);
  return (await ensurePdfCollabIds(await doc.save())).bytes;
}

/** 两端共用一份文档的网络：flush 把双方没见过的更新互相灌过去。 */
function link(a, b) {
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

function makeClient(doc, selfId, extra = {}) {
  const room = {
    doc,
    role: "editor",
    status: "synced",
    self: { id: selfId, name: selfId, color: "#000", avatar_url: null },
    needsSeed: false,
    lock: null,
    completeSeed() {
      room.needsSeed = false;
    },
    ...extra,
  };
  const host = {
    bytes: null,
    busy: false,
    getBytes: () => host.bytes,
    async replaceBytes(transform) {
      if (host.busy) return "busy";
      const current = host.bytes;
      const next = await transform(current);
      if (host.bytes !== current) return "busy";
      if (!next) return "unchanged";
      host.bytes = next;
      return "applied";
    },
  };
  let holdsPages = false;
  const sync = createPdfCollabSync({ room, host, holdsPages: () => holdsPages, retryDelayMs: 5 });
  return {
    room,
    host,
    sync,
    setHoldsPages: (value) => {
      holdsPages = value;
    },
    async edit(fn) {
      host.bytes = await fn(host.bytes);
    },
    ids: async () => (await listAllAnnotations(host.bytes)).map((a) => a.id).sort(),
  };
}

async function listAllAnnotations(bytes) {
  const doc = await PDFDocument.load(bytes);
  const out = [];
  for (let i = 0; i < doc.getPageCount(); i += 1) {
    for (const a of await listPdfAnnotations(bytes, i)) out.push({ ...a, pageIndex: i });
  }
  return out;
}

async function pair({ seedBytes } = {}) {
  const a = makeClient(new Y.Doc(), "u-a", { needsSeed: true });
  const b = makeClient(new Y.Doc(), "u-b");
  const net = link(a.room.doc, b.room.doc);
  const bytes = seedBytes ?? (await blankPdf());
  a.host.bytes = bytes;
  b.host.bytes = bytes;
  await a.sync.setBaseline(bytes);
  await b.sync.setBaseline(bytes);
  await a.sync.reconcile(); // 甲种文档
  net.flush();
  await b.sync.reconcile();
  net.flush();
  return { a, b, net };
}

async function settle(clients, net, rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    for (const client of clients) await client.sync.reconcile();
    net.flush();
  }
  for (const client of clients) await client.sync.reconcile();
}

// ----------------------------------------------------------------------------

test("两人同时各加一条批注：双方字节里都有两条，保存出来的批注列表包含双方的", async () => {
  const { a, b, net } = await pair();
  await a.edit(async (bytes) => (await addPdfHighlightAnnotation(bytes, 1, { x: 0.1, y: 0.2, width: 0.3, height: 0.05 }, "甲划的重点")).bytes);
  await b.edit(async (bytes) => (await addPdfTextAnnotationAt(bytes, 4, "乙的便签", { x: 0.5, y: 0.5 })).bytes);
  // 两人几乎同时：各自先对齐一次（都还没收到对方的）
  await a.sync.reconcile();
  await b.sync.reconcile();
  net.flush();
  await settle([a, b], net);

  const forA = await listAllAnnotations(a.host.bytes);
  const forB = await listAllAnnotations(b.host.bytes);
  assert.equal(forA.length, 2);
  assert.deepEqual(forA.map((x) => x.id).sort(), forB.map((x) => x.id).sort());
  const text = forB.find((x) => x.kind === "text");
  const highlight = forB.find((x) => x.kind === "highlight");
  assert.equal(text.contents, "乙的便签");
  assert.equal(text.pageIndex, 4);
  assert.equal(highlight.contents, "甲划的重点");
  assert.equal(highlight.pageIndex, 1);
  // 共享文档里也是双方的，且按页 id 挂着
  const state = pdfFromEntities(readJsonStateRoot(a.room.doc, PDF_ROOT), null);
  assert.equal(state.annotations.length, 2);
  assert.ok(state.annotations.every((x) => typeof x.pageId === "string" && x.pageId.length > 0));
});

test("两人几乎同时保存：各自写出的字节都包含双方的批注（后保存的不会冲掉对方）", async () => {
  const { a, b, net } = await pair();
  await a.edit(async (bytes) => (await addPdfTextAnnotationAt(bytes, 0, "甲", { x: 0.2, y: 0.2 })).bytes);
  await b.edit(async (bytes) => (await addPdfTextAnnotationAt(bytes, 2, "乙", { x: 0.6, y: 0.6 })).bytes);
  // 两人都在对方的改动到达之前点保存：保存前先对齐一次（flush），字节 = 本地 + 共享里的全部批注
  await a.sync.flush();
  await b.sync.flush();
  net.flush();
  await a.sync.flush();
  await b.sync.flush();
  net.flush();
  await a.sync.flush();
  await b.sync.flush();
  for (const client of [a, b]) {
    const list = await listAllAnnotations(client.host.bytes);
    assert.deepEqual(list.map((x) => x.contents).sort(), ["乙", "甲"].sort());
  }
});

test("甲改自己的批注、乙删另一条：双方一致", async () => {
  const bytes0 = await blankPdf();
  const m1 = await addPdfTextAnnotationAt(bytes0, 0, "旧内容一", { x: 0.2, y: 0.2 });
  const m2 = await addPdfTextAnnotationAt(m1.bytes, 3, "要被删的", { x: 0.4, y: 0.4 });
  const { a, b, net } = await pair({ seedBytes: m2.bytes });
  assert.equal((await listAllAnnotations(b.host.bytes)).length, 2);
  await a.edit((bytes) => updatePdfAnnotation(bytes, 0, m1.id, "甲改后的内容"));
  await b.edit((bytes) => deletePdfAnnotation(bytes, 3, m2.id));
  await settle([a, b], net);
  for (const client of [a, b]) {
    const list = await listAllAnnotations(client.host.bytes);
    assert.equal(list.length, 1, "被删的那条双方都没有了");
    assert.equal(list[0].id, m1.id);
    assert.equal(list[0].contents, "甲改后的内容", "改动双方都看到");
  }
});

test("甲删第 3 页（持整页锁），乙在第 5 页的批注仍在原来那一页", async () => {
  const bytes0 = await blankPdf(6);
  const onFive = await addPdfTextAnnotationAt(bytes0, 4, "第五页的便签", { x: 0.3, y: 0.3 });
  const onThree = await addPdfTextAnnotationAt(onFive.bytes, 2, "第三页的便签", { x: 0.3, y: 0.3 });
  const { a, b, net } = await pair({ seedBytes: onThree.bytes });
  const originalPageIds = (await readPdfCollabShape(a.host.bytes)).pageIds;

  a.setHoldsPages(true);
  a.room.lock = { holder: a.room.self, mode: "pro", expires_at: "2099-01-01T00:00:00Z" };
  b.room.lock = a.room.lock;
  await a.edit((bytes) => deletePdfPage(bytes, 2));
  await a.sync.flush();
  net.flush();
  // 乙：只读（别人持锁）。收到共享里的页结构，但字节要等甲保存后重新载入
  await b.sync.flush();

  // 甲保存 → 放锁；乙拿到甲保存的字节（外部版本）：按「保留当前批注、采纳新页结构」重新载入
  const savedByA = a.host.bytes;
  a.room.lock = null;
  b.room.lock = null;
  a.setHoldsPages(false);
  const current = b.host.bytes;
  b.host.bytes = await b.sync.adjustRestored(savedByA, current, { keepEverything: true });
  await settle([a, b], net);

  const listB = await listAllAnnotations(b.host.bytes);
  assert.equal(listB.length, 1, "第 3 页上的批注随页一起没了");
  assert.equal(listB[0].contents, "第五页的便签");
  const idsB = (await readPdfCollabShape(b.host.bytes)).pageIds;
  assert.equal(idsB.length, 5);
  assert.ok(!idsB.includes(originalPageIds[2]), "删掉的是原来的第 3 页");
  assert.equal(idsB[3], originalPageIds[4], "原来的第 5 页现在是第 4 页");
  assert.equal(listB[0].pageIndex, 3, "批注跟着它的页走到第 4 页");
  // 共享文档：页序是甲的，批注按页 id 读回现在的页码
  const shared = pdfFromEntities(readJsonStateRoot(b.room.doc, PDF_ROOT), null);
  assert.deepEqual(shared.pageIds, idsB);
  assert.equal(shared.annotations.length, 1);
  assert.equal(shared.annotations[0].pageIndex, 3);
});

test("调页序以后批注仍挂在原来那一页上", async () => {
  const bytes0 = await blankPdf(4);
  const note = await addPdfTextAnnotationAt(bytes0, 0, "首页便签", { x: 0.3, y: 0.3 });
  const { a, b, net } = await pair({ seedBytes: note.bytes });
  const pageIds = (await readPdfCollabShape(a.host.bytes)).pageIds;
  a.setHoldsPages(true);
  a.room.lock = { holder: a.room.self, mode: "pro", expires_at: "2099-01-01T00:00:00Z" };
  b.room.lock = a.room.lock;
  await a.edit((bytes) => movePdfPage(bytes, 0, 3)); // 首页挪到最后
  await a.sync.flush();
  net.flush();
  const shared = pdfFromEntities(readJsonStateRoot(b.room.doc, PDF_ROOT), null);
  assert.equal(shared.pageIds[3], pageIds[0]);
  assert.equal(shared.annotations[0].pageIndex, 3, "批注跟着页走到最后一页");
});

test("远端的变化合进本地：不动本地字节里与它无关的东西，也不重复画已有的批注", async () => {
  const { a, b, net } = await pair();
  await a.edit(async (bytes) => (await addPdfTextAnnotationAt(bytes, 0, "一", { x: 0.1, y: 0.1 })).bytes);
  await settle([a, b], net);
  const before = b.host.bytes;
  await settle([a, b], net); // 再对齐一轮：没有新东西，字节不应再被换
  assert.equal(b.host.bytes, before);
  assert.equal((await listAllAnnotations(b.host.bytes)).length, 1);
});

test("只读的人（viewer）改了字节也推不进共享文档，但能收到别人的批注", async () => {
  const a = makeClient(new Y.Doc(), "u-a", { needsSeed: true });
  const v = makeClient(new Y.Doc(), "u-v", { role: "viewer" });
  const net = link(a.room.doc, v.room.doc);
  const bytes = await blankPdf();
  a.host.bytes = bytes;
  v.host.bytes = bytes;
  await a.sync.setBaseline(bytes);
  await v.sync.setBaseline(bytes);
  await a.sync.reconcile();
  net.flush();
  await v.sync.reconcile();
  // 旁观者本地硬写一条（界面上入口是灰的，这里验证对齐器兜底）
  await v.edit(async (b0) => (await addPdfTextAnnotationAt(b0, 0, "旁观者硬写", { x: 0.1, y: 0.1 })).bytes);
  await v.sync.reconcile();
  net.flush();
  assert.equal(pdfFromEntities(readJsonStateRoot(a.room.doc, PDF_ROOT), null).annotations.length, 0, "没有推进共享文档");
  // 甲加一条：旁观者收到
  await a.edit(async (b0) => (await addPdfTextAnnotationAt(b0, 2, "甲加的", { x: 0.2, y: 0.2 })).bytes);
  await a.sync.reconcile();
  net.flush();
  await v.sync.reconcile();
  const contents = (await listAllAnnotations(v.host.bytes)).map((x) => x.contents).sort();
  assert.ok(contents.includes("甲加的"));
});

test("别人持整页锁时，我这边本地没推送的批注不会丢，锁放开后再推出去", async () => {
  const { a, b, net } = await pair();
  b.room.lock = { holder: a.room.self, mode: "pro", expires_at: "2099-01-01T00:00:00Z" };
  a.room.lock = b.room.lock;
  await b.edit(async (bytes) => (await addPdfTextAnnotationAt(bytes, 1, "锁期间乙的", { x: 0.2, y: 0.2 })).bytes);
  await b.sync.reconcile();
  net.flush();
  assert.equal(pdfFromEntities(readJsonStateRoot(a.room.doc, PDF_ROOT), null).annotations.length, 0);
  a.room.lock = null;
  b.room.lock = null;
  await settle([a, b], net);
  const listA = await listAllAnnotations(a.host.bytes);
  assert.deepEqual(listA.map((x) => x.contents), ["锁期间乙的"]);
});

test("本地正在编辑时对方的改动先不落地（busy），之后重来不丢任何一边", async () => {
  const { a, b, net } = await pair();
  await a.edit(async (bytes) => (await addPdfTextAnnotationAt(bytes, 0, "甲", { x: 0.1, y: 0.1 })).bytes);
  await a.sync.reconcile();
  net.flush();
  b.host.busy = true;
  await b.sync.reconcile();
  assert.equal((await listAllAnnotations(b.host.bytes)).length, 0, "忙时没落地");
  b.host.busy = false;
  await new Promise((resolve) => setTimeout(resolve, 40));
  await b.sync.reconcile();
  assert.equal((await listAllAnnotations(b.host.bytes)).length, 1, "不忙之后补上了");
  // 并且乙没有把「没落地的」当成自己删了
  await settle([a, b], net);
  assert.equal((await listAllAnnotations(a.host.bytes)).length, 1);
});

test("撤销只撤自己的：旧版本字节里补回别人后来加的批注", async () => {
  const { a, b, net } = await pair();
  const before = a.host.bytes; // 撤销栈里的旧快照
  await a.edit(async (bytes) => (await addPdfTextAnnotationAt(bytes, 0, "甲的", { x: 0.1, y: 0.1 })).bytes);
  await b.edit(async (bytes) => (await addPdfTextAnnotationAt(bytes, 3, "乙的", { x: 0.3, y: 0.3 })).bytes);
  await settle([a, b], net);
  assert.equal((await listAllAnnotations(a.host.bytes)).length, 2);
  // 甲撤销：旧快照里什么都没有。补回乙的，甲自己的保持撤掉
  const adjusted = await a.sync.adjustRestored(before, a.host.bytes);
  const list = await listAllAnnotations(adjusted);
  assert.deepEqual(list.map((x) => x.contents), ["乙的"]);
  a.host.bytes = adjusted;
  await settle([a, b], net);
  for (const client of [a, b]) {
    assert.deepEqual((await listAllAnnotations(client.host.bytes)).map((x) => x.contents), ["乙的"], "撤销只影响甲自己加的");
  }
});

// ---------------------------------------------------------------------------- 纯函数

test("三方合并：本地的改动并进共享，共享的差回到本地，删除优先", () => {
  const rect = { origin: { x: 1, y: 2 }, size: { width: 3, height: 4 } };
  const base = pdfToEntities({
    pageIds: ["p1", "p2"],
    pages: [],
    annotations: [
      { id: "x", pageId: "p1", pageIndex: 0, typeName: "TEXT", rect, contents: "旧", opacity: 1 },
      { id: "y", pageId: "p2", pageIndex: 1, typeName: "TEXT", rect, contents: "旧", opacity: 1 },
    ],
    fields: {},
  });
  const local = pdfSyncApply(base, { upserts: { "a:x": { isNew: false, set: { contents: "我改的" }, unset: [] } }, removes: [], pageOrder: null });
  const shared = pdfSyncApply(base, {
    upserts: { "a:x": { isNew: false, set: { opacity: 0.5 }, unset: [] }, "a:z": { isNew: true, set: { pageId: "p2", typeName: "TEXT", contents: "对方新增" }, unset: [] } },
    removes: ["a:y"],
    pageOrder: null,
  });
  const result = pdfSyncReconcile({ base, local, shared, holdsPages: false });
  assert.equal(result.merged.entities["a:x"].contents, "我改的");
  assert.equal(result.merged.entities["a:x"].opacity, 0.5, "同一条不同字段两边都保留");
  assert.ok(result.merged.entities["a:z"]);
  assert.ok(!result.merged.entities["a:y"]);
  assert.deepEqual(Object.keys(result.inbound.upserts).sort(), ["a:x", "a:z"]);
  assert.deepEqual(result.inbound.removes, ["a:y"]);
  // 同一字段两边都改：后推的（本地）胜
  const clash = pdfSyncReconcile({
    base,
    local,
    shared: pdfSyncApply(base, { upserts: { "a:x": { isNew: false, set: { contents: "对方改的" }, unset: [] } }, removes: [], pageOrder: null }),
    holdsPages: false,
  });
  assert.equal(clash.merged.entities["a:x"].contents, "我改的");
  // 对方删了、我改了：删除优先
  const deleted = pdfSyncReconcile({ base, local, shared: pdfSyncApply(base, { upserts: {}, removes: ["a:x"], pageOrder: null }), holdsPages: false });
  assert.ok(!deleted.merged.entities["a:x"]);
  // 没有页的新批注（页还没到本地）先不收，也不会被当成「我删了」
  const sharedNewPage = pdfSyncApply(shared, {
    upserts: { "a:w": { isNew: true, set: { pageId: "p9", typeName: "TEXT" }, unset: [] } },
    removes: [],
    pageOrder: null,
  });
  const skip = pdfSyncReconcile({ base, local, shared: sharedNewPage, holdsPages: false, hasLocalPage: (id) => id !== "p9" });
  assert.ok(!skip.inbound.upserts["a:w"]);
  assert.ok(!skip.nextBase.entities["a:w"]);
  // 对方的改动落到本地字节之后，本地就是 nextBase；再对齐一次，没有收下的 a:w 不会变成「我删了它」
  const again = pdfSyncReconcile({ base: skip.nextBase, local: skip.nextBase, shared: sharedNewPage, holdsPages: false, hasLocalPage: (id) => id !== "p9" });
  assert.deepEqual(again.localChanges, 0, "没收下的东西不会变成本地的删除");
});

test("适配器：页 id 进共享文档，页码由页序算回来；老数据形状不变", () => {
  const rect = { origin: { x: 1, y: 2 }, size: { width: 3, height: 4 } };
  const state = {
    pageIds: ["p1", "p2", "p3"],
    pages: [],
    annotations: [{ id: "x", pageId: "p3", pageIndex: 2, typeName: "TEXT", rect, contents: "c" }],
    fields: {},
  };
  const shape = pdfToEntities(state);
  assert.ok(!("pageIndex" in shape.entities["a:x"]), "页码不存进共享文档");
  const reordered = { ...shape, order: ["p:p3", "p:p1", "p:p2", "a:x"] };
  assert.equal(pdfFromEntities(reordered, null).annotations[0].pageIndex, 0);
  const dropped = { ...shape, order: ["p:p1", "p:p2", "a:x"], entities: { ...shape.entities } };
  delete dropped.entities["p:p3"];
  assert.equal(pdfFromEntities(dropped, null).annotations.length, 0, "页没了，页上的批注不再出现");
});

test("applyPdfSyncOps 对同一批改动重复执行结果不变（幂等）", async () => {
  const bytes = await blankPdf(3);
  const added = await addPdfTextAnnotationAt(bytes, 1, "x", { x: 0.2, y: 0.2 });
  const shape = (await readPdfCollabShape(added.bytes)).shape;
  const ops = pdfSyncDiff({ order: shape.order.filter((k) => k.startsWith("p:")), entities: Object.fromEntries(Object.entries(shape.entities).filter(([k]) => k.startsWith("p:"))), meta: {} }, shape);
  const once = await applyPdfSyncOps(bytes, ops, shape.entities);
  assert.equal(once.changed, true);
  const twice = await applyPdfSyncOps(once.bytes, ops, shape.entities);
  assert.equal(twice.changed, false);
  assert.equal((await listAllAnnotations(once.bytes))[0].id, added.id, "按原 id 写入");
});

test("旋转页（整页级）之后批注仍可读、仍挂在原页", async () => {
  const bytes0 = await blankPdf(2);
  const note = await addPdfTextAnnotationAt(bytes0, 1, "旋转前加的", { x: 0.3, y: 0.3 });
  const rotated = await rotatePdfPage(note.bytes, 1, 90);
  const shape = (await readPdfCollabShape(rotated)).shape;
  const entity = shape.entities[`a:${note.id}`];
  assert.equal(entity.pageId, shape.order.filter((k) => k.startsWith("p:"))[1].slice(2));
});
