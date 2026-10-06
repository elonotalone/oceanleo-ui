import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { writeJsonStateRoot, readJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import {
  VIDEO_ROOT, videoToEntities, videoFromEntities, videoFromYDoc, videoFromRevisionJson,
  videoDescribeChange, videoDiff, videoToArtifactJson,
} from "../src/shell/collab/adapters/video.ts";

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


const doc = () => ({
  width: 1280, height: 720, fps: 30,
  tracks: [
    { id: "track_v", kind: "video", clips: [
      { id: "clip_1", start_ms: 0, duration_ms: 2000, source_url: "https://m/a.mp4", in_ms: 0, speed: 1, volume: 1 },
      { id: "clip_2", start_ms: 2000, duration_ms: 1500, source_url: "https://m/b.mp4", in_ms: 100, speed: 1, volume: 0.5 },
    ] },
    { id: "track_t", kind: "text", clips: [
      { id: "clip_3", start_ms: 500, duration_ms: 1000, text: "你好", style: { font_size: 64, color: "#fff" } },
    ] },
  ],
});
const sync = (a, b, state) => {
  const [da, db] = seededPair(VIDEO_ROOT, videoToEntities(state));
  return [da, db];
};
const read = (d) => videoFromEntities({ ...readShape(d, VIDEO_ROOT) }, null);

test("往返无损：fromEntities(toEntities(x)) 与 x 等价", () => {
  const x = doc();
  assert.deepEqual(videoFromEntities(videoToEntities(x), null), x);
});

test("实体 id 就是文档里已有的轨道/片段 id，不另生成", () => {
  const shape = videoToEntities(doc());
  assert.deepEqual(shape.order, ["t:track_v", "t:track_t", "c:clip_1", "c:clip_2", "c:clip_3"]);
  assert.equal(shape.entities["c:clip_2"].trackId, "track_v");
  assert.equal("id" in shape.entities["c:clip_2"], false);
});

test("两人同时改不同片段：都保留", () => {
  const [a, b] = sync(null, null, doc());
  const x = doc(); x.tracks[0].clips[0].duration_ms = 3000;
  const y = doc(); y.tracks[0].clips[1].volume = 0.2;
  writeShape(a, VIDEO_ROOT, videoToEntities(x));
  writeShape(b, VIDEO_ROOT, videoToEntities(y));
  connect(a, b);
  for (const d of [a, b]) {
    const merged = read(d);
    assert.equal(merged.tracks[0].clips[0].duration_ms, 3000);
    assert.equal(merged.tracks[0].clips[1].volume, 0.2);
  }
  assert.deepEqual(read(a), read(b));
});

test("同一片段不同字段：都保留；同一字段：后写者胜", () => {
  const [a, b] = sync(null, null, doc());
  const x = doc(); x.tracks[0].clips[0].duration_ms = 2500;
  const y = doc(); y.tracks[0].clips[0].volume = 0.1;
  writeShape(a, VIDEO_ROOT, videoToEntities(x));
  writeShape(b, VIDEO_ROOT, videoToEntities(y));
  connect(a, b);
  const merged = read(a);
  assert.equal(merged.tracks[0].clips[0].duration_ms, 2500);
  assert.equal(merged.tracks[0].clips[0].volume, 0.1);
  // 后写者胜：A 先写并同步给 B，B 再改同一字段
  const z = read(b); z.tracks[0].clips[0].duration_ms = 999;
  writeShape(b, VIDEO_ROOT, videoToEntities(z));
  connect(a, b);
  assert.equal(read(a).tracks[0].clips[0].duration_ms, 999);
  assert.equal(read(b).tracks[0].clips[0].duration_ms, 999);
});

test("新增 / 删除 / 把片段挪到另一条轨道：收敛", () => {
  const [a, b] = sync(null, null, doc());
  const x = doc();
  x.tracks[0].clips.push({ id: "clip_4", start_ms: 3500, duration_ms: 800, source_url: "https://m/c.mp4" });
  const y = doc();
  y.tracks[0].clips = y.tracks[0].clips.filter((c) => c.id !== "clip_1");
  const moved = { ...doc().tracks[1].clips[0] };
  y.tracks[0].clips.push(moved); y.tracks[1].clips = [];
  writeShape(a, VIDEO_ROOT, videoToEntities(x));
  writeShape(b, VIDEO_ROOT, videoToEntities(y));
  connect(a, b);
  const ra = read(a), rb = read(b);
  assert.deepEqual(ra, rb);
  const ids = ra.tracks[0].clips.map((c) => c.id);
  assert.ok(ids.includes("clip_4"));
  assert.ok(!ids.includes("clip_1"));
});

test("删掉一条轨道：它上面的片段随之消失，不留悬空片段", () => {
  const shape = videoToEntities(doc());
  shape.order = shape.order.filter((k) => k !== "t:track_t");
  delete shape.entities["t:track_t"];
  const out = videoFromEntities(shape, null);
  assert.deepEqual(out.tracks.map((t) => t.id), ["track_v"]);
  assert.equal(out.tracks[0].clips.length, 2);
});

test("fromYDoc 读出的快照与 fromRevisionJson(同内容) 等价", () => {
  const x = doc();
  const [a] = sync(null, null, x);
  assert.deepEqual(videoFromYDoc(a), videoFromRevisionJson(x));
  assert.deepEqual(videoFromRevisionJson({ doc: x }), x);
  assert.deepEqual(videoFromRevisionJson("垃圾").tracks, []);
});

test("describeChange：新增、删除、调整各一句", () => {
  const x = doc();
  const y = doc(); y.tracks[0].clips.push({ id: "clip_9", start_ms: 0, duration_ms: 500 });
  assert.match(videoDescribeChange(x, y), /新增了 1 段/);
  const z = doc(); z.tracks[0].clips[0].duration_ms = 10;
  assert.match(videoDescribeChange(x, z), /调整了 1 段/);
  const w = doc(); w.tracks[1].clips = [];
  assert.match(videoDescribeChange(x, w), /删掉了 1 段/);
  assert.equal(videoDescribeChange(x, doc()), null);
  assert.deepEqual(videoDiff(x, z), { added: [], removed: [], changed: ["clip_1"] });
});

test("toArtifactJson：快照还原成编辑器能打开的时间线", () => {
  const x = doc();
  assert.deepEqual(videoToArtifactJson(videoFromRevisionJson(x)), x);
});
