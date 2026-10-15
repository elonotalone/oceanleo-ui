// 截止时间：库里是一个绝对时刻；填的时候可以按任意时区，看的人按自己的设备时区。
import test from "node:test";
import assert from "node:assert/strict";
import {
  deadlineFromRow,
  deadlineMs,
  deadlineToPayload,
  formatDeadline,
  offsetLabel,
  wallClockText,
  zonedParts,
  zonedToInstant,
} from "../src/shell/bay/form/bay-deadline.ts";

const wall = (year, month, day, hour, minute, second) => ({ year, month, day, hour, minute, second });

test("同一个墙上时间在不同时区是不同的时刻", () => {
  const shanghai = zonedToInstant(wall(2026, 10, 20, 18, 30, 0), "Asia/Shanghai");
  const utc = zonedToInstant(wall(2026, 10, 20, 18, 30, 0), "UTC");
  assert.equal(new Date(shanghai).toISOString(), "2026-10-20T10:30:00.000Z");
  assert.equal(new Date(utc).toISOString(), "2026-10-20T18:30:00.000Z");
});

test("夏令时：纽约 10 月是 UTC-4，12 月是 UTC-5", () => {
  const oct = zonedToInstant(wall(2026, 10, 20, 9, 0, 0), "America/New_York");
  const dec = zonedToInstant(wall(2026, 12, 20, 9, 0, 0), "America/New_York");
  assert.equal(new Date(oct).toISOString(), "2026-10-20T13:00:00.000Z");
  assert.equal(new Date(dec).toISOString(), "2026-12-20T14:00:00.000Z");
  assert.equal(offsetLabel(oct, "America/New_York"), "UTC-4");
  assert.equal(offsetLabel(dec, "America/New_York"), "UTC-5");
});

test("半小时时区与秒都保留", () => {
  const at = zonedToInstant(wall(2026, 1, 2, 3, 4, 5), "Asia/Kolkata");
  assert.equal(new Date(at).toISOString(), "2026-01-01T21:34:05.000Z");
  assert.deepEqual(zonedParts(at, "Asia/Kolkata"), wall(2026, 1, 2, 3, 4, 5));
  assert.equal(offsetLabel(at, "Asia/Kolkata"), "UTC+5:30");
});

test("看的人按自己的时区：同一时刻在上海与洛杉矶写法不同", () => {
  const iso = "2026-10-20T10:30:00.000Z";
  assert.equal(formatDeadline(iso, "Asia/Shanghai"), "2026-10-20 18:30:00 UTC+8");
  assert.equal(formatDeadline(iso, "America/Los_Angeles"), "2026-10-20 03:30:00 UTC-7");
  assert.equal(wallClockText(deadlineMs(iso), "UTC"), "2026-10-20 10:30:00");
});

test("库里的值原样往返；旧的纯日期按当地当天结束；坏值当空", () => {
  assert.equal(deadlineToPayload("2026-10-20T10:30:00.000Z"), "2026-10-20T10:30:00.000Z");
  assert.equal(deadlineFromRow("2026-10-20T10:30:00Z"), "2026-10-20T10:30:00.000Z");
  const legacy = deadlineMs("2026-10-20");
  assert.deepEqual(zonedParts(legacy, "device"), wall(2026, 10, 20, 23, 59, 59));
  assert.equal(deadlineToPayload(""), null);
  assert.equal(deadlineToPayload("两周内"), null);
  assert.equal(deadlineFromRow(null), "");
});
