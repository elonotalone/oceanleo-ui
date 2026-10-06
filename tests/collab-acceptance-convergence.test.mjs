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

// =============================================================================
// 第二轮（V12）：F05–F10 的完成标准。第一段先写好；还没交付的条目会红，交付后变绿。
// 读码类断言只检查「调用点在不在」，行为类断言走真实适配器与 yjs。
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canvasGraphFromEntities, canvasGraphToEntities } from "../src/shell/collab/adapters/workflow.ts";
import {
  VIEW_ONLY_REFUSAL,
  guardPluginSurface,
} from "../src/shell/collab/adapters/visual-readonly.ts";
import { buildDeckCommandSurface, buildPdfCommandSurface, buildRichDocCommandSurface } from "../src/shell/doc-editors/doc-family-commands.ts";
import { createImageCommandSurface } from "../src/shell/image-editor/image-command-surface.ts";
import { createChartCommandSurface } from "../src/shell/chart-editor/chart-command-surface.ts";
import { createVideoCommandSurface } from "../src/shell/video-editor/video-command-surface.ts";
import { createAudioCommandSurface } from "../src/shell/media-editors/audio-command-surface.ts";
import { createModel3DCommandSurface } from "../src/shell/media-editors/model3d-command-surface.ts";
import { createGameAgentSurface } from "../src/shell/game-editor/game-agent-gate.ts";
import { runGridAgentCommand } from "../src/shell/doc-editors/grid-univer/agent-write-gate.ts";

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

// ------------------------------------------------------------------ F06 流程图
test("[F06] 流程图：路径 B — collab 不由只读推出 inert、useEntityCollab 在用、旧画布回落允许锁；只读人能拖能缩放（外壳能验到的部分）", () => {
  const stage = src("workflow-carrier/VideoCanvasStage.tsx");
  assert.match(stage, /useEntityCollab\s*[<(]/, "新画布要走 useEntityCollab（按节点连线合并）");
  assert.match(stage, /useLockedEditCollab\s*\(/, "旧画布不认协同消息，探测失败后必须能退回一次一人锁");
  const inertDef = /const canvasInert\s*=([\s\S]{0,260}?);/.exec(stage)?.[1] ?? "";
  assert.match(
    inertDef,
    /mode === "detect" \? true : mode === "collab" \? !controlReady : lockedEdit\.readOnly/,
    `canvasInert 必须是 detect→true / collab→!controlReady / lock→lockedEdit.readOnly，实际：${inertDef.trim()}`,
  );
  const collabArm = /mode === "collab" \? ([^:]+):/.exec(inertDef)?.[1] ?? "";
  assert.doesNotMatch(collabArm, /readOnly|viewer|canWrite|role/i, `collab 分支 inert 不得由只读推出：${collabArm.trim()}`);
  const canvasInert = (mode, controlReady, lockedReadOnly) =>
    mode === "detect" ? true : mode === "collab" ? !controlReady : lockedReadOnly;
  assert.equal(canvasInert("collab", true, true), false, "只读查看者、新画布已对齐：外壳不 inert，能平移、缩放");
  assert.equal(canvasInert("collab", false, false), true, "对齐未完成：整块 inert");
  assert.equal(canvasInert("lock", true, true), true, "旧画布回落：只读仍 inert");
  assert.equal(canvasInert("detect", true, false), true, "探测期 inert");
});

test("[F06] 流程图：两人同时加节点与连线都在；甲删节点，乙连到它的线不留断线", () => {
  const node = (id, x) => ({ nodeId: id, id, title: id, position: { x, y: 0 }, kind: "trim" });
  const seed = { nodes: [node("n1", 0), node("n2", 100), node("n3", 200)], edges: [{ edgeId: "e1", id: "e1", sourceNodeId: "n1", targetNodeId: "n2" }] };
  const toE = canvasGraphToEntities;
  const fromE = (input, prev) => canvasGraphFromEntities(input, prev);
  const { net, bindA, bindB, read, aDoc, bDoc, destroy } = twoPeers({ root: WORKFLOW_ROOT, toEntities: toE, fromEntities: fromE, seed });
  const a0 = read(aDoc);
  const b0 = read(bDoc);
  bindA.push({ ...a0, nodes: [...a0.nodes, node("n4", 300)] });
  bindB.push({ ...b0, edges: [...b0.edges, { edgeId: "e2", id: "e2", sourceNodeId: "n2", targetNodeId: "n3" }, { edgeId: "e3", id: "e3", sourceNodeId: "n3", targetNodeId: "n1" }] });
  net.flush();
  const merged = read(aDoc);
  assert.equal(canon(merged), canon(read(bDoc)), "加节点/连线后两边不一致");
  assert.deepEqual(merged.nodes.map((n) => n.id).sort(), ["n1", "n2", "n3", "n4"]);
  assert.deepEqual(merged.edges.map((e) => e.id).sort(), ["e1", "e2", "e3"]);
  // 甲删 n3；乙同时又连了一条 n1→n3
  const a1 = read(aDoc);
  const b1 = read(bDoc);
  bindA.push({ ...a1, nodes: a1.nodes.filter((n) => n.id !== "n3"), edges: a1.edges.filter((e) => e.sourceNodeId !== "n3" && e.targetNodeId !== "n3") });
  bindB.push({ ...b1, edges: [...b1.edges, { edgeId: "e9", id: "e9", sourceNodeId: "n1", targetNodeId: "n3" }] });
  net.flush();
  for (const doc of [aDoc, bDoc]) {
    const g = read(doc);
    const ids = new Set(g.nodes.map((n) => n.id));
    const dangling = g.edges.filter((e) => !ids.has(e.sourceNodeId) || !ids.has(e.targetNodeId)).map((e) => e.id);
    assert.deepEqual(dangling, [], `删节点后留下了断线：${dangling.join(",")}`);
  }
  assert.equal(canon(read(aDoc)), canon(read(bDoc)));
  destroy();
});

// ------------------------------------------------------------------ F07 视频、音频、3D
test("[F07] 视频/音频/3D：远端改动不走 restoreRecovery（不清撤销栈、不标未保存）", () => {
  const routes = { video: "advanced-routes/VideoTimelineRoute.tsx", audio: "advanced-routes/AudioRoute.tsx", model3d: "advanced-routes/Model3DRoute.tsx" };
  const bad = [];
  for (const [name, rel] of Object.entries(routes)) {
    const text = src(rel);
    for (const m of text.matchAll(/applyRemote\b[^\n]*=>?\s*[{(]|applyRemote:\s*[^\n]*/g)) {
      const body = text.slice(m.index, m.index + 700);
      if (/restoreRecovery/.test(body)) bad.push(`${name}: applyRemote 附近调用了 restoreRecovery`);
    }
    if (!/applyRemote(Doc|Project|Scene)\b/.test(text)) bad.push(`${name}: 没有专门接远端改动的入口（applyRemoteDoc/Project/Scene）`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("[F07] 视频/音频/3D：只读不再整块 inert；撤销栈按自己的改动记", () => {
  const routes = ["advanced-routes/VideoTimelineRoute.tsx", "advanced-routes/AudioRoute.tsx", "advanced-routes/Model3DRoute.tsx"];
  const bad = routes.filter((rel) => /\binert\b\s*=/.test(src(rel)));
  assert.deepEqual(bad, [], `这些路由只读时仍整块 inert（连播放、转视角都点不了）：${bad.join(", ")}`);
  assert.ok(has("video-editor/entity-undo.ts"), "缺「只撤自己」的撤销栈模块 entity-undo.ts");
});

// ------------------------------------------------------------------ F08 PPT、图表、图片、矢量图
test("[F08] PPT/图表/图片：浮条与面板拿到只读；矢量图只读 inert、未保存时外部新版本出提示", () => {
  for (const [name, rel, tag] of [
    ["deck", "advanced-routes/DeckRoute.tsx", "DeckContextToolbar"],
    ["chart", "advanced-routes/ChartRoute.tsx", "ChartContextToolbar"],
    ["image", "advanced-routes/ImageRoute.tsx", "FabricImageContextToolbar"],
  ]) {
    const m = new RegExp(`<${tag}\\b([\\s\\S]*?)/>`).exec(src(rel));
    assert.ok(m, `${name}: 找不到 <${tag}>`);
    assert.match(m[1], /readOnly=/, `${name}: <${tag}> 没拿到 readOnly`);
  }
  const embedded = src("advanced-routes/EmbeddedRoute.tsx");
  assert.match(embedded, /inert/, "矢量图只读时 iframe 要 inert");
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
  chart: "advanced-routes/ChartRoute.tsx",
  game: "game-editor/GameCodeStage.tsx",
  model3d: "advanced-routes/Model3DRoute.tsx",
  audio: "advanced-routes/AudioRoute.tsx",
  pdf: "advanced-routes/PdfRoute.tsx",
  video: "advanced-routes/VideoTimelineRoute.tsx",
  workflow: "workflow-carrier/VideoCanvasStage.tsx",
};

// 指令面的构造在别的文件里的族：路由里没写只读，只要构造文件里写了也算挡住
const SURFACE_BUILDERS = {
  richdoc: ["doc-editors/doc-family-commands.ts"],
  pdf: ["doc-editors/doc-family-commands.ts"],
  chart: ["chart-editor/chart-command-surface.ts"],
  image: ["image-editor/image-command-surface.ts"],
  model3d: ["media-editors/model3d-command-surface.ts"],
  audio: ["media-editors/audio-command-surface.ts", "media-editors/visual-command-kit.ts"],
  video: ["video-editor/video-command-surface.ts", "media-editors/visual-command-kit.ts"],
  game: ["game-editor/game-agent-gate.ts"],
};
const READ_ONLY_GUARD = /readonly:\s|readonlyNotice|\.readOnly\b|\breadOnly\b|\bviewOnly\b|guardPluginSurface|guardVisualCommands|editBlocked/;

for (const [family, rel] of Object.entries(SURFACE_FILES)) {
  test(`[只读/16] ${family}：Leo「帮我改」的指令入口在只读时被挡住`, () => {
    const text = src(rel);
    const calls = [...text.matchAll(/usePluginCommandSurface\s*\(/g)];
    assert.ok(calls.length > 0, `${rel} 没有注册 Leo 指令入口`);
    const builders = (SURFACE_BUILDERS[family] ?? []).filter(has).map(src).join("\n");
    for (const call of calls) {
      // 只看调用本身的实参（到下一个 `);` 为止）与这一族的指令面构造文件，不看周围别处的 readOnly
      const rest = text.slice(call.index);
      const around = rest.slice(0, Math.max(1, rest.indexOf(");") + 2));
      assert.ok(
        READ_ONLY_GUARD.test(around) || READ_ONLY_GUARD.test(builders),
        `${family}（${rel}）：Leo 指令入口没有只读判断（路由与指令面构造文件都没有），只读用户让 Leo 改会直接改动作品`,
      );
    }
  });
}

test("[只读/16] 浮条：每个 *ContextToolbar 拿到只读状态（传 prop，或组件自己读 editor 里的 collabReadOnly）", () => {
  const files = ["RichDocRoute", "DeckRoute", "ChartRoute", "ImageRoute", "GridRoute", "GameRoute", "PdfRoute", "AudioRoute", "Model3DRoute", "VideoTimelineRoute"];
  const bad = [];
  for (const name of files) {
    const rel = `advanced-routes/${name}.tsx`;
    const text = src(rel);
    for (const m of text.matchAll(/<([A-Za-z0-9]*ContextToolbar)\b([\s\S]*?)\/>/g)) {
      if (/readOnly=|viewOnly=/.test(m[2])) continue;
      // 组件自己读 editor 状态里的只读：看它的源文件
      const imp = new RegExp(`import\\s*\\{[^}]*\\b${m[1]}\\b[^}]*\\}\\s*from\\s*"(\\.[^"]+)"`).exec(text);
      const file = imp ? join(dirname(rel), imp[1]).replace(/\\/g, "/") : null;
      const comp = file && (has(`${file}.tsx`) ? src(`${file}.tsx`) : "");
      if (!comp || !/\b(readOnly|collabReadOnly|viewOnly)\b/.test(comp)) bad.push(`${name}: <${m[1]}> 既没传只读，组件本身也不读只读状态`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
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

async function assertWrappedReadonly(family, inner, editorCalls) {
  const ran = [];
  const instrumented = {
    ...inner,
    run(id, params) {
      ran.push(id);
      return inner.run(id, params);
    },
  };
  const surface = guardPluginSurface(instrumented, true);
  const mutating = surface.describe().filter((spec) => spec.mutates);
  assert.ok(mutating.length >= 1, `${family}: 应有会改作品的指令`);
  const spec = mutating[0];
  const result = await surface.run(spec.id, dummyCommandParams(spec));
  assert.equal(result.ok, false, `${family}: ${spec.id} 只读时应被拒`);
  assert.equal(result.message, VIEW_ONLY_REFUSAL, family);
  assert.deepEqual(ran, [], `${family}: 原 run 不得被调用`);
  if (editorCalls) assert.deepEqual(editorCalls, [], `${family}: 文档/编辑器不得被改`);
}

test("[只读/16] 能拿到构造函数的指令面：只读时改动指令被拒、原 run 不跑、文档不变", async (t) => {
  const noopDownload = { download: async () => "" };
  const conclusions = [];

  const pdfCalls = [];
  const pdfEditor = {
    readerState: "text-ready",
    failure: null,
    textLayer: { status: "ready", present: true, totalCharacters: 9, coveragePageRatio: 1, extractor: "pdfjs" },
    manifest: null,
    searchFullText: () => [],
    pageNumber: 2,
    pageCount: 6,
    rotation: 0,
    zoom: 100,
    annotations: [],
    loading: false,
    rendering: false,
    processing: false,
    dirty: false,
    editRevision: 1,
    error: "",
    notice: "",
    goToPage: (...args) => pdfCalls.push(["goToPage", ...args]),
    extractPages: async (...args) => pdfCalls.push(["extractPages", ...args]),
    deleteCurrentPage: async () => pdfCalls.push(["deleteCurrentPage"]),
    rotateCurrentPage: async (...args) => pdfCalls.push(["rotateCurrentPage", ...args]),
    addBlankPage: async () => pdfCalls.push(["addBlankPage"]),
    moveCurrentPage: async () => pdfCalls.push(["moveCurrentPage"]),
    movePage: async (...args) => pdfCalls.push(["movePage", ...args]),
    save: async () => pdfCalls.push(["save"]),
    saveCopy: async () => pdfCalls.push(["saveCopy"]),
    download: () => pdfCalls.push(["download"]),
  };
  await assertWrappedReadonly("pdf", buildPdfCommandSurface(pdfEditor, noopDownload), pdfCalls);
  conclusions.push("pdf: 行为（buildPdfCommandSurface + guardPluginSurface）");

  const deckCalls = [];
  const deckEditor = new Proxy(
    {
      loading: false,
      dirty: false,
      editRevision: 1,
      error: "",
      activeIndex: 0,
      deck: { slides: [{ id: "s1", title: "A" }, { id: "s2", title: "B" }] },
    },
    {
      get(target, key) {
        if (key in target) return target[key];
        if (typeof key === "symbol") return undefined;
        return (...args) => deckCalls.push([String(key), ...args]);
      },
    },
  );
  await assertWrappedReadonly("deck", buildDeckCommandSurface(deckEditor, noopDownload), deckCalls);
  conclusions.push("deck: 行为（buildDeckCommandSurface + guardPluginSurface）");

  const richTouched = [];
  const richSpy = {
    chain() {
      richTouched.push("chain");
      return this;
    },
    focus() {
      return this;
    },
    insertContentAt() {
      return this;
    },
    run() {
      return true;
    },
  };
  const richEditor = {
    editor: richSpy,
    item: { title: "t", meta: {} },
    siteId: "",
    loading: false,
    importing: false,
    saving: false,
    dirty: false,
    sourceReady: true,
    editRevision: 1,
    error: "",
    sourceFailed: false,
    savedUrl: "",
    source: "url-docx",
    words: 1,
    chars: 1,
    save: async () => null,
    exportDoc: async () => {},
    exportMarkdown: async () => {},
    exportHtml: async () => {},
    exportText: () => {},
  };
  await assertWrappedReadonly("richdoc", buildRichDocCommandSurface(richEditor, noopDownload), richTouched);
  conclusions.push("richdoc: 行为（buildRichDocCommandSurface + guardPluginSurface）");

  const image = recordCalls();
  const imageEditor = {
    loading: false,
    cropping: false,
    error: "",
    dirty: false,
    editRevision: 1,
    doc: { width: 1080, height: 720 },
    canvasBackground: "#ffffff",
    layers: [{ id: "l1", locked: false, selected: true, kind: "text" }],
    selected: { id: "l1", kind: "text" },
    zoom: 1,
    exportFormat: "png",
    exportQuality: 90,
    collab: { readOnly: true },
    startCrop: image.record("startCrop"),
    setCropRatio: image.record("setCropRatio"),
    confirmCrop: image.record("confirmCrop", async () => undefined),
    resizeDoc: image.record("resizeDoc"),
    rotateTarget: image.record("rotateTarget"),
    addText: image.record("addText"),
    setSelectedText: image.record("setSelectedText"),
    setCanvasBackground: image.record("setCanvasBackground"),
  };
  const imageSurface = createImageCommandSurface({
    editor: imageEditor,
    deliver: async () => undefined,
    runAi: async () => ({ ok: true, message: "x" }),
  });
  {
    const mutating = imageSurface.describe().filter((spec) => spec.mutates);
    assert.ok(mutating.length >= 1, "image: 应有会改作品的指令");
    const spec = mutating[0];
    const result = await imageSurface.run(spec.id, dummyCommandParams(spec));
    assert.equal(result.ok, false, `image: ${spec.id}`);
    assert.equal(result.message, VIEW_ONLY_REFUSAL);
    assert.deepEqual(image.calls, [], "image: 画布不得被改");
  }
  conclusions.push("image: 行为（createImageCommandSurface 内置 guardVisualCommands）");

  const chart = recordCalls();
  const chartEditor = {
    loading: false,
    sourceReady: true,
    carrierState: "ready",
    error: "",
    dirty: false,
    editRevision: 1,
    readOnly: true,
    activeSeriesId: "series-1",
    document: {
      option: {
        title: { text: "t" },
        legend: { show: true },
        xAxis: { data: ["a"] },
        series: [{ id: "series-1", name: "N", type: "bar", data: [1] }],
      },
    },
    patchSeries: chart.record("patchSeries"),
    setTitle: chart.record("setTitle"),
    setLegend: chart.record("setLegend"),
    addSeries: chart.record("addSeries"),
    removeSeries: chart.record("removeSeries"),
  };
  const chartSurface = createChartCommandSurface({ editor: chartEditor, deliver: async () => undefined });
  {
    const mutating = chartSurface.describe().filter((spec) => spec.mutates);
    assert.ok(mutating.length >= 1, "chart: 应有会改作品的指令");
    const spec = mutating[0];
    const result = await chartSurface.run(spec.id, dummyCommandParams(spec));
    assert.equal(result.ok, false, `chart: ${spec.id}`);
    assert.equal(result.message, VIEW_ONLY_REFUSAL);
    assert.deepEqual(chart.calls, [], "chart: 文档不得被改");
  }
  conclusions.push("chart: 行为（createChartCommandSurface 内置 guardVisualCommands）");

  const video = recordCalls();
  const videoEditor = {
    loadingSource: false,
    sourceReady: true,
    exporting: false,
    error: "",
    dirty: false,
    editRevision: 1,
    durationMs: 10_000,
    playheadMs: 1_000,
    playing: false,
    selectedClipId: "clip-a",
    doc: {
      width: 1920,
      height: 1080,
      fps: 30,
      tracks: [{ id: "track-v", kind: "video", clips: [{ id: "clip-a", start_ms: 0, duration_ms: 6_000, source_url: "https://cdn.example.com/a.mp4" }] }],
    },
    cutRange: video.record("cutRange", true),
    deleteClip: video.record("deleteClip", true),
    patchClip: video.record("patchClip"),
    setClipSpeed: video.record("setClipSpeed"),
    addMediaUrl: video.record("addMediaUrl", async () => undefined),
    seek: video.record("seek"),
  };
  await assertWrappedReadonly("video", createVideoCommandSurface({ editor: videoEditor, deliver: async () => undefined }), video.calls);
  conclusions.push("video: 行为（createVideoCommandSurface + guardPluginSurface）");

  const audio = recordCalls();
  const audioEditor = {
    loading: false,
    error: "",
    dirty: false,
    editRevision: 1,
    duration: 30,
    currentTime: 4,
    playing: false,
    selection: null,
    fadeDuration: 1.5,
    gain: 100,
    editRange: audio.record("editRange", async () => true),
    applyGainRange: audio.record("applyGainRange", async () => true),
    applyFade: audio.record("applyFade"),
    seekTo: audio.record("seekTo"),
  };
  await assertWrappedReadonly("audio", createAudioCommandSurface({ editor: audioEditor, deliver: async () => undefined }), audio.calls);
  conclusions.push("audio: 行为（createAudioCommandSurface + guardPluginSurface）");

  const model = recordCalls();
  const modelEditor = {
    loading: false,
    modelLoaded: true,
    downloading: false,
    capturing: false,
    saving: false,
    dirty: false,
    editRevision: 1,
    sourceFormat: "glb",
    azimuth: 30,
    elevation: 12,
    zoom: 100,
    autoRotate: false,
    background: "#101010",
    animations: ["Idle"],
    animationPlaying: false,
    sceneNodes: [{ id: "n1" }],
    materials: [{ name: "m1" }],
    annotations: [],
    setOrbit: model.record("setOrbit"),
    setZoom: model.record("setZoom"),
    resetCamera: model.record("resetCamera"),
    setAutoRotate: model.record("setAutoRotate"),
    selectAnimation: model.record("selectAnimation"),
    setAnimationPlaying: model.record("setAnimationPlaying"),
  };
  await assertWrappedReadonly("model3d", createModel3DCommandSurface({ editor: modelEditor, deliver: async () => undefined }), model.calls);
  conclusions.push("model3d: 行为（createModel3DCommandSurface + guardPluginSurface）");

  const gameWrites = [];
  const gameSurface = createGameAgentSurface({
    source: () => "<!doctype html><html><body><script>void 0</script></body></html>",
    revision: () => 1,
    writeSource(next) {
      gameWrites.push(next);
    },
    params: () => ({ lives: { label: "生命", min: 1, max: 9, step: 1, default: 3 } }),
    writeParams() {
      gameWrites.push("params");
    },
  });
  await assertWrappedReadonly("game", gameSurface, gameWrites);
  conclusions.push("game: 行为（createGameAgentSurface + guardPluginSurface）");

  const gridWrites = [];
  const gridResult = runGridAgentCommand({
    id: "grid.set-cell",
    params: { row: 0, column: 0, value: "x" },
    port: {
      getRange: () => ({
        getValue: () => "old",
        setValue: (v) => gridWrites.push(v),
      }),
    },
    revision: 1,
    readonly: true,
    readonlyNotice: "现在是只读状态，不能修改。",
    submit: () => gridWrites.push("submit"),
  });
  assert.equal(gridResult.ok, false, "grid: set-cell 只读时应被拒");
  assert.match(String(gridResult.message), /只读/, "grid: 拒绝原因应说明只读");
  assert.deepEqual(gridWrites, [], "grid: 表格不得被写、不得送审阅");
  conclusions.push("grid: 行为（runGridAgentCommand readonly）");

  const workflowSrc = src("workflow-carrier/VideoCanvasStage.tsx");
  assert.match(workflowSrc, /guardPluginSurface\(\s*\{[\s\S]*editorId:\s*WORKFLOW_EDITOR_ID[\s\S]*\},\s*collabReadOnly,/);
  const workflowRan = [];
  const workflowRaw = {
    editorId: "workflow",
    describe: () => [{ id: "workflow.add-node", label: "加节点", summary: "", mutates: true }],
    state: () => ({ revision: 1 }),
    run: (id, params) => {
      workflowRan.push([id, params]);
      return { ok: true, message: "wrote" };
    },
  };
  const blocked = await guardPluginSurface(workflowRaw, true).run("workflow.add-node", {});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.message, VIEW_ONLY_REFUSAL);
  assert.deepEqual(workflowRan, []);
  conclusions.push("workflow: 只能静态（指令面写在 VideoCanvasStage 内）；闸行为用同形 surface + guardPluginSurface 验过");

  t.diagnostic(conclusions.join("\n"));
});
