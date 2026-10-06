// 工作回放（work-chat W05）播放模型的纯逻辑契约：时钟、按时刻抽帧、AI 气泡、章节跳转、时间轴标记、
// 展开细节、剪辑范围。模型是纯函数，所以这里不挂 DOM、不开计时器。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule } from "./helpers/module-bench.mjs";

const model = await import(await compileModule("src/shell/replay/work/replay-work-model.ts"));

const ev = (id, t_ms, kind, extra = {}) => ({
  id,
  t_ms,
  dur_ms: 0,
  kind,
  source: "artifact:doc1",
  author_id: "u1",
  at: null,
  seq_from: null,
  seq_to: null,
  revision_id: null,
  text: null,
  undone: false,
  editor_kind: "richdoc",
  ...extra,
});

const DATA = {
  playback_ms: 12_000,
  sources: [
    { key: "artifact:doc1", editor_kind: "richdoc", title: "周报", has_trail: true },
    { key: "task:t1", editor_kind: null, title: "AI", has_trail: false },
  ],
  chapters: [
    { id: "c1", title: "周一 上午 · 周报", day: "2026-10-05", start_ms: 0, end_ms: 4000, active_ms: 4000, sources: ["artifact:doc1"], summary: null, hidden: false },
    { id: "c2", title: "周一 下午 · 周报", day: "2026-10-05", start_ms: 6000, end_ms: 12_000, active_ms: 6000, sources: ["artifact:doc1"], summary: null, hidden: false },
    { id: "c3", title: "周二 上午 · 周报", day: "2026-10-06", start_ms: 12_000, end_ms: 12_000, active_ms: 0, sources: [], summary: null, hidden: true },
  ],
  events: [
    ev("e1", 500, "edit", { seq_from: 1, seq_to: 3, at: "2026-10-05T01:00:00Z" }),
    ev("e2", 1500, "ai_input", { source: "task:t1", text: "把标题改短", editor_kind: null }),
    ev("e3", 2000, "ai_output", { source: "task:t1", dur_ms: 1000, text: "好的，已经改成短标题", editor_kind: null }),
    ev("e4", 3500, "save", { revision_id: "r1", at: "2026-10-05T01:30:00Z" }),
    ev("g1", 4000, "gap", { text: "跳过 2 小时 13 分" }),
    ev("e5", 6500, "edit", { seq_from: 4, seq_to: 9, at: "2026-10-05T05:00:00Z" }),
    ev("e6", 11_000, "edit", { seq_from: 10, seq_to: 12, at: "2026-10-05T06:00:00Z" }),
    ev("d1", 12_000, "day", { text: "2026-10-06" }),
  ],
};

test("时钟：按倍速前进，单次最多前进 250ms，到末尾自动停并标记结束", () => {
  let clock = model.togglePlay(model.createClock(1), 12_000);
  assert.equal(clock.playing, true);
  clock = model.tickClock(clock, 100, 12_000);
  assert.equal(clock.t, 100);
  clock = model.tickClock(model.setSpeed(clock, 4), 100, 12_000);
  assert.equal(clock.t, 500);
  // 切走标签页再回来：dt 很大，也只前进 MAX_TICK_MS × 倍速
  clock = model.tickClock(clock, 60_000, 12_000);
  assert.equal(clock.t, 500 + model.MAX_TICK_MS * 4);
  const nearEnd = model.seekClock(clock, 11_900, 12_000);
  const ended = model.tickClock(nearEnd, 200, 12_000);
  assert.deepEqual([ended.t, ended.playing, ended.ended], [12_000, false, true]);
  // 结束后再点播放 = 重播
  const replay = model.togglePlay(ended, 12_000);
  assert.deepEqual([replay.t, replay.playing, replay.ended], [0, true, false]);
});

test("时钟：暂停时不前进；拖动进度条被夹在 [0, 总长]；倍速只有 1/2/4 循环", () => {
  const paused = model.createClock(1);
  assert.equal(model.tickClock(paused, 200, 12_000), paused);
  assert.equal(model.seekClock(paused, -50, 12_000).t, 0);
  assert.equal(model.seekClock(paused, 99_999, 12_000).t, 12_000);
  assert.deepEqual([1, 2, 4].map(model.nextSpeed), [2, 4, 1]);
  assert.deepEqual([...model.REPLAY_SPEEDS], [1, 2, 4]);
});

test("按时刻抽帧：协同来源停在哪个 seq、上一帧是什么；AI 来源不产生画面状态", () => {
  const at0 = model.sampleFrames(DATA, 100);
  assert.equal(at0.focus, "artifact:doc1");
  assert.equal(at0.states["artifact:doc1"].seqTo, null);
  assert.equal(at0.event, null);

  const at1 = model.sampleFrames(DATA, 600);
  assert.equal(at1.states["artifact:doc1"].seqTo, 3);
  assert.equal(at1.states["artifact:doc1"].prevSeqTo, null);
  assert.equal(at1.event.id, "e1");

  const at2 = model.sampleFrames(DATA, 7000);
  assert.equal(at2.states["artifact:doc1"].seqTo, 9);
  assert.equal(at2.states["artifact:doc1"].prevSeqTo, 3);
  assert.equal(at2.states["artifact:doc1"].revisionId, "r1");
  assert.equal(at2.chapter.id, "c2");
  assert.equal("task:t1" in at2.states, false);
  assert.deepEqual(model.forkSeqAt(at2), { source: "artifact:doc1", seq: 9 });
  assert.equal(model.forkSeqAt(at0), null);
});

test("eventIndexAt：二分到最后一个 t_ms<=t 的事件", () => {
  assert.equal(model.eventIndexAt(DATA.events, 0), -1);
  assert.equal(model.eventIndexAt(DATA.events, 500), 0);
  assert.equal(model.eventIndexAt(DATA.events, 4999), 4);
  assert.equal(model.eventIndexAt(DATA.events, 99_999), DATA.events.length - 1);
  assert.equal(model.eventIndexAt([], 10), -1);
});

test("AI 气泡：到 t 为止出现过的输入/输出；输出在播放窗口内按进度逐字露出", () => {
  assert.equal(model.bubblesAt(DATA, 1000).length, 0);
  const mid = model.bubblesAt(DATA, 2500);
  assert.deepEqual(mid.map((b) => [b.role, b.id]), [["user", "e2"], ["assistant", "e3"]]);
  assert.equal(mid[1].progress, 0.5);
  assert.equal(model.revealText("好的，已经改成短标题", mid[1].progress), "好的，已经");
  const done = model.bubblesAt(DATA, 5000);
  assert.equal(done[1].progress, 1);
  assert.equal(model.revealText("abc", 1), "abc");
  assert.equal(model.revealText("abc", 0), "");
});

test("章节：落在章节里取该章；落在间隔里取前一章；隐藏章节不参与", () => {
  assert.equal(model.chapterAt(DATA, 1000).id, "c1");
  assert.equal(model.chapterAt(DATA, 5000).id, "c1");
  assert.equal(model.chapterAt(DATA, 6000).id, "c2");
  assert.equal(model.chapterAt(DATA, 12_000).id, "c2");
  assert.deepEqual(model.visibleChapters(DATA).map((c) => c.id), ["c1", "c2"]);
  assert.equal(model.chapterAt({ chapters: [] }, 0), null);
});

test("章节跳转：点章节 = 跳到它的开头；隐藏的、不存在的章节不能跳", () => {
  assert.equal(model.chapterStartMs(DATA, "c2"), 6000);
  assert.equal(model.chapterStartMs(DATA, "c1"), 0);
  assert.equal(model.chapterStartMs(DATA, "c3"), null);
  assert.equal(model.chapterStartMs(DATA, "nope"), null);
  const jumped = model.seekClock(model.createClock(2), model.chapterStartMs(DATA, "c2"), DATA.playback_ms);
  assert.equal(jumped.t, 6000);
  assert.equal(jumped.speed, 2);
});

test("时间轴标记：章节/日期/间隔按占总时长的比例定位", () => {
  const marks = model.timelineMarks(DATA);
  assert.equal(marks.chapters[1].left, 0.5);
  assert.equal(marks.chapters[1].width, 0.5);
  assert.equal(marks.chapters[2].hidden, true);
  assert.deepEqual(marks.days, [{ left: 1, date: "2026-10-06" }]);
  assert.deepEqual(marks.gaps, [{ left: 4000 / 12_000, text: "跳过 2 小时 13 分" }]);
});

test("文字解析：间隔与章节标题拆成部件，界面再按语言拼", () => {
  assert.deepEqual(model.parseGapText("跳过 2 小时 13 分"), { days: 0, hours: 2, minutes: 13, seconds: 0 });
  assert.deepEqual(model.parseGapText("跳过 3 天"), { days: 3, hours: 0, minutes: 0, seconds: 0 });
  assert.equal(model.parseGapText(null), null);
  assert.equal(model.parseGapText("没有数字"), null);
  assert.deepEqual(model.parseChapterTitle("周一 上午 · 周报"), { weekday: "周一", half: "上午", name: "周报" });
  assert.equal(model.parseChapterTitle("随便写的标题"), null);
  assert.equal(model.formatClock(65_900), "1:05");
  assert.deepEqual(model.durationParts(90_061_000), { days: 1, hours: 1, minutes: 1, seconds: 1 });
});

test("展开细节：每步停留压在 [60, 800]ms，总长不超过 90 秒，按 seq 区间裁剪", () => {
  const frames = {
    kind: "trail",
    base_seq: 0,
    base_state: "",
    updates: [
      { seq: 1, update: "", author_id: "u1", t_ms: 0 },
      { seq: 2, update: "", author_id: "u1", t_ms: 10 },
      { seq: 3, update: "", author_id: "u2", t_ms: 5000 },
      { seq: 4, update: "", author_id: "u2", t_ms: 5100 },
    ],
  };
  const steps = model.buildDetailSteps(frames, { fromSeq: null, toSeq: null });
  assert.deepEqual(steps.map((s) => s.dur_ms), [60, 800, 100, 60]);
  assert.deepEqual(steps.map((s) => s.t_ms), [0, 60, 860, 960]);
  assert.equal(model.detailStepIndexAt(steps, 0), 0);
  assert.equal(model.detailStepIndexAt(steps, 900), 2);
  assert.equal(model.detailStepIndexAt(steps, -1), -1);
  const clipped = model.buildDetailSteps(frames, { fromSeq: 2, toSeq: 3 });
  assert.deepEqual(clipped.map((s) => s.seq), [2, 3]);

  const many = {
    ...frames,
    updates: Array.from({ length: 400 }, (_, i) => ({ seq: i + 1, update: "", author_id: null, t_ms: i * 10_000 })),
  };
  const long = model.buildDetailSteps(many, { fromSeq: null, toSeq: null });
  const total = long.at(-1).t_ms + long.at(-1).dur_ms;
  assert.ok(total <= model.DETAIL_MAX_TOTAL_MS + 1, `total ${total}`);
  assert.deepEqual(model.chapterSeqRange(DATA, DATA.chapters[1], "artifact:doc1"), { fromSeq: 4, toSeq: 12 });
  assert.deepEqual(model.chapterSeqRange(DATA, DATA.chapters[0], "task:t1"), { fromSeq: null, toSeq: null });
});

test("快照摘要：只当文本；超长截断；相同内容判未变", () => {
  assert.equal(model.summarizeSnapshot(null), "");
  assert.equal(model.summarizeSnapshot("<img onerror=x>"), "<img onerror=x>");
  assert.equal(model.summarizeSnapshot("abcdef", 3), "abc…");
  assert.equal(model.snapshotChanged({ a: 1 }, { a: 1 }), false);
  assert.equal(model.snapshotChanged({ a: 1 }, { a: 2 }), true);
});

test("剪辑：按章节选范围拿真实时刻；选不出来给 null；隐藏章节切换", () => {
  assert.deepEqual(model.trimRangeForChapters(DATA, "c1", "c2"), {
    trim_from: "2026-10-05T01:00:00Z",
    trim_to: "2026-10-05T06:00:00Z",
  });
  assert.equal(model.trimRangeForChapters(DATA, "c2", "c1"), null);
  assert.equal(model.trimRangeForChapters(DATA, "c1", "c3"), null);
  assert.deepEqual(model.toggleHiddenChapter([], "c1"), ["c1"]);
  assert.deepEqual(model.toggleHiddenChapter(["c1", "c2"], "c1"), ["c2"]);
});
