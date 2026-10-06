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
  CHART_COLLAB_ROOT,
  chartFromEntities,
  chartToEntities,
} from "../src/shell/collab/adapters/chart.ts";
import { normalizeChartDocument } from "../src/shell/chart-editor/chart-schema.ts";
import {
  GAME_ROOT,
  gameFromEntities,
  gameTextName,
  gameToEntities,
} from "../src/shell/collab/adapters/game.ts";
import {
  MODEL3D_ROOT,
  model3dFromEntities,
  model3dToEntities,
} from "../src/shell/collab/adapters/model3d.ts";
import {
  AUDIO_ROOT,
  audioFromEntities,
  audioToEntities,
} from "../src/shell/collab/adapters/audio.ts";
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
import {
  WORKFLOW_ROOT,
  workflowFromEntities,
  workflowToEntities,
} from "../src/shell/collab/adapters/workflow.ts";

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

test("chart：200 轮两人并发后两边一致", (t) => {
  runEntityFamily(t, {
    name: "chart",
    root: CHART_COLLAB_ROOT,
    toEntities: chartToEntities,
    fromEntities: chartFromEntities,
    seed: normalizeChartDocument({
      schema: "oceanleo.chart.v1",
      version: 1,
      title: "销量",
      option: {
        title: { text: "季度" },
        xAxis: { type: "category", data: ["Q1", "Q2"] },
        yAxis: { type: "value" },
        series: [
          { id: "s-a", name: "华东", type: "bar", data: [10, 20] },
          { id: "s-b", name: "华南", type: "line", data: [5, 15] },
        ],
      },
    }),
  });
});

test("game：200 轮页表+代码并发后两边一致", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const net = link(a, b);
  const seed = { pages: [{ id: "main", label: "main" }, { id: "two", label: "二" }], origin: "ai" };
  writeJsonStateRoot(a, GAME_ROOT, gameToEntities(seed));
  a.getText(gameTextName("main")).insert(0, "function main() {}\n");
  net.flush();
  const gen = rng(7);
  for (let i = 0; i < ROUNDS; i += 1) {
    const who = i % 2 === 0 ? a : b;
    const text = who.getText(gameTextName("main"));
    text.insert(Math.min(text.length, gen() % (text.length + 1)), i % 2 === 0 ? "A" : "B");
    const pages = gameFromEntities(readJsonStateRoot(who, GAME_ROOT), seed);
    const n = gen() % 3;
    if (n === 0 && pages.pages.length < 6) pages.pages.push({ id: `p${i}`, label: `页${i}` });
    if (n === 1 && pages.pages.length > 1) pages.pages.pop();
    if (n === 2) pages.pages[pages.pages.length - 1].label = `L${i}`;
    writeJsonStateRoot(who, GAME_ROOT, gameToEntities(pages));
    net.flush();
  }
  net.flush();
  assert.equal(canon(gameFromEntities(readJsonStateRoot(a, GAME_ROOT), seed)), canon(gameFromEntities(readJsonStateRoot(b, GAME_ROOT), seed)));
  assert.equal(a.getText(gameTextName("main")).toString(), b.getText(gameTextName("main")).toString());
});

test("model3d：200 轮两人并发后两边一致", (t) => {
  const T = (position = [0, 0, 0]) => ({ position, rotation: [0, 0, 0], scale: [1, 1, 1] });
  runEntityFamily(t, {
    name: "model3d",
    root: MODEL3D_ROOT,
    toEntities: model3dToEntities,
    fromEntities: model3dFromEntities,
    seed: {
      checkpointUrl: "https://m/scene.glb",
      operations: [
        { id: "op1", kind: "transform", target: "Chair", value: T([1, 0, 0]) },
        { id: "op2", kind: "transform", target: "Table", value: T([0, 0, 2]) },
        { id: "op3", kind: "visibility", target: "Lamp", visible: false },
      ],
      view: { annotations: [{ id: "n1", text: "注" }] },
    },
  });
});

test("audio：200 轮两人并发后两边一致", (t) => {
  runEntityFamily(t, {
    name: "audio",
    root: AUDIO_ROOT,
    toEntities: audioToEntities,
    fromEntities: audioFromEntities,
    seed: {
      sourceUrl: "https://m/a.mp3",
      operations: [
        { type: "crop", start: 1, end: 9 },
        { type: "fade", edge: "in", duration: 0.5 },
        { type: "gain", multiplier: 1.5, start: 2, end: 4 },
      ],
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

test("workflow（一次一人适配器仍收敛）：200 轮后两边一致", (t) => {
  const node = (id, x, y, label) => ({
    id,
    kind: "trim",
    label,
    x,
    y,
    ports: { inputs: [{ name: "in", dataType: "video" }], outputs: [{ name: "out", dataType: "video" }] },
  });
  runEntityFamily(t, {
    name: "workflow",
    root: WORKFLOW_ROOT,
    toEntities: workflowToEntities,
    fromEntities: workflowFromEntities,
    onePerson: true,
    seed: {
      nodes: [node("n1", 0, 0, "素材"), node("n2", 200, 0, "裁剪"), node("n3", 400, 0, "输出")],
      edges: [
        { id: "e1", fromNodeId: "n1", fromPort: "out", toNodeId: "n2", toPort: "in" },
        { id: "e2", fromNodeId: "n2", fromPort: "out", toNodeId: "n3", toPort: "in" },
      ],
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
