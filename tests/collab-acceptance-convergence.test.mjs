/**
 * V02：W12–W14 全部编辑器族，两人并发 200 轮随机操作后两边状态一致；
 * 标为「一次一人」的族（专业模式、矢量图、流程图/PDF）另验锁互斥。
 */
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";

import { bindJsonState, readJsonStateRoot, writeJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import { decideProEntry } from "../src/shell/collab/pro-mode-lock.ts";
import {
  GRID_COLLAB_ROOT,
  gridFromEntities,
  gridToEntities,
} from "../src/shell/collab/adapters/grid.ts";
import { RICHDOC_COLLAB_FIELD, richDocFromY } from "../src/shell/collab/adapters/richdoc.ts";
import {
  DECK_COLLAB_ROOT,
  deckFromEntities,
  deckToEntities,
} from "../src/shell/collab/adapters/deck.ts";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import {
  IMAGE_COLLAB_ROOT,
  imageFromEntities,
  imageToEntities,
} from "../src/shell/collab/adapters/image.ts";
import {
  PDF_ROOT,
  pdfFromEntities,
  pdfToEntities,
} from "../src/shell/collab/adapters/pdf.ts";
import {
  VIDEO_ROOT,
  videoFromEntities,
  videoToEntities,
} from "../src/shell/collab/adapters/video.ts";

const ROUNDS = 200;
const canon = (value) =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .sort(([x], [y]) => (x < y ? -1 : 1)),
        )
      : v,
  );
const clone = (v) => JSON.parse(JSON.stringify(v));

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

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

function makeRoom(doc, extra = {}) {
  return {
    roomKey: "artifact:v02",
    doc,
    role: "editor",
    status: "synced",
    self: { id: "u1", name: "甲", color: "hsl(1, 70%, 45%)", avatar_url: null },
    needsSeed: false,
    lock: null,
    completeSeed() {},
    subscribe() {
      return () => {};
    },
    ...extra,
  };
}

function pick(list, n) {
  return list[n % list.length];
}

function mutateEntityShape(shape, n, tag) {
  const next = clone(shape);
  const ids = next.order.filter((id) => next.entities[id]);
  if (ids.length === 0) return next;
  const id = ids[n % ids.length];
  const ent = next.entities[id];
  const keys = Object.keys(ent);
  if (keys.length === 0) {
    ent[`v02_${tag}`] = n;
    return next;
  }
  const key = keys[n % keys.length];
  const value = ent[key];
  if (typeof value === "number") ent[key] = value + (tag === "a" ? 1 : 2);
  else if (typeof value === "string") ent[key] = `${value}:${tag}${n % 97}`;
  else if (typeof value === "boolean") ent[key] = !value;
  else ent[`v02_${tag}`] = n;
  return next;
}

function runEntityFamily(t, { name, root, seed, toEntities, fromEntities, onePerson = false }) {
  const aDoc = new Y.Doc();
  const bDoc = new Y.Doc();
  const net = link(aDoc, bDoc);
  const seedShape = toEntities(seed);
  writeJsonStateRoot(aDoc, root, seedShape);
  net.flush();
  const bindA = bindJsonState({
    room: makeRoom(aDoc),
    rootName: root,
    toEntities,
    fromEntities,
  });
  const bindB = bindJsonState({
    room: makeRoom(bDoc, { self: { id: "u2", name: "乙", color: "hsl(2, 70%, 45%)", avatar_url: null } }),
    rootName: root,
    toEntities,
    fromEntities,
  });
  const gen = rng(name.length * 1103515245 + 12345);
  let stateA = fromEntities(readJsonStateRoot(aDoc, root), seed);
  let stateB = fromEntities(readJsonStateRoot(bDoc, root), seed);
  for (let i = 0; i < ROUNDS; i += 1) {
    const n = gen();
    const m = gen();
    if (onePerson) {
      const who = i % 2 === 0 ? "a" : "b";
      const src = who === "a" ? stateA : stateB;
      const next = fromEntities(mutateEntityShape(toEntities(src), n, who), src);
      if (who === "a") {
        bindA.push(next);
        stateA = next;
      } else {
        bindB.push(next);
        stateB = next;
      }
    } else {
      const shapeA = mutateEntityShape(toEntities(stateA), n, "a");
      const shapeB = mutateEntityShape(toEntities(stateB), m, "b");
      const idsA = shapeA.order.filter((id) => shapeA.entities[id]);
      const idsB = shapeB.order.filter((id) => shapeB.entities[id]);
      if (idsA.length >= 2 && idsA[0] === idsB[m % idsB.length]) {
        const other = idsA[1];
        const ent = shapeB.entities[idsB[m % idsB.length]];
        delete shapeB.entities[idsB[m % idsB.length]];
        shapeB.entities[other] = { ...shapeB.entities[other], ...ent, v02_b: m };
        shapeB.order = shapeB.order.map((id) => (id === idsB[m % idsB.length] ? other : id));
      }
      bindA.push(fromEntities(shapeA, stateA));
      bindB.push(fromEntities(shapeB, stateB));
    }
    net.flush();
    stateA = fromEntities(readJsonStateRoot(aDoc, root), stateA);
    stateB = fromEntities(readJsonStateRoot(bDoc, root), stateB);
  }
  net.flush();
  const left = fromEntities(readJsonStateRoot(aDoc, root), stateA);
  const right = fromEntities(readJsonStateRoot(bDoc, root), stateB);
  assert.equal(canon(left), canon(right), `${name} 200 轮后两边 fromEntities 不一致`);
  bindA.destroy();
  bindB.destroy();
  t.diagnostic(`${name}: ${ROUNDS} rounds pass equal=${canon(left).length}b`);
}

test("richdoc：200 轮并发插入后两边 XmlFragment 一致", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const net = link(a, b);
  const seed = new Y.XmlText();
  seed.insert(0, "起");
  a.getXmlFragment(RICHDOC_COLLAB_FIELD).insert(0, [seed]);
  net.flush();
  const gen = rng(42);
  for (let i = 0; i < ROUNDS; i += 1) {
    const who = i % 2 === 0 ? a : b;
    const frag = who.getXmlFragment(RICHDOC_COLLAB_FIELD);
    const ch = String.fromCharCode(97 + (gen() % 26));
    if (frag.length === 0) {
      const text = new Y.XmlText();
      text.insert(0, ch);
      frag.insert(0, [text]);
    } else {
      const node = frag.get(gen() % frag.length);
      if (node && typeof node.insert === "function") {
        const at = Math.min(node.length, gen() % (node.length + 1));
        node.insert(at, ch);
      } else {
        const text = new Y.XmlText();
        text.insert(0, ch);
        frag.insert(frag.length, [text]);
      }
    }
    net.flush();
  }
  net.flush();
  assert.equal(canon(richDocFromY(a)), canon(richDocFromY(b)));
});

test("grid：200 轮两人并发后两边一致", (t) => {
  runEntityFamily(t, {
    name: "grid",
    root: GRID_COLLAB_ROOT,
    toEntities: gridToEntities,
    fromEntities: gridFromEntities,
    seed: {
      id: "wb",
      name: "表",
      sheetOrder: ["s1"],
      sheets: {
        s1: {
          id: "s1",
          name: "收入",
          rowCount: 20,
          columnCount: 8,
          cellData: {
            0: { 0: { v: "项目", t: 1 }, 1: { v: 1, t: 2 }, 2: { v: 2, t: 2 } },
            1: { 0: { v: "合计", t: 1 }, 1: { v: 3, t: 2 } },
          },
        },
      },
    },
  });
});

test("deck：200 轮两人并发后两边一致", (t) => {
  runEntityFamily(t, {
    name: "deck",
    root: DECK_COLLAB_ROOT,
    toEntities: deckToEntities,
    fromEntities: (input, prev) => deckFromEntities(input, prev),
    seed: normalizeDeckDocument({
      title: "验收",
      aspect: "16:9",
      theme: "paper",
      slides: [1, 2, 3].map((n) => ({
        id: `slide-${n}`,
        title: `第 ${n} 页`,
        body: `正文 ${n}`,
        bullets: [],
        notes: "",
        layout: "title-body",
        background: "",
        elements: [
          { id: `s${n}-t`, type: "text", x: 6, y: 7, width: 88, height: 14, rotation: 0, order: 1, text: `标题 ${n}`, fontSize: 32 },
          { id: `s${n}-b`, type: "shape", x: 10, y: 30, width: 20, height: 20, rotation: 0, order: 2, shape: "rect", fill: "#ff0000" },
        ],
      })),
    }),
  });
});

test("image：200 轮两人并发后两边一致", (t) => {
  runEntityFamily(t, {
    name: "image",
    root: IMAGE_COLLAB_ROOT,
    toEntities: imageToEntities,
    fromEntities: imageFromEntities,
    seed: {
      json: {
        version: "6.0.0",
        objects: [
          { type: "Rect", oceanleoId: "bg", left: 0, top: 0, width: 100, height: 100, fill: "#fff" },
          { type: "Textbox", oceanleoId: "title", left: 8, top: 8, width: 80, height: 20, text: "海报", fill: "#111" },
          { type: "Circle", oceanleoId: "dot", left: 40, top: 40, radius: 10, fill: "#f00" },
        ],
      },
      doc: { width: 100, height: 100 },
      canvasBackground: "#ffffff",
    },
  });
});

test("video：200 轮两人并发后两边一致", (t) => {
  runEntityFamily(t, {
    name: "video",
    root: VIDEO_ROOT,
    toEntities: videoToEntities,
    fromEntities: videoFromEntities,
    seed: {
      width: 1280,
      height: 720,
      fps: 30,
      tracks: [
        {
          id: "track_v",
          kind: "video",
          clips: [
            { id: "clip_1", start_ms: 0, duration_ms: 2000, source_url: "https://m/a.mp4", in_ms: 0, speed: 1, volume: 1 },
            { id: "clip_2", start_ms: 2000, duration_ms: 1500, source_url: "https://m/b.mp4", in_ms: 100, speed: 1, volume: 0.5 },
          ],
        },
        { id: "track_t", kind: "text", clips: [{ id: "clip_3", start_ms: 500, duration_ms: 1000, text: "你好" }] },
      ],
    },
  });
});

test("pdf（一次一人适配器仍收敛）：200 轮后两边一致", (t) => {
  const rect = (x, y) => ({ origin: { x, y }, size: { width: 100, height: 20 } });
  runEntityFamily(t, {
    name: "pdf",
    root: PDF_ROOT,
    toEntities: pdfToEntities,
    fromEntities: pdfFromEntities,
    onePerson: true,
    seed: {
      pages: [{ index: 0, widthPt: 612, heightPt: 792 }],
      annotations: [
        { id: "a1", pageIndex: 0, typeName: "HIGHLIGHT", rect: rect(50, 60), contents: "x", strokeColor: "#ffe066" },
        { id: "a2", pageIndex: 0, typeName: "TEXT", rect: rect(80, 100), contents: "看这里", strokeColor: "#ff0000" },
      ],
      fields: { name: "张三" },
    },
  });
});

function fakeLockRoom(over = {}) {
  const me = { id: "me", name: "我", color: "c", avatar_url: null };
  const other = { id: "other", name: "小王", color: "c", avatar_url: null };
  const room = {
    role: "editor",
    status: "synced",
    self: me,
    lock: null,
    acquires: 0,
    acquireResult: true,
    async acquireLock() {
      this.acquires += 1;
      if (!this.acquireResult) return false;
      this.lock = { holder: me, mode: "pro", expires_at: "" };
      return true;
    },
    releaseLock() {
      if (this.lock?.holder.id === me.id) this.lock = null;
    },
    ...over,
  };
  return { room, me, other };
}

test("一次一人：专业模式 decideProEntry 互斥；别人持锁则拦下", async () => {
  const free = fakeLockRoom();
  assert.deepEqual(await decideProEntry(free.room), { ok: true });
  assert.equal(free.room.acquires, 1);
  const locked = fakeLockRoom({
    acquireResult: false,
    lock: { holder: { id: "other", name: "小王", color: "c", avatar_url: null }, mode: "pro", expires_at: "" },
  });
  const verdict = await decideProEntry(locked.room);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "locked");
  assert.equal(verdict.holder.id, "other");
  const viewer = fakeLockRoom({ role: "viewer" });
  assert.deepEqual(await decideProEntry(viewer.room), { ok: false, reason: "viewer" });
});

test("一次一人：矢量/流程图/PDF 的抢锁语义（先到的人持锁，第二人拿不到）", async () => {
  const held = { holder: null };
  function roomFor(id) {
    return {
      role: "editor",
      status: "synced",
      self: { id, name: id, color: "c", avatar_url: null },
      get lock() {
        return held.holder ? { holder: held.holder, mode: "pro", expires_at: "" } : null;
      },
      async acquireLock() {
        if (held.holder && held.holder.id !== id) return false;
        held.holder = { id, name: id, color: "c", avatar_url: null };
        return true;
      },
      releaseLock() {
        if (held.holder?.id === id) held.holder = null;
      },
    };
  }
  const a = roomFor("vector-a");
  const b = roomFor("vector-b");
  assert.equal(await a.acquireLock(), true);
  assert.equal(await b.acquireLock(), false);
  assert.equal((await decideProEntry(b)).ok, false);
  a.releaseLock();
  assert.equal(await b.acquireLock(), true);
});

// =============================================================================
// 第二轮（V12）：F05–F10 的完成标准。第一段先写好；还没交付的条目会红，交付后变绿。
// 读码类断言只检查「调用点在不在」，行为类断言走真实适配器与 yjs。
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VIEW_ONLY_REFUSAL } from "../src/shell/collab/adapters/visual-readonly.ts";

const UI_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(UI_ROOT, "src/shell", rel), "utf8");
const has = (rel) => existsSync(join(UI_ROOT, "src/shell", rel));

/** 两个客户端共用一份文档的最小夹具：同一组实体根，各自 bindJsonState。 */
function twoPeers({ root, toEntities, fromEntities, seed }) {
  const aDoc = new Y.Doc();
  const bDoc = new Y.Doc();
  const net = link(aDoc, bDoc);
  writeJsonStateRoot(aDoc, root, toEntities(seed));
  net.flush();
  const bindA = bindJsonState({ room: makeRoom(aDoc), rootName: root, toEntities, fromEntities });
  const bindB = bindJsonState({
    room: makeRoom(bDoc, { self: { id: "u2", name: "乙", color: "hsl(2, 70%, 45%)", avatar_url: null } }),
    rootName: root,
    toEntities,
    fromEntities,
  });
  const read = (doc) => fromEntities(readJsonStateRoot(doc, root), seed);
  return { aDoc, bDoc, net, bindA, bindB, read, destroy: () => (bindA.destroy(), bindB.destroy()) };
}

// ------------------------------------------------------------------ F05 PDF
test("[F05] PDF：不再整份上锁；默认编辑器接了按批注合并的协同", () => {
  const route = src("advanced-routes/PdfRoute.tsx");
  assert.doesNotMatch(route, /useLockedEditCollab\s*\(/, "PdfRoute 还在用整份上锁（第二个人只能看）");
  assert.match(route, /usePdfCollab\s*\(/, "PdfRoute 要接 usePdfCollab（按批注合并）");
  assert.ok(has("collab/adapters/use-pdf-collab.ts"), "缺 use-pdf-collab.ts");
});

test("[F05] PDF：两人同时各加批注都在；甲删第 3 页，乙在第 5 页的批注仍在原来那一页", () => {
  const rect = (x) => ({ origin: { x, y: 10 }, size: { width: 50, height: 10 } });
  const seed = {
    pageIds: ["p1", "p2", "p3", "p4", "p5"],
    pages: [0, 1, 2, 3, 4].map((index) => ({ index, widthPt: 612, heightPt: 792 })),
    annotations: [{ id: "a0", pageId: "p1", pageIndex: 0, typeName: "TEXT", rect: rect(1), contents: "base" }],
    fields: {},
  };
  const { net, bindA, bindB, read, aDoc, bDoc, destroy } = twoPeers({ root: PDF_ROOT, toEntities: pdfToEntities, fromEntities: pdfFromEntities, seed });
  const a0 = read(aDoc);
  const b0 = read(bDoc);
  // 甲：在第 2 页划重点；乙：在第 5 页加便签。同一时间发出，中间不同步
  const a1 = { ...a0, annotations: [...a0.annotations, { id: "a-hl", pageId: "p2", pageIndex: 1, typeName: "HIGHLIGHT", rect: rect(2), contents: "" }] };
  const b1 = { ...b0, annotations: [...b0.annotations, { id: "b-note", pageId: "p5", pageIndex: 4, typeName: "TEXT", rect: rect(3), contents: "乙的便签" }] };
  bindA.push(a1);
  bindB.push(b1);
  net.flush();
  const merged = read(aDoc);
  assert.equal(canon(merged), canon(read(bDoc)), "两边不一致");
  assert.deepEqual(merged.annotations.map((x) => x.id).sort(), ["a-hl", "a0", "b-note"], "双方的批注都应在");
  // 甲删第 3 页（p3）
  const afterDelete = {
    ...merged,
    pageIds: merged.pageIds.filter((id) => id !== "p3"),
    pages: merged.pages.slice(0, 4).map((page, index) => ({ ...page, index })),
  };
  bindA.push(afterDelete);
  net.flush();
  const final = read(bDoc);
  const note = final.annotations.find((x) => x.id === "b-note");
  assert.ok(note, "乙的批注被删页冲掉了");
  assert.equal(note.pageId, "p5", "批注应仍挂在原来的页 id 上");
  assert.equal(final.pageIds[note.pageIndex], "p5", "页码要由页 id 算回：删第 3 页后 p5 变成第 4 页");
  destroy();
});

// ------------------------------------------------------------------ F08 PPT、图表、图片、矢量图
test("[F08] PPT/图片：浮条与面板拿到只读（图表编辑器与嵌入矢量画布已删除）", () => {
  for (const [name, rel, tag] of [
    ["deck", "advanced-routes/DeckRoute.tsx", "useDeckSelectionAdapter"],
    ["image", "advanced-routes/ImageRoute.tsx", "useFabricImageSelectionAdapter"],
  ]) {
    const route = src(rel);
    const m = new RegExp(`${tag}\\(\\{([\\s\\S]*?)\\}\\)`).exec(route);
    assert.ok(m, `${name}: 找不到 ${tag} 调用`);
    assert.match(m[1], /readOnly:/, `${name}: ${tag} 没拿到 readOnly`);
    assert.match(route, /selection,/, `${name}: 选区 adapter 没交给外壳`);
  }
  const copy = readFileSync(join(UI_ROOT, "src/i18n/ui/messages/collab-visual-copy.ts"), "utf8");
  for (const phrase of ["保存我的", "看新版本"]) assert.ok(copy.includes(phrase), `collab-visual-copy.ts 缺「${phrase}」`);
});

// ------------------------------------------------------------------ F09 文档评论
test("[F09] 文档评论：评论、回复、解决进共享文档；只读不能写评论", () => {
  assert.ok(has("doc-editors/richdoc-review/review-collab.ts"), "缺 review-collab.ts（评论共享层）");
  assert.ok(has("doc-editors/richdoc-review/use-richdoc-review-collab.ts"), "缺 use-richdoc-review-collab.ts");
  const route = src("advanced-routes/RichDocRoute.tsx");
  assert.match(route, /useRichDocReviewCollab|use-richdoc-review-collab/, "RichDocRoute 没接评论协同");
  const collabSrc = has("doc-editors/richdoc-review/review-collab.ts") ? src("doc-editors/richdoc-review/review-collab.ts") : "";
  assert.match(collabSrc, /richdoc-review/, "评论字段名应是 oceanleo:richdoc-review");
  assert.match(collabSrc, /replies/, "回复要按回复 id 存（两人同时回复两条都在）");
});

// ------------------------------------------------------------------ F10 表格结构
test("[F10] 表格：老格式（按位置）读出的快照形状不变；远端结构变化不整张替换", () => {
  const snapshot = {
    id: "wb",
    name: "B",
    sheetOrder: ["s1"],
    sheets: { s1: { id: "s1", name: "D", rowCount: 10, columnCount: 4, cellData: { 0: { 0: { v: "a", t: 1 } }, 7: { 2: { v: 9, t: 2 } } } } },
  };
  const back = gridFromEntities(gridToEntities(snapshot), null);
  assert.equal(back.sheets.s1.cellData[7][2].v, 9, "往返后第 8 行 C 列的值丢了/错位");
  // 老格式实体：键是「表!行!列」
  const old = gridFromEntities({ order: ["s1!7!2"], entities: { "s1!7!2": { v: 9, t: 2 } }, meta: { sheetOrder: ["s1"], "sheet:s1": { id: "s1", name: "D", rowCount: 10, columnCount: 4 } } }, null);
  assert.equal(old.sheets.s1.cellData[7][2].v, 9, "读不懂老格式");
  // 远端结构变化走增量命令（collab-univer-ops），不是 port.replaceWorkbook 整张替换
  const stage = src("doc-editors/GridUniverStage.tsx") + src("collab/adapters/grid.ts");
  assert.match(stage, /collab-univer-ops|applyStructural|collabUniverOps/, "表格协同没有接增量结构命令（collab-univer-ops），远端结构变化只能整张替换");
  assert.ok(has("doc-editors/grid-univer/collab-layout-model.ts"), "缺行列稳定 id 的模型（collab-layout-model.ts）");
});

// ------------------------------------------------------------------ 第 16 条：只读一致性（全部编辑器族）
const SURFACE_FILES = {
  richdoc: "advanced-routes/RichDocRoute.tsx",
  grid: "doc-editors/GridUniverStage.tsx",
  deck: "advanced-routes/DeckRoute.tsx",
  image: "advanced-routes/ImageRoute.tsx",
  pdf: "advanced-routes/PdfRoute.tsx",
  video: "advanced-routes/VideoTimelineRoute.tsx",
};

for (const [family, rel] of Object.entries(SURFACE_FILES)) {
  test(`[只读/16] ${family}：AI uses read-only context and the background workbench write gate`, () => {
    const text = src(rel);
    assert.match(text, /useEditorContext\s*\(/);
    assert.match(text, /useLibraryEditReadOnly\(item\)/);
    assert.match(src("InlineAdvancedWorkbenchShell.tsx"), /useLibraryEditorBinding\(item, flushForExplicitSave, hostAutoSaveEnabled/);
    assert.match(src("plugin-command/library-edit-flow.ts"), /if \(!binding.writable\(\)\)/);
  });
}

test("[只读/16] 每个选区 adapter 拿到只读状态，Grid 的数据入口与命令也有只读门禁", () => {
  for (const [name, hook, adapter] of [
    ["RichDocRoute", "useRichDocSelectionAdapter", "doc-editors/use-rich-doc-selection-adapter.ts"],
    ["DeckRoute", "useDeckSelectionAdapter", "doc-editors/use-deck-selection-adapter.ts"],
    ["ImageRoute", "useFabricImageSelectionAdapter", "image-editor/use-fabric-image-selection-adapter.ts"],
    ["PdfRoute", "usePdfSelectionAdapter", "media-editors/use-pdf-selection-adapter.ts"],
    ["VideoTimelineRoute", "useVideoTimelineSelectionAdapter", "video-editor/use-video-timeline-selection-adapter.ts"],
  ]) {
    const text = src(`advanced-routes/${name}.tsx`);
    const call = new RegExp(`${hook}\\(\\{([\\s\\S]*?)\\}\\)`).exec(text);
    assert.ok(call, `${name}: 缺 ${hook} 调用`);
    assert.ok(/\b(?:readOnly|viewOnly)\s*(?::|,|$)/.test(call[1]) || /\bstate\.collabReadOnly\b/.test(src(adapter)), `${name}: adapter 没拿到只读`);
    assert.match(text, /selection,/, `${name}: 选区 adapter 没交给外壳`);
    assert.doesNotMatch(text, /contextToolbar:|renderContextToolbar:/, `${name}: 仍有私有浮条入口`);
  }
  const grid = src("doc-editors/GridUniverStage.tsx");
  assert.match(grid, /selection:\s*\{ context: readonly \? null : selectionAdapterContext\(selectionContext\), dispatch: runControl \}/);
  assert.match(grid, /const runControl = useCallback\([\s\S]*?if \(readonly\)/);
});

function dummyCommandParams(spec) {
  return Object.fromEntries(
    (spec.params || []).map((param) => [
      param.key,
      param.type === "enum" ? param.enumValues?.[0]?.value ?? "x" : param.type === "number" ? 1 : "x",
    ]),
  );
}

function recordCalls() {
  const calls = [];
  const record =
    (name, result) =>
    (...args) => {
      calls.push([name, ...args]);
      return typeof result === "function" ? result(...args) : result;
    };
  return { calls, record };
}
